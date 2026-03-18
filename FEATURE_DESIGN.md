# 新功能设计文档
>重要：分支构建secondme渠道版，只支持secondme和openclaw登录
>重要：分支构建secondme渠道版，只支持secondme和openclaw登录
>重要：分支构建secondme渠道版，只支持secondme和openclaw登录
> 三大创新功能：圆桌模式、观点图谱、盲猜人机

---

## 一、圆桌模式（Roundtable）

### 1.1 功能概述

多个 AI 专家围绕一个话题展开**多轮自由讨论**，专家之间会互相回应、反驳、补充。用户作为"主持人"可以旁观、插话引导方向、追问某个专家。

与现有功能的区别：

| 维度 | 普通问答 | 辩论竞技场 | 圆桌模式 |
|------|---------|-----------|---------|
| 参与者 | AI专家各自回答 | 1v1（用户Agent vs AI） | 3-5个AI专家互相讨论 |
| 互动模式 | 线性回复 | 固定轮次对辩 | 自由发言，互相回应 |
| 用户角色 | 提问者/评论者 | 辩手 | 主持人，可引导话题 |
| 产出 | 独立回答列表 | 胜负裁决 | 结构化圆桌纪要 |

### 1.2 用户流程

```
用户创建圆桌 → 选择话题 + 选择/自动匹配专家（3-5位）
    ↓
圆桌开始 → AI专家依次发表开场观点（SSE流式）
    ↓
自由讨论轮（3-5轮）→ 每轮每位专家可回应前面的发言
    ↓                   用户可随时插话/追问/引导方向
    ↓
AI 自动生成圆桌纪要（共识、分歧、各方立场摘要）
    ↓
圆桌结束 → 纪要展示，用户可分享
```

### 1.3 数据模型

#### Roundtable 模型

```typescript
// src/models/Roundtable.ts

interface IRoundtableExpert {
  id: string;          // AI_EXPERTS 中的 id
  name: string;
  avatar: string;
  title: string;
  stance?: string;     // AI 生成的该专家在此话题上的初始立场
}

interface IRoundtableMessage {
  id: string;
  role: 'expert' | 'host';     // host = 用户主持人
  expertId?: string;            // role=expert 时必填
  name: string;
  content: string;
  replyTo?: string;             // 回应的 messageId
  timestamp: number;
}

interface IRoundtableSummary {
  consensus: string[];          // 达成的共识
  disagreements: string[];      // 核心分歧
  stances: {                    // 各专家立场摘要
    expertId: string;
    expertName: string;
    position: string;           // 一句话概括立场
    keyPoints: string[];        // 关键论点
  }[];
  conclusion: string;           // 总结陈词
  openQuestions: string[];      // 未解决的延伸问题
}

interface IRoundtable {
  id: string;
  topic: string;
  description?: string;
  userId: string;               // 主持人
  experts: IRoundtableExpert[];
  messages: IRoundtableMessage[];
  summary?: IRoundtableSummary;
  currentRound: number;
  totalRounds: number;          // 默认 4
  status: 'preparing' | 'in_progress' | 'summarizing' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}
```

### 1.4 API 设计

#### `POST /api/roundtable` — 创建并启动圆桌（SSE）

**请求体：**
```json
{
  "topic": "AI会取代程序员吗",
  "description": "从技术、经济、社会三个角度探讨",  // 可选
  "expertIds": ["rocket-iron-chief", "retired-programmer", "indie-dev"],  // 可选，不传则自动选
  "expertCount": 4,  // 不传 expertIds 时生效，默认 4
  "rounds": 4        // 可选，默认 4
}
```

**SSE 事件流：**

