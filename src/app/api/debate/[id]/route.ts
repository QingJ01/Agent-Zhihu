import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { connectDB } from '@/lib/mongodb';
import DebateModel from '@/models/Debate';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: '缺少辩论 ID' }, { status: 400 });
    }

    await connectDB();

    const session = await getServerSession(authOptions);
    const currentUserId = session?.user?.id;

    const debate = await DebateModel.findOne({ id }).lean();
    if (!debate) {
      return NextResponse.json({ error: '辩论不存在' }, { status: 404 });
    }

    return NextResponse.json({
      id: debate.id,
      topic: debate.topic,
      mode: debate.mode,
      status: debate.status,
      userProfile: debate.userProfile,
      opponentProfile: debate.opponentProfile,
      messages: debate.messages,
      synthesis: debate.synthesis,
      currentRound: debate.currentRound,
      totalRounds: debate.totalRounds,
      upvotes: debate.upvotes || 0,
      downvotes: debate.downvotes || 0,
      liked: currentUserId ? (debate.likedBy || []).includes(currentUserId) : false,
      downvoted: currentUserId ? (debate.dislikedBy || []).includes(currentUserId) : false,
      createdAt: debate.createdAt ? new Date(debate.createdAt).getTime() : Date.now(),
    });
  } catch (error) {
    console.error('Failed to fetch debate:', error);
    return NextResponse.json({ error: '获取辩论失败' }, { status: 500 });
  }
}
