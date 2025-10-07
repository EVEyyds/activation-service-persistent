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

function addVerificationLog(code, device_id, result) {
  memoryDatabase.verificationLogs.push({
    code,
    device_id: device_id || null,
    result,
    timestamp: new Date().toISOString(),
    ip_address: null
  });

  if (memoryDatabase.verificationLogs.length > 100) {
    memoryDatabase.verificationLogs = memoryDatabase.verificationLogs.slice(-100);
  }
}

function handler(req, res) {
  // 处理健康检查
  if (req.method === 'GET' && req.url === '/health') {
    return res.status(200).json({
      status: 'ok',
      service: 'activation-service-simple',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  }

  // 处理验证接口
  if (req.method === 'POST' && req.url === '/api/verify') {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const { code, product_key, device_id } = JSON.parse(body);

          if (!code || !product_key) {
            res.status(400).json({
              success: false,
              message: '激活码和产品标识不能为空'
            });
            return resolve();
          }

          const activation = memoryDatabase.activationCodes.find(
            item => item.code === code && item.product_key === product_key && item.status === 'active'
          );

          if (!activation) {
            addVerificationLog(code, device_id, 'failed');
            res.status(200).json({
              success: false,
              message: '激活码不存在或产品不匹配',
              timestamp: new Date().toISOString()
            });
            return resolve();
          }

          const now = new Date();
          const nextVerifyTime = new Date(
            now.getTime() + activation.verify_interval_hours * 60 * 60 * 1000
          );

          addVerificationLog(code, device_id, 'success');

          res.status(200).json({
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
          resolve();
        } catch (error) {
          res.status(500).json({
            success: false,
            message: '服务器内部错误',
            timestamp: new Date().toISOString()
          });
          resolve();
        }
      });
    });
  }

  // 处理统计接口
  if (req.method === 'GET' && req.url === '/api/stats') {
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = memoryDatabase.verificationLogs.filter(
      log => log.timestamp.startsWith(today)
    );

    const successCount = todayLogs.filter(log => log.result === 'success').length;
    const failedCount = todayLogs.filter(log => log.result === 'failed').length;

    return res.status(200).json({
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
  }

  // 404处理
  res.status(404).json({
    success: false,
    message: '接口不存在',
    timestamp: new Date().toISOString()
  });
}

module.exports = handler;