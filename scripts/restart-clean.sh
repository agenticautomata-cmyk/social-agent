#!/usr/bin/env bash
# Clean restart — stop, verify termination, start, health-check endpoints.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/benson-runtime-lib.sh"

red() { echo "❌ $*" >&2; }
green() { echo "✅ $*"; }

MODE="${1:-dev}"
benson_load_env "$ROOT"

echo "=== Clean restart (mode: ${MODE}) ==="

bash "$ROOT/scripts/pre-alpha-stop.sh"

if ! verify_ports_free "$API_PORT" "$DASHBOARD_PORT"; then
  red "Ports :${API_PORT} / :${DASHBOARD_PORT} still in use after stop"
  bash "$ROOT/scripts/runtime-status.sh"
  exit 1
fi
green "All Benson processes terminated; ports free"

if [[ "$MODE" == "prod" ]]; then
  if [[ "${2:-}" == "--build" ]] || [[ "${BENSON_FORCE_DASHBOARD_BUILD:-}" == "1" ]]; then
    bash "$ROOT/scripts/pre-alpha-start-prod.sh" --build
  else
    bash "$ROOT/scripts/pre-alpha-start-prod.sh"
  fi
else
  bash "$ROOT/scripts/pre-alpha-start.sh"
fi

echo
echo "=== Post-restart health ==="
curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null && green "GET /health OK" || { red "GET /health failed"; exit 1; }
curl -sf "http://127.0.0.1:${API_PORT}/api/health" >/dev/null && green "GET /api/health OK" || { red "GET /api/health failed"; exit 1; }
EXPECTED=$(benson_expected_git_commit "$ROOT")
ACTUAL=$(benson_api_identity_commit)
if [[ -n "$EXPECTED" && "$ACTUAL" == "$EXPECTED" ]]; then
  green "API identity OK (${ACTUAL})"
else
  red "API identity mismatch (expected ${EXPECTED}, got ${ACTUAL})"
  exit 1
fi
curl -sf "http://127.0.0.1:${API_PORT}/api/pre-alpha/status" >/dev/null && green "GET /api/pre-alpha/status OK" || { red "pre-alpha status failed"; exit 1; }
curl -sf "http://127.0.0.1:${DASHBOARD_PORT}/" >/dev/null && green "Dashboard home OK" || { red "Dashboard home failed"; exit 1; }
LAYOUT_CHUNK=$(curl -sf "http://127.0.0.1:${DASHBOARD_PORT}/home" | grep -oE 'layout-[a-f0-9]+\.js' | head -1)
if [[ -n "$LAYOUT_CHUNK" ]]; then
  CHUNK_STATUS=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${DASHBOARD_PORT}/_next/static/chunks/app/${LAYOUT_CHUNK}")
  if [[ "$CHUNK_STATUS" == "200" ]]; then
    green "Dashboard client bundle OK (${LAYOUT_CHUNK})"
  else
    red "Dashboard client bundle failed (${LAYOUT_CHUNK} → HTTP ${CHUNK_STATUS})"
    exit 1
  fi
else
  red "Could not find layout chunk in dashboard HTML"
  exit 1
fi

echo
bash "$ROOT/scripts/runtime-status.sh"
