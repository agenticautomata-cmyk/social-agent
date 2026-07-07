#!/usr/bin/env bash
# Benson runtime status — memory, CPU, ports, orphans, duplicate watcher warnings.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/benson-runtime-lib.sh"

benson_load_env "$ROOT"

echo "=== Benson runtime status ==="
echo "Time: $(date -Iseconds)"
echo

echo "=== Memory ==="
free -h | grep -E '^Mem:|^Swap:'
echo

echo "=== Top 10 memory consumers ==="
ps aux --sort=-%mem | awk 'NR==1 || NR<=11 {printf "%-8s %5s %5s %7s MB  ", $1, $3, $4, int($6/1024); for(i=11;i<=NF;i++) printf "%s ", $i; print ""}'
echo

echo "=== Top 10 CPU consumers ==="
ps aux --sort=-%cpu | awk 'NR==1 || NR<=11 {printf "%-8s %5s %5s %7s MB  ", $1, $3, $4, int($6/1024); for(i=11;i<=NF;i++) printf "%s ", $i; print ""}'
echo

echo "=== Listening ports (Benson) ==="
ss -ltnp 2>/dev/null | grep -E ":${API_PORT} |:${DASHBOARD_PORT} " || echo "(none on :${API_PORT} / :${DASHBOARD_PORT})"
echo

echo "=== Benson process counts ==="
echo "tsx watch:        $(benson_pattern_count 'social-agent.*watch src/server.ts')"
echo "next dev:         $(benson_pattern_count 'social-agent.*next dev')"
echo "next start:       $(benson_pattern_count 'social-agent.*next start')"
echo "next-server:      $(benson_pattern_count 'next-server')"
echo "API listeners:    $(ss -ltnp 2>/dev/null | grep -c ":${API_PORT} " || echo 0)"
echo "Dashboard listeners: $(ss -ltnp 2>/dev/null | grep -c ":${DASHBOARD_PORT} " || echo 0)"
if [[ -f "$ROOT/.logs/pre-alpha/dashboard.mode" ]]; then
  echo "Dashboard mode:   $(cat "$ROOT/.logs/pre-alpha/dashboard.mode")"
else
  echo "Dashboard mode:   unknown (not running or dev)"
fi
echo

echo "=== Duplicate watcher check ==="
if detect_duplicate_watchers; then
  echo "✅ No duplicate watchers"
else
  echo "(see warnings above)"
fi
echo

echo "=== Orphaned Benson dev processes ==="
orphans=$(list_benson_orphan_processes)
if [[ -n "$orphans" ]]; then
  echo "$orphans"
else
  echo "(none)"
fi
