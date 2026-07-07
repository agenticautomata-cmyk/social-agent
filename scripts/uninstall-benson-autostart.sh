#!/usr/bin/env bash
# Remove Benson user systemd autostart units.
set -euo pipefail

UNIT_DIR="${HOME}/.config/systemd/user"

systemctl --user disable --now benson-pre-alpha-health.timer 2>/dev/null || true
systemctl --user disable --now benson-pre-alpha.service 2>/dev/null || true
rm -f \
  "$UNIT_DIR/benson-pre-alpha.service" \
  "$UNIT_DIR/benson-pre-alpha-health.service" \
  "$UNIT_DIR/benson-pre-alpha-health.timer"
systemctl --user daemon-reload
echo "✅ Benson autostart removed"
