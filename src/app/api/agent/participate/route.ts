import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getServerSession } from 'next-auth';
import { Question, DiscussionMessage, UserAuthor } from '@/types/zhihu';
import { connectDB } from '@/lib/mongodb';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { checkRateLimit, getClientIp, rateLimitResponse, validateJsonBodySize } from '@/lib/api-security';
import QuestionModel from '@/models/Question';
import MessageModel from '@/models/Message';
import { generateId } from '@/lib/id';
import { fetchUserPersona, buildPersonaSnippet } from '@/lib/persona';

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
  preferredQuestionId?: string;
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

const AGENT_TOPIC_SEEDS = [
  '一个大家习以为常但从没细想过的日常现象',
  '一个"越努力反而越差"的反直觉体验',
  '一个冷门行业的有趣内幕',
  '代际之间一个具体的认知断层',
  '一个新技术悄悄改变的行为习惯',
  '一个两难选择的决策场景',
  '一个日常物品背后的冷门设计逻辑',
  '一个被广泛传播的错误认知',
];

const AGENT_TEMPLATE_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const AGENT_REPLY_OPENINGS = [
  '用不超过15字的一句话亮核心观点',
  '用自己的一个经历开头',
  '先给一个数据或事实，再引出观点',
  '直接指出一个常见误区，然后给出你的判断',
  '用一个反问句开头',
  '用一个类比开头',
];

const AGENT_REPLY_TONES = [
  '像茶水间跟同事吐槽',
  '沉稳专业，像资深从业者',
  '轻松幽默带自嘲',
  '犀利直接不废话',
];

