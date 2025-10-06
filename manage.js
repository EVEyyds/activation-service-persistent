#!/usr/bin/env node

const DatabaseManager = require('./src/database/manager');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('🔧 激活码数据库管理工具');
  console.log('=====================================\n');

  const manager = new DatabaseManager();

  try {
    await manager.connect();
    console.log('✅ 数据库连接成功\n');

    while (true) {
      console.log('请选择操作：');
      console.log('1. 添加激活码');
      console.log('2. 删除激活码');
      console.log('3. 修改激活码');
      console.log('4. 查看所有激活码');
      console.log('5. 搜索激活码');
      console.log('6. 查看统计信息');
      console.log('7. 查看验证日志');
      console.log('8. 清理过期日志');
      console.log('9. 退出\n');

      const choice = await question('请输入选项 (1-9): ');

      try {
        switch (choice.trim()) {
          case '1':
            await addActivationCode(manager);
            break;
          case '2':
            await deleteActivationCode(manager);
            break;
          case '3':
            await updateActivationCode(manager);
            break;
          case '4':
            await listAllCodes(manager);
            break;
          case '5':
            await searchCodes(manager);
            break;
          case '6':
            await showStatistics(manager);
            break;
          case '7':
            await viewLogs(manager);
            break;
          case '8':
            await cleanLogs(manager);
            break;
          case '9':
            console.log('👋 再见！');
            process.exit(0);
          default:
            console.log('❌ 无效选项，请重新选择\n');
        }
      } catch (error) {
        console.error('❌ 操作失败:', error.message, '\n');
      }
    }
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message);
    process.exit(1);
  }
}

async function addActivationCode(manager) {
  console.log('\n📝 添加激活码');
  const code = await question('激活码: ');
  const productKey = await question('产品标识: ');
  const interval = await question('验证间隔(小时，默认24): ') || '24';
  const notes = await question('备注(可选): ');

  const result = await manager.addActivationCode(code, productKey, parseInt(interval), notes);
  console.log('✅', result.message, '\n');
}

async function deleteActivationCode(manager) {
  console.log('\n🗑️ 删除激活码');
  const code = await question('要删除的激活码: ');
  const productKey = await question('产品标识: ');

  const confirm = await question(`确认删除激活码 ${code} 吗？(y/N): `);
  if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
    const result = await manager.deleteActivationCode(code, productKey);
    console.log(result.success ? '✅' : '⚠️', result.message, '\n');
  } else {
    console.log('❌ 已取消删除\n');
  }
}

async function updateActivationCode(manager) {
  console.log('\n✏️ 修改激活码');
  const code = await question('激活码: ');
  const productKey = await question('产品标识: ');

  // 先查看当前信息
  const codes = await manager.searchActivationCodes({ code, productKey });
  if (codes.length === 0) {
    console.log('❌ 未找到激活码\n');
    return;
  }

  const currentCode = codes[0];
  console.log('\n当前信息:');
  console.log(`验证间隔: ${currentCode.verify_interval_hours} 小时`);
  console.log(`状态: ${currentCode.status}`);
  console.log(`备注: ${currentCode.notes || '无'}`);

  console.log('\n请输入新值（留空保持不变）:');
  const interval = await question('验证间隔(小时): ');
  const status = await question('状态(active/inactive): ');
  const notes = await question('备注: ');

  const updateData = {};
  if (interval) updateData.verifyIntervalHours = parseInt(interval);
  if (status) updateData.status = status;
  if (notes !== undefined) updateData.notes = notes;

  if (Object.keys(updateData).length === 0) {
    console.log('❌ 没有提供更新内容\n');
    return;
  }

  const result = await manager.updateActivationCode(code, productKey, updateData);
  console.log(result.success ? '✅' : '⚠️', result.message, '\n');
}

async function listAllCodes(manager) {
  console.log('\n📋 所有激活码');
  const codes = await manager.getAllActivationCodes();

  if (codes.length === 0) {
    console.log('❌ 没有找到激活码\n');
    return;
  }

  console.log('\nID\t激活码\t\t产品标识\t\t状态\t验证间隔\t创建时间\t\t备注');
  console.log(''.padEnd(100, '-'));

  codes.forEach(code => {
    console.log(`${code.id}\t${code.code}\t\t${code.product_key}\t\t${code.status}\t${code.verify_interval_hours}h\t\t${code.created_at}\t${code.notes || '-'}`);
  });
  console.log('\n');
}

async function searchCodes(manager) {
  console.log('\n🔍 搜索激活码');
  const code = await question('激活码(可选): ');
  const productKey = await question('产品标识(可选): ');
  const status = await question('状态(active/inactive, 可选): ');

  const searchCriteria = {};
  if (code) searchCriteria.code = code;
  if (productKey) searchCriteria.productKey = productKey;
  if (status) searchCriteria.status = status;

  const codes = await manager.searchActivationCodes(searchCriteria);

  if (codes.length === 0) {
    console.log('❌ 没有找到匹配的激活码\n');
    return;
  }

  console.log('\n搜索结果:');
  console.log('ID\t激活码\t\t产品标识\t\t状态\t验证间隔\t创建时间\t\t备注');
  console.log(''.padEnd(100, '-'));

  codes.forEach(code => {
    console.log(`${code.id}\t${code.code}\t\t${code.product_key}\t\t${code.status}\t${code.verify_interval_hours}h\t\t${code.created_at}\t${code.notes || '-'}`);
  });
  console.log('\n');
}

async function showStatistics(manager) {
  console.log('\n📊 统计信息');
  const stats = await manager.getStatistics();

  console.log(`总激活码数: ${stats.total_codes}`);
  console.log(`有效激活码: ${stats.active_codes}`);
  console.log(`无效激活码: ${stats.inactive_codes}`);
  console.log(`1小时验证: ${stats.hourly_codes}`);
  console.log(`24小时验证: ${stats.daily_codes}`);
  console.log(`72小时验证: ${stats.extended_codes}`);
  console.log('\n');
}

async function viewLogs(manager) {
  console.log('\n📝 验证日志');
  const limit = await question('显示条数(默认50): ') || '50';
  const code = await question('激活码筛选(可选): ');
  const result = await question('结果筛选(success/failed, 可选): ');

  const criteria = {};
  if (code) criteria.code = code;
  if (result) criteria.result = result;

  const logs = await manager.getVerificationLogs(parseInt(limit), criteria);

  if (logs.length === 0) {
    console.log('❌ 没有找到匹配的日志\n');
    return;
  }

  console.log('\n最近的验证日志:');
  console.log('时间\t\t\t激活码\t\t结果\t设备ID\t\t\tIP地址');
  console.log(''.padEnd(100, '-'));

  logs.forEach(log => {
    const time = new Date(log.timestamp).toLocaleString();
    console.log(`${time}\t${log.code}\t\t${log.result}\t${log.device_id || '-'}\t${log.ip_address || '-'}`);
  });
  console.log('\n');
}

async function cleanLogs(manager) {
  console.log('\n🧹 清理过期日志');
  const days = await question('保留最近多少天的日志？(默认30): ') || '30';

  const confirm = await question(`确认清理 ${days} 天前的日志吗？(y/N): `);
  if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
    const result = await manager.cleanOldLogs(parseInt(days));
    console.log('✅', result.message, '\n');
  } else {
    console.log('❌ 已取消清理\n');
  }
}

// 处理程序退出
process.on('SIGINT', () => {
  console.log('\n\n👋 再见！');
  rl.close();
  process.exit(0);
});

// 运行主程序
main();