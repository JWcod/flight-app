#!/bin/bash
# Double-click this file to launch Flight Log.
# macOS runs it in Terminal; press Ctrl+C to stop the server.

cd "$(dirname "$0")"

# Kill any server already running on this port
lsof -ti:8765 | xargs kill -9 2>/dev/null
sleep 0.3

node server.js
