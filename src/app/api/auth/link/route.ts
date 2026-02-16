import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import User from '@/models/User';

// GET /api/auth/link — List linked accounts for current user
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    await connectDB();
    const user = await User.findOne({ id: session.user.id }).lean();
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    const accounts = user.linkedAccounts.map(a => ({
      provider: a.provider,
      linkedAt: a.linkedAt,
      profileData: a.profileData,
    }));

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error('Failed to list linked accounts:', error);
    return NextResponse.json({ error: '获取绑定信息失败' }, { status: 500 });
  }
}

// DELETE /api/auth/link — Unlink a provider
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    const { provider } = await request.json();
    if (!provider) {
      return NextResponse.json({ error: '缺少 provider 参数' }, { status: 400 });
    }

    await connectDB();
    const user = await User.findOne({ id: session.user.id });
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // Must keep at least one linked account
    if (user.linkedAccounts.length <= 1) {
      return NextResponse.json({ error: '至少保留一个登录方式' }, { status: 400 });
    }

    await User.updateOne(
      { id: session.user.id },
      { $pull: { linkedAccounts: { provider } } },
    );

    return NextResponse.json({ message: '解绑成功' });
  } catch (error) {
    console.error('Failed to unlink account:', error);
    return NextResponse.json({ error: '解绑失败' }, { status: 500 });
  }
}
