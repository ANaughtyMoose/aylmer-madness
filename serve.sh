#!/bin/sh
# ES modules need http://, not file:// — this is the whole build step.
cd "$(dirname "$0")" || exit 1
PORT="${1:-8123}"
echo "Aylmer Madness -> http://localhost:$PORT"
( sleep 1; open "http://localhost:$PORT" 2>/dev/null ) &
exec python3 -m http.server "$PORT"
