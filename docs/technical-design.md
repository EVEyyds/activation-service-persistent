# 技术设计文档

## 概述

本文档详细描述了持久有效激活验证服务的技术架构、设计决策、核心原理和技术实现细节。

## 设计理念

### 核心创新点

传统激活验证服务采用"过期即失效"的模式，而本方案采用"持久有效 + 定期验证"的模式：

1. **持久有效性**：激活码永不过期，后端始终返回验证成功
2. **前端控制**：由前端根据返回的验证间隔控制何时重新验证
3. **无感续期**：用户无需重新输入激活码，实现自动续期
4. **灵活配置**：不同激活码可设置不同的验证间隔

### 对比分析

| 特性 | 传统方案 | 本方案 |
|------|----------|--------|
| 激活码生命周期 | 固定有效期，过期失效 | 持久有效，永不过期 |
| 验证控制权 | 后端强制过期 | 前端自主控制 |
| 用户体验 | 过期需重新输入 | 自动续期，无感知 |
| 业务逻辑 | 复杂的过期计算 | 简单的时间判断 |
| 系统复杂度 | 高（过期管理） | 低（仅返回时间） |

## 系统架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome插件客户端                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐│
│  │   用户界面      │  │   激活管理器    │  │   存储管理器    ││
│  │                 │  │                 │  │                 ││
│  │ • 输入激活码    │  │ • 验证逻辑      │  │ • 本地存储      ││
│  │ • 状态显示      │  │ • 定时检查      │  │ • 时间管理      ││
│  └─────────────────┘  └─────────────────┘  └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   激活验证服务端                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐│
│  │   Express服务   │  │   中间件层      │  │   数据访问层    ││
│  │                 │  │                 │  │                 ││
│  │ • 路由处理      │  │ • 安全防护      │  │ • SQLite数据库  ││
│  │ • 响应格式化    │  │ • 速率限制      │  │ • 查询优化      ││
│  │ • 错误处理      │  │ • 参数验证      │  │ • 事务管理      ││
│  └─────────────────┘  └─────────────────┘  └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   数据存储层                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐│
│  │  activation_    │  │ verification_   │  │   系统配置      ││
│  │  codes表        │  │  logs表         │  │                 ││
│  │                 │  │                 │  │                 ││
│  │ • 激活码信息    │  │ • 验证记录      │  │ • 服务参数      ││
│  │ • 验证间隔      │  │ • 统计数据      │  │ • 运行状态      ││
│  └─────────────────┘  └─────────────────┘  └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 技术栈选择

#### 为什么选择Node.js + Express.js？

1. **JavaScript统一**: 前后端统一语言，降低开发复杂度
2. **异步I/O优势**: 高并发处理能力，适合API服务
3. **生态丰富**: NPM生态系统提供丰富的中间件
4. **快速开发**: 简洁的API设计，开发效率高
5. **易于部署**: 单个可执行文件，部署简单

#### 为什么选择SQLite？

1. **零配置**: 无需独立的数据库服务
2. **文件型数据库**: 便于备份和迁移
3. **性能优秀**: 适合中小规模应用
4. **功能完整**: 支持事务、索引、触发器
5. **跨平台**: 支持Windows、macOS、Linux

## 数据库设计

### 数据模型设计

#### 核心实体关系图