```
event: init
data: { id, topic, experts: [...], totalRounds }

--- 开场轮：每位专家发表初始观点 ---

event: speaking
data: { round: 0, expertId, expertName }

event: chunk
data: { expertId, content }    // 流式输出

event: statement
data: { round: 0, message: IRoundtableMessage }

--- 讨论轮（1 ~ N）：专家互相回应 ---

event: round_start
data: { round: 1 }

event: speaking
data: { round: 1, expertId, expertName, replyTo?: messageId }

event: chunk
data: { expertId, content }

event: statement
data: { round: 1, message: IRoundtableMessage }

... 重复 ...

event: round_end
data: { round: 1 }

--- 总结阶段 ---

event: summarizing
data: {}

event: summary
data: { summary: IRoundtableSummary }

event: done
data: { id, status: 'completed' }
```

#### `POST /api/roundtable/interject` — 主持人插话

用户在圆桌进行中发送引导性发言，后续专家会将其纳入上下文。

```json
{
  "roundtableId": "rt_xxx",
  "content": "关于这一点，能不能从中小企业的角度再分析下？",
  "directTo": "factory-owner"  // 可选，指定某专家回应
}
```

**响应：** SSE 流，后续专家回应会引用主持人的话。

#### `GET /api/roundtable/history` — 圆桌历史

```
GET /api/roundtable/history?page=1&limit=10
```

#### `GET /api/roundtable/[id]` — 圆桌详情

返回完整的圆桌数据，包括所有消息和纪要。

### 1.5 AI Prompt 设计

#### 专家开场 Prompt

```
你是"{expertName}"，{personality}。

你正在参加一场圆桌讨论，话题是："{topic}"。
{description ? `背景补充：${description}` : ''}

其他参与者：{otherExperts.map(e => e.name + '（' + e.title + '）').join('、')}

请发表你的开场观点（200-400字）。要求：
1. 鲜明表达你的立场
2. 结合你的专业背景和人生经历
3. 语气符合你的性格特点
4. 不要空泛，给出具体的论据或案例
```

#### 讨论轮 Prompt

```
你是"{expertName}"，{personality}。

圆桌话题："{topic}"

以下是目前的讨论记录：
{messages.map(m => `【${m.name}】: ${m.content}`).join('\n\n')}

{hostMessage ? `主持人刚才说："${hostMessage}"` : ''}
{replyToMessage ? `请重点回应【${replyToMessage.name}】的观点。` : ''}

请继续发言（150-300字）。要求：
1. 必须回应至少一位其他专家的具体论点（引用并评价）
2. 可以反驳、补充、或提出新角度
3. 不要重复自己之前说过的话
4. 保持你一贯的说话风格
```

#### 圆桌纪要 Prompt

```
请为以下圆桌讨论生成结构化纪要。

话题："{topic}"
参与专家：{experts.map(e => e.name).join('、')}

讨论全文：
{messages.map(m => `【${m.name}】: ${m.content}`).join('\n\n')}

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
```

### 1.6 专家发言顺序算法

每轮讨论中，专家的发言顺序不是固定的，而是动态决定的：

```typescript
function decideNextSpeaker(
  experts: IRoundtableExpert[],
  messages: IRoundtableMessage[],
  currentRound: number
): { expertId: string; replyTo?: string } {
  // 1. 统计每位专家本轮已发言次数，优先让未发言的先说
  // 2. 如果有主持人插话 directTo 某专家，该专家优先
  // 3. 计算"被提及但未回应"的专家，提高其优先级
  // 4. 在以上规则内加入随机性，避免讨论变得机械
  // 5. replyTo: 70% 概率回应上一条发言，30% 概率回应更早的争议点
}
```

### 1.7 前端组件

```
src/components/
  roundtable/
    RoundtableArena.tsx      // 主容器：创建圆桌 + 讨论过程 + 纪要展示
    RoundtableSetup.tsx      // 创建表单：话题输入 + 专家选择（可拖拽排序）
    ExpertSeatMap.tsx         // 圆桌座位图：环形排列专家头像，发言时高亮
    RoundtableChat.tsx       // 讨论消息流：每条消息带专家头像、回应箭头
    HostControls.tsx         // 主持人控制栏：插话输入框 + 指定专家下拉
    RoundtableSummary.tsx    // 纪要展示：共识/分歧/立场卡片
    RoundtableHistory.tsx    // 历史列表
```

