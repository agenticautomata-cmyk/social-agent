#!/usr/bin/env bash
# Benson pre-alpha — verify env, DB, migrations, start API + dashboard, health checks
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PNPM="${PNPM:-npx --yes pnpm@10.30.3}"
LOG_DIR="$ROOT/.logs/pre-alpha"
mkdir -p "$LOG_DIR"

red() { echo "❌ $*" >&2; }
green() { echo "✅ $*"; }
warn() { echo "⚠️  $*"; }

if [[ ! -f .env ]]; then
  red ".env missing — copy from .env.example"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

require_var() {
  if [[ -z "${!1:-}" ]]; then
    red "Missing required env: $1"
    exit 1
  fi
}

require_var DATABASE_URL
require_var ENABLE_OPPORTUNITIES_API
require_var ENABLE_OPPORTUNITIES_UI

if [[ "${OUTREACH_ENABLE_LIVE_SEND:-false}" == "true" || "${OUTREACH_ENABLE_LIVE_SEND:-false}" == "1" ]]; then
  red "OUTREACH_ENABLE_LIVE_SEND must be false for pre-alpha"
  exit 1
fi

if [[ -n "${RESEND_API_KEY:-}" ]]; then
  warn "RESEND_API_KEY is set — ensure live send stays disabled"
fi

green "Env preflight OK"

green "Starting Postgres…"
docker compose up -d postgres

POSTGRES_PORT="${POSTGRES_PORT:-5433}"
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-social_agent}" >/dev/null 2>&1; then
    break
  fi
  if [[ $i -eq 30 ]]; then
    red "Postgres container did not become ready"
    exit 1
  fi
  sleep 1
done

for i in $(seq 1 30); do
  if (echo >/dev/tcp/127.0.0.1/"$POSTGRES_PORT") 2>/dev/null; then
    green "Postgres ready (127.0.0.1:${POSTGRES_PORT})"
    break
  fi
  if [[ $i -eq 30 ]]; then
    red "Postgres not accepting connections on 127.0.0.1:${POSTGRES_PORT}"
    exit 1
  fi
  sleep 1
done

green "Applying Benson migrations (ordered 24 → 32)…"
if ! $PNPM migrate:pre-alpha; then
  red "Migrations failed — fix errors above, then re-run: pnpm migrate:pre-alpha"
  exit 1
fi

API_PORT="${API_PORT:-4000}"
DASH_PORT="${DASHBOARD_PORT:-3000}"

if [[ -f "$LOG_DIR/api.pid" ]] && kill -0 "$(cat "$LOG_DIR/api.pid")" 2>/dev/null; then
  warn "API already running (pid $(cat "$LOG_DIR/api.pid"))"
else
  green "Starting API on :$API_PORT…"
  $PNPM dev:api >"$LOG_DIR/api.log" 2>&1 &
  echo $! >"$LOG_DIR/api.pid"
fi

if [[ -f "$LOG_DIR/dashboard.pid" ]] && kill -0 "$(cat "$LOG_DIR/dashboard.pid")" 2>/dev/null; then
  warn "Dashboard already running (pid $(cat "$LOG_DIR/dashboard.pid"))"
else
  green "Starting dashboard on :$DASH_PORT…"
  $PNPM dev:dashboard >"$LOG_DIR/dashboard.log" 2>&1 &
  echo $! >"$LOG_DIR/dashboard.pid"
fi

wait_http() {
  local url=$1 name=$2
  for i in $(seq 1 60); do
    if curl -sf "$url" >/dev/null 2>&1; then
      green "$name OK ($url)"
      return 0
    fi
    sleep 1
  done
  red "$name failed ($url) — see $LOG_DIR"
  return 1
}

wait_http "http://127.0.0.1:${API_PORT}/health" "API health"
wait_http "http://127.0.0.1:${API_PORT}/api/pre-alpha/status" "Pre-alpha status"
wait_http "http://127.0.0.1:${DASH_PORT}/" "Dashboard home"

green "Pre-alpha stack running"
echo ""
echo "  Dashboard: http://127.0.0.1:${DASH_PORT}/"
echo "  API:       http://127.0.0.1:${API_PORT}/"
echo "  Logs:      $LOG_DIR/"
echo ""
echo "Run: pnpm pre-alpha:smoke"
