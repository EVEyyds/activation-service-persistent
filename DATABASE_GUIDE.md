# 数据库管理指南

## 🎯 管理激活码的方法

### 方法1：使用交互式管理工具（推荐）

```bash
# 在项目目录下运行
node manage.js
```

这个工具提供了完整的交互式界面，支持：
- ✅ 添加激活码
- ✅ 删除激活码
- ✅ 修改激活码
- ✅ 查看所有激活码
- ✅ 搜索激活码
- ✅ 查看统计信息
- ✅ 查看验证日志
- ✅ 清理过期日志

### 方法2：直接使用SQLite命令

```bash
# 连接到数据库
sqlite3 data/activation.db

# 查看所有表
.tables

# 查看表结构
.schema activation_codes

# 查询所有激活码
SELECT * FROM activation_codes;

# 添加新激活码
INSERT INTO activation_codes (code, product_key, verify_interval_hours, notes)
VALUES ('NEW_CODE', 'your_product', 24, '新激活码');

# 删除激活码
DELETE FROM activation_codes WHERE code = 'UNWANTED_CODE';

# 更新激活码状态
UPDATE activation_codes SET status = 'inactive' WHERE code = 'OLD_CODE';

# 退出SQLite
.quit
```

### 方法3：使用编程接口

```javascript
const DatabaseManager = require('./src/database/manager');

async function example() {
  const manager = new DatabaseManager();
  await manager.connect();

  // 添加激活码
  await manager.addActivationCode('DEMO_003', 'doubao_plugin', 24, '演示激活码3');

  // 查询激活码
  const codes = await manager.getAllActivationCodes();
  console.log(codes);

  // 删除激活码
  await manager.deleteActivationCode('DEMO_003', 'doubao_plugin');

  await manager.close();
}
```

## 📊 数据库表结构

### activation_codes 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键，自增 |
| code | TEXT | 激活码（唯一） |
| product_key | TEXT | 产品标识 |
| status | TEXT | 状态：active/inactive |
| verify_interval_hours | INTEGER | 验证间隔（小时） |
| created_at | DATETIME | 创建时间 |
| notes | TEXT | 备注 |

### verification_logs 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键，自增 |
| code | TEXT | 激活码 |
| device_id | TEXT | 设备ID（可选） |
| result | TEXT | 结果：success/failed |
| timestamp | DATETIME | 验证时间 |
| ip_address | TEXT | IP地址（可选） |

## 🔧 常用操作示例

### 1. 批量添加激活码

```sql
-- 使用SQLite命令行
INSERT INTO activation_codes (code, product_key, verify_interval_hours, notes) VALUES
('BATCH_001', 'doubao_plugin', 24, '批量激活码1'),
('BATCH_002', 'doubao_plugin', 24, '批量激活码2'),
('BATCH_003', 'doubao_plugin', 72, '批量激活码3'),
('BATCH_004', 'test_product', 1, '批量测试激活码');
```

### 2. 批量修改状态

```sql
-- 批量禁用激活码
UPDATE activation_codes SET status = 'inactive' WHERE code LIKE 'TEST_%';

-- 批量启用激活码
UPDATE activation_codes SET status = 'active' WHERE code LIKE 'DEMO_%';
```

### 3. 查看不同验证间隔的激活码

```sql
-- 查看24小时验证间隔的激活码
SELECT * FROM activation_codes WHERE verify_interval_hours = 24;

-- 查看72小时验证间隔的激活码
SELECT * FROM activation_codes WHERE verify_interval_hours = 72;
```

### 4. 查看使用统计

```sql
-- 查看今日验证次数
SELECT
  COUNT(*) as total_verifications,
  COUNT(CASE WHEN result = 'success' THEN 1 END) as success_count,
  COUNT(CASE WHEN result = 'failed' THEN 1 END) as failed_count
FROM verification_logs
WHERE date(timestamp) = date('now');

-- 查看最活跃的激活码
SELECT
  code,
  COUNT(*) as usage_count
FROM verification_logs
WHERE date(timestamp) = date('now')
GROUP BY code
ORDER BY usage_count DESC;

-- 查看每个产品的使用情况
SELECT
  ac.product_key,
  COUNT(vl.id) as verification_count,
  COUNT(CASE WHEN vl.result = 'success' THEN 1 END) as success_count
FROM activation_codes ac
LEFT JOIN verification_logs vl ON ac.code = vl.code
GROUP BY ac.product_key;
```

### 5. 数据清理

```sql
-- 清理30天前的日志
DELETE FROM verification_logs
WHERE timestamp < datetime('now', '-30 days');

-- 清理所有验证日志（只保留激活码）
DELETE FROM verification_logs;

-- 重置所有激活码状态
UPDATE activation_codes SET status = 'active';
```

## 📱 在生产环境中的操作

### 1. 备份数据库

```bash
# 创建备份
cp data/activation.db backups/activation_$(date +%Y%m%d_%H%M%S).db

# 自动备份脚本
#!/bin/bash
BACKUP_DIR="/path/to/backups"
mkdir -p $BACKUP_DIR
cp data/activation.db $BACKUP_DIR/activation_$(date +%Y%m%d_%H%M%S).db

# 保留最近7天的备份
find $BACKUP_DIR -name "activation_*.db" -mtime +7 -delete
```

### 2. 数据库维护

```bash
# 使用管理工具
node manage.js

# 或者直接SQLite
sqlite3 data/activation.db
```

### 3. 监控数据库大小

```bash
# 查看数据库大小
ls -lh data/activation.db

# 查看表记录数
sqlite3 data/activation.db "SELECT COUNT(*) FROM activation_codes;"
sqlite3 data/activation.db "SELECT COUNT(*) FROM verification_logs;"
```

## ⚠️ 注意事项

1. **备份数据**：在生产环境操作前一定要备份数据库
2. **测试环境**：先在测试环境验证操作
3. **权限控制**：确保数据库文件有正确的读写权限
4. **定期清理**：定期清理过期日志，避免数据库过大

## 🚀 快速命令参考

```bash
# 启动管理工具
node manage.js

# 直接SQLite操作
sqlite3 data/activation.db

# 备份数据库
cp data/activation.db data/activation.db.backup

# 查看日志
tail -f logs/combined.log
```

现在你可以轻松管理激活码了！推荐使用 `node manage.js` 交互式工具，操作简单直观。