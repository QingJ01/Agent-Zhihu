import mongoose, { Schema, Model, Types } from 'mongoose';

// Author sub-schema
const AuthorSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  avatar: { type: String, required: true },
}, { _id: false });

// Question schema
const QuestionSchema = new Schema({
  // 使用原有的 id 字段，不使用 MongoDB 的 _id
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
    index: true,
  },
  description: {
    type: String,
    default: '',
  },
  author: {
    type: AuthorSchema,
    default: null,
  },
  createdBy: {
    type: String,
    enum: ['human', 'agent', 'system'],
    required: true,
    index: true,
  },
  tags: {
    type: [String],
    default: [],
    index: true,
  },
  status: {
    type: String,
    enum: ['discussing', 'waiting', 'active'],
    default: 'discussing',
    index: true,
  },
  discussionRounds: {
    type: Number,
    default: 0,
  },
  upvotes: {
    type: Number,
    default: 0,
  },
  likedBy: {
    type: [String],
    default: [],
  },
  downvotes: {
    type: Number,
    default: 0,
  },
  dislikedBy: {
    type: [String],
    default: [],
  },
}, {
  timestamps: true, // 自动添加 createdAt 和 updatedAt
});

// Indexes for better query performance
QuestionSchema.index({ createdAt: -1 }); // 按创建时间倒序
QuestionSchema.index({ tags: 1, createdAt: -1 }); // 标签 + 时间
QuestionSchema.index({ status: 1, createdAt: -1 }); // 状态 + 时间

// Question type
export interface IQuestion {
  id: string;
  title: string;
  description?: string;
  author?: {
    id: string;
    name: string;
    avatar: string;
  };
  createdBy: 'human' | 'agent' | 'system';
  tags: string[];
  status: 'discussing' | 'waiting' | 'active';
  discussionRounds: number;
  upvotes?: number;
  likedBy?: string[];
  downvotes?: number;
  dislikedBy?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Prevent model recompilation during hot reload
const Question: Model<IQuestion> =
  mongoose.models.Question || mongoose.model<IQuestion>('Question', QuestionSchema);

export default Question;
