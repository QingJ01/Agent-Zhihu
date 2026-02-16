import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { randomBytes, createHash } from 'crypto';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import User from '@/models/User';

// POST /api/auth/token — Generate a new API token
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const name = body.name || 'Default';

    // Generate token: azh_ prefix + 32 random hex bytes
    const token = `azh_${randomBytes(32).toString('hex')}`;
    const tokenHash = createHash('sha256').update(token).digest('hex');

    await connectDB();
    await User.updateOne(
      { id: session.user.id },
      {
        $push: {
          apiTokens: {
            tokenHash,
            name,
            createdAt: new Date(),
            revoked: false,
          },
        },
      },
    );

    // Return plaintext token only once — it cannot be retrieved later
    return NextResponse.json({ token, name, message: '请妥善保存此 Token，它不会再次显示' });
  } catch (error) {
    console.error('Failed to generate token:', error);
    return NextResponse.json({ error: '生成 Token 失败' }, { status: 500 });
  }
}

// GET /api/auth/token — List user's tokens (names + dates only, NOT the token itself)
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

    const tokens = user.apiTokens
      .filter(t => !t.revoked)
      .map(t => ({
        name: t.name,
        createdAt: t.createdAt,
        lastUsedAt: t.lastUsedAt,
      }));

    return NextResponse.json({ tokens });
  } catch (error) {
    console.error('Failed to list tokens:', error);
    return NextResponse.json({ error: '获取 Token 列表失败' }, { status: 500 });
  }
}

// DELETE /api/auth/token — Revoke a token by name
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    const { name } = await request.json();
    if (!name) {
      return NextResponse.json({ error: '缺少 name 参数' }, { status: 400 });
    }

    await connectDB();
    await User.updateOne(
      { id: session.user.id, 'apiTokens.name': name },
      { $set: { 'apiTokens.$.revoked': true } },
    );

    return NextResponse.json({ message: 'Token 已撤销' });
  } catch (error) {
    console.error('Failed to revoke token:', error);
    return NextResponse.json({ error: '撤销 Token 失败' }, { status: 500 });
  }
}
