import mongoose, { Schema, Model } from 'mongoose';

// Expert sub-schema
const RoundtableExpertSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  avatar: { type: String, required: true },
  title: { type: String, required: true },
  stance: { type: String, default: null },
}, { _id: false });

// Message sub-schema
const RoundtableMessageSchema = new Schema({
  id: { type: String, required: true },
  role: { type: String, enum: ['expert', 'host'], required: true },
  expertId: { type: String, default: null },
  name: { type: String, required: true },
  content: { type: String, required: true },
  replyTo: { type: String, default: null },
  round: { type: Number, required: true },
  timestamp: { type: Number, required: true },
}, { _id: false });

// Summary sub-schema
const StanceSchema = new Schema({
  expertId: { type: String, required: true },
  expertName: { type: String, required: true },
  position: { type: String, required: true },
  keyPoints: { type: [String], default: [] },
}, { _id: false });

const RoundtableSummarySchema = new Schema({
  consensus: { type: [String], default: [] },
  disagreements: { type: [String], default: [] },
  stances: { type: [StanceSchema], default: [] },
  conclusion: { type: String, required: true },
  openQuestions: { type: [String], default: [] },
}, { _id: false });

// Main Roundtable schema
const RoundtableSchema = new Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  topic: { type: String, required: true },
  description: { type: String, default: '' },
  userId: { type: String, required: true, index: true },
  experts: { type: [RoundtableExpertSchema], default: [] },
  messages: { type: [RoundtableMessageSchema], default: [] },
  summary: { type: RoundtableSummarySchema, default: null },
  currentRound: { type: Number, default: 0 },
  totalRounds: { type: Number, default: 4 },
  status: {
    type: String,
    enum: ['preparing', 'in_progress', 'summarizing', 'completed'],
    default: 'preparing',
    index: true,
  },
}, {
  timestamps: true,
});

RoundtableSchema.index({ userId: 1, createdAt: -1 });
RoundtableSchema.index({ status: 1, createdAt: -1 });

// Types
export interface IRoundtableExpert {
  id: string;
  name: string;
  avatar: string;
  title: string;
  stance?: string;
}

export interface IRoundtableMessage {
  id: string;
  role: 'expert' | 'host';
  expertId?: string;
  name: string;
  content: string;
  replyTo?: string;
  round: number;
  timestamp: number;
}

export interface IRoundtableStance {
  expertId: string;
  expertName: string;
  position: string;
  keyPoints: string[];
}

export interface IRoundtableSummary {
  consensus: string[];
  disagreements: string[];
  stances: IRoundtableStance[];
  conclusion: string;
  openQuestions: string[];
}

export interface IRoundtable {
  id: string;
  topic: string;
  description?: string;
  userId: string;
  experts: IRoundtableExpert[];
  messages: IRoundtableMessage[];
  summary?: IRoundtableSummary;
  currentRound: number;
  totalRounds: number;
  status: 'preparing' | 'in_progress' | 'summarizing' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}

const Roundtable: Model<IRoundtable> =
  mongoose.models.Roundtable || mongoose.model<IRoundtable>('Roundtable', RoundtableSchema);

export default Roundtable;
