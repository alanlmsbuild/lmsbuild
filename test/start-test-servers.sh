#!/bin/bash
# Starts the test servers: the API on 3002 and the website on 5199. Never
# 3001 or 5173 (the dev servers). Logs go to ~/.cache/rarebit-test/.
# Extra settings for the API can be passed in front, e.g.
#   DB_POOL=off DB_TIMING_LOG=all test/start-test-servers.sh
set -e
cd "$(dirname "$0")/.."
LOGS=~/.cache/rarebit-test
mkdir -p $LOGS
(PORT=3002 nohup node server/index.js > $LOGS/api.log 2>&1 &)
(nohup npx vite --config test/browser/vite.test.config.mjs > $LOGS/website.log 2>&1 &)
timeout 60 bash -c 'until curl -s localhost:3002/api/me >/dev/null && curl -s localhost:5199 >/dev/null; do sleep 0.5; done'
echo "Test API on 3002 and website on 5199 are up (logs in $LOGS)."
