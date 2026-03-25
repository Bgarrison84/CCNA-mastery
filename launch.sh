#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CCNA Mastery — one-click launcher (Linux / macOS)
#
# Usage:
#   ./launch.sh          (port 8080, default browser)
#   ./launch.sh 3000     (custom port)
#
# First run: installs the PWA via your browser's "Add to Home Screen" or
# the install icon in the address bar.  After that you can skip this script
# entirely and just click the installed app icon.
# ─────────────────────────────────────────────────────────────────────────────

PORT="${1:-8080}"
URL="http://localhost:${PORT}"

# ── Move to the directory this script lives in ───────────────────────────────
cd "$(dirname "$0")" || exit 1

# ── Kill any existing server already on the chosen port ──────────────────────
if command -v lsof &>/dev/null; then
  OLD_PID=$(lsof -ti tcp:"${PORT}" 2>/dev/null)
  [ -n "$OLD_PID" ] && kill "$OLD_PID" 2>/dev/null && sleep 0.3
fi

# ── Start the static file server in the background ───────────────────────────
if command -v python3 &>/dev/null; then
  python3 -m http.server "${PORT}" --bind 127.0.0.1 &>/dev/null &
  SERVER_PID=$!
elif command -v python &>/dev/null; then
  python -m SimpleHTTPServer "${PORT}" &>/dev/null &
  SERVER_PID=$!
elif command -v npx &>/dev/null; then
  npx --yes serve -l "${PORT}" -s . &>/dev/null &
  SERVER_PID=$!
else
  echo "ERROR: python3, python, or npx (Node.js) is required to run the local server."
  echo "Install Python 3: https://www.python.org/downloads/"
  exit 1
fi

# ── Wait until the server is ready (up to 5 seconds) ─────────────────────────
for i in $(seq 1 10); do
  sleep 0.5
  curl -sf "${URL}" &>/dev/null && break
done

# ── Open the browser ─────────────────────────────────────────────────────────
if [[ "$OSTYPE" == "darwin"* ]]; then
  open "${URL}"
elif command -v xdg-open &>/dev/null; then
  xdg-open "${URL}"
elif command -v wslview &>/dev/null; then
  wslview "${URL}"             # WSL
elif command -v explorer.exe &>/dev/null; then
  explorer.exe "${URL}"        # WSL fallback
else
  echo "Server running at ${URL} — open this URL in your browser."
fi

echo ""
echo "  CCNA Mastery running at ${URL}"
echo "  Press Ctrl+C to stop the server."
echo ""
echo "  TIP: Install the PWA from your browser's address bar to skip"
echo "       this script on future launches."
echo ""

# ── Keep script alive; kill server on Ctrl+C ─────────────────────────────────
trap "kill ${SERVER_PID} 2>/dev/null; exit 0" INT TERM
wait "${SERVER_PID}"