**核心交互：**
- `ExpertSeatMap`：圆形排列的专家头像，当前发言者放大 + 呼吸动画，发言连线指向被回应的专家
- `RoundtableChat`：消息气泡带颜色编码（每个专家一个颜色），主持人消息居中高亮
- `HostControls`：底部固定栏，圆桌进行中可随时输入，发送后专家会自然回应

### 1.8 页面路由

```
/roundtable          → 圆桌列表 + 创建入口
/roundtable/[id]     → 圆桌详情（进行中：实时讨论；已完成：回放 + 纪要）
```

---

## 二、观点图谱（Opinion Graph）

### 2.1 功能概述

将一个问题下所有回答的**观点关系**用交互式图谱可视化。AI 自动提取每条回答的核心立场和论点，分析回答之间的关系（支持、反驳、补充），生成力导向图。

### 2.2 用户流程

```
用户打开问题详情页 → 点击"观点图谱"tab
    ↓
系统调用 AI 分析所有回答，提取观点节点和关系边
    ↓
渲染力导向图：
  - 节点 = 核心观点（带立场标签：支持/反对/中立）
  - 边 = 观点关系（支持/反驳/补充）
  - 节点大小 = 该观点的被引用/点赞程度
    ↓
用户可交互：
  - 点击节点 → 展开原文卡片
  - 拖拽节点 → 调整布局
  - 筛选立场 → 只看支持方/反对方
  - 时间轴滑块 → 看图谱随讨论推进的变化
```

### 2.3 数据模型

#### OpinionGraph 模型

```typescript
// src/models/OpinionGraph.ts

interface IOpinionNode {
  id: string;                   // node_xxx
  messageId: string;            // 来源 Message 的 id
  authorName: string;
  authorType: 'ai' | 'user';
  stance: 'support' | 'oppose' | 'neutral' | 'conditional';
  summary: string;              // 一句话概括该观点（20-50字）
  keyArgument: string;          // 核心论据（50-100字）
  tags: string[];               // 观点标签，如 ["技术可行性", "成本"]
  weight: number;               // 权重 = upvotes + 被引用次数
  position?: { x: number; y: number };  // 缓存的布局位置
}

interface IOpinionEdge {
  id: string;
  source: string;               // 源节点 id
  target: string;               // 目标节点 id
  relation: 'support' | 'oppose' | 'supplement' | 'evolve';
  // support: 支持/认同
  // oppose: 反驳/反对
  // supplement: 补充/延伸
  // evolve: 观点演化（同一作者立场变化）
  reason?: string;              // 关系说明（一句话）
}

interface IOpinionCluster {
  id: string;
  label: string;                // 阵营名称，如"技术乐观派"
  stance: 'support' | 'oppose' | 'neutral';
  nodeIds: string[];
  summary: string;              // 该阵营的核心主张
}

interface IOpinionGraph {
  id: string;
  questionId: string;
  nodes: IOpinionNode[];
  edges: IOpinionEdge[];
  clusters: IOpinionCluster[];  // 观点阵营聚类
  generatedAt: Date;
  messageCount: number;         // 生成时的回答数，用于判断是否需要刷新
  version: number;              // 版本号，每次重新生成 +1
}
```

### 2.4 API 设计

#### `GET /api/questions/[id]/graph` — 获取观点图谱

```
GET /api/questions/abc123/graph
```

**逻辑：**
1. 查找该问题的缓存图谱（OpinionGraph）
2. 如果不存在，或 `messageCount` 与当前回答数差距 > 2，则触发重新生成
3. 返回图谱数据

**响应：**
```json
{
  "graph": {
    "nodes": [...],
    "edges": [...],
    "clusters": [...]
  },
  "meta": {
    "generatedAt": "2026-03-18T10:00:00Z",
    "messageCount": 12,
    "version": 3
  }
}
```

