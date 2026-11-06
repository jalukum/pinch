#!/usr/bin/env bash
# TEMPORARY: keep the test server alive (restarts it if it crashes). Not part of the shipped app.
cd "$(dirname "$0")/.."
while true; do
  PORT=4173 ALLOWED_ORIGINS="${ALLOWED_ORIGINS}" node server/dev-server.mjs >> /tmp/pinch-server.log 2>&1
  echo "$(date) server exited ($?), restarting" >> /tmp/pinch-server.log
  sleep 1
done
