#!/usr/bin/env bash
# Stop Benson pre-alpha — kill port listeners, orphans, verify ports are free.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT/.logs/pre-alpha"
# shellcheck disable=SC1091
source "$ROOT/scripts/benson-runtime-lib.sh"

red() { echo "❌ $*" >&2; }
green() { echo "✅ $*"; }
warn() { echo "⚠️  $*"; }

benson_load_env "$ROOT"

stop_pid_file() {
  local file=$1 name=$2
  if [[ -f "$file" ]]; then
    local pid
    pid=$(cat "$file")
    if kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null || true
      sleep 1
      kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
      echo "Stopped $name wrapper (pid $pid)"
    fi
    rm -f "$file"
  fi
}

echo "Stopping Benson pre-alpha…"

stop_pid_file "$LOG_DIR/api.pid" "API"
stop_pid_file "$LOG_DIR/dashboard.pid" "dashboard"
stop_pid_file "$LOG_DIR/benson-workers.pid" "Benson workers"
# Kill the whole worker tree — the pid file only tracks the pnpm wrapper.
pkill -f "src/benson.ts" 2>/dev/null || true
pkill -f "@social-agent/workers benson" 2>/dev/null || true
rm -f "$LOG_DIR/dashboard.mode"

kill_port "$API_PORT"
kill_port "$DASHBOARD_PORT"
kill_benson_orphans
sleep 1

if wait_ports_free 15 "$API_PORT" "$DASHBOARD_PORT"; then
  green "Ports :${API_PORT} and :${DASHBOARD_PORT} are free"
else
  red "Ports still in use after stop:"
  ss -ltnp 2>/dev/null | grep -E ":${API_PORT} |:${DASHBOARD_PORT} " || true
  exit 1
fi

if detect_duplicate_watchers; then
  green "No duplicate Benson watchers detected"
else
  warn "Duplicate watcher processes may remain — run: bash scripts/runtime-status.sh"
fi

echo "Done. Postgres left running — use: docker compose stop postgres"
