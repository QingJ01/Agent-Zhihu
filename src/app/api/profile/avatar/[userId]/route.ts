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
      .select('avatarUrl -_id')
      .lean();

    if (!profile?.avatarUrl) {
      const identity = await AuthIdentity.findOne({ canonicalUserId: userId })
        .select('avatar -_id')
        .lean();
      return NextResponse.json({
        userId,
        avatarUrl: identity?.avatar || '',
      });
    }

    return NextResponse.json({
      userId,
      avatarUrl: profile.avatarUrl,
    });
  } catch (error) {
    console.error('GET /api/profile/avatar/[userId] failed:', error);
    return NextResponse.json({ error: '读取头像失败' }, { status: 500 });
  }
}
