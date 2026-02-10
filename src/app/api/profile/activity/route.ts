import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { connectDB } from '@/lib/mongodb';
import Question from '@/models/Question';
import Message from '@/models/Message';
import Debate from '@/models/Debate';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const userId = session.user.id;
  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type') || 'questions';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const skip = (page - 1) * limit;

  try {
    await connectDB();

    if (type === 'questions') {
      const [items, total] = await Promise.all([
        Question.find({ 'author.id': userId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Question.countDocuments({ 'author.id': userId }),
      ]);
      return NextResponse.json({ items, total, hasMore: skip + items.length < total });
    }

    if (type === 'answers') {
      const items = await Message.aggregate([
        { $match: { 'author.id': userId, authorType: 'user' } },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: 'questions',
            localField: 'questionId',
            foreignField: 'id',
            as: 'question',
          },
        },
        { $unwind: { path: '$question', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            id: 1, content: 1, upvotes: 1, createdAt: 1,
            questionId: 1,
            questionTitle: '$question.title',
          },
        },
      ]);
      const total = await Message.countDocuments({ 'author.id': userId, authorType: 'user' });
      return NextResponse.json({ items, total, hasMore: skip + items.length < total });
    }

    if (type === 'debates') {
      const [items, total] = await Promise.all([
        Debate.find({ userId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Debate.countDocuments({ userId }),
      ]);
      return NextResponse.json({ items, total, hasMore: skip + items.length < total });
    }

    if (type === 'likes') {
      // 用户点赞过的问题和回答，合并后按时间排序
      const [likedQuestions, likedMessages] = await Promise.all([
        Question.find({ likedBy: userId })
          .sort({ createdAt: -1 })
          .limit(50)
          .select('id title description upvotes createdAt')
          .lean(),
        Message.aggregate([
          { $match: { likedBy: userId } },
          { $sort: { createdAt: -1 } },
          { $limit: 50 },
          {
            $lookup: {
              from: 'questions',
              localField: 'questionId',
              foreignField: 'id',
              as: 'question',
            },
          },
          { $unwind: { path: '$question', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              id: 1, content: 1, upvotes: 1, createdAt: 1,
              questionId: 1,
              questionTitle: '$question.title',
              'author.name': 1,
            },
          },
        ]),
      ]);

      const merged = [
        ...likedQuestions.map(q => ({ ...q, _type: 'question' as const })),
        ...likedMessages.map(m => ({ ...m, _type: 'answer' as const })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const total = merged.length;
      const items = merged.slice(skip, skip + limit);
      return NextResponse.json({ items, total, hasMore: skip + items.length < total });
    }

    return NextResponse.json({ error: '无效的类型参数' }, { status: 400 });
  } catch (error) {
    console.error('Failed to fetch profile activity:', error);
    return NextResponse.json({ error: '获取活动记录失败' }, { status: 500 });
  }
}
