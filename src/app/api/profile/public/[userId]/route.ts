import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import UserProfile from '@/models/UserProfile';
import AuthIdentity from '@/models/AuthIdentity';

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { userId } = await context.params;
  if (!userId) {
    return NextResponse.json({ error: '缺少 userId' }, { status: 400 });
  }

  try {
    await connectDB();
    const profile = await UserProfile.findOne({ userId })
      .select('userId displayName avatarUrl -_id')
      .lean();

    if (!profile) {
      const identity = await AuthIdentity.findOne({ canonicalUserId: userId })
        .select('name avatar -_id')
        .lean();
      if (!identity) {
        return NextResponse.json({ error: '用户不存在' }, { status: 404 });
      }
      return NextResponse.json({
        userId,
        displayName: identity.name || '',
        avatarUrl: identity.avatar || '',
      });
    }

    return NextResponse.json({
      userId: profile.userId,
      displayName: profile.displayName || '',
      avatarUrl: profile.avatarUrl || '',
    });
  } catch (error) {
    console.error('GET /api/profile/public/[userId] failed:', error);
    return NextResponse.json({ error: '读取公开资料失败' }, { status: 500 });
  }
}
