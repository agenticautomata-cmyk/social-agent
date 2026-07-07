#!/usr/bin/env bash
# Health watchdog — restart any dead Benson components (crash recovery without reboot).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/benson-runtime-lib.sh"

benson_load_env "$ROOT"
LOG_DIR="$(benson_log_dir "$ROOT")"
mkdir -p "$LOG_DIR"
WATCH_LOG="$LOG_DIR/watchdog.log"

{
  echo "=== watchdog $(date -Is) ==="

  if benson_stack_healthy; then
    echo "healthy"
    exit 0
  fi

  echo "unhealthy — attempting recovery"
  api_ok=false
  dash_ok=false
  workers_ok=false
  benson_api_health_ok && api_ok=true
  benson_dashboard_health_ok && dash_ok=true
  benson_workers_running && workers_ok=true
  echo "  api=$api_ok dashboard=$dash_ok workers=$workers_ok"

  if ! benson_boot_prod "$ROOT" false; then
    echo "recovery failed"
    exit 1
  fi

  echo "recovery OK"
} >>"$WATCH_LOG" 2>&1
