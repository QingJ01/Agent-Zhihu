import { UserPersona } from '@/types/persona';

/**
 * 校验解析后的 persona 数据是否有效。
 * 至少需要 traits 或 interests 非空。
 */
export function validatePersona(data: unknown): data is Partial<UserPersona> {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    (Array.isArray(d.traits) && d.traits.length > 0) ||
    (Array.isArray(d.interests) && d.interests.length > 0)
  );
}

/**
 * 规范化 persona 数据：裁剪数组长度、去空白、填充默认值。
 */
export function normalizePersona(raw: Partial<UserPersona>): Omit<UserPersona, 'sourceAI' | 'importedAt' | 'rawText' | 'version'> {
  const trimArr = (arr: unknown, max: number): string[] => {
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim().slice(0, 20))
      .slice(0, max);
  };

  const trimStr = (val: unknown, fallback: string): string => {
    if (typeof val === 'string' && val.trim()) return val.trim().slice(0, 100);
    return fallback;
  };

  return {
    traits: trimArr(raw.traits, 8),
    communicationStyle: trimStr(raw.communicationStyle, '自然随和'),
    interests: trimArr(raw.interests, 8),
    expertiseAreas: trimArr(raw.expertiseAreas, 5),
    tonePreference: trimStr(raw.tonePreference, '自然口语化'),
    argumentStyle: trimStr(raw.argumentStyle, '逻辑推演'),
    values: trimArr(raw.values, 5),
    speakingExample: typeof raw.speakingExample === 'string'
      ? raw.speakingExample.trim().slice(0, 200) || undefined
      : undefined,
    controversialStances: typeof raw.controversialStances === 'string'
      ? raw.controversialStances.trim().slice(0, 200) || undefined
      : undefined,
  };
}

/**
 * 生成紧凑的人设片段（~100-150 字），用于注入 AI prompt。
 */
export function buildPersonaSnippet(persona: UserPersona | null | undefined): string {
  if (!persona) return '';

  const parts: string[] = [];

  if (persona.traits?.length) {
    parts.push(`性格：${persona.traits.slice(0, 5).join('、')}`);
  }
  if (persona.communicationStyle) {
    parts.push(`沟通风格：${persona.communicationStyle}`);
  }
  if (persona.interests?.length) {
    parts.push(`关注领域：${persona.interests.slice(0, 5).join('、')}`);
  }
  if (persona.tonePreference) {
    parts.push(`语气偏好：${persona.tonePreference}`);
  }
  if (persona.argumentStyle) {
    parts.push(`论证方式：${persona.argumentStyle}`);
  }
  if (persona.values?.length) {
    parts.push(`价值观：${persona.values.slice(0, 3).join('、')}`);
  }
  if (persona.speakingExample) {
    parts.push(`说话示例："${persona.speakingExample}"`);
  }

  if (parts.length === 0) return '';

  return `\n## 用户个性画像\n${parts.join('\n')}`;
}

/**
 * 从 MongoDB 查询用户的 persona 数据。
 */
export async function fetchUserPersona(userId: string): Promise<UserPersona | null> {
  const { connectDB } = await import('@/lib/mongodb');
  const UserProfile = (await import('@/models/UserProfile')).default;

  await connectDB();
  const profile = await UserProfile.findOne({ userId })
    .select('persona -_id')
    .lean();

  return (profile as { persona?: UserPersona | null } | null)?.persona || null;
}
