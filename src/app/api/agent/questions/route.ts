import { NextRequest, NextResponse } from 'next/server';
import { verifyAgentKey } from '@/lib/agent-auth';
import { connectDB } from '@/lib/mongodb';
import UserProfile from '@/models/UserProfile';
import { checkRateLimit, rateLimitResponse, getClientIp } from '@/lib/api-security';
import QuestionModel from '@/models/Question';
import MessageModel from '@/models/Message';
import { generateId } from '@/lib/id';

function parsePositiveInt(value: string | null, fallback: number): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

function normalizeTags(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return input
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .slice(0, 5);
}

// GET: 获取问题列表
export async function GET(request: NextRequest) {
    const agent = await verifyAgentKey(request);
    if (!agent) {
        return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
    }

    const ip = getClientIp(request);
    const rl = checkRateLimit(`agent:${ip}`, 60, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

    await connectDB();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parsePositiveInt(searchParams.get('limit'), 20), 50);
    const page = parsePositiveInt(searchParams.get('page'), 1);
    const skip = (page - 1) * limit;

    const questions = await QuestionModel.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    const questionIds = (questions as Array<{ id: string }>).map((q) => q.id).filter(Boolean);
    const messageCountMap = new Map<string, number>();
    if (questionIds.length > 0) {
        const counts = await MessageModel.aggregate([
            { $match: { questionId: { $in: questionIds } } },
            { $group: { _id: '$questionId', count: { $sum: 1 } } },
        ]);

        for (const item of counts as Array<{ _id: string; count: number }>) {
            if (item?._id) {
                messageCountMap.set(item._id, Number(item.count) || 0);
            }
        }
    }

    const total = await QuestionModel.countDocuments();

    return NextResponse.json({
        questions: questions.map((q) => ({
            id: q.id,
            title: q.title,
            description: q.description,
            tags: q.tags || [],
            upvotes: q.upvotes || 0,
            messageCount: messageCountMap.get(q.id) || 0,
            createdAt: q.createdAt,
        })),
        total,
        page,
        limit,
    });
}

// POST: 创建新问题
export async function POST(request: NextRequest) {
    const agent = await verifyAgentKey(request);
    if (!agent) {
        return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
    }

    const ip = getClientIp(request);
    const rl = checkRateLimit(`agent:${ip}`, 60, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

    let body: { title?: string; description?: string; tags?: string[] };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (title.length < 2 || title.length > 120) {
        return NextResponse.json({ error: 'title is required (min 2 chars)' }, { status: 400 });
    }

    await connectDB();

    const profile = await UserProfile.findOne({ userId: agent.userId })
        .select('displayName avatarUrl')
        .lean();
    const authorName = profile?.displayName || 'Agent User';
    const authorAvatar = profile?.avatarUrl || '';
    const id = generateId('q-agent');

    const question = {
        id,
        title,
        description,
        tags: normalizeTags(body.tags),
        author: {
            id: agent.userId,
            name: authorName,
            avatar: authorAvatar,
        },
        createdBy: 'agent' as const,
        status: 'active' as const,
        discussionRounds: 0,
        upvotes: 0,
        downvotes: 0,
        likedBy: [],
        dislikedBy: [],
        createdAt: Date.now(),
    };

    await QuestionModel.findOneAndUpdate(
        { id },
        question,
        { upsert: true, returnDocument: 'after' },
    );

    return NextResponse.json(
        { id, title, createdAt: question.createdAt },
        { status: 201 },
    );
}
