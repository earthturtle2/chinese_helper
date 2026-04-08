module.exports = {
  apps: [{
    name: 'chinese-helper',
    script: 'server/index.js',
    instances: 2,
    exec_mode: 'cluster',
    node_args: '--max-old-space-size=300',
    max_memory_restart: '350M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
