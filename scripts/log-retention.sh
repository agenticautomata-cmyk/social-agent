#!/usr/bin/env bash
# Rotate Benson pre-alpha logs — retain at least 14 days, compress older files.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/benson-runtime-lib.sh"

LOG_DIR="$(benson_log_dir "$ROOT")"
CONF="${HOME}/.config/logrotate.d/benson-pre-alpha.conf"
if [[ ! -f "$CONF" ]]; then
  CONF="$ROOT/deploy/logrotate/benson-pre-alpha.conf.in"
fi
mkdir -p "$LOG_DIR"

if command -v logrotate >/dev/null 2>&1; then
  if [[ -f "${HOME}/.config/logrotate.d/benson-pre-alpha.conf" ]]; then
    logrotate -s "$LOG_DIR/logrotate.state" "${HOME}/.config/logrotate.d/benson-pre-alpha.conf"
  else
    tmp=$(mktemp)
    sed "s|@BENSON_ROOT@|$ROOT|g" "$ROOT/deploy/logrotate/benson-pre-alpha.conf.in" >"$tmp"
    logrotate -s "$LOG_DIR/logrotate.state" "$tmp"
    rm -f "$tmp"
  fi
  echo "logrotate applied (14-day retention policy)"
else
  echo "logrotate unavailable — applying manual age/size cleanup"
  find "$LOG_DIR" -maxdepth 1 -name '*.log.*' -mtime +14 -delete 2>/dev/null || true
  find "$LOG_DIR" -maxdepth 1 -name '*.gz' -mtime +14 -delete 2>/dev/null || true
  for log in "$LOG_DIR"/*.log; do
    [[ -f "$log" ]] || continue
    size=$(stat -c %s "$log" 2>/dev/null || echo 0)
    if [[ "$size" -gt 104857600 ]]; then
      ts=$(date +%Y%m%d-%H%M%S)
      cp "$log" "${log}.${ts}"
      : >"$log"
      gzip -f "${log}.${ts}" 2>/dev/null || true
    fi
  done
fi

echo "Log retention complete — $LOG_DIR"
