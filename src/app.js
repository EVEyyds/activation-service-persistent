const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 创建数据目录
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 创建日志目录
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 数据库初始化
const db = new sqlite3.Database(path.join(dataDir, 'activation.db'));

// 数据库表创建和数据初始化
db.serialize(async () => {
  try {
    // 读取并执行初始化脚本
    const initSQL = fs.readFileSync(path.join(__dirname, 'database/init.sql'), 'utf8');
    const statements = initSQL.split(';').filter(stmt => stmt.trim());

    for (const statement of statements) {
      if (statement.trim()) {
        await new Promise((resolve, reject) => {
          db.run(statement, (err) => {
            if (err) {
              console.error('SQL执行错误:', err);
              reject(err);
            } else {
              resolve();
            }
          });
        });
      }
    }

    console.log('✅ 数据库初始化完成');
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
  }
});

// 配置SQLite性能优化
db.serialize(() => {
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA cache_size = 10000");
  db.run("PRAGMA temp_store = MEMORY");
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA busy_timeout = 30000");
});

// 中间件配置
app.use(helmet({
  contentSecurityPolicy: false // Chrome插件需要
}));

app.use(cors({
  origin: [/^chrome-extension:\/\//, /^moz-extension:\/\//],
  credentials: false
}));

// 日志配置
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  const accessLogStream = fs.createWriteStream(path.join(logDir, 'access.log'), { flags: 'a' });
  app.use(morgan('combined', { stream: accessLogStream }));
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// 速率限制配置
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 30,
  message: {
    success: false,
    message: '请求过于频繁，请稍后再试'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || 'unknown';
  }
});

app.use('/api/verify', limiter);

// 响应格式化工具
const successResponse = (data, message = '操作成功') => ({
  success: true,
  data: data,
  message: message,
  timestamp: new Date().toISOString()
});

const errorResponse = (message, statusCode = 500) => ({
  success: false,
  message: message,
  timestamp: new Date().toISOString()
});

// 激活验证服务类
class ActivationService {
  constructor(db) {
    this.db = db;
  }

  async verifyActivationCode(code, productKey, deviceId = null) {
    try {
      // 基础验证
      if (!code || !productKey) {
        return { success: false, message: '激活码和产品标识不能为空' };
      }

      // 查询激活码
      const activation = await this.getActivationCode(code, productKey);

      if (!activation) {
        await this.logVerification(code, deviceId, 'failed');
        return { success: false, message: '激活码不存在或产品不匹配' };
      }

      if (activation.status !== 'active') {
        await this.logVerification(code, deviceId, 'failed');
        return { success: false, message: '激活码已停用' };
      }

      // 计算下次验证时间
      const now = new Date();
      const nextVerifyTime = new Date(
        now.getTime() + activation.verify_interval_hours * 60 * 60 * 1000
      );

      // 记录成功日志
      await this.logVerification(code, deviceId, 'success');

      return {
        success: true,
        data: {
          status: 'active',
          next_verify_at: nextVerifyTime.toISOString(),
          verify_interval_hours: activation.verify_interval_hours,
          activated_at: now.toISOString(),
          code_info: {
            code: code,
            product_key: productKey,
            verify_interval: activation.verify_interval_hours
          }
        },
        message: '验证成功'
      };

    } catch (error) {
      console.error('验证错误:', error);
      return { success: false, message: '服务器内部错误' };
    }
  }

