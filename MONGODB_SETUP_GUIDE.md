# MongoDB Atlas 创建指南

## 5分钟快速创建免费数据库

### 步骤 1: 注册 MongoDB Atlas 账号

1. 访问：https://www.mongodb.com/cloud/atlas/register
2. 注册免费账号（可使用 Google/GitHub 账号）
3. 登录后进入控制台

### 步骤 2: 创建免费集群

1. 点击 "Build a Database"（或 "Create"）
2. 选择 **FREE** 套餐（Shared，M0）
   - 512MB 存储
   - 共享 RAM
   - 完全免费，无需信用卡
3. 选择云服务商和区域（推荐）：
   - **AWS** + **香港 (ap-east-1)** - 国内访问快
   - 或 **AWS** + **新加坡 (ap-southeast-1)**
4. Cluster Name: `agent-zhihu`（或任意名称）
5. 点击 "Create Cluster"（等待3-5分钟）

### 步骤 3: 配置数据库访问

#### 3.1 创建数据库用户
1. 左侧菜单 → **Database Access**
2. 点击 "Add New Database User"
3. 选择 **Password** 认证
4. 设置用户名和密码（记住这个！）
   - 用户名：`agent-zhihu-user`
   - 密码：生成强密码（或自定义）
5. Database User Privileges: **Atlas Admin**（或 Read and write to any database）
6. 点击 "Add User"

#### 3.2 配置网络访问
1. 左侧菜单 → **Network Access**
2. 点击 "Add IP Address"
3. 选择 **Allow Access from Anywhere**（允许所有 IP）
   - IP Address: `0.0.0.0/0`
   - 说明：生产环境建议配置具体 IP，开发阶段可以全部允许
4. 点击 "Confirm"

### 步骤 4: 获取连接字符串

1. 回到 **Database** 页面
2. 找到你的集群，点击 **Connect**
3. 选择 **Drivers**
4. Driver: **Node.js**，Version: **最新版本**
5. 复制连接字符串（Connection String）：

```
mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

6. **重要**：替换连接字符串中的占位符：
   - `<username>` → 你的数据库用户名（如 `agent-zhihu-user`）
   - `<password>` → 你的数据库密码
   - 在 `mongodb.net/` 后添加数据库名：`mongodb.net/agent-zhihu?...`

### 最终连接字符串示例

```
mongodb+srv://agent-zhihu-user:your_password@cluster0.xxxxx.mongodb.net/agent-zhihu?retryWrites=true&w=majority
```

### 步骤 5: 配置到项目

将连接字符串添加到项目环境变量：

1. 在项目根目录创建 `.env.local` 文件（如果没有）
2. 添加以下内容：

```bash
# MongoDB 连接字符串
MONGODB_URI=mongodb+srv://agent-zhihu-user:your_password@cluster0.xxxxx.mongodb.net/agent-zhihu?retryWrites=true&w=majority

# 其他已有的环境变量...
```

3. **不要提交到 git**（`.env.local` 已在 `.gitignore` 中）

### 步骤 6: 验证连接

我会在代码中添加连接测试，确保配置正确。

---

## 常见问题

### Q: 免费层有什么限制？
A:
- 存储：512MB（约可存储 10万+ 条讨论消息）
- 连接数：500 并发
- 备份：不支持自动备份（需手动导出）
- 性能：共享集群，性能略低但够用

### Q: 什么时候需要升级？
A:
- 数据超过 512MB
- 需要更高性能
- 需要自动备份
- 需要专用集群

升级费用：M2 起步 $9/月

### Q: 数据安全吗？
A:
- MongoDB Atlas 有 SSL 加密传输
- 数据存储在云端，比 localStorage 更安全
- 建议生产环境配置具体 IP 白名单

### Q: 如何备份数据？
A:
- 免费层：使用 MongoDB Compass 或 mongodump 手动导出
- 付费层：自动备份

### Q: 国内访问速度如何？
A:
- 选择香港或新加坡区域，延迟通常 50-150ms
- 建议添加缓存层优化

---

## 下一步

配置完成后，我将：
1. ✅ 安装 mongoose 依赖
2. ✅ 创建数据库连接
3. ✅ 定义数据模型
4. ✅ 改造 API 路由
5. ✅ 更新前端逻辑
6. ✅ 测试和部署

**准备好连接字符串后，告诉我即可开始代码改造！**
