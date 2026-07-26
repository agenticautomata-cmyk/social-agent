#!/usr/bin/env bash
# Restart only the Benson API process (port 4000) — leaves dashboard + workers running.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/benson-runtime-lib.sh"

benson_load_env "$ROOT"

echo "Restarting API on :${API_PORT}…"

bash "$ROOT/scripts/write-build-identity.sh" "restart-api"

if benson_api_should_skip_start "$ROOT"; then
  echo "✅ API already running current build ($(benson_api_identity_commit)) on :${API_PORT}"
  exit 0
fi

if port_in_use "$API_PORT"; then
  benson_assert_port_owned_by_benson "$API_PORT" || exit 1
fi

benson_stop_api_processes "$ROOT"
sleep 1

if port_in_use "$API_PORT"; then
  echo "ERROR: Port :${API_PORT} still in use after stop" >&2
  ss -ltnp 2>/dev/null | grep ":${API_PORT} " || true
  exit 1
fi

benson_start_api "$ROOT"
benson_wait_http "http://127.0.0.1:${API_PORT}/health" 60

expected=$(benson_expected_git_commit "$ROOT")
actual=$(benson_api_identity_commit)
if [[ -n "$expected" && "$actual" != "$expected" ]]; then
  echo "ERROR: API identity mismatch after restart (expected ${expected}, got ${actual})" >&2
  exit 1
fi

echo "✅ API healthy on :${API_PORT} (commit ${actual})"
