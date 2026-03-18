import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { connectDB } from '@/lib/mongodb';
import OpinionGraphModel from '@/models/OpinionGraph';
import MessageModel from '@/models/Message';
import QuestionModel from '@/models/Question';
import { generateId } from '@/lib/id';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/api-security';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function buildGraphPrompt(title: string, description: string, messages: { index: number; authorName: string; authorType: string; content: string; upvotes: number; replyTo?: string }[]): string {
  const messagesStr = messages.map(m =>
    `[${m.index}] 作者：${m.authorName}（${m.authorType === 'ai' ? 'AI专家' : '用户'}）\n${m.replyTo ? `回复 [${m.replyTo}]` : ''}\n内容：${m.content}\n点赞：${m.upvotes}`
  ).join('\n\n');

  return `分析以下问答讨论，提取观点图谱。

问题："${title}"
${description ? `问题描述："${description}"` : ''}

回答列表：
${messagesStr}

请输出 JSON：
{
  "nodes": [
    {
      "id": "node_1",
      "messageIndex": 1,
      "stance": "support|oppose|neutral|conditional",
      "summary": "一句话概括（20-50字）",
      "keyArgument": "核心论据（50-100字）",
      "tags": ["标签1", "标签2"]
    }
  ],
  "edges": [
    {
      "source": "node_1",
      "target": "node_2",
      "relation": "support|oppose|supplement|evolve",
      "reason": "为什么是这种关系（一句话）"
    }
  ],
  "clusters": [
    {
      "label": "阵营名称",
      "stance": "support|oppose|neutral",
      "nodeIds": ["node_1", "node_3"],
      "summary": "该阵营核心主张（一句话）"
    }
  ]
}

规则：
1. 每条有实质观点的回答生成一个 node，纯附和/闲聊不生成
2. 如果一条回答包含多个独立观点，可拆分为多个 node
3. edges 必须有明确依据，不要臆造关系
4. clusters 至少 2 个
5. stance 为 conditional 表示"有条件支持/反对"
6. 只输出纯JSON，不要多余文字`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: questionId } = await params;
    const ip = getClientIp(request);
    const limiter = checkRateLimit(`graph:${ip}`, 20, 60 * 1000);
    if (!limiter.allowed) return rateLimitResponse(limiter.retryAfter);

    await connectDB();

    const question = await QuestionModel.findOne({ id: questionId }).lean();
    if (!question) {
      return new Response(JSON.stringify({ error: 'Question not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const messages = await MessageModel.find({ questionId }).sort({ createdAt: 1 }).lean();
    if (messages.length < 3) {
      return new Response(JSON.stringify({ error: '至少需要3条回答才能生成观点图谱', messageCount: messages.length }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Check cached graph
    const cached = await OpinionGraphModel.findOne({ questionId }).lean();
    if (cached && cached.messageCount >= messages.length - 2) {
      return new Response(JSON.stringify({
        graph: { nodes: cached.nodes, edges: cached.edges, clusters: cached.clusters },
        meta: { generatedAt: cached.updatedAt, messageCount: cached.messageCount, version: cached.version, cached: true },
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Generate new graph
    const msgData = messages.map((m, i) => ({
      index: i + 1,
      authorName: m.author?.name || '未知',
      authorType: m.authorType,
      content: m.content.slice(0, 500),
      upvotes: m.upvotes || 0,
      replyTo: m.replyTo || undefined,
    }));

    const prompt = buildGraphPrompt(question.title, question.description || '', msgData);
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: '请分析并输出观点图谱JSON。' },
      ],
      max_tokens: 2000,
      temperature: 0.1,
    });

    const text = response.choices[0]?.message?.content || '{}';
    let graphData;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) graphData = JSON.parse(jsonMatch[0]);
    } catch {
      return new Response(JSON.stringify({ error: '观点图谱生成失败，请重试' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    if (!graphData?.nodes) {
      return new Response(JSON.stringify({ error: '观点图谱生成结果无效' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // Map nodes with message IDs and weights
    const nodes = (graphData.nodes || []).map((n: { id: string; messageIndex: number; stance: string; summary: string; keyArgument: string; tags?: string[] }) => {
      const msg = messages[n.messageIndex - 1];
      return {
        id: n.id,
        messageId: msg?.id || `msg_${n.messageIndex}`,
        authorName: msg?.author?.name || '未知',
        authorType: msg?.authorType || 'ai',
        stance: n.stance,
        summary: n.summary,
        keyArgument: n.keyArgument,
        tags: n.tags || [],
        weight: (msg?.upvotes || 0) + 1,
      };
    });

    const edges = (graphData.edges || []).map((e: { source: string; target: string; relation: string; reason?: string }, i: number) => ({
      id: `edge_${i + 1}`,
      source: e.source,
      target: e.target,
      relation: e.relation,
      reason: e.reason || '',
    }));

    const clusters = (graphData.clusters || []).map((c: { label: string; stance: string; nodeIds: string[]; summary: string }, i: number) => ({
      id: `cluster_${i + 1}`,
      label: c.label,
      stance: c.stance,
      nodeIds: c.nodeIds || [],
      summary: c.summary,
    }));

    const version = cached ? (cached.version || 0) + 1 : 1;
    const graphId = cached?.id || generateId('og');

    await OpinionGraphModel.findOneAndUpdate(
      { questionId },
      { id: graphId, questionId, nodes, edges, clusters, messageCount: messages.length, version },
      { upsert: true, new: true }
    );

    return new Response(JSON.stringify({
      graph: { nodes, edges, clusters },
      meta: { generatedAt: new Date(), messageCount: messages.length, version, cached: false },
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Graph error:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate graph' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
