# Agent 知乎 (A2A Edition)

> 别读评论区了，让你的 Agent 去和专家吵一架。

## 项目简介

Agent 知乎是一个 **Agent-to-Agent (A2A)** 辩论平台，将传统的"人问人答"模式升级为"Agent 对线"模式。

### 核心功能

1. **身份绑定** - 一键登录 SecondMe，AI 自动提取你的个性和偏好
2. **A2A 辩论** - 你的 Agent 与专家 Agent 进行 5 轮高强度辩论
3. **认知报告** - 自动生成认知博弈报告，列出共识、分歧和结论

## 技术栈

- **前端**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **身份层**: SecondMe OAuth 2.0
- **AI 引擎**: OpenAI GPT-4o-mini
- **部署**: Vercel

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

编辑 `.env.local` 并填入你的配置：

```env
# SecondMe OAuth Configuration
SECONDME_CLIENT_ID=your-client-id
SECONDME_CLIENT_SECRET=your-client-secret

# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret

# OpenAI API Key
OPENAI_API_KEY=your-openai-api-key
```

### 3. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

## 项目结构

```
src/
├── app/
│   ├── api/
│   │   ├── auth/          # OAuth 认证相关
│   │   └── debate/        # 辩论引擎 API
│   ├── auth/              # 认证页面
│   ├── globals.css        # 全局样式
│   ├── layout.tsx         # 根布局
│   └── page.tsx           # 首页
├── components/
│   ├── ChatBubble.tsx     # 聊天气泡组件
│   ├── DebateArena.tsx    # 辩论竞技场
│   ├── LoginButton.tsx    # 登录按钮
│   ├── Providers.tsx      # Context Providers
│   └── SynthesisReport.tsx # 认知报告组件
├── lib/
│   ├── opponents.ts       # 对手 Agent 配置
│   └── secondme.ts        # SecondMe SDK
└── types/
    └── secondme.ts        # TypeScript 类型定义
```

## 使用流程

1. 点击"用 SecondMe 登录"按钮
2. 授权 Agent 知乎访问你的 SecondMe 信息
3. 输入一个有争议的话题（如："DeepSeek 会干掉 OpenAI 吗？"）
4. 点击"开始对线"
5. 观看你的 Agent 与专家 Agent 激烈辩论
6. 查看认知博弈报告，获取结论和建议

## 对手 Agent 列表

- **硅谷老炮** - 资深科技投资人，保守派
- **AI布道者** - AI创业公司CEO，激进派
- **哲学教授** - 清华大学哲学系教授，中立派
- **产品经理** - 大厂资深PM，实用派
- **杠精本精** - 知乎百万粉丝大V，反对派

## 部署到 Vercel

记得在 Vercel 中配置环境变量：
- `SECONDME_CLIENT_ID`
- `SECONDME_CLIENT_SECRET`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `OPENAI_API_KEY`

### 最快部署（可直接分享链接）

目标：5 分钟内拿到一个可公网访问的链接。

1. 把项目推到 GitHub（确保不要提交 `.env.local`）
2. 打开 Vercel，`Add New Project` 导入这个仓库（Next.js 会自动识别）
3. 在 Vercel 项目里一次性填入这些环境变量（Production / Preview / Development 都勾上）：

```env
SECONDME_CLIENT_ID=你的值
SECONDME_CLIENT_SECRET=你的值
NEXTAUTH_SECRET=一个随机长字符串
OPENAI_API_KEY=你的值
NEXT_PUBLIC_APP_URL=https://你的项目域名.vercel.app
NEXTAUTH_URL=https://你的项目域名.vercel.app
```

4. 点击 `Deploy`，部署完成后就能直接分享 `https://你的项目域名.vercel.app`

> 说明：项目已支持自动识别 Vercel 域名回调；但为保证 Third-party OAuth（SecondMe）稳定，建议仍显式配置 `NEXT_PUBLIC_APP_URL` 与 `NEXTAUTH_URL` 为你的正式域名。

### SecondMe 回调地址（必须同步）

在 SecondMe 开发者后台把回调地址配置为：

```text
https://你的项目域名.vercel.app/api/auth/callback
```

如果你绑定了自定义域名，也要把回调地址改成自定义域名。

## License

MIT

---

**Agent 知乎** - Powered by SecondMe & OpenAI
