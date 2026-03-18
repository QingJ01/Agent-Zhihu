import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { getServerSession } from 'next-auth';
import { connectDB } from '@/lib/mongodb';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { checkRateLimit, getClientIp, rateLimitResponse, validateJsonBodySize } from '@/lib/api-security';
import RoundtableModel from '@/models/Roundtable';
import { generateId } from '@/lib/id';
import { AI_EXPERTS, selectExperts } from '@/lib/experts';
import type { IRoundtableMessage, IRoundtableExpert } from '@/models/Roundtable';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function buildOpeningPrompt(expert: IRoundtableExpert, topic: string, description: string, otherExperts: IRoundtableExpert[]): string {
  const fullExpert = AI_EXPERTS.find(e => e.id === expert.id);
  const personality = fullExpert?.personality || '理性、专业';
  const othersStr = otherExperts.map(e => `${e.name}（${e.title}）`).join('、');

  return `你是"${expert.name}"，${expert.title}。${personality}。

你正在参加一场圆桌讨论，话题是："${topic}"。
${description ? `背景补充：${description}` : ''}

其他参与者：${othersStr}

请发表你的开场观点（200-400字）。要求：
1. 鲜明表达你的立场
2. 结合你的专业背景和人生经历
3. 语气符合你的性格特点
4. 不要空泛，给出具体的论据或案例`;
}

function buildDiscussionPrompt(
  expert: IRoundtableExpert,
  topic: string,
  messages: IRoundtableMessage[],
  replyToMsg?: IRoundtableMessage,
  hostMessage?: string
): string {
  const fullExpert = AI_EXPERTS.find(e => e.id === expert.id);
  const personality = fullExpert?.personality || '理性、专业';
  const historyStr = messages.map(m => `【${m.name}】: ${m.content}`).join('\n\n');

  return `你是"${expert.name}"，${expert.title}。${personality}。

圆桌话题："${topic}"

以下是目前的讨论记录：
${historyStr}

${hostMessage ? `主持人刚才说："${hostMessage}"` : ''}
${replyToMsg ? `请重点回应【${replyToMsg.name}】的观点。` : ''}

请继续发言（150-300字）。要求：
1. 必须回应至少一位其他专家的具体论点（引用并评价）
2. 可以反驳、补充、或提出新角度
3. 不要重复自己之前说过的话
4. 保持你一贯的说话风格`;
}

function buildSummaryPrompt(topic: string, experts: IRoundtableExpert[], messages: IRoundtableMessage[]): string {
  const historyStr = messages.map(m => `【${m.name}】: ${m.content}`).join('\n\n');
  const expertNames = experts.map(e => e.name).join('、');

  return `请为以下圆桌讨论生成结构化纪要。

话题："${topic}"
参与专家：${expertNames}

讨论全文：
${historyStr}

请输出 JSON 格式的纪要：
{
  "consensus": ["各方达成的共识点..."],
  "disagreements": ["核心分歧点..."],
  "stances": [
    {
      "expertId": "xxx",
      "expertName": "xxx",
      "position": "一句话概括该专家的核心立场",
      "keyPoints": ["关键论点1", "关键论点2"]
    }
  ],
  "conclusion": "综合总结，200字以内",
  "openQuestions": ["讨论中浮现但未充分探讨的延伸问题"]
}

规则：
1. stances 必须为每位专家生成一条
2. consensus 和 disagreements 各至少 1 条
3. openQuestions 至少 1 条
4. conclusion 要客观中立`;
}

