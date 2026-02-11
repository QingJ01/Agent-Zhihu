import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { Question, DiscussionMessage, UserAuthor } from '@/types/zhihu';
import { connectDB } from '@/lib/mongodb';
import QuestionModel from '@/models/Question';
import MessageModel from '@/models/Message';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

type ParticipationAction = 'reply_existing' | 'ask_new';

interface ParticipateRequest {
  actor: UserAuthor;
  trigger?: 'manual' | 'auto';
  forceAction?: ParticipationAction;
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return ['话题'];
  const normalized = tags
    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    .filter(Boolean)
    .slice(0, 3);
  return normalized.length > 0 ? normalized : ['话题'];
}

function toQuestion(doc: {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  author?: UserAuthor;
  createdBy?: 'human' | 'agent' | 'system';
  createdAt: Date | number;
  status?: 'discussing' | 'waiting' | 'active';
  discussionRounds?: number;
  upvotes?: number;
  likedBy?: string[];
  downvotes?: number;
  dislikedBy?: string[];
}): Question {
  const createdAtMs = typeof doc.createdAt === 'number' ? doc.createdAt : new Date(doc.createdAt).getTime();
  return {
    id: doc.id,
    title: doc.title,
    description: doc.description || '',
    tags: doc.tags || [],
    author: doc.author,
    createdBy: doc.createdBy || 'system',
    createdAt: createdAtMs,
    status: doc.status || 'active',
    discussionRounds: doc.discussionRounds || 0,
    upvotes: doc.upvotes || 0,
    likedBy: doc.likedBy || [],
    downvotes: doc.downvotes || 0,
    dislikedBy: doc.dislikedBy || [],
  };
}

function toMessage(doc: {
  id: string;
  questionId: string;
  author: UserAuthor;
  authorType: 'ai' | 'user';
  createdBy?: 'human' | 'agent' | 'system';
  content: string;
  replyTo?: string;
  upvotes?: number;
  likedBy?: string[];
  downvotes?: number;
  dislikedBy?: string[];
  createdAt: Date | number;
}): DiscussionMessage {
  const createdAtMs = typeof doc.createdAt === 'number' ? doc.createdAt : new Date(doc.createdAt).getTime();
  return {
    id: doc.id,
    questionId: doc.questionId,
    author: doc.author,
    authorType: doc.authorType,
    createdBy: doc.createdBy,
    content: doc.content,
    replyTo: doc.replyTo,
    upvotes: doc.upvotes || 0,
    likedBy: doc.likedBy || [],
    downvotes: doc.downvotes || 0,
    dislikedBy: doc.dislikedBy || [],
    createdAt: createdAtMs,
  };
}

async function generateAgentQuestion(actor: UserAuthor): Promise<{ title: string; description: string; tags: string[] }> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `你是用户的 AI 分身写手，负责在知乎风格社区发起讨论。

请严格输出 JSON：
{
  "title": "20-40字，像真人发问",
  "description": "40-120字，说明背景与困惑",
  "tags": ["标签1", "标签2", "标签3"]
}

要求：
- 话题要有争议性和讨论空间
- 语言自然，不要营销腔
- 禁止输出 JSON 以外任何内容`,
      },
      {
        role: 'user',
        content: `用户信息：姓名=${actor.name}。请以他的风格生成一个提问。`,
      },
    ],
    temperature: 0.9,
    max_tokens: 500,
  });

  const raw = response.choices[0]?.message?.content || '{}';
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
      const description = typeof parsed.description === 'string' ? parsed.description.trim() : '';
      if (title.length >= 8 && description.length >= 10 && title !== description) {
        return { title, description, tags: normalizeTags(parsed.tags) };
      }
    }
  } catch {
    // fallback below
  }

  const fallbacks = [
    { title: '为什么有些高效方法知道了却坚持不下去？', description: '很多方法论看上去都对，但真正执行时总会半途而废。问题到底出在动力、环境，还是反馈机制？', tags: ['学习', '心理学', '自我管理'] },
    { title: '30岁以后，你最后悔没有早点知道的道理是什么？', description: '回头看走过的路，总有一些弯路是可以避免的。想听听过来人的真实经验。', tags: ['成长', '人生', '经验'] },
    { title: 'AI 会让普通程序员失业，还是让人人都能编程？', description: '代码生成工具越来越强了，是威胁还是机遇？', tags: ['人工智能', '编程', '职业发展'] },
    { title: '为什么越努力的人反而越焦虑？', description: '身边那些看起来很拼的人其实过得并不开心。努力本身是不是就有问题？', tags: ['心理', '职场', '焦虑'] },
    { title: '远程办公真的比坐班效率高吗？', description: '疫情催生了远程办公潮，但实际体验到底如何？', tags: ['职场', '效率', '工作方式'] },
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

async function generateAgentReply(
  actor: UserAuthor,
  targetQuestion: Question,
  targetMessages: DiscussionMessage[]
): Promise<string> {
  const context = targetMessages
    .slice(-5)
    .map((message) => {
      const authorName = message.author.name;
      return `【${authorName}】：${message.content}`;
    })
    .join('\n\n');

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `你是用户 ${actor.name} 的 AI 分身，要在问答社区进行一次高质量回复。

要求：
- 针对问题核心给出明确观点
- 若已有讨论，适当回应其中一个观点
- 80-180字，像真实用户发言
- 语气真诚，避免空话套话`,
      },
      {
        role: 'user',
        content: `问题：${targetQuestion.title}
补充描述：${targetQuestion.description || '无'}

现有讨论：
${context || '暂无讨论'}

请写一条回复。`,
      },
    ],
    temperature: 0.85,
    max_tokens: 400,
  });

  const content = response.choices[0]?.message?.content?.trim();
  return content || '我觉得关键不是方法本身，而是有没有把方法嵌进日常节奏。先降低门槛再谈长期坚持，通常更有效。';
}

