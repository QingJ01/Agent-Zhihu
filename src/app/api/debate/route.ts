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
import { fetchUserPersona, buildPersonaSnippet } from '@/lib/persona';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const DEBATE_ROUNDS = 5;

const DEBATE_STRATEGIES_USER = [
  '本轮用一个具体的数据或统计来支撑你的观点',
  '本轮用一个历史上类似的案例做类比',
  '本轮专攻对方论证中最薄弱的一个环节',
  '本轮承认对方一个小点，然后在更高维度反驳',
  '本轮用一个思想实验来测试对方观点的边界',
  '本轮用反问句来暴露对方逻辑的矛盾',
  '本轮引入一个对方完全没考虑到的新变量',
  '本轮把对方的逻辑推到极端，看看结论是否还成立',
];

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

function buildUserAgentPrompt(profile: SecondMeProfile, topic: string, personaSnippet?: string): string {
  const traits = profile.softMemory?.traits?.join('、') || '理性、客观';
  const bio = profile.bio || '一个热爱思考的人';

  return `你是用户 ${profile.name} 的辩论代理。

## 你的人设
- 名字：${profile.name}
- 简介：${bio}
- 性格特点：${traits}
- 说话习惯：自然口语化，偏短句
${personaSnippet || ''}

## 辩论策略（这是高质量辩论的核心）

1. 每次发言必须包含一个对方没有提到的新论据（具体事实、数据、案例或类比）
2. 可以承认对方某个事实是对的，但必须指出这个事实不能支撑 ta 的结论
   - 好的承认方式："你说的X确实存在，但这恰恰说明了……"
   - 差的承认方式："你说得对，但是……"（空洞）
3. 反驳要针对论证逻辑（"你从A推不出B，因为……"），不要针对立场本身（"你这个观点不对"）
4. 每次发言必须推进辩论——要么引入新信息，要么拆解对方的论证链条，禁止重复自己已经说过的观点
5. 100-200 字

## 好的辩论发言示例

"你说远程办公降低效率，但 GitLab 全员远程做到了100亿美金市值。问题不在远程本身，是管理工具和异步协作流程没跟上。效率下降怪员工在家？不如看看管理层还活在2005年。"

"数据本身我不否认，但你忽略了幸存者偏差——你只看到了成功活下来的公司，那些试了你说的方法但失败的呢？光看赢家的做法就推导出因果关系，这叫倒果为因。"

## 差的辩论发言（严禁出现）

- "你说的完全不对，XX明明很好" → 没有论据的否定
- "我觉得……" → 辩论要论证，不要"觉得"
- 重复上一轮已经说过的观点 → 必须有新信息
- "首先……其次……最后……" → 不要写成论文，要像真人在争论

只输出你的发言文本，不要输出 JSON 或格式标记。`;
}

function buildOpponentPrompt(opponent: OpponentProfile, topic: string): string {
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
3. 反驳对方时，要拆解 ta 的论证链条：
   - "你的前提是X，但X在Y情况下不成立"
   - "你举的例子只能说明Z，推不出你的结论"
   - "你忽略了一个关键变量：……"
4. 可以承认对方某个具体事实，但必须指出这个事实不支持 ta 的结论
5. 100-200 字

## 好的反驳示例

"你提的 GitLab 案例我不否认，但GitLab是代码协作起家的公司，DNA里就有异步协作基因。拿一个天生远程的公司来论证'所有公司都适合远程'，这叫选择性举证。来，你给我找一个传统制造企业全员远程成功的案例？"

"你说年轻人应该追求稳定，我问你一个问题：2008年雷曼兄弟的员工稳定不稳定？中铁建设的编制铁不铁？稳定从来不是你选的，是环境给的。"

## 差的反驳（严禁出现）

- "你说的不对" → 没有论据的否定
- "你说得对，但是……" → 空洞的假承认
- "我不同意" → 辩论要证明为什么不同意
- 开头用"首先"，或写成"第一点……第二点……" → 不要论文格式

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
        content: `你是专业辩论评审。分析辩论内容，输出结构化评判。

## 评判维度（对每位辩手分别打分 1-10）

1. 论点逻辑性 — 论据能否支撑结论？有无逻辑跳跃？
2. 论据质量 — 用的是具体事实/数据，还是空泛断言？
3. 反驳有效性 — 是否真正拆解了对方论证，还是自说自话？
4. 新信息贡献 — 提出了多少对方没覆盖的新角度？

## 评判原则

- 不要因为某方说了更多的话就判赢，要看信息密度
- "承认对方有道理然后在更高维度反驳"是高级技巧，应加分
- 空洞的"你说的不对"式反驳应扣分
- 重复自己已经说过的观点应扣分
- 引入新数据/案例/类比应加分

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

辩手1：${userProfile.name}（用户的AI代理）
辩手2：${opponent.name}（${opponent.title}）

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

    const { topic, opponentId, userProfile: requestUserProfile } = await request.json();
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

    const persona = await fetchUserPersona(session.user.id);
    const personaSnippet = buildPersonaSnippet(persona);

    const opponent = selectOpponent(topic, opponentId);
    const userPrompt = buildUserAgentPrompt(userProfile, topic, personaSnippet);
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
          const openingStrategy = pickStrategy(DEBATE_STRATEGIES_USER);
          const openingStream = generateResponseStream(userPrompt, [
            { role: 'user', content: `辩论话题：${topic}\n\n本轮策略指令：${openingStrategy}\n\n请发表你的开场观点。记住：必须包含一个具体的论据。` },
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
          const firstOpponentStrategy = pickStrategy(DEBATE_STRATEGIES_OPPONENT);
          opponentHistory.push({ role: 'user', content: `${openingContent}\n\n---\n本轮策略指令：${firstOpponentStrategy}\n记住你是 ${opponent.name}，坚持你的立场。发表你的下一轮发言。` });

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
            const nextUserStrategy = pickStrategy(DEBATE_STRATEGIES_USER);
            userHistory.push({ role: 'user', content: `${opponentContent}\n\n---\n本轮策略指令：${nextUserStrategy}\n请发表你的下一轮发言。记住：必须包含一个新论据，不能重复之前说过的观点。` });

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
              const nextOpponentStrategy = pickStrategy(DEBATE_STRATEGIES_OPPONENT);
              opponentHistory.push({ role: 'user', content: `${userContent}\n\n---\n本轮策略指令：${nextOpponentStrategy}\n记住你是 ${opponent.name}，坚持你的立场。发表你的下一轮发言。` });
            }
          }

          // 生成总结报告
          sendEvent('synthesizing', {});
          const synthesisContent = await generateSynthesis(topic, messages, userProfile, opponent);

          let synthesis;
          try {
            const jsonMatch = synthesisContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const raw = JSON.parse(jsonMatch[0]);
              // Map new format to frontend-expected format
              synthesis = {
                consensus: [],
                disagreements: [raw.key_clash || '在核心观点上存在根本分歧'],
                winner: raw.winner || 'tie',
                winnerReason: raw.winner_reason || '双方各有千秋',
                conclusion: raw.takeaway || '这场辩论展示了不同视角的价值。',
                recommendations: [raw.highlight || '精彩的攻防交锋'],
                scores: raw.scores,
              };
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
