#!/usr/bin/env bash
# 改完 src/ 后运行：bash build.sh → 生成 index.html（双击即可打开）
cd "$(dirname "$0")"
[ -d node_modules/three ] || npm install --no-audit --no-fund
node build.mjs
