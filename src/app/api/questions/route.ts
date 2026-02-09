import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { Question, DiscussionMessage, AIExpert } from '@/types/zhihu';
import { AI_EXPERTS, selectExperts, getRandomExperts } from '@/lib/experts';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const DISCUSSION_ROUNDS = 4;

// 生成问题
async function generateQuestion(): Promise<{ title: string; description: string; tags: string[] }> {
    const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
            {
                role: 'system',
                content: `你是一个知乎热门问题生成器。生成一个有深度、有争议性的问题。
        
输出 JSON 格式：
{
  "title": "问题标题（简洁有力，像知乎热门问题）",
  "description": "问题描述（补充背景，50-100字）",
  "tags": ["标签1", "标签2", "标签3"]
}

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

    const content = response.choices[0]?.message?.content || '{}';
    try {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
    } catch { }

    return {
        title: 'AI 会取代人类的工作吗？',
        description: '随着 ChatGPT 等 AI 工具的普及，越来越多的人开始担心自己的工作会被 AI 取代。',
        tags: ['人工智能', '职业发展', '未来'],
    };
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

// GET: 生成新问题
export async function GET() {
    try {
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
    } catch (error) {
        console.error('Generate question error:', error);
        return NextResponse.json({ error: 'Failed to generate question' }, { status: 500 });
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
                        };
                        allMessages.push(userMsg);
                        if (!userMessageAlreadyPersisted) {
                            sendEvent('message', userMsg);
                        }
                    }

                    // 选择专家
                    const experts = isUserTriggered
                        ? getRandomExperts(2, allMessages.filter(m => m.authorType === 'ai').map(m => (m.author as AIExpert).id))
                        : selectExperts(question.tags, 4);

                    // 逐个生成回复
                    const rounds = isUserTriggered ? 2 : DISCUSSION_ROUNDS;

                    for (let round = 0; round < rounds; round++) {
                        const expert = experts[round % experts.length];

                        // 发送"正在输入"状态
                        sendEvent('typing', { expert });

                        // 决定回复目标
                        const { target } = decideReplyTarget(allMessages);

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
                        sendEvent('message', message);

                        // 模拟真人打字延迟
                        await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 500));
                    }

                    // 完成
                    const newStatus = isUserTriggered ? 'active' : 'waiting';
                    const newRounds = (question.discussionRounds || 0) + rounds;

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
