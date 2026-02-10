# SecondMe 登录配置指南

## 🔧 问题原因

登录报错"回调地址不匹配"是因为 SecondMe 开发者平台配置的回调地址与实际不匹配。

---

## ✅ 正确的回调地址

根据项目配置（src/lib/secondme.ts），回调地址应该是：

```
http://119.29.73.193/api/auth/callback
```

**重要：**
- 端口：80（默认 HTTP 端口，不需要写）
- 路径：`/api/auth/callback`
- 完整 URL：`http://119.29.73.193/api/auth/callback`

---

## 📝 配置步骤

### 1. 登录 SecondMe 开发者平台

访问：https://develop-docs.second.me/

### 2. 找到你的应用

- 进入"我的应用"或"Applications"
- 找到你创建的应用（Client ID: `c1ad2021-72a6-482d-9a35-7619c54f3f63`）

### 3. 更新回调地址

在应用配置中，找到"回调地址"（Redirect URI）字段，设置为：

```
http://119.29.73.193/api/auth/callback
```

### 4. 保存配置

点击保存按钮，等待配置生效（通常立即生效）。

---

## 🔍 验证配置

### 方法 1: 浏览器测试

1. 打开浏览器访问：http://119.29.73.193
2. 点击登录按钮
3. 应该会跳转到 SecondMe 授权页面
4. 授权后会跳转回你的应用

### 方法 2: 查看跳转URL

点击登录后，查看浏览器地址栏的 URL，应该类似：

```
https://go.second.me/oauth/?client_id=c1ad2021-72a6-482d-9a35-7619c54f3f63&redirect_uri=http%3A%2F%2F119.29.73.193%2Fapi%2Fauth%2Fcallback&response_type=code&state=...
```

注意 `redirect_uri` 参数的值（URL 编码后）应该是 `http://119.29.73.193/api/auth/callback`。

---

## 🔄 OAuth 流程说明

完整的登录流程：

```
1. 用户点击登录
   ↓
2. 跳转到 SecondMe OAuth
   URL: https://go.second.me/oauth/?client_id=...&redirect_uri=http://119.29.73.193/api/auth/callback
   ↓
3. 用户授权
   ↓
4. 回调到你的应用
   URL: http://119.29.73.193/api/auth/callback?code=lba_ac_xxx&state=xxx
   ↓
5. 后端exchange code 换取 token
   ↓
6. 后端获取用户信息
   ↓
7. 设置session并重定向到首页
   ↓
8. 登录完成 ✅
```

---

## ⚠️ 常见错误

### 错误 1: 回调地址不匹配

**错误信息：** "redirect_uri_mismatch" 或 "回调地址不匹配"

**原因：** SecondMe 平台配置的回调地址与实际不一致

**解决方案：**
1. 检查 SecondMe 平台配置的回调地址
2. 确保精确匹配（包括协议、域名、端口、路径）：`http://119.29.73.193/api/auth/callback`

### 错误 2: Invalid state

**错误信息：** "invalid_state"

**原因：** State 参数验证失败（可能是 cookie 被清除）

**解决方案：**
1. 清除浏览器 cookie
2. 重新点击登录

### 错误 3: 授权码过期

**错误信息：** "invalid_grant" 或 "code expired"

**原因：** 授权码有效期只有 5 分钟

**解决方案：**
1. 重新点击登录
2. 在 5 分钟内完成授权流程

---

## 🌐 使用域名（可选）

如果你有域名（如 `agent-zhihu.com`），回调地址应该配置为：

```
https://agent-zhihu.com/api/auth/callback
```

**注意：**
1. 使用 HTTPS（更安全）
2. 更新 `.env` 文件中的 `NEXTAUTH_URL`
3. 在 SecondMe 平台更新回调地址
4. 重启应用：`pm2 restart agent-zhihu --update-env`

---

## 📱 多个回调地址

如果需要支持多个环境（开发、测试、生产），可以在 SecondMe 平台配置多个回调地址：

```
http://localhost:3000/api/auth/callback        # 本地开发
http://119.29.73.193/api/auth/callback         # 生产环境
https://agent-zhihu.com/api/auth/callback      # 域名（如有）
```

---

## 🔐 环境变量配置

当前 `.env` 文件中的相关配置：

```env
# SecondMe OAuth Configuration
SECONDME_CLIENT_ID=c1ad2021-72a6-482d-9a35-7619c54f3f63
SECONDME_CLIENT_SECRET=d4c1826a90217deaac1945edf0c691878505d0bf7acc4137c5d3a46d03efd33c

# NextAuth Configuration
NEXTAUTH_URL=http://119.29.73.193
```

**回调地址计算公式：**
```
回调地址 = NEXTAUTH_URL + "/api/auth/callback"
       = http://119.29.73.193 + /api/auth/callback
       = http://119.29.73.193/api/auth/callback
```

---

## 🧪 测试登录功能

### 步骤 1: 清除浏览器缓存

按 `Ctrl + Shift + Delete`，清除缓存和 Cookie

### 步骤 2: 访问网站

http://119.29.73.193

### 步骤 3: 点击登录

应该看到 SecondMe 授权页面

### 步骤 4: 授权

点击"授权"按钮

### 步骤 5: 验证登录

登录成功后，应该能看到：
- 右上角显示你的头像和名字
- 头像旁边有"退出"按钮

---

## 📞 获取帮助

如果配置后仍然有问题：

1. **查看浏览器控制台**
   - 按 F12 打开开发者工具
   - 查看 Console 标签页的错误信息

2. **查看服务器日志**
   ```bash
   pm2 logs agent-zhihu --lines 50
   ```

3. **查看 SecondMe 文档**
   - OAuth2 指南：https://develop-docs.second.me/zh/docs/authentication/oauth2
   - API 参考：https://develop-docs.second.me/zh/docs/api-reference/oauth

---

## ✅ 配置完成检查清单

- [ ] SecondMe 平台回调地址已更新为：`http://119.29.73.193/api/auth/callback`
- [ ] `.env` 文件中 `NEXTAUTH_URL` 已设置为：`http://119.29.73.193`
- [ ] 应用已重启：`pm2 restart agent-zhihu --update-env`
- [ ] 浏览器缓存已清除
- [ ] 测试登录功能正常

完成以上步骤后，登录功能应该可以正常使用！🎉
