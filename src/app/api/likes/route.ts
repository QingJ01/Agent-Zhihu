import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import QuestionModel from '@/models/Question';
import MessageModel from '@/models/Message';

// POST: 点赞/取消点赞
export async function POST(request: NextRequest) {
    try {
        const { targetId, targetType, visitorId } = await request.json();

        if (!targetId || !visitorId || !targetType) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        await connectDB();

        if (targetType === 'question') {
            const doc = await QuestionModel.findOne({ id: targetId });
            if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

            const alreadyLiked = (doc.likedBy || []).includes(visitorId);
            if (alreadyLiked) {
                await QuestionModel.updateOne({ id: targetId }, { $pull: { likedBy: visitorId }, $inc: { upvotes: -1 } });
                return NextResponse.json({ action: 'unliked', upvotes: Math.max(0, (doc.upvotes || 0) - 1), liked: false });
            } else {
                await QuestionModel.updateOne({ id: targetId }, { $addToSet: { likedBy: visitorId }, $inc: { upvotes: 1 } });
                return NextResponse.json({ action: 'liked', upvotes: (doc.upvotes || 0) + 1, liked: true });
            }
        } else {
            const doc = await MessageModel.findOne({ id: targetId });
            if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

            const alreadyLiked = (doc.likedBy || []).includes(visitorId);
            if (alreadyLiked) {
                await MessageModel.updateOne({ id: targetId }, { $pull: { likedBy: visitorId }, $inc: { upvotes: -1 } });
                return NextResponse.json({ action: 'unliked', upvotes: Math.max(0, (doc.upvotes || 0) - 1), liked: false });
            } else {
                await MessageModel.updateOne({ id: targetId }, { $addToSet: { likedBy: visitorId }, $inc: { upvotes: 1 } });
                return NextResponse.json({ action: 'liked', upvotes: (doc.upvotes || 0) + 1, liked: true });
            }
        }
    } catch (error) {
        console.error('Like error:', error);
        return NextResponse.json({ error: 'Like failed' }, { status: 500 });
    }
}
