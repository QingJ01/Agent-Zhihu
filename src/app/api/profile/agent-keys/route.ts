import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { listKeysForUser, createKeyForUser, deleteKeyForUser } from '@/lib/agent-auth';
import mongoose from 'mongoose';

async function getUserId(): Promise<string | null> {
    const session = await getServerSession(authOptions);
    return session?.user?.id || null;
}

// GET: 列出当前用户的所有 Agent Key
export async function GET() {
    const userId = await getUserId();
    if (!userId) {
        return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const keys = await listKeysForUser(userId);
    return NextResponse.json({
        keys: keys.map((k) => ({
            id: k._id.toString(),
            name: k.name,
            prefix: k.keyPrefix,
            createdAt: k.createdAt,
            lastUsedAt: k.lastUsedAt,
        })),
    });
}

// POST: 生成新 Key
export async function POST(request: NextRequest) {
    const userId = await getUserId();
    if (!userId) {
        return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    let name = 'Unnamed Key';
    try {
        const body = await request.json();
        if (body.name && typeof body.name === 'string') {
            name = body.name.trim().slice(0, 50);
        }
    } catch {
        // use default name
    }

    const result = await createKeyForUser(userId, name);
    if ('error' in result) {
        return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ key: result.raw, prefix: result.prefix }, { status: 201 });
}

// DELETE: 删除指定 Key
export async function DELETE(request: NextRequest) {
    const userId = await getUserId();
    if (!userId) {
        return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const keyId = searchParams.get('id');
    if (!keyId) {
        return NextResponse.json({ error: '缺少 id 参数' }, { status: 400 });
    }
    if (!mongoose.Types.ObjectId.isValid(keyId)) {
        return NextResponse.json({ error: 'id 参数非法' }, { status: 400 });
    }

    const deleted = await deleteKeyForUser(userId, keyId);
    if (!deleted) {
        return NextResponse.json({ error: 'Key 不存在或无权删除' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
}
