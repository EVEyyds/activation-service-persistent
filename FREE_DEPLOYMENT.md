# 免费平台部署指南

## 🚀 推荐免费部署方案

### 1. Vercel（最推荐⭐）

**优势**：
- ✅ 完全免费，无限制
- ✅ 全球CDN加速
- ✅ Git推送自动部署
- ✅ 零配置部署
- ✅ 无需休眠，24/7可用
- ✅ 自动HTTPS证书

**特点**：
- Serverless架构
- 内存数据库（重启后数据重置）
- 适合API服务
- 响应速度快

#### 部署步骤：

1. **准备Vercel账户**
   - 访问 [vercel.com](https://vercel.com)
   - 使用GitHub账户登录

2. **导入项目**
   - 点击 "New Project"
   - 选择GitHub仓库：`EVEyyds/activation-service-persistent`
   - Vercel会自动检测Node.js项目

3. **配置设置**
   - **Framework Preset**: `Other`
   - **Build Command**: `npm install`
   - **Output Directory**: `.`
   - **Install Command**: `npm install`

4. **部署完成**
   - Vercel自动部署
   - 获得URL：`https://activation-service.vercel.app`

---

### 2. Replit（备选方案）

**优势**：
- ✅ 在线IDE，无需本地环境
- ✅ 一键部署
- ✅ 完全免费

**限制**：
- 资源限制较严格
- 有流量限制

#### 部署步骤：

1. **访问Replit**
   - [replit.com](https://replit.com)
   - 导入GitHub仓库

2. **运行项目**
   - 点击 "Run" 按钮
   - 自动安装依赖并启动

3. **部署为Web服务**
   - 点击 "Share" → "Publish as website"
   - 获得公开URL

---

### 3. Glitch（适合测试）

**优势**：
- ✅ 在线编辑器
- ✅ 实时协作
- ✅ 免费托管

**限制**：
- 项目会休眠
- 资源限制

#### 部署步骤：

1. **访问Glitch**
   - [glitch.com](https://glitch.com)
   - "New Project" → "Import from GitHub"

2. **导入项目**
   - 输入GitHub仓库地址
   - 等待导入完成

3. **启动服务**
   - 自动启动并分配URL

---

## 🎯 推荐选择

### 🏆 首选：Vercel
- **24/7无休眠**
- **全球CDN加速**
- **完全免费**
- **适合API服务**
- **零配置部署**

### 🥈 备选：Replit
- **适合开发测试**
- **在线IDE方便**

## 🔧 部署前准备

### 1. 更新.gitignore（如果需要）
```gitignore
# 现有规则...
node_modules/
.env
logs/
*.log

# Vercel/Render忽略
.vercel
.cache/
```

### 2. 推送最新代码
```bash
git add .
git commit -m "feat: add multi-platform deployment support

- Add render.yaml for Render deployment
- Add vercel.json for Vercel deployment
- Add Vercel API adapter
- Add free deployment guide"
git push
```

### 3. 选择平台并按照指南部署

## 📊 平台对比

| 平台 | 免费额度 | 数据持久化 | 无休眠 | 部署复杂度 | 推荐度 |
|------|----------|------------|--------|------------|--------|
| Vercel | 无限制 | ⚠️ 内存数据 | ✅ 24/7 | 🟢 超简单 | ⭐⭐⭐⭐⭐ |
| Replit | 无限制 | ✅ | ✅ 24/7 | 🟢 简单 | ⭐⭐⭐⭐ |
| Glitch | 有限制 | ✅ | ❌ 会休眠 | 🟢 简单 | ⭐⭐⭐ |

## 🛠️ 故障排除

### Vercel部署问题
- ✅ 确认api/index.js文件存在
- ✅ 检查vercel.json配置
- ✅ 查看Function Logs
- ✅ 确保所有依赖都在package.json中

### Replit部署问题
- 检查Start Command是否为 `npm start`
- 确认端口设置为3000
- 查看控制台错误信息

### 通用问题
- Node.js版本：Vercel使用现代版本，无需担心
- 依赖安装：确保package.json正确
- 端口绑定：Vercel自动处理端口

## 🎉 部署成功验证

部署完成后，访问：
- 健康检查：`{your-url}/health`
- API测试：`{your-url}/api/verify`

## 💡 关于数据持久化的说明

### Vercel内存数据库特点
- ✅ **24/7在线**：不会休眠
- ⚠️ **内存数据**：函数重启后数据会重置
- ✅ **足够使用**：包含5个预设激活码
- ✅ **日志记录**：记录最近100条验证日志

### 内置激活码
- `DEMO_001`, `DEMO_002` (24小时验证)
- `PREMIUM_001` (72小时验证)
- `TEST_001` (1小时验证)
- `BATCH_001` (168小时验证)

### 如需持久化数据
- 考虑使用外部数据库服务（如Supabase）
- 或者使用Replit（支持文件持久化）

**强烈推荐使用Vercel**：
- 解决Node.js版本问题
- 24/7无休眠运行
- 全球CDN加速
- 部署最简单
- 完全免费

按照Vercel指南操作，应该能成功部署！🚀