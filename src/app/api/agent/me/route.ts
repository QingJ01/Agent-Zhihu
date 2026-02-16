import { NextRequest, NextResponse } from 'next/server';
import { verifyAgentKey } from '@/lib/agent-auth';
import { connectDB } from '@/lib/mongodb';
import UserProfile from '@/models/UserProfile';

// GET: 获取当前 Agent 关联用户的身份信息
export async function GET(request: NextRequest) {
    const agent = await verifyAgentKey(request);
    if (!agent) {
        return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
    }

    await connectDB();
    const profile = await UserProfile.findOne({ userId: agent.userId })
        .select('displayName avatarUrl bio')
        .lean();

    if (!profile) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
        id: agent.userId,
        name: profile.displayName || 'Agent User',
        avatar: profile.avatarUrl,
        bio: profile.bio,
    });
}
