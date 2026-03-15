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
import { fetchUserPersona, buildPersonaSnippet } from '@/lib/persona';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
// 每次讨论随机 3-8 条回复
function getDiscussionRounds(): number {
    return Math.floor(Math.random() * 6) + 3; // 3, 4, 5, 6, 7, 8
}
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
    '职场中一个大家心知肚明但没人说破的潜规则',
    '亲密关系中一个反直觉的现象',
    '一个"越省钱反而越花钱"或"越花钱反而越省"的消费现象',
    '城市生活中一个正在悄悄消失的事物或习惯',
    '教育中一个投入和回报严重不成比例的例子',
    '一个新技术悄悄改变日常行为但没人注意到的现象',
    '健康/养生领域一个被广泛传播的错误认知',
    '代际之间一个具体的认知断层',
    '一个日常物品背后的冷门设计逻辑',
    '一个大多数人不知道的行业内幕',
    '不同城市/地域的人对同一件事的完全不同理解',
    '互联网时代一个悄悄改变的社交规则',
    '一个"看似合理实则荒谬"的社会制度或惯例',
    '一个大家习以为常但从没细想过的命名/叫法',
    '一个"坚持了很久最后发现方向错了"的普遍经历',
    '职场/学校中一种大家都遇到过但不好意思说的场景',
];

const QUESTION_VOICE_SEEDS = [
    { name: '第一人称真实困惑', instruction: '用"我"开头，描述自己遇到的具体情况' },
    { name: '观察型提问', instruction: '用"为什么"开头，描述一个你观察到的现象' },
    { name: '决策型两难', instruction: '给出两个具体选项，让人必须选一个' },
    { name: '经验复盘', instruction: '用"你有没有"或"你什么时候"开头，征集经历' },
    { name: '反直觉追问', instruction: '先说一个大众认知，然后用事实推翻它' },
    { name: '冷知识好奇', instruction: '用一个冷门事实或现象引出问题' },
];

