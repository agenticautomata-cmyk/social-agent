#!/usr/bin/env bash
# Fingerprint-aware local deploy: build dashboard, restart API + workers + dashboard,
# verify health and parity. Does NOT restart Postgres or Voicebox.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/benson-runtime-lib.sh"
benson_load_env "$ROOT"

LOG_DIR="$(benson_log_dir "$ROOT")"
mkdir -p "$LOG_DIR"
LOCK="$LOG_DIR/deploy-local.lock"
STATUS_LOG="$LOG_DIR/deploy-local.log"
PRE_STATE="$LOG_DIR/deploy-local.pre.json"

core_tsx() {
  (cd "$ROOT/services/core" && pnpm exec tsx "$@")
}

# PID-file lock (not flock): flock FDs are inherited by API/worker daemons and
# permanently block subsequent deploys.
if [[ -f "$LOCK" ]]; then
  old_pid=$(tr -d '[:space:]' <"$LOCK" || true)
  if [[ -n "${old_pid:-}" ]] && kill -0 "$old_pid" 2>/dev/null; then
    if tr '\0' ' ' <"/proc/$old_pid/cmdline" 2>/dev/null | grep -q 'benson-deploy-local'; then
      echo "ERROR: Another benson:deploy-local is already running (pid $old_pid, lock: $LOCK)" >&2
      exit 1
    fi
  fi
fi
echo $$ >"$LOCK"
trap 'rm -f "$LOCK"' EXIT

{
  echo "=== benson:deploy-local $(date -Is) ==="

  bash "$ROOT/scripts/benson-deployment-status.sh" >"$PRE_STATE" || true
  echo "Pre-deploy parity recorded → $PRE_STATE"

  FP=$(core_tsx src/deployment-parity/cli-fingerprint.ts "$ROOT")
  echo "Source fingerprint: $FP"

  echo "Ensuring durable Playwright Chromium…"
  bash "$ROOT/scripts/ensure-playwright.sh"
  echo "Playwright browser precheck…"
  (cd "$ROOT/services/core" && pnpm exec tsx src/playwright-runtime/cli-precheck.ts)

  echo "Running targeted stabilization tests…"
  (
    cd "$ROOT/services/core"
    pnpm exec tsx --test \
      src/playwright-runtime/playwright-runtime.test.ts \
      src/curator-watchlist/watchlist-state.test.ts \
      src/curator-watchlist/watchlist-intelligence.test.ts \
      src/curator-watchlist/scheduler.test.ts \
      src/worker-heartbeat/worker-heartbeat.test.ts \
      src/creator-calendar/population/eligibility.test.ts \
      src/creator-calendar/population/sync.test.ts \
      src/creator-calendar/population/calendar-category.test.ts \
      src/creator-calendar/population/projection-freshness.test.ts \
      src/creator-calendar/category-snooze.test.ts \
      src/creator-calendar/weekend-things-to-do.test.ts \
      src/creator-calendar/dismiss.test.ts \
      src/gmail-inbox/discovery-newsletter-route.test.ts \
      src/newsletter-intelligence/date-normalize.test.ts
  )

  echo "Restarting API (force — fingerprint identity, not git commit)…"
  benson_stop_api_processes "$ROOT"
  sleep 1
  benson_start_api "$ROOT"
  benson_wait_http "http://127.0.0.1:${API_PORT:-4000}/health" 60
  core_tsx src/deployment-parity/cli-write-fingerprint.ts api "$FP" "$ROOT"

  echo "Restarting workers…"
  benson_stop_workers_processes "$ROOT"
  sleep 1
  benson_start_workers "$ROOT"
  sleep 3
  core_tsx src/deployment-parity/cli-write-fingerprint.ts workers "$FP" "$ROOT"

  echo "Building + restarting dashboard…"
  BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  benson_start_dashboard "$ROOT" true
  benson_wait_http "http://127.0.0.1:${DASHBOARD_PORT:-3000}/" 120
  core_tsx src/deployment-parity/cli-write-fingerprint.ts dashboard "$FP" "$ROOT" "$BUILT_AT"

  core_tsx src/deployment-parity/cli-write-fingerprint.ts deployed "$FP" "$ROOT"

  curl -sf "http://127.0.0.1:${API_PORT:-4000}/health" >/dev/null
  curl -sf -o /dev/null "http://127.0.0.1:${DASHBOARD_PORT:-3000}/"
  echo "Local health OK"

  # Public endpoints when configured (best-effort)
  if [[ -n "${PUBLIC_DASHBOARD_URL:-}" ]]; then
    curl -sf -o /dev/null "${PUBLIC_DASHBOARD_URL}" && echo "Public dashboard OK" || echo "WARN: public dashboard check failed"
  fi
  if [[ -n "${PUBLIC_API_HEALTH_URL:-}" ]]; then
    curl -sf "${PUBLIC_API_HEALTH_URL}" >/dev/null && echo "Public API OK" || echo "WARN: public API check failed"
  fi

  if bash "$ROOT/scripts/benson-deployment-status.sh"; then
    echo "✅ Deploy complete — fingerprints MATCH ($FP)"
  else
    echo "⚠️ Deploy finished but parity still reports DRIFT."
    echo "Rollback hint: see pre-state at $PRE_STATE; re-run start:prod if needed."
    exit 3
  fi
} 2>&1 | tee -a "$STATUS_LOG"
exit "${PIPESTATUS[0]}"
