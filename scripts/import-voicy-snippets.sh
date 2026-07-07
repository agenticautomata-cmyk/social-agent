#!/usr/bin/env bash
# Copy Voicy royalty-free snippets from ~/Downloads into the dashboard public folder.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/dashboard/public/audio/voicy"
SRC="${1:-$HOME/Downloads}"

mkdir -p "$DEST"

declare -A MAP=(
  ["Voicy_admit it Benson.mp3"]="admit-it-benson.mp3"
  ["Voicy_Benson You listen, and you listen good.mp3"]="listen-good.mp3"
  ["everything_s_golden.mp3"]="everything-golden.mp3"
  ["painting_the_sky.mp3"]="painting-the-sky.mp3"
  ["views_go_crazy.mp3"]="views-go-crazy.mp3"
  ["top_of_the_feed.mp3"]="top-of-the-feed.mp3"
  ["raw_data_to_concrete.mp3"]="raw-data-to-concrete.mp3"
  ["kellie_s_private_sunset.mp3"]="kellies-private-sunset.mp3"
)

count=0
for src_name in "${!MAP[@]}"; do
  dest_name="${MAP[$src_name]}"
  src_path="$SRC/$src_name"
  if [[ -f "$src_path" ]]; then
    cp "$src_path" "$DEST/$dest_name"
    echo "  ✓ $dest_name"
    count=$((count + 1))
  else
    echo "  ✗ missing: $src_name" >&2
  fi
done

echo "Imported $count studio snippets → $DEST"
