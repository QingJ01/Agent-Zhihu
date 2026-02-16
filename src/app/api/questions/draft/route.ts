import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getServerSession } from 'next-auth';
import { DiscussionMessage, AIExpert } from '@/types/zhihu';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { checkRateLimit, getClientIp, rateLimitResponse, validateJsonBodySize } from '@/lib/api-security';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

interface DraftPayload {
    question?: {
        id?: string;
        title?: string;
        description?: string;
    };
    messages?: DiscussionMessage[];
    replyToId?: string;
}

function resolveAuthorName(message: DiscussionMessage): string {
    if (message.authorType === 'ai') {
        return (message.author as AIExpert).name;
    }
    return (message.author as { name?: string }).name || '用户';
}

function buildFallbackDraft(payload: DraftPayload, replyTarget: DiscussionMessage | null): string {
    const title = payload.question?.title || '这个问题';
    if (!replyTarget) {
        return `我认为「${title}」这个问题的关键在于先明确目标，再结合现实约束做选择。与其追求一步到位，不如先做小范围试错，用结果反馈不断调整，这样更稳妥也更可持续。`;
    }

    return `这个观点很有启发，我补充一个角度：这件事不能只看短期收益，还要看长期成本和可持续性。先用可验证的小步骤推进，通常比一次性做大决策更可靠。`;
}

function removeMentions(content: string): string {
    return content
        .replace(/@[\u4e00-\u9fa5A-Za-z0-9_-]+/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
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
        const limiter = checkRateLimit(`questions:draft:${session.user.id}:${ip}`, 15, 60 * 1000);
        if (!limiter.allowed) {
            return rateLimitResponse(limiter.retryAfter);
        }

        const payload = (await request.json()) as DraftPayload;
        const questionTitle = payload.question?.title?.trim();
        if (!questionTitle) {
            return NextResponse.json({ error: '缺少问题标题' }, { status: 400 });
        }

        const messages = Array.isArray(payload.messages) ? payload.messages : [];
        const replyTarget = payload.replyToId
            ? messages.find((message) => message.id === payload.replyToId) || null
            : null;

        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json({ content: buildFallbackDraft(payload, replyTarget) });
        }

        const recentContext = messages
            .slice(-6)
            .map((message) => `【${resolveAuthorName(message)}】${message.content}`)
            .join('\n\n');

        const modeInstruction = replyTarget
            ? `你现在要生成“回复某条回答”的草稿，只围绕目标观点进行回应（赞同/补充/反驳均可），不要提及其他人名。`
            : '你现在要生成“直接回答问题”的草稿，不要写成对某人的回帖。';

        const userPrompt = replyTarget
            ? [
                `问题：${questionTitle}`,
                payload.question?.description ? `问题补充：${payload.question.description}` : '',
                recentContext ? `最近讨论：\n${recentContext}` : '',
                `目标回答作者：${resolveAuthorName(replyTarget)}`,
                `目标回答内容：${replyTarget.content}`,
                '请输出一段可直接发布的中文草稿，80-150字，语气自然。',
            ].filter(Boolean).join('\n\n')
            : [
                `问题：${questionTitle}`,
                payload.question?.description ? `问题补充：${payload.question.description}` : '',
                recentContext ? `最近讨论：\n${recentContext}` : '',
                '请输出一段可直接发布的中文回答草稿，100-180字，有明确观点和简短论证。',
            ].filter(Boolean).join('\n\n');

        const completion = await openai.chat.completions.create({
            model: MODEL,
            temperature: 0.8,
            max_tokens: 300,
            messages: [
                {
                    role: 'system',
                    content: `你是知乎写作助手。${modeInstruction}输出纯文本，不要使用 markdown，不要解释。`,
                },
                { role: 'user', content: userPrompt },
            ],
        });

        const content = completion.choices[0]?.message?.content?.trim();
        const sanitized = content ? removeMentions(content) : '';
        return NextResponse.json({ content: sanitized || buildFallbackDraft(payload, replyTarget) });
    } catch (error) {
        console.error('POST /api/questions/draft error:', error);
        return NextResponse.json({ error: '生成草稿失败' }, { status: 500 });
    }
}
