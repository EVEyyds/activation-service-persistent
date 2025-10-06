# API接口文档

## 概述

持久有效激活验证服务的完整API接口文档，包含所有接口的详细说明、请求格式、响应格式和错误处理。

**服务地址**: `http://localhost:3000` (开发环境)
**API版本**: v1
**数据格式**: JSON
**字符编码**: UTF-8

## 通用说明

### 请求头要求

所有POST请求必须包含以下请求头：

```
Content-Type: application/json
```

### 通用响应格式

#### 成功响应格式
```json
{
  "success": true,
  "data": {
    // 业务数据
  },
  "message": "操作成功",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

#### 失败响应格式
```json
{
  "success": false,
  "message": "错误描述",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### HTTP状态码说明

| 状态码 | 说明 | 使用场景 |
|--------|------|----------|
| 200 | OK | 请求成功处理 |
| 400 | Bad Request | 请求参数错误 |
| 429 | Too Many Requests | 请求频率超限 |
| 500 | Internal Server Error | 服务器内部错误 |

---

## 核心接口

### 1. 激活码验证接口

**接口地址**: `POST /api/verify`

**功能描述**: 验证激活码的有效性，并返回下次验证时间。激活码是持久有效的，只要存在且状态为active就永远返回成功。

**请求参数**:

| 参数名 | 类型 | 必填 | 长度限制 | 说明 | 示例 |
|--------|------|------|----------|------|------|
| code | string | 是 | 5-50字符 | 激活码 | "DEMO_001" |
| product_key | string | 是 | 3-50字符 | 产品标识 | "doubao_plugin" |
| device_id | string | 否 | 0-200字符 | 设备唯一标识（可选，仅用于统计） | "chrome_device_123" |

**请求示例**:
```json
{
  "code": "DEMO_001",
  "product_key": "doubao_plugin",
  "device_id": "chrome_device_abc12345"
}
```

**成功响应** (HTTP 200):

```json
{
  "success": true,
  "data": {
    "status": "active",
    "next_verify_at": "2024-01-02T12:00:00.000Z",
    "verify_interval_hours": 24,
    "activated_at": "2024-01-01T12:00:00.000Z",
    "code_info": {
      "code": "DEMO_001",
      "product_key": "doubao_plugin",
      "verify_interval": 24
    }
  },
  "message": "验证成功",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**响应字段说明**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| success | boolean | 请求是否成功 |
| data.status | string | 激活状态，固定为"active" |
| data.next_verify_at | string | 下次验证时间（ISO 8601格式） |
| data.verify_interval_hours | integer | 验证间隔（小时） |
| data.activated_at | string | 当前验证时间（ISO 8601格式） |
| data.code_info | object | 激活码基本信息 |
| message | string | 操作结果描述 |
| timestamp | string | 响应时间戳 |

**失败响应示例**:

**激活码不存在** (HTTP 200):
```json
{
  "success": false,
  "message": "激活码不存在或产品不匹配",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**参数验证失败** (HTTP 400):
```json
{
  "success": false,
  "message": "激活码和产品标识不能为空",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**请求频率超限** (HTTP 429):
```json
{
  "success": false,
  "message": "请求过于频繁，请稍后再试",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**使用流程**:

1. **首次验证**: 前端调用接口验证激活码
2. **保存结果**: 将`next_verify_at`保存到本地存储
3. **定时检查**: 定期检查当前时间是否超过`next_verify_at`
4. **自动续期**: 超过时间后自动重新验证，无需用户输入

**JavaScript集成示例**:
```javascript
class ActivationClient {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async verify(code, productKey, deviceId = null) {
    try {
      const response = await fetch(`${this.baseUrl}/api/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code: code,
          product_key: productKey,
          device_id: deviceId
        })
      });

      const result = await response.json();

      if (result.success) {
        // 保存验证结果
        chrome.storage.local.set({
          activated: true,
          nextVerifyAt: result.data.next_verify_at,
          verifyInterval: result.data.verify_interval_hours,
          productKey: productKey,
          lastVerify: new Date().toISOString()
        });

        console.log(`验证成功，下次验证时间: ${result.data.next_verify_at}`);
        return result;
      } else {
        console.error('验证失败:', result.message);
        return result;
      }

    } catch (error) {
      console.error('网络错误:', error);
      return {
        success: false,
        message: '网络连接失败'
      };
    }
  }

  async checkStatus() {
    const data = await chrome.storage.local.get([
      'activated', 'nextVerifyAt', 'verifyInterval'
    ]);

    if (!data.activated || !data.nextVerifyAt) {
      return {
        activated: false,
        needVerify: true
      };
    }

    const now = new Date();
    const nextVerifyTime = new Date(data.nextVerifyAt);

    return {
      activated: true,
      needVerify: now >= nextVerifyTime,
      nextVerifyAt: data.nextVerifyAt,
      remainingHours: Math.max(0, Math.floor((nextVerifyTime - now) / (1000 * 60 * 60))),
      verifyInterval: data.verifyInterval
    };
  }

  async autoVerify() {
    const status = await this.checkStatus();

    if (!status.activated) {
      return { success: false, message: '设备未激活' };
    }

    if (status.needVerify) {
      console.log('需要重新验证激活状态');
      const { productKey, savedCode } = await chrome.storage.local.get(['productKey', 'savedCode']);

      if (savedCode && productKey) {
        return await this.verify(savedCode, productKey);
      } else {
        return { success: false, message: '缺少激活码信息' };
      }
    }

    return { success: true, message: '激活状态有效' };
  }
}

