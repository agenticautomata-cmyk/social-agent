#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT/.logs/pre-alpha"

stop_pid() {
  local file=$1 name=$2
  if [[ -f "$file" ]]; then
    local pid
    pid=$(cat "$file")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      echo "Stopped $name (pid $pid)"
    fi
    rm -f "$file"
  fi
}

stop_pid "$LOG_DIR/api.pid" "API"
stop_pid "$LOG_DIR/dashboard.pid" "dashboard"

echo "Done. Postgres left running — use: docker compose stop postgres"
