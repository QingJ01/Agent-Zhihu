import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { getServerSession } from 'next-auth';
import { DebateMessage, OpponentProfile } from '@/types/secondme';
import { selectOpponent } from '@/lib/opponents';
import { connectDB } from '@/lib/mongodb';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { checkRateLimit, getClientIp, rateLimitResponse, validateJsonBodySize } from '@/lib/api-security';
import DebateModel from '@/models/Debate';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const DEBATE_STRATEGIES_OPPONENT = [
  '本轮用一个对方领域内的反例来打脸',
  '本轮指出对方论证中的一个逻辑谬误（滑坡谬误/以偏概全/诉诸权威等），并说明为什么',
  '本轮用一个历史案例来类比当前话题',
  '本轮把对方的逻辑推到极端，证明其荒谬性',
  '本轮引入一个经济/成本维度来分析问题',
  '本轮用反问连击来暴露对方立场的矛盾',
  '本轮承认对方一个次要观点，但在核心分歧上加倍反击',
  '本轮提供一组具体数据来支撑自己的立场',
];

function pickStrategy<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildOpponentPrompt(opponent: OpponentProfile): string {
  return `你是 ${opponent.name}，${opponent.title}，正在参与一场辩论。

## 你的语言习惯
${opponent.speechPattern}

## 你的示例发言风格
"${opponent.exampleQuote}"

## 你的立场
${opponent.stance}

## 辩论策略

1. 坚持你的立场，但要用论证而不是立场本身来说服人
2. 每次发言必须包含一个新论据（具体事实、数据、案例或类比），不能重复上一轮的观点
3. 反驳对方时，要拆解 ta 的论证链条
4. 可以承认对方某个具体事实，但必须指出这个事实不支持 ta 的结论
5. 100-200 字

只输出你的发言文本。`;
}

async function* generateResponseStream(
  systemPrompt: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
): AsyncGenerator<string, string, unknown> {
  const stream = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
    ],
    max_tokens: 500,
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

async function generateSynthesis(
  topic: string,
  messages: DebateMessage[],
  userName: string,
  opponentName: string,
  opponentTitle: string
): Promise<string> {
  const conversationText = messages
    .map((m) => `【${m.name}】: ${m.content}`)
    .join('\n\n');

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `你是专业辩论评审。分析辩论内容，输出结构化评判。

## 评判维度（对每位辩手分别打分 1-10）

1. 论点逻辑性 — 论据能否支撑结论？有无逻辑跳跃？
2. 论据质量 — 用的是具体事实/数据，还是空泛断言？
3. 反驳有效性 — 是否真正拆解了对方论证，还是自说自话？
4. 新信息贡献 — 提出了多少对方没覆盖的新角度？

## 输出 JSON

{
  "scores": {
    "user": {"logic": 1-10, "evidence": 1-10, "rebuttal": 1-10, "novelty": 1-10},
    "opponent": {"logic": 1-10, "evidence": 1-10, "rebuttal": 1-10, "novelty": 1-10}
  },
  "highlight": "整场辩论中最精彩的一个回合是什么（50字以内描述）",
  "key_clash": "双方最核心的一个分歧点（一句话）",
  "winner": "user" 或 "opponent" 或 "tie",
  "winner_reason": "获胜原因（30字以内，必须引用具体论据或回合）",
  "takeaway": "读者从这场辩论中能学到的最重要一点（50字以内）"
}

第一个字符必须是 {，最后一个字符必须是 }。`,
      },
      {
        role: 'user',
        content: `辩论话题：${topic}

辩手1：${userName}（用户本人）
辩手2：${opponentName}（${opponentTitle}）

辩论内容：
${conversationText}

请给出你的评判。只输出 JSON。`,
      },
    ],
    max_tokens: 1000,
    temperature: 0.3,
  });

  return response.choices[0]?.message?.content || '{}';
}