// 使用示例
const client = new ActivationClient();

// 插件启动时初始化
async function initializePlugin() {
  const result = await client.autoVerify();

  if (result.success) {
    console.log('插件功能已启用');
    enablePluginFeatures();
  } else {
    console.log('插件需要激活:', result.message);
    disablePluginFeatures();
    showActivationDialog();
  }
}

// 定期检查（每小时）
setInterval(async () => {
  const status = await client.checkStatus();
  if (status.needVerify) {
    await initializePlugin();
  }
}, 60 * 60 * 1000);

// 事件监听
chrome.runtime.onStartup.addListener(initializePlugin);
chrome.runtime.onInstalled.addListener(initializePlugin);
```

---

## 系统接口

### 2. 健康检查接口

**接口地址**: `GET /health`

**功能描述**: 检查服务运行状态，无需认证。

**请求参数**: 无

**成功响应** (HTTP 200):
```json
{
  "status": "ok",
  "service": "activation-service-simple",
  "version": "1.0.0",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**响应字段说明**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| status | string | 服务状态，"ok"表示正常 |
| service | string | 服务名称 |
| version | string | 服务版本 |
| timestamp | string | 响应时间戳 |

**使用示例**:
```javascript
// 检查服务状态
async function checkServiceHealth() {
  try {
    const response = await fetch('http://localhost:3000/health');
    const health = await response.json();

    if (health.status === 'ok') {
      console.log('服务运行正常');
      return true;
    } else {
      console.log('服务异常:', health);
      return false;
    }
  } catch (error) {
    console.error('无法连接到服务:', error);
    return false;
  }
}

// 在插件启动时检查
checkServiceHealth().then(isHealthy => {
  if (!isHealthy) {
    alert('激活验证服务不可用，请检查网络连接');
  }
});
```

---

### 3. 服务统计接口

**接口地址**: `GET /api/stats`

**功能描述**: 获取服务的基本统计信息，用于监控和管理。

**请求参数**: 无

**成功响应** (HTTP 200):
```json
{
  "success": true,
  "data": {
    "active_codes": 4,
    "today_verifications": 156,
    "today_success": 156
  }
}
```

**响应字段说明**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| success | boolean | 请求是否成功 |
| data.active_codes | integer | 当前有效的激活码数量 |
| data.today_verifications | integer | 今日验证总次数 |
| data.today_success | integer | 今日验证成功次数 |

**使用示例**:
```javascript
// 获取服务统计信息
async function getServiceStats() {
  try {
    const response = await fetch('http://localhost:3000/api/stats');
    const stats = await response.json();

    if (stats.success) {
      console.log('服务统计:', stats.data);
      return stats.data;
    }
  } catch (error) {
    console.error('获取统计信息失败:', error);
  }
}
```

---

## 错误处理

### 错误类型

#### 1. 参数验证错误
**HTTP状态码**: 400

```json
{
  "success": false,
  "message": "激活码和产品标识不能为空",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**可能原因**:
- 缺少必填参数 `code` 或 `product_key`
- 参数格式不正确

#### 2. 激活码错误
**HTTP状态码**: 200

```json
{
  "success": false,
  "message": "激活码不存在或产品不匹配",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**可能原因**:
- 激活码不存在
- 产品标识不匹配
- 激活码状态为inactive

#### 3. 请求频率限制
**HTTP状态码**: 429

```json
{
  "success": false,
  "message": "请求过于频繁，请稍后再试",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**限制规则**:
- 每个IP地址每分钟最多30次请求
- 超出限制返回429状态码

#### 4. 服务器错误
**HTTP状态码**: 500

```json
{
  "success": false,
  "message": "服务器内部错误",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**可能原因**:
- 数据库连接失败
- 程序内部错误
- 系统资源不足

### 错误处理最佳实践

#### 1. 前端错误处理
```javascript
class ActivationClient {
  async verify(code, productKey, deviceId = null) {
    try {
      const response = await fetch(`${this.baseUrl}/api/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, product_key: productKey, device_id: deviceId })
      });

      const result = await response.json();

      // 处理不同类型的错误
      if (!result.success) {
        switch (response.status) {
          case 400:
            console.error('参数错误:', result.message);
            break;
          case 429:
            console.error('请求过于频繁，请稍后再试');
            // 可以实现退避重试
            setTimeout(() => this.verify(code, productKey, deviceId), 60000);
            break;
          case 500:
            console.error('服务器错误，请稍后再试');
            break;
          default:
            console.error('验证失败:', result.message);
        }
        return result;
      }

      // 处理成功响应
      this.saveVerificationResult(result.data);
      return result;

    } catch (error) {
      console.error('网络请求失败:', error);
      return {
        success: false,
        message: '网络连接失败'
      };
    }
  }

  saveVerificationResult(data) {
    chrome.storage.local.set({
      activated: true,
      nextVerifyAt: data.next_verify_at,
      verifyInterval: data.verify_interval_hours,
      lastVerify: new Date().toISOString()
    });
  }
}
```

#### 2. 退避重试策略
```javascript
class RetryableActivationClient extends ActivationClient {
  async verifyWithRetry(code, productKey, deviceId = null, maxRetries = 3) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await this.verify(code, productKey, deviceId);

