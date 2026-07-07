#!/usr/bin/env bash
# Point benson.kckellie.com and api.kckellie.com at the mmm-assistant tunnel.
# kckellie.com lives in a separate Cloudflare account from mentalmattersmore.org.
set -euo pipefail

TUNNEL_ID="6f1688b3-ae2c-48ab-abfa-20394eae5ba1"
TUNNEL_NAME="mmm-assistant"
TUNNEL_CNAME="${TUNNEL_ID}.cfargotunnel.com"
KCKELLIE_CERT="${HOME}/.cloudflared/cert-kckellie.pem"
HOSTS=(benson.kckellie.com api.kckellie.com)

echo "==> Benson tunnel DNS fix (kckellie.com zone)"
echo "    Target tunnel: ${TUNNEL_NAME} (${TUNNEL_ID})"
echo

if [[ -n "${CLOUDFLARE_API_TOKEN:-}" && -n "${KCKELLIE_ZONE_ID:-}" ]]; then
  echo "==> Using Cloudflare API (KCKELLIE_ZONE_ID + CLOUDFLARE_API_TOKEN)"
  for host in "${HOSTS[@]}"; do
    name="${host%%.kckellie.com}"
    existing="$(curl -fsS -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      "https://api.cloudflare.com/client/v4/zones/${KCKELLIE_ZONE_ID}/dns_records?name=${host}")"
    record_id="$(python3 - <<PY
import json, sys
data = json.load(sys.stdin)
rows = data.get("result") or []
print(rows[0]["id"] if rows else "")
PY
<<<"${existing}")"
    payload="$(python3 - <<PY
import json
print(json.dumps({
  "type": "CNAME",
  "name": "${name}",
  "content": "${TUNNEL_CNAME}",
  "proxied": True,
}))
PY
)"
    if [[ -n "${record_id}" ]]; then
      curl -fsS -X PUT \
        -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "${payload}" \
        "https://api.cloudflare.com/client/v4/zones/${KCKELLIE_ZONE_ID}/dns_records/${record_id}" >/dev/null
      echo "    updated ${host}"
    else
      curl -fsS -X POST \
        -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "${payload}" \
        "https://api.cloudflare.com/client/v4/zones/${KCKELLIE_ZONE_ID}/dns_records" >/dev/null
      echo "    created ${host}"
    fi
  done
else
  if [[ ! -f "${KCKELLIE_CERT}" ]]; then
    echo "Missing ${KCKELLIE_CERT}."
    echo "Run once (select the kckellie.com zone in the browser):"
    cat <<EOF
  mv ~/.cloudflared/cert.pem ~/.cloudflared/cert.pem.mentalmattersmore.bak
  cloudflared --origincert ${KCKELLIE_CERT} tunnel login
  mv ~/.cloudflared/cert.pem.mentalmattersmore.bak ~/.cloudflared/cert.pem
EOF
    exit 1
  fi
  echo "==> Using cloudflared route DNS with ${KCKELLIE_CERT}"
  for host in "${HOSTS[@]}"; do
    cloudflared --origincert "${KCKELLIE_CERT}" tunnel route dns --overwrite-dns \
      "${TUNNEL_ID}" "${host}"
    echo "    routed ${host}"
  done
fi

echo
echo "==> Restart cloudflared (requires sudo password on this host)"
sudo systemctl restart cloudflared
sudo systemctl status cloudflared --no-pager

echo
echo "==> Verify"
curl -sI http://localhost:3000 | head -1
curl -sI http://localhost:4000/health | head -1
curl -sI "https://benson.kckellie.com" | head -1
curl -sI "https://api.kckellie.com/health" | head -1
