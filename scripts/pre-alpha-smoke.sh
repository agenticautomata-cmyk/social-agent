#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

API_PORT="${API_PORT:-4000}"
DASH_PORT="${DASHBOARD_PORT:-3000}"
API="http://127.0.0.1:${API_PORT}"
DASH="http://127.0.0.1:${DASH_PORT}"

fail=0
check() {
  local name=$1 url=$2
  if curl -sf "$url" >/dev/null; then
    echo "✅ $name"
  else
    echo "❌ $name ($url)"
    fail=1
  fi
}

check "API health" "$API/health"
check "Pre-alpha status" "$API/api/pre-alpha/status"
check "Pre-alpha home" "$API/api/pre-alpha/home"
check "Editor" "$API/api/editor?limit=1"
check "Action center" "$API/api/action-center"
check "Revenue" "$API/api/revenue"
check "Outreach send-config" "$API/api/outreach/send-config"

MODE=$(curl -sf "$API/api/outreach/send-config" | grep -o '"mode":"[^"]*"' | head -1 || true)
if echo "$MODE" | grep -q simulate; then
  echo "✅ Outreach simulate mode"
else
  echo "❌ Outreach not in simulate mode: $MODE"
  fail=1
fi

check "Dashboard home" "$DASH/"
check "Dashboard editor" "$DASH/editor"
check "Dashboard actions" "$DASH/actions"
check "Dashboard revenue" "$DASH/revenue"

exit $fail
