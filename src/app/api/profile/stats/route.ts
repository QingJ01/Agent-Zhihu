import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { connectDB } from '@/lib/mongodb';
import Question from '@/models/Question';
import Message from '@/models/Message';
import Debate from '@/models/Debate';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    await connectDB();

    const [
      questionCount,
      answerCount,
      debateCount,
      questionUpvotes,
      answerUpvotes,
      debateRecord,
      topTags,
      recentOpponents,
      likesGiven,
    ] = await Promise.all([
      Question.countDocuments({ 'author.id': userId }),
      Message.countDocuments({ 'author.id': userId, authorType: 'user' }),
      Debate.countDocuments({ userId }),
      Question.aggregate([
        { $match: { 'author.id': userId } },
        { $group: { _id: null, total: { $sum: '$upvotes' } } },
      ]),
      Message.aggregate([
        { $match: { 'author.id': userId } },
        { $group: { _id: null, total: { $sum: '$upvotes' } } },
      ]),
      // 辩论胜负记录
      Debate.aggregate([
        { $match: { userId, status: 'completed', 'synthesis.winner': { $exists: true } } },
        { $group: {
          _id: '$synthesis.winner',
          count: { $sum: 1 },
        }},
      ]),
      // 用户提问的高频标签 Top 10
      Question.aggregate([
        { $match: { 'author.id': userId } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      // 最近 5 个辩论对手
      Debate.find({ userId, status: 'completed' })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('opponentProfile topic synthesis.winner createdAt')
        .lean(),
      // 用户点赞数（给出的赞）
      Promise.all([
        Question.countDocuments({ likedBy: userId }),
        Message.countDocuments({ likedBy: userId }),
      ]),
    ]);

    const totalUpvotes =
      (questionUpvotes[0]?.total || 0) + (answerUpvotes[0]?.total || 0);

    // 解析辩论战绩
    const record = { wins: 0, losses: 0, ties: 0 };
    for (const r of debateRecord) {
      if (r._id === 'user') record.wins = r.count;
      else if (r._id === 'opponent') record.losses = r.count;
      else if (r._id === 'tie') record.ties = r.count;
    }

    return NextResponse.json({
      questions: questionCount,
      answers: answerCount,
      debates: debateCount,
      upvotesReceived: totalUpvotes,
      likesGiven: (likesGiven as number[])[0] + (likesGiven as number[])[1],
      debateRecord: record,
      topTags: topTags.map((t: { _id: string; count: number }) => ({ tag: t._id, count: t.count })),
      recentOpponents: recentOpponents.map((d: Record<string, unknown>) => ({
        name: (d.opponentProfile as Record<string, unknown>)?.name,
        avatar: (d.opponentProfile as Record<string, unknown>)?.avatar,
        topic: d.topic,
        result: (d.synthesis as Record<string, unknown>)?.winner,
        time: d.createdAt,
      })),
    });
  } catch (error) {
    console.error('Failed to fetch profile stats:', error);
    return NextResponse.json({ error: '获取统计失败' }, { status: 500 });
  }
}
