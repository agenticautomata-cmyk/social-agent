#!/usr/bin/env bash
# Report source vs runtime deployment parity (fingerprint-based, not git commit).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/benson-runtime-lib.sh"
benson_load_env "$ROOT"

(
  cd "$ROOT/services/core"
  pnpm exec tsx src/deployment-parity/cli-status.ts "$ROOT"
)
