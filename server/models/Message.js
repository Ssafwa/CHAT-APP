import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
   senderId: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
   receiverId: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
   text: {type: String, trim: true, maxlength: 4000},
   image: {type: String},
   replyTo: {type: mongoose.Schema.Types.ObjectId, ref: "Message"},
   editedAt: {type: Date},
   deletedForEveryone: {type: Boolean, default: false},
   hiddenFor: [{type: mongoose.Schema.Types.ObjectId, ref: "User"}],
   reactions: [{
      userId: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
      emoji: {type: String, required: true},
   }],
   delivered: {type: Boolean, default: false},
   seen: {type: Boolean, default: false}

}, {timestamps: true});

messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1, _id: -1 });
messageSchema.index({ receiverId: 1, senderId: 1, createdAt: -1, _id: -1 });
messageSchema.index({ receiverId: 1, senderId: 1, seen: 1 });
messageSchema.index({ receiverId: 1, seen: 1, senderId: 1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;