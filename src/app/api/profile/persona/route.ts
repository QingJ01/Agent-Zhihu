import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import OpenAI from 'openai';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { connectDB } from '@/lib/mongodb';
import { checkRateLimit, rateLimitResponse, validateJsonBodySize } from '@/lib/api-security';
import UserProfile from '@/models/UserProfile';
import { UserPersona } from '@/types/persona';
import { validatePersona, normalizePersona } from '@/lib/persona';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

/**
 * 三层解析策略：直接 JSON → 正则提取 → AI 兜底
 */
async function parsePersonaText(rawText: string): Promise<Omit<UserPersona, 'sourceAI' | 'importedAt' | 'rawText' | 'version'> | null> {
  // Tier 1 & 2: 尝试直接解析 JSON（去除 markdown code fence）
  const cleaned = rawText
    .replace(/^```(?:json)?\s*\n?/im, '')
    .replace(/\n?```\s*$/im, '')
    .trim();

  try {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (validatePersona(parsed)) {
        return normalizePersona(parsed);
      }
    }
  } catch {
    // fall through to AI parsing
  }

  // Tier 3: AI 兜底解析
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `你是数据解析助手。用户会粘贴一段AI生成的个人画像描述。
请从中提取结构化数据，严格输出以下JSON格式：
{
  "traits": ["性格特点"],
  "communicationStyle": "沟通风格",
  "interests": ["兴趣"],
  "expertiseAreas": ["擅长领域"],
  "tonePreference": "语气偏好",
  "argumentStyle": "论证风格",
  "values": ["价值观"],
  "speakingExample": "一句代表此人说话风格的话",
  "controversialStances": "争议话题态度"
}
只输出JSON，不要其他文字。`,
        },
        { role: 'user', content: rawText.slice(0, 3000) },
      ],
      max_tokens: 600,
      temperature: 0.2,
    });

    const aiText = response.choices[0]?.message?.content?.trim() || '';
    const aiMatch = aiText.match(/\{[\s\S]*\}/);
    if (aiMatch) {
      const parsed = JSON.parse(aiMatch[0]);
      if (validatePersona(parsed)) {
        return normalizePersona(parsed);
      }
    }
  } catch (err) {
    console.error('AI persona parsing failed:', err);
  }

  return null;
}

/** POST — 导入人设 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const rl = checkRateLimit(`persona:${session.user.id}`, 10, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const sizeCheck = validateJsonBodySize(request, 10_000);
  if (sizeCheck) return sizeCheck;

  try {
    const body = (await request.json()) as {
      rawText?: string;
      sourceAI?: string;
      parsed?: Partial<UserPersona>;
    };

    let personaFields: Omit<UserPersona, 'sourceAI' | 'importedAt' | 'rawText' | 'version'> | null = null;

    // 如果前端已经编辑并直接传结构化数据
    if (body.parsed && validatePersona(body.parsed)) {
      personaFields = normalizePersona(body.parsed);
    } else if (body.rawText && body.rawText.trim().length > 10) {
      personaFields = await parsePersonaText(body.rawText);
    }

    if (!personaFields) {
      return NextResponse.json(
        { error: '无法从文本中解析出人设数据，请确认粘贴的内容格式正确' },
        { status: 400 }
      );
    }

    const sourceAI = (body.sourceAI || '').trim().slice(0, 30) || undefined;

    const persona: UserPersona = {
      ...personaFields,
      sourceAI,
      importedAt: Date.now(),
      rawText: body.rawText?.slice(0, 5000),
      version: 1,
    };

    await connectDB();
    await UserProfile.findOneAndUpdate(
      { userId: session.user.id },
      { $set: { persona }, userId: session.user.id },
      { upsert: true }
    );

    return NextResponse.json({ ok: true, persona });
  } catch (error) {
    console.error('POST /api/profile/persona failed:', error);
    return NextResponse.json({ error: '导入人设失败' }, { status: 500 });
  }
}

/** GET — 获取当前用户 persona */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    await connectDB();
    const profile = await UserProfile.findOne({ userId: session.user.id })
      .select('persona -_id')
      .lean();

    return NextResponse.json({
      persona: (profile as { persona?: UserPersona | null } | null)?.persona || null,
    });
  } catch (error) {
    console.error('GET /api/profile/persona failed:', error);
    return NextResponse.json({ error: '读取人设失败' }, { status: 500 });
  }
}

/** DELETE — 清除 persona */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    await connectDB();
    await UserProfile.findOneAndUpdate(
      { userId: session.user.id },
      { persona: null }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/profile/persona failed:', error);
    return NextResponse.json({ error: '清除人设失败' }, { status: 500 });
  }
}
