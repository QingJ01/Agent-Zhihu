import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { connectDB } from '@/lib/mongodb';
import QuestionModel from '@/models/Question';
import MessageModel from '@/models/Message';

type VoteType = 'up' | 'down';

function safeCount(value: unknown): number {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0;
    return Math.max(0, Math.floor(value));
}

function applyVoteToggle(
    doc: { upvotes?: number; downvotes?: number; likedBy?: string[]; dislikedBy?: string[] },
    userId: string,
    voteType: VoteType
) {
    const upvotes = safeCount(doc.upvotes);
    const downvotes = safeCount(doc.downvotes);
    const likedBy = new Set(doc.likedBy || []);
    const dislikedBy = new Set(doc.dislikedBy || []);

    if (voteType === 'up') {
        if (likedBy.has(userId)) {
            likedBy.delete(userId);
            return {
                action: 'unliked',
                upvotes: Math.max(0, upvotes - 1),
                downvotes,
                likedBy: Array.from(likedBy),
                dislikedBy: Array.from(dislikedBy),
            };
        }

        let nextDownvotes = downvotes;
        if (dislikedBy.has(userId)) {
            dislikedBy.delete(userId);
            nextDownvotes = Math.max(0, downvotes - 1);
        }
        likedBy.add(userId);

        return {
            action: 'liked',
            upvotes: upvotes + 1,
            downvotes: nextDownvotes,
            likedBy: Array.from(likedBy),
            dislikedBy: Array.from(dislikedBy),
        };
    }

    if (dislikedBy.has(userId)) {
        dislikedBy.delete(userId);
        return {
            action: 'undownvoted',
            upvotes,
            downvotes: Math.max(0, downvotes - 1),
            likedBy: Array.from(likedBy),
            dislikedBy: Array.from(dislikedBy),
        };
    }

    let nextUpvotes = upvotes;
    if (likedBy.has(userId)) {
        likedBy.delete(userId);
        nextUpvotes = Math.max(0, upvotes - 1);
    }
    dislikedBy.add(userId);

    return {
        action: 'downvoted',
        upvotes: nextUpvotes,
        downvotes: downvotes + 1,
        likedBy: Array.from(likedBy),
        dislikedBy: Array.from(dislikedBy),
    };
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

        if (targetType === 'question') {
            const doc = await QuestionModel.findOne({ id: targetId });
            if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

            const next = applyVoteToggle(doc, visitorId, voteType);
            await QuestionModel.updateOne(
                { id: targetId },
                {
                    $set: {
                        upvotes: next.upvotes,
                        downvotes: next.downvotes,
                        likedBy: next.likedBy,
                        dislikedBy: next.dislikedBy,
                    },
                }
            );

            return NextResponse.json({
                action: next.action,
                upvotes: next.upvotes,
                downvotes: next.downvotes,
                liked: next.likedBy.includes(visitorId),
                downvoted: next.dislikedBy.includes(visitorId),
            });
        } else {
            const doc = await MessageModel.findOne({ id: targetId });
            if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

            const next = applyVoteToggle(doc, visitorId, voteType);
            await MessageModel.updateOne(
                { id: targetId },
                {
                    $set: {
                        upvotes: next.upvotes,
                        downvotes: next.downvotes,
                        likedBy: next.likedBy,
                        dislikedBy: next.dislikedBy,
                    },
                }
            );

            return NextResponse.json({
                action: next.action,
                upvotes: next.upvotes,
                downvotes: next.downvotes,
                liked: next.likedBy.includes(visitorId),
                downvoted: next.dislikedBy.includes(visitorId),
            });
        }
    } catch (error) {
        console.error('Like error:', error);
        return NextResponse.json({ error: 'Like failed' }, { status: 500 });
    }
}
