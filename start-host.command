#!/usr/bin/env bash
# Skyfire Squad - LAN host launcher for macOS (double-click in Finder, or run ./start-host.command).
# Rebuilds whenever the sources changed, starts the authoritative game server, opens the host console.
# Extra arguments go to the server, e.g. ./start-host.command --port=7351
set -u
cd "$(dirname "$0")"
pause() { read -r -p "Press Return to close this window..." _ || true; }

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22 LTS is required: https://nodejs.org (or: brew install node@22)"
  pause
  exit 1
fi
node tools/build-stamp.mjs node || {
  echo "This Node.js version is too old. Install Node.js 22 LTS from https://nodejs.org"
  pause
  exit 1
}
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm ci || { pause; exit 1; }
fi
if ! node tools/build-stamp.mjs check; then
  echo "Building the game (first run or after an update)..."
  npm run build || { echo "Build failed - not starting an outdated host."; pause; exit 1; }
  node tools/build-stamp.mjs write
fi
echo
echo " Keep this window open while hosting. Players on the same Wi-Fi scan the QR code below."
echo " If macOS asks whether \"node\" may accept incoming network connections, click Allow."
echo " The Mac stays awake while the host runs (keep it plugged in; closing the lid still sleeps it)."
echo
# caffeinate keeps the display, system and disk awake for as long as the server runs
caffeinate -dims node packages/server/dist/server.mjs --static=packages/client/dist --open "$@"
pause
