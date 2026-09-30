import express from 'express';
import "dotenv/config";
import cors from 'cors';
import http from 'http';
import { connectDB } from './lib/db.js';
import userRouter from './routes/userRoutes.js';
import messageRouter from './routes/messageRoutes.js';
import { Server } from 'socket.io';

// create express app and HTTP server
const app = express();
const server = http.createServer(app)

//initial socket.io server
export const io = new Server (server, {
  cors: {origin: "*",}
})

// store online users
export const userSocketMap = {}; // {userId: socketId}

// socket.io connection header
io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;
  console.log("User Connected", userId);

  if(userId) userSocketMap[userId] = socket.id;

  // emit online users to ll connected client
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  socket.on("disconnect", () => {
    console.log("User Disconnected", userId);
    delete userSocketMap[userId];
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
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