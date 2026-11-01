import mongoose from "mongoose";
import Message from "../models/Message.js";
import User from "../models/User.js";
import cloudinary from "../lib/cloudinary.js";
import { io, userSocketMap } from "../server.js";

const PAGE_SIZE = 30;
const MAX_MESSAGE_LENGTH = 4000;
const IMAGE_FOLDER = "chat-messages";
const ALLOWED_IMAGE_FORMATS = "jpg,jpeg,png,webp";
const ALLOWED_REACTIONS = new Set(["👍", "❤️", "😂", "😮", "😢", "🎉"]);

const isValidId = (id) => typeof id === "string" && mongoose.isObjectIdOrHexString(id);

const conversationFilter = (userId, otherUserId) => ({
    $or: [
        { senderId: userId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: userId },
    ],
});

export const getUsersForSidebar = async (req, res) => {
    try {
        const userId = req.user._id;
        const [users, unseenGroups, latestMessages] = await Promise.all([
            User.find({ _id: { $ne: userId } }).select("-password").lean(),
            Message.aggregate([
                { $match: { receiverId: userId, seen: false, hiddenFor: { $nin: [userId] } } },
                { $group: { _id: "$senderId", count: { $sum: 1 } } },
            ]),
            Message.aggregate([
                {
                    $match: {
                        $and: [
                            { $or: [{ senderId: userId }, { receiverId: userId }] },
                            { hiddenFor: { $nin: [userId] } },
                        ],
                    },
                },
                {
                    $addFields: {
                        conversationUserId: {
                            $cond: [{ $eq: ["$senderId", userId] }, "$receiverId", "$senderId"],
                        },
                    },
                },
                { $sort: { createdAt: -1, _id: -1 } },
                { $group: { _id: "$conversationUserId", latestMessage: { $first: "$$ROOT" } } },
            ]),
        ]);

        const unseenMessages = Object.fromEntries(
            unseenGroups.map(({ _id, count }) => [_id.toString(), count])
        );
        const latestByUser = new Map(
            latestMessages.map(({ _id, latestMessage }) => [_id.toString(), latestMessage])
        );

        const sortedUsers = users
            .map((user) => ({
                ...user,
                lastSeenAt: user.showLastSeen ? user.lastSeenAt : null,
                lastMessage: latestByUser.get(user._id.toString()) || null,
            }))
            .sort((a, b) => {
                const timeA = a.lastMessage?.createdAt?.getTime?.() || 0;
                const timeB = b.lastMessage?.createdAt?.getTime?.() || 0;
                return timeB - timeA || a.fullName.localeCompare(b.fullName);
            });

        return res.json({ success: true, users: sortedUsers, unseenMessages });
    } catch (error) {
        console.error("Unable to load chat users:", error.message);
        return res.status(500).json({ success: false, message: "Unable to load users" });
    }
};

