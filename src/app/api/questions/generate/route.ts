import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    const { title } = await request.json();

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: '标题不能为空' }, { status: 400 });
    }

    const trimmedTitle = title.trim();

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `你是知乎的选题助手。用户会给你一个关键词或短句，你需要根据它生成 3 个高质量、有讨论价值的知乎风格问题。

要求：
- 每个问题包含 title（14-32个中文字符，以问号结尾）、description（50-100字的问题补充说明）、tags（1-3个相关标签）
- 问题要有深度、能引发讨论，避免是非题
- 3 个问题角度各不相同（如：现象分析、个人经历、行业趋势等）
- 语气自然，像真人在知乎上会提的问题

严格按以下 JSON 格式返回，不要包含其他内容：
{"questions":[{"title":"...","description":"...","tags":["..."]},{"title":"...","description":"...","tags":["..."]},{"title":"...","description":"...","tags":["..."]}]}`
        },
        {
          role: 'user',
          content: `请根据「${trimmedTitle}」生成 3 个知乎问题。`,
        },
      ],
      max_tokens: 800,
      temperature: 0.95,
    });

    const content = response.choices[0]?.message?.content || '';
    const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);

    if (!match) {
      return NextResponse.json({ error: '生成失败，请重试' }, { status: 500 });
    }

    const parsed = JSON.parse(match[0]);

    if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return NextResponse.json({ error: '生成失败，请重试' }, { status: 500 });
    }

    return NextResponse.json({ questions: parsed.questions.slice(0, 3) });
  } catch (error) {
    console.error('Failed to generate questions:', error);
    return NextResponse.json({ error: '生成问题失败，请稍后重试' }, { status: 500 });
  }
}
