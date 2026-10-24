#!/usr/bin/env bash
# Start the Convex backend and the web app together for local testing.
#
# Each server runs in its own process group, so cleanup stops exactly those
# groups and nothing else the caller started. Ctrl-C stops both, and if either
# server exits the other is stopped and its exit status is returned.
set -euo pipefail

cd "$(dirname "$0")/.."

# Job control gives each background job its own process group to kill.
set -m
pids=()

# Stop both server process groups.
cleanup() {
  trap - EXIT INT TERM
  for pid in "${pids[@]}"; do
    kill -- "-$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

echo "starting convex backend + web (Ctrl-C stops both)"

pnpm --filter stride-backend convex &
pids+=($!)
pnpm --filter @stride/web dev &
pids+=($!)

# Bash 3.2 on macOS has no `wait -n`, so poll for the first server to exit.
while :; do
  for pid in "${pids[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      status=0
      wait "$pid" || status=$?
      echo "a dev server exited with status $status; stopping the other" >&2
      exit "$status"
    fi
  done
  sleep 1
done