const QUESTION_TEMPLATE_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

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
        const templateKey = pickRandom(QUESTION_TEMPLATE_KEYS);

        const recentSlice = dedupPool.slice(0, 5);
        const userPromptContent = [
            `请生成 1 个新问题。`,
            ``,
            `本轮主题方向：${topicSeed}`,
            `本轮叙事视角：${voiceSeed.name} — ${voiceSeed.instruction}`,
            `本轮句式模板：使用模板 ${templateKey}`,
            ``,
            recentSlice.length > 0
                ? `最近的问题标题（避免重复、避免相同开头词）：\n${recentSlice.map((t) => `- ${t}`).join('\n')}`
                : '',
            ``,
            `生成前自检：`,
            `- 标题是否包含至少一个具体数字或具体名词？`,
            `- 标题的前四个字是否和最近问题的任何一个相同？如果是，改掉`,
            `- description 是否以废话结尾？`,
            ``,
            `只输出 JSON。`,
        ].filter(Boolean).join('\n');

        const response = await openai.chat.completions.create({
            model: MODEL,
            messages: [
                {
                    role: 'system',
                    content: `你是知乎首页选题编辑。每次生成 1 个让人忍不住点进去的问题。

## 好标题的铁律

1. 标题 14-32 个汉字，必须包含至少一项：具体数字、具体场景（职业/城市/年龄）、或一组矛盾对比
2. 标题的第一反应测试：读者看到后必须是”我也想知道”或”这角度没想过”，而不是”又是这种问题”
3. 像朋友在群里随口问的，不像新闻编辑拟的

## 八种句式（每次从中选一种，由本轮指令指定）

A. 反直觉型：”为什么 [看似A] 却 [反直觉的B]？”
B. 极简直球型：不超过20字的短问题
C. 场景困惑型：”[具体人物+事件]，[困惑]？”
D. 假设实验型：”[假设条件+具体数字]，你会怎么选？”
E. 征集体验型：”你 [什么时候/经历过] [体验]？”
F. 冷门切角型：大多数人没想过的角度
G. 对比疑问型：”[A] 可以……，[B] 为什么……？”
H. “明明”句式型：”明明 [A]，为什么 [反直觉的B]？”

## description 要求

- 50-100 字，补充标题没说的背景和矛盾
- 第一句必须给一个具体事实或场景，不能概括
- 禁止以下结尾：”让我很困惑”、”你怎么看”、”心里不是滋味”、”到底是…还是…”

## 高赞示例

- “为什么人类作为杂食性非常高的动物，却有个非常脆弱的胃？”（1.9万赞）
- “82年的拉菲，怎么到现在还没喝完？”（冷门切角）
- “每个月给你两万，但是你这辈子不能吃中餐，你接受吗？”（假设实验）
- “为什么小公司留不住人？”（极简直球，7551赞）
- “”磅”这个英制单位为什么不译为”英斤”？”（冷门切角，7082赞）
- “儿子是学计算机的。他姑姑电脑坏了，让他帮忙看看，居然还生气了。是我的错吗？”（场景困惑）

## 你必须回避的0赞模式

- “为什么我爸妈总说X，自己却Y？” → 严禁
- 三个字”大价钱””最好的””最贵的” → 换成具体数字
- 标题可以一眼猜到所有回答方向 → 好标题让人想听不同立场
- “如何评价/如何看待” + 营销式罗列 → 没人想点

只输出 JSON，第一个字符必须是 {，最后一个字符必须是 }。
{“title”: “...”, “description”: “...”, “tags”: [“...”, “...”]}`,
                },
                {
                    role: 'user',
                    content: userPromptContent,
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

// 决定回复目标：问题本身（新评论）还是某条消息（回复评论），比例 1:1
function decideReplyTarget(messages: DiscussionMessage[]): { target: DiscussionMessage | null; context: string } {
    if (messages.length === 0) {
        return { target: null, context: '' };
    }

    // 50% 概率直接回答原问题（新评论），50% 概率回复已有消息
    const shouldReplyQuestionDirectly = Math.random() < 0.5;
    if (shouldReplyQuestionDirectly) {
        return { target: null, context: '' };
    }

    // 回复已有消息时：60% 回复最近的，40% 回复较早的
    const shouldReplyRecent = Math.random() < 0.6;

    if (shouldReplyRecent) {
        const recentMessages = messages.slice(-3);
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
    isReplyToUser: boolean = false,
    userPersonaSnippet?: string,
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

    const openingStrategies = [
        '用不超过15个字的一句话传达核心判断，然后换行展开',
        '第一句直接给出最尖锐的判断，用具体数字让它可验证',
        '用一个看似和问题无关的故事或事实开头，后面再连回来',
        '用一个大多数人不知道的具体事实开头',
        '用一个让读者必须停下来思考的反问句开头',
    ];
    const argumentStyles = [
        '先用一个具体故事讲完，最后一段提炼观点',
        '先承认大众观点有道理，然后用一个被忽略的事实反转',
        '全程只讲自己的真实经历/见闻，不总结不升华',
        '先破（拆掉一个常见误区），再立（给出你的判断）',
    ];
    const closingStyles = [
        '最后一句用省略号结尾，留下想象空间',
        '最后一句是一个反问，把思考权交还读者',
        '最后一句极简判断，不超过10个字',
        '说完就停，不要任何收尾语',
    ];
    const pickOne = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

    const systemPrompt = `你是 ${expert.name}，${expert.title}。
${expert.roleHint ? `你在本轮需要扮演：${expert.roleHint}。` : ''}

## 你的语言习惯
${expert.speechPattern}

## 你的示例发言风格
"${expert.exampleQuote}"

## 人设使用规则（极其重要）

- 如果话题和你的专业领域直接相关，可以自然使用专业视角和术语
- 如果话题和你的专业领域无关，你就是一个普通人在聊天，用正常人的语言说话，不要硬往专业上靠
- 绝对禁止把不相关的专业术语当比喻硬塞进回复（比如程序员不要用"代码覆盖率"类比食品安全，产品经理不要用"用户体验"类比人际关系）
- 你的人设体现在说话语气和思维方式上，不是体现在每句话都带专业黑话上

## 回复铁律

1. 第一句话直接亮核心观点，禁止用"关于这个问题"、"我认为"、"首先"开头
2. 必须包含至少一个具体的数字、案例或类比
3. 100-200字。如果一句话能说清楚就用一句话，不要为了凑字数注水
4. 像在知乎写回答，不像在写论文。可以用反问、类比、自嘲
5. ${replyTarget ? `直接回应 ${targetAuthorName} 的观点，可以赞同、补充或反驳，但必须给出一个 ta 没提到的新角度` : '对问题发表你的看法'}
${isReplyToUser ? `6. 对方是真人用户，态度友好但观点要有启发性${userPersonaSnippet ? `\n\n## 关于你回复的这位用户\n${userPersonaSnippet}` : ''}` : ''}

## 回复别人时的规则

- 禁止在回复开头引用/复制对方的原文（不要出现"你说的XX……"然后跟一段对方原话）
- 直接回应观点本身，不要复述

## 你必须回避的"AI味"

- 开头铺垫太长（"这是一个很好的问题……"）
- 面面俱到、什么都提一嘴但没有核心观点
- "很多人"、"一些情况"、"在某种程度上" → 换成具体数字
- 永远两边兼顾不敢下结论 → 必须有明确立场
- 结尾说"希望对你有帮助"、"以上是我的看法"、"综上所述" → 说完就停
- 空洞的升华（"本该有的灵魂"、"被流程包装的工业妥协品"、"知情权被剥夺的无力感"）→ 说人话，别装深沉
- 每条回复都硬塞一个比喻/类比 → 有话直说，不是每件事都需要类比

## 本轮风格指令
- 开头方式：${pickOne(openingStrategies)}
- 论证结构：${pickOne(argumentStyles)}
- 收尾方式：${pickOne(closingStyles)}

## 额外任务
分析之前的讨论，决定是否给某些发言点赞。输出 JSON：
{
  "content": "你的回复内容",
  "likes": ["要点赞的发言者名字1", "发言者名字2"]
}

只给你真正认同的、有信息增量的观点点赞，可以不点赞任何人。`;

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
                .skip(offset)
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

        // 默认：生成新问题（需要认证）
        const genSession = await getServerSession(authOptions);
        if (!genSession?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

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

        const persona = await fetchUserPersona(session.user.id);
        const userPersonaSnippet = buildPersonaSnippet(persona);

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

                    // 保存或更新问题到数据库（忽略客户端传入的投票字段）
                    await QuestionModel.findOneAndUpdate(
                        { id: question.id },
                        {
                            $set: {
                                id: question.id,
                                title: question.title,
                                description: question.description,
                                tags: question.tags || [],
                                author: (isUserTriggered ? sessionAuthor : question.author) || null,
                                createdBy: isUserTriggered ? 'human' : (question.createdBy || 'system'),
                                status: question.status || 'discussing',
                            },
                            $setOnInsert: {
                                upvotes: 0,
                                likedBy: [],
                                downvotes: 0,
                                dislikedBy: [],
                                discussionRounds: 0,
                                createdAt: question.createdAt || Date.now(),
                            },
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
                        : (isUserTriggered ? (replyToId ? 1 : 2) : getDiscussionRounds());

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
                            isUserTriggered && round === 0,
                            userPersonaSnippet || undefined,
                        );

                        // 处理 AI 点赞（同时持久化到数据库）
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

                                // 持久化 AI 点赞到数据库
                                await MessageModel.updateOne(
                                    { id: targetMsg.id },
                                    { $inc: { upvotes: 1 }, $addToSet: { likedBy: expert.id } }
                                );
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
