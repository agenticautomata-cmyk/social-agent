#!/usr/bin/env bash
# Install user systemd units so Benson auto-starts after reboot and recovers from crashes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_DIR="${HOME}/.config/systemd/user"
DEPLOY="$ROOT/deploy/systemd"

red() { echo "❌ $*" >&2; }
green() { echo "✅ $*"; }
warn() { echo "⚠️  $*"; }

if [[ ! -f "$ROOT/.env" ]]; then
  red ".env missing at $ROOT/.env"
  exit 1
fi

chmod +x "$ROOT/scripts/benson-boot-prod.sh" "$ROOT/scripts/benson-ensure-running.sh"

mkdir -p "$UNIT_DIR"
for unit in benson-pre-alpha.service benson-pre-alpha-health.service benson-pre-alpha-health.timer; do
  sed "s|@BENSON_ROOT@|$ROOT|g" "$DEPLOY/${unit}.in" >"$UNIT_DIR/$unit"
  green "Installed $UNIT_DIR/$unit"
done

systemctl --user daemon-reload
systemctl --user enable benson-pre-alpha.service
systemctl --user enable benson-pre-alpha-health.timer

if loginctl show-user "$USER" 2>/dev/null | grep -q 'Linger=yes'; then
  green "User linger already enabled (boot without login)"
else
  warn "Enabling linger so Benson starts at boot (may prompt for password)…"
  if loginctl enable-linger "$USER" 2>/dev/null; then
    green "Linger enabled for $USER"
  else
    warn "Could not enable linger — run: loginctl enable-linger $USER"
    warn "Without linger, Benson only auto-starts after you log in."
  fi
fi

systemctl --user start benson-pre-alpha.service || {
  red "Boot service failed — check: journalctl --user -u benson-pre-alpha -n 40"
  exit 1
}
systemctl --user start benson-pre-alpha-health.timer

green "Benson autostart installed"
echo ""
echo "  Boot on login/reboot:  systemctl --user status benson-pre-alpha"
echo "  Crash watchdog (3m):   systemctl --user status benson-pre-alpha-health.timer"
echo "  Manual boot:           pnpm boot:prod"
echo "  Uninstall:             pnpm uninstall:autostart"
echo ""
systemctl --user status benson-pre-alpha.service --no-pager -l | head -12 || true
