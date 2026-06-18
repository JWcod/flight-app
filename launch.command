#!/bin/bash
# 雙擊這個檔案即可啟動 My Flight Log。
# macOS 會在 Terminal 中執行，按 Ctrl+C 可停止伺服器。

cd "$(dirname "$0")"

# 若舊的伺服器還在跑，先關掉
lsof -ti:8765 | xargs kill -9 2>/dev/null
sleep 0.3

node server.js
