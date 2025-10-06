# 持久有效激活验证服务

## 项目概述

这是一个专为Chrome插件等客户端应用设计的激活验证服务。采用**持久有效激活码**的设计理念，激活码永远不会真正失效，只是控制前端多久验证一次。

## 核心特性

- ✅ **持久有效激活码**：激活码永不过期，后端始终返回成功
- ✅ **灵活验证间隔**：不同激活码可设置不同的验证周期（1小时/24小时/72小时等）
- ✅ **轻量级架构**：SQLite数据库，零配置启动
- ✅ **完整系统架构**：Express.js + SQLite + 安全中间件
- ✅ **前端控制逻辑**：根据返回的`next_verify_at`控制验证时机
- ✅ **简单易用**：一个核心接口搞定所有验证需求

## 设计理念

### 传统方案 vs 本方案

| 方面 | 传统方案 | 本方案 |
|------|----------|--------|
| 激活码失效 | 后端拒绝验证 | 永远通过验证 |
| 过期控制 | 后端强制过期 | 前端自主控制 |
| 验证逻辑 | 复杂的过期计算 | 简单的时间判断 |
| 用户体验 | 过期需重新输入 | 自动续期验证 |

### 核心逻辑

1. **后端验证**：只要激活码存在且状态为active，就返回成功
2. **时间控制**：返回`next_verify_at`告诉前端下次验证时间
3. **前端控制**：前端根据当前时间和`next_verify_at`决定是否重新验证
4. **自动续期**：验证间隔到期后自动重新验证，无需用户干预

## 技术栈

- **运行时**: Node.js 14+
- **Web框架**: Express.js 4.x
- **数据库**: SQLite3
- **安全**: Helmet, CORS, Rate Limit
- **日志**: Morgan

## 快速开始

### 1. 环境要求
- Node.js 14.0+
- npm 6.0+

### 2. 安装依赖
```bash
npm install
```

### 3. 启动服务
```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

### 4. 验证安装
访问 http://localhost:3000/health 查看服务状态

## 项目结构

```
activation-service-persistent/
├── src/
│   ├── app.js                  # 应用入口
│   └── database/
│       └── init.sql           # 数据库初始化脚本
├── data/
│   └── activation.db          # SQLite数据库文件（自动创建）
├── docs/
│   ├── api-documentation.md   # 详细API接口文档
│   ├── development-guide.md   # 开发指南
│   └── technical-design.md    # 技术设计文档
├── .env.example               # 环境变量模板
├── package.json               # 项目配置
└── README.md                  # 项目说明
```

## 默认激活码

服务启动时会自动创建以下激活码：

| 激活码 | 产品 | 验证间隔 | 说明 |
|--------|------|----------|------|
| DEMO_001 | doubao_plugin | 24小时 | 演示激活码 |
| DEMO_002 | doubao_plugin | 24小时 | 演示激活码 |
| PREMIUM_001 | doubao_plugin | 72小时 | 高级激活码 |
| TEST_001 | test_product | 1小时 | 测试激活码 |

## 核心接口

### 激活验证接口

**接口**: `POST /api/verify`

**功能**: 验证激活码，返回下次验证时间

**请求示例**:
```json
{
  "code": "DEMO_001",
  "product_key": "doubao_plugin",
  "device_id": "chrome_device_123"
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "status": "active",
    "next_verify_at": "2024-01-02T12:00:00.000Z",
    "verify_interval_hours": 24,
    "activated_at": "2024-01-01T12:00:00.000Z"
  },
  "message": "验证成功"
}
```

详细的接口文档请参考: [API接口文档](docs/api-documentation.md)

## Chrome插件集成示例

### 前端验证逻辑
```javascript
class ActivationClient {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async verify(code, productKey, deviceId = null) {
    const response = await fetch(`${this.baseUrl}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        product_key: productKey,
        device_id: deviceId
      })
    });

    const result = await response.json();

    if (result.success) {
      // 保存下次验证时间
      chrome.storage.local.set({
        activated: true,
        nextVerifyAt: result.data.next_verify_at,
        lastVerify: new Date().toISOString()
      });
    }

    return result;
  }

  async checkStatus() {
    const data = await chrome.storage.local.get(['activated', 'nextVerifyAt']);

    if (!data.activated) return { activated: false };

    const now = new Date();
    const nextVerifyTime = new Date(data.nextVerifyAt);

    return {
      activated: true,
      needVerify: now >= nextVerifyTime,
      remainingHours: Math.max(0, Math.floor((nextVerifyTime - now) / (1000 * 60 * 60)))
    };
  }
}

// 自动验证管理
async function autoVerify() {
  const status = await activationClient.checkStatus();

  if (status.needVerify) {
    // 重新验证
    const { savedCode } = await chrome.storage.local.get(['savedCode']);
    await activationClient.verify(savedCode, 'doubao_plugin');
  }
}

// 定期检查
setInterval(autoVerify, 60 * 60 * 1000); // 每小时检查一次
```

## 部署说明

### 本地部署
```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（可选）
cp .env.example .env

# 3. 启动服务
npm start
```

### 生产环境部署
```bash
# 使用PM2进程管理
npm install -g pm2
pm2 start src/app.js --name activation-service
pm2 startup
pm2 save
```

## 监控和维护

### 健康检查
```bash
# 基础健康检查
curl http://localhost:3000/health

# 查看服务统计
curl http://localhost:3000/api/stats
```

### 日志查看
```bash
# PM2日志
pm2 logs activation-service

# 或者直接查看控制台输出
```

## 安全考虑

1. **速率限制**: 每个IP每分钟最多30次请求
2. **输入验证**: 严格的参数验证
3. **安全头部**: 使用Helmet中间件
4. **CORS配置**: 仅允许Chrome插件访问

## 常见问题

### Q1: 激活码会过期吗？
A: 不会。激活码是持久有效的，只要状态为active就永远返回验证成功。

### Q2: 如何控制验证频率？
A: 通过`verify_interval_hours`字段控制，不同激活码可以设置不同的验证间隔。

### Q3: 前端如何知道何时重新验证？
A: 响应中的`next_verify_at`字段告诉前端下次应该验证的时间。

### Q4: 验证失败怎么办？
A: 只有当激活码不存在或被禁用时才会验证失败，此时需要用户提供新的激活码。

## 开发指南

详细的开发指南请参考: [开发指南](docs/development-guide.md)

技术设计文档请参考: [技术设计文档](docs/technical-design.md)

## 许可证

MIT License