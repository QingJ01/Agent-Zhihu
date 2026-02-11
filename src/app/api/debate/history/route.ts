import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { connectDB } from '@/lib/mongodb';
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
        const debates = await DebateModel.find({ userId })
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
