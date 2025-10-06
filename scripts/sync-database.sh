#!/bin/bash

# 数据库同步脚本
# 将本地数据库同步到服务器

# 配置
LOCAL_DB_PATH="./data/activation.db"
SERVER_USER="your_username"      # 修改为你的服务器用户名
SERVER_IP="your_server_ip"       # 修改为你的服务器IP
SERVER_PATH="/path/to/activation-service-persistent/data"  # 修改为服务器上的路径

echo "🔄 开始同步数据库文件..."

# 检查本地数据库是否存在
if [ ! -f "$LOCAL_DB_PATH" ]; then
    echo "❌ 本地数据库文件不存在: $LOCAL_DB_PATH"
    exit 1
fi

# 创建本地备份
echo "💾 创建本地备份..."
cp "$LOCAL_DB_PATH" "./backups/activation_$(date +%Y%m%d_%H%M%S).db"

# 压缩数据库文件（传输更快）
echo "📦 压缩数据库文件..."
gzip -c "$LOCAL_DB_PATH" > ./activation.db.gz

# 上传到服务器
echo "⬆️ 上传到服务器..."
scp ./activation.db.gz "${SERVER_USER}@${SERVER_IP}:/tmp/"

# 在服务器上解压并替换
echo "🔧 在服务器上部署..."
ssh "${SERVER_USER}@${SERVER_IP}" << EOF
    # 创建备份目录和备份
    mkdir -p "${SERVER_PATH}/backups"
    if [ -f "${SERVER_PATH}/activation.db" ]; then
        cp "${SERVER_PATH}/activation.db" "${SERVER_PATH}/backups/activation_\$(date +%Y%m%d_%H%M%S).db"
    fi

    # 解压新数据库
    gunzip -c /tmp/activation.db.gz > "${SERVER_PATH}/activation.db"

    # 设置权限
    chmod 644 "${SERVER_PATH}/activation.db"

    # 清理临时文件
    rm /tmp/activation.db.gz

    echo "✅ 服务器数据库更新完成"
EOF

# 清理本地临时文件
rm ./activation.db.gz

echo "✅ 数据库同步完成！"
echo ""
echo "📊 同步信息："
echo "   本地文件: $LOCAL_DB_PATH"
echo "   服务器: ${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}"
echo "   大小: $(du -h "$LOCAL_DB_PATH" | cut -f1)"