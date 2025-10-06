const express = require('express');

// 创建Vercel适配的服务器实例
const app = express();

// 内存数据库（适合Serverless环境）
const memoryDatabase = {
  activationCodes: [
    { code: 'DEMO_001', product_key: 'doubao_plugin', verify_interval_hours: 24, status: 'active' },
    { code: 'DEMO_002', product_key: 'doubao_plugin', verify_interval_hours: 24, status: 'active' },
    { code: 'PREMIUM_001', product_key: 'doubao_plugin', verify_interval_hours: 72, status: 'active' },
    { code: 'TEST_001', product_key: 'test_product', verify_interval_hours: 1, status: 'active' },
    { code: 'BATCH_001', product_key: 'doubao_plugin', verify_interval_hours: 168, status: 'active', notes: '周验证高级激活码' }
  ],
  verificationLogs: []
};

// 从原始应用复制基础配置
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// 基础健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'activation-service-simple',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// 添加日志记录功能
function addVerificationLog(code, device_id, result) {
  memoryDatabase.verificationLogs.push({
    code,
    device_id: device_id || null,
    result,
    timestamp: new Date().toISOString(),
    ip_address: null
  });

  // 保持日志数量在100条以内
  if (memoryDatabase.verificationLogs.length > 100) {
    memoryDatabase.verificationLogs = memoryDatabase.verificationLogs.slice(-100);
  }
}

// 验证接口
app.post('/api/verify', (req, res) => {
  const { code, product_key, device_id } = req.body;

  // 参数验证
  if (!code || !product_key) {
    return res.status(400).json({
      success: false,
      message: '激活码和产品标识不能为空'
    });
  }

  // 查找激活码
  const activation = memoryDatabase.activationCodes.find(
    item => item.code === code && item.product_key === product_key && item.status === 'active'
  );

  if (!activation) {
    addVerificationLog(code, device_id, 'failed');
    return res.json({
      success: false,
      message: '激活码不存在或产品不匹配',
      timestamp: new Date().toISOString()
    });
  }

  // 计算下次验证时间
  const now = new Date();
  const nextVerifyTime = new Date(
    now.getTime() + activation.verify_interval_hours * 60 * 60 * 1000
  );

  // 记录成功日志
  addVerificationLog(code, device_id, 'success');

  return res.json({
    success: true,
    data: {
      status: 'active',
      next_verify_at: nextVerifyTime.toISOString(),
      verify_interval_hours: activation.verify_interval_hours,
      activated_at: now.toISOString()
    },
    message: '验证成功',
    timestamp: new Date().toISOString()
  });
});

// 统计接口
app.get('/api/stats', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const todayLogs = memoryDatabase.verificationLogs.filter(
    log => log.timestamp.startsWith(today)
  );

  const successCount = todayLogs.filter(log => log.result === 'success').length;
  const failedCount = todayLogs.filter(log => log.result === 'failed').length;

  res.json({
    success: true,
    data: {
      active_codes: memoryDatabase.activationCodes.length,
      today_verifications: todayLogs.length,
      today_success: successCount,
      today_failed: failedCount,
      total_logs: memoryDatabase.verificationLogs.length
    },
    message: '操作成功',
    timestamp: new Date().toISOString()
  });
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在',
    timestamp: new Date().toISOString()
  });
});

// 导出Vercel函数处理器
module.exports = app;