  async getActivationCode(code, productKey) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM activation_codes WHERE code = ? AND product_key = ? AND status = "active"',
        [code, productKey],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  async logVerification(code, deviceId, result) {
    try {
      const ip = 'unknown'; // 在实际应用中可以从req中获取
      await new Promise((resolve, reject) => {
        this.db.run(
          'INSERT INTO verification_logs (code, device_id, result, ip_address) VALUES (?, ?, ?, ?)',
          [code, deviceId, result, ip],
          (err) => {
            if (err) {
              console.error('日志记录失败:', err);
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
    } catch (error) {
      console.error('日志记录异常:', error);
    }
  }

  async getStats() {
    try {
      return new Promise((resolve, reject) => {
        this.db.get(`
          SELECT
            (SELECT COUNT(*) FROM activation_codes WHERE status = 'active') as active_codes,
            (SELECT COUNT(*) FROM verification_logs WHERE date(timestamp) = date('now')) as today_verifications,
            (SELECT COUNT(*) FROM verification_logs WHERE date(timestamp) = date('now') AND result = 'success') as today_success
        `, [], (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        });
      });
    } catch (error) {
      console.error('获取统计信息失败:', error);
      throw error;
    }
  }
}

// 创建服务实例
const activationService = new ActivationService(db);

// API路由

// 1. 激活码验证接口
app.post('/api/verify', async (req, res) => {
  try {
    const { code, product_key, device_id } = req.body;

    // 基础参数验证
    if (!code || !product_key) {
      return res.status(400).json(errorResponse('激活码和产品标识不能为空'));
    }

    // 参数长度验证
    if (code.length > 50 || product_key.length > 50) {
      return res.status(400).json(errorResponse('参数长度不能超过50字符'));
    }

    // SQL注入防护
    const sqlPattern = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i;
    if (sqlPattern.test(code) || sqlPattern.test(product_key)) {
      return res.status(400).json(errorResponse('输入包含非法字符'));
    }

    // 设备ID长度验证（可选）
    if (device_id && device_id.length > 200) {
      return res.status(400).json(errorResponse('设备ID长度不能超过200字符'));
    }

    // 执行验证
    const result = await activationService.verifyActivationCode(code, product_key, device_id);

    if (result.success) {
      res.json(successResponse(result.data, result.message));
    } else {
      res.json(errorResponse(result.message));
    }

  } catch (error) {
    console.error('验证接口错误:', error);
    res.status(500).json(errorResponse('服务器内部错误'));
  }
});

// 2. 健康检查接口
app.get('/health', (req, res) => {
  const healthData = {
    status: 'ok',
    service: 'activation-service-simple',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  };

  try {
    // 检查数据库连接
    db.get('SELECT 1 as test', (err, row) => {
      if (err) {
        healthData.status = 'degraded';
        healthData.database = 'error';
        healthData.error = err.message;
      } else {
        healthData.database = 'connected';
        healthData.test_query = row.test === 1;
      }
      res.json(healthData);
    });
  } catch (error) {
    healthData.status = 'error';
    healthData.error = error.message;
    res.status(503).json(healthData);
  }
});

// 3. 服务统计接口
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await activationService.getStats();
    res.json(successResponse(stats));
  } catch (error) {
    console.error('统计接口错误:', error);
    res.status(500).json(errorResponse('获取统计信息失败'));
  }
});

// 4. 调试接口（仅开发环境）
if (process.env.NODE_ENV === 'development' && process.env.ENABLE_DEBUG_ENDPOINTS === 'true') {
  app.get('/debug/database', async (req, res) => {
    try {
      const codes = await new Promise((resolve, reject) => {
        db.all('SELECT * FROM activation_codes LIMIT 10', (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      const logs = await new Promise((resolve, reject) => {
        db.all('SELECT * FROM verification_logs ORDER BY timestamp DESC LIMIT 10', (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      const stats = await activationService.getStats();

      res.json({
        success: true,
        data: {
          stats: stats,
          activation_codes: codes,
          recent_logs: logs
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.get('/debug/system', (req, res) => {
    res.json({
      timestamp: new Date().toISOString(),
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        version: process.version,
        memory: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        DB_PATH: process.env.DB_PATH
      }
    });
  });
}

// 5. 404处理
app.use('*', (req, res) => {
  res.status(404).json(errorResponse('接口不存在'));
});

// 6. 全局错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  res.status(500).json(errorResponse('服务器内部错误'));
});

// 启动服务
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 持久有效激活验证服务已启动`);
  console.log(`📍 服务地址: http://localhost:${PORT}`);
  console.log(`📊 健康检查: http://localhost:${PORT}/health`);
  console.log(`🔧 API接口: http://localhost:${PORT}/api/verify`);
  console.log(`📈 统计信息: http://localhost:${PORT}/api/stats`);
  console.log(`📝 可用激活码:`);
  console.log(`   - DEMO_001 (24小时验证间隔)`);
  console.log(`   - DEMO_002 (24小时验证间隔)`);
  console.log(`   - PREMIUM_001 (72小时验证间隔)`);
  console.log(`   - TEST_001 (1小时验证间隔)`);

  if (process.env.NODE_ENV === 'development' && process.env.ENABLE_DEBUG_ENDPOINTS === 'true') {
    console.log(`🐛 调试接口:`);
    console.log(`   - 数据库调试: http://localhost:${PORT}/debug/database`);
    console.log(`   - 系统信息: http://localhost:${PORT}/debug/system`);
  }

  console.log(`\n💡 激活码特点: 永久有效，后端始终返回成功，仅控制前端验证时机`);
});

// 内存监控（开发环境）
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    const usage = process.memoryUsage();
    const formatMemory = (bytes) => (bytes / 1024 / 1024).toFixed(2) + ' MB';

    if (usage.heapUsed > 500 * 1024 * 1024) { // 500MB
      console.warn('⚠️ 内存使用过高:', formatMemory(usage.heapUsed));
    }
  }, 60000); // 每分钟检查一次
}

// 数据清理任务（每天清理30天前的日志）
setInterval(async () => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    await new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM verification_logs WHERE timestamp < ?',
        [thirtyDaysAgo.toISOString()],
        function(err) {
          if (err) {
            console.error('清理日志失败:', err);
            reject(err);
          } else {
            console.log(`✅ 清理了 ${this.changes} 条过期日志`);
            resolve();
          }
        }
      );
    });
  } catch (error) {
    console.error('日志清理异常:', error);
  }
}, 24 * 60 * 60 * 1000); // 每天执行一次

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n🛑 正在关闭服务器...');

  db.close((err) => {
    if (err) {
      console.error('❌ 数据库关闭错误:', err.message);
      process.exit(1);
    } else {
      console.log('✅ 数据库连接已关闭');
      console.log('👋 服务已安全关闭');
      process.exit(0);
    }
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 收到终止信号，正在关闭服务器...');
  db.close(() => {
    console.log('✅ 数据库连接已关闭');
    process.exit(0);
  });
});

// 捕获未处理的异常
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕获的异常:', error);
  db.close(() => {
    process.exit(1);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的Promise拒绝:', reason);
});

module.exports = app;