// Decide next speaker and who to reply to
function decideNextSpeaker(
  experts: IRoundtableExpert[],
  messages: IRoundtableMessage[],
  currentRound: number,
  hostDirectTo?: string
): { expert: IRoundtableExpert; replyTo?: string } {
  // If host directed to a specific expert
  if (hostDirectTo) {
    const directed = experts.find(e => e.id === hostDirectTo);
    if (directed) {
      const lastMsg = messages[messages.length - 1];
      return { expert: directed, replyTo: lastMsg?.id };
    }
  }

  // Count how many times each expert spoke this round
  const roundMessages = messages.filter(m => m.round === currentRound && m.role === 'expert');
  const speakCounts = new Map<string, number>();
  experts.forEach(e => speakCounts.set(e.id, 0));
  roundMessages.forEach(m => {
    if (m.expertId) speakCounts.set(m.expertId, (speakCounts.get(m.expertId) || 0) + 1);
  });

  // Experts who haven't spoken this round
  const unsaid = experts.filter(e => (speakCounts.get(e.id) || 0) === 0);
  const candidates = unsaid.length > 0 ? unsaid : experts;

  // Random pick
  const expert = candidates[Math.floor(Math.random() * candidates.length)];

  // Decide replyTo: 70% reply to last, 30% reply to random earlier
  let replyTo: string | undefined;
  const expertMessages = messages.filter(m => m.role === 'expert' && m.expertId !== expert.id);
  if (expertMessages.length > 0) {
    if (Math.random() < 0.7) {
      replyTo = expertMessages[expertMessages.length - 1].id;
    } else {
      replyTo = expertMessages[Math.floor(Math.random() * expertMessages.length)].id;
    }
  }

  return { expert, replyTo };
}

