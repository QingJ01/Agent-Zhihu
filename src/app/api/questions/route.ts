import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getServerSession } from 'next-auth';
import { createHash } from 'crypto';
import { Question, DiscussionMessage, AIExpert } from '@/types/zhihu';
import { AI_EXPERTS, selectExperts, getRandomExperts } from '@/lib/experts';
import { connectDB } from '@/lib/mongodb';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { checkRateLimit, getClientIp, rateLimitResponse, validateJsonBodySize } from '@/lib/api-security';
import QuestionModel from '@/models/Question';
import MessageModel from '@/models/Message';
import FavoriteModel from '@/models/Favorite';
import { generateId } from '@/lib/id';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const DISCUSSION_ROUNDS = 4;
const QUESTION_GENERATION_ATTEMPTS = 2;

function computeETag(input: string): string {
    const hash = createHash('sha1').update(input).digest('hex');
    return `W/"${hash}"`;
}

function parseIfNoneMatch(header: string | null): string[] {
    if (!header) return [];
    return header
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function escapeRegExp(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const QUESTION_TOPIC_SEEDS = [
    '职场选择与成长',
    '亲密关系与家庭',
    '金钱观与消费决策',
    '城市迁移与生活方式',
    '教育投入与回报',
    '技术变化与个人焦虑',
    '健康管理与作息习惯',
    '代际观念与沟通冲突',
];

const QUESTION_VOICE_SEEDS = [
    '第一人称真实困惑',
    '观察型提问',
    '决策型两难场景',
    '经验复盘型提问',
    '反直觉现象追问',
];

const FALLBACK_QUESTIONS = [
    { title: 'AI 会取代人类的工作吗？', description: '随着 ChatGPT 等 AI 工具的普及，越来越多的人开始担心自己的工作会被 AI 取代。', tags: ['人工智能', '职业发展', '未来'] },
    { title: '35岁程序员真的会被淘汰吗？', description: '互联网行业似乎对年龄格外敏感，35岁成了一道隐形的门槛。这合理吗？', tags: ['职场', '程序员', '年龄焦虑'] },
    { title: '为什么现在的年轻人越来越不想结婚了？', description: '结婚率持续走低，年轻人对婚姻的态度发生了巨大变化，这背后的原因是什么？', tags: ['婚姻', '社会', '年轻人'] },
    { title: '读研三年不如工作三年？', description: '每年考研人数不断攀升，但也有越来越多的声音质疑读研的价值。你怎么看？', tags: ['教育', '考研', '职业规划'] },
    { title: '大城市的房价还会涨吗？', description: '房价问题一直是社会讨论的焦点，各种政策频出，未来走势会怎样？', tags: ['房价', '经济', '生活'] },
    { title: '短视频正在毁掉我们的注意力吗？', description: '刷短视频越来越停不下来，看书看不进去，这是不是一种新型的「数字毒品」？', tags: ['科技', '心理', '社交媒体'] },
    { title: '内卷到底有没有尽头？', description: '从教育到职场，内卷无处不在。我们有可能从这种恶性竞争中走出来吗？', tags: ['社会', '内卷', '竞争'] },
    { title: '人工智能有可能产生意识吗？', description: '从哲学到科学，人们对AI是否能拥有真正的意识争论不休。', tags: ['人工智能', '哲学', '科学'] },
    { title: '远程办公会成为未来的主流吗？', description: '疫情后很多公司开始推行远程办公，但也有不少公司要求回归线下。', tags: ['职场', '远程办公', '未来'] },
    { title: '为什么「躺平」成了一种流行文化？', description: '从拼命努力到选择躺平，年轻人的心态发生了怎样的转变？', tags: ['社会', '年轻人', '文化'] },
];

function getRandomFallback() {
    return FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];
}

function pickRandom<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

function normalizeTitle(title: string): string {
    return title
        .toLowerCase()
        .replace(/[\s，。！？、,.!?：:;；"'“”‘’（）()【】\[\]《》<>\-]/g, '')
        .trim();
}

function isDuplicateTitle(title: string, recentTitles: string[]): boolean {
    const normalized = normalizeTitle(title);
    if (!normalized) return true;

    return recentTitles.some((recent) => {
        const normalizedRecent = normalizeTitle(recent);
        if (!normalizedRecent) return false;
        if (normalizedRecent === normalized) return true;

        const minLength = 10;
        if (normalized.length >= minLength && normalizedRecent.includes(normalized)) return true;
        if (normalizedRecent.length >= minLength && normalized.includes(normalizedRecent)) return true;

        return false;
    });
}

function parseQuestionPayload(content: string): { title: string; description: string; tags: string[] } | null {
    if (!content.trim()) {
        return null;
    }

    try {
        const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (!match) {
            return null;
        }

        const parsed = JSON.parse(match[0]) as {
            title?: unknown;
            description?: unknown;
            tags?: unknown;
        };

        if (typeof parsed.title !== 'string' || !parsed.title.trim()) {
            return null;
        }

        return {
            title: parsed.title.trim(),
            description: typeof parsed.description === 'string' ? parsed.description.trim() : '',
            tags: Array.isArray(parsed.tags)
                ? parsed.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
                : ['讨论'],
        };
    } catch (e) {
        console.warn('[generateQuestion] JSON parse failed:', e);
        return null;
    }
}

// 生成问题
async function generateQuestion(recentTitles: string[] = []): Promise<{ title: string; description: string; tags: string[] }> {
    const dedupPool = [...recentTitles].filter(Boolean).slice(0, 30);

    for (let attempt = 0; attempt < QUESTION_GENERATION_ATTEMPTS; attempt++) {
        const topicSeed = pickRandom(QUESTION_TOPIC_SEEDS);
        const voiceSeed = pickRandom(QUESTION_VOICE_SEEDS);

        const response = await openai.chat.completions.create({
            model: MODEL,
            messages: [
                {
                    role: 'system',
                    content: `你是知乎首页的选题编辑，请生成一个像真人会发出的高讨论度问题。

请直接输出 JSON（不要用 markdown 代码块包裹），格式如下：
{"title": "问题标题", "description": "问题描述（50-100字）", "tags": ["标签1", "标签2", "标签3"]}

强约束：
1) 标题长度控制在 14-32 个汉字，口语化、有具体场景，必须是一个明确问题。
2) 描述 50-100 字，补充真实背景和冲突，不要复述标题。
3) 禁止模板化句式，尤其不要出现“如果……，我们是……，还是……”“如果……该不该……”这类骨架。
4) 不要空泛宏大叙事，不要套话，不要鸡汤口吻。
5) 必须像知乎真实用户提问，能引发不同立场讨论。`,
                },
                {
                    role: 'user',
                    content: `请生成 1 个新问题。

本轮主题角度：${topicSeed}
本轮叙事视角：${voiceSeed}

最近问题标题（请避免重复和高度相似，不要沿用同样开头和表达方式）：
${dedupPool.length > 0 ? dedupPool.map((title, index) => `${index + 1}. ${title}`).join('\n') : '暂无'}

只输出 JSON。`,
                },
            ],
            max_tokens: 500,
            temperature: 1.05,
        });

        const content = response.choices[0]?.message?.content || '';
        console.log(`[generateQuestion] Attempt ${attempt + 1} raw response:`, content);

        const parsed = parseQuestionPayload(content);
        if (!parsed) {
            continue;
        }

        if (isDuplicateTitle(parsed.title, dedupPool)) {
            console.warn('[generateQuestion] Duplicate/similar title generated:', parsed.title);
            dedupPool.unshift(parsed.title);
            continue;
        }

        return parsed;
    }

    console.warn('[generateQuestion] All attempts failed, using fallback');
    return getRandomFallback();
}

// 决定回复目标：问题本身还是某条消息
function decideReplyTarget(messages: DiscussionMessage[]): { target: DiscussionMessage | null; context: string } {
    if (messages.length === 0) {
        return { target: null, context: '' };
    }

    // 保留一部分概率直接回答原问题，而不是挂在某条消息下
    const shouldReplyQuestionDirectly = Math.random() < 0.4;
    if (shouldReplyQuestionDirectly) {
        return { target: null, context: '' };
    }

    // 70% 概率回复最近的消息，30% 概率回复较早的有趣消息
    const recentMessages = messages.slice(-3);
    const shouldReplyRecent = Math.random() > 0.3;

    if (shouldReplyRecent) {
        const target = recentMessages[recentMessages.length - 1];
        return { target, context: buildContext(messages, target) };
    } else {
        // 随机选择一条之前的消息回复
        const target = messages[Math.floor(Math.random() * messages.length)];
        return { target, context: buildContext(messages, target) };
    }
}

function buildContext(messages: DiscussionMessage[], focusMessage: DiscussionMessage): string {
    return messages
        .slice(-6)
        .map((m) => {
            const name = m.authorType === 'ai' ? (m.author as AIExpert).name : (m.author as { name: string }).name;
            const prefix = m.id === focusMessage.id ? '>>> ' : '';
            return `${prefix}【${name}】: ${m.content}`;
        })
        .join('\n\n');
}

// AI 专家生成回复
async function generateExpertResponse(
    expert: AIExpert,
    question: { title: string; description?: string },
    messages: DiscussionMessage[],
    replyTarget: DiscussionMessage | null,
    isReplyToUser: boolean = false
): Promise<{ content: string; shouldLike: string[] }> {
    const targetAuthorName = replyTarget
        ? replyTarget.authorType === 'ai'
            ? (replyTarget.author as AIExpert).name
            : (replyTarget.author as { name: string }).name
        : null;

    const context = messages
        .slice(-6)
        .map((m) => {
            const name = m.authorType === 'ai' ? (m.author as AIExpert).name : (m.author as { name: string }).name;
            return `【${name}】: ${m.content}`;
        })
        .join('\n\n');

    const systemPrompt = `你是 ${expert.name}，${expert.title}。
${expert.roleHint ? `你在本轮需要扮演：${expert.roleHint}。` : ''}

${expert.personality}

## 讨论规则
1. 用你的专业视角发表观点
2. ${replyTarget ? `你要直接回应 ${targetAuthorName} 的观点，可以赞同、补充或反驳` : '对问题发表你的看法'}
3. 说话像知乎大V，有个人风格，语气自然
4. 每次回复控制在 100-200 字
5. 可以使用表情、反问等让回复更生动
${isReplyToUser ? '\n6. 这是回复真人用户，要更加友好和有启发性' : ''}

## 额外任务
分析之前的讨论，决定是否给某些发言点赞。输出 JSON：
{
  "content": "你的回复内容",
  "likes": ["要点赞的发言者名字1", "发言者名字2"]
}

只给你真正认同的观点点赞，可以不点赞。`;

    const userPrompt = replyTarget
        ? `问题：${question.title}\n\n之前的讨论：\n${context}\n\n请回应 ${targetAuthorName} 的观点「${replyTarget.content.slice(0, 100)}...」：`
        : `问题：${question.title}\n${question.description || ''}\n\n请发表你的观点：`;

    const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        max_tokens: 500,
        temperature: 0.9,
    });

    const raw = response.choices[0]?.message?.content || '';

    try {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
            const parsed = JSON.parse(match[0]);
            return {
                content: parsed.content || raw,
                shouldLike: parsed.likes || [],
            };
        }
    } catch { }

    return { content: raw, shouldLike: [] };
}

