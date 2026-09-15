#!/bin/sh
# ES modules need http://, not file:// — this is the whole build step.
cd "$(dirname "$0")" || exit 1
PORT="${1:-8123}"
echo "Aylmer Madness -> http://localhost:$PORT"
# open(1) is macOS, start is Windows, xdg-open is the rest. Any of them missing
# is fine: the URL is printed above either way.
( sleep 1
  for o in open xdg-open start; do
    command -v "$o" >/dev/null 2>&1 && "$o" "http://localhost:$PORT" 2>/dev/null && break
  done ) &
exec python3 -m http.server "$PORT"