```
┌─────────────────────────────────────────────────────────────┐
│                    激活码 (activation_codes)                  │
│  ┌─────────────────┬─────────────────┬─────────────────────┐ │
│  │  id (PK)        │  code (UNIQUE)  │  product_key        │ │
│  │  INTEGER        │  TEXT           │  TEXT               │ │
│  ├─────────────────┼─────────────────┼─────────────────────┤ │
│  │  status         │  verify_interval│  created_at         │ │
│  │  TEXT           │  _hours         │  DATETIME           │ │
│  │  (active/inactive)│  INTEGER        │                     │ │
│  └─────────────────┴─────────────────┴─────────────────────┘ │
│                                │                            │
│                                │ 1:N                        │
│                                ▼                            │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                验证记录 (verification_logs)              │ │
│  │  ┌─────────────────┬─────────────────┬─────────────────┐ │ │
│  │  │  id (PK)        │  code (FK)      │  device_id       │ │ │
│  │  │  INTEGER        │  TEXT           │  TEXT            │ │ │
│  │  ├─────────────────┼─────────────────┼─────────────────┤ │ │
│  │  │  result         │  timestamp      │  ip_address      │ │ │
│  │  │  TEXT           │  DATETIME       │  TEXT            │ │ │
│  │  │  (success/failed)│                │                  │ │ │
│  │  └─────────────────┴─────────────────┴─────────────────┘ │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### 表结构详细设计

##### 1. 激活码表 (activation_codes)

```sql
CREATE TABLE activation_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,    -- 主键，自增
    code TEXT UNIQUE NOT NULL,                -- 激活码，唯一
    product_key TEXT NOT NULL,                -- 产品标识
    status TEXT DEFAULT 'active',             -- 状态：active/inactive
    verify_interval_hours INTEGER DEFAULT 24, -- 验证间隔（小时）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 创建时间
    notes TEXT                               -- 备注
);
```

**设计决策**:

1. **简化时间字段**: 只保留`verify_interval_hours`，不存储具体过期时间
2. **状态管理**: 通过`status`字段控制激活码的启用/禁用
3. **灵活间隔**: 不同激活码可设置不同的验证间隔
4. **最小字段**: 只保留必要字段，简化数据模型

##### 2. 验证记录表 (verification_logs)

```sql
CREATE TABLE verification_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,    -- 主键，自增
    code TEXT NOT NULL,                      -- 激活码（外键关联）
    device_id TEXT,                         -- 设备标识（可选）
    result TEXT NOT NULL,                    -- 验证结果
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, -- 验证时间
    ip_address TEXT                          -- IP地址（可选）
);
```

**设计决策**:

1. **轻量级记录**: 只记录核心验证信息
2. **统计用途**: 主要用于统计分析，不影响核心业务
3. **可选字段**: 设备ID和IP地址为可选，保护隐私
4. **时间索引**: 按时间查询优化，支持高效统计

### 索引策略

```sql
-- 激活码查询优化
CREATE INDEX idx_activation_codes_lookup ON activation_codes(code, product_key, status);

-- 验证记录查询优化
CREATE INDEX idx_verification_logs_timestamp ON verification_logs(timestamp);
CREATE INDEX idx_verification_logs_code ON verification_logs(code, timestamp);
```

**索引设计原则**:

1. **查询模式**: 根据常用查询条件设计复合索引
2. **唯一性**: 主键自动创建唯一索引
3. **覆盖索引**: 索引包含查询所需的所有字段
4. **性能平衡**: 在查询性能和写入性能间平衡

## API设计

### RESTful API设计原则

#### 1. 资源导向设计
```
激活码验证 -> POST /api/verify
服务状态   -> GET /health
统计信息   -> GET /api/stats
```

#### 2. 统一响应格式
```javascript
// 成功响应
{
  "success": true,
  "data": { /* 业务数据 */ },
  "message": "操作成功",
  "timestamp": "2024-01-01T12:00:00.000Z"
}

