import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { connectDB } from '@/lib/mongodb';
import AuthIdentity from '@/models/AuthIdentity';

const ALLOWED_PROVIDERS = ['secondme', 'github', 'google'] as const;
type Provider = typeof ALLOWED_PROVIDERS[number];

function isProvider(value: string): value is Provider {
  return ALLOWED_PROVIDERS.includes(value as Provider);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    await connectDB();
    const docs = await AuthIdentity.find({ canonicalUserId: session.user.id })
      .select('provider providerAccountId email name -_id')
      .lean();

    const bound = ALLOWED_PROVIDERS.reduce<Record<string, boolean>>((acc, provider) => {
      acc[provider] = docs.some((doc) => doc.provider === provider);
      return acc;
    }, {});

    const boundCount = docs.length;
    const canUnbind = ALLOWED_PROVIDERS.reduce<Record<string, boolean>>((acc, provider) => {
      acc[provider] = !!bound[provider] && boundCount > 1;
      return acc;
    }, {});

    return NextResponse.json({
      currentProvider: session.user.provider || null,
      bound,
      canUnbind,
      boundCount,
      identities: docs,
    });
  } catch (error) {
    console.error('GET /api/profile/identities failed:', error);
    return NextResponse.json({ error: '读取绑定信息失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const provider = request.nextUrl.searchParams.get('provider') || '';
  if (!isProvider(provider)) {
    return NextResponse.json({ error: '无效的 provider' }, { status: 400 });
  }

  try {
    await connectDB();

    const identities = await AuthIdentity.find({ canonicalUserId: session.user.id })
      .select('provider providerAccountId')
      .lean();

    const target = identities.find((item) => item.provider === provider);
    if (!target) {
      return NextResponse.json({ error: '该账号未绑定' }, { status: 404 });
    }

    if (identities.length <= 1) {
      return NextResponse.json({ error: '至少保留一个绑定方式' }, { status: 400 });
    }

    await AuthIdentity.deleteOne({
      canonicalUserId: session.user.id,
      provider,
      providerAccountId: target.providerAccountId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/profile/identities failed:', error);
    return NextResponse.json({ error: '解绑失败' }, { status: 500 });
  }
}
