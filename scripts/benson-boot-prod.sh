#!/usr/bin/env bash
# Idempotent production boot — safe after reboot/crash. Skips rebuild if .next exists.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/benson-runtime-lib.sh"

benson_load_env "$ROOT"

FORCE_BUILD=false
if [[ "${1:-}" == "--build" ]] || [[ "${BENSON_FORCE_DASHBOARD_BUILD:-}" == "1" ]]; then
  FORCE_BUILD=true
fi

if benson_boot_prod "$ROOT" "$FORCE_BUILD"; then
  echo "✅ Benson production stack running"
  echo "   Dashboard: http://127.0.0.1:${DASHBOARD_PORT}/"
  echo "   API:       http://127.0.0.1:${API_PORT}/"
  echo "   Boot log:  $(benson_log_dir "$ROOT")/boot.log"
  exit 0
fi

echo "❌ Benson boot failed — see $(benson_log_dir "$ROOT")/boot.log" >&2
tail -20 "$(benson_log_dir "$ROOT")/boot.log" >&2 || true
exit 1
