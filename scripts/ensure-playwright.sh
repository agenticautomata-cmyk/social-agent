#!/usr/bin/env bash
# Install Playwright Chromium into Benson's durable browsers directory when missing.
# Safe to re-run: does nothing if the executable already exists.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export BENSON_REPO_ROOT="$ROOT"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$ROOT/.benson/playwright}"
mkdir -p "$PLAYWRIGHT_BROWSERS_PATH"

cd "$ROOT"
STATUS="$(cd "$ROOT/services/core" && PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_PATH" BENSON_REPO_ROOT="$ROOT" pnpm exec tsx src/playwright-runtime/cli-precheck.ts --json || true)"
if echo "$STATUS" | grep -q '"ok": true'; then
  echo "$STATUS"
  exit 0
fi

echo "Playwright Chromium missing — installing once into $PLAYWRIGHT_BROWSERS_PATH"
pnpm exec playwright install chromium
cd "$ROOT/services/core"
PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_PATH" BENSON_REPO_ROOT="$ROOT" pnpm exec tsx src/playwright-runtime/cli-precheck.ts
