import mongoose, { Schema, Model } from 'mongoose';

// Debate message schema
const DebateMessageSchema = new Schema({
  role: {
    type: String,
    enum: ['user', 'opponent'],
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Number,
    required: true,
  },
}, { _id: false });

// Synthesis schema
const SynthesisSchema = new Schema({
  consensus: {
    type: [String],
    default: [],
  },
  disagreements: {
    type: [String],
    default: [],
  },
  winner: {
    type: String,
    enum: ['user', 'opponent', 'tie'],
    required: true,
  },
  winnerReason: {
    type: String,
    required: true,
  },
  conclusion: {
    type: String,
    required: true,
  },
  recommendations: {
    type: [String],
    default: [],
  },
}, { _id: false });

// Profile schemas
const ProfileSchema = new Schema({
  id: String,
  name: String,
  avatar: String,
  bio: String,
}, { _id: false });

// Debate session schema
const DebateSchema = new Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  topic: {
    type: String,
    required: true,
  },
  userProfile: {
    type: ProfileSchema,
    required: true,
  },
  opponentProfile: {
    type: ProfileSchema,
    required: true,
  },
  messages: {
    type: [DebateMessageSchema],
    default: [],
  },
  synthesis: {
    type: SynthesisSchema,
    default: null,
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed'],
    default: 'pending',
    index: true,
  },
  userId: {
    type: String,
    required: true,
    index: true, // 用于查询某个用户的所有辩论
  },
}, {
  timestamps: true,
});

// Indexes
DebateSchema.index({ userId: 1, createdAt: -1 }); // 用户的辩论历史
DebateSchema.index({ status: 1, createdAt: -1 }); // 状态筛选

// Debate type
export interface IDebateMessage {
  role: 'user' | 'opponent';
  name: string;
  content: string;
  timestamp: number;
}

export interface IDebateSynthesis {
  consensus: string[];
  disagreements: string[];
  winner: 'user' | 'opponent' | 'tie';
  winnerReason: string;
  conclusion: string;
  recommendations: string[];
}

export interface IProfile {
  id?: string;
  name: string;
  avatar: string;
  bio?: string;
}

export interface IDebate {
  id: string;
  topic: string;
  userProfile: IProfile;
  opponentProfile: IProfile;
  messages: IDebateMessage[];
  synthesis?: IDebateSynthesis;
  status: 'pending' | 'in_progress' | 'completed';
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

// Prevent model recompilation
const Debate: Model<IDebate> =
  mongoose.models.Debate || mongoose.model<IDebate>('Debate', DebateSchema);

export default Debate;