// 失败响应
{
  "success": false,
  "message": "错误描述",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

#### 3. 状态码规范
- `200`: 请求成功处理
- `400`: 请求参数错误
- `429`: 请求频率超限
- `500`: 服务器内部错误

### 核心接口设计

#### 激活验证接口 (/api/verify)

**设计目标**:
1. 简单易用：一个接口满足所有验证需求
2. 信息完整：返回前端需要的所有信息
3. 格式统一：标准的请求响应格式
4. 错误友好：清晰的错误信息

**请求参数设计**:
```javascript
{
  "code": "DEMO_001",           // 必填：激活码
  "product_key": "doubao_plugin", // 必填：产品标识
  "device_id": "chrome_123"    // 可选：设备标识
}
```

**响应数据设计**:
```javascript
{
  "success": true,
  "data": {
    "status": "active",                    // 固定状态
    "next_verify_at": "2024-01-02T12:00:00.000Z", // 下次验证时间
    "verify_interval_hours": 24,           // 验证间隔
    "activated_at": "2024-01-01T12:00:00.000Z",   // 当前验证时间
    "code_info": {                         // 激活码基本信息
      "code": "DEMO_001",
      "product_key": "doubao_plugin",
      "verify_interval": 24
    }
  },
  "message": "验证成功",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**字段设计说明**:

1. **next_verify_at**: 核心字段，告诉前端下次验证时间
2. **verify_interval_hours**: 辅助字段，验证间隔配置
3. **activated_at**: 当前验证时间，便于调试
4. **code_info**: 激活码基本信息，便于前端显示

## 核心算法设计

### 验证时间计算算法

#### 算法描述
```javascript
function calculateNextVerifyTime(intervalHours) {
  const now = new Date();
  const nextVerifyTime = new Date(
    now.getTime() + intervalHours * 60 * 60 * 1000
  );
  return nextVerifyTime.toISOString();
}
```

#### 算法特点
1. **简单直接**: 基于当前时间加上间隔小时数
2. **精度保证**: 使用毫秒级时间戳计算
3. **标准化**: 返回ISO 8601格式时间字符串
4. **时区无关**: 使用UTC时间，避免时区问题

### 前端验证逻辑算法

#### 自动验证算法
```javascript
class AutoVerifyManager {
  constructor(activationClient) {
    this.client = activationClient;
    this.checkInterval = 60 * 60 * 1000; // 每小时检查一次
  }

  async startAutoVerify() {
    // 1. 插件启动时立即检查
    await this.checkAndVerify();

    // 2. 设置定时检查
    setInterval(async () => {
      await this.checkAndVerify();
    }, this.checkInterval);
  }

  async checkAndVerify() {
    try {
      // 1. 获取本地状态
      const status = await this.client.checkStatus();

      // 2. 判断是否需要验证
      if (!status.activated) {
        console.log('设备未激活，需要首次验证');
        return await this.performFirstActivation();
      }

      if (status.needVerify) {
        console.log('验证间隔到期，需要重新验证');
        return await this.performReactivation();
      }

      console.log('激活状态有效，无需验证');
      return { success: true, message: '状态有效' };

    } catch (error) {
      console.error('自动验证失败:', error);
      return { success: false, message: error.message };
    }
  }

  async performFirstActivation() {
    // 获取用户输入的激活码
    const code = await this.promptForActivationCode();
    if (!code) {
      return { success: false, message: '用户取消激活' };
    }

    const result = await this.client.verify(code, 'doubao_plugin');
    if (result.success) {
      // 保存激活码
      chrome.storage.local.set({ savedCode: code });
      console.log('首次激活成功');
    }
    return result;
  }

  async performReactivation() {
    const { savedCode } = await chrome.storage.local.get(['savedCode']);
    if (!savedCode) {
      return { success: false, message: '缺少保存的激活码' };
    }

    const result = await this.client.verify(savedCode, 'doubao_plugin');
    if (result.success) {
      console.log('自动续期成功');
    } else {
      // 续期失败，清除保存的激活码
      chrome.storage.local.remove(['savedCode', 'activated']);
      console.log('自动续期失败，需要重新激活');
    }
    return result;
  }
}
```

### 状态管理算法

#### 本地状态管理
```javascript
class ActivationStateManager {
  constructor() {
    this.storageKeys = {
      activated: 'activated',
      nextVerifyAt: 'nextVerifyAt',
      verifyInterval: 'verifyInterval',
      productKey: 'productKey',
      lastVerify: 'lastVerify',
      savedCode: 'savedCode'
    };
  }

  async saveVerificationResult(data) {
    const state = {
      activated: true,
      nextVerifyAt: data.next_verify_at,
      verifyInterval: data.verify_interval_hours,
      productKey: data.code_info.product_key,
      lastVerify: data.activated_at
    };

    await chrome.storage.local.set(state);
    console.log('验证结果已保存:', state);
  }

  async getActivationStatus() {
    const data = await chrome.storage.local.get(Object.values(this.storageKeys));

    return {
      activated: data.activated || false,
      nextVerifyAt: data.nextVerifyAt,
      verifyInterval: data.verifyInterval || 24,
      productKey: data.productKey,
      lastVerify: data.lastVerify,
      savedCode: data.savedCode
    };
  }

  async clearActivationStatus() {
    await chrome.storage.local.remove(Object.values(this.storageKeys));
    console.log('激活状态已清除');
  }

  calculateStatus(status) {
    if (!status.activated || !status.nextVerifyAt) {
      return {
        activated: false,
        needVerify: true,
        remainingHours: 0
      };
    }

    const now = new Date();
    const nextVerifyTime = new Date(status.nextVerifyAt);

    return {
      activated: true,
      needVerify: now >= nextVerifyTime,
      nextVerifyAt: status.nextVerifyAt,
      remainingHours: Math.max(0, Math.floor((nextVerifyTime - now) / (1000 * 60 * 60)))
    };
  }
}
```

## 安全设计

### 多层安全防护

#### 1. 网络层安全
```javascript
// HTTPS强制（生产环境）
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
}

