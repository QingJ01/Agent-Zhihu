import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { Question, DiscussionMessage, AIExpert } from '@/types/zhihu';
import { AI_EXPERTS, selectExperts, getRandomExperts } from '@/lib/experts';
import { connectDB } from '@/lib/mongodb';
import QuestionModel from '@/models/Question';
import MessageModel from '@/models/Message';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const DISCUSSION_ROUNDS = 4;

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

// 生成问题
async function generateQuestion(): Promise<{ title: string; description: string; tags: string[] }> {
    const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
            {
                role: 'system',
                content: `你是一个知乎热门问题生成器。生成一个有深度、有争议性的问题。

请直接输出 JSON（不要用 markdown 代码块包裹），格式如下：
{"title": "问题标题", "description": "问题描述（50-100字）", "tags": ["标签1", "标签2", "标签3"]}

要求：
- 问题要有讨论价值，不是简单的事实问题
- 涉及科技、职场、人生、社会等热门话题
- 标题要像真人提问，有情感和好奇心`,
            },
            { role: 'user', content: '生成一个新的知乎热门问题' },
        ],
        max_tokens: 500,
        temperature: 1.0,
    });

    const content = response.choices[0]?.message?.content || '';
    console.log('[generateQuestion] LLM raw response:', content);

    if (!content.trim()) {
        console.warn('[generateQuestion] Empty LLM response, using fallback');
        return getRandomFallback();
    }

    try {
        // 先尝试去掉 markdown 代码块
        const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
            const parsed = JSON.parse(match[0]);
            // 校验 title 非空
            if (parsed.title && typeof parsed.title === 'string' && parsed.title.trim()) {
                return {
                    title: parsed.title.trim(),
                    description: (parsed.description || '').trim(),
                    tags: Array.isArray(parsed.tags) ? parsed.tags : ['讨论'],
                };
            }
            console.warn('[generateQuestion] Parsed JSON but title is empty:', parsed);
        }
    } catch (e) {
        console.warn('[generateQuestion] JSON parse failed:', e);
    }

    return getRandomFallback();
}

// 决定回复目标：问题本身还是某条消息
function decideReplyTarget(messages: DiscussionMessage[]): { target: DiscussionMessage | null; context: string } {
    if (messages.length === 0) {
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
        const limit = parseInt(searchParams.get('limit') || '50', 10);

        // 如果是获取列表，从数据库读取
        if (action === 'list') {
            await connectDB();
            const questions = await QuestionModel.find()
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean();

            return NextResponse.json(questions.map(q => ({
                ...q,
                _id: undefined,
                __v: undefined,
            })));
        }

        // 默认：生成新问题
        const questionData = await generateQuestion();
        const question: Question = {
            id: `q-${Date.now()}`,
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
        const {
            question,
            messages = [],
            userMessage,
            userId,
            userName,
            userAvatar,
            userMessageId,
            userMessageCreatedAt,
            userMessageAlreadyPersisted,
            replyToId,
        } = await request.json();

        if (!question) {
            return NextResponse.json({ error: 'Missing question' }, { status: 400 });
        }

        const isUserTriggered = !!userMessage;

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
                            author: question.author,
                            createdBy: question.createdBy || 'system',
                            status: question.status || 'discussing',
                            discussionRounds: question.discussionRounds || 0,
                            upvotes: question.upvotes || 0,
                            likedBy: question.likedBy || [],
                            createdAt: question.createdAt || Date.now(),
                        },
                        { upsert: true, returnDocument: 'after' }
                    );

                    const allMessages: DiscussionMessage[] = [...messages];

                    // 用户评论
                    if (isUserTriggered && userId) {
                        const userMsg: DiscussionMessage = {
                            id: userMessageId || `msg-${Date.now()}-user`,
                            questionId: question.id,
                            author: { id: userId, name: userName || '用户', avatar: userAvatar },
                            authorType: 'user',
                            createdBy: 'human',
                            content: userMessage,
                            upvotes: 0,
                            likedBy: [],
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

                    // 如果用户指定了回复对象（回复某个 AI）
                    if (isUserTriggered && replyToId) {
                        const targetMsg = allMessages.find(m => m.id === replyToId);
                        if (targetMsg && targetMsg.authorType === 'ai') {
                            // 找到被回复的专家
                            const expertId = (targetMsg.author as AIExpert).id;
                            const expert = AI_EXPERTS.find(e => e.id === expertId);
                            if (expert) {
                                // 强制该专家排在第一位
                                experts = [expert];
                                // 再随机选一个配合
                                const otherExperts = selectExperts(question.tags || [], 5).filter(e => e.id !== expertId);
                                if (otherExperts.length > 0) {
                                    experts.push(otherExperts[0]);
                                }
                            }
                        }
                    }

                    // 如果没有指定回复对象，或未找到专家，则按原逻辑选择
                    if (experts.length === 0) {
                        experts = isUserTriggered
                            ? getRandomExperts(2, allMessages.filter(m => m.authorType === 'ai').map(m => (m.author as AIExpert).id))
                            : selectExperts(question.tags || [], 4);
                    }

                    // 逐个生成回复
                    const rounds = isUserTriggered ? 2 : DISCUSSION_ROUNDS;

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
                            id: `msg-${Date.now()}-${round}`,
                            questionId: question.id,
                            author: expert,
                            authorType: 'ai',
                            content,
                            replyTo: target?.id,
                            upvotes: 0,
                            likedBy: [],
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
