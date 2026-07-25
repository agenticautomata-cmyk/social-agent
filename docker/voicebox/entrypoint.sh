#!/usr/bin/env bash
set -euo pipefail

HOST="${VOICEBOX_HOST:-0.0.0.0}"
PORT="${VOICEBOX_PORT:-17493}"
DATA_DIR="${VOICEBOX_DATA_DIR:-/var/lib/voicebox}"
ENGINE="${BENSON_VOICE_ENGINE:-kokoro}"
PROFILE_NAME="${BENSON_VOICE_PROFILE_NAME:-Benson Studio}"
PRESET_VOICE="${BENSON_VOICE_PRESET_ID:-am_echo}"

mkdir -p "$DATA_DIR" "$DATA_DIR/huggingface" /tmp/voicebox-work
chown -R voicebox:voicebox "$DATA_DIR" /tmp/voicebox-work 2>/dev/null || true

cd /opt/voicebox

su -s /bin/bash voicebox -c "python -m backend.main --host \"$HOST\" --port \"$PORT\" --data-dir \"$DATA_DIR\"" &
SERVER_PID=$!

cleanup() {
  kill -TERM "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup SIGTERM SIGINT

wait_for_health() {
  local i
  for i in $(seq 1 120); do
    if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

if wait_for_health; then
  echo "[voicebox] Server healthy — ensuring Benson profile and model…"

  PROFILE_ID=""
  EXISTING="$(curl -sf "http://127.0.0.1:${PORT}/profiles" || echo '[]')"
  PROFILE_ID="$(echo "$EXISTING" | python3 -c "
import json,sys
name = sys.argv[1]
for p in json.load(sys.stdin):
    if p.get('name') == name:
        print(p.get('id',''))
        break
" "$PROFILE_NAME" 2>/dev/null || true)"

  if [[ -z "$PROFILE_ID" ]]; then
    CREATE="$(curl -sf -X POST "http://127.0.0.1:${PORT}/profiles" \
      -H 'Content-Type: application/json' \
      -d "{\"name\":\"${PROFILE_NAME}\",\"voice_type\":\"preset\",\"preset_engine\":\"${ENGINE}\",\"preset_voice_id\":\"${PRESET_VOICE}\",\"language\":\"en\",\"description\":\"Fictional Benson studio voice for Ask Benson\"}")" || true
    PROFILE_ID="$(echo "$CREATE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || true)"
    echo "[voicebox] Created profile ${PROFILE_NAME}: ${PROFILE_ID}"
  else
    echo "[voicebox] Reusing profile ${PROFILE_NAME}: ${PROFILE_ID}"
  fi

  echo "$PROFILE_ID" > "$DATA_DIR/benson_profile_id"

  curl -sf -X POST "http://127.0.0.1:${PORT}/models/download" \
    -H 'Content-Type: application/json' \
    -d "{\"engine\":\"${ENGINE}\"}" >/dev/null 2>&1 || echo "[voicebox] Model download request sent (may already exist)"

  curl -sf -X POST "http://127.0.0.1:${PORT}/speak" \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"Benson Studio Voice is ready.\",\"profile\":\"${PROFILE_NAME}\",\"engine\":\"${ENGINE}\",\"personality\":false}" \
    >/dev/null 2>&1 || echo "[voicebox] Prewarm speak skipped"
fi

wait "$SERVER_PID"
