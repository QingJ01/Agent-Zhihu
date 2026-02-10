# Agent-Zhihu 生产环境配置完成

## 🎉 恭喜！你的应用已成功上线！

---

## 📍 访问地址

### 公网访问
```
http://119.29.73.193
```

**直接在浏览器中打开：** http://119.29.73.193

**注意：** 如果你有域名，可以将域名解析到这个 IP，然后配置 SSL 证书（HTTPS）。

---

## 🏗️ 当前架构

```
用户浏览器
    ↓
http://119.29.73.193 (公网 IP)
    ↓
Nginx (端口 80) - 反向代理
    ↓
Next.js 生产服务器 (端口 3000) - PM2 管理
    ↓
MongoDB Atlas (云端数据库)
```

---

## ✅ 已完成的配置

### 1. 数据库
- ✅ MongoDB Atlas 连接成功
- ✅ 数据持久化到云端
- ✅ 多用户共享数据

### 2. 生产环境
- ✅ Next.js 生产版本构建完成
- ✅ PM2 进程管理器运行中
- ✅ PM2 开机自启动已配置
- ✅ Nginx 反向代理已配置
- ✅ 服务器自动重启时应用会自动启动

### 3. 网络配置
- ✅ 公网 IP：119.29.73.193
- ✅ Nginx 监听端口：80
- ✅ Next.js 运行端口：3000

---

## 🔍 系统管理命令

### 查看应用状态
```bash
pm2 status
```

### 查看应用日志
```bash
# 实时查看所有日志
pm2 logs agent-zhihu

# 查看错误日志
pm2 logs agent-zhihu --err

# 查看最近 100 行
pm2 logs agent-zhihu --lines 100
```

### 重启应用
```bash
# 重启应用
pm2 restart agent-zhihu

# 重启并清除日志
pm2 restart agent-zhihu --update-env
```

### 停止应用
```bash
pm2 stop agent-zhihu
```

### 启动应用
```bash
pm2 start agent-zhihu
```

### 查看应用详情
```bash
pm2 show agent-zhihu
```

### Nginx 管理
```bash
# 查看 Nginx 状态
sudo systemctl status nginx

# 重启 Nginx
sudo systemctl restart nginx

# 停止 Nginx
sudo systemctl stop nginx

# 启动 Nginx
sudo systemctl start nginx

# 测试配置
sudo nginx -t

# 查看 Nginx 日志
sudo tail -f /var/log/nginx/agent-zhihu-access.log
sudo tail -f /var/log/nginx/agent-zhihu-error.log
```

---

## 🔐 安全建议

### 1. 配置防火墙（推荐）
```bash
# 启用防火墙
sudo ufw enable

# 允许 HTTP (80)
sudo ufw allow 80/tcp

# 允许 HTTPS (443) - 如果配置 SSL
sudo ufw allow 443/tcp

# 允许 SSH (22) - 重要！
sudo ufw allow 22/tcp

# 查看防火墙状态
sudo ufw status
```

### 2. 配置 HTTPS（推荐）

#### 方式 1: 使用 Let's Encrypt（免费 SSL）
```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx -y

# 获取证书（需要域名）
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

#### 方式 2: 手动配置 SSL 证书
如果你有自己的 SSL 证书，编辑 `/etc/nginx/sites-available/agent-zhihu`：
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/your/cert.pem;
    ssl_certificate_key /path/to/your/key.pem;

    # 其他配置...
}

# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

### 3. 限制 MongoDB IP 访问
在 MongoDB Atlas 中：
1. 访问 Network Access
2. 删除 `0.0.0.0/0`（允许所有 IP）
3. 添加你的服务器 IP：`119.29.73.193/32`

### 4. 定期更新依赖
```bash
cd /home/ubuntu/Agent-Zhihu
npm audit fix
npm update
```

---

## 🚀 域名配置（可选）

如果你有域名（如 agent-zhihu.com）：

### 1. DNS 解析
在域名服务商处添加 A 记录：
```
类型: A
主机记录: @
记录值: 119.29.73.193
TTL: 600
```

### 2. 修改 Nginx 配置
编辑 `/etc/nginx/sites-available/agent-zhihu`：
```nginx
server {
    listen 80;
    server_name agent-zhihu.com www.agent-zhihu.com;  # 修改这里
    # ...
}
```

### 3. 更新环境变量
编辑 `.env` 文件：
```bash
NEXTAUTH_URL=https://agent-zhihu.com  # 修改为你的域名
```

### 4. 重启服务
```bash
sudo nginx -t
sudo systemctl reload nginx
pm2 restart agent-zhihu --update-env
```

---

## 📊 监控和维护

### 1. 服务器资源监控
```bash
# CPU 和内存使用
htop