export const getMessages = async (req, res) => {
    try {
        const { id: selectedUserId } = req.params;
        const myId = req.user._id;
        if (!isValidId(selectedUserId)) {
            return res.status(400).json({ success: false, message: "Invalid user ID" });
        }
        if (selectedUserId === myId.toString()) {
            return res.status(400).json({ success: false, message: "Cannot open a conversation with yourself" });
        }
        if (!await User.exists({ _id: selectedUserId })) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const filter = conversationFilter(myId, new mongoose.Types.ObjectId(selectedUserId));
        if (req.query.before !== undefined) {
            if (!isValidId(req.query.before)) {
                return res.status(400).json({ success: false, message: "Invalid message cursor" });
            }
            const cursor = await Message.findOne({
                _id: req.query.before,
                ...filter,
                hiddenFor: { $nin: [myId] },
            }).select("createdAt");
            if (!cursor) {
                return res.status(400).json({ success: false, message: "Message cursor is not in this conversation" });
            }
            filter.$and = [{
                $or: [
                    { createdAt: { $lt: cursor.createdAt } },
                    { createdAt: cursor.createdAt, _id: { $lt: cursor._id } },
                ],
            }];
        }

        filter.hiddenFor = { $nin: [myId] };
        const page = await Message.find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .limit(PAGE_SIZE + 1)
            .populate({
                path: "replyTo",
                select: "text image senderId deletedForEveryone",
                match: { hiddenFor: { $nin: [myId] } },
            })
            .lean();
        const hasMore = page.length > PAGE_SIZE;
        const messages = page.slice(0, PAGE_SIZE);
        const nextCursor = hasMore ? messages[messages.length - 1]._id.toString() : null;
        messages.reverse();

        const latestUnseen = await Message.findOne({
            senderId: selectedUserId,
            receiverId: myId,
            seen: false,
        }).sort({ createdAt: -1, _id: -1 }).select("_id createdAt").lean();

        await Message.updateMany(
            { senderId: selectedUserId, receiverId: myId, seen: false },
            { $set: { seen: true, delivered: true } }
        );
        if (latestUnseen) {
            io.to(selectedUserId).emit("messagesSeen", {
                readerId: myId.toString(),
                through: {
                    id: latestUnseen._id.toString(),
                    createdAt: latestUnseen.createdAt,
                },
            });
        }

        return res.json({ success: true, messages, hasMore, nextCursor });
    } catch (error) {
        console.error("Unable to load conversation:", error.message);
        return res.status(500).json({ success: false, message: "Unable to load conversation" });
    }
};

export const searchMessages = async (req, res) => {
    try {
        const { id: otherUserId } = req.params;
        const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
        if (!isValidId(otherUserId)) {
            return res.status(400).json({ success: false, message: "Invalid user ID" });
        }
        if (otherUserId === req.user._id.toString()) {
            return res.status(400).json({ success: false, message: "Cannot search a conversation with yourself" });
        }
        if (query.length < 2 || query.length > 100) {
            return res.status(400).json({ success: false, message: "Search must be between 2 and 100 characters" });
        }
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const conversation = conversationFilter(req.user._id, new mongoose.Types.ObjectId(otherUserId));
        const results = await Message.find({
            $and: [
                conversation,
                { hiddenFor: { $nin: [req.user._id] } },
                { deletedForEveryone: { $ne: true } },
                { text: { $regex: escapedQuery, $options: "i" } },
            ],
        })
            .sort({ createdAt: -1, _id: -1 })
            .limit(100)
            .populate({
                path: "replyTo",
                select: "text image senderId deletedForEveryone",
                match: { hiddenFor: { $nin: [req.user._id] } },
            })
            .lean();
        return res.json({ success: true, messages: results });
    } catch (error) {
        console.error("Unable to search conversation:", error.message);
        return res.status(500).json({ success: false, message: "Unable to search conversation" });
    }
};

export const editMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
        if (!isValidId(id) || !text || text.length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({ success: false, message: "Enter a message of up to 4000 characters" });
        }
        const message = await Message.findOne({
            _id: id,
            senderId: req.user._id,
            deletedForEveryone: { $ne: true },
            hiddenFor: { $nin: [req.user._id] },
        });
        if (!message) return res.status(404).json({ success: false, message: "Message not found or cannot be edited" });

        message.text = text;
        message.editedAt = new Date();
        await message.save();
        await message.populate({
            path: "replyTo",
            select: "text image senderId deletedForEveryone",
            match: { hiddenFor: { $nin: [req.user._id] } },
        });
        const updatedMessage = message.toObject();
        io.to(message.senderId.toString()).to(message.receiverId.toString()).emit("messageUpdated", updatedMessage);
        return res.json({ success: true, message: updatedMessage });
    } catch (error) {
        console.error("Unable to edit message:", error.message);
        return res.status(500).json({ success: false, message: "Unable to edit message" });
    }
};