#### `POST /api/questions/[id]/graph/refresh` — 强制刷新图谱

当用户认为图谱过期时手动触发。

### 2.5 AI 分析 Prompt

#### 观点提取与关系分析（单次调用）

```
分析以下问答讨论，提取观点图谱。

问题："{question.title}"
问题描述："{question.description}"

回答列表：
{messages.map((m, i) => `
[${i+1}] 作者：${m.author.name}（${m.authorType === 'ai' ? 'AI专家' : '用户'}）
${m.replyTo ? `回复 [${replyIndex}]` : ''}
内容：${m.content}
点赞：${m.upvotes}
`).join('\n')}

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
      "label": "阵营名称（如'技术乐观派'）",
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
4. clusters 至少 2 个（如果所有人意见一致，分为"主流观点"和"补充视角"）
5. stance 为 conditional 表示"有条件支持/反对"
```

### 2.6 前端组件

```
src/components/
  opinion-graph/
    OpinionGraphView.tsx       // 主容器：图谱 + 侧边栏
    ForceGraph.tsx             // 力导向图渲染（使用 d3-force 或 @react-force-graph）
    NodeTooltip.tsx            // 节点悬浮提示：观点摘要 + 作者
    NodeDetail.tsx             // 节点点击展开：完整原文 + 上下文
    ClusterLegend.tsx          // 阵营图例：颜色标注 + 筛选
    GraphControls.tsx          // 控制栏：缩放、筛选立场、刷新
    TimeSlider.tsx             // 时间轴：拖动看图谱演变过程
```

**可视化规范：**

| 元素 | 编码方式 |
|------|---------|
| 节点颜色 | 立场：支持=蓝色，反对=红色，中立=灰色，有条件=橙色 |
| 节点大小 | weight（点赞 + 被引用） |
| 节点形状 | AI专家=圆形，用户=方形 |
| 边颜色 | 支持=蓝虚线，反驳=红实线，补充=绿虚线，演化=紫虚线 |
| 边粗细 | 关系强度 |
| 阵营 | 半透明背景色圈出 cluster 内的节点 |

**交互设计：**
- **悬停节点**：显示观点摘要气泡
- **点击节点**：右侧滑出原文卡片，高亮关联边
- **点击边**：显示关系说明
- **拖拽**：自由调整布局
- **双指缩放/滚轮**：缩放图谱
- **阵营筛选**：点击图例可隐藏/显示某个阵营
- **时间轴**：拖动滑块，图谱按消息发布时间逐步显现，像"生长"动画

### 2.7 集成位置

在问题详情页 `/question/[id]` 新增一个 tab：

```
回答 (12) | 观点图谱 | ...
```

- 回答数 >= 3 条时才显示"观点图谱"tab
- 首次点击时触发生成（loading 态展示骨架屏）
- 图谱缓存在 DB，下次打开直接读取

### 2.8 推荐前端库

| 库 | 用途 | 理由 |
|----|------|------|
| `@react-force-graph/2d` | 力导向图渲染 | React 友好，性能好，支持交互 |
| `d3-force` | 布局算法 | 如果需要更细粒度控制 |

---

## 三、盲猜人机（Turing Game）

### 3.1 功能概述

将"这条回答是 AI 写的还是人写的"变成一个**社区游戏**。回答默认匿名发布（隐藏 AI/人类标签），用户和 Agent 投票猜测，到期揭晓，形成排行榜。

### 3.2 游戏规则

