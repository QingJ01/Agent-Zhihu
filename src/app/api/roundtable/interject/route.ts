import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { getServerSession } from 'next-auth';
import { connectDB } from '@/lib/mongodb';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/api-security';
import RoundtableModel from '@/models/Roundtable';
import { AI_EXPERTS } from '@/lib/experts';
import { generateId } from '@/lib/id';
import type { IRoundtableMessage, IRoundtableExpert } from '@/models/Roundtable';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const ip = getClientIp(request);
    const limiter = checkRateLimit(`rt-interject:${session.user.id}:${ip}`, 10, 60 * 1000);
    if (!limiter.allowed) return rateLimitResponse(limiter.retryAfter);

    const { roundtableId, content, directTo } = await request.json();
    if (!roundtableId || !content) {
      return new Response(JSON.stringify({ error: 'Missing roundtableId or content' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    await connectDB();
    const rt = await RoundtableModel.findOne({ id: roundtableId, userId: session.user.id });
    if (!rt) {
      return new Response(JSON.stringify({ error: 'Roundtable not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    if (rt.status !== 'in_progress') {
      return new Response(JSON.stringify({ error: 'Roundtable is not in progress' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Add host message
    const hostMsg: IRoundtableMessage = {
      id: generateId('rtm'),
      role: 'host',
      name: session.user.name || '主持人',
      content,
      round: rt.currentRound,
      timestamp: Date.now(),
    };

    const allMessages = [...rt.messages, hostMsg];

    // Pick 1-2 experts to respond
    const respondExperts: IRoundtableExpert[] = [];
    if (directTo) {
      const targeted = rt.experts.find((e: IRoundtableExpert) => e.id === directTo);
      if (targeted) respondExperts.push(targeted);
    }
    if (respondExperts.length === 0) {
      // Pick 2 random experts
      const shuffled = [...rt.experts].sort(() => Math.random() - 0.5);
      respondExperts.push(...shuffled.slice(0, 2));
    }

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        try {
          sendEvent('host_message', { message: hostMsg });

          const newMessages = [hostMsg];

          for (const expert of respondExperts) {
            const fullExpert = AI_EXPERTS.find(e => e.id === expert.id);
            const personality = fullExpert?.personality || '理性、专业';
            const historyStr = allMessages.map(m => `【${m.name}】: ${m.content}`).join('\n\n');

            const prompt = `你是"${expert.name}"，${expert.title}。${personality}。

圆桌话题："${rt.topic}"

讨论记录：
${historyStr}

主持人刚才说："${content}"
${directTo === expert.id ? '主持人特别请你来回应。' : ''}

请针对主持人的话发言（150-250字）。要求：
1. 直接回应主持人的问题或引导
2. 可以结合之前其他专家的观点
3. 保持你的角色风格`;

            sendEvent('speaking', { expertId: expert.id, expertName: expert.name });

            let responseContent = '';
            const aiStream = await openai.chat.completions.create({
              model: MODEL,
              messages: [
                { role: 'system', content: prompt },
                { role: 'user', content: '请发言。' },
              ],
              max_tokens: 600,
              temperature: 0.8,
              stream: true,
            });

            for await (const chunk of aiStream) {
              const text = chunk.choices[0]?.delta?.content || '';
              if (text) {
                responseContent += text;
                sendEvent('chunk', { expertId: expert.id, content: text });
              }
            }

            const msg: IRoundtableMessage = {
              id: generateId('rtm'),
              role: 'expert',
              expertId: expert.id,
              name: expert.name,
              content: responseContent,
              replyTo: hostMsg.id,
              round: rt.currentRound,
              timestamp: Date.now(),
            };
            newMessages.push(msg);
            sendEvent('statement', { message: msg });

            await new Promise(r => setTimeout(r, 400));
          }

          // Save new messages
          await RoundtableModel.findOneAndUpdate(
            { id: roundtableId },
            { $push: { messages: { $each: newMessages } } }
          );

          sendEvent('done', { messageCount: newMessages.length });
          controller.close();
        } catch (error) {
          console.error('Interject stream error:', error);
          sendEvent('error', { message: '专家回应生成失败' });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });
  } catch (error) {
    console.error('Interject error:', error);
    return new Response(JSON.stringify({ error: 'Failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