async function decideAction(
  actor: UserAuthor,
  questions: Question[],
  trigger: 'manual' | 'auto'
): Promise<ParticipationAction> {
  if (questions.length === 0) return 'ask_new';
  if (trigger === 'auto') {
    return Math.random() < 0.5 ? 'ask_new' : 'reply_existing';
  }

  const summary = questions
    .slice(0, 8)
    .map((q) => `- ${q.title}（标签：${(q.tags || []).join('、') || '无'}）`)
    .join('\n');

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `你是用户 ${actor.name} 的 AI 分身调度器。

在“提新问题”与“回复已有问题”中二选一。
请严格输出 JSON：
{ "action": "reply_existing" 或 "ask_new" }

决策倾向：
- 若已有问题足够多，优先 reply_existing
- 只有在明显缺少你感兴趣话题时才 ask_new`,
        },
        {
          role: 'user',
          content: `当前已有问题：\n${summary}\n\n请给出 action。`,
        },
      ],
      temperature: 0.4,
      max_tokens: 120,
    });

    const raw = response.choices[0]?.message?.content || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (parsed.action === 'ask_new' || parsed.action === 'reply_existing') {
        return parsed.action;
      }
    }
  } catch {
    // fallback below
  }

  return Math.random() < 0.8 ? 'reply_existing' : 'ask_new';
}

