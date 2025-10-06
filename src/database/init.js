// 数据库初始化脚本
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

async function initializeDatabase() {
  try {
    // 确保数据目录存在
    const dataDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'activation.db');
    const db = new sqlite3.Database(dbPath);

    console.log('🔄 开始初始化数据库...');

    // 读取初始化SQL文件
    const initSQL = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
    const statements = initSQL.split(';').filter(stmt => stmt.trim());

    // 执行SQL语句
    for (const statement of statements) {
      if (statement.trim()) {
        await new Promise((resolve, reject) => {
          db.run(statement, (err) => {
            if (err) {
              console.error('SQL执行错误:', err.message);
              reject(err);
            } else {
              resolve();
            }
          });
        });
      }
    }

    // 配置数据库性能优化
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run("PRAGMA journal_mode = WAL", (err) => {
          if (err) reject(err);
        });
        db.run("PRAGMA synchronous = NORMAL", (err) => {
          if (err) reject(err);
        });
        db.run("PRAGMA cache_size = 10000", (err) => {
          if (err) reject(err);
        });
        db.run("PRAGMA temp_store = MEMORY", (err) => {
          if (err) reject(err);
        });
        db.run("PRAGMA foreign_keys = ON", (err) => {
          if (err) reject(err);
        });
        db.run("PRAGMA busy_timeout = 30000", (err) => {
          if (err) reject(err);
        } else {
          resolve();
        }
        });
      });
    });

    // 验证数据是否正确插入
    const count = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM activation_codes', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });

    console.log(`✅ 数据库初始化完成！`);
    console.log(`📊 数据库位置: ${dbPath}`);
    console.log(`🔑 已创建 ${count} 个默认激活码`);

    db.close();

  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本，则执行初始化
if (require.main === module) {
  initializeDatabase();
}

module.exports = { initializeDatabase };