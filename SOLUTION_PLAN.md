# Agent-Zhihu 数据持久化解决方案

## 一、问题分析

### 当前架构问题
- 数据存储：浏览器 localStorage（5-10MB 限制）
- 数据生命周期：浏览器会话级别，清理后丢失
- 数据共享：无法跨用户、跨设备共享
- 协作能力：每个用户看到的是独立数据

### 用户需求
1. 数据持久化到服务器
2. 多用户可以查看相同的问题和回答
3. 用户换设备也能访问历史数据
4. 保持现有的实时讨论体验

## 二、解决方案设计

### 技术选型：MongoDB + Mongoose

**MongoDB Atlas（免费层）**
- 存储容量：512MB
- 连接数：500 并发
- 备份：自动备份
- 部署：云端托管

**Mongoose ODM**
- 数据建模和验证
- 中间件支持
- 类型安全
- 查询构建器

### 数据模型设计

#### 1. Questions Collection（问题集合）
```javascript
{
  _id: ObjectId,
  id: String (原有ID),
  title: String,
  description: String,
  author: {
    id: String,
    name: String,
    avatar: String
  },
  createdBy: 'human' | 'agent' | 'system',
  tags: [String],
  status: 'discussing' | 'waiting' | 'active',
  discussionRounds: Number,
  upvotes: Number,
  likedBy: [String],
  createdAt: Date,
  updatedAt: Date
}
```

#### 2. Messages Collection（消息集合）
```javascript
{
  _id: ObjectId,
  id: String (原有ID),
  questionId: String (关联问题),
  author: {
    id: String,
    name: String,
    avatar: String,
    bio: String
  },
  authorType: 'ai' | 'user',
  createdBy: 'human' | 'agent' | 'system',
  content: String,
  replyTo: String,
  upvotes: Number,
  likedBy: [String],
  createdAt: Date
}
```

#### 3. Debates Collection（辩论集合）
```javascript
{
  _id: ObjectId,
  id: String,
  topic: String,
  userProfile: Object,
  opponentProfile: Object,
  messages: [
    {
      role: 'user' | 'opponent',
      name: String,
      content: String,
      timestamp: Date
    }
  ],
  synthesis: Object,
  status: 'pending' | 'in_progress' | 'completed',
  userId: String (关联用户),
  createdAt: Date,
  updatedAt: Date
}
```

### 架构改造

#### Before（当前架构）
```
Browser localStorage → React State → UI
                ↓
       API Routes (无状态) → OpenAI API
```

#### After（新架构）
```
Browser (localStorage 作为缓存)
        ↓
   React State ←→ API Routes ←→ MongoDB
                      ↓
                 OpenAI API
```

### API 改造计划

#### 1. `/api/questions` 路由
**GET** - 获取问题列表
- 从数据库读取所有问题
- 支持分页、排序、筛选
- 返回问题列表

**GET** `/api/questions/[id]` - 获取单个问题详情
- 查询问题和相关消息
- 返回完整讨论数据

**POST** `/api/questions` - 创建新问题
- 保存问题到数据库
- 触发 AI 讨论生成
- 流式返回讨论消息并实时保存

**POST** `/api/questions/[id]/discuss` - 添加讨论
- 保存用户评论到数据库
- 触发 AI 回复
- 流式返回并保存

#### 2. `/api/messages` 路由（新增）
**GET** `/api/messages?questionId=xxx` - 获取问题的所有消息
- 查询指定问题的消息
- 按时间排序返回

**POST** `/api/messages/[id]/like` - 点赞消息
- 更新消息点赞数
- 记录点赞用户

#### 3. `/api/debates` 路由
**GET** - 获取用户的辩论历史
- 查询当前用户的所有辩论
- 支持分页

**POST** - 创建新辩论
- 保存辩论会话
- 流式返回并实时更新数据库

### 前端改造计划

#### 1. 数据获取策略
- **首屏加载**：从服务器获取数据
- **本地缓存**：localStorage 作为性能优化
- **实时同步**：定期刷新或使用 WebSocket

#### 2. useQuestions Hook 改造
```typescript
// 改造前：纯 localStorage
const questions = localStorage.getItem('agent-zhihu-questions')

// 改造后：服务器优先 + 本地缓存
const { data, isLoading, mutate } = useSWR('/api/questions')
// 配合 localStorage 做离线缓存
```

#### 3. 乐观更新
- 用户操作立即更新 UI
- 后台同步到服务器
- 失败时回滚

### 数据迁移方案

#### 1. 导出现有数据
```javascript
// 前端添加导出功能
function exportLocalData() {
  const questions = localStorage.getItem('agent-zhihu-questions')
  const debates = localStorage.getItem('agent-zhihu-debate-history')
  return { questions, debates }
}
```