export const deleteMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const mode = req.body?.for;
        if (!isValidId(id) || !["me", "everyone"].includes(mode)) {
            return res.status(400).json({ success: false, message: "Choose whether to delete this message for you or everyone" });
        }
        const message = await Message.findOne({
            _id: id,
            $or: [{ senderId: req.user._id }, { receiverId: req.user._id }],
        });
        if (!message || message.deletedForEveryone) {
            return res.status(404).json({ success: false, message: "Message not found" });
        }
        if (mode === "everyone") {
            if (message.senderId.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, message: "You can only delete your own message for everyone" });
            }
            message.text = undefined;
            message.image = undefined;
            message.replyTo = undefined;
            message.reactions = [];
            message.deletedForEveryone = true;
            await message.save();
            const updatedMessage = message.toObject();
            io.to(message.senderId.toString()).to(message.receiverId.toString()).emit("messageUpdated", updatedMessage);
            return res.json({ success: true, message: updatedMessage });
        }

        const hiddenMessage = await Message.findOneAndUpdate(
            { _id: id },
            { $addToSet: { hiddenFor: req.user._id }, $set: { seen: true, delivered: true } },
            { new: true }
        ).select("senderId receiverId createdAt");
        if (hiddenMessage.receiverId.toString() === req.user._id.toString()) {
            io.to(hiddenMessage.senderId.toString()).emit("messagesSeen", {
                readerId: req.user._id.toString(),
                through: {
                    id: hiddenMessage._id.toString(),
                    createdAt: hiddenMessage.createdAt,
                },
            });
        }
        return res.json({ success: true, messageId: id });
    } catch (error) {
        console.error("Unable to delete message:", error.message);
        return res.status(500).json({ success: false, message: "Unable to delete message" });
    }
};

export const toggleMessageReaction = async (req, res) => {
    try {
        const { id } = req.params;
        const emoji = req.body?.emoji;
        if (!isValidId(id) || !ALLOWED_REACTIONS.has(emoji)) {
            return res.status(400).json({ success: false, message: "Choose a supported reaction" });
        }
        const message = await Message.findOne({
            _id: id,
            deletedForEveryone: { $ne: true },
            hiddenFor: { $nin: [req.user._id] },
            $or: [{ senderId: req.user._id }, { receiverId: req.user._id }],
        });
        if (!message) return res.status(404).json({ success: false, message: "Message not found" });

        const existing = message.reactions.find((reaction) => reaction.userId.toString() === req.user._id.toString());
        if (existing?.emoji === emoji) {
            message.reactions = message.reactions.filter(
                (reaction) => reaction.userId.toString() !== req.user._id.toString()
            );
        } else if (existing) {
            existing.emoji = emoji;
        } else {
            message.reactions.push({ userId: req.user._id, emoji });
        }
        await message.save();
        await message.populate({
            path: "replyTo",
            select: "text image senderId deletedForEveryone",
            match: { hiddenFor: { $nin: [req.user._id] } },
        });
        const updatedMessage = message.toObject();
        io.to(message.senderId.toString()).to(message.receiverId.toString()).emit("messageUpdated", updatedMessage);
        return res.json({ success: true, message: updatedMessage });
    } catch (error) {
        console.error("Unable to update message reaction:", error.message);
        return res.status(500).json({ success: false, message: "Unable to update reaction" });
    }
};

export const markMessageAsSeen = async (req, res) => {
    try {
        const { id } = req.params;
        if (!isValidId(id)) {
            return res.status(400).json({ success: false, message: "Invalid message ID" });
        }
        const message = await Message.findOneAndUpdate(
            { _id: id, receiverId: req.user._id },
            { $set: { seen: true, delivered: true } },
            { new: true }
        ).select("senderId createdAt");
        if (!message) {
            return res.status(404).json({ success: false, message: "Message not found" });
        }

        io.to(message.senderId.toString()).emit("messagesSeen", {
            readerId: req.user._id.toString(),
            through: {
                id: message._id.toString(),
                createdAt: message.createdAt,
            },
        });
        return res.json({ success: true });
    } catch (error) {
        console.error("Unable to mark message as seen:", error.message);
        return res.status(500).json({ success: false, message: "Unable to mark message as seen" });
    }
};