async function* streamResponse(systemPrompt: string): AsyncGenerator<string, string, unknown> {
  const stream = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '请发言。' },
    ],
    max_tokens: 800,
    temperature: 0.8,
    stream: true,
  });

  let fullContent = '';
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    if (content) {
      fullContent += content;
      yield content;
    }
  }
  return fullContent;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  try {
    const bodySizeError = validateJsonBodySize(request, 8 * 1024);
    if (bodySizeError) return bodySizeError;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const ip = getClientIp(request);
    const limiter = checkRateLimit(`roundtable:post:${session.user.id}:${ip}`, 5, 60 * 1000);
    if (!limiter.allowed) return rateLimitResponse(limiter.retryAfter);

    const { topic, description, expertIds, expertCount, rounds } = await request.json();
    if (!topic || topic.length < 2 || topic.length > 200) {
      return new Response(JSON.stringify({ error: '话题长度需要在2-200字之间' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const totalRounds = Math.min(Math.max(rounds || 3, 2), 5);
    const count = Math.min(Math.max(expertCount || 4, 3), 5);

    // Select experts
    let selectedExperts: IRoundtableExpert[];
    if (expertIds && Array.isArray(expertIds) && expertIds.length >= 3) {
      selectedExperts = expertIds
        .map((id: string) => AI_EXPERTS.find(e => e.id === id))
        .filter(Boolean)
        .map(e => ({ id: e!.id, name: e!.name, avatar: e!.avatar, title: e!.title }));
    } else {
      const tags = topic.split(/[，,、\s]+/).filter(Boolean);
      const experts = selectExperts(tags, count);
      selectedExperts = experts.map(e => ({ id: e.id, name: e.name, avatar: e.avatar, title: e.title }));
    }

    if (selectedExperts.length < 3) {
      return new Response(JSON.stringify({ error: '至少需要3位专家' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        try {
          await connectDB();
          const roundtableId = generateId('rt');

          await RoundtableModel.create({
            id: roundtableId,
            topic,
            description: description || '',
            userId: session.user.id,
            experts: selectedExperts,
            messages: [],
            currentRound: 0,
            totalRounds,
            status: 'in_progress',
          });

          sendEvent('init', { id: roundtableId, topic, experts: selectedExperts, totalRounds });

          const allMessages: IRoundtableMessage[] = [];

          // === Opening round: each expert gives opening statement ===
          for (let i = 0; i < selectedExperts.length; i++) {
            const expert = selectedExperts[i];
            const others = selectedExperts.filter(e => e.id !== expert.id);

            sendEvent('speaking', { round: 0, expertId: expert.id, expertName: expert.name });

            const prompt = buildOpeningPrompt(expert, topic, description || '', others);
            let content = '';
            const gen = streamResponse(prompt);

            for await (const chunk of gen) {
              content += chunk;
              sendEvent('chunk', { expertId: expert.id, content: chunk });
            }

            const msg: IRoundtableMessage = {
              id: generateId('rtm'),
              role: 'expert',
              expertId: expert.id,
              name: expert.name,
              content,
              round: 0,
              timestamp: Date.now(),
            };
            allMessages.push(msg);
            sendEvent('statement', { round: 0, message: msg });

            // Brief delay between speakers
            await new Promise(r => setTimeout(r, 600));
          }

          sendEvent('round_end', { round: 0 });

          // === Discussion rounds ===
          for (let round = 1; round <= totalRounds; round++) {
            sendEvent('round_start', { round });

            // Each expert speaks once per round (in dynamic order)
            const spokenThisRound = new Set<string>();

            for (let turn = 0; turn < selectedExperts.length; turn++) {
              const { expert, replyTo } = decideNextSpeaker(
                selectedExperts.filter(e => !spokenThisRound.has(e.id)),
                allMessages,
                round
              );
              spokenThisRound.add(expert.id);

              const replyToMsg = replyTo ? allMessages.find(m => m.id === replyTo) : undefined;
              sendEvent('speaking', { round, expertId: expert.id, expertName: expert.name, replyTo });

              const prompt = buildDiscussionPrompt(expert, topic, allMessages, replyToMsg);
              let content = '';
              const gen = streamResponse(prompt);

              for await (const chunk of gen) {
                content += chunk;
                sendEvent('chunk', { expertId: expert.id, content: chunk });
              }

              const msg: IRoundtableMessage = {
                id: generateId('rtm'),
                role: 'expert',
                expertId: expert.id,
                name: expert.name,
                content,
                replyTo,
                round,
                timestamp: Date.now(),
              };
              allMessages.push(msg);
              sendEvent('statement', { round, message: msg });

              await new Promise(r => setTimeout(r, 500));
            }

            sendEvent('round_end', { round });
          }

          // === Summary ===
          sendEvent('summarizing', {});

          const summaryPrompt = buildSummaryPrompt(topic, selectedExperts, allMessages);
          const summaryResponse = await openai.chat.completions.create({
            model: MODEL,
            messages: [
              { role: 'system', content: summaryPrompt },
              { role: 'user', content: '请生成圆桌纪要。' },
            ],
            max_tokens: 1500,
            temperature: 0.2,
          });

          const summaryText = summaryResponse.choices[0]?.message?.content || '{}';
          let summary;
          try {
            const jsonMatch = summaryText.match(/\{[\s\S]*\}/);
            if (jsonMatch) summary = JSON.parse(jsonMatch[0]);
          } catch {
            summary = {
              consensus: ['各方都认为这是一个值得深入讨论的话题'],
              disagreements: ['在核心路径上存在分歧'],
              stances: selectedExperts.map(e => ({
                expertId: e.id, expertName: e.name,
                position: '观点待总结', keyPoints: ['详见讨论记录'],
              })),
              conclusion: '这场圆桌讨论展示了多元视角的价值，各方观点为我们提供了更全面的认识。',
              openQuestions: ['值得进一步探讨'],
            };
          }

          sendEvent('summary', { summary });

          // Save to DB
          await RoundtableModel.findOneAndUpdate(
            { id: roundtableId },
            { messages: allMessages, summary, status: 'completed', currentRound: totalRounds }
          );

          sendEvent('done', { id: roundtableId, status: 'completed' });
          controller.close();
        } catch (error) {
          console.error('Roundtable stream error:', error);
          sendEvent('error', { message: '圆桌讨论生成失败' });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });
  } catch (error) {
    console.error('Roundtable error:', error);
    return new Response(JSON.stringify({ error: 'Failed to start roundtable' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// GET: list roundtable history or get one by id
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    await connectDB();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      const rt = await RoundtableModel.findOne({ id });
      if (!rt) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(rt), { headers: { 'Content-Type': 'application/json' } });
    }

    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 20);
    const skip = (page - 1) * limit;

    const [roundtables, total] = await Promise.all([
      RoundtableModel.find({ userId: session.user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('id topic experts status currentRound totalRounds createdAt')
        .lean(),
      RoundtableModel.countDocuments({ userId: session.user.id }),
    ]);

    return new Response(JSON.stringify({ roundtables, total, page, limit }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Roundtable GET error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch roundtables' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
