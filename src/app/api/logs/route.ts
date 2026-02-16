import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import QuestionModel from '@/models/Question';
import MessageModel from '@/models/Message';

type LogActionType = 'human_question' | 'agent_question' | 'human_reply' | 'agent_reply';

interface LogEvent {
  id: string;
  timestamp: number;
  type: LogActionType;
  questionId: string;
  questionTitle: string;
  contentPreview: string;
}

interface LogStats {
  humanQuestions: number;
  agentQuestions: number;
  humanReplies: number;
  agentReplies: number;
}

function toTimestamp(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(String(value)).getTime();
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function initStats(): LogStats {
  return {
    humanQuestions: 0,
    agentQuestions: 0,
    humanReplies: 0,
    agentReplies: 0,
  };
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('limit') || '200', 10), 1), 500);

  try {
    await connectDB();

    const [questionEventsRaw, messageEventsRaw] = await Promise.all([
      QuestionModel.find({ createdBy: { $in: ['human', 'agent'] } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('id title description createdBy createdAt -_id')
        .lean(),
      MessageModel.aggregate([
        {
          $match: {
            authorType: 'user',
            createdBy: { $in: ['human', 'agent'] },
          },
        },
        { $sort: { createdAt: -1 } },
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
            id: 1,
            questionId: 1,
            content: 1,
            createdBy: 1,
            createdAt: 1,
            questionTitle: '$question.title',
          },
        },
      ]),
    ]);

    const questionEvents = (questionEventsRaw as Array<{
      id: string;
      title: string;
      description?: string;
      createdBy?: 'human' | 'agent' | 'system';
      createdAt: unknown;
    }>).map((item) => ({
      id: `qlog-${item.id}`,
      timestamp: toTimestamp(item.createdAt),
      type: item.createdBy === 'agent' ? 'agent_question' : 'human_question',
      questionId: item.id,
      questionTitle: item.title,
      contentPreview: (item.description || '').slice(0, 90),
    } satisfies LogEvent));

    const messageEvents = (messageEventsRaw as Array<{
      id: string;
      questionId: string;
      content: string;
      createdBy?: 'human' | 'agent' | 'system';
      createdAt: unknown;
      questionTitle?: string;
    }>).map((item) => ({
      id: `mlog-${item.id}`,
      timestamp: toTimestamp(item.createdAt),
      type: item.createdBy === 'agent' ? 'agent_reply' : 'human_reply',
      questionId: item.questionId,
      questionTitle: item.questionTitle || '未知问题',
      contentPreview: (item.content || '').slice(0, 120),
    } satisfies LogEvent));

    const events = [...questionEvents, ...messageEvents]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    const stats = initStats();
    for (const event of events) {
      if (event.type === 'human_question') stats.humanQuestions += 1;
      if (event.type === 'agent_question') stats.agentQuestions += 1;
      if (event.type === 'human_reply') stats.humanReplies += 1;
      if (event.type === 'agent_reply') stats.agentReplies += 1;
    }

    return NextResponse.json({ events, stats });
  } catch (error) {
    console.error('Logs API error:', error);
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}
