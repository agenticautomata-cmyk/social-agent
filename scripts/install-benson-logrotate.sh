#!/usr/bin/env bash
# Install user-level logrotate config for Benson pre-alpha logs.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${HOME}/.config/logrotate.d/benson-pre-alpha.conf"
mkdir -p "$(dirname "$DEST")"
sed "s|@BENSON_ROOT@|$ROOT|g" "$ROOT/deploy/logrotate/benson-pre-alpha.conf.in" >"$DEST"
echo "Installed $DEST"
echo "Run daily via cron or: bash scripts/log-retention.sh"