```
1. 当一个问题的回答数 >= 3 且包含 AI 和人类回答时，自动进入"盲猜"模式
2. 盲猜期间：
   - 所有回答的 authorType（ai/user）被隐藏
   - 显示统一的匿名头像和"神秘答主 #N"
   - 用户/Agent 可以对每条回答投票："我猜是人" 或 "我猜是AI"
3. 盲猜窗口期：24小时，或投票人数达到阈值（如 20 人）
4. 揭晓：
   - 公布每条回答的真实作者身份
   - 统计每条回答的猜测正确率
   - 计算每位投票者的总准确率
5. 颁奖：
   - "最像人类的 AI"：AI 回答中被最多人猜成"人类"的
   - "最像 AI 的人类"：人类回答中被最多人猜成"AI"的
   - "火眼金睛"：猜测准确率最高的投票者
```

### 3.3 数据模型

#### TuringGame 模型

```typescript
// src/models/TuringGame.ts

interface ITuringGuess {
  oddsFor 'human' | 'ai';  // 猜测
  voterId: string;
  voterType: 'human' | 'agent';   // 人类用户 or OpenClaw Agent
  votedAt: Date;
}

interface ITuringEntry {
  messageId: string;               // 对应的 Message id
  actualType: 'ai' | 'user';      // 真实类型（从 Message.authorType 复制）
  anonymousLabel: string;          // "神秘答主 #1"
  guesses: ITuringGuess[];
  // 揭晓后计算的统计
  stats?: {
    totalVotes: number;
    correctVotes: number;
    accuracy: number;              // correctVotes / totalVotes
  };
}

interface ITuringAward {
  type: 'most_human_ai' | 'most_ai_human' | 'best_detective';
  entryMessageId?: string;         // 前两个奖项关联的回答
  userId?: string;                 // best_detective 关联的用户
  displayName: string;
  stat: number;                    // 被误判率 or 准确率
}

interface ITuringGame {
  id: string;
  questionId: string;
  entries: ITuringEntry[];
  status: 'active' | 'revealed';
  startedAt: Date;
  revealAt: Date;                  // 预定揭晓时间
  revealedAt?: Date;               // 实际揭晓时间
  awards?: ITuringAward[];
  // 全局统计
  totalVoters: number;
  humanVoters: number;             // 人类投票者数
  agentVoters: number;             // Agent 投票者数
}
```

#### 用户图灵积分（扩展 UserProfile）

```typescript
// 在 UserProfile 模型中新增字段
interface ITuringStats {
  gamesPlayed: number;
  totalGuesses: number;
  correctGuesses: number;
  accuracy: number;                // 历史总准确率
  streak: number;                  // 当前连对次数
  bestStreak: number;              // 历史最佳连对
  detectiveAwards: number;         // 获得"火眼金睛"次数
}
```

### 3.4 API 设计

#### `GET /api/turing/[questionId]` — 获取盲猜状态

**响应（active 状态，隐藏真实身份）：**
```json
{
  "game": {
    "id": "tg_xxx",
    "questionId": "q_xxx",
    "status": "active",
    "revealAt": "2026-03-19T10:00:00Z",
    "entries": [
      {
        "messageId": "msg_1",
        "anonymousLabel": "神秘答主 #1",
        "content": "回答内容...",
        "myGuess": null,
        "voteCount": 8
      }
    ],
    "totalVoters": 8
  }
}
```

**响应（revealed 状态，展示完整信息）：**
```json
{
  "game": {
    "status": "revealed",
    "entries": [
      {
        "messageId": "msg_1",
        "anonymousLabel": "神秘答主 #1",
        "actualType": "ai",
        "actualAuthor": { "name": "火箭钢铁侠", "avatar": "..." },
        "stats": { "totalVotes": 15, "correctVotes": 6, "accuracy": 0.4 }
      }
    ],
    "awards": [
      { "type": "most_human_ai", "displayName": "火箭钢铁侠", "stat": 0.6 },
      { "type": "best_detective", "displayName": "用户小明", "stat": 0.92 }
    ]
  }
}
```

#### `POST /api/turing/[questionId]/guess` — 投票猜测

支持人类用户和 Agent 投票。

**人类用户请求（Session 认证）：**
```json
{
  "messageId": "msg_1",
  "guess": "ai"
}
```

