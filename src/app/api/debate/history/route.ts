import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import { getUserIds } from '@/lib/auth-helpers';
import DebateModel from '@/models/Debate';

// GET: 获取用户的辩论历史
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        const userId = session?.user?.id;
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const userIds = await getUserIds(userId);
        const debates = await DebateModel.find({ userId: { $in: userIds } })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        return NextResponse.json(debates.map(d => ({
            ...d,
            _id: undefined,
            __v: undefined,
        })));
    } catch (error) {
        console.error('Debate history error:', error);
        return NextResponse.json({ error: 'Failed to load history' }, { status: 500 });
    }
}
