module.exports = {
  apps: [{
    name: 'activation-service',
    script: './src/app.js',
    instances: 'max', // 使用所有CPU核心
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    // 日志配置
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

    // 重启策略
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '1G',

    // 监控
    watch: false,
    ignore_watch: ['node_modules', 'logs', 'data'],

    // 其他配置
    merge_logs: true,
    autorestart: true
  }]
};