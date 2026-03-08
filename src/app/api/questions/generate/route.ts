import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// ============ 共享规则片段 ============

const SHARED_RULES = `## 好标题的铁律

1. 必须包含至少一项"钩子"：具体数字（年龄/金额/年份/百分比）、矛盾对比、或具体场景（职业/城市/人际关系）
2. 读者看到标题后的第一反应必须是"我也想知道"或"卧槽这个角度没想过"
3. 标题 14-32 个中文字，以问号结尾。像朋友在微信群发的问题，不是新闻标题
4. 三个标题的句式结构必须完全不同：
   - 如果第一个用了"却/反而"转折结构，后两个绝对不能再用转折
   - 如果第一个以"为什么"开头，后两个不能以"为什么"开头
   - 三个标题的前四个字必须各不相同
5. 三个标题的话题主体必须不同（不能都是"爸妈"、都是"工作"、都是"花钱"）
6. 三个标题中，最多只能有1个使用"却"或"反而"`;

const SHARED_BAD_PATTERNS = `## 你必须回避的0赞模式（AI生成内容的典型特征）

- "为什么我爸妈总说X，自己却Y？" → 严禁使用
- "为什么我……，却/反而……？" → 三个问题中最多1个可以用转折
- 标题中的"大价钱"、"最好的"、"最贵的" → 必须换成具体金额或数字
- description 中的"让我很困惑"、"心里不是滋味" → 万能废话，严禁使用
- 三个标题全围绕同一个主体 → 必须换三个不同主体
- 标题可以一眼猜到所有回答的方向 → 好标题应该让人想听不同立场的回答`;

const SHARED_OUTPUT_FORMAT = `## 输出

严格输出 JSON，第一个字符必须是 {，最后一个字符必须是 }，不要换行，不要 markdown 代码块。

{"questions":[{"title":"...","description":"...","tags":["...","..."]},{"title":"...","description":"...","tags":["...","..."]},{"title":"...","description":"...","tags":["...","..."]}]}`;

// ============ 5 套完整 System Prompt 变体 ============

interface PromptVariant {
  name: string;
  systemPrompt: string;
  temperature: number;
}

