# Cloudflare tunnel recovery — Benson pre-alpha

Use the **mmm-assistant** tunnel only unless credentials for **benson-pre-alpha** are restored on this machine.

| Role | Value |
|------|--------|
| Tunnel name | `mmm-assistant` |
| Tunnel UUID | `6f1688b3-ae2c-48ab-abfa-20394eae5ba1` |
| Credentials | `/home/elliott/.cloudflared/6f1688b3-ae2c-48ab-abfa-20394eae5ba1.json` |
| System config | `/etc/cloudflared/config.yml` |
| Working backup (repo) | `deploy/cloudflared.config.yml.working-benson` |
| Working backup (host) | `/etc/cloudflared/config.yml.working-benson` (create with sudo; see below) |

## Local services

| Service | Port |
|---------|------|
| Benson dashboard | `localhost:3000` |
| Benson API | `localhost:4000` |

## Public hostnames

| Hostname | Local target |
|----------|----------------|
| `benson.kckellie.com` | `http://localhost:3000` |
| `api.kckellie.com` | `http://localhost:4000` |

## Do not use

- **benson-pre-alpha** tunnel (`37bac956-3b71-44c2-a986-ed0269307b81`) — no credentials file on Mappy; removed from Cloudflare to prevent hostname conflicts.
- `~/.cloudflared/config.yml` — points at the unrelated **agentic-automata** tunnel; systemd uses `/etc/cloudflared/config.yml` instead.

## Required ingress (before `http_status:404`)

```yaml
  - hostname: benson.kckellie.com
    service: http://localhost:3000
  - hostname: api.kckellie.com
    service: http://localhost:4000
```

## Two Cloudflare accounts (important)

| Zone | Account | Notes |
|------|---------|-------|
| `mentalmattersmore.org` | Agentic.automata@gmail.com (`bd087561…`) | Hosts `mmm-assistant` tunnel + `cloudflared` cert at `~/.cloudflared/cert.pem` |
| `kckellie.com` | **Separate account** | Public DNS for `benson` / `api` must CNAME to `6f1688b3-ae2c-48ab-abfa-20394eae5ba1.cfargotunnel.com` |

Running `cloudflared tunnel route dns` with the mentalmattersmore cert only creates useless records like `api.kckellie.com.mentalmattersmore.org`. That does **not** fix public `api.kckellie.com`.

## Error 1033 on `api.kckellie.com`

Typical cause: `api.kckellie.com` DNS in the **kckellie.com** zone still points at a dead tunnel (formerly `benson-pre-alpha`) while `benson.kckellie.com` already points at `mmm-assistant`.

`benson.kckellie.com` may still work (302 → Cloudflare Access) even when `api.kckellie.com` returns 1033.

### Fix DNS in kckellie.com (pick one)

**Option A — script (recommended)**

```bash
# one-time login for the kckellie.com Cloudflare account
mv ~/.cloudflared/cert.pem ~/.cloudflared/cert.pem.mentalmattersmore.bak
cloudflared --origincert ~/.cloudflared/cert-kckellie.pem tunnel login
mv ~/.cloudflared/cert.pem.mentalmattersmore.bak ~/.cloudflared/cert.pem

# route both hostnames to mmm-assistant and restart cloudflared
bash scripts/fix-kckellie-tunnel-dns.sh
```

**Option B — dashboard (kckellie.com zone → DNS)**

For both `benson` and `api` records, set:

- **Type:** CNAME (proxied / orange cloud)
- **Target:** `6f1688b3-ae2c-48ab-abfa-20394eae5ba1.cfargotunnel.com`

Delete any CNAME/A record pointing at `37bac956-3b71-44c2-a986-ed0269307b81.cfargotunnel.com`.

**Option C — API token**

```bash
export CLOUDFLARE_API_TOKEN=...   # Zone.DNS Edit on kckellie.com
export KCKELLIE_ZONE_ID=...       # kckellie.com zone id
bash scripts/fix-kckellie-tunnel-dns.sh
```

## Restore system config backup

```bash
sudo cp /etc/cloudflared/config.yml.working-benson /etc/cloudflared/config.yml
sudo systemctl restart cloudflared
```

If the host backup is missing:

```bash
sudo cp deploy/cloudflared.config.yml.working-benson /etc/cloudflared/config.yml
sudo cp /etc/cloudflared/config.yml /etc/cloudflared/config.yml.working-benson
sudo systemctl restart cloudflared
```

## Verify

```bash
sudo systemctl status cloudflared --no-pager
curl -I http://localhost:3000
curl -I http://localhost:4000/health
curl -I https://benson.kckellie.com          # expect 302 → Cloudflare Access
curl -I https://api.kckellie.com/health      # expect 200
```

## Restart chain (Mappy)

```bash
sudo systemctl restart cloudflared
sudo systemctl status cloudflared --no-pager
journalctl -u cloudflared -n 50 --no-pager
```
