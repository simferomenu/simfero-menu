module.exports = {
  apps: [
    {
      name: 'API',
      script: 'dist/main.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      kill_timeout: 5000,
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
