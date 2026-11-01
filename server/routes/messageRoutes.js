import express from "express";
import { protectRoute } from "../middleware/auth.js";
import {
    createImageUploadSignature,
    deleteMessage,
    editMessage,
    getMessages,
    getUsersForSidebar,
    markMessageAsSeen,
    searchMessages,
    sendMessage,
    toggleMessageReaction,
} from "../controllers/messageController.js";

const messageRouter = express.Router();

messageRouter.get("/users", protectRoute, getUsersForSidebar);
messageRouter.post("/upload-signature", protectRoute, createImageUploadSignature);
messageRouter.get("/search/:id", protectRoute, searchMessages);
messageRouter.put("/mark/:id", protectRoute, markMessageAsSeen);
messageRouter.post("/send/:id", protectRoute, sendMessage);
messageRouter.patch("/:id", protectRoute, editMessage);
messageRouter.delete("/:id", protectRoute, deleteMessage);
messageRouter.patch("/:id/reaction", protectRoute, toggleMessageReaction);
messageRouter.get("/:id", protectRoute, getMessages);

export default messageRouter