const PROMPT_VARIANTS: PromptVariant[] = [
  // ---- 变体 A: 生活化 · 口语优先 ----
  {
    name: '生活化口语',
    temperature: 0.9,
    systemPrompt: `你是知乎选题助手。用户给你一个关键词，你生成 3 个知乎风格问题。三个问题都要跟普通人的日常体验相关，用口语化表达。

${SHARED_RULES}

## 本变体的句式要求

三个问题必须分别使用以下三种不同句式：
1. 场景困惑型："[具体人物+具体事件]，[困惑]？" — 像在描述昨天发生的事
2. 征集体验型："你 [什么时候/经历过] [某种体验]？" — 在群里征集经历
3. 假设实验型："[假设条件+具体数字]，你会怎么选？" — 朋友间的脑洞测试

## description 写法

- 第1条用第一人称困惑："我……，结果……"
- 第2条用场景速写：两三句话描述一个具体画面，不做总结
- 第3条用征集式：明确说想听什么类型的回答
- 每条 50-100字，禁止以"让我困惑"、"你怎么看"结尾

## 语气锚点

想象你在微信群里跟朋友聊天。你不会说"据调查显示"，你会说"我昨天刷到一个事儿"。你不会说"引发了社会广泛讨论"，你会说"这事太扯了"。三个问题都要达到这个口语化程度。

## 高赞标题参考

- "儿子是学计算机的。他姑姑电脑坏了，让他帮忙看看，居然还生气了。是我的错吗？"（场景困惑型，7551赞）
- "你什么时候发现真的有天赋差距的？"（征集体验型，2782赞）
- "每个月给你两万，但是你这辈子不能吃中餐，你接受吗？"（假设实验型，2108赞）

${SHARED_BAD_PATTERNS}

${SHARED_OUTPUT_FORMAT}`,
  },

  // ---- 变体 B: 思辨型 · 反直觉优先 ----
  {
    name: '思辨反直觉',
    temperature: 0.85,
    systemPrompt: `你是知乎选题助手。用户给你一个关键词，你生成 3 个知乎风格问题。三个问题都要有一定深度，让人需要想一想才能回答。重点挖掘反直觉现象。

${SHARED_RULES}

## 本变体的句式要求

三个问题必须分别使用以下三种不同句式：
1. 反直觉型："为什么 [看似A的事物] 却 [反直觉的B]？" — 打破常识认知
2. "明明"句式型："明明 [A]，为什么 [反直觉的B]？" — 指出矛盾
3. 冷门切角型：用一个大多数人没想过的角度提问 — 开辟新视角

注意：只有第1个问题可以用"却"，第2个用"明明…为什么…"，第3个不能用转折词。

## description 写法

- 第1条用数据/事实开头："据统计……" 或 "我查了一下……，发现……"
- 第2条用反转揭示：先给一个大众认知，然后用一个具体事实打脸
- 第3条用第一人称困惑："我……，结果……"
- 每条 50-100字，禁止以"让我困惑"、"你怎么看"结尾

## 思辨质量标准

好的思辨题目会让读者经历这个过程：
"这还用问？" → 仔细想想 → "卧槽好像确实说不清" → 想看别人怎么说

差的思辨题目让读者直接跳到：
"老生常谈" 或 "这跟我有什么关系"

## 高赞标题参考

- "为什么人类作为杂食性非常高的动物，却有个非常脆弱的胃？"（反直觉型，1.9万赞）
- "明明终身监禁比死刑更有威慑力，为什么有很多人反对废死？"（"明明"句式，7863赞）
- ""磅"这个英制单位为什么不译为"英斤"？"（冷门切角，7082赞）
- "超市里的购物车为什么越做越大？"（冷门切角）

${SHARED_BAD_PATTERNS}

${SHARED_OUTPUT_FORMAT}`,
  },

  // ---- 变体 C: 争议型 · 站队优先 ----
  {
    name: '争议站队',
    temperature: 0.9,
    systemPrompt: `你是知乎选题助手。用户给你一个关键词，你生成 3 个知乎风格问题。三个问题必须能把人分成至少两个阵营，引发真正的辩论。

${SHARED_RULES}

## 本变体的句式要求

三个问题必须分别使用以下三种不同句式：
1. 对比疑问型："[A] 可以……，[B] 为什么……？" — 两个事物的不公平对比
2. 假设实验型："[假设条件+具体数字]，你会怎么选？" — 制造两难
3. 极简直球型："为什么 [简短现象]？"（标题不超过20字）— 一针见血

## description 写法

- 第1条用反转揭示：先给一个大众认知，然后用事实打脸
- 第2条用场景速写：两三句话描述一个具体画面
- 第3条用数据/事实开头
- 每条 50-100字，禁止以"让我困惑"、"你怎么看"结尾

## 争议性标准

好的争议题：两边都有道理，你说服不了对方，对方也说服不了你
差的争议题：答案显而易见，只是换了个说法问了个废话

三个问题的争议点必须完全不同：
- 一个涉及价值观冲突（公平 vs 效率，自由 vs 安全）
- 一个涉及利益冲突（不同群体的立场天然对立）
- 一个涉及认知冲突（大众直觉 vs 专业判断）

## 高赞标题参考

- "为什么Netflix靠订阅费就可以盈利，而国内的爱优腾搞出各种花里胡哨的付费项目还是亏损？"（对比疑问型，1069赞）
- "每个月给你两万，但是你这辈子不能吃中餐，你接受吗？"（假设实验型，2108赞）
- "为什么小公司留不住人？"（极简直球，7551赞）

${SHARED_BAD_PATTERNS}

${SHARED_OUTPUT_FORMAT}`,
  },

  // ---- 变体 D: 趣味型 · 好奇心优先 ----
  {
    name: '趣味好奇',
    temperature: 0.95,
    systemPrompt: `你是知乎选题助手。用户给你一个关键词，你生成 3 个知乎风格问题。三个问题要让人看到标题就觉得有意思、想点进去。优先挖掘冷门知识和有趣的切角。

${SHARED_RULES}

## 本变体的句式要求

三个问题必须分别使用以下三种不同句式：
1. 冷门切角型：用一个大多数人没想过的角度提问 — 让人"哦？这个角度没想过"
2. 极简直球型：不超过20字的短问题 — 简单但让人好奇
3. 征集体验型："你 [什么时候/经历过] [某种体验]？" — 引发分享欲

## description 写法

- 第1条用数据/事实开头：甩一个冷知识引起好奇
- 第2条用场景速写：描述一个让人意外的具体画面
- 第3条用征集式：明确说想听什么类型的回答
- 每条 50-100字，禁止以"让我困惑"、"你怎么看"结尾

## 趣味性标准

好的趣味题：让人转发到朋友群里说"你们猜猜为什么"
差的趣味题：标题本身就是答案，点进去没有新信息

秘诀：从人们每天接触但从没细想过的事物切入。越日常、越熟悉的东西，角度越新就越有趣。

## 高赞标题参考

- "82年的拉菲，怎么到现在还没喝完？"（冷门切角，355赞）
- "超市里的购物车为什么越做越大？"（冷门切角）
- ""磅"这个英制单位为什么不译为"英斤"？"（冷门切角，7082赞）
- "你什么时候发现真的有天赋差距的？"（征集体验型，2782赞）

${SHARED_BAD_PATTERNS}

${SHARED_OUTPUT_FORMAT}`,
  },

  // ---- 变体 E: 现实感 · 年轻人处境优先 ----
  {
    name: '现实处境',
    temperature: 0.85,
    systemPrompt: `你是知乎选题助手。用户给你一个关键词，你生成 3 个知乎风格问题。三个问题要贴近当下年轻人（20-35岁）的真实处境，让人觉得"这说的不就是我吗"。

${SHARED_RULES}

## 本变体的句式要求

三个问题必须分别使用以下三种不同句式：
1. 场景困惑型："[具体人物+具体事件]，[困惑]？" — 描述一个20-35岁的人真实遇到的场景
2. 反直觉型："为什么 [看似合理的行为] 却 [适得其反的结果]？" — 揭示年轻人的认知陷阱
3. 假设实验型："[假设条件+具体数字]，你会怎么选？" — 用具体数字框定一个年轻人的真实抉择

注意：只有第2个问题可以用"却"。

## description 写法

- 第1条用第一人称困惑："我……，结果……"（用具体的通勤时间/房租/工资等数字）
- 第2条用反转揭示：先给一个"正确答案"，再用身边真实案例打脸
- 第3条用场景速写：描述一个两难处境的具体画面
- 每条 50-100字，禁止以"让我困惑"、"你怎么看"结尾

## 现实感标准

好的现实题：让人在评论区写自己的经历，越写越多
差的现实题：让人觉得"又是知乎精英在制造焦虑"

关键：用具体数字（月薪8K、通勤90分钟、房租2500）代替模糊描述（"收入不高"、"通勤很久"、"房租压力大"）

## 高赞标题参考

- "儿子是学计算机的。他姑姑电脑坏了，让他帮忙看看，居然还生气了。是我的错吗？"（场景困惑，7551赞）
- "为什么小公司留不住人？"（极简直球，7551赞）
- "你什么时候发现真的有天赋差距的？"（征集体验，2782赞）

${SHARED_BAD_PATTERNS}

${SHARED_OUTPUT_FORMAT}`,
  },
];

