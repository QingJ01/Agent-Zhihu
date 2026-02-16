import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { connectDB } from '@/lib/mongodb';
import UserProfile from '@/models/UserProfile';

function isValidAvatarUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    await connectDB();
    const profile = await UserProfile.findOne({ userId: session.user.id })
      .select('userId displayName avatarUrl bio provider coverUrl customized updatedAt -_id')
      .lean();

    return NextResponse.json({
      userId: session.user.id,
      displayName: profile?.displayName || session.user.name || '',
      avatarUrl: profile?.avatarUrl || session.user.image || '',
      bio: profile?.bio || session.user.bio || '',
      provider: profile?.provider || session.user.provider || null,
      coverUrl: profile?.coverUrl || '',
      customized: !!profile?.customized,
      updatedAt: profile?.updatedAt || null,
    });
  } catch (error) {
    console.error('GET /api/profile/me failed:', error);
    return NextResponse.json({ error: '读取资料失败' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    const body = await request.json() as {
      displayName?: string;
      avatarUrl?: string;
      bio?: string;
      coverUrl?: string;
    };

    const displayName = (body.displayName || '').trim();
    const avatarUrl = (body.avatarUrl || '').trim();
    const bio = (body.bio || '').trim();
    const coverUrl = (body.coverUrl || '').trim();

    if (!displayName || displayName.length > 40) {
      return NextResponse.json({ error: '昵称长度需在 1-40 字符之间' }, { status: 400 });
    }
    if (bio.length > 200) {
      return NextResponse.json({ error: '简介最多 200 字符' }, { status: 400 });
    }
    if (!isValidAvatarUrl(avatarUrl)) {
      return NextResponse.json({ error: '头像链接格式无效' }, { status: 400 });
    }
    if (coverUrl && !isValidAvatarUrl(coverUrl)) {
      return NextResponse.json({ error: '封面链接格式无效' }, { status: 400 });
    }

    await connectDB();
    await UserProfile.findOneAndUpdate(
      { userId: session.user.id },
      {
        userId: session.user.id,
        displayName,
        avatarUrl,
        bio,
        provider: session.user.provider || 'secondme',
        coverUrl,
        customized: true,
      },
      { upsert: true, returnDocument: 'after' }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/profile/me failed:', error);
    return NextResponse.json({ error: '保存资料失败' }, { status: 500 });
  }
}
