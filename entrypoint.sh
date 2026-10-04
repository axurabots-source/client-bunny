#!/bin/sh
# Starts Obscura's CDP server in the background, waits until it accepts
# connections, then hands off to google-maps-scraper in the foreground.
# If obscura dies, this script exits too, so Docker's restart policy
# (restart: unless-stopped) will bring the whole container back up.
set -e

OBSCURA_PORT="${OBSCURA_PORT:-9222}"
OBSCURA_STEALTH="${OBSCURA_STEALTH:-true}"

STEALTH_FLAG=""
if [ "$OBSCURA_STEALTH" = "true" ]; then
  STEALTH_FLAG="--stealth"
fi

echo "[entrypoint] starting obscura serve on 127.0.0.1:${OBSCURA_PORT} ${STEALTH_FLAG}"
obscura serve --host 127.0.0.1 --port "${OBSCURA_PORT}" ${STEALTH_FLAG} &
OBSCURA_PID=$!

# Wait for obscura's CDP port to come up (max ~15s)
i=0
until curl -sf "http://127.0.0.1:${OBSCURA_PORT}/json/version" > /dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "[entrypoint] obscura did not become ready in time" >&2
    exit 1
  fi
  sleep 0.5
done
echo "[entrypoint] obscura is ready"

# If obscura exits unexpectedly, bring the container down with it.
( wait "$OBSCURA_PID"; echo "[entrypoint] obscura exited, stopping container" >&2; kill -TERM $$ ) &

exec google-maps-scraper "$@"
