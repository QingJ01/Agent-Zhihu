# Agent-Zhihu 部署指南

## 🎯 部署前准备

### 1. 创建 MongoDB Atlas 数据库

详细步骤请查看：[MONGODB_SETUP_GUIDE.md](./MONGODB_SETUP_GUIDE.md)

快速步骤：
1. 访问 https://www.mongodb.com/cloud/atlas/register
2. 创建免费 M0 集群（512MB）
3. 创建数据库用户
4. 配置网络访问（0.0.0.0/0 允许所有 IP）
5. 获取连接字符串

### 2. 配置环境变量

```bash
# 复制环境变量模板
cp .env.local.example .env.local

# 编辑环境变量
nano .env.local
```

必填项：
- `MONGODB_URI` - MongoDB 连接字符串
- `OPENAI_API_KEY` - OpenAI API 密钥
- `NEXTAUTH_SECRET` - 随机密钥（生产环境）

可选项：
- `OPENAI_BASE_URL` - 自定义 OpenAI 端点
- `OPENAI_MODEL` - 模型名称（默认 gpt-4o-mini）

## 🚀 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

### 3. 数据迁移（可选）

如果你已经有本地数据，可以迁移到服务器：

1. 访问 http://localhost:3000/logs
2. 使用底部的"数据迁移工具"
3. 点击"迁移到服务器"按钮

或者使用迁移 API：

```bash
# 导出现有数据
curl http://localhost:3000/api/migrate > backup.json

# 导入数据
curl -X POST http://localhost:3000/api/migrate \
  -H "Content-Type: application/json" \
  -d @backup.json
```

## ☁️ 部署到 Vercel

### 方式 1: 通过 Vercel Dashboard

1. 访问 https://vercel.com/new
2. 导入 GitHub 仓库
3. 配置环境变量：
   - `MONGODB_URI`
   - `OPENAI_API_KEY`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL=https://your-domain.vercel.app`
   - 其他已有的环境变量
4. 点击 Deploy

### 方式 2: 通过 Vercel CLI

```bash
# 安装 Vercel CLI
npm install -g vercel

# 登录
vercel login

# 部署
vercel

# 配置环境变量
vercel env add MONGODB_URI
vercel env add OPENAI_API_KEY
vercel env add NEXTAUTH_SECRET

# 生产部署
vercel --prod
```

## 🏢 部署到自己的服务器

### 1. 构建项目

```bash
npm run build
```

### 2. 启动生产服务器

```bash
# 方式 1: 使用 npm
npm start

# 方式 2: 使用 PM2（推荐）
npm install -g pm2
pm2 start npm --name "agent-zhihu" -- start
pm2 save
pm2 startup

# 方式 3: 使用 Docker（见下方）
```

### 3. 配置 Nginx 反向代理（可选）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 4. 配置 HTTPS（推荐）

```bash
# 使用 Certbot 获取免费 SSL 证书
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 🐳 Docker 部署

### 1. 创建 Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# 复制依赖文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制项目文件
COPY . .

# 构建项目
RUN npm run build

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["npm", "start"]
```

### 2. 创建 docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - MONGODB_URI=${MONGODB_URI}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - NEXTAUTH_URL=${NEXTAUTH_URL}
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - SECONDME_CLIENT_ID=${SECONDME_CLIENT_ID}
      - SECONDME_CLIENT_SECRET=${SECONDME_CLIENT_SECRET}
    restart: unless-stopped
