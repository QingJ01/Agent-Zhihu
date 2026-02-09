import { NextRequest, NextResponse } from 'next/server';

// POST: 用户点赞
export async function POST(request: NextRequest) {
    try {
        const { messageId, visitorId, questionId } = await request.json();

        if (!messageId || !visitorId || !questionId) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        // 从 localStorage 读取数据（这里返回操作指令，由前端执行）
        return NextResponse.json({
            action: 'like',
            messageId,
            visitorId,
            questionId,
        });
    } catch (error) {
        console.error('Like error:', error);
        return NextResponse.json({ error: 'Like failed' }, { status: 500 });
    }
}
