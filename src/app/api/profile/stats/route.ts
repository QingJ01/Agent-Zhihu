import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import { getUserIds } from '@/lib/auth-helpers';
import Question from '@/models/Question';
import Message from '@/models/Message';
import Debate from '@/models/Debate';
import Favorite from '@/models/Favorite';

type RecentOpponent = {
  opponentProfile?: {
    name?: string;
    avatar?: string;
  };
  topic?: string;
  synthesis?: {
    winner?: string;
  };
  createdAt: Date | string | number;
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    await connectDB();
    const userIds = await getUserIds(userId);

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
      favorites,
    ] = await Promise.all([
      Question.countDocuments({ 'author.id': { $in: userIds } }),
      Message.countDocuments({ 'author.id': { $in: userIds }, authorType: 'user' }),
      Debate.countDocuments({ userId: { $in: userIds } }),
      Question.aggregate([
        { $match: { 'author.id': { $in: userIds } } },
        { $group: { _id: null, total: { $sum: '$upvotes' } } },
      ]),
      Message.aggregate([
        { $match: { 'author.id': { $in: userIds } } },
        { $group: { _id: null, total: { $sum: '$upvotes' } } },
      ]),
      // 辩论胜负记录
      Debate.aggregate([
        { $match: { userId: { $in: userIds }, status: 'completed', 'synthesis.winner': { $exists: true } } },
        {
          $group: {
            _id: '$synthesis.winner',
            count: { $sum: 1 },
          }
        },
      ]),
      // 用户提问的高频标签 Top 10
      Question.aggregate([
        { $match: { 'author.id': { $in: userIds } } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      // 最近 5 个辩论对手
      Debate.find({ userId: { $in: userIds }, status: 'completed' })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('opponentProfile topic synthesis.winner createdAt')
        .lean(),
      // 用户点赞数（给出的赞）
      Promise.all([
        Question.countDocuments({ likedBy: { $in: userIds } }),
        Message.countDocuments({ likedBy: { $in: userIds } }),
      ]),
      Favorite.countDocuments({ userId: { $in: userIds } }),
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
      likesGiven: likesGiven[0] + likesGiven[1],
      favorites,
      debateRecord: record,
      topTags: topTags.map((t: { _id: string; count: number }) => ({ tag: t._id, count: t.count })),
      recentOpponents: (recentOpponents as RecentOpponent[]).map((d) => ({
        name: d.opponentProfile?.name,
        avatar: d.opponentProfile?.avatar,
        topic: d.topic,
        result: d.synthesis?.winner,
        time: d.createdAt,
      })),
    });
  } catch (error) {
    console.error('Failed to fetch profile stats:', error);
    return NextResponse.json({ error: '获取统计失败' }, { status: 500 });
  }
}