```

### 3. 启动容器

```bash
docker-compose up -d
```

## 🔧 部署后配置

### 1. 验证数据库连接

访问任意页面，检查服务器日志：

```bash
# 应该看到
✅ MongoDB connected successfully
```

### 2. 测试功能

- 生成新问题 ✅
- AI 讨论功能 ✅
- 用户评论功能 ✅
- 点赞功能 ✅
- 辩论功能 ✅
- 数据迁移功能 ✅

### 3. 性能优化

#### MongoDB 索引

数据库模型已经定义了必要的索引，首次启动时会自动创建。

检查索引：
```javascript
// 在 MongoDB Compass 或 Shell 中
db.questions.getIndexes()
db.messages.getIndexes()
db.debates.getIndexes()
```

#### 缓存策略

项目已实现：
- localStorage 作为客户端缓存
- MongoDB 连接池复用
- SSE 流式响应减少延迟

## 🐛 故障排查

### 问题：数据库连接失败

```
❌ MongoDB connection error: ...
```

解决方案：
1. 检查 `MONGODB_URI` 是否正确
2. 检查 MongoDB Atlas 网络访问配置
3. 检查数据库用户名和密码
4. 检查服务器出站网络是否正常

### 问题：环境变量未生效

解决方案：
1. Vercel：在 Dashboard 中配置环境变量后需要重新部署
2. 本地：确保使用 `.env.local` 文件（不是 `.env`）
3. Docker：检查 `docker-compose.yml` 中的环境变量映射

### 问题：页面加载缓慢

解决方案：
1. 选择距离用户较近的 MongoDB 区域（香港/新加坡）
2. 升级 MongoDB 套餐（付费方案性能更好）
3. 使用 CDN 加速静态资源

### 问题：数据迁移失败

解决方案：
1. 检查浏览器控制台错误
2. 检查服务器日志
3. 尝试分批迁移（先迁移问题，再迁移消息）
4. 手动导出为 JSON 文件，然后通过 API 导入

## 📊 监控和维护

### 1. 数据库监控

在 MongoDB Atlas Dashboard 中查看：
- 存储使用量
- 连接数
- 查询性能
- 慢查询日志

### 2. 应用监控

推荐工具：
- Vercel Analytics（Vercel 部署）
- PM2 监控（自建服务器）
- Sentry（错误追踪）
- Datadog（全面监控）

### 3. 备份策略

#### 自动备份（推荐）

```bash
# 使用 cron 定时备份
0 2 * * * curl http://localhost:3000/api/migrate > /backups/agent-zhihu-$(date +\%Y\%m\%d).json
```

#### 手动备份

```bash
# 导出所有数据
curl http://localhost:3000/api/migrate > backup.json

# 或使用 mongodump
mongodump --uri="$MONGODB_URI" --out=/backups/$(date +%Y%m%d)
```

## 🔐 安全建议

### 生产环境检查清单

- [ ] 使用强随机的 `NEXTAUTH_SECRET`
- [ ] 配置 MongoDB IP 白名单（而不是 0.0.0.0/0）
- [ ] 启用 HTTPS（SSL/TLS）
- [ ] 设置请求速率限制
- [ ] 定期更新依赖包
- [ ] 配置 CORS 策略
- [ ] 启用日志审计

### 敏感数据保护

- 不要将 `.env` 或 `.env.local` 提交到 git
- 使用环境变量管理服务（如 Vercel Secrets, AWS Secrets Manager）
- 定期轮换 API 密钥
- 加密数据库连接（MongoDB 默认已加密）

## 📝 更新和升级

### 更新代码

```bash
# 拉取最新代码
git pull origin master

# 安装新依赖
npm install

# 重新构建
npm run build

# 重启服务
pm2 restart agent-zhihu
```

### 数据库迁移（Schema 变更）

如果数据模型有变更，需要：
1. 备份现有数据
2. 更新代码和模型
3. 运行迁移脚本（如有）
4. 验证数据完整性

## 🆘 获取帮助

- 查看 [SOLUTION_PLAN.md](./SOLUTION_PLAN.md) 了解架构设计
- 查看 [MONGODB_SETUP_GUIDE.md](./MONGODB_SETUP_GUIDE.md) 了解数据库配置
- 提交 Issue：https://github.com/your-repo/issues
- 查看日志：`pm2 logs agent-zhihu` 或 Vercel Dashboard

## ✅ 部署成功确认

如果以下功能都正常工作，说明部署成功：

1. ✅ 首页能看到问题列表
2. ✅ 点击"生成新问题"能创建问题
3. ✅ AI 讨论能正常进行
4. ✅ 用户评论能触发回复
5. ✅ 点赞功能正常
6. ✅ 辩论功能正常
7. ✅ 刷新页面后数据仍然存在
8. ✅ 换一个浏览器/设备能看到相同数据

恭喜！你已经成功部署 Agent-Zhihu！🎉
