import mongoose, { Schema, Model } from 'mongoose';

const FavoriteSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: ['question', 'message'],
      required: true,
      index: true,
    },
    targetId: {
      type: String,
      required: true,
      index: true,
    },
    questionId: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

FavoriteSchema.index({ userId: 1, targetType: 1, targetId: 1 }, { unique: true });
FavoriteSchema.index({ userId: 1, createdAt: -1 });

export interface IFavorite {
  userId: string;
  targetType: 'question' | 'message';
  targetId: string;
  questionId: string;
  createdAt: Date;
  updatedAt: Date;
}

const Favorite: Model<IFavorite> =
  mongoose.models.Favorite || mongoose.model<IFavorite>('Favorite', FavoriteSchema);

export default Favorite;
