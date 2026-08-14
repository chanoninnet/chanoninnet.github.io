#!/bin/sh
# ---------------------------------------------------------------------------
#  Start the sales dashboard (macOS / Linux).
#
#  Run ./start-dashboard.sh — it serves this folder on localhost and opens the
#  dashboard. Served that way the page reads the source folder by itself, so
#  the months load with nothing to click, and the browser never has to be
#  asked for folder access.
#
#  Keep this terminal open while using the dashboard; Ctrl-C stops it.
# ---------------------------------------------------------------------------
cd "$(dirname "$0")" || exit 1
PORT=${PORT:-8000}

if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo
  echo "  Python was not found."
  echo "  Install it, or just open index.html and load the Excel files with the button."
  echo
  exit 1
fi

URL="http://localhost:$PORT/index.html"
echo
echo "  Dashboard: $URL"
echo "  Keep this terminal open while you use it. Ctrl-C to stop."
echo

if command -v open >/dev/null 2>&1; then
  open "$URL" >/dev/null 2>&1 &
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
fi

exec "$PY" -m http.server "$PORT"
