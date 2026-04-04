module.exports = {
  apps: [
    {
      name: "rupyasetu",
      script: "node",
      args: "-r dotenv/config /var/www/rupyasetu/server_dist/index.js",
      cwd: "/var/www/rupyasetu",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: "5000",
      },
    },
  ],
};