// ============ 题材方向种子（注入 user prompt） ============

const topicAngles = [
  '从一个反常识的生活细节切入',
  '关于某个大家习以为常但从没细想过的现象',
  '关于某个正在悄悄消失的事物或习惯',
  '关于一个日常物品背后的冷门设计逻辑',
  '关于一种大家都遇到过但不好意思说的社交场景',
  '关于职场中一个微妙的人际博弈',
  '关于代际之间一个具体的认知断层',
  '关于一个"花了钱/时间后发现可能不值"的具体决定',
  '关于两个选项都不完美的真实两难',
  '关于一个"看似正确但结果适得其反"的策略',
  '关于一个冷知识或冷门现象背后的原因',
  '关于某样东西为什么叫这个名字/为什么是这个样子',
  '关于一个大多数人不知道的行业内幕',
  '关于不同城市/地域的人对同一件事的完全不同理解',
  '关于一个新技术悄悄改变的行为习惯',
  '关于互联网时代一个悄悄改变的社交规则',
  '关于一个"越省钱反而越花钱"或"越花钱反而越省"的消费现象',
  '关于一个被广泛传播的错误认知',
  '关于一个"看似合理实则荒谬"的社会制度或惯例',
  '关于一个大家都做但说不清为什么要做的习惯',
];

