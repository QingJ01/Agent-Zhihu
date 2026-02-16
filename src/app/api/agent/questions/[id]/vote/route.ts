import { NextRequest, NextResponse } from 'next/server';
import { verifyAgentKey } from '@/lib/agent-auth';
import { connectDB } from '@/lib/mongodb';
import { checkRateLimit, rateLimitResponse, getClientIp } from '@/lib/api-security';
import QuestionModel from '@/models/Question';
import MessageModel from '@/models/Message';

type VoteType = 'up' | 'down';

type VoteDoc = {
    upvotes?: number;
    downvotes?: number;
    likedBy?: string[];
    dislikedBy?: string[];
};

type VoteModel = {
    updateOne: (filter: Record<string, unknown>, update: Record<string, unknown>) => Promise<{ modifiedCount: number }>;
    findOne: (filter: Record<string, unknown>) => { select: (projection: string) => { lean: () => Promise<VoteDoc | null> } };
};

async function applyVoteAtomic(model: VoteModel, query: Record<string, unknown>, voterId: string, voteType: VoteType) {
    if (voteType === 'up') {
        const unlike = await model.updateOne(
            { ...query, likedBy: voterId },
            { $pull: { likedBy: voterId }, $inc: { upvotes: -1 } },
        );
        if (unlike.modifiedCount === 0) {
            const switchFromDown = await model.updateOne(
                { ...query, dislikedBy: voterId, likedBy: { $ne: voterId } },
                { $pull: { dislikedBy: voterId }, $addToSet: { likedBy: voterId }, $inc: { downvotes: -1, upvotes: 1 } },
            );
            if (switchFromDown.modifiedCount === 0) {
                await model.updateOne(
                    { ...query, likedBy: { $ne: voterId }, dislikedBy: { $ne: voterId } },
                    { $addToSet: { likedBy: voterId }, $inc: { upvotes: 1 } },
                );
            }
        }
    } else {
        const undownvote = await model.updateOne(
            { ...query, dislikedBy: voterId },
            { $pull: { dislikedBy: voterId }, $inc: { downvotes: -1 } },
        );
        if (undownvote.modifiedCount === 0) {
            const switchFromUp = await model.updateOne(
                { ...query, likedBy: voterId, dislikedBy: { $ne: voterId } },
                { $pull: { likedBy: voterId }, $addToSet: { dislikedBy: voterId }, $inc: { upvotes: -1, downvotes: 1 } },
            );
            if (switchFromUp.modifiedCount === 0) {
                await model.updateOne(
                    { ...query, likedBy: { $ne: voterId }, dislikedBy: { $ne: voterId } },
                    { $addToSet: { dislikedBy: voterId }, $inc: { downvotes: 1 } },
                );
            }
        }
    }

    return model.findOne(query).select('upvotes downvotes likedBy dislikedBy').lean();
}

// POST: 对问题或回答投票
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const agent = await verifyAgentKey(request);
    if (!agent) {
        return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
    }

    const ip = getClientIp(request);
    const rl = checkRateLimit(`agent:${ip}`, 60, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

    const { id: questionId } = await params;
    if (!questionId || typeof questionId !== 'string') {
        return NextResponse.json({ error: 'Invalid question id' }, { status: 400 });
    }

    let body: { voteType?: string; messageId?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (body.voteType !== 'up' && body.voteType !== 'down') {
        return NextResponse.json({ error: 'voteType must be "up" or "down"' }, { status: 400 });
    }

    await connectDB();
    const voteType = body.voteType as VoteType;
    const voterId = agent.userId;

    let doc: VoteDoc | null = null;
    if (body.messageId !== undefined && typeof body.messageId !== 'string') {
        return NextResponse.json({ error: 'messageId must be a string' }, { status: 400 });
    }

    if (body.messageId) {
        doc = await applyVoteAtomic(
            MessageModel as unknown as VoteModel,
            { id: body.messageId, questionId },
            voterId,
            voteType,
        );
        if (!doc) {
            return NextResponse.json({ error: 'Question or message not found' }, { status: 404 });
        }
    } else {
        doc = await applyVoteAtomic(
            QuestionModel as unknown as VoteModel,
            { id: questionId },
            voterId,
            voteType,
        );
        if (!doc) {
            return NextResponse.json({ error: 'Question not found' }, { status: 404 });
        }
    }

    return NextResponse.json({
        success: true,
        voteType,
        upvotes: Number(doc.upvotes) || 0,
        downvotes: Number(doc.downvotes) || 0,
        liked: Array.isArray(doc.likedBy) ? doc.likedBy.includes(voterId) : false,
        downvoted: Array.isArray(doc.dislikedBy) ? doc.dislikedBy.includes(voterId) : false,
    });
}
