import mongoose, { Schema, Model } from 'mongoose';

const TuringGuessSchema = new Schema({
  guess: { type: String, enum: ['human', 'ai'], required: true },
  voterId: { type: String, required: true },
  voterType: { type: String, enum: ['human', 'agent'], required: true },
  votedAt: { type: Date, default: Date.now },
}, { _id: false });

const TuringEntryStatsSchema = new Schema({
  totalVotes: { type: Number, default: 0 },
  correctVotes: { type: Number, default: 0 },
  accuracy: { type: Number, default: 0 },
}, { _id: false });

const TuringEntrySchema = new Schema({
  messageId: { type: String, required: true },
  actualType: { type: String, enum: ['ai', 'user'], required: true },
  anonymousLabel: { type: String, required: true },
  contentPreview: { type: String, required: true },
  guesses: { type: [TuringGuessSchema], default: [] },
  stats: { type: TuringEntryStatsSchema, default: null },
}, { _id: false });

const TuringAwardSchema = new Schema({
  type: { type: String, enum: ['most_human_ai', 'most_ai_human', 'best_detective'], required: true },
  entryMessageId: { type: String, default: null },
  userId: { type: String, default: null },
  displayName: { type: String, required: true },
  stat: { type: Number, required: true },
}, { _id: false });

const TuringGameSchema = new Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  questionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  entries: { type: [TuringEntrySchema], default: [] },
  status: {
    type: String,
    enum: ['active', 'revealed'],
    default: 'active',
    index: true,
  },
  startedAt: { type: Date, default: Date.now },
  revealAt: { type: Date, required: true },
  revealedAt: { type: Date, default: null },
  awards: { type: [TuringAwardSchema], default: [] },
  totalVoters: { type: Number, default: 0 },
}, {
  timestamps: true,
});

// Types
export interface ITuringGuess {
  guess: 'human' | 'ai';
  voterId: string;
  voterType: 'human' | 'agent';
  votedAt: Date;
}

export interface ITuringEntryStats {
  totalVotes: number;
  correctVotes: number;
  accuracy: number;
}

export interface ITuringEntry {
  messageId: string;
  actualType: 'ai' | 'user';
  anonymousLabel: string;
  contentPreview: string;
  guesses: ITuringGuess[];
  stats?: ITuringEntryStats;
}

export interface ITuringAward {
  type: 'most_human_ai' | 'most_ai_human' | 'best_detective';
  entryMessageId?: string;
  userId?: string;
  displayName: string;
  stat: number;
}

export interface ITuringGame {
  id: string;
  questionId: string;
  entries: ITuringEntry[];
  status: 'active' | 'revealed';
  startedAt: Date;
  revealAt: Date;
  revealedAt?: Date;
  awards?: ITuringAward[];
  totalVoters: number;
  createdAt: Date;
  updatedAt: Date;
}

const TuringGame: Model<ITuringGame> =
  mongoose.models.TuringGame || mongoose.model<ITuringGame>('TuringGame', TuringGameSchema);

export default TuringGame;
