/**
 * Chrome插件激活验证客户端示例代码
 *
 * 此代码展示了如何在Chrome插件中集成持久有效激活验证服务
 *
 * 特点：
 * - 持久有效激活码：激活码永不过期
 * - 自动续期验证：根据返回的next_verify_at自动重新验证
 * - 无感知续期：用户无需重新输入激活码
 * - 离线模式支持：网络异常时基于本地缓存工作
 */

class ActivationClient {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  /**
   * 核心验证方法
   * @param {string} code - 激活码
   * @param {string} productKey - 产品标识
   * @param {string} deviceId - 设备ID（可选）
   * @returns {Promise<Object>} 验证结果
   */
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
          device_id: deviceId || this.getDeviceId()
        })
      });

      const result = await response.json();

      if (result.success) {
        // 保存验证结果和下次验证时间
        await this.saveVerificationResult(result.data);

        console.log(`✅ 验证成功，下次验证时间: ${result.data.next_verify_at}`);
        console.log(`📊 验证间隔: ${result.data.verify_interval_hours} 小时`);

        return result;
      } else {
        console.error('❌ 验证失败:', result.message);
        return result;
      }

    } catch (error) {
      console.error('🌐 网络请求失败:', error);
      return {
        success: false,
        message: '网络连接失败'
      };
    }
  }

  /**
   * 检查当前激活状态
   * @returns {Promise<Object>} 激活状态
   */
  async checkStatus() {
    const data = await chrome.storage.local.get([
      'activated', 'nextVerifyAt', 'verifyInterval', 'productKey', 'lastVerify'
    ]);

    if (!data.activated || !data.nextVerifyAt) {
      return {
        activated: false,
        needVerify: true,
        message: '设备未激活'
      };
    }

    const now = new Date();
    const nextVerifyTime = new Date(data.nextVerifyAt);

    const remainingHours = Math.max(0, Math.floor((nextVerifyTime - now) / (1000 * 60 * 60)));

    return {
      activated: true,
      needVerify: now >= nextVerifyTime,
      nextVerifyAt: data.nextVerifyAt,
      remainingHours: remainingHours,
      verifyInterval: data.verifyInterval || 24,
      productKey: data.productKey,
      lastVerify: data.lastVerify
    };
  }

  /**
   * 自动验证管理
   * 检查当前状态，如果需要验证则自动进行
   * @returns {Promise<Object>} 验证结果
   */
  async autoVerify() {
    const status = await this.checkStatus();

    if (!status.activated) {
      console.log('🔑 设备未激活，需要首次验证');
      return await this.performFirstActivation();
    }

    if (status.needVerify) {
      console.log('⏰ 验证间隔到期，自动重新验证');
      return await this.performReactivation();
    }

    console.log(`✅ 激活状态有效，剩余 ${status.remainingHours} 小时`);
    return {
      success: true,
      message: '激活状态有效',
      data: {
        activated: true,
        remainingHours: status.remainingHours
      }
    };
  }

  /**
   * 执行首次激活
   * @returns {Promise<Object>} 激活结果
   */
  async performFirstActivation() {
    // 尝试从本地获取保存的激活码
    const { savedCode } = await chrome.storage.local.get(['savedCode']);

    if (savedCode) {
      console.log('🔄 使用保存的激活码进行验证');
      const result = await this.verify(savedCode, 'doubao_plugin');

      if (result.success) {
        console.log('✅ 使用保存的激活码验证成功');
        return result;
      } else {
        // 激活码无效，清除保存的信息
        await chrome.storage.local.remove(['savedCode', 'activated']);
        console.log('❌ 保存的激活码无效，需要用户重新输入');
      }
    }

    // 提示用户输入激活码
    const code = await this.promptForActivationCode();
    if (!code) {
      return {
        success: false,
        message: '用户取消激活'
      };
    }

    const result = await this.verify(code, 'doubao_plugin');

    if (result.success) {
      // 保存激活码
      await chrome.storage.local.set({ savedCode: code });
      console.log('✅ 首次激活成功，激活码已保存');
    } else {
      console.error('❌ 首次激活失败:', result.message);
    }

    return result;
  }

  /**
   * 执行重新激活（自动续期）
   * @returns {Promise<Object>} 重新激活结果
   */
  async performReactivation() {
    const { savedCode, productKey } = await chrome.storage.local.get(['savedCode', 'productKey']);

    if (!savedCode || !productKey) {
      console.error('❌ 缺少激活信息，需要重新激活');
      await this.clearActivationStatus();
      return await this.performFirstActivation();
    }

    const result = await this.verify(savedCode, productKey);

    if (result.success) {
      console.log('✅ 自动续期成功');
    } else {
      console.error('❌ 自动续期失败:', result.message);

      // 续期失败，清除状态，需要用户重新激活
      await this.clearActivationStatus();

      return {
        success: false,
        message: '自动续期失败，请重新激活',
        needReactivate: true
      };
    }

    return result;
  }

  /**
   * 离线验证模式
   * 当网络不可用时，基于本地缓存进行验证
   * @param {string} productKey - 产品标识
   * @returns {Promise<Object>} 离线验证结果
   */
  async verifyOffline(productKey) {
    console.log('📡 启用离线验证模式...');

    const data = await chrome.storage.local.get([
      'activated', 'nextVerifyAt', 'productKey', 'lastVerify'
    ]);

    // 检查是否有有效的本地激活状态
    if (!data.activated || !data.nextVerifyAt || data.productKey !== productKey) {
      return {
        success: false,
        message: '离线验证失败：无有效激活状态',
        offlineMode: true
      };
    }

    const now = new Date();
    const nextVerifyTime = new Date(data.nextVerifyAt);

    // 检查是否在有效期内
    if (now < nextVerifyTime) {
      const remainingHours = Math.floor((nextVerifyTime - now) / (1000 * 60 * 60));

      console.log(`✅ 离线验证通过：剩余 ${remainingHours} 小时`);

      return {
        success: true,
        data: {
          status: 'active',
          next_verify_at: data.nextVerifyAt,
          verify_interval_hours: data.verifyInterval || 24,
          activated_at: data.lastVerify,
          offline_mode: true
        },
        message: '离线验证通过（基于本地缓存）'
      };
    }

    return {
      success: false,
      message: '离线验证失败：验证间隔已到期',
      offlineMode: true,
      needOnlineVerify: true
    };
  }

  /**
   * 智能验证（结合在线和离线）
   * @param {string} code - 激活码
   * @param {string} productKey - 产品标识
   * @returns {Promise<Object>} 验证结果
   */
  async smartVerify(code, productKey) {
    // 首先尝试在线验证
    try {
      const onlineResult = await this.verify(code, productKey);
      if (onlineResult.success) {
        return onlineResult;
      }

      // 在线验证失败，尝试离线验证
      console.log('⚠️ 在线验证失败，尝试离线验证...');
      const offlineResult = await this.verifyOffline(productKey);

      if (offlineResult.success) {
        return offlineResult;
      }

      // 都失败，返回在线验证的错误信息
      return onlineResult;

    } catch (error) {
      console.log('🌐 网络异常，使用离线验证...');
      return await this.verifyOffline(productKey);
    }
  }

  /**
   * 保存验证结果到本地存储
   * @param {Object} data - 验证结果数据
   */
  async saveVerificationResult(data) {
    const result = {
      activated: true,
      nextVerifyAt: data.next_verify_at,
      verifyInterval: data.verify_interval_hours,
      productKey: data.code_info.product_key,
      lastVerify: data.activated_at,
      codeInfo: data.code_info
    };

    await chrome.storage.local.set(result);
    console.log('💾 验证结果已保存到本地存储');
  }

  /**
   * 清除激活状态
   */
  async clearActivationStatus() {
    await chrome.storage.local.remove([
      'activated', 'nextVerifyAt', 'verifyInterval',
      'productKey', 'lastVerify', 'codeInfo'
    ]);
    console.log('🗑️ 激活状态已清除');
  }

  /**
   * 生成设备唯一标识
   * @returns {string} 设备ID
   */
  generateDeviceId() {
    return `chrome_${navigator.platform}_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  }

  /**
   * 获取设备ID
   * @returns {Promise<string>} 设备ID
   */
  async getDeviceId() {
    const data = await chrome.storage.local.get(['deviceId']);

    if (data.deviceId) {
      return data.deviceId;
    }

    const deviceId = this.generateDeviceId();
    await chrome.storage.local.set({ deviceId });
    console.log(`🆔 生成新设备ID: ${deviceId}`);
    return deviceId;
  }

  /**
   * 提示用户输入激活码
   * @returns {Promise<string|null>} 用户输入的激活码
   */
  async promptForActivationCode() {
    return new Promise((resolve) => {
      // 创建一个简单的输入对话框
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        font-family: Arial, sans-serif;
      `;

      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background: white;
        padding: 30px;
        border-radius: 10px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        max-width: 400px;
        text-align: center;
      `;

      dialog.innerHTML = `
        <h2 style="margin: 0 0 20px 0; color: #333;">🔑 激活插件</h2>
        <p style="margin: 0 0 20px 0; color: #666;">
          请输入激活码以继续使用插件功能
        </p>
        <input type="text"
               id="activation-code-input"
               placeholder="请输入激活码"
               style="
                 width: 100%;
                 padding: 12px;
                 border: 1px solid #ddd;
                 border-radius: 5px;
                 font-size: 16px;
                 margin-bottom: 20px;
                 box-sizing: border-box;
               ">
        <div style="display: flex; gap: 10px; justify-content: center;">
          <button id="activation-cancel-btn"
                  style="
                    padding: 10px 20px;
                    border: 1px solid #ddd;
                    background: #f5f5f5;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 14px;
                  ">
            取消
          </button>
          <button id="activation-submit-btn"
                  style="
                    padding: 10px 20px;
                    border: none;
                    background: #007bff;
                    color: white;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 14px;
                  ">
            激活
          </button>
        </div>
      `;

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      const input = dialog.querySelector('#activation-code-input');
      const submitBtn = dialog.querySelector('#activation-submit-btn');
      const cancelBtn = dialog.querySelector('#activation-cancel-btn');

      const handleSubmit = () => {
        const code = input.value.trim();
        cleanup();
        resolve(code || null);
      };

      const handleCancel = () => {
        cleanup();
        resolve(null);
      };

      const cleanup = () => {
        overlay.remove();
        submitBtn.removeEventListener('click', handleSubmit);
        cancelBtn.removeEventListener('click', handleCancel);
      };

      submitBtn.addEventListener('click', handleSubmit);
      cancelBtn.addEventListener('click', handleCancel);

      // 回车键提交
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          handleSubmit();
        }
      });

      // 自动聚焦输入框
      setTimeout(() => input.focus(), 100);
    });
  }

  /**
   * 显示通知
   * @param {string} message - 通知消息
   * @param {string} type - 通知类型 (success/error/info)
   */
  showNotification(message, type = 'info') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: '插件激活状态',
      message: message
    });
  }
}

// ========================
// 使用示例和初始化
// ========================

// 创建激活客户端实例
const activationClient = new ActivationClient('http://localhost:3000');

/**
 * 插件功能启用
 */
function enablePluginFeatures() {
  console.log('🎉 插件功能已启用');
  // 在这里启用你的插件功能
  // 例如：显示插件图标、启用右键菜单等
}

/**
 * 插件功能禁用
 */
function disablePluginFeatures() {
  console.log('🚫 插件功能已禁用');
  // 在这里禁用你的插件功能
  // 例如：隐藏插件图标、禁用右键菜单等
}

/**
 * 插件初始化
 */
async function initializePlugin() {
  try {
    console.log('🚀 开始初始化插件...');

    const result = await activationClient.autoVerify();

    if (result.success) {
      console.log('✅ 插件初始化成功');
      enablePluginFeatures();

      // 显示成功通知
      activationClient.showNotification('插件激活成功！', 'success');
    } else {
      console.log('❌ 插件需要激活:', result.message);
      disablePluginFeatures();

      // 如果需要重新激活，显示提示
      if (result.needReactivate) {
        activationClient.showNotification('请重新激活插件', 'info');
      }
    }

    return result.success;

  } catch (error) {
    console.error('💥 插件初始化失败:', error);
    disablePluginFeatures();
    return false;
  }
}

/**
 * 定期检查激活状态
 */
async function periodicActivationCheck() {
  try {
    const status = await activationClient.checkStatus();

    if (status.needVerify) {
      console.log('⏰ 检测到需要重新验证激活状态');
      await initializePlugin();
    }
  } catch (error) {
    console.error('定期检查失败:', error);
  }
}

// ========================
// 事件监听器
// ========================

// 插件安装或更新时初始化
chrome.runtime.onInstalled.addListener((details) => {
  console.log('🔧 插件安装/更新:', details.reason);
  initializePlugin();
});

// 浏览器启动时初始化
chrome.runtime.onStartup.addListener(() => {
  console.log('🌟 浏览器启动');
  initializePlugin();
});

// 插件激活时初始化
chrome.runtime.onActivated.addListener(() => {
  console.log('🔌 插件激活');
  initializePlugin();
});

// 设置定期检查（每30分钟检查一次是否需要重新验证）
setInterval(periodicActivationCheck, 30 * 60 * 1000);

// 立即执行初始化
console.log('🚀 激活验证客户端已加载');
initializePlugin();

// 导出供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ActivationClient;
} else {
  window.ActivationClient = ActivationClient;
  window.activationClient = activationClient;
}