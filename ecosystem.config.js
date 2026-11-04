module.exports = {
  apps: [
    {
      name: 'remoedph',
      script: 'server/index.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '700M',
      error_file: 'logs/remoedph-error.log',
      out_file: 'logs/remoedph-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
