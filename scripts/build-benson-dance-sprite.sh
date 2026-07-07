#!/usr/bin/env bash
# Regenerate Benson dance sprite from logo.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec python3 "$ROOT/scripts/generate-benson-dance-sprite.py"
