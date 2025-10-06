# 快速启动指南

## 🚀 立即运行

### 1. 安装依赖
```bash
cd activation-service-persistent
npm install
```

### 2. 启动服务
```bash
npm start
```

服务将在 `http://localhost:3000` 启动

### 3. 测试激活码验证
```bash
curl -X POST http://localhost:3000/api/verify \
  -H "Content-Type: application/json" \
  -d '{
    "code": "DEMO_001",
    "product_key": "doubao_plugin"
  }'
```

### 4. 健康检查
```bash
curl http://localhost:3000/health
```

## 📋 可用激活码

| 激活码 | 产品标识 | 验证间隔 |
|--------|----------|----------|
| DEMO_001 | doubao_plugin | 24小时 |
| DEMO_002 | doubao_plugin | 24小时 |
| PREMIUM_001 | doubao_plugin | 72小时 |
| TEST_001 | test_product | 1小时 |

## 📊 API接口

- **验证接口**: `POST /api/verify`
- **健康检查**: `GET /health`
- **统计信息**: `GET /api/stats`

## 🔧 Chrome插件集成

参考 `examples/chrome-extension-client.js` 文件，包含完整的客户端集成代码。

## 📝 特点

✅ 激活码永不过期（后端始终返回成功）
✅ 前端根据返回的 `next_verify_at` 控制验证时机
✅ 自动续期功能
✅ 离线模式支持
✅ 速率限制保护
✅ 详细日志记录

## 🛠️ 开发环境

如需启用调试接口：
```bash
set ENABLE_DEBUG_ENDPOINTS=true
npm start
```

调试接口：
- 数据库调试: `http://localhost:3000/debug/database`
- 系统信息: `http://localhost:3000/debug/system`