#!/bin/bash
set -e

APP_DIR="/data/node-apps/chinese_helper"
cd "$APP_DIR"

echo "=== Pulling latest code ==="
git pull origin main

echo "=== Installing server dependencies ==="
npm install --production

echo "=== Building frontend ==="
cd client
npm install
npm run build
cd ..

echo "=== Restarting PM2 ==="
pm2 restart ecosystem.config.js || pm2 start ecosystem.config.js
pm2 save

echo "=== Deploy complete ==="
