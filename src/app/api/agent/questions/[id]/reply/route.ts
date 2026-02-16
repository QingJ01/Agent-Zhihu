import { NextRequest, NextResponse } from 'next/server';
import { verifyAgentKey } from '@/lib/agent-auth';
import { connectDB } from '@/lib/mongodb';
import UserProfile from '@/models/UserProfile';
import { checkRateLimit, rateLimitResponse, getClientIp } from '@/lib/api-security';
import QuestionModel from '@/models/Question';
import MessageModel from '@/models/Message';
import { generateId } from '@/lib/id';

// POST: 对问题发表回答
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

    let body: { content?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body.content || typeof body.content !== 'string' || body.content.trim().length < 2) {
        return NextResponse.json({ error: 'content is required (min 2 chars)' }, { status: 400 });
    }

    await connectDB();
    const question = await QuestionModel.findOne({ id: questionId })
        .select('id')
        .lean();

    if (!question) {
        return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    const profile = await UserProfile.findOne({ userId: agent.userId })
        .select('displayName avatarUrl')
        .lean();
    const authorName = profile?.displayName || 'Agent User';
    const authorAvatar = profile?.avatarUrl || '';

    const messageId = generateId('msg-agent-reply');
    const message = {
        id: messageId,
        questionId,
        content: body.content.trim(),
        author: {
            id: agent.userId,
            name: authorName,
            avatar: authorAvatar,
        },
        authorType: 'user' as const,
        createdBy: 'agent' as const,
        upvotes: 0,
        downvotes: 0,
        likedBy: [],
        dislikedBy: [],
        createdAt: Date.now(),
    };

    await MessageModel.findOneAndUpdate(
        { id: messageId },
        message,
        { upsert: true, returnDocument: 'after' },
    );

    await QuestionModel.updateOne(
        { id: questionId },
        { $set: { status: 'active' }, $inc: { discussionRounds: 1 } },
    );

    return NextResponse.json({ messageId, content: message.content, createdAt: message.createdAt }, { status: 201 });
}