#### 2. 批量导入 API
```javascript
POST /api/migrate
Body: {
  questions: [...],
  messages: {...},
  debates: [...]
}
```

#### 3. 自动迁移
- 用户首次访问新版本时
- 检测 localStorage 有数据
- 提示用户导入到服务器

## 三、实施步骤

### Phase 1: 基础设施搭建（30分钟）
1. ✅ 安装依赖 (mongoose)
2. ✅ 创建 MongoDB 连接
3. ✅ 定义数据模型（Schema）
4. ✅ 创建数据库工具函数

### Phase 2: API 改造（1-2小时）
1. ✅ 改造 `/api/questions` GET 从数据库读取
2. ✅ 改造 `/api/questions` POST 保存到数据库
3. ✅ 新增 `/api/messages` 路由
4. ✅ 改造 `/api/likes` 更新数据库
5. ✅ 改造 `/api/debates` 保存到数据库

### Phase 3: 前端改造（1-2小时）
1. ✅ 安装 SWR 或使用 fetch
2. ✅ 改造 useQuestions Hook
3. ✅ 改造 useDebateHistory Hook
4. ✅ 更新组件数据获取逻辑
5. ✅ 添加加载状态和错误处理

### Phase 4: 数据迁移（30分钟）
1. ✅ 添加导出功能
2. ✅ 创建迁移 API
3. ✅ 实现自动迁移逻辑

### Phase 5: 测试和部署（30分钟）
1. ✅ 本地测试
2. ✅ 部署到服务器
3. ✅ 配置环境变量
4. ✅ 数据迁移验证

## 四、环境变量配置

```env
# MongoDB Atlas 连接字符串
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/agent-zhihu?retryWrites=true&w=majority

# OpenAI API（已有）
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://...

# NextAuth（已有）
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your-secret
```

## 五、性能优化

### 1. 数据库索引
```javascript
// Questions Collection
questions.createIndex({ id: 1 }, { unique: true })
questions.createIndex({ createdAt: -1 })
questions.createIndex({ tags: 1 })
questions.createIndex({ status: 1 })

// Messages Collection
messages.createIndex({ id: 1 }, { unique: true })
messages.createIndex({ questionId: 1, createdAt: -1 })

// Debates Collection
debates.createIndex({ id: 1 }, { unique: true })
debates.createIndex({ userId: 1, createdAt: -1 })
```

### 2. 查询优化
- 使用投影减少数据传输
- 实现分页加载
- 缓存热门问题

### 3. 前端优化
- SWR 自动缓存和重新验证
- localStorage 作为离线缓存
- 虚拟滚动长列表

## 六、兼容性处理

### 1. 向后兼容
- 保留 localStorage 作为备份
- 新老数据格式兼容
- 渐进式迁移

### 2. 降级方案
- 数据库不可用时回退到 localStorage
- 显示离线模式提示

## 七、安全考虑

### 1. 数据验证
- 服务端验证所有输入
- 防止 XSS 和注入攻击
- 限流防止滥用

### 2. 访问控制
- 用户只能修改自己的数据
- AI 生成的内容公开可见
- 敏感信息不暴露

## 八、监控和日志

### 1. 错误追踪
- 记录数据库连接错误
- 记录 API 调用失败
- 前端错误上报

### 2. 性能监控
- 数据库查询耗时
- API 响应时间
- OpenAI API 调用成本

## 九、未来扩展

### 1. 实时协作
- 使用 WebSocket 或 Server-Sent Events
- 多用户同时查看时实时更新

### 2. 搜索功能
- MongoDB 全文搜索
- 或集成 Elasticsearch

### 3. 推荐系统
- 基于标签推荐相关问题
- 个性化内容推送

### 4. 数据分析
- 用户行为统计
- 热门话题分析
- AI 回答质量评估

## 十、风险和挑战

### 1. 数据迁移风险
- 现有用户数据可能丢失
- 解决：提供导出/导入功能

### 2. 性能问题
- 数据库查询可能较慢
- 解决：添加索引和缓存

### 3. 成本问题
- MongoDB 免费层有限制
- 解决：监控使用量，及时升级

### 4. 并发问题
- 多用户同时编辑
- 解决：乐观锁或悲观锁

## 总结

这个方案将 Agent-Zhihu 从纯客户端应用升级为真正的多用户协作平台，同时保持现有的优秀用户体验。通过 MongoDB 持久化数据，用户可以：

1. ✅ 随时随地访问自己的数据
2. ✅ 与其他用户共享讨论和辩论
3. ✅ 不再担心数据丢失
4. ✅ 享受更快的加载速度（通过缓存）
5. ✅ 参与真正的多用户协作

让我们开始实施！
