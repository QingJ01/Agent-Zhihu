import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { connectDB } from '@/lib/mongodb';
import Question from '@/models/Question';
import Message from '@/models/Message';
import Debate from '@/models/Debate';
import Favorite from '@/models/Favorite';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const userId = session.user.id;
  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type') || 'questions';
  const rawPage = parseInt(searchParams.get('page') || '1', 10);
  const rawLimit = parseInt(searchParams.get('limit') || '10', 10);
  const page = Math.min(Math.max(Number.isFinite(rawPage) ? rawPage : 1, 1), 1000);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 10, 1), 50);
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

    if (type === 'favorites') {
      const [favoriteQuestions, favoriteMessages] = await Promise.all([
        Favorite.find({ userId, targetType: 'question' })
          .sort({ createdAt: -1 })
          .limit(100)
          .select('targetId createdAt')
          .lean(),
        Favorite.find({ userId, targetType: 'message' })
          .sort({ createdAt: -1 })
          .limit(100)
          .select('targetId questionId createdAt')
          .lean(),
      ]);

      const questionIds = Array.from(new Set(
        (favoriteQuestions as Array<{ targetId?: string }>)
          .map((f) => f.targetId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      ));
      const messageIds = Array.from(new Set(
        (favoriteMessages as Array<{ targetId?: string }>)
          .map((f) => f.targetId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      ));

      const [questions, messages] = await Promise.all([
        questionIds.length > 0
          ? Question.find({ id: { $in: questionIds } }).select('id title description upvotes createdAt').lean()
          : Promise.resolve([]),
        messageIds.length > 0
          ? Message.aggregate([
            { $match: { id: { $in: messageIds } } },
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
                id: 1,
                content: 1,
                upvotes: 1,
                createdAt: 1,
                questionId: 1,
                questionTitle: '$question.title',
                'author.name': 1,
              },
            },
          ])
          : Promise.resolve([]),
      ]);

      const questionMap = new Map((questions as Array<{ id: string }>).map((q) => [q.id, q]));
      const messageMap = new Map((messages as Array<{ id: string }>).map((m) => [m.id, m]));

      const questionItems = (favoriteQuestions as Array<{ targetId: string; createdAt: Date }>).map((fav) => ({
        ...(questionMap.get(fav.targetId) || { id: fav.targetId }),
        _type: 'question' as const,
        createdAt: fav.createdAt,
      }));

      const messageItems = (favoriteMessages as Array<{ targetId: string; createdAt: Date }>).map((fav) => ({
        ...(messageMap.get(fav.targetId) || { id: fav.targetId }),
        _type: 'answer' as const,
        createdAt: fav.createdAt,
      }));

      const merged = [...questionItems, ...messageItems].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

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
