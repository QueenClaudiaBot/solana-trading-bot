module.exports = {
  apps: [
    {
      name: 'queen-claudia-bot',
      script: 'src/index.ts',
      interpreter: 'ts-node',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      restart_delay: 5000,       // wait 5s before restarting on crash
      max_restarts: 10,           // max 10 restarts before giving up
      env: {
        NODE_ENV: 'production',
      },
      // Log settings
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: './logs/bot-out.log',
      error_file: './logs/bot-error.log',
      merge_logs: true,
    },
  ],
};
