#!/usr/bin/env bash
# Shared Benson runtime helpers — source from stop/status/restart scripts.

benson_root() {
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[1]:-${BASH_SOURCE[0]}}")/.." && pwd)"
  printf '%s' "$here"
}

benson_load_env() {
  local root=${1:-$(benson_root)}
  if [[ -f "$root/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$root/.env"
    set +a
  fi
  API_PORT="${API_PORT:-4000}"
  DASHBOARD_PORT="${DASHBOARD_PORT:-3000}"
}

port_listener_pids() {
  local port=$1
  ss -ltnp 2>/dev/null | grep ":${port} " | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u
}

kill_port() {
  local port=$1
  local pids
  pids=$(port_listener_pids "$port" || true)
  if [[ -n "$pids" ]]; then
    echo "Stopping listeners on :${port} (pids: ${pids//$'\n'/ })"
    while read -r pid; do
      [[ -n "$pid" ]] || continue
      kill -TERM "$pid" 2>/dev/null || true
    done <<< "$pids"
    sleep 1
    pids=$(port_listener_pids "$port" || true)
    if [[ -n "$pids" ]]; then
      while read -r pid; do
        [[ -n "$pid" ]] || continue
        kill -KILL "$pid" 2>/dev/null || true
      done <<< "$pids"
    fi
  fi
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" 2>/dev/null || true
  fi
}

kill_benson_orphans() {
  local patterns=(
    "social-agent.*watch src/server.ts"
    "social-agent/services/api.*tsx"
    "social-agent/dashboard.*next dev"
    "social-agent/dashboard.*next start"
    "social-agent.*dev:api"
    "social-agent.*dev:dashboard"
    "social-agent.*start:prod"
    "social-agent.*pnpm --filter @social-agent/api"
    "social-agent.*pnpm --filter @social-agent/dashboard"
    "social-agent.*npm exec pnpm.*dev:api"
    "social-agent.*npm exec pnpm.*dev:dashboard"
    "social-agent.*pre-alpha-start"
  )
  local pat
  for pat in "${patterns[@]}"; do
    pkill -f "$pat" 2>/dev/null || true
  done
}

port_in_use() {
  local port=$1
  ss -ltn 2>/dev/null | grep -q ":${port} "
}

verify_ports_free() {
  local port
  for port in "$@"; do
    if port_in_use "$port"; then
      return 1
    fi
  done
  return 0
}

wait_ports_free() {
  local max_wait=${1:-30}
  shift
  local ports=("$@")
  local i
  for i in $(seq 1 "$max_wait"); do
    if verify_ports_free "${ports[@]}"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

benson_pattern_count() {
  local pattern=$1
  ps aux 2>/dev/null |
    grep -E "$pattern" |
    grep -v grep |
    grep -v 'bash -O extglob' |
    wc -l |
    tr -d ' '
}

detect_duplicate_watchers() {
  local api_port=${API_PORT:-4000}
  local dash_port=${DASHBOARD_PORT:-3000}
  local tsx_count next_dev_count next_start_count api_listeners dash_listeners
  local warnings=0

  tsx_count=$(benson_pattern_count 'social-agent.*watch src/server.ts')
  next_dev_count=$(benson_pattern_count 'social-agent.*next dev')
  next_start_count=$(benson_pattern_count 'social-agent.*next start')
  api_listeners=$(ss -ltnp 2>/dev/null | grep ":${api_port} " | wc -l | tr -d ' ')
  dash_listeners=$(ss -ltnp 2>/dev/null | grep ":${dash_port} " | wc -l | tr -d ' ')

  if [[ "$tsx_count" -gt 1 ]]; then
    echo "⚠️  WARNING: ${tsx_count} tsx watch processes (expected ≤1)"
    warnings=$((warnings + 1))
  fi
  if [[ "$next_dev_count" -gt 1 ]]; then
    echo "⚠️  WARNING: ${next_dev_count} next dev processes (expected ≤1)"
    warnings=$((warnings + 1))
  fi
  if [[ "$next_dev_count" -ge 1 && "$next_start_count" -ge 1 ]]; then
    echo "⚠️  WARNING: both next dev and next start are running"
    warnings=$((warnings + 1))
  fi
  if [[ "$api_listeners" -gt 1 ]]; then
    echo "⚠️  WARNING: ${api_listeners} listeners on API port :${api_port}"
    warnings=$((warnings + 1))
  fi
  if [[ "$dash_listeners" -gt 1 ]]; then
    echo "⚠️  WARNING: ${dash_listeners} listeners on dashboard port :${dash_port}"
    warnings=$((warnings + 1))
  fi

  [[ "$warnings" -gt 0 ]] && return 1
  return 0
}

list_benson_orphan_processes() {
  ps aux 2>/dev/null | grep -E 'social-agent.*(watch src/server|next dev|dev:api|dev:dashboard|pnpm --filter @social-agent)' | grep -v grep || true
}

benson_log_dir() {
  local root=${1:-$(benson_root)}
  printf '%s/.logs/pre-alpha' "$root"
}

benson_pnpm() {
  printf '%s' "${PNPM:-npx --yes pnpm@10.30.3}"
}

benson_api_health_ok() {
  curl -sf "http://127.0.0.1:${API_PORT:-4000}/health" >/dev/null 2>&1
}

benson_dashboard_health_ok() {
  curl -sf "http://127.0.0.1:${DASHBOARD_PORT:-3000}/" >/dev/null 2>&1
}

benson_dashboard_build_id_path() {
  local root=$1
  echo "$(benson_log_dir "$root")/dashboard.build_id"
}

benson_read_dashboard_build_id() {
  local root=$1
  local build_file="$root/dashboard/.next/BUILD_ID"
  [[ -f "$build_file" ]] || return 1
  cat "$build_file"
}

benson_record_dashboard_build_id() {
  local root=$1
  local build_id
  build_id="$(benson_read_dashboard_build_id "$root")" || return 1
  echo "$build_id" >"$(benson_dashboard_build_id_path "$root")"
}

benson_dashboard_serving_build_id() {
  local root=$1
  local served_file
  served_file="$(benson_dashboard_build_id_path "$root")"
  [[ -f "$served_file" ]] || return 1
  cat "$served_file"
}

benson_dashboard_build_matches() {
  local root=$1
  local current served
  current="$(benson_read_dashboard_build_id "$root")" || return 1
  served="$(benson_dashboard_serving_build_id "$root")" || return 1
  [[ "$current" == "$served" ]]
}

# HTML references app/layout-*.js chunks; a stale next start serves HTML that 400s on those chunks.
benson_dashboard_client_bundle_ok() {
  local page=${1:-/home}
  local html chunk status
  html="$(curl -sf "http://127.0.0.1:${DASHBOARD_PORT:-3000}${page}" 2>/dev/null)" || return 1
  chunk="$(printf '%s' "$html" | grep -oE 'layout-[a-f0-9]+\.js' | head -1)" || return 1
  status="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${DASHBOARD_PORT:-3000}/_next/static/chunks/app/${chunk}" 2>/dev/null)" || return 1
  [[ "$status" == "200" ]]
}

benson_stop_dashboard() {
  local root=$1
  local log_dir
  log_dir="$(benson_log_dir "$root")"
  if [[ -f "$log_dir/dashboard.pid" ]]; then
    local pid
    pid=$(cat "$log_dir/dashboard.pid")
    if kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null || true
      sleep 1
      kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
    fi
    rm -f "$log_dir/dashboard.pid"
  fi
  rm -f "$log_dir/dashboard.mode" "$(benson_dashboard_build_id_path "$root")"
  kill_port "${DASHBOARD_PORT:-3000}"
  sleep 1
}

benson_workers_running() {
  pgrep -f "social-agent.*src/benson.ts" >/dev/null 2>&1
}

benson_stack_healthy() {
  benson_api_health_ok \
    && benson_dashboard_health_ok \
    && benson_dashboard_client_bundle_ok \
    && benson_workers_running
}

benson_wait_postgres() {
  local root=$1
  local max_wait=${2:-60}
  local i
  cd "$root"
  for i in $(seq 1 "$max_wait"); do
    if docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-social_agent}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

benson_wait_http() {
  local url=$1
  local max_wait=${2:-90}
  local i
  for i in $(seq 1 "$max_wait"); do
    if curl -sf "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

benson_clear_stale_listener() {
  local port=$1
  local health_ok_fn=$2
  if port_in_use "$port" && ! "$health_ok_fn"; then
    echo "Clearing stale listener on :${port}"
    kill_port "$port"
    sleep 1
  fi
}

benson_start_api() {
  local root=$1
  local log_dir
  log_dir="$(benson_log_dir "$root")"
  mkdir -p "$log_dir"

  benson_clear_stale_listener "${API_PORT}" benson_api_health_ok
  if benson_api_health_ok; then
    return 0
  fi

  echo "Starting API on :${API_PORT}…"
  cd "$root"
  $(benson_pnpm) --filter @social-agent/api start >>"$log_dir/api.log" 2>&1 &
  echo $! >"$log_dir/api.pid"
}

benson_start_workers() {
  local root=$1
  local log_dir
  log_dir="$(benson_log_dir "$root")"
  mkdir -p "$log_dir"

  if benson_workers_running; then
    return 0
  fi

  echo "Starting Benson brain workers…"
  bash "$root/scripts/ensure-ffmpeg.sh" || echo "⚠️  ffmpeg missing — draft video analysis may fail"
  cd "$root"
  $(benson_pnpm) --filter @social-agent/workers benson >>"$log_dir/benson-workers.log" 2>&1 &
  echo $! >"$log_dir/benson-workers.pid"
}

benson_start_dashboard() {
  local root=$1
  local force_build=${2:-false}
  local log_dir
  log_dir="$(benson_log_dir "$root")"
  mkdir -p "$log_dir"

  if [[ "$force_build" != true ]] \
    && benson_dashboard_health_ok \
    && benson_dashboard_build_matches "$root" \
    && benson_dashboard_client_bundle_ok; then
    return 0
  fi

  if [[ "$force_build" == true ]] && benson_dashboard_health_ok; then
    echo "Force rebuild requested — stopping dashboard…"
    benson_stop_dashboard "$root"
  elif benson_dashboard_health_ok; then
    echo "Restarting dashboard — build or client bundle is stale…"
    benson_stop_dashboard "$root"
  else
    benson_clear_stale_listener "${DASHBOARD_PORT}" benson_dashboard_health_ok
  fi

  cd "$root"
  if [[ "$force_build" == true ]] || [[ ! -f "$root/dashboard/.next/BUILD_ID" ]]; then
    echo "Building dashboard (production)…"
    $(benson_pnpm) --filter @social-agent/dashboard build
  else
    echo "Using existing dashboard build ($(cat "$root/dashboard/.next/BUILD_ID"))"
  fi

  echo "Starting dashboard on :${DASHBOARD_PORT} (next start)…"
  $(benson_pnpm) --filter @social-agent/dashboard exec next start -p "$DASHBOARD_PORT" >>"$log_dir/dashboard.log" 2>&1 &
  echo $! >"$log_dir/dashboard.pid"
  echo "production" >"$log_dir/dashboard.mode"
  benson_record_dashboard_build_id "$root" || true
}

benson_boot_prod() {
  local root=$1
  local force_build=${2:-false}
  local log_dir
  log_dir="$(benson_log_dir "$root")"
  mkdir -p "$log_dir"
  local boot_log="$log_dir/boot.log"

  {
    echo "=== benson boot $(date -Is) ==="
    cd "$root"

    if [[ ! -f "$root/.env" ]]; then
      echo "ERROR: .env missing"
      return 1
    fi

    export BENSON_API_MODE=production
    export BENSON_DASHBOARD_MODE=production
    export NODE_ENV=production

    if benson_stack_healthy; then
      if [[ "$force_build" == true ]]; then
        echo "Stack healthy but force rebuild requested — rebuilding dashboard…"
        benson_start_dashboard "$root" true
        benson_wait_http "http://127.0.0.1:${DASHBOARD_PORT}/" 90 || {
          echo "ERROR: dashboard health timeout after force rebuild"
          return 1
        }
        benson_dashboard_client_bundle_ok || {
          echo "ERROR: dashboard client bundle check failed after force rebuild"
          return 1
        }
        echo "Benson stack healthy (dashboard force-rebuilt)"
        return 0
      fi
      echo "Stack already healthy — nothing to do"
      return 0
    fi

    if benson_api_health_ok && benson_workers_running; then
      echo "API and workers healthy — refreshing dashboard if needed…"
      benson_start_dashboard "$root" "$force_build"
      benson_wait_http "http://127.0.0.1:${DASHBOARD_PORT}/" 90 || {
        echo "ERROR: dashboard health timeout"
        return 1
      }
      benson_dashboard_client_bundle_ok || {
        echo "ERROR: dashboard client bundle check failed after restart"
        return 1
      }
      echo "Benson stack healthy (dashboard refreshed)"
      return 0
    fi

    echo "Starting Postgres…"
    docker compose up -d postgres voicebox
    if ! benson_wait_postgres "$root"; then
      echo "ERROR: Postgres not ready"
      return 1
    fi

    echo "Applying migrations…"
    if ! $(benson_pnpm) migrate:pre-alpha; then
      echo "ERROR: migrations failed"
      return 1
    fi

    benson_start_api "$root"
    benson_start_workers "$root"
    benson_start_dashboard "$root" "$force_build"

    benson_wait_http "http://127.0.0.1:${API_PORT}/health" 90 || {
      echo "ERROR: API health timeout"
      return 1
    }
    benson_wait_http "http://127.0.0.1:${DASHBOARD_PORT}/" 90 || {
      echo "ERROR: dashboard health timeout"
      return 1
    }
    benson_dashboard_client_bundle_ok || {
      echo "ERROR: dashboard client bundle check failed"
      return 1
    }

    echo "Benson stack healthy"
  } >>"$boot_log" 2>&1
}
