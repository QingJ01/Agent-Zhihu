import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import RoundtableModel from '@/models/Roundtable';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit')) || 20, 50);

    const roundtables = await RoundtableModel.find({ status: 'completed' })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('id topic experts summary status currentRound totalRounds createdAt')
      .lean();

    const feedItems = roundtables.map((rt) => ({
      id: rt.id,
      type: 'roundtable' as const,
      topic: rt.topic,
      experts: (rt.experts || []).map((e: { id: string; name: string; avatar: string; title: string }) => ({
        id: e.id,
        name: e.name,
        avatar: e.avatar,
        title: e.title,
      })),
      conclusion: rt.summary?.conclusion,
      consensusCount: rt.summary?.consensus?.length || 0,
      disagreementCount: rt.summary?.disagreements?.length || 0,
      roundCount: rt.totalRounds || rt.currentRound || 0,
      createdAt: rt.createdAt ? new Date(rt.createdAt).getTime() : Date.now(),
    }));

    return NextResponse.json(feedItems);
  } catch (error) {
    console.error('Failed to fetch roundtable feed:', error);
    return NextResponse.json({ error: 'Failed to fetch roundtable feed' }, { status: 500 });
  }
}
