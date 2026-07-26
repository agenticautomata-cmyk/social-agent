#!/usr/bin/env bash
# Search Benson pre-alpha logs for incident IDs, OpenAI req_* IDs, or worker errors.
# Usage:
#   bash scripts/benson-log-search.sh req_abc123
#   bash scripts/benson-log-search.sh --worker benson-pulse --since 24h
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/benson-runtime-lib.sh"

LOG_DIR="$(benson_log_dir "$ROOT")"
PATTERN=""
WORKER=""
SINCE_HOURS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --worker)
      WORKER="$2"
      shift 2
      ;;
    --since)
      SINCE="${2:-24h}"
      if [[ "$SINCE" =~ ^([0-9]+)h$ ]]; then
        SINCE_HOURS="${BASH_REMATCH[1]}"
      fi
      shift 2
      ;;
    --help|-h)
      echo "Usage: benson-log-search.sh <pattern> [--worker id] [--since 24h]"
      echo "Logs: $LOG_DIR"
      exit 0
      ;;
    *)
      PATTERN="$1"
      shift
      ;;
  esac
done

if [[ -z "$PATTERN" && -z "$WORKER" ]]; then
  echo "Provide a search pattern (request ID, error text, workerId)." >&2
  exit 1
fi

mapfile -t FILES < <(find "$LOG_DIR" -maxdepth 1 \( -name '*.log' -o -name '*.log.*' -o -name '*.gz' \) -type f 2>/dev/null | sort)
if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "No log files in $LOG_DIR" >&2
  exit 1
fi

search_file() {
  local file=$1
  if [[ "$file" == *.gz ]]; then
    if [[ -n "$PATTERN" && -n "$WORKER" ]]; then
      zgrep -E -- "$PATTERN|$WORKER" "$file" 2>/dev/null || true
    elif [[ -n "$PATTERN" ]]; then
      zgrep -E -- "$PATTERN" "$file" 2>/dev/null || true
    else
      zgrep -E -- "$WORKER" "$file" 2>/dev/null || true
    fi
  else
    if [[ -n "$PATTERN" && -n "$WORKER" ]]; then
      rg -i --no-heading "$PATTERN|$WORKER" "$file" 2>/dev/null || true
    elif [[ -n "$PATTERN" ]]; then
      rg -i --no-heading "$PATTERN" "$file" 2>/dev/null || true
    else
      rg -i --no-heading "$WORKER" "$file" 2>/dev/null || true
    fi
  fi
}

echo "Searching ${#FILES[@]} log files in $LOG_DIR"
for file in "${FILES[@]}"; do
  if [[ "$SINCE_HOURS" -gt 0 ]]; then
    file_mtime=$(stat -c %Y "$file" 2>/dev/null || echo 0)
    cutoff=$(($(date +%s) - SINCE_HOURS * 3600))
    [[ "$file_mtime" -lt "$cutoff" ]] && continue
  fi
  hits=$(search_file "$file" || true)
  if [[ -n "$hits" ]]; then
    echo "--- $file ---"
    printf '%s\n' "$hits" | head -80
  fi
done
