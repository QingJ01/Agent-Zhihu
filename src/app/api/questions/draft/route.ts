import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getServerSession } from 'next-auth';
import { DiscussionMessage, AIExpert } from '@/types/zhihu';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { checkRateLimit, getClientIp, rateLimitResponse, validateJsonBodySize } from '@/lib/api-security';
import { fetchUserPersona, buildPersonaSnippet } from '@/lib/persona';

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

        const persona = await fetchUserPersona(session.user.id);
        const personaSnippet = buildPersonaSnippet(persona);

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

        const isReplyMode = !!replyTarget;
        const draftStrategiesReply = [
            '先用一句话表明你对目标观点的态度（赞同/部分赞同/反对），然后给出一个 ta 没提到的新角度',
            '直接指出目标观点的一个逻辑漏洞或未考虑的情况，用一个具体例子说明',
            '承认目标观点的合理部分，然后用”但如果考虑到XX”进行转折',
            '用自己的亲身经历来回应目标观点，不做抽象评价',
        ];
        const draftStrategiesAnswer = [
            '用一个具体的个人经历或身边案例切入，从中提炼观点',
            '先给一个反常识的判断，然后用一个事实支撑',
            '用一个类比把问题翻译成更容易理解的语言',
            '先说结论，再给一个最有力的论据，然后停',
            '讲一个具体的故事，让读者自己得出结论',
        ];
        const toneInstructions = [
            '像在茶水间跟同事聊天，可以带点吐槽',
            '沉稳专业，像在写知乎专栏',
            '轻松幽默，偶尔自嘲',
            '犀利直接，不怕得罪人',
            '真诚恳切，像在给朋友写长消息',
        ];
        const pickSlot = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
        const draftStrategy = pickSlot(isReplyMode ? draftStrategiesReply : draftStrategiesAnswer);
        const toneInstruction = pickSlot(toneInstructions);

        const modeInstruction = isReplyMode
            ? `你要生成”回复某条回答”的草稿，围绕目标观点进行回应（赞同/补充/反驳均可），不要提及其他人名。`
            : `你要生成”直接回答问题”的草稿，不要写成对某人的回帖。`;

        const systemPrompt = `你是知乎用户的写作助手。${modeInstruction}
${personaSnippet ? `${personaSnippet}\n\n当上述用户个性画像存在时，你的草稿应体现该用户的说话方式和论证习惯。\n` : ''}
## 写作铁律

1. 第一句话必须有明确观点或态度，禁止用”关于这个问题”、”我觉得”、”首先”开头
2. 必须包含至少一个具体的数字、案例、亲身经历或类比
3. 像真人在知乎上发言，不像AI在生成文本。可以用口语化表达、反问、自嘲
4. 输出纯文本，不要 markdown、不要加粗、不要列表、不要编号
5. 禁止以下结尾：”希望对你有帮助”、”以上仅代表个人观点”、”仅供参考”、”你怎么看”

## 你要模仿的知乎高赞发言风格

短回复示例：”真人都没让我这么沉默过…”
观点型示例：”你这种公司，撑不过发第二次工资，而且最先崩溃的，一定是你这个创始人。”
经历型示例：”我练过三年吉他。不是随便弹弹，是认真练。每天练，买了书，跟了老师，记录进度。三年之后，我到了……”
类比型示例：”川普解锁了真正的MAGA方式：把中国当一个NPC。你可以假设自己是网游玩家……”

## 你必须回避的AI味

- “很多人认为……但实际上……” → 换成具体的人或事
- 面面俱到、什么都提一嘴 → 只说一个核心观点
- 书面语、学术腔 → 说人话
- 总结段 → 说完就停
- 空洞的升华（”本该有的XX”、”被XX包装的YY”、”XX的无力感”）→ 说人话，别装深沉
- 回复开头复制/引用对方原文 → 禁止，直接说你的观点

只输出草稿文本。`;

        const userPromptLines: string[] = [];
        userPromptLines.push(`问题：${questionTitle}`);
        if (payload.question?.description) userPromptLines.push(`问题补充：${payload.question.description}`);
        userPromptLines.push('');
        if (recentContext) {
            userPromptLines.push(`最近讨论：`);
            userPromptLines.push(recentContext);
            userPromptLines.push('');
        }
        if (replyTarget) {
            userPromptLines.push(`目标回答作者：${resolveAuthorName(replyTarget)}`);
            userPromptLines.push(`目标回答内容：${replyTarget.content}`);
            userPromptLines.push('');
            userPromptLines.push(`请输出一段可直接发布的中文草稿，80-150字，语气自然。`);
        } else {
            userPromptLines.push(`请输出一段可直接发布的中文回答草稿，100-180字，有明确观点和简短论证。`);
        }
        userPromptLines.push('');
        userPromptLines.push(`本轮风格指令：`);
        userPromptLines.push(`- 写作策略：${draftStrategy}`);
        userPromptLines.push(`- 语气色彩：${toneInstruction}`);

        const completion = await openai.chat.completions.create({
            model: MODEL,
            temperature: 0.85,
            max_tokens: 300,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPromptLines.join('\n') },
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
