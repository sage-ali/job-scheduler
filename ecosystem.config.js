module.exports = {
  apps: [
    {
      name: 'api',
      script: './dist/main.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env_production: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'worker',
      script: './dist/worker.js',
      // Scale by setting WORKER_INSTANCES env var before running pm2 start.
      // Each instance is an independent process; QUEUE_CONCURRENCY controls
      // how many jobs each process handles simultaneously.
      instances: parseInt(process.env.WORKER_INSTANCES || '1', 10),
      autorestart: true,
      watch: false,
      env_production: {
        NODE_ENV: 'production',
        SERVICE_NAME: 'job-scheduler-worker',
      },
    },
  ],
};
