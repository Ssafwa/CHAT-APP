import express from 'express';
import "dotenv/config";
import cors from 'cors';
import http from 'http';
import { connectDB } from './lib/db.js';
import userRouter from './routes/userRoutes.js';
import messageRouter from './routes/messageRoutes.js';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from './models/User.js';

// create express app and HTTP server
const app = express();
const server = http.createServer(app)

//initial socket.io server
export const io = new Server (server, {
  cors: {origin: "*",}
})

// store online users
export const userSocketMap = new Map(); // userId -> connected socket IDs

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required"));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (typeof decoded.userId !== "string" || !mongoose.isObjectIdOrHexString(decoded.userId)) {
      return next(new Error("Invalid authentication token"));
    }
    socket.data.userId = decoded.userId;
    next();
  } catch {
    next(new Error("Invalid or expired authentication token"));
  }
});

// authenticated socket events
io.on("connection", (socket) => {
  const userId = socket.data.userId;
  const userSockets = userSocketMap.get(userId) || new Set();
  userSockets.add(socket.id);
  userSocketMap.set(userId, userSockets);
  socket.join(userId);

  // emit online users to ll connected client
  io.emit("getOnlineUsers", [...userSocketMap.keys()]);

  socket.on("typing", (payload = {}) => {
    const { receiverId, isTyping } = payload ?? {};
    if (typeof receiverId !== "string" || !mongoose.isObjectIdOrHexString(receiverId) ||
        typeof isTyping !== "boolean" || receiverId === userId) return;
    socket.to(receiverId).emit("typing", { senderId: userId, isTyping });
  });

  socket.on("disconnect", () => {
    const connectedSockets = userSocketMap.get(userId);
    connectedSockets?.delete(socket.id);
    if (connectedSockets?.size === 0) {
      userSocketMap.delete(userId);
      User.findByIdAndUpdate(userId, { lastSeenAt: new Date() }, { new: true })
        .select("lastSeenAt showLastSeen")
        .then((user) => {
          if (user) {
            io.emit("lastSeenUpdated", {
              userId,
              lastSeenAt: user.showLastSeen ? user.lastSeenAt : null,
            });
          }
        })
        .catch((error) => console.error("Unable to update last seen:", error.message));
    }
    io.emit("getOnlineUsers", [...userSocketMap.keys()]);
  })
})


// middleware
app.use(cors());
app.use(express.json({limit: '4mb'}));

// routes setup
app.use("/api/status", (req, res) => res.send("Server is live!"));
app.use("/api/auth", userRouter);
app.use("/api/messages", messageRouter)

// normalize env values so whitespace/newlines from .env files don't break MongoDB URLs
if (process.env.MONGODB_URI) {
  process.env.MONGODB_URI = String(process.env.MONGODB_URI)
    .replace(/[\r\n\t\f\v ]+/g, '')
    .trim();
}
if (process.env.PORT) process.env.PORT = String(process.env.PORT).trim();

// connect to mongodb
await connectDB();
if(process.env.NODE_ENV !== "production"){
  const PORT = Number(process.env.PORT) || 5000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
} 

// export server for vercel
export default server;