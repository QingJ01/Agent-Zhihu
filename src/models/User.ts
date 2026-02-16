import mongoose, { Schema, Model } from 'mongoose';
import { randomUUID } from 'crypto';

// Linked account sub-schema
const LinkedAccountSchema = new Schema({
  provider: {
    type: String,
    enum: ['github', 'google', 'secondme'],
    required: true,
  },
  providerAccountId: {
    type: String,
    required: true,
  },
  accessToken: { type: String },
  refreshToken: { type: String },
  profileData: {
    type: Schema.Types.Mixed,
    default: {},
  },
  linkedAt: {
    type: Date,
    default: Date.now,
  },
}, { _id: false });

// API token sub-schema
const ApiTokenSchema = new Schema({
  tokenHash: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    default: 'Default',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastUsedAt: { type: Date },
  revoked: {
    type: Boolean,
    default: false,
  },
}, { _id: false });

// User schema
const UserSchema = new Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: () => randomUUID(),
  },
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    sparse: true,
    index: true,
  },
  image: { type: String },
  bio: { type: String },
  linkedAccounts: {
    type: [LinkedAccountSchema],
    default: [],
  },
  apiTokens: {
    type: [ApiTokenSchema],
    default: [],
  },
  // Legacy IDs for migration (e.g. { secondme: "old_secondme_user_id" })
  legacyIds: {
    type: Map,
    of: String,
    default: new Map(),
  },
}, {
  timestamps: true,
});

// Compound index: fast lookup by provider + account ID
UserSchema.index(
  { 'linkedAccounts.provider': 1, 'linkedAccounts.providerAccountId': 1 },
);

// Index for API token lookups
UserSchema.index({ 'apiTokens.tokenHash': 1 });

// Types
export interface ILinkedAccount {
  provider: 'github' | 'google' | 'secondme';
  providerAccountId: string;
  accessToken?: string;
  refreshToken?: string;
  profileData?: Record<string, unknown>;
  linkedAt: Date;
}

export interface IApiToken {
  tokenHash: string;
  name: string;
  createdAt: Date;
  lastUsedAt?: Date;
  revoked: boolean;
}

export interface IUser {
  id: string;
  name: string;
  email?: string;
  image?: string;
  bio?: string;
  linkedAccounts: ILinkedAccount[];
  apiTokens: IApiToken[];
  legacyIds: Map<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

// Prevent model recompilation during hot reload
const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
