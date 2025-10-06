# 服务器部署完整指南

## 🚀 服务器环境准备

### 1. 系统要求
- Ubuntu 18.04+ / CentOS 7+ / Debian 9+
- Node.js 14.0+ (如果没有，按下方安装)
- Nginx
- PM2

### 2. 安装Node.js（如果服务器没有）
```bash
# 使用NodeSource仓库安装最新LTS版本
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version
npm --version
```

### 3. 安装其他必要软件
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y nginx git pm2 sqlite3

# CentOS/RHEL
sudo yum update
sudo yum install -y nginx git pm2 sqlite3
```

## 📦 部署应用

### 1. 上传项目到服务器
```bash
# 方式1：Git克隆（推荐）
git clone <你的仓库地址>
cd activation-service-persistent

# 方式2：直接上传压缩包
# scp -r ./activation-service-persistent user@your-server:/home/user/
```

### 2. 安装项目依赖
```bash
# 只安装生产环境依赖
npm install --production

# 创建生产环境配置文件
cp .env.production .env
```

### 3. 初始化数据库
```bash
# 创建必要目录
mkdir -p data logs backups

# 初始化数据库（会自动创建表和默认数据）
npm run init-db

# 验证数据库
sqlite3 data/activation.db "SELECT * FROM activation_codes;"
```

### 4. 测试服务是否正常运行
```bash
# 直接运行测试
node src/app.js

# 如果看到以下输出说明正常：
# 🚀 持久有效激活验证服务已启动
# 📍 服务地址: http://localhost:3000

# 按 Ctrl+C 停止测试
```

## 🔧 配置Nginx反向代理

### 1. 创建Nginx配置文件
```bash
sudo nano /etc/nginx/sites-available/activation-service
```

### 2. 配置内容（根据你的域名修改）
```nginx
server {
    listen 80;
    server_name your-domain.com;  # 改为你的域名或IP

    # 日志
    access_log /var/log/nginx/activation_service.access.log;
    error_log /var/log/nginx/activation_service.error.log;

    # 反向代理到Node.js服务
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # 缓冲设置
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
    }

    # 健康检查接口（可选，直接返回）
    location /health {
        proxy_pass http://localhost:3000;
        access_log off;
    }
}
```

### 3. 启用配置
```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/activation-service /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重载Nginx
sudo systemctl reload nginx

# 启动Nginx（如果未运行）
sudo systemctl start nginx
sudo systemctl enable nginx
```

## 🔐 配置SSL证书（Let's Encrypt）

### 1. 安装Certbot
```bash
# Ubuntu/Debian
sudo apt install certbot python3-certbot-nginx

# CentOS/RHEL
sudo yum install certbot python3-certbot-nginx
```

### 2. 获取SSL证书
```bash
# 将your-domain.com改为你的实际域名
sudo certbot --nginx -d your-domain.com

# 按提示输入邮箱，同意条款
```

### 3. 自动续期
```bash
# 测试自动续期
sudo certbot renew --dry-run

# 添加到crontab（自动续期）
echo "0 12 * * * /usr/bin/certbot renew --quiet" | sudo crontab -
```

## 🚀 启动应用服务

### 1. 使用PM2启动
```bash
# 使用配置文件启动
pm2 start ecosystem.config.js --env production

# 或者直接启动
pm2 start src/app.js --name activation-service

# 设置开机自启
pm2 startup
pm2 save
```

### 2. 验证服务状态
```bash
# 查看PM2状态
pm2 status

# 查看日志
pm2 logs activation-service

# 查看详细信息
pm2 describe activation-service
```

## 🔥 配置防火墙

### 1. Ubuntu (UFW)
```bash
# 启用防火墙
sudo ufw enable

# 允许SSH（重要！）
sudo ufw allow ssh

# 允许HTTP和HTTPS
sudo ufw allow 80
sudo ufw allow 443

# 查看状态
sudo ufw status
```

### 2. CentOS (firewalld)
```bash
# 启动防火墙
sudo systemctl start firewalld
sudo systemctl enable firewalld

# 允许HTTP和HTTPS
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-service=ssh

# 重载配置
sudo firewall-cmd --reload

# 查看状态
sudo firewall-cmd --list-all
```

## ✅ 测试部署结果

### 1. 测试API接口
```bash
# 测试健康检查
curl https://your-domain.com/health

# 测试激活码验证
curl -X POST https://your-domain.com/api/verify \
  -H "Content-Type: application/json" \
  -d '{"code": "DEMO_001", "product_key": "doubao_plugin"}'
```

### 2. 浏览器测试
访问以下地址：
- `https://your-domain.com/health` - 健康检查
- `https://your-domain.com/api/stats` - 统计信息

## 📊 监控和维护

### 1. 常用PM2命令
```bash
# 重启服务
pm2 restart activation-service

# 重载服务（优雅重启）
pm2 reload activation-service

# 停止服务
pm2 stop activation-service

# 删除服务
pm2 delete activation-service

# 查看实时日志
pm2 logs activation-service --lines 100
```

### 2. 查看系统资源
```bash
# 查看PM2监控
pm2 monit

# 查看系统负载
htop
top
```

### 3. 日志管理
```bash
# PM2日志位置
ls -la ~/.pm2/logs/

# 应用日志位置
ls -la /path/to/activation-service-persistent/logs/

# Nginx日志
sudo tail -f /var/log/nginx/activation_service.access.log
sudo tail -f /var/log/nginx/activation_service.error.log
```

## 🔄 更新应用

### 1. 更新代码
```bash
# 进入项目目录
cd activation-service-persistent

# 拉取最新代码
git pull

# 安装新依赖（如果有）
npm install --production

# 重启服务
pm2 restart activation-service
```

### 2. 数据库迁移（如果需要）
```bash
# 如果数据库结构有变化，可能需要备份数据库
cp data/activation.db data/activation.db.backup.$(date +%Y%m%d)

# 重新初始化（谨慎使用）
npm run init-db
```

## 🆘 故障排除

### 1. 服务无法启动
```bash
# 查看详细错误
pm2 logs activation-service --err

# 检查端口是否被占用
sudo netstat -tlnp | grep 3000

# 检查文件权限
ls -la data/ logs/
```

### 2. Nginx配置问题
```bash
# 测试配置
sudo nginx -t

# 查看Nginx日志
sudo journalctl -u nginx
```

### 3. 数据库问题
```bash
# 检查数据库文件
ls -la data/activation.db

# 手动测试数据库
sqlite3 data/activation.db "SELECT COUNT(*) FROM activation_codes;"
```

## 🎯 完成后的访问地址

- **API基础地址**: `https://your-domain.com/api/verify`
- **健康检查**: `https://your-domain.com/health`
- **统计信息**: `https://your-domain.com/api/stats`

现在你的Chrome插件只需要将baseURL改为 `https://your-domain.com` 即可！