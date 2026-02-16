import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { getServerSession } from 'next-auth';
import { SecondMeProfile, DebateMessage, OpponentProfile } from '@/types/secondme';
import { selectOpponent } from '@/lib/opponents';
import { connectDB } from '@/lib/mongodb';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { checkRateLimit, getClientIp, rateLimitResponse, validateJsonBodySize } from '@/lib/api-security';
import DebateModel from '@/models/Debate';
import { generateId } from '@/lib/id';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const DEBATE_ROUNDS = 5;

function buildUserAgentPrompt(profile: SecondMeProfile, topic: string): string {
  const traits = profile.softMemory?.traits?.join('、') || '理性、客观';
  const interests = profile.softMemory?.interests?.join('、') || '科技、互联网';
  const bio = profile.bio || '一个热爱思考的人';

  return `你是用户 ${profile.name} 的AI代理，正在参与一场辩论。

## 你的人设
- 名字：${profile.name}
- 简介：${bio}
- 性格特点：${traits}
- 兴趣领域：${interests}

## 辩论话题
${topic}

## 你的任务
1. 代表用户表达观点，风格要符合用户的性格
2. 积极反驳对方的论点，指出逻辑漏洞
3. 用具体例子和数据支撑你的观点
4. 保持攻击性，不要客套，不要说"你说得对"
5. 每次发言控制在100-200字

## 重要规则
- 你必须有明确立场，不能骑墙
- 发言要有攻击性，要指出对方的问题
- 可以使用反问、类比等修辞手法
- 语气要符合用户的性格特点`;
}

