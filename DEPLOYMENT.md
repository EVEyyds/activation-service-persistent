# 生产环境部署指南

## 🚀 完整部署流程

### 1. 服务器准备
```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装必要软件
sudo apt install -y nginx git pm2
```

### 2. 部署应用
```bash
# 克隆项目
git clone <your-repo-url>
cd activation-service-persistent

# 安装生产依赖
npm install --production

# 复制生产环境配置
cp .env.production .env

# 初始化数据库
npm run init-db

# 启动服务
pm2 start src/app.js --name activation-service

# 设置开机自启
pm2 startup
pm2 save
```

### 3. 配置Nginx反向代理
```bash
# 创建Nginx配置
sudo nano /etc/nginx/sites-available/activation-service
```

配置内容：
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# 启用配置
sudo ln -s /etc/nginx/sites-available/activation-service /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. 配置SSL（推荐）
```bash
# 安装Certbot
sudo apt install certbot python3-certbot-nginx

# 获取SSL证书
sudo certbot --nginx -d your-domain.com
```

### 5. 防火墙配置
```bash
# 只开放80和443端口
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## 📊 监控和维护

### 查看服务状态
```bash
pm2 status
pm2 logs activation-service
```

### 重启服务
```bash
pm2 restart activation-service
```

### 更新代码
```bash
git pull
npm install --production
pm2 restart activation-service
```

## 🔒 安全建议

1. **定期备份数据库**：
   ```bash
   # 创建备份脚本
   echo "#!/bin/bash
   cp ./data/activation.db ./backups/activation_$(date +%Y%m%d_%H%M%S).db
   find ./backups/ -name 'activation_*.db' -mtime +7 -delete" > backup.sh

   chmod +x backup.sh
   # 添加到crontab，每天执行
   echo "0 2 * * * /path/to/backup.sh" | crontab -
   ```

2. **监控日志**：
   ```bash
   # 配置logrotate
   sudo nano /etc/logrotate.d/activation-service
   ```

3. **限制访问**：如果只给Chrome插件使用，可以限制User-Agent：
   ```nginx
   if ($http_user_agent !~* "(Chrome|Mozilla)") {
       return 403;
   }
   ```

## 🌐 访问地址

部署完成后，API地址变为：
- `https://your-domain.com/api/verify`
- `https://your-domain.com/health`
- `https://your-domain.com/api/stats`

## 📱 Chrome插件配置更新

在Chrome插件中更新baseURL：
```javascript
// 生产环境
const activationClient = new ActivationClient('https://your-domain.com');

// 或者本地开发
const activationClient = new ActivationClient('http://localhost:3000');
```