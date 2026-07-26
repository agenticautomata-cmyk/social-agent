#!/usr/bin/env bash
# Write build identity metadata consumed by /api/health and runtime checks.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/benson-runtime-lib.sh"

SUPERVISOR="${1:-benson-boot-prod}"
LOG_DIR="$(benson_log_dir "$ROOT")"
mkdir -p "$LOG_DIR"

GIT_COMMIT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || true)"
GIT_FULL="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || true)"
RELEASE_TAG="$(git -C "$ROOT" describe --tags --exact-match 2>/dev/null || git -C "$ROOT" describe --tags --always 2>/dev/null || true)"
BUILD_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

cat >"$LOG_DIR/build-identity.env" <<EOF
BENSON_GIT_COMMIT=${GIT_COMMIT}
BENSON_GIT_COMMIT_FULL=${GIT_FULL}
BENSON_RELEASE_TAG=${RELEASE_TAG}
BENSON_BUILD_TIME=${BUILD_TIME}
BENSON_SUPERVISOR=${SUPERVISOR}
BENSON_REPO_ROOT=${ROOT}
EOF

echo "Build identity: commit=${GIT_COMMIT} tag=${RELEASE_TAG} supervisor=${SUPERVISOR}"