      if (result.success) {
        return result;
      }

      lastError = result;

      // 对于429错误，实现指数退避
      if (result.message.includes('频繁')) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        console.log(`第${attempt}次重试，等待${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // 其他错误不重试
        break;
      }
    }

    return lastError;
  }
}
```

#### 3. 离线模式支持
```javascript
class OfflineActivationClient extends ActivationClient {
  async verifyWithOffline(code, productKey, deviceId = null) {
    try {
      // 尝试在线验证
      const onlineResult = await this.verify(code, productKey, deviceId);

      if (onlineResult.success) {
        return onlineResult;
      }
    } catch (error) {
      console.warn('在线验证失败，尝试离线验证:', error);
    }

    // 离线验证：检查本地缓存
    const localData = await chrome.storage.local.get([
      'activated', 'nextVerifyAt', 'productKey'
    ]);

    if (localData.activated &&
        localData.productKey === productKey &&
        localData.nextVerifyAt) {

      const now = new Date();
      const nextVerifyTime = new Date(localData.nextVerifyAt);

      // 如果还在有效期内，返回缓存结果
      if (now < nextVerifyTime) {
        return {
          success: true,
          data: {
            status: 'active',
            next_verify_at: localData.nextVerifyAt,
            verify_interval_hours: 24, // 默认值
            activated_at: localData.lastVerify || new Date().toISOString(),
            offline_mode: true
          },
          message: '离线验证通过（基于本地缓存）'
        };
      }
    }

    return {
      success: false,
      message: '离线验证失败，请检查网络连接'
    };
  }
}
```

---

## 测试用例

### 使用curl测试

#### 1. 健康检查
```bash
curl -X GET http://localhost:3000/health
```

#### 2. 激活码验证
```bash
# 正确的激活码
curl -X POST http://localhost:3000/api/verify \
  -H "Content-Type: application/json" \
  -d '{
    "code": "DEMO_001",
    "product_key": "doubao_plugin",
    "device_id": "test_device_123"
  }'

# 错误的激活码
curl -X POST http://localhost:3000/api/verify \
  -H "Content-Type: application/json" \
  -d '{
    "code": "WRONG_CODE",
    "product_key": "doubao_plugin"
  }'

# 缺少参数
curl -X POST http://localhost:3000/api/verify \
  -H "Content-Type: application/json" \
  -d '{
    "code": "DEMO_001"
  }'
```

#### 3. 获取统计信息
```bash
curl -X GET http://localhost:3000/api/stats
```

### 使用Postman测试

#### 请求配置
```
Method: POST
URL: http://localhost:3000/api/verify
Headers:
  Content-Type: application/json
Body (raw, JSON):
{
  "code": "DEMO_001",
  "product_key": "doubao_plugin",
  "device_id": "chrome_device_123"
}
```

#### 测试脚本示例
```javascript
// Postman测试脚本
pm.test("验证成功", function() {
    pm.response.to.have.status(200);
    const jsonData = pm.response.json();
    pm.expect(jsonData.success).to.be.true;
    pm.expect(jsonData.data).to.have.property('next_verify_at');
    pm.expect(jsonData.data).to.have.property('verify_interval_hours');
});

// 设置环境变量
if (pm.response.json().success) {
    pm.environment.set("next_verify_at", pm.response.json().data.next_verify_at);
}
```

---

## 常见问题

### Q1: 激活码会失效吗？
A: 不会。激活码是持久有效的，只要存在且状态为active就永远返回验证成功。

### Q2: 如何控制验证频率？
A: 通过返回的`verify_interval_hours`字段控制，前端根据这个值和当前时间计算下次验证时机。

### Q3: 设备ID是必需的吗？
A: 不是。设备ID是可选的，仅用于统计目的，不影响验证结果。

### Q4: 验证失败后应该如何处理？
A: 只有激活码不存在或被禁用时才会验证失败，此时需要用户提供新的激活码。

### Q5: 可以同时使用多个激活码吗？
A: 可以，但通常建议一个产品使用一个激活码，多个激活码会导致管理复杂。

### Q6: 如何测试不同的验证间隔？
A: 可以使用不同的测试激活码：
- `TEST_001`: 1小时验证间隔
- `DEMO_001/DEMO_002`: 24小时验证间隔
- `PREMIUM_001`: 72小时验证间隔

---

## 版本更新记录

### v1.0.0 (2024-01-01)
- 初始版本发布
- 支持持久有效激活码验证
- 支持自定义验证间隔
- 提供完整的API接口

---

**文档版本**: v1.0
**最后更新**: 2024-01-01
**服务版本**: activation-service-persistent v1.0.0+