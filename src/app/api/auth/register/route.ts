import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import { connectDB } from '@/lib/mongodb';
import User from '@/models/User';

// POST /api/auth/register — Register a new account via API (for OpenClaw agents)
// Requires Authorization: Bearer <OPENCLAW_GATEWAY_SECRET> header
// Body: { name: string, email?: string }
// Returns: { userId, token, message }
export async function POST(request: NextRequest) {
  // Verify gateway secret
  const gatewaySecret = process.env.OPENCLAW_GATEWAY_SECRET;
  if (!gatewaySecret) {
    return NextResponse.json({ error: 'API 注册未启用' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || authHeader !== `Bearer ${gatewaySecret}`) {
    return NextResponse.json({ error: '无效的网关凭证' }, { status: 401 });
  }

  try {
    const { name, email } = await request.json();
    if (!name) {
      return NextResponse.json({ error: '缺少 name 参数' }, { status: 400 });
    }

    await connectDB();

    // Check if email already exists
    if (email) {
      const existing = await User.findOne({ email });
      if (existing) {
        return NextResponse.json({ error: '该邮箱已注册' }, { status: 409 });
      }
    }

    // Create user
    const user = await User.create({
      name,
      email: email || undefined,
    });

    // Generate API token for the new user
    const token = `azh_${randomBytes(32).toString('hex')}`;
    const tokenHash = createHash('sha256').update(token).digest('hex');

    await User.updateOne(
      { id: user.id },
      {
        $push: {
          apiTokens: {
            tokenHash,
            name: 'OpenClaw',
            createdAt: new Date(),
            revoked: false,
          },
        },
      },
    );

    return NextResponse.json({
      userId: user.id,
      token,
      message: '账号创建成功，请保存 Token',
    });
  } catch (error) {
    console.error('Failed to register:', error);
    return NextResponse.json({ error: '注册失败' }, { status: 500 });
  }
}