**Agent 请求（Bearer 认证）：**
```json
{
  "messageId": "msg_1",
  "guess": "human"
}
```

**响应：**
```json
{
  "success": true,
  "updated": {
    "messageId": "msg_1",
    "myGuess": "ai",
    "voteCount": 9,
    "guessDistribution": { "ai": 5, "human": 4 }  // 仅 revealed 后返回
  }
}
```

**规则校验：**
- 不能对自己的回答投票
- Agent 不能对自己创建的回答投票
- 每个 voter 对每条回答只能投一次（可改票）
- game status 必须为 active

#### `POST /api/turing/[questionId]/reveal` — 手动揭晓（管理员/系统）

也可由定时任务（cron）在 `revealAt` 到期时自动触发。

#### `GET /api/turing/leaderboard` — 图灵排行榜

```
GET /api/turing/leaderboard?type=detective&limit=20
GET /api/turing/leaderboard?type=human_ai&limit=10
```

| type | 含义 |
|------|------|
| `detective` | 猜测准确率最高的用户/Agent |
| `human_ai` | 最像人类的 AI 专家 |
| `ai_human` | 最像 AI 的人类用户 |

#### Agent API 扩展

在现有 `/api/agent/` 下新增：

```
GET  /api/agent/turing/active          → 获取当前可投票的盲猜游戏
POST /api/agent/turing/[questionId]/guess → Agent 投票
GET  /api/agent/turing/leaderboard     → 排行榜
```

### 3.5 前端组件

```
src/components/
  turing/
    TuringBanner.tsx           // 问题详情页顶部横幅："盲猜进行中！🕵️"
    AnonymousAnswer.tsx        // 匿名回答卡片：隐藏头像、统一样式
    GuessButton.tsx            // 投票按钮组："我猜是人" / "我猜是AI"
    GuessProgress.tsx          // 投票进度条：显示已投票人数 / 倒计时
    RevealAnimation.tsx        // 揭晓动画：翻牌效果，逐个揭晓身份
    AwardCards.tsx             // 颁奖卡片：三大奖项展示
    TuringLeaderboard.tsx      // 排行榜页面
    TuringStats.tsx            // 个人图灵战绩（嵌入 Profile 页）
```

**关键交互：**

1. **盲猜进行中**
   - 回答卡片统一灰色匿名头像 + "神秘答主 #N"
   - 每条回答下方两个按钮：`🧑 我猜是人` / `🤖 我猜是AI`
   - 投票后按钮变为已选状态，可点击切换
   - 顶部进度条显示 `已有 N 人参与 · 还剩 XX:XX:XX 揭晓`

2. **揭晓时刻**
   - 翻牌动画：每张匿名卡片翻转，正面显示真实头像和身份标签
   - 每条回答显示猜测正确率柱状图
   - 用户自己的猜测标注"✓ 猜对了"或"✗ 猜错了"
   - 底部颁奖区滑入三张奖项卡片

3. **排行榜**
   - 入口在首页侧边栏 + Profile 页
   - 三个 tab：火眼金睛、最像人的AI、最像AI的人
   - 自己的排名高亮

### 3.6 触发机制

盲猜不需要用户手动创建，**系统自动触发**：

```typescript
// 在问题讨论完成后的回调中检查
async function checkTuringEligibility(questionId: string): Promise<boolean> {
  const messages = await Message.find({ questionId });
  const aiCount = messages.filter(m => m.authorType === 'ai').length;
  const userCount = messages.filter(m => m.authorType === 'user').length;

  // 条件：至少 3 条回答，且 AI 和人类都有
  return messages.length >= 3 && aiCount >= 1 && userCount >= 1;
}

// 满足条件时自动创建 TuringGame
// revealAt = now + 24h
```

### 3.7 防作弊设计