export const createImageUploadSignature = (req, res) => {
    try {
        if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY ||
            !process.env.CLOUDINARY_API_SECRET) {
            return res.status(503).json({ success: false, message: "Image uploads are not configured" });
        }
        const timestamp = Math.floor(Date.now() / 1000);
        const params = {
            timestamp,
            folder: IMAGE_FOLDER,
            allowed_formats: ALLOWED_IMAGE_FORMATS,
        };
        const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET);
        return res.json({
            success: true,
            timestamp,
            signature,
            folder: IMAGE_FOLDER,
            allowedFormats: ALLOWED_IMAGE_FORMATS,
            apiKey: process.env.CLOUDINARY_API_KEY,
            cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        });
    } catch (error) {
        console.error("Unable to sign image upload:", error.message);
        return res.status(500).json({ success: false, message: "Image uploads are unavailable" });
    }
};

export const sendMessage = async (req, res) => {
    try {
        const body = req.body ?? {};
        const receiverId = req.params.id;
        if (!isValidId(receiverId)) {
            return res.status(400).json({ success: false, message: "Invalid recipient ID" });
        }
        if (receiverId === req.user._id.toString()) {
            return res.status(400).json({ success: false, message: "Cannot message yourself" });
        }
        if (!await User.exists({ _id: receiverId })) {
            return res.status(404).json({ success: false, message: "Recipient not found" });
        }

        const text = typeof body.text === "string" ? body.text.trim() : "";
        const image = body.image;
        const replyToId = body.replyTo;
        if (body.text !== undefined && typeof body.text !== "string") {
            return res.status(400).json({ success: false, message: "Message text must be a string" });
        }
        if (text.length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({ success: false, message: "Messages cannot exceed 4000 characters" });
        }
        if (image !== undefined && typeof image !== "string") {
            return res.status(400).json({ success: false, message: "Image URL is invalid" });
        }
        if (image) {
            let imageUrl;
            try {
                imageUrl = new URL(image);
            } catch {
                return res.status(400).json({ success: false, message: "Image URL is invalid" });
            }
            const expectedPath = `/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/`;
            if (imageUrl.protocol !== "https:" || imageUrl.hostname !== "res.cloudinary.com" ||
                imageUrl.username || imageUrl.password || imageUrl.href.length > 2048 ||
                !imageUrl.pathname.startsWith(expectedPath)) {
                return res.status(400).json({ success: false, message: "Image must be uploaded to this app's Cloudinary account" });
            }
        }
        if (!text && !image) {
            return res.status(400).json({ success: false, message: "A message or image is required" });
        }
        if (replyToId !== undefined && !isValidId(replyToId)) {
            return res.status(400).json({ success: false, message: "Reply target is invalid" });
        }
        if (replyToId && !await Message.exists({
            _id: replyToId,
            ...conversationFilter(req.user._id, new mongoose.Types.ObjectId(receiverId)),
            hiddenFor: { $nin: [req.user._id] },
            deletedForEveryone: { $ne: true },
        })) {
            return res.status(400).json({ success: false, message: "Reply target is not in this conversation" });
        }

        const delivered = userSocketMap.has(receiverId);
        const newMessage = await Message.create({
            senderId: req.user._id,
            receiverId,
            text: text || undefined,
            image: image || undefined,
            replyTo: replyToId,
            delivered,
        });
        await newMessage.populate({
            path: "replyTo",
            select: "text image senderId deletedForEveryone",
            match: { hiddenFor: { $nin: [req.user._id] } },
        });

        if (delivered) {
            io.to(receiverId).emit("newMessage", newMessage);
        }
        return res.status(201).json({ success: true, newMessage });
    } catch (error) {
        console.error("Unable to send message:", error.message);
        return res.status(500).json({ success: false, message: "Unable to send message" });
    }
};
