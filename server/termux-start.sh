#!/data/data/com.termux/files/usr/bin/bash
# Start the SONIQ server inside Termux (phone). Usage: bash termux-start.sh
cd "$(dirname "$0")"
termux-wake-lock 2>/dev/null   # keep running with the screen off
export HOST=127.0.0.1          # only apps on this phone can reach it
export PORT=3000
export YTDLP_JS_RUNTIMES=node  # no deno on Android
export API_KEY="${API_KEY:-$(cat .api-key 2>/dev/null)}"
exec node index.js
