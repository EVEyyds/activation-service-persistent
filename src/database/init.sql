-- 持久有效激活验证服务数据库初始化脚本

-- 激活码表
CREATE TABLE IF NOT EXISTS activation_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,           -- 激活码
    product_key TEXT NOT NULL,           -- 产品标识
    status TEXT DEFAULT 'active',       -- 状态：active/inactive
    verify_interval_hours INTEGER DEFAULT 24, -- 验证间隔（小时）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT                           -- 备注
);

-- 验证记录表（仅用于统计）
CREATE TABLE IF NOT EXISTS verification_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,                  -- 激活码
    device_id TEXT,                     -- 设备标识（可选，仅用于统计）
    result TEXT NOT NULL,               -- 结果：success/failed
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT                      -- IP地址（可选）
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_activation_codes_lookup ON activation_codes(code, product_key, status);
CREATE INDEX IF NOT EXISTS idx_verification_logs_timestamp ON verification_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_verification_logs_code ON verification_logs(code, timestamp);

-- 插入默认激活码
INSERT OR IGNORE INTO activation_codes (code, product_key, verify_interval_hours, notes) VALUES
('DEMO_001', 'doubao_plugin', 24, '演示激活码1 - 24小时验证间隔'),
('DEMO_002', 'doubao_plugin', 24, '演示激活码2 - 24小时验证间隔'),
('PREMIUM_001', 'doubao_plugin', 72, '高级激活码 - 72小时验证间隔'),
('TEST_001', 'test_product', 1, '测试激活码 - 1小时验证间隔');