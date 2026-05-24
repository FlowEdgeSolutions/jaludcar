module.exports = {
  apps: [
    {
      name: 'jalud-api',
      cwd: '/var/www/jalud/current/backend',
      script: 'server.js',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        UPLOADS_DIR: '/var/www/jalud/shared/uploads',
      },
    },
    {
      name: 'jalud-web',
      cwd: '/var/www/jalud/current/frontend',
      script: 'dist/flowedge-app/server/server.mjs',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: '4000',
      },
    },
  ],
};