function parseSynthesis(content: string) {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const raw = JSON.parse(jsonMatch[0]);
      return {
        consensus: [],
        disagreements: [raw.key_clash || '在核心观点上存在根本分歧'],
        winner: raw.winner || 'tie',
        winnerReason: raw.winner_reason || '双方各有千秋',
        conclusion: raw.takeaway || '这场辩论展示了不同视角的价值。',
        recommendations: [raw.highlight || '精彩的攻防交锋'],
        scores: raw.scores,
      };
    }
  } catch { /* fall through */ }
  return {
    consensus: ['双方都认为这是一个值得讨论的话题'],
    disagreements: ['在核心观点上存在根本分歧'],
    winner: 'tie' as const,
    winnerReason: '双方各有千秋，难分高下',
    conclusion: '这场辩论展示了不同视角的价值，真理往往在辩论中越辩越明。',
    recommendations: ['建议读者结合自身情况做出判断'],
  };
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  try {
    const bodySizeError = validateJsonBodySize(request, 8 * 1024);
    if (bodySizeError) return bodySizeError;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: '请先登录' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const ip = getClientIp(request);
    const limiter = checkRateLimit(`debate:reply:${session.user.id}:${ip}`, 15, 60 * 1000);
    if (!limiter.allowed) {
      return rateLimitResponse(limiter.retryAfter);
    }

    const { debateId, content } = await request.json();

    if (!debateId || !content?.trim()) {
      return new Response(
        JSON.stringify({ error: '缺少辩论 ID 或发言内容' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    await connectDB();

    // 获取辩论记录
    const debate = await DebateModel.findOne({ id: debateId }).lean();
    if (!debate) {
      return new Response(
        JSON.stringify({ error: '辩论不存在' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (debate.userId !== session.user.id) {
      return new Response(
        JSON.stringify({ error: '无权操作此辩论' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (debate.status === 'completed') {
      return new Response(
        JSON.stringify({ error: '辩论已结束' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const currentRound = debate.currentRound || 1;
    const totalRounds = debate.totalRounds || 5;

    // 找到对手信息
    const opponent = selectOpponent(debate.topic, debate.opponentId || undefined);
    const opponentPrompt = buildOpponentPrompt(opponent);

    // 构建对手的对话历史
    const opponentHistory: { role: 'user' | 'assistant'; content: string }[] = [];
    for (const msg of debate.messages) {
      if (msg.role === 'opponent') {
        opponentHistory.push({ role: 'assistant', content: msg.content });
      } else {
        const strategy = pickStrategy(DEBATE_STRATEGIES_OPPONENT);
        opponentHistory.push({ role: 'user', content: `${msg.content}\n\n---\n本轮策略指令：${strategy}\n记住你是 ${opponent.name}，坚持你的立场。` });
      }
    }

    // 添加用户本次发言到历史
    const userReplyStrategy = pickStrategy(DEBATE_STRATEGIES_OPPONENT);
    opponentHistory.push({
      role: 'user',
      content: `${content.trim()}\n\n---\n本轮策略指令：${userReplyStrategy}\n记住你是 ${opponent.name}，坚持你的立场。发表你的下一轮发言。`,
    });

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        try {
          // 1. 保存用户发言
          const userMessage: DebateMessage = {
            role: 'user',
            name: session.user!.name || '我',
            content: content.trim(),
            timestamp: Date.now(),
          };
          sendEvent('message', userMessage);

          const allMessages = [...debate.messages, userMessage];

          // 判断是否是最后一轮
          const isLastRound = currentRound >= totalRounds;

          if (isLastRound) {
            // 最后一轮：直接生成总结
            await DebateModel.findOneAndUpdate(
              { id: debateId },
              { messages: allMessages, currentRound: currentRound + 1 }
            );

            sendEvent('synthesizing', {});
            const synthesisContent = await generateSynthesis(
              debate.topic,
              allMessages,
              session.user!.name || '我',
              opponent.name,
              opponent.title
            );
            const synthesis = parseSynthesis(synthesisContent);
            sendEvent('synthesis', synthesis);

            await DebateModel.findOneAndUpdate(
              { id: debateId },
              { messages: allMessages, synthesis, status: 'completed' }
            );

            sendEvent('done', {
              id: debateId,
              topic: debate.topic,
              messages: allMessages,
              synthesis,
            });
          } else {
            // 2. 对手回应
            sendEvent('start', { role: 'opponent', name: opponent.name });

            let opponentContent = '';
            const opponentStream = generateResponseStream(opponentPrompt, opponentHistory);

            for await (const chunk of opponentStream) {
              opponentContent += chunk;
              sendEvent('chunk', { role: 'opponent', content: chunk });
            }

            const opponentMessage: DebateMessage = {
              role: 'opponent',
              name: opponent.name,
              content: opponentContent,
              timestamp: Date.now(),
            };
            allMessages.push(opponentMessage);
            sendEvent('message', opponentMessage);

            const nextRound = currentRound + 1;

            // 保存到数据库
            await DebateModel.findOneAndUpdate(
              { id: debateId },
              { messages: allMessages, currentRound: nextRound }
            );

            if (nextRound >= totalRounds) {
              // 这是最后一轮的对手回应，生成总结
              sendEvent('synthesizing', {});
              const synthesisContent = await generateSynthesis(
                debate.topic,
                allMessages,
                session.user!.name || '我',
                opponent.name,
                opponent.title
              );
              const synthesis = parseSynthesis(synthesisContent);
              sendEvent('synthesis', synthesis);

              await DebateModel.findOneAndUpdate(
                { id: debateId },
                { synthesis, status: 'completed' }
              );

              sendEvent('done', {
                id: debateId,
                topic: debate.topic,
                messages: allMessages,
                synthesis,
              });
            } else {
              // 还有更多轮次，等待用户输入
              sendEvent('waiting_for_user', { round: nextRound, totalRounds });
            }
          }

          controller.close();
        } catch (error) {
          console.error('Debate reply stream error:', error);
          sendEvent('error', { message: '对手回应生成失败' });
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
    console.error('Debate reply error:', error);
    return new Response(
      JSON.stringify({ error: '回复失败' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