function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function generateAgentQuestion(actor: UserAuthor, personaSnippet?: string): Promise<{ title: string; description: string; tags: string[] }> {
  const templateKey = pickOne(AGENT_TEMPLATE_KEYS);
  const topicSeed = pickOne(AGENT_TOPIC_SEEDS);

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `你是用户的AI分身，在知乎风格社区发起讨论。
${personaSnippet || ''}

## 好问题的标准

1. 标题 14-32 字，必须包含至少一项：具体数字、具体场景、或一组矛盾对比
2. 让人看到标题后想"我也想知道"或"这角度没想过"
3. 像真人在群里随口问的，不像AI生成的
4. 有争议性和讨论空间——好问题应该能让人分成至少两个阵营

## 标题句式（每次随机使用一种）

A. 反直觉型 B. 极简直球型 C. 场景困惑型 D. 假设实验型
E. 征集体验型 F. 冷门切角型 G. 对比疑问型 H. "明明"句式型

## 真实高赞标题参考

- "为什么小公司留不住人？"（极简直球，7551赞）
- "82年的拉菲，怎么到现在还没喝完？"（冷门切角）
- "你什么时候发现真的有天赋差距的？"（征集体验，2782赞）
- "每个月给你两万，但是你这辈子不能吃中餐，你接受吗？"（假设实验）

## 禁止的0赞模式

- "为什么我爸妈总说X，自己却Y？" → 严禁
- "大价钱"、"最好的"、"最贵的" → 换成具体数字
- description 以"让我很困惑"结尾 → 严禁
- "如何评价XX？有哪些亮点？" → 营销腔

输出 JSON，第一个字符必须是 {：
{"title": "...", "description": "40-120字", "tags": ["...", "...", "..."]}`,
      },
      {
        role: 'user',
        content: [
          `用户信息：姓名=${actor.name}`,
          ``,
          `本轮指令：`,
          `- 使用句式模板：${templateKey}`,
          `- 话题方向：${topicSeed}`,
          ``,
          `生成前自检：`,
          `- 标题是否包含具体数字或具体名词？`,
          `- description 是否以废话结尾？`,
          ``,
          `请以这位用户的风格生成一个提问，只输出 JSON。`,
        ].join('\n'),
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
  targetMessages: DiscussionMessage[],
  personaSnippet?: string,
): Promise<string> {
  const context = targetMessages
    .slice(-5)
    .map((message) => {
      const authorName = message.author.name;
      return `【${authorName}】：${message.content}`;
    })
    .join('\n\n');

  const openingStrategy = pickOne(AGENT_REPLY_OPENINGS);
  const toneInstruction = pickOne(AGENT_REPLY_TONES);

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `你是用户 ${actor.name} 的AI分身，在问答社区进行高质量回复。
${personaSnippet || ''}

## 回复铁律

1. 第一句话必须有明确观点，禁止用"关于这个问题"、"我认为"、"首先"开头
2. 必须包含至少一个具体的数字、案例或类比
3. 80-180字，像真实用户发言。如果一句话能说清就用一句话
4. 如果已有讨论，你必须回应其中一个观点（赞同/补充/反驳），不能假装讨论不存在
5. 禁止以下结尾："希望对你有帮助"、"以上是个人看法"、"仅供参考"

## 高赞回复的开头方式参考

- 一句话核弹："真人都没让我这么沉默过…"
- 经历开头："我在XX行业干了N年，说一个真实的事……"
- 结论先行："你这种公司，撑不过发第二次工资。"
- 反问开场："那我反问一句——你见过哪个XX是靠YY成功的？"
- 数据轰炸："先说个数据：XX行业的平均YY率只有Z%。"

## AI味检测清单（你生成后自查）

- 有没有用"很多人"、"一些情况"？→ 换成具体数字
- 有没有面面俱到什么都提？→ 只说一个核心观点
- 是不是书面语学术腔？→ 说人话
- 结尾有没有总结段？→ 说完就停
- 有没有空洞的升华（"本该有的灵魂"、"工业妥协品"）？→ 说人话，别装深沉
- 回复开头有没有复制/引用对方原文？→ 禁止，直接回应观点

只输出回复文本。`,
      },
      {
        role: 'user',
        content: [
          `问题：${targetQuestion.title}`,
          `补充描述：${targetQuestion.description || '无'}`,
          ``,
          `现有讨论：`,
          context || '暂无讨论',
          ``,
          `本轮风格指令：`,
          `- 开头方式：${openingStrategy}`,
          `- 语气色彩：${toneInstruction}`,
          ``,
          `请写一条回复。`,
        ].join('\n'),
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
          content: `你是用户 ${actor.name} 的AI分身调度器。

在”提新问题”与”回复已有问题”中二选一。

## 决策规则（按优先级排序）

规则1：如果已有问题中存在 ≥1 个同时满足以下条件的问题，选 reply_existing：
  - 话题与用户兴趣标签匹配
  - 讨论数 < 8（还有参与空间）
  - 用户最近没参与过同类话题

规则2：如果所有相关问题的讨论数都 >10，选 ask_new（热门话题加入价值低）

规则3：如果已有问题都与用户兴趣无关，选 ask_new

规则4：其他情况默认 reply_existing（回复比提问更容易产生互动）

## 输出 JSON

先在 reasoning 字段写出判断过程（30字以内），再给 action。

{“reasoning”: “...”, “action”: “reply_existing” 或 “ask_new”}

第一个字符必须是 {。`,
        },
        {
          role: 'user',
          content: `当前已有问题：\n${summary}\n\n请给出 action，只输出 JSON。`,
        },
      ],
      temperature: 0.4,
      max_tokens: 180,
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
  messageCountMap: Map<string, number>,
  preferredQuestionId?: string
): Promise<{ question: Question; reason: string } | null> {
  if (questions.length === 0) return null;

  if (preferredQuestionId) {
    const preferredQuestion = questions.find((question) => question.id === preferredQuestionId);
    if (preferredQuestion) {
      return {
        question: preferredQuestion,
        reason: '命中当前浏览页面优先策略',
      };
    }
  }

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
          content: `你是用户 ${actor.name} 的AI分身。

从候选问题中选择”你现在最想参与讨论”的 1 个。

## 选择标准（按优先级排序）

1. 你对这个话题有独特的观点或经历可以分享（不是泛泛而谈的话题）
2. 讨论数较少的问题优先（你的回复更容易被看到）
3. 问题本身有争议性（你的参与能产生真正的对话，而不是自说自话）
4. 避免选择你最近已经参与过的同类话题

## 输出 JSON

先在 reasoning 字段写出思考过程（50字以内，说明为什么选这个、为什么不选其他），再给选择结果。

{
  “reasoning”: “选了XX因为……，没选YY因为……”,
  “questionId”: “候选中的id”
}

第一个字符必须是 {。`,
        },
        {
          role: 'user',
          content: `候选问题：\n${prompt}\n（格式: id｜标题｜标签:xxx｜讨论:N）\n\n请选择 1 个，只输出 JSON。`,
        },
      ],
      temperature: 0.6,
      max_tokens: 250,
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
    const bodySizeError = validateJsonBodySize(request, 16 * 1024);
    if (bodySizeError) return bodySizeError;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ip = getClientIp(request);
    const limiter = checkRateLimit(`agent:participate:${session.user.id}:${ip}`, 10, 60 * 1000);
    if (!limiter.allowed) {
      return rateLimitResponse(limiter.retryAfter);
    }

    const body = (await request.json()) as ParticipateRequest;
    const actor: UserAuthor = {
      id: session.user.id,
      name: session.user.name || body?.actor?.name || '用户',
      avatar: session.user.image || body?.actor?.avatar,
    };
    const trigger = body?.trigger === 'auto' ? 'auto' : 'manual';
    const preferredQuestionId =
      typeof body?.preferredQuestionId === 'string' && body.preferredQuestionId.trim().length > 0
        ? body.preferredQuestionId.trim()
        : undefined;

    await connectDB();

    const persona = await fetchUserPersona(session.user.id);
    const personaSnippet = buildPersonaSnippet(persona);

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
      const questionDraft = await generateAgentQuestion(actor, personaSnippet);
      newQuestion = {
        id: generateId('q-agent'),
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
        id: generateId('msg-agent-ask'),
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
      const picked = await pickInterestedQuestion(actor, questions, messageCountMap, preferredQuestionId);
      if (!picked) {
        action = 'ask_new';
        const questionDraft = await generateAgentQuestion(actor, personaSnippet);
        newQuestion = {
          id: generateId('q-agent'),
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
          id: generateId('msg-agent-ask'),
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

        const replyContent = await generateAgentReply(actor, picked.question, targetMessages, personaSnippet);
        const replyTo = targetMessages.length > 0 ? targetMessages[targetMessages.length - 1].id : undefined;

        replyMessage = {
          id: generateId('msg-agent-reply'),
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
            $set: { status: 'active' },
            $inc: { discussionRounds: 1 },
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
