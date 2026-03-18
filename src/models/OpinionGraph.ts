import mongoose, { Schema, Model } from 'mongoose';

const OpinionNodeSchema = new Schema({
  id: { type: String, required: true },
  messageId: { type: String, required: true },
  authorName: { type: String, required: true },
  authorType: { type: String, enum: ['ai', 'user'], required: true },
  stance: { type: String, enum: ['support', 'oppose', 'neutral', 'conditional'], required: true },
  summary: { type: String, required: true },
  keyArgument: { type: String, required: true },
  tags: { type: [String], default: [] },
  weight: { type: Number, default: 0 },
}, { _id: false });

const OpinionEdgeSchema = new Schema({
  id: { type: String, required: true },
  source: { type: String, required: true },
  target: { type: String, required: true },
  relation: { type: String, enum: ['support', 'oppose', 'supplement', 'evolve'], required: true },
  reason: { type: String, default: '' },
}, { _id: false });

const OpinionClusterSchema = new Schema({
  id: { type: String, required: true },
  label: { type: String, required: true },
  stance: { type: String, enum: ['support', 'oppose', 'neutral'], required: true },
  nodeIds: { type: [String], default: [] },
  summary: { type: String, required: true },
}, { _id: false });

const OpinionGraphSchema = new Schema({
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
  nodes: { type: [OpinionNodeSchema], default: [] },
  edges: { type: [OpinionEdgeSchema], default: [] },
  clusters: { type: [OpinionClusterSchema], default: [] },
  messageCount: { type: Number, default: 0 },
  version: { type: Number, default: 1 },
}, {
  timestamps: true,
});

// Types
export interface IOpinionNode {
  id: string;
  messageId: string;
  authorName: string;
  authorType: 'ai' | 'user';
  stance: 'support' | 'oppose' | 'neutral' | 'conditional';
  summary: string;
  keyArgument: string;
  tags: string[];
  weight: number;
}

export interface IOpinionEdge {
  id: string;
  source: string;
  target: string;
  relation: 'support' | 'oppose' | 'supplement' | 'evolve';
  reason?: string;
}

export interface IOpinionCluster {
  id: string;
  label: string;
  stance: 'support' | 'oppose' | 'neutral';
  nodeIds: string[];
  summary: string;
}

export interface IOpinionGraph {
  id: string;
  questionId: string;
  nodes: IOpinionNode[];
  edges: IOpinionEdge[];
  clusters: IOpinionCluster[];
  messageCount: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const OpinionGraph: Model<IOpinionGraph> =
  mongoose.models.OpinionGraph || mongoose.model<IOpinionGraph>('OpinionGraph', OpinionGraphSchema);

export default OpinionGraph;
