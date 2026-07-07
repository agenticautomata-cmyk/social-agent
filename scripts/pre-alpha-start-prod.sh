#!/usr/bin/env bash
# Benson pre-alpha — production dashboard (next build + next start), API without tsx watch.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/benson-runtime-lib.sh"

red() { echo "❌ $*" >&2; }
green() { echo "✅ $*"; }

if [[ ! -f .env ]]; then
  red ".env missing — copy from .env.example"
  exit 1
fi

benson_load_env "$ROOT"

FORCE_BUILD=false
if [[ "${1:-}" == "--build" ]] || [[ "${BENSON_FORCE_DASHBOARD_BUILD:-}" == "1" ]]; then
  FORCE_BUILD=true
fi

if benson_boot_prod "$ROOT" "$FORCE_BUILD"; then
  green "Pre-alpha stack running (production dashboard)"
  echo ""
  echo "  Dashboard: http://127.0.0.1:${DASHBOARD_PORT}/  (next start)"
  echo "  API:       http://127.0.0.1:${API_PORT}/"
  echo "  Logs:      $(benson_log_dir "$ROOT")/"
  exit 0
fi

red "Start failed — see $(benson_log_dir "$ROOT")/boot.log"
tail -20 "$(benson_log_dir "$ROOT")/boot.log" >&2 || true
exit 1
