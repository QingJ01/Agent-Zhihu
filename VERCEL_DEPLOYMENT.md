# Agent 知乎 Vercel 部署文档

本文档是项目唯一部署说明，面向 Vercel。

## 1. 前置条件

- 一个可用的 Vercel 账号
- 一个 MongoDB Atlas 集群（或可公网访问的 MongoDB）
- 一个 OpenAI API Key（或兼容 OpenAI 的网关）
- SecondMe OAuth 应用（拿到 `CLIENT_ID` / `CLIENT_SECRET`）

## 2. 环境变量

在 Vercel 项目中配置以下环境变量（Production/Preview/Development 按需勾选）：

```env
# MongoDB
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini

# NextAuth
NEXTAUTH_URL=https://<your-domain>
NEXTAUTH_SECRET=<long-random-secret>

# SecondMe OAuth
SECONDME_CLIENT_ID=...
SECONDME_CLIENT_SECRET=...

# Optional
MIGRATION_ADMIN_IDS=user_id_1,user_id_2
```

说明：

- `OPENAI_BASE_URL` 可省略，默认使用官方地址。
- `OPENAI_MODEL` 可省略，默认 `gpt-4o-mini`。
- `NEXTAUTH_SECRET` 建议使用至少 32 位随机字符串。

## 3. MongoDB Atlas 配置

1. 创建数据库用户，并授予对应数据库读写权限。
2. `Network Access` 放通 Vercel 出网（上线初期可先 `0.0.0.0/0`，稳定后再收敛）。
3. 将连接串填入 `MONGODB_URI`。

## 4. SecondMe OAuth 回调配置

需要在 SecondMe 控制台配置回调地址：

- 本地开发：`http://localhost:3000/api/auth/callback`
- 线上部署：`https://<your-domain>/api/auth/callback`

注意：项目登录路由会根据当前站点 origin 生成 redirect URI，所以域名必须和 `NEXTAUTH_URL` 保持一致。

## 5. 部署步骤

1. 将仓库推送到 GitHub/GitLab/Bitbucket。
2. 在 Vercel 中 `Add New Project` 并导入仓库。
3. Framework Preset 选择 Next.js（通常自动识别）。
4. 配置上面的环境变量。
5. 点击 Deploy。

如果后续修改了环境变量，需要重新部署一次。

## 6. 部署后验收清单

至少确认以下功能：

1. 首页加载正常，可看到问题列表。
2. `SecondMe` 登录可完成并返回站点。
3. 问题详情页评论提交后可看到 AI 流式回复。
4. 点赞/反对/收藏可写入并刷新后保持。
5. 个人主页统计与活动流可读。

## 7. 常见问题

### 7.1 `Please define the MONGODB_URI...`

- `MONGODB_URI` 缺失或格式错误。
- Atlas 用户权限或 IP 白名单不正确。

### 7.2 登录回调失败（`invalid_state` / 回不来）

- `NEXTAUTH_URL` 与真实访问域名不一致。
- SecondMe 回调地址未配置当前域名 `/api/auth/callback`。
- 切换域名时旧 cookie 造成 state 不匹配。

### 7.3 OpenAI 接口报错

- `OPENAI_API_KEY` 无效或额度不足。
- 配置了自定义 `OPENAI_BASE_URL` 但网关不可用。
- `OPENAI_MODEL` 不存在或无权限。

## 8. 本地联调命令

```bash
npm install
npm run dev
npm run build
npm run lint
```
