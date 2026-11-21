#!/usr/bin/env bash
# E2E 用的本地服务：干净库 + standalone 产物 + 关掉外网抓取
#
# 由 playwright.config.ts 的 webServer 调用，不要手工跑。
# 手工调试时可以：bash scripts/e2e-server.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -f .next/standalone/server.js ]; then
  echo "缺少 .next/standalone/server.js，先跑 npm run build" >&2
  exit 1
fi

export DATABASE_PATH=/tmp/nav-e2e.db
export ICON_DIR=/tmp/nav-e2e-icons
export PORT=3200
export HOSTNAME=127.0.0.1
export PUBLIC_BASE_URL=http://127.0.0.1:3200

# 固定密钥：测试要可重复，不能每次随机（否则跨用例的 cookie 全失效）
export AUTH_SECRET="e2e-only-secret-please-do-not-use-in-production-32+"
export NODE_ENV=production

# 关键：E2E 一律不联网。否则用例会随目标站点抽风、DNS 抖动随机失败，
# 而且 CI 上跑测试时不该去请求别人的服务器。
export METADATA_DISABLED=1
# 链接检测定时器会打全部书签，测试里必须关掉
export LINK_CHECK_ENABLED=0

# standalone 不自带 public / .next/static
rm -rf .next/standalone/public .next/standalone/.next/static
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/
if [ -d public ]; then cp -r public .next/standalone/; fi

# 每次从空库开始，用例之间不互相污染
rm -f "$DATABASE_PATH" "$DATABASE_PATH-wal" "$DATABASE_PATH-shm"
rm -rf "$ICON_DIR"
node scripts/migrate.mjs
npx tsx scripts/e2e-seed.mts

exec node .next/standalone/server.js
