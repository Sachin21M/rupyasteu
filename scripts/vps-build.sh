#!/bin/bash
# VPS Build Script for RupyaSetu
# Run this on the VPS after git pull to rebuild the server
# Usage: bash scripts/vps-build.sh

set -e

echo "Building server (CJS format for VPS compatibility)..."
npx esbuild server/index.ts \
  --platform=node \
  --packages=external \
  --bundle \
  --format=cjs \
  --outdir=server_dist

echo "Build complete: server_dist/index.js"
echo ""
echo "Restarting PM2..."
pm2 delete rupyasetu 2>/dev/null || true
pm2 start node --name rupyasetu -- -r dotenv/config /var/www/rupyasetu/server_dist/index.js
pm2 save

echo ""
echo "Done! Check status with: pm2 status"