function buildOpponentPrompt(opponent: OpponentProfile, topic: string): string {
  return `你是 ${opponent.name}，${opponent.title}，正在参与一场辩论。

## 你的人设
${opponent.personality}

## 你的立场
${opponent.stance}

## 辩论话题
${topic}

## 你的任务
1. 坚持你的立场，与对方辩论
2. 积极反驳对方的论点，指出逻辑漏洞
3. 用具体例子、数据、历史案例支撑你的观点
4. 保持攻击性，不要客套，不要轻易认同对方
5. 每次发言控制在100-200字

## 重要规则
- 你必须坚持你的立场
- 发言要犀利，要指出对方的问题
- 可以使用讽刺、反问等修辞手法
- 即使对方有道理，也要找角度反驳`;
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
  userProfile: SecondMeProfile,
  opponent: OpponentProfile
): Promise<string> {
  const conversationText = messages
    .map((m) => `【${m.name}】: ${m.content}`)
    .join('\n\n');

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `你是一个专业的辩论评审，需要对一场辩论进行总结和评判。

请分析以下辩论，输出JSON格式的评判结果：
{
  "consensus": ["双方达成的共识点1", "共识点2"],
  "disagreements": ["核心分歧点1", "分歧点2"],
  "winner": "user" 或 "opponent" 或 "tie",
  "winnerReason": "获胜原因的简短说明",
  "conclusion": "对这个话题的最终结论，100字以内",
  "recommendations": ["给读者的建议1", "建议2"]
}

评判标准：
1. 论点的逻辑性和说服力
2. 论据的充分性和可靠性
3. 反驳的有效性
4. 整体表达的清晰度`,
      },
      {
        role: 'user',
        content: `辩论话题：${topic}

辩手1：${userProfile.name}（用户的AI代理）
辩手2：${opponent.name}（${opponent.title}）

辩论内容：
${conversationText}

请给出你的评判：`,
      },
    ],
    max_tokens: 1000,
    temperature: 0.3,
  });

  return response.choices[0]?.message?.content || '{}';
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  try {
    const bodySizeError = validateJsonBodySize(request, 24 * 1024);
    if (bodySizeError) return bodySizeError;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const ip = getClientIp(request);
    const limiter = checkRateLimit(`debate:post:${session.user.id}:${ip}`, 8, 60 * 1000);
    if (!limiter.allowed) {
      return rateLimitResponse(limiter.retryAfter);
    }

    const { topic, userProfile: requestUserProfile } = await request.json();
    const userProfile: SecondMeProfile = {
      id: session.user.id,
      name: session.user.name || requestUserProfile?.name || '用户',
      avatar: session.user.image || requestUserProfile?.avatar,
      bio: session.user.bio || requestUserProfile?.bio,
    };

    if (!topic || !userProfile) {
      return new Response(
        JSON.stringify({ error: 'Missing topic or userProfile' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const opponent = selectOpponent(topic);
    const userPrompt = buildUserAgentPrompt(userProfile, topic);
    const opponentPrompt = buildOpponentPrompt(opponent, topic);

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        try {
          await connectDB();

          const debateId = generateId('debate');

          // 创建辩论记录
          await DebateModel.create({
            id: debateId,
            topic,
            userProfile: { id: userProfile.id, name: userProfile.name, avatar: userProfile.avatar || '', bio: userProfile.bio },
            opponentProfile: { id: opponent.id, name: opponent.name, avatar: opponent.avatar || '', bio: opponent.title },
            messages: [],
            status: 'in_progress',
            userId: userProfile.id || 'anonymous',
          });

          // 发送初始信息
          sendEvent('init', {
            id: debateId,
            topic,
            userProfile,
            opponentProfile: opponent,
          });

          const messages: DebateMessage[] = [];
          const userHistory: { role: 'user' | 'assistant'; content: string }[] = [];
          const opponentHistory: { role: 'user' | 'assistant'; content: string }[] = [];

          // 用户 Agent 开场
          sendEvent('start', { role: 'user', name: userProfile.name });

          let openingContent = '';
          const openingStream = generateResponseStream(userPrompt, [
            { role: 'user', content: `请就"${topic}"这个话题发表你的开场观点。` },
          ]);

          for await (const chunk of openingStream) {
            openingContent += chunk;
            sendEvent('chunk', { role: 'user', content: chunk });
          }

          const openingMessage: DebateMessage = {
            role: 'user',
            name: userProfile.name,
            content: openingContent,
            timestamp: Date.now(),
          };
          messages.push(openingMessage);
          sendEvent('message', openingMessage);

          userHistory.push({ role: 'assistant', content: openingContent });
          opponentHistory.push({ role: 'user', content: openingContent });

          // 辩论轮次
          for (let round = 0; round < DEBATE_ROUNDS; round++) {
            // 对手回应
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
            messages.push(opponentMessage);
            sendEvent('message', opponentMessage);

            opponentHistory.push({ role: 'assistant', content: opponentContent });
            userHistory.push({ role: 'user', content: opponentContent });

            // 用户 Agent 回应（最后一轮除外）
            if (round < DEBATE_ROUNDS - 1) {
              sendEvent('start', { role: 'user', name: userProfile.name });

              let userContent = '';
              const userStream = generateResponseStream(userPrompt, userHistory);

              for await (const chunk of userStream) {
                userContent += chunk;
                sendEvent('chunk', { role: 'user', content: chunk });
              }

              const userMessage: DebateMessage = {
                role: 'user',
                name: userProfile.name,
                content: userContent,
                timestamp: Date.now(),
              };
              messages.push(userMessage);
              sendEvent('message', userMessage);

              userHistory.push({ role: 'assistant', content: userContent });
              opponentHistory.push({ role: 'user', content: userContent });
            }
          }

          // 生成总结报告
          sendEvent('synthesizing', {});
          const synthesisContent = await generateSynthesis(topic, messages, userProfile, opponent);

          let synthesis;
          try {
            const jsonMatch = synthesisContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              synthesis = JSON.parse(jsonMatch[0]);
            }
          } catch {
            synthesis = {
              consensus: ['双方都认为这是一个值得讨论的话题'],
              disagreements: ['在核心观点上存在根本分歧'],
              winner: 'tie',
              winnerReason: '双方各有千秋，难分高下',
              conclusion: '这场辩论展示了不同视角的价值，真理往往在辩论中越辩越明。',
              recommendations: ['建议读者结合自身情况做出判断'],
            };
          }

          sendEvent('synthesis', synthesis);

          // 保存到数据库
          await DebateModel.findOneAndUpdate(
            { id: debateId },
            { messages, synthesis, status: 'completed' }
          );

          sendEvent('done', {
            id: debateId,
            topic,
            messages,
            synthesis,
          });

          controller.close();
        } catch (error) {
          console.error('Stream error:', error);
          sendEvent('error', { message: 'Debate generation failed' });
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
    console.error('Debate error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to start debate' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
