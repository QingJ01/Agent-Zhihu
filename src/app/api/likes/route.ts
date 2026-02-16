import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { connectDB } from '@/lib/mongodb';
import QuestionModel from '@/models/Question';
import MessageModel from '@/models/Message';

type VoteType = 'up' | 'down';
type VoteAction = 'liked' | 'unliked' | 'downvoted' | 'undownvoted';

function safeCount(value: unknown): number {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0;
    return Math.max(0, Math.floor(value));
}

async function applyVoteAtomic(targetType: 'question' | 'message', targetId: string, userId: string, voteType: VoteType) {
    const Model: {
        updateOne: (filter: Record<string, unknown>, update: Record<string, unknown>) => Promise<{ modifiedCount: number }>;
        findOne: (filter: Record<string, unknown>) => { select: (projection: string) => { lean: () => Promise<{ upvotes?: number; downvotes?: number; likedBy?: string[]; dislikedBy?: string[] } | null> } };
    } = (targetType === 'question' ? QuestionModel : MessageModel) as unknown as {
        updateOne: (filter: Record<string, unknown>, update: Record<string, unknown>) => Promise<{ modifiedCount: number }>;
        findOne: (filter: Record<string, unknown>) => { select: (projection: string) => { lean: () => Promise<{ upvotes?: number; downvotes?: number; likedBy?: string[]; dislikedBy?: string[] } | null> } };
    };
    const query = { id: targetId };

    let action: VoteAction = voteType === 'up' ? 'liked' : 'downvoted';

    if (voteType === 'up') {
        const unlike = await Model.updateOne(
            { ...query, likedBy: userId },
            { $pull: { likedBy: userId }, $inc: { upvotes: -1 } }
        );
        if (unlike.modifiedCount > 0) {
            action = 'unliked';
        } else {
            const switchFromDown = await Model.updateOne(
                { ...query, dislikedBy: userId, likedBy: { $ne: userId } },
                { $pull: { dislikedBy: userId }, $addToSet: { likedBy: userId }, $inc: { downvotes: -1, upvotes: 1 } }
            );
            if (switchFromDown.modifiedCount === 0) {
                await Model.updateOne(
                    { ...query, likedBy: { $ne: userId }, dislikedBy: { $ne: userId } },
                    { $addToSet: { likedBy: userId }, $inc: { upvotes: 1 } }
                );
            }
            action = 'liked';
        }
    } else {
        const undownvote = await Model.updateOne(
            { ...query, dislikedBy: userId },
            { $pull: { dislikedBy: userId }, $inc: { downvotes: -1 } }
        );
        if (undownvote.modifiedCount > 0) {
            action = 'undownvoted';
        } else {
            const switchFromUp = await Model.updateOne(
                { ...query, likedBy: userId, dislikedBy: { $ne: userId } },
                { $pull: { likedBy: userId }, $addToSet: { dislikedBy: userId }, $inc: { upvotes: -1, downvotes: 1 } }
            );
            if (switchFromUp.modifiedCount === 0) {
                await Model.updateOne(
                    { ...query, likedBy: { $ne: userId }, dislikedBy: { $ne: userId } },
                    { $addToSet: { dislikedBy: userId }, $inc: { downvotes: 1 } }
                );
            }
            action = 'downvoted';
        }
    }

    const doc = await Model.findOne(query).select('upvotes downvotes likedBy dislikedBy').lean();
    return { action, doc };
}

// POST: 点赞/取消点赞
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        const visitorId = session?.user?.id;
        if (!visitorId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { targetId, targetType, voteType = 'up' } = await request.json();

        if (!targetId || !targetType) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        if (targetType !== 'question' && targetType !== 'message') {
            return NextResponse.json({ error: 'Invalid target type' }, { status: 400 });
        }

        if (voteType !== 'up' && voteType !== 'down') {
            return NextResponse.json({ error: 'Invalid vote type' }, { status: 400 });
        }

        await connectDB();

        const { action, doc } = await applyVoteAtomic(targetType, targetId, visitorId, voteType);
        if (!doc) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        const likedBy = Array.isArray(doc.likedBy) ? doc.likedBy : [];
        const dislikedBy = Array.isArray(doc.dislikedBy) ? doc.dislikedBy : [];

        return NextResponse.json({
            action,
            upvotes: safeCount(doc.upvotes),
            downvotes: safeCount(doc.downvotes),
            liked: likedBy.includes(visitorId),
            downvoted: dislikedBy.includes(visitorId),
        });
    } catch (error) {
        console.error('Like error:', error);
        return NextResponse.json({ error: 'Like failed' }, { status: 500 });
    }
}