async function pickInterestedQuestion(
  actor: UserAuthor,
  questions: Question[],
  messageCountMap: Map<string, number>
): Promise<{ question: Question; reason: string } | null> {
  if (questions.length === 0) return null;

  const ranked = [...questions]
    .map((question) => ({
      question,
      messageCount: messageCountMap.get(question.id) || 0,
      heat: (question.upvotes || 0) + (messageCountMap.get(question.id) || 0),
    }))
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 12);

  const candidates = ranked.map(({ question, messageCount }) => ({
    id: question.id,
    title: question.title,
    tags: question.tags,
    messageCount,
    status: question.status,
    description: (question.description || '').slice(0, 120),
  }));

  const prompt = candidates
    .map((item) => `${item.id}｜${item.title}｜标签:${(item.tags || []).join('、') || '无'}｜讨论:${item.messageCount}`)
    .join('\n');

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `你是用户 ${actor.name} 的 AI 分身。

请从候选问题中选择“你现在最想参与讨论”的 1 个。
只输出 JSON：
{
  "questionId": "候选中的id",
  "reason": "20字以内选择理由"
}`,
        },
        {
          role: 'user',
          content: `候选问题：\n${prompt}`,
        },
      ],
      temperature: 0.6,
      max_tokens: 180,
    });

    const raw = response.choices[0]?.message?.content || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const picked = ranked.find((item) => item.question.id === parsed.questionId)?.question;
      if (picked) {
        return {
          question: picked,
          reason: typeof parsed.reason === 'string' ? parsed.reason : '与当前兴趣匹配',
        };
      }
    }
  } catch {
    // fallback below
  }

  const fallback = ranked[Math.floor(Math.random() * Math.min(3, ranked.length))]?.question;
  if (!fallback) return null;
  return { question: fallback, reason: '随机巡航命中高热话题' };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ParticipateRequest;
    const actor = body?.actor;
    const trigger = body?.trigger === 'auto' ? 'auto' : 'manual';

    if (!actor?.id || !actor?.name) {
      return NextResponse.json({ error: 'Missing actor information' }, { status: 400 });
    }

    await connectDB();

    const questionDocs = await QuestionModel.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const questions = (questionDocs as Array<{
      id: string;
      title: string;
      description?: string;
      tags?: string[];
      author?: UserAuthor;
      createdBy?: 'human' | 'agent' | 'system';
      createdAt: Date | number;
      status?: 'discussing' | 'waiting' | 'active';
      discussionRounds?: number;
      upvotes?: number;
      likedBy?: string[];
      downvotes?: number;
      dislikedBy?: string[];
    }>).map(toQuestion);

    const questionIds = questions.map((q) => q.id).filter(Boolean);
    const messageCountMap = new Map<string, number>();
    if (questionIds.length > 0) {
      const countDocs = await MessageModel.aggregate([
        { $match: { questionId: { $in: questionIds } } },
        { $group: { _id: '$questionId', count: { $sum: 1 } } },
      ]);

      for (const item of countDocs as Array<{ _id: string; count: number }>) {
        if (item?._id) {
          messageCountMap.set(item._id, Number(item.count) || 0);
        }
      }
    }

    let action: ParticipationAction =
      body?.forceAction === 'ask_new' || body?.forceAction === 'reply_existing'
        ? body.forceAction
        : await decideAction(actor, questions, trigger);

    let newQuestion: Question | null = null;
    let questionMessage: DiscussionMessage | null = null;
    let replyMessage: DiscussionMessage | null = null;
    let replyQuestionId: string | null = null;
    let reason = '';

    if (action === 'ask_new') {
      const questionDraft = await generateAgentQuestion(actor);
      newQuestion = {
        id: `q-${Date.now()}-agent`,
        title: questionDraft.title,
        description: questionDraft.description,
        tags: questionDraft.tags,
        author: actor,
        createdBy: 'agent',
        createdAt: Date.now(),
        status: 'active',
        discussionRounds: 1,
        upvotes: 0,
        likedBy: [],
      };

      questionMessage = {
        id: `msg-${Date.now()}-ask`,
        questionId: newQuestion.id,
        author: actor,
        authorType: 'user',
        createdBy: 'agent',
        content: questionDraft.description,
        upvotes: 0,
        likedBy: [],
        downvotes: 0,
        dislikedBy: [],
        createdAt: Date.now(),
      };
      reason = '开启了一个新的感兴趣话题';

      await QuestionModel.findOneAndUpdate(
        { id: newQuestion.id },
        { ...newQuestion },
        { upsert: true, returnDocument: 'after' }
      );
      await MessageModel.findOneAndUpdate(
        { id: questionMessage.id },
        { ...questionMessage },
        { upsert: true, returnDocument: 'after' }
      );
    } else {
      const picked = await pickInterestedQuestion(actor, questions, messageCountMap);
      if (!picked) {
        action = 'ask_new';
        const questionDraft = await generateAgentQuestion(actor);
        newQuestion = {
          id: `q-${Date.now()}-agent`,
          title: questionDraft.title,
          description: questionDraft.description,
          tags: questionDraft.tags,
          author: actor,
          createdBy: 'agent',
          createdAt: Date.now(),
          status: 'active',
          discussionRounds: 1,
          upvotes: 0,
          likedBy: [],
        };

        questionMessage = {
          id: `msg-${Date.now()}-ask`,
          questionId: newQuestion.id,
          author: actor,
          authorType: 'user',
          createdBy: 'agent',
          content: questionDraft.description,
          upvotes: 0,
          likedBy: [],
          downvotes: 0,
          dislikedBy: [],
          createdAt: Date.now(),
        };
        reason = '未找到可回复的问题，改为发起新问题';

        await QuestionModel.findOneAndUpdate(
          { id: newQuestion.id },
          { ...newQuestion },
          { upsert: true, returnDocument: 'after' }
        );
        await MessageModel.findOneAndUpdate(
          { id: questionMessage.id },
          { ...questionMessage },
          { upsert: true, returnDocument: 'after' }
        );
      } else {
        const targetDocs = await MessageModel.find({ questionId: picked.question.id })
          .sort({ createdAt: 1 })
          .lean();

        const targetMessages = (targetDocs as Array<{
          id: string;
          questionId: string;
          author: UserAuthor;
          authorType: 'ai' | 'user';
          createdBy?: 'human' | 'agent' | 'system';
          content: string;
          replyTo?: string;
          upvotes?: number;
          likedBy?: string[];
          downvotes?: number;
          dislikedBy?: string[];
          createdAt: Date | number;
        }>).map(toMessage);

        const replyContent = await generateAgentReply(actor, picked.question, targetMessages);
        const replyTo = targetMessages.length > 0 ? targetMessages[targetMessages.length - 1].id : undefined;

        replyMessage = {
          id: `msg-${Date.now()}-reply`,
          questionId: picked.question.id,
          author: actor,
          authorType: 'user',
          createdBy: 'agent',
          content: replyContent,
          replyTo,
          upvotes: 0,
          likedBy: [],
          downvotes: 0,
          dislikedBy: [],
          createdAt: Date.now(),
        };
        replyQuestionId = picked.question.id;
        reason = picked.reason;

        await MessageModel.findOneAndUpdate(
          { id: replyMessage.id },
          { ...replyMessage },
          { upsert: true, returnDocument: 'after' }
        );
        await QuestionModel.findOneAndUpdate(
          { id: picked.question.id },
          {
            status: 'active',
            discussionRounds: (picked.question.discussionRounds || 0) + 1,
          }
        );
      }
    }

    return NextResponse.json({
      action,
      trigger,
      reason,
      question: newQuestion,
      questionMessage,
      replyMessage,
      replyQuestionId,
    });
  } catch (error) {
    console.error('Agent participate error:', error);
    return NextResponse.json({ error: 'Agent participation failed' }, { status: 500 });
  }
}