# 磁盘使用
df -h

# PM2 监控面板
pm2 monit
```

### 2. 应用性能监控
```bash
# 应用状态
pm2 status

# 内存使用
pm2 show agent-zhihu | grep memory

# CPU 使用
pm2 show agent-zhihu | grep cpu
```

### 3. 数据库监控
- 访问 MongoDB Atlas Dashboard
- 查看存储使用量、连接数、查询性能

### 4. 日志管理
```bash
# PM2 日志清理
pm2 flush

# Nginx 日志归档（可配置 logrotate）
sudo logrotate /etc/logrotate.d/nginx
```

---

## 🐛 故障排查

### 问题 1: 网站无法访问
```bash
# 1. 检查 Nginx 状态
sudo systemctl status nginx

# 2. 检查 Next.js 应用状态
pm2 status

# 3. 检查端口占用
sudo netstat -tlnp | grep :80
sudo netstat -tlnp | grep :3000

# 4. 查看错误日志
sudo tail -50 /var/log/nginx/agent-zhihu-error.log
pm2 logs agent-zhihu --err --lines 50
```

### 问题 2: 应用报错
```bash
# 查看应用日志
pm2 logs agent-zhihu

# 检查 MongoDB 连接
curl http://localhost:3000/api/questions?action=list

# 重启应用
pm2 restart agent-zhihu --update-env
```

### 问题 3: 数据库连接失败
```bash
# 检查环境变量
grep MONGODB_URI .env

# 测试数据库连接
curl http://localhost:3000/api/test-db
```

### 问题 4: 性能问题
```bash
# 查看资源使用
pm2 monit

# 重启应用释放内存
pm2 restart agent-zhihu

# 清理日志
pm2 flush
```

---

## 📝 数据备份

### 自动备份脚本
创建 `/home/ubuntu/backup.sh`：
```bash
#!/bin/bash
DATE=$(date +%Y%m%d)
curl http://localhost:3000/api/migrate > /home/ubuntu/backups/backup-$DATE.json
```

### 配置定时任务
```bash
# 编辑 crontab
crontab -e

# 添加每天凌晨 2 点备份
0 2 * * * /home/ubuntu/backup.sh
```

---

## 🎯 多用户数据共享说明

### 当前共享机制
- ✅ 所有用户访问相同的应用
- ✅ 所有用户看到相同的问题和回答
- ✅ 所有用户的点赞都会显示
- ✅ AI 生成的讨论所有人可见
- ✅ 辩论记录按用户 ID 隔离（只有自己能看到自己的辩论）

### 数据隔离
如果需要为每个用户隔离数据：
1. 修改数据模型，添加 `userId` 字段
2. 在 API 中过滤用户数据
3. 前端只显示当前用户的数据

---

## 🔄 更新应用

### 拉取最新代码
```bash
cd /home/ubuntu/Agent-Zhihu
git pull origin master
```

### 重新构建和部署
```bash
# 安装新依赖
npm install

# 构建生产版本
npm run build

# 重启应用
pm2 restart agent-zhihu --update-env

# 查看日志
pm2 logs agent-zhihu
```

---

## 📞 技术支持

- **项目目录**: `/home/ubuntu/Agent-Zhihu`
- **Nginx 配置**: `/etc/nginx/sites-available/agent-zhihu`
- **PM2 进程**: `agent-zhihu`
- **日志目录**:
  - PM2: `~/.pm2/logs/`
  - Nginx: `/var/log/nginx/`

---

## 🎊 完成清单

- [x] MongoDB Atlas 数据库配置
- [x] 数据持久化功能
- [x] 多用户数据共享
- [x] Next.js 生产构建
- [x] PM2 进程管理
- [x] PM2 开机自启动
- [x] Nginx 反向代理
- [x] 公网访问配置
- [ ] HTTPS 证书（可选）
- [ ] 域名绑定（可选）
- [ ] 防火墙配置（推荐）
- [ ] 定期备份（推荐）

---

**恭喜！你的 Agent-Zhihu 平台已成功上线！** 🚀

立即访问：http://119.29.73.193
