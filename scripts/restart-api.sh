#!/usr/bin/env bash
# Restart only the Benson API process (port 4000) — leaves dashboard + workers running.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/benson-runtime-lib.sh"

benson_load_env "$ROOT"
LOG_DIR="$(benson_log_dir "$ROOT")"

echo "Restarting API on :${API_PORT}…"

if [[ -f "$LOG_DIR/api.pid" ]]; then
  pid=$(cat "$LOG_DIR/api.pid")
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
    sleep 1
    kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$LOG_DIR/api.pid"
fi

kill_port "$API_PORT"
sleep 1

benson_start_api "$ROOT"
benson_wait_http "http://127.0.0.1:${API_PORT}/health" 60
echo "✅ API healthy on :${API_PORT}"