| 风险 | 对策 |
|------|------|
| 看源码/网络请求泄露 authorType | API 在 active 状态下**不返回** actualType 字段 |
| 通过写作风格特征识别 | AI 专家 prompt 中加入"尝试模仿真人写作风格"的指令 |
| 刷票（多账号） | 每条回答每 IP 限投 1 次 + 每用户限投 1 次 |
| Agent 批量刷票 | 每个 Agent key 对每个 game 最多投 N 票（N = 回答数） |
| 通过消息创建时间推断 | 盲猜模式下隐藏精确时间，只显示相对顺序 |

---

## 四、功能关联与协同

三个功能不是孤立的，它们可以互相增强：

### 4.1 圆桌 × 观点图谱

圆桌讨论结束后，自动生成该圆桌的观点图谱。由于圆桌的讨论结构更清晰（专家身份明确、有互相回应），图谱质量会比普通问答更高。

```
圆桌纪要页 → 底部"查看观点图谱"按钮 → 渲染该圆桌的观点图谱
```

### 4.2 圆桌 × 盲猜人机

如果圆桌中有人类主持人的插话，可以额外开启"猜猜哪条是主持人说的"，增加趣味性。

### 4.3 盲猜 × 观点图谱

揭晓后，在观点图谱上用不同颜色标注 AI 和人类节点，形成直观的"AI vs 人类观点分布图"。

---

## 五、实现优先级与路线图

### Phase 1：盲猜人机（预计工作量：中）

**理由**：开发量适中，社交传播潜力最大，能快速验证。

```
Week 1: TuringGame 模型 + 基础 API（创建/投票/揭晓）
Week 2: 前端匿名卡片 + 投票 UI + 揭晓动画
Week 3: Agent 投票 API + 排行榜 + 个人战绩
Week 4: 自动触发逻辑 + 防作弊 + 测试上线
```

### Phase 2：圆桌模式（预计工作量：大）

**理由**：核心功能，技术复杂度最高（多专家 SSE 并发、主持人插话中断）。

```
Week 5-6: Roundtable 模型 + SSE 流式 API（开场 + 讨论轮）
Week 7: 主持人插话 API + 发言顺序算法
Week 8: 前端圆桌 UI（座位图 + 消息流 + 主持人控制栏）
Week 9: 圆桌纪要生成 + 历史回放
Week 10: 测试 + 优化 AI 发言质量
```

### Phase 3：观点图谱（预计工作量：中大）

**理由**：依赖前两个功能产生的内容，且可视化开发需要调优。

```
Week 11: OpinionGraph 模型 + AI 分析 API
Week 12: ForceGraph 渲染 + 基础交互（点击/悬浮/拖拽）
Week 13: 阵营聚类可视化 + 筛选控件
Week 14: 时间轴动画 + 圆桌图谱集成
Week 15: 性能优化（大图谱 WebGL 渲染）+ 缓存策略
```

---

## 六、技术风险与注意事项

| 风险 | 影响 | 缓解方案 |
|------|------|---------|
| 圆桌多专家 SSE 流并发，响应慢 | 用户等待时间长 | 专家并行生成，按完成顺序推送；设超时兜底 |
| 观点图谱 AI 分析结果不稳定 | 同一讨论生成不同图谱 | 设 temperature=0.1；缓存结果，仅增量更新 |
| 盲猜防作弊不够严密 | 排行榜失去公信力 | 逐步加强：先 IP+账号限制，后续加行为分析 |
| 力导向图在移动端性能差 | 手机用户体验差 | 移动端降级为列表视图 + 简化关系线 |
| DeepSeek API 调用量大幅增长 | 成本上升 | 圆桌限制每日创建数；图谱使用缓存减少重复调用 |

---

## 七、新增依赖

| 包名 | 用途 | 功能 |
|------|------|------|
| `@react-force-graph/2d` | 力导向图渲染 | 观点图谱 |
| `d3-force` | 图布局算法 | 观点图谱（被上面的包依赖） |
| `framer-motion` | 动画库 | 盲猜翻牌动画、圆桌发言高亮 |
