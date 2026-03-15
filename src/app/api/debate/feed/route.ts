import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { connectDB } from '@/lib/mongodb';
import DebateModel from '@/models/Debate';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    const currentUserId = session?.user?.id;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit')) || 20, 50);

    const debates = await DebateModel.find({ status: 'completed' })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const feedItems = debates.map((d) => ({
      id: d.id,
      type: 'debate' as const,
      topic: d.topic,
      userName: d.userProfile?.name || '用户',
      userAvatar: d.userProfile?.avatar,
      opponentName: d.opponentProfile?.name || '对手',
      opponentAvatar: d.opponentProfile?.avatar,
      winner: d.synthesis?.winner,
      conclusion: d.synthesis?.conclusion,
      roundCount: Math.floor((d.messages?.length || 0) / 2),
      upvotes: d.upvotes || 0,
      downvotes: d.downvotes || 0,
      liked: currentUserId ? (d.likedBy || []).includes(currentUserId) : false,
      downvoted: currentUserId ? (d.dislikedBy || []).includes(currentUserId) : false,
      createdAt: d.createdAt ? new Date(d.createdAt).getTime() : Date.now(),
    }));

    return NextResponse.json(feedItems);
  } catch (error) {
    console.error('Failed to fetch debate feed:', error);
    return NextResponse.json([], { status: 200 });
  }
}
