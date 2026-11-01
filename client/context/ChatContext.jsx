import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AuthContext } from "./AuthContext";
import toast from "react-hot-toast";
import {
    isNotificationSoundEnabled,
    playNotificationSound,
    setNotificationSoundEnabled,
} from "../src/lib/notificationSound";

export const chatContext = createContext();

const sortByRecentMessage = (users) => [...users].sort((a, b) => {
    const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return timeB - timeA || a.fullName.localeCompare(b.fullName);
});

const mergeMessages = (...groups) => {
    const messagesById = new Map();
    for (const message of groups.flat()) messagesById.set(message._id, message);
    return [...messagesById.values()].sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
        a._id.localeCompare(b._id)
    );
};

export const ChatProvider = ({ children }) => {
    const [messages, setMessages] = useState([]);
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [unseenMessages, setUnseenMessages] = useState({});
    const [typingUserId, setTypingUserId] = useState(null);
    const [soundEnabled, setSoundEnabled] = useState(isNotificationSoundEnabled);
    const [mutedConversations, setMutedConversations] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem("quickchat.mutedConversations") || "{}");
        } catch {
            return {};
        }
    });
    const { socket, axios, authUser } = useContext(AuthContext);
    const messagesRequestRef = useRef(0);
    const selectedUserRef = useRef(selectedUser?._id);

    useEffect(() => {
        selectedUserRef.current = selectedUser?._id;
    }, [selectedUser?._id]);

    const selectUser = useCallback((user) => {
        selectedUserRef.current = user?._id;
        setSelectedUser(user);
        setMessages([]);
    }, []);

    const showMessage = useCallback((message) => {
        setMessages((current) => mergeMessages(current, [message]));
    }, []);

    const updateLastMessage = useCallback((userId, message) => {
        setUsers((currentUsers) => sortByRecentMessage(
            currentUsers.map((user) => {
                if (user._id !== userId) return user;
                const currentTime = user.lastMessage ? new Date(user.lastMessage.createdAt).getTime() : 0;
                const messageTime = new Date(message.createdAt).getTime();
                const isOlderMessage = currentTime > messageTime ||
                    (currentTime === messageTime && user.lastMessage?._id > message._id);
                return isOlderMessage ? user : { ...user, lastMessage: message };
            })
        ));
    }, []);

    const getUser = useCallback(async () => {
        try {
            const { data } = await axios.get("/api/messages/users");
            if (data.success) {
                setUsers(data.users);
                setUnseenMessages(data.unseenMessages);
            } else {
                toast.error(data.message || "Unable to load users");
            }
        } catch (error) {
            toast.error(error.response?.data?.message || error.message);
        }
    }, [axios]);

    const getMessages = useCallback(async (userId, options = {}) => {
        const requestId = ++messagesRequestRef.current;
        if (selectedUserRef.current === userId) setMessages([]);
        try {
            const { data } = await axios.get(`/api/messages/${userId}`, { signal: options.signal });
            if (data.success && requestId === messagesRequestRef.current &&
                selectedUserRef.current === userId) {
                setMessages((current) => mergeMessages(data.messages, current));
                setUnseenMessages((current) => ({ ...current, [userId]: 0 }));
            } else if (!data.success) {
                toast.error(data.message || "Unable to load conversation");
            }
            return data;
        } catch (error) {
            if (error.code !== "ERR_CANCELED") {
                toast.error(error.response?.data?.message || error.message);
            }
            return null;
        }
    }, [axios]);

    const loadOlderMessages = useCallback(async (userId, before, options = {}) => {
        try {
            const { data } = await axios.get(`/api/messages/${userId}`, {
                params: { before },
                signal: options.signal,
            });
            if (data.success && selectedUserRef.current === userId) {
                setMessages((current) => mergeMessages(data.messages, current));
            } else if (!data.success) {
                toast.error(data.message || "Unable to load older messages");
            }
            return data;
        } catch (error) {
            if (error.code !== "ERR_CANCELED") {
                toast.error(error.response?.data?.message || error.message);
            }
            return null;
        }
    }, [axios]);

    const sendMessage = useCallback(async (messageData, recipientId = selectedUserRef.current) => {
        if (!recipientId) return false;
        try {
            const { data } = await axios.post(`/api/messages/send/${recipientId}`, messageData);
            if (!data.success) {
                toast.error(data.message || "Unable to send message");
                return false;
            }
            updateLastMessage(recipientId, data.newMessage);
            if (selectedUserRef.current === recipientId) {
                setMessages((current) => mergeMessages(current, [data.newMessage]));
            }
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || error.message);
            return false;
        }
    }, [axios, updateLastMessage]);

    const searchMessages = useCallback(async (userId, query) => {
        try {
            const { data } = await axios.get(`/api/messages/search/${userId}`, { params: { q: query } });
            if (!data.success) toast.error(data.message || "Unable to search messages");
            return data.success && selectedUserRef.current === userId ? data.messages : [];
        } catch (error) {
            toast.error(error.response?.data?.message || error.message);
            return [];
        }
    }, [axios]);

    const editMessage = useCallback(async (messageId, text) => {
        const conversationId = selectedUserRef.current;
        try {
            const { data } = await axios.patch(`/api/messages/${messageId}`, { text });
            if (!data.success) {
                toast.error(data.message || "Unable to edit message");
                return false;
            }
            if (selectedUserRef.current === conversationId) {
                setMessages((current) => mergeMessages(current, [data.message]));
            }
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || error.message);
            return false;
        }
    }, [axios]);

    const deleteMessage = useCallback(async (messageId, mode) => {
        const conversationId = selectedUserRef.current;
        try {
            const { data } = await axios.delete(`/api/messages/${messageId}`, { data: { for: mode } });
            if (!data.success) {
                toast.error(data.message || "Unable to delete message");
                return false;
            }
            if (mode === "me") {
                if (selectedUserRef.current === conversationId) {
                    setMessages((current) => current.filter((message) => message._id !== messageId));
                }
                await getUser();
            } else if (selectedUserRef.current === conversationId) {
                setMessages((current) => mergeMessages(current, [data.message]));
            }
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || error.message);
            return false;
        }
    }, [axios, getUser]);

    const toggleReaction = useCallback(async (messageId, emoji) => {
        const conversationId = selectedUserRef.current;
        try {
            const { data } = await axios.patch(`/api/messages/${messageId}/reaction`, { emoji });
            if (!data.success) {
                toast.error(data.message || "Unable to update reaction");
                return false;
            }
            if (selectedUserRef.current === conversationId) {
                setMessages((current) => mergeMessages(current, [data.message]));
            }
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || error.message);
            return false;
        }
    }, [axios]);

    const setConversationMuted = useCallback((userId, muted) => {
        setMutedConversations((current) => {
            const next = { ...current, [userId]: muted };
            if (!muted) delete next[userId];
            localStorage.setItem("quickchat.mutedConversations", JSON.stringify(next));
            return next;
        });
    }, []);

    const setSoundPreference = useCallback(async (enabled) => {
        await setNotificationSoundEnabled(enabled);
        setSoundEnabled(enabled);
    }, []);

    useEffect(() => {
        if (!socket) return undefined;

        const handleNewMessage = (newMessage) => {
            const senderId = newMessage.senderId.toString();
            if (senderId !== authUser?._id && !mutedConversations[senderId]) playNotificationSound();
            const activeUserId = selectedUserRef.current;
            const message = activeUserId === senderId ? { ...newMessage, seen: true } : newMessage;

            updateLastMessage(senderId, message);
            if (activeUserId === senderId) {
                setMessages((current) => mergeMessages(current, [message]));
                axios.put(`/api/messages/mark/${message._id}`).catch((error) => {
                    toast.error(error.response?.data?.message || error.message);
                });
                setUnseenMessages((current) => ({ ...current, [senderId]: 0 }));
            } else {
                setUnseenMessages((current) => ({
                    ...current,
                    [senderId]: (current[senderId] || 0) + 1,
                }));
            }
        };

        const handleProfileUpdated = (updatedUser) => {
            setUsers((current) => current.map((user) =>
                user._id === updatedUser._id ? { ...user, ...updatedUser } : user
            ));
            setSelectedUser((current) =>
                current?._id === updatedUser._id ? { ...current, ...updatedUser } : current
            );
        };

        const handleMessagesSeen = ({ readerId, through }) => {
            if (!readerId || !through?.id || !through.createdAt) return;
            const cutoff = new Date(through.createdAt).getTime();
            setMessages((current) => current.map((message) => {
                const messageTime = new Date(message.createdAt).getTime();
                const isWithinReadRange = messageTime < cutoff ||
                    (messageTime === cutoff && message._id <= through.id);
                return message.senderId === authUser?._id &&
                    message.receiverId === readerId && isWithinReadRange
                    ? { ...message, seen: true, delivered: true }
                    : message;
            }));
        };

        const handleTyping = ({ senderId, isTyping }) => {
            if (!senderId) return;
            setTypingUserId(isTyping ? senderId : null);
        };

        const handleMessageUpdated = (updatedMessage) => {
            if (selectedUserRef.current === updatedMessage.senderId ||
                selectedUserRef.current === updatedMessage.receiverId) {
                setMessages((current) => mergeMessages(current, [updatedMessage]));
            }
            const otherUserId = updatedMessage.senderId === authUser?._id
                ? updatedMessage.receiverId
                : updatedMessage.senderId;
            updateLastMessage(otherUserId, updatedMessage);
        };

        const handleLastSeenUpdated = ({ userId, lastSeenAt }) => {
            setUsers((current) => current.map((user) =>
                user._id === userId ? { ...user, lastSeenAt } : user
            ));
            setSelectedUser((current) =>
                current?._id === userId ? { ...current, lastSeenAt } : current
            );
        };

        socket.on("newMessage", handleNewMessage);
        socket.on("profileUpdated", handleProfileUpdated);
        socket.on("messagesSeen", handleMessagesSeen);
        socket.on("typing", handleTyping);
        socket.on("messageUpdated", handleMessageUpdated);
        socket.on("lastSeenUpdated", handleLastSeenUpdated);
        return () => {
            socket.off("newMessage", handleNewMessage);
            socket.off("profileUpdated", handleProfileUpdated);
            socket.off("messagesSeen", handleMessagesSeen);
            socket.off("typing", handleTyping);
            socket.off("messageUpdated", handleMessageUpdated);
            socket.off("lastSeenUpdated", handleLastSeenUpdated);
        };
    }, [socket, axios, authUser?._id, mutedConversations, updateLastMessage]);

    const value = {
        messages,
        users,
        selectedUser,
        getUser,
        getMessages,
        loadOlderMessages,
        sendMessage,
        showMessage,
        searchMessages,
        editMessage,
        deleteMessage,
        toggleReaction,
        soundEnabled,
        setSoundPreference,
        mutedConversations,
        setConversationMuted,
        setSelectedUser: selectUser,
        unseenMessages,
        setUnseenMessages,
        typingUserId,
    };

    return <chatContext.Provider value={value}>{children}</chatContext.Provider>;
};