// ============ 工具函数 ============

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickThreeAngles(): string[] {
  const shuffled = [...topicAngles].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

function cleanJSON(raw: string): string {
  let cleaned = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

function buildUserPrompt(keyword: string): string {
  const angles = pickThreeAngles();

  return [
    `关键词：${keyword}`,
    '',
    '三个问题的方向指引（每个问题对应一个）：',
    `- 问题1方向：${angles[0]}`,
    `- 问题2方向：${angles[1]}`,
    `- 问题3方向：${angles[2]}`,
    '',
    '生成前自检：',
    '- 三个标题的前四个字是否各不相同？',
    '- 是否有超过1个标题使用了"却"或"反而"？如果有，改掉',
    '- 三个标题的话题主体是否各不相同？',
    '- description 是否有任何一条以"让我困惑"或"不是滋味"结尾？如果有，改掉',
    '- 每个标题是否都包含至少一个具体数字或具体名词？',
    '',
    '只输出 JSON。',
  ].join('\n');
}

// ============ 后处理 ============

interface GeneratedQuestion {
  title: string;
  description: string;
  tags: string[];
}

interface GenerateResult {
  questions: GeneratedQuestion[];
}

const BANNED_DESC_ENDINGS = [
  '让我很困惑',
  '让我困惑',
  '心里很不是滋味',
  '心里不是滋味',
  '让我开始怀疑',
  '你怎么看',
  '到底是什么',
];

function postProcess(result: GenerateResult): GenerateResult {
  let reversalSeen = false;
  for (const q of result.questions) {
    const hasReversal = q.title.includes('却') || q.title.includes('反而');
    if (hasReversal) {
      if (reversalSeen) {
        q.title = q.title.replace(/却/g, '').replace(/反而/g, '').replace(/\s{2,}/g, ' ');
      }
      reversalSeen = true;
    }

    if (!q.title.endsWith('？') && !q.title.endsWith('?')) {
      q.title += '？';
    }

    if (q.title.length > 36) {
      const cutPoint = Math.max(
        q.title.lastIndexOf('，', 32),
        q.title.lastIndexOf('、', 32),
      );
      if (cutPoint > 14) {
        q.title = q.title.slice(0, cutPoint) + '？';
      }
    }

    if (q.description.length > 120) {
      const lastPeriod = q.description.lastIndexOf('。', 100);
      if (lastPeriod > 50) {
        q.description = q.description.slice(0, lastPeriod + 1);
      } else {
        q.description = q.description.slice(0, 100);
      }
    }

    for (const ending of BANNED_DESC_ENDINGS) {
      if (q.description.endsWith(ending)) {
        q.description = q.description.slice(0, q.description.length - ending.length).replace(/[，,。、\s]+$/, '') + '。';
      }
      if (q.description.endsWith(ending + '。')) {
        q.description = q.description.slice(0, q.description.length - ending.length - 1).replace(/[，,。、\s]+$/, '') + '。';
      }
    }

    q.tags = q.tags
      .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
      .slice(0, 3);
    if (q.tags.length < 1) q.tags = ['讨论'];
  }

  return result;
}

function tryParse(raw: string): GenerateResult | null {
  try {
    const cleaned = cleanJSON(raw);
    const obj = JSON.parse(cleaned);
    if (!obj.questions || !Array.isArray(obj.questions) || obj.questions.length === 0) {
      return null;
    }
    for (const q of obj.questions) {
      if (!q.title || !q.description || !Array.isArray(q.tags)) return null;
    }
    return obj as GenerateResult;
  } catch {
    return null;
  }
}

function getFallbackQuestions(keyword: string): GenerateResult {
  return {
    questions: [
      {
        title: `关于「${keyword}」，你有过什么出乎意料的经历？`,
        description: `很多人对「${keyword}」有固定印象，但真实体验往往和想象不一样。说说你的故事。`,
        tags: [keyword, '经历'],
      },
      {
        title: `${keyword}这件事，有没有被大多数人误解的地方？`,
        description: `网上关于「${keyword}」的讨论很多，但不少观点经不起推敲。哪些是真相，哪些只是"看起来正确"？`,
        tags: [keyword, '认知'],
      },
      {
        title: `如果重新选择，你还会在「${keyword}」上投入时间吗？`,
        description: `回头看，那些在「${keyword}」上花过的时间和精力，到底值不值得？`,
        tags: [keyword, '选择'],
      },
    ],
  };
}

// ============ API Route ============

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

    const keyword = title.trim();
    const variant = randomPick(PROMPT_VARIANTS);
    const userPrompt = buildUserPrompt(keyword);

    console.log(`[选题助手] 使用变体: ${variant.name}, temperature: ${variant.temperature}`);

    // 第一次尝试
    let response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: variant.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 800,
      temperature: variant.temperature,
    });

    let raw = response.choices[0]?.message?.content || '';
    let result = tryParse(raw);

    // 解析失败：换一个变体 + 降温重试
    if (!result) {
      const retryVariant = randomPick(PROMPT_VARIANTS.filter((v) => v.name !== variant.name));
      console.warn(`[选题助手] 第一次解析失败(${variant.name})，换变体重试: ${retryVariant.name}`);

      response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: retryVariant.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 800,
        temperature: 0.3,
      });
      raw = response.choices[0]?.message?.content || '';
      result = tryParse(raw);
    }

    if (!result) {
      console.warn('[选题助手] 两次均失败，使用 fallback');
      return NextResponse.json(postProcess(getFallbackQuestions(keyword)));
    }

    return NextResponse.json(postProcess(result));
  } catch (error) {
    console.error('Failed to generate questions:', error);
    return NextResponse.json({ error: '生成问题失败，请稍后重试' }, { status: 500 });
  }
}
