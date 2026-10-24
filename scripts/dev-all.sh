#!/usr/bin/env bash
# Start the Convex backend and the web app together for local testing.
#
# Both run in this script's process group so a single Ctrl-C stops both — the
# usual failure mode with backgrounded dev servers is a stranded Convex watcher
# holding the deployment after the frontend is gone.
set -euo pipefail

cd "$(dirname "$0")/.."

cleanup() {
  trap - EXIT INT TERM
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "starting convex backend + web (Ctrl-C stops both)"

pnpm --filter stride-backend convex &
pnpm --filter @stride/web dev &

wait