// 安全头部设置
app.use(helmet({
  contentSecurityPolicy: false, // Chrome插件需要
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

#### 2. 应用层安全
```javascript
// 输入验证和清理
const inputValidation = (req, res, next) => {
  // 参数长度限制
  const maxLengths = {
    code: 50,
    product_key: 50,
    device_id: 200
  };

  for (const [field, maxLength] of Object.entries(maxLengths)) {
    if (req.body[field] && req.body[field].length > maxLength) {
      return res.status(400).json({
        success: false,
        message: `${field}长度不能超过${maxLength}字符`
      });
    }
  }

  // SQL注入防护
  const sqlPattern = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i;
  for (const [key, value] of Object.entries(req.body)) {
    if (typeof value === 'string' && sqlPattern.test(value)) {
      return res.status(400).json({
        success: false,
        message: '输入包含非法字符'
      });
    }
  }

  next();
};
```

#### 3. 数据层安全
```javascript
// 参数化查询防护
class SecureDatabaseManager {
  async verifyActivationCode(code, productKey) {
    // 使用参数化查询，避免SQL注入
    const sql = `
      SELECT * FROM activation_codes
      WHERE code = ? AND product_key = ? AND status = 'active'
    `;

    return await this.db.get(sql, [code, productKey]);
  }

  async logVerification(code, result, deviceId = null) {
    // 输入参数清理
    const cleanCode = code.substring(0, 50);
    const cleanDeviceId = deviceId ? deviceId.substring(0, 200) : null;

    const sql = `
      INSERT INTO verification_logs (code, device_id, result)
      VALUES (?, ?, ?)
    `;

    await this.db.run(sql, [cleanCode, cleanDeviceId, result]);
  }
}
```

### 速率限制设计

#### 分层限流策略
```javascript
const rateLimit = require('express-rate-limit');

// 1. 全局限流 - 防止DDoS攻击
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,    // 1分钟
  max: 1000,              // 全局限制
  keyGenerator: (req) => 'global',
  message: {
    success: false,
    message: '服务器繁忙，请稍后再试'
  }
});

// 2. IP限流 - 基于IP地址
const ipLimiter = rateLimit({
  windowMs: 60 * 1000,    // 1分钟
  max: 100,               // 每个IP限制
  keyGenerator: (req) => req.ip,
  message: {
    success: false,
    message: 'IP请求过于频繁，请稍后再试'
  }
});

// 3. API限流 - 核心接口保护
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,    // 1分钟
  max: 30,                // 每个IP的API限制
  keyGenerator: (req) => req.ip,
  skip: (req) => !req.path.startsWith('/api/'),
  message: {
    success: false,
    message: 'API请求过于频繁，请稍后再试'
  }
});

// 应用限流中间件
app.use(globalLimiter);
app.use(ipLimiter);
app.use('/api/', apiLimiter);
```

## 性能设计

### 数据库性能优化

#### 1. 连接管理
```javascript
class DatabasePool {
  constructor(maxConnections = 10) {
    this.maxConnections = maxConnections;
    this.pool = [];
    this.activeConnections = 0;
  }

  async getConnection() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    }

    if (this.activeConnections < this.maxConnections) {
      this.activeConnections++;
      return new sqlite3.Database('./data/activation.db');
    }

    // 等待可用连接
    return new Promise((resolve) => {
      const checkConnection = () => {
        if (this.pool.length > 0) {
          resolve(this.pool.pop());
        } else {
          setTimeout(checkConnection, 10);
        }
      };
      checkConnection();
    });
  }

  releaseConnection(connection) {
    this.pool.push(connection);
  }
}
```

#### 2. 查询优化
```javascript
class QueryOptimizer {
  constructor(db) {
    this.db = db;
    this.queryCache = new Map();
  }

  // 缓存查询结果
  async cachedQuery(sql, params = [], ttl = 300000) { // 5分钟TTL
    const cacheKey = sql + JSON.stringify(params);

    if (this.queryCache.has(cacheKey)) {
      const cached = this.queryCache.get(cacheKey);
      if (Date.now() - cached.timestamp < ttl) {
        return cached.result;
      }
    }

    const result = await this.db.all(sql, params);
    this.queryCache.set(cacheKey, {
      result: result,
      timestamp: Date.now()
    });

    return result;
  }

  // 批量操作优化
  async batchInsert(records) {
    const stmt = this.db.prepare(`
      INSERT INTO verification_logs (code, device_id, result)
      VALUES (?, ?, ?)
    `);

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');

        records.forEach(record => {
          stmt.run(record.code, record.device_id, record.result);
        });

        this.db.run('COMMIT', (err) => {
          stmt.finalize();
          if (err) {
            reject(err);
          } else {
            resolve(records.length);
          }
        });
      });
    });
  }
}
```

### 应用性能优化

#### 1. 内存管理
```javascript
class MemoryManager {
  constructor() {
    this.maxMemoryUsage = 500 * 1024 * 1024; // 500MB
    this.cleanupThreshold = 0.8; // 80%时开始清理
  }

  startMonitoring() {
    setInterval(() => {
      const usage = process.memoryUsage();
      const heapUsed = usage.heapUsed;

      console.log(`内存使用: ${(heapUsed / 1024 / 1024).toFixed(2)} MB`);

      if (heapUsed > this.maxMemoryUsage * this.cleanupThreshold) {
        console.log('触发内存清理...');
        this.performCleanup();
      }

      if (heapUsed > this.maxMemoryUsage) {
        console.warn('内存使用超过限制，建议重启服务');
      }
    }, 60000); // 每分钟检查一次
  }

  performCleanup() {
    // 清理查询缓存
    if (global.queryCache) {
      global.queryCache.clear();
    }

    // 强制垃圾回收
    if (global.gc) {
      global.gc();
    }

    console.log('内存清理完成');
  }
}
```

#### 2. 响应时间优化
```javascript
class ResponseTimeOptimizer {
  constructor() {
    this.responseTimes = [];
    this.maxSamples = 1000;
  }

  middleware() {
    return (req, res, next) => {
      const startTime = Date.now();

      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        this.recordResponseTime(req.path, responseTime);

        if (responseTime > 1000) { // 超过1秒记录警告
          console.warn(`慢请求警告: ${req.method} ${req.path} - ${responseTime}ms`);
        }
      });

      next();
    };
  }

  recordResponseTime(path, responseTime) {
    this.responseTimes.push({
      path: path,
      time: responseTime,
      timestamp: Date.now()
    });

    // 保持最近1000条记录
    if (this.responseTimes.length > this.maxSamples) {
      this.responseTimes = this.responseTimes.slice(-this.maxSamples);
    }
  }

  getAverageResponseTime(path = null) {
    const filteredTimes = path
      ? this.responseTimes.filter(r => r.path === path)
      : this.responseTimes;

    if (filteredTimes.length === 0) return 0;

    const total = filteredTimes.reduce((sum, r) => sum + r.time, 0);
    return Math.round(total / filteredTimes.length);
  }
}
```

## 可扩展性设计

### 模块化架构

#### 1. 服务层抽象
```javascript
// 抽象服务基类
class BaseService {
  constructor(db) {
    this.db = db;
  }

  async validateInput(data, schema) {
    // 通用输入验证逻辑
  }

  async logActivity(action, data) {
    // 通用活动日志记录
  }

  formatResponse(success, data = null, message = '') {
    // 统一响应格式
    return {
      success: success,
      data: data,
      message: message,
      timestamp: new Date().toISOString()
    };
  }
}

// 激活服务继承
class ActivationService extends BaseService {
  async verifyActivationCode(code, productKey, deviceId = null) {
    try {
      await this.validateInput({ code, productKey });

      const result = await this.performVerification(code, productKey);

      await this.logActivity('verification', {
        code: code,
        result: result.success ? 'success' : 'failed',
        device_id: deviceId
      });

      return this.formatResponse(result.success, result.data, result.message);

    } catch (error) {
      return this.formatResponse(false, null, error.message);
    }
  }

  async performVerification(code, productKey) {
    // 核心验证逻辑
  }
}
```

#### 2. 中间件插件系统
```javascript
class MiddlewareManager {
  constructor() {
    this.middlewares = [];
  }

  use(middleware) {
    this.middlewares.push(middleware);
  }

  async executeMiddlewares(req, res, next) {
    let index = 0;

    const nextMiddleware = async () => {
      if (index >= this.middlewares.length) {
        return next();
      }

      const middleware = this.middlewares[index++];
      await middleware(req, res, nextMiddleware);
    };

    await nextMiddleware();
  }
}

// 使用示例
const middlewareManager = new MiddlewareManager();
middlewareManager.use(securityMiddleware);
middlewareManager.use(validationMiddleware);
middlewareManager.use(loggingMiddleware);
middlewareManager.use(rateLimitMiddleware);
```

### 配置管理

#### 环境配置抽象
```javascript
class ConfigManager {
  constructor() {
    this.config = this.loadConfig();
  }

  loadConfig() {
    const defaultConfig = {
      server: {
        port: 3000,
        host: '0.0.0.0'
      },
      database: {
        path: './data/activation.db',
        connectionPool: {
          max: 10,
          min: 1
        }
      },
      security: {
        rateLimit: {
          windowMs: 60000,
          max: 30
        },
        cors: {
          origins: [/^chrome-extension:\/\//]
        }
      },
      logging: {
        level: 'info',
        file: './logs/app.log'
      }
    };

    // 从环境变量覆盖配置
    const envConfig = {
      server: {
        port: process.env.PORT || defaultConfig.server.port,
        host: process.env.HOST || defaultConfig.server.host
      },
      database: {
        path: process.env.DB_PATH || defaultConfig.database.path
      }
    };

    return this.mergeConfig(defaultConfig, envConfig);
  }

  mergeConfig(defaultConfig, envConfig) {
    const merged = JSON.parse(JSON.stringify(defaultConfig));

    function merge(target, source) {
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          target[key] = target[key] || {};
          merge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    }

    merge(merged, envConfig);
    return merged;
  }

  get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this.config);
  }

  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => obj[key] = obj[key] || {}, this.config);
    target[lastKey] = value;
  }
}
```

## 监控和诊断

### 性能监控

#### 1. 系统监控
```javascript
class SystemMonitor {
  constructor() {
    this.metrics = {
      requests: 0,
      errors: 0,
      responseTime: [],
      memoryUsage: [],
      databaseQueries: 0
    };
  }

  startMonitoring() {
    // 每分钟收集系统指标
    setInterval(() => {
      this.collectSystemMetrics();
    }, 60000);

    // 每小时生成报告
    setInterval(() => {
      this.generateReport();
    }, 3600000);
  }

  collectSystemMetrics() {
    const memUsage = process.memoryUsage();

    this.metrics.memoryUsage.push({
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      timestamp: Date.now()
    });

    // 保持最近100个数据点
    if (this.metrics.memoryUsage.length > 100) {
      this.metrics.memoryUsage = this.metrics.memoryUsage.slice(-100);
    }
  }

  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      requests: this.metrics.requests,
      errors: this.metrics.errors,
      averageResponseTime: this.calculateAverageResponseTime(),
      currentMemoryUsage: process.memoryUsage(),
      databaseQueries: this.metrics.databaseQueries
    };

    console.log('系统监控报告:', report);

    // 可以发送到监控系统或写入文件
    this.saveReport(report);
  }

  calculateAverageResponseTime() {
    if (this.metrics.responseTime.length === 0) return 0;

    const total = this.metrics.responseTime.reduce((sum, time) => sum + time, 0);
    return Math.round(total / this.metrics.responseTime.length);
  }

  saveReport(report) {
    // 保存报告到文件或发送到监控系统
    const fs = require('fs');
    const reportPath = './logs/system-reports.json';

    let reports = [];
    try {
      const data = fs.readFileSync(reportPath, 'utf8');
      reports = JSON.parse(data);
    } catch (error) {
      // 文件不存在，使用空数组
    }

    reports.push(report);

    // 保持最近100个报告
    if (reports.length > 100) {
      reports = reports.slice(-100);
    }

    fs.writeFileSync(reportPath, JSON.stringify(reports, null, 2));
  }
}
```

#### 2. 业务监控
```javascript
class BusinessMonitor {
  constructor(db) {
    this.db = db;
  }

  async getActivationStats() {
    const stats = await this.db.get(`
      SELECT
        (SELECT COUNT(*) FROM activation_codes WHERE status = 'active') as total_active_codes,
        (SELECT COUNT(DISTINCT code) FROM verification_logs WHERE date(timestamp) = date('now')) as today_unique_verifications,
        (SELECT COUNT(*) FROM verification_logs WHERE date(timestamp) = date('now') AND result = 'success') as today_successful_verifications,
        (SELECT COUNT(*) FROM verification_logs WHERE date(timestamp) = date('now') AND result = 'failed') as today_failed_verifications,
        (SELECT COUNT(*) FROM verification_logs WHERE timestamp > datetime('now', '-1 hour')) as last_hour_verifications
    `);

    return stats;
  }

  async getTopProducts(limit = 10) {
    const products = await this.db.all(`
      SELECT
        ac.product_key,
        COUNT(*) as verification_count,
        COUNT(DISTINCT ac.code) as unique_codes,
        COUNT(DISTINCT vl.device_id) as unique_devices
      FROM activation_codes ac
      LEFT JOIN verification_logs vl ON ac.code = vl.code
      WHERE vl.timestamp > datetime('now', '-7 days')
      GROUP BY ac.product_key
      ORDER BY verification_count DESC
      LIMIT ?
    `, [limit]);

    return products;
  }

  async getVerificationTrend(days = 7) {
    const trend = await this.db.all(`
      SELECT
        date(timestamp) as date,
        COUNT(*) as total_verifications,
        SUM(CASE WHEN result = 'success' THEN 1 ELSE 0 END) as successful_verifications,
        SUM(CASE WHEN result = 'failed' THEN 1 ELSE 0 END) as failed_verifications,
        COUNT(DISTINCT code) as unique_codes,
        COUNT(DISTINCT device_id) as unique_devices
      FROM verification_logs
      WHERE date(timestamp) >= date('now', '-${days} days')
      GROUP BY date(timestamp)
      ORDER BY date DESC
    `);

    return trend;
  }
}
```

这个技术设计文档详细描述了系统的架构设计、核心算法、安全机制、性能优化和可扩展性设计，为开发和维护提供了完整的技术指导。