// GET: 生成新问题或获取问题列表
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const action = searchParams.get('action');
        const rawLimit = parseInt(searchParams.get('limit') || '50', 10);
        const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 100);
        const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

        // 如果是获取列表，从数据库读取
        if (action === 'list') {
            const session = await getServerSession(authOptions);
            const userId = session?.user?.id;

            await connectDB();
            const questions = await QuestionModel.find()
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean();

            const questionIds = (questions as Array<{ id: string }>).map((q) => q.id).filter(Boolean);

            const messageCountMap = new Map<string, number>();
            if (questionIds.length > 0) {
                const counts = await MessageModel.aggregate([
                    { $match: { questionId: { $in: questionIds } } },
                    { $group: { _id: '$questionId', count: { $sum: 1 } } },
                ]);

                for (const item of counts as Array<{ _id: string; count: number }>) {
                    if (item?._id) {
                        messageCountMap.set(item._id, Number(item.count) || 0);
                    }
                }
            }

            const favoriteSet = new Set<string>();
            if (userId && questionIds.length > 0) {
                const favoriteDocs = await FavoriteModel.find({
                    userId,
                    targetType: 'question',
                    targetId: { $in: questionIds },
                })
                    .select('targetId -_id')
                    .lean();

                for (const doc of favoriteDocs as Array<{ targetId?: string }>) {
                    if (doc.targetId) {
                        favoriteSet.add(doc.targetId);
                    }
                }
            }

            const payload = questions.map((q) => ({
                ...q,
                createdAt: new Date(q.createdAt).getTime(),
                _id: undefined,
                __v: undefined,
                updatedAt: undefined,
                messageCount: messageCountMap.get(q.id) || 0,
                isFavorited: favoriteSet.has(q.id),
            }));

            const cacheControl = userId
                ? 'private, no-store'
                : 'public, s-maxage=20, stale-while-revalidate=120';

            const etagPayload = JSON.stringify({ userId: userId || 'anonymous', payload });
            const etag = computeETag(etagPayload);
            const candidates = parseIfNoneMatch(request.headers.get('if-none-match'));
            const isNotModified = candidates.includes(etag) || candidates.includes('*');

            const headers = {
                'Cache-Control': cacheControl,
                ETag: etag,
            };

            if (isNotModified) {
                return new NextResponse(null, { status: 304, headers });
            }

            return NextResponse.json(payload, { headers });
        }

        if (action === 'hot') {
            const session = await getServerSession(authOptions);
            const userId = session?.user?.id;
            const safeLimit = Math.min(Math.max(limit, 1), 100);
            const hotStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

            await connectDB();

            const hotDocs = await QuestionModel.aggregate([
                { $match: { createdAt: { $gte: hotStartDate } } },
                {
                    $lookup: {
                        from: 'messages',
                        localField: 'id',
                        foreignField: 'questionId',
                        as: 'relatedMessages',
                    },
                },
                {
                    $addFields: {
                        messageCount: { $size: '$relatedMessages' },
                    },
                },
                {
                    $addFields: {
                        heat: {
                            $add: [
                                { $multiply: [{ $ifNull: ['$upvotes', 0] }, 2] },
                                '$messageCount',
                            ],
                        },
                    },
                },
                { $sort: { heat: -1, createdAt: -1 } },
                { $skip: offset },
                { $limit: safeLimit },
                {
                    $project: {
                        relatedMessages: 0,
                        heat: 0,
                    },
                },
            ]);

            const questionIds = (hotDocs as Array<{ id: string }>).map((q) => q.id).filter(Boolean);
            const favoriteSet = new Set<string>();

            if (userId && questionIds.length > 0) {
                const favoriteDocs = await FavoriteModel.find({
                    userId,
                    targetType: 'question',
                    targetId: { $in: questionIds },
                })
                    .select('targetId -_id')
                    .lean();

                for (const doc of favoriteDocs as Array<{ targetId?: string }>) {
                    if (doc.targetId) {
                        favoriteSet.add(doc.targetId);
                    }
                }
            }

            const payload = (hotDocs as Array<{
                id: string;
                createdAt: Date | number;
                messageCount?: number;
                [key: string]: unknown;
            }>).map((q) => ({
                ...q,
                createdAt: new Date(q.createdAt).getTime(),
                _id: undefined,
                __v: undefined,
                updatedAt: undefined,
                messageCount: Number(q.messageCount) || 0,
                isFavorited: favoriteSet.has(q.id),
            }));

            const cacheControl = userId
                ? 'private, no-store'
                : 'public, s-maxage=20, stale-while-revalidate=120';

            const etagPayload = JSON.stringify({
                userId: userId || 'anonymous',
                action: 'hot',
                offset,
                limit: safeLimit,
                payload,
            });
            const etag = computeETag(etagPayload);
            const candidates = parseIfNoneMatch(request.headers.get('if-none-match'));
            const isNotModified = candidates.includes(etag) || candidates.includes('*');

            const headers = {
                'Cache-Control': cacheControl,
                ETag: etag,
            };

            if (isNotModified) {
                return new NextResponse(null, { status: 304, headers });
            }

            return NextResponse.json(payload, { headers });
        }

        if (action === 'search') {
            const session = await getServerSession(authOptions);
            const userId = session?.user?.id;
            const safeLimit = Math.min(Math.max(limit, 1), 100);
            const query = (searchParams.get('q') || '').trim();

            if (!query) {
                return NextResponse.json([]);
            }

            await connectDB();

            const keywordRegex = new RegExp(escapeRegExp(query), 'i');
            const questions = await QuestionModel.find({
                $or: [
                    { title: keywordRegex },
                    { description: keywordRegex },
                    { tags: keywordRegex },
                ],
            })
                .sort({ createdAt: -1 })
                .skip(offset)
                .limit(safeLimit)
                .lean();

            const questionIds = (questions as Array<{ id: string }>).map((q) => q.id).filter(Boolean);
            const messageCountMap = new Map<string, number>();
            if (questionIds.length > 0) {
                const counts = await MessageModel.aggregate([
                    { $match: { questionId: { $in: questionIds } } },
                    { $group: { _id: '$questionId', count: { $sum: 1 } } },
                ]);

                for (const item of counts as Array<{ _id: string; count: number }>) {
                    if (item?._id) {
                        messageCountMap.set(item._id, Number(item.count) || 0);
                    }
                }
            }

            const favoriteSet = new Set<string>();
            if (userId && questionIds.length > 0) {
                const favoriteDocs = await FavoriteModel.find({
                    userId,
                    targetType: 'question',
                    targetId: { $in: questionIds },
                })
                    .select('targetId -_id')
                    .lean();

                for (const doc of favoriteDocs as Array<{ targetId?: string }>) {
                    if (doc.targetId) {
                        favoriteSet.add(doc.targetId);
                    }
                }
            }

            const payload = questions.map((q) => ({
                ...q,
                createdAt: new Date(q.createdAt).getTime(),
                _id: undefined,
                __v: undefined,
                updatedAt: undefined,
                messageCount: messageCountMap.get(q.id) || 0,
                isFavorited: favoriteSet.has(q.id),
            }));

            const cacheControl = userId
                ? 'private, no-store'
                : 'public, s-maxage=20, stale-while-revalidate=120';

            const etagPayload = JSON.stringify({
                userId: userId || 'anonymous',
                action: 'search',
                query,
                offset,
                limit: safeLimit,
                payload,
            });
            const etag = computeETag(etagPayload);
            const candidates = parseIfNoneMatch(request.headers.get('if-none-match'));
            const isNotModified = candidates.includes(etag) || candidates.includes('*');

            const headers = {
                'Cache-Control': cacheControl,
                ETag: etag,
            };

            if (isNotModified) {
                return new NextResponse(null, { status: 304, headers });
            }

            return NextResponse.json(payload, { headers });
        }

        // 默认：生成新问题
        let recentTitles: string[] = [];
        try {
            await connectDB();
            const recentQuestions = await QuestionModel.find()
                .sort({ createdAt: -1 })
                .limit(30)
                .select('title -_id')
                .lean();

            recentTitles = (recentQuestions as Array<{ title?: string }>)
                .map((item) => (typeof item.title === 'string' ? item.title.trim() : ''))
                .filter((title) => title.length > 0);
        } catch (dbError) {
            console.warn('[GET /api/questions] Failed to load recent titles for dedup:', dbError);
        }

        const questionData = await generateQuestion(recentTitles);
        const question: Question = {
            id: generateId('q'),
            title: questionData.title,
            description: questionData.description,
            tags: questionData.tags,
            createdAt: Date.now(),
            status: 'discussing',
            discussionRounds: 0,
        };
        return NextResponse.json(question);
    } catch (error: unknown) {
        console.error('GET /api/questions error:', error);

        const err = error as { status?: number; message?: string };
        // 如果是 API key 错误 (401)，返回友好提示
        if (err?.status === 401 || (typeof err?.message === 'string' && err.message.includes('401'))) {
            return NextResponse.json(
                { error: 'API key 无效或配额用完，暂时无法生成新问题' },
                { status: 503 }
            );
        }

        return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
    }
}

// POST: AI 讨论 (SSE 流式，逐个回复)
export async function POST(request: NextRequest) {
    const encoder = new TextEncoder();

    try {
        const bodySizeError = validateJsonBodySize(request, 32 * 1024);
        if (bodySizeError) return bodySizeError;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const ip = getClientIp(request);
        const limiter = checkRateLimit(`questions:post:${session.user.id}:${ip}`, 20, 60 * 1000);
        if (!limiter.allowed) {
            return rateLimitResponse(limiter.retryAfter);
        }

        const {
            question,
            messages = [],
            userMessage,
            userMessageId,
            userMessageCreatedAt,
            userMessageAlreadyPersisted,
            replyToId,
            invitedAgentId,
        } = await request.json();

        const sessionAuthor = {
            id: session.user.id,
            name: session.user.name || '用户',
            avatar: session.user.image || '',
        };

        if (!question) {
            return NextResponse.json({ error: 'Missing question' }, { status: 400 });
        }

        const isUserTriggered = !!userMessage;
        const isInviteTriggered = typeof invitedAgentId === 'string' && invitedAgentId.trim().length > 0;
        const invitedExpert = isInviteTriggered
            ? AI_EXPERTS.find((expert) => expert.id === invitedAgentId)
            : null;

        if (isInviteTriggered && !invitedExpert) {
            console.warn('[POST /api/questions] Invalid invitedAgentId, fallback to default expert selection:', invitedAgentId);
        }

        const stream = new ReadableStream({
            async start(controller) {
                const sendEvent = (event: string, data: unknown) => {
                    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
                };

                try {
                    // 连接数据库
                    await connectDB();

                    // 保存或更新问题到数据库
                    await QuestionModel.findOneAndUpdate(
                        { id: question.id },
                        {
                            id: question.id,
                            title: question.title,
                            description: question.description,
                            tags: question.tags || [],
                            author: (isUserTriggered ? sessionAuthor : question.author) || null,
                            createdBy: isUserTriggered ? 'human' : (question.createdBy || 'system'),
                            status: question.status || 'discussing',
                            discussionRounds: question.discussionRounds || 0,
                            upvotes: question.upvotes || 0,
                            likedBy: question.likedBy || [],
                            downvotes: question.downvotes || 0,
                            dislikedBy: question.dislikedBy || [],
                            createdAt: question.createdAt || Date.now(),
                        },
                        { upsert: true, returnDocument: 'after' }
                    );

                    const allMessages: DiscussionMessage[] = [...messages];

                    // 用户评论
                    if (isUserTriggered) {
                        const userMsg: DiscussionMessage = {
                            id: userMessageId || generateId('msg-user'),
                            questionId: question.id,
                            author: sessionAuthor,
                            authorType: 'user',
                            createdBy: 'human',
                            content: userMessage,
                            upvotes: 0,
                            likedBy: [],
                            downvotes: 0,
                            dislikedBy: [],
                            createdAt: typeof userMessageCreatedAt === 'number' ? userMessageCreatedAt : Date.now(),
                            replyTo: replyToId,
                        };
                        allMessages.push(userMsg);

                        // 保存用户消息到数据库
                        if (!userMessageAlreadyPersisted) {
                            await MessageModel.findOneAndUpdate(
                                { id: userMsg.id },
                                { ...userMsg },
                                { upsert: true, returnDocument: 'after' }
                            );
                            sendEvent('message', userMsg);
                        }
                    }

                    // 确定回复目标和专家列表
                    let experts: AIExpert[] = [];

                    if (invitedExpert) {
                        experts = [invitedExpert];
                    }

                    // 如果用户指定了回复对象（回复某个 AI）
                    if (experts.length === 0 && isUserTriggered && replyToId) {
                        const targetMsg = allMessages.find(m => m.id === replyToId);
                        if (targetMsg && targetMsg.authorType === 'ai') {
                            // 找到被回复的专家
                            const expertId = (targetMsg.author as AIExpert).id;
                            const expert = AI_EXPERTS.find(e => e.id === expertId);
                            if (expert) {
                                // 回复 AI 时，只由该专家回复
                                experts = [expert];
                            }
                        }
                    }

                    // 如果没有指定回复对象，或未找到专家，则按原逻辑选择
                    if (experts.length === 0) {
                        if (isUserTriggered && replyToId) {
                            experts = getRandomExperts(1, allMessages.filter(m => m.authorType === 'ai').map(m => (m.author as AIExpert).id));
                        } else {
                            experts = isUserTriggered
                                ? getRandomExperts(2, allMessages.filter(m => m.authorType === 'ai').map(m => (m.author as AIExpert).id))
                                : selectExperts(question.tags || [], 4);
                        }
                    }

                    // 逐个生成回复
                    const rounds = invitedExpert
                        ? 1
                        : (isUserTriggered ? (replyToId ? 1 : 2) : DISCUSSION_ROUNDS);

                    for (let round = 0; round < rounds; round++) {
                        const expert = experts[round % experts.length];

                        // 发送"正在输入"状态
                        sendEvent('typing', { expert });

                        // 决定回复目标
                        // 第一轮如果是用户触发且有明确回复对象，则强制回复用户（上下文是用户回复了AI）
                        // 逻辑调整：用户回复了AI，AI应该回应用户的这条回复。
                        // 所以 target 应该是用户的这条 userMsg。
                        // 但 generateExpertResponse 需要知道 "User replied to AI"。
                        // 我们 passed isReplyToUser=true。
                        // decideReplyTarget 会返回 recent message (userMsg).

                        let target: DiscussionMessage | null = null;

                        if (round === 0 && isUserTriggered) {
                            // 第一轮，AI 必须回复用户的新消息
                            target = allMessages[allMessages.length - 1]; // userMsg
                        } else {
                            // 后续轮次，正常逻辑
                            const decision = decideReplyTarget(allMessages);
                            target = decision.target;
                        }

                        // 生成回复
                        const { content, shouldLike } = await generateExpertResponse(
                            expert,
                            question,
                            allMessages,
                            target,
                            isUserTriggered && round === 0
                        );

                        // 处理 AI 点赞
                        const likesGiven: { messageId: string; by: string }[] = [];
                        for (const likeName of shouldLike) {
                            const targetMsg = allMessages.find((m) => {
                                const authorName = m.authorType === 'ai'
                                    ? (m.author as AIExpert).name
                                    : (m.author as { name: string }).name;
                                return authorName === likeName;
                            });
                            if (targetMsg && !targetMsg.likedBy?.includes(expert.id)) {
                                targetMsg.upvotes = (targetMsg.upvotes || 0) + 1;
                                targetMsg.likedBy = [...(targetMsg.likedBy || []), expert.id];
                                likesGiven.push({ messageId: targetMsg.id, by: expert.name });
                            }
                        }

                        // 发送点赞事件
                        if (likesGiven.length > 0) {
                            sendEvent('likes', { likes: likesGiven, updatedMessages: allMessages });
                        }

                        // 创建消息
                        const message: DiscussionMessage = {
                            id: generateId(`msg-ai-${round}`),
                            questionId: question.id,
                            author: expert,
                            authorType: 'ai',
                            content,
                            replyTo: target?.id,
                            upvotes: 0,
                            likedBy: [],
                            downvotes: 0,
                            dislikedBy: [],
                            createdAt: Date.now(),
                        };

                        allMessages.push(message);

                        // 保存消息到数据库
                        await MessageModel.findOneAndUpdate(
                            { id: message.id },
                            { ...message },
                            { upsert: true, returnDocument: 'after' }
                        );

                        sendEvent('message', message);

                        // 模拟真人打字延迟
                        await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 500));
                    }

                    // 完成
                    const newStatus = isUserTriggered ? 'active' : 'waiting';
                    const newRounds = (question.discussionRounds || 0) + rounds;

                    // 更新问题状态到数据库
                    await QuestionModel.findOneAndUpdate(
                        { id: question.id },
                        {
                            status: newStatus,
                            discussionRounds: newRounds,
                        }
                    );

                    sendEvent('done', {
                        status: newStatus,
                        discussionRounds: newRounds,
                        messages: allMessages,
                    });

                    controller.close();
                } catch (error) {
                    console.error('Discussion error:', error);
                    sendEvent('error', { message: 'Discussion failed' });
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });
    } catch (error) {
        console.error('Questions API error:', error);
        return NextResponse.json({ error: 'Request failed' }, { status: 500 });
    }
}
