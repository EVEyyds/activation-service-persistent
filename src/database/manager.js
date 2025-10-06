const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class DatabaseManager {
  constructor(dbPath = null) {
    this.dbPath = dbPath || path.join(__dirname, '../../data/activation.db');
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            console.error('关闭数据库连接失败:', err);
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // 添加激活码
  async addActivationCode(code, productKey, verifyIntervalHours = 24, notes = '') {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO activation_codes (code, product_key, verify_interval_hours, notes) VALUES (?, ?, ?, ?)`;
      this.db.run(sql, [code, productKey, verifyIntervalHours, notes], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            success: true,
            id: this.lastID,
            message: `激活码 ${code} 添加成功`
          });
        }
      });
    });
  }

  // 删除激活码
  async deleteActivationCode(code, productKey) {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM activation_codes WHERE code = ? AND product_key = ?`;
      this.db.run(sql, [code, productKey], function(err) {
        if (err) {
          reject(err);
        } else {
          if (this.changes > 0) {
            resolve({
              success: true,
              message: `激活码 ${code} 删除成功`
            });
          } else {
            resolve({
              success: false,
              message: `未找到激活码 ${code}`
            });
          }
        }
      });
    });
  }

  // 修改激活码（只能修改验证间隔和备注）
  async updateActivationCode(code, productKey, { verifyIntervalHours, notes, status }) {
    return new Promise((resolve, reject) => {
      const updates = [];
      const params = [];

      if (verifyIntervalHours !== undefined) {
        updates.push('verify_interval_hours = ?');
        params.push(verifyIntervalHours);
      }
      if (notes !== undefined) {
        updates.push('notes = ?');
        params.push(notes);
      }
      if (status !== undefined) {
        updates.push('status = ?');
        params.push(status);
      }

      if (updates.length === 0) {
        resolve({
          success: false,
          message: '没有提供要更新的字段'
        });
        return;
      }

      params.push(code, productKey);
      const sql = `UPDATE activation_codes SET ${updates.join(', ')} WHERE code = ? AND product_key = ?`;

      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          if (this.changes > 0) {
            resolve({
              success: true,
              message: `激活码 ${code} 更新成功`
            });
          } else {
            resolve({
              success: false,
              message: `未找到激活码 ${code}`
            });
          }
        }
      });
    });
  }

  // 查询所有激活码
  async getAllActivationCodes() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM activation_codes ORDER BY created_at DESC`;
      this.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 根据条件查询激活码
  async searchActivationCodes({ code, productKey, status } = {}) {
    return new Promise((resolve, reject) => {
      const conditions = [];
      const params = [];

      if (code) {
        conditions.push('code LIKE ?');
        params.push(`%${code}%`);
      }
      if (productKey) {
        conditions.push('product_key LIKE ?');
        params.push(`%${productKey}%`);
      }
      if (status) {
        conditions.push('status = ?');
        params.push(status);
      }

      let sql = `SELECT * FROM activation_codes`;
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
      sql += ` ORDER BY created_at DESC`;

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 获取统计信息
  async getStatistics() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT
          COUNT(*) as total_codes,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_codes,
          COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_codes,
          COUNT(CASE WHEN verify_interval_hours = 1 THEN 1 END) as hourly_codes,
          COUNT(CASE WHEN verify_interval_hours = 24 THEN 1 END) as daily_codes,
          COUNT(CASE WHEN verify_interval_hours = 72 THEN 1 END) as extended_codes
        FROM activation_codes
      `;
      this.db.get(sql, [], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // 查看验证日志
  async getVerificationLogs(limit = 50, { code, result, startDate, endDate } = {}) {
    return new Promise((resolve, reject) => {
      const conditions = [];
      const params = [];

      if (code) {
        conditions.push('code LIKE ?');
        params.push(`%${code}%`);
      }
      if (result) {
        conditions.push('result = ?');
        params.push(result);
      }
      if (startDate) {
        conditions.push('timestamp >= ?');
        params.push(startDate);
      }
      if (endDate) {
        conditions.push('timestamp <= ?');
        params.push(endDate);
      }

      let sql = `SELECT * FROM verification_logs`;
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
      sql += ` ORDER BY timestamp DESC LIMIT ?`;
      params.push(limit);

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 清理过期日志
  async cleanOldLogs(daysToKeep = 30) {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM verification_logs WHERE timestamp < datetime('now', '-${daysToKeep} days')`;
      this.db.run(sql, [], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            success: true,
            deletedCount: this.changes,
            message: `已清理 ${this.changes} 条过期日志`
          });
        }
      });
    });
  }
}

module.exports = DatabaseManager;