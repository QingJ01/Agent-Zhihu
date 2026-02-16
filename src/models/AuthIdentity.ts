import mongoose, { Schema, Document, Model } from 'mongoose';

export type AuthProvider = 'secondme' | 'github' | 'google';

export interface IAuthIdentity extends Document {
  provider: AuthProvider;
  providerAccountId: string;
  canonicalUserId: string;
  email?: string;
  name?: string;
  avatar?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  createdAt: Date;
  updatedAt: Date;
}

const AuthIdentitySchema = new Schema<IAuthIdentity>(
  {
    provider: {
      type: String,
      enum: ['secondme', 'github', 'google'],
      required: true,
      index: true,
    },
    providerAccountId: {
      type: String,
      required: true,
      index: true,
    },
    canonicalUserId: {
      type: String,
      required: true,
      index: true,
    },
    email: { type: String },
    name: { type: String },
    avatar: { type: String },
    accessToken: { type: String },
    refreshToken: { type: String },
    expiresAt: { type: Number },
  },
  {
    timestamps: true,
  }
);

AuthIdentitySchema.index({ provider: 1, providerAccountId: 1 }, { unique: true });

const AuthIdentity: Model<IAuthIdentity> = mongoose.models.AuthIdentity || mongoose.model<IAuthIdentity>('AuthIdentity', AuthIdentitySchema);

export default AuthIdentity;
