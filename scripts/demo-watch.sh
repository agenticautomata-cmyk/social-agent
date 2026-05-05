#!/usr/bin/env bash
# Pretty terminal renderer of the live pipeline state. Used by docs/demo.tape.

set -euo pipefail

API="${API:-http://localhost:4000}"
COLUMNS_TO_SHOW=("planned" "script_drafted" "script_approved" "video_generating" "video_ready" "ready_to_publish" "scheduled" "published")

C_RESET="\033[0m"
C_DIM="\033[2m"
C_CYAN="\033[36m"
C_YELLOW="\033[33m"
C_GREEN="\033[32m"
C_PURPLE="\033[35m"
C_RED="\033[31m"
C_BOLD="\033[1m"

color_for() {
  case "$1" in
    planned)               printf "%s" "$C_DIM" ;;
    script_drafted)        printf "%s" "$C_YELLOW" ;;
    script_approved)       printf "%s" "$C_CYAN" ;;
    video_generating)      printf "%s" "$C_PURPLE" ;;
    video_ready)           printf "%s" "$C_PURPLE" ;;
    ready_to_publish)      printf "%s" "$C_GREEN" ;;
    scheduled)             printf "%s" "$C_GREEN" ;;
    published)             printf "%s%s" "$C_BOLD" "$C_GREEN" ;;
    failed)                printf "%s" "$C_RED" ;;
    *)                     printf "%s" "$C_RESET" ;;
  esac
}

while true; do
  json=$(curl -sf "$API/api/content/_meta/counts" 2>/dev/null || echo '{"counts":[]}')
  clear
  printf "${C_BOLD}social-agent${C_RESET} ${C_DIM}— pipeline state${C_RESET}\n\n"
  printf "%-22s %s\n" "STATE" "COUNT"
  printf "%-22s %s\n" "──────────────────────" "──────"
  for state in "${COLUMNS_TO_SHOW[@]}"; do
    count=$(echo "$json" | grep -oE "\"state\":\"$state\",\"count\":[0-9]+" | grep -oE '[0-9]+$' || echo "0")
    count=${count:-0}
    bar=""
    [[ "$count" -gt 0 ]] && bar=$(printf '█%.0s' $(seq 1 $((count > 30 ? 30 : count))))
    color=$(color_for "$state")
    printf "${color}%-22s${C_RESET}  ${color}%-3s${C_RESET}  ${color}%s${C_RESET}\n" "$state" "$count" "$bar"
  done
  printf "\n${C_DIM}refresh every 1s · Ctrl+C to exit${C_RESET}\n"
  sleep 1
done
