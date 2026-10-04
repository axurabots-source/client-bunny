#!/bin/sh
# Docker-free startup script. Runs on Render's Native Environment (or any
# plain Linux server/VPS) with no container involved. Starts Obscura's CDP
# server in the background, waits until it's ready, then runs the scraper
# in the foreground as the main process.
set -e

OBSCURA_PORT="${OBSCURA_PORT:-9222}"
OBSCURA_STEALTH="${OBSCURA_STEALTH:-true}"
PORT="${PORT:-8080}"   # Render injects PORT; the scraper's -web mode must bind to it

export OBSCURA_NAV_TIMEOUT_MS="${OBSCURA_NAV_TIMEOUT_MS:-180000}"
export OBSCURA_SCRIPT_DEADLINE_MS="${OBSCURA_SCRIPT_DEADLINE_MS:-180000}"
export OBSCURA_MODULE_BUDGET_MS="${OBSCURA_MODULE_BUDGET_MS:-180000}"

STEALTH_FLAG=""
if [ "$OBSCURA_STEALTH" = "true" ]; then
  STEALTH_FLAG="--stealth"
fi

echo "[start] launching obscura serve on 127.0.0.1:${OBSCURA_PORT} ${STEALTH_FLAG}"
./obscura serve --host 127.0.0.1 --port "${OBSCURA_PORT}" ${STEALTH_FLAG} &
OBSCURA_PID=$!

i=0
until curl -sf "http://127.0.0.1:${OBSCURA_PORT}/json/version" > /dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "[start] obscura did not become ready in time" >&2
    exit 1
  fi
  sleep 0.5
done
echo "[start] obscura is ready"

# If obscura dies, bring the whole process down so Render restarts it.
( wait "$OBSCURA_PID"; echo "[start] obscura exited, stopping" >&2; kill -TERM $$ ) &

export OBSCURA_CDP_URL="http://127.0.0.1:${OBSCURA_PORT}"
exec ./google-maps-scraper -web -data-folder ./gmapsdata -addr ":${PORT}"
