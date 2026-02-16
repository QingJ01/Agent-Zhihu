import mongoose, { Schema, Model, Document } from 'mongoose';

export interface IUserProfile extends Document {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  provider?: 'secondme' | 'github' | 'google';
  coverUrl?: string;
  customized: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserProfileSchema = new Schema<IUserProfile>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    displayName: {
      type: String,
      default: '',
      maxlength: 40,
    },
    avatarUrl: {
      type: String,
      default: '',
    },
    bio: {
      type: String,
      default: '',
      maxlength: 200,
    },
    provider: {
      type: String,
      enum: ['secondme', 'github', 'google'],
      default: null,
    },
    coverUrl: {
      type: String,
      default: '',
    },
    customized: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const UserProfile: Model<IUserProfile> = mongoose.models.UserProfile || mongoose.model<IUserProfile>('UserProfile', UserProfileSchema);

export default UserProfile;
