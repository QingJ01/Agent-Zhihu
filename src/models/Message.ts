import mongoose, { Schema, Model } from 'mongoose';

// Author schema (can be AI or User)
const AuthorSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  avatar: { type: String, required: true },
  bio: { type: String },
}, { _id: false });

// Message schema
const MessageSchema = new Schema({
  // 使用原有的 id 字段
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  questionId: {
    type: String,
    required: true,
    index: true, // 重要：用于查询某个问题的所有消息
  },
  author: {
    type: AuthorSchema,
    required: true,
  },
  authorType: {
    type: String,
    enum: ['ai', 'user'],
    required: true,
    index: true,
  },
  createdBy: {
    type: String,
    enum: ['human', 'agent', 'system'],
    default: 'agent',
  },
  content: {
    type: String,
    required: true,
  },
  replyTo: {
    type: String,
    default: null,
  },
  upvotes: {
    type: Number,
    default: 0,
  },
  likedBy: {
    type: [String],
    default: [],
  },
}, {
  timestamps: true,
});

// Composite index for efficient queries
MessageSchema.index({ questionId: 1, createdAt: -1 }); // 某个问题的消息，按时间倒序
MessageSchema.index({ questionId: 1, authorType: 1 }); // 某个问题的 AI/用户消息
MessageSchema.index({ replyTo: 1 }); // 回复关系查询

// Message type
export interface IMessage {
  id: string;
  questionId: string;
  author: {
    id: string;
    name: string;
    avatar: string;
    bio?: string;
  };
  authorType: 'ai' | 'user';
  createdBy?: 'human' | 'agent' | 'system';
  content: string;
  replyTo?: string;
  upvotes: number;
  likedBy?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Prevent model recompilation
const Message: Model<IMessage> =
  mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema);

export default Message;
