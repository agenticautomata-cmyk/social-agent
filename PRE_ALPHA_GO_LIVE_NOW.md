# Benson Pre-Alpha — Go Live Now

**Purpose:** Get Benson reachable for real-time testing by Elliott and Kellie. No new features. No live email. Skip formal automated smoke.

**Verified on host:** 2026-05-31 (services already running on this machine).

---

## 1. Current runtime (this host)

| Check | Value |
|-------|--------|
| **Dashboard URL** | http://127.0.0.1:3000/ |
| **API URL** | http://127.0.0.1:4000/ |
| **API health** | `GET /health` → `{"ok":true}` |
| **Pre-alpha status** | `GET /api/pre-alpha/status` → `database: ok`, `demoMode: true`, `preAlphaReady: true` |
| **Database** | Postgres up (`docker compose` / `social_agent_postgres_bootstrap`) |
| **Demo mode** | `DEMO_MODE=true` (banner shows `demo_mode=true`) |
| **Live email** | **OFF** — `outreach.mode: simulate`, `liveEnabled: false`, `liveSendBlocked: true` |
| **Feedback** | `POST /api/pre-alpha/feedback` → **201** (feedback + bug) |
| **Send config** | `GET /api/outreach/send-config` → `mode: simulate`, `liveEnabled: false` |

**Logs (if started via script):** `.logs/pre-alpha/api.log`, `.logs/pre-alpha/dashboard.log`

---

## 2. Start / stop services

From repo root: `/home/elliott/Projects/kellie-assistant/social-agent`

### Start (idempotent)

```bash
cd /home/elliott/Projects/kellie-assistant/social-agent
npx --yes pnpm@10.30.3 pre-alpha:start
```

Preflight enforces: `.env` present, `OUTREACH_ENABLE_LIVE_SEND` not true, Postgres up, migrations, API `:4000`, dashboard `:3000`.

**Right now:** API and dashboard are already up — re-run only after a reboot or `pre-alpha:stop`.

### Stop app processes (keeps Postgres)

```bash
cd /home/elliott/Projects/kellie-assistant/social-agent
npx --yes pnpm@10.30.3 pre-alpha:stop
```

### Tail logs if something fails

```bash
tail -f /home/elliott/Projects/kellie-assistant/social-agent/.logs/pre-alpha/api.log
tail -f /home/elliott/Projects/kellie-assistant/social-agent/.logs/pre-alpha/dashboard.log
```

---

## 3. Cloudflare tunnel + Access (exact steps)

Benson has **no in-app login**. Cloudflare Access is the only gate. **Never** tunnel Postgres (`5433`).

### Why two hostnames (required for Kellie)

Client components call `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`). From Kellie’s browser, `localhost:4000` is **her laptop**, not your server. For remote testing you must expose the API and point the dashboard at it.

### 3.1 Install cloudflared (once)

```bash
# Debian/Ubuntu example
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
sudo dpkg -i /tmp/cloudflared.deb
cloudflared --version
```

### 3.2 Login and create tunnel

```bash
cloudflared tunnel login
cloudflared tunnel create benson-pre-alpha
```

Note the tunnel UUID from output (e.g. `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).

### 3.3 Config file

Replace `YOUR_ZONE` (e.g. `example.com`), tunnel UUID, and emails.

```bash
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/benson-pre-alpha.yml <<'EOF'
tunnel: <TUNNEL_UUID>
credentials-file: /home/elliott/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: app.YOUR_ZONE
    service: http://127.0.0.1:3000
  - hostname: api.YOUR_ZONE
    service: http://127.0.0.1:4000
  - service: http_status:404
EOF
```

**Exact tunnel values (fill in):**

| Key | Value |
|-----|--------|
| Tunnel name | `benson-pre-alpha` |
| Dashboard ingress | `app.YOUR_ZONE` → `http://127.0.0.1:3000` |
| API ingress | `api.YOUR_ZONE` → `http://127.0.0.1:4000` |
| Postgres | **not in tunnel** |

### 3.4 DNS routes

```bash
cloudflared tunnel route dns benson-pre-alpha app.YOUR_ZONE
cloudflared tunnel route dns benson-pre-alpha api.YOUR_ZONE
```

### 3.5 Point dashboard at public API (required)

In repo `.env` (do **not** commit):

```bash
NEXT_PUBLIC_API_URL=https://api.YOUR_ZONE
```

Restart dashboard so Next picks it up:

```bash
cd /home/elliott/Projects/kellie-assistant/social-agent
npx --yes pnpm@10.30.3 pre-alpha:stop
npx --yes pnpm@10.30.3 pre-alpha:start
```

### 3.6 Run tunnel

```bash
cloudflared tunnel --config ~/.cloudflared/benson-pre-alpha.yml run benson-pre-alpha
```

(Or install as a `systemd` service per [Cloudflare docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/local-management/as-a-service/).)

### 3.7 Cloudflare Access — Elliott + Kellie only

Zero Trust → **Access** → **Applications** → **Add an application** → **Self-hosted**

Create **two** apps (same policy on both):

1. **App:** `Benson Dashboard` — Domain: `app.YOUR_ZONE` — Path: `/*`
2. **App:** `Benson API` — Domain: `api.YOUR_ZONE` — Path: `/*`

**Policy (both apps):**

| Setting | Value |
|---------|--------|
| Action | Allow |
| Include | Emails: `elliott@YOUR_EMAIL_DOMAIN`, `kellie@YOUR_EMAIL_DOMAIN` |
| Default | Block all other traffic |

Use the real Google/email addresses Kellie and Elliott use for Cloudflare Access.

### 3.8 Post-tunnel sanity (no automated smoke)

```bash
curl -sf https://api.YOUR_ZONE/api/pre-alpha/status | jq '.demoMode,.database,.outreach,.safety'
curl -sf https://api.YOUR_ZONE/api/outreach/send-config | jq '.mode,.liveEnabled'
```

Expect: `demoMode: true`, `database: "ok"`, `outreach.mode: "simulate"`, `liveEnabled: false`.

---

## 4. URL Kellie should open

After tunnel + Access are live:

**https://app.YOUR_ZONE/**

She will get a Cloudflare Access login (email OTP or IdP). Only allowlisted emails pass.

Tell Kellie:

- Top banner: **pre-alpha**, **demo_mode=true**, **outreach=simulate**
- Outreach is **simulated** — nothing sends to real inboxes
- Use **Help us improve** at the bottom for feedback and bugs
- Start at **Home** (`/`)

---

## 5. Safety defaults (confirmed)

| Control | Status |
|---------|--------|
| Live send | **Blocked** unless `OUTREACH_ENABLE_LIVE_SEND=true` (script refuses pre-alpha start if true) |
| Resend | Not required; `send-config` lists missing live keys |
| Demo mode | `DEMO_MODE=true` — banner shows `demo_mode=true` |
| Feedback | `POST /api/pre-alpha/feedback` with `kind` + `route` — works |
| Bug report | Same endpoint, `kind: "bug"` + `comment` — works |
| Frontend secrets | No `NEXT_PUBLIC_*` keys for DB, Resend, or TikTok secret — only feature flags via `next.config.mjs` |

**Do not set for pre-alpha:**

```bash
OUTREACH_ENABLE_LIVE_SEND=true
```

---

## 6. Real-time testing checklist (manual — ~15 min)

Elliott runs locally or on tunnel URL; Kellie uses **https://app.YOUR_ZONE/** only.

| # | Step | Pass if |
|---|------|---------|
| 1 | Open **Home** `/` | Loads; pre-alpha banner visible |
| 2 | Open **Editor** `/editor` | Command center loads |
| 3 | **Save one recommendation** | Pick/save sticks; no hard error |
| 4 | Open **Planner** `/planner` | Hub loads |
| 5 | **Add feedback** | Footer → thumbs/comment → “thanks — feedback saved” |
| 6 | **Report a bug** | Footer → bug form → thanks |
| 7 | **Sponsor intelligence** `/sponsor-intelligence` | Page loads |
| 8 | **Create one sponsor lead** | Lead appears in sponsors list |
| 9 | **Outreach queue** (e.g. `/outreach/scheduled` or pipeline outreach) | Queue visible |
| 10 | **Confirm email simulated** | Banner `outreach=simulate`; compose/send shows simulate / no live send |

Optional Elliott-only on tunnel: hit Action Center send — should remain simulate when live send is off.

---

## 7. Blockers before Kellie can test

| Blocker | Mitigation |
|---------|------------|
| **No public URL** | Complete §3 (tunnel + Access + DNS) |
| **`NEXT_PUBLIC_API_URL` still localhost** | Set to `https://api.YOUR_ZONE` and restart dashboard |
| **Access not on `api.*`** | Kellie’s browser cannot call API — protect both hostnames |
| **Services down** | `pnpm pre-alpha:start` |
| **`.env` missing / flags off** | Copy `.env.example`; ensure `ENABLE_OPPORTUNITIES_API=true`, `ENABLE_OPPORTUNITIES_UI=true` |
| **Postgres down** | `docker compose up -d postgres` |
| **Unknown `YOUR_ZONE`** | Elliott must substitute real Cloudflare zone (not in repo) |

**Not blockers for pre-alpha:**

- Formal `pnpm pre-alpha:smoke` (skipped by choice)
- TikTok OAuth (optional later; set `TIKTOK_REDIRECT_URI` only if testing TikTok connect)
- Live email (intentionally off)

---

## 8. Quick reference

```bash
# Local URLs (Elliott on same machine)
open http://127.0.0.1:3000/
curl -s http://127.0.0.1:4000/api/pre-alpha/status | jq .

# Kellie (after tunnel)
# https://app.YOUR_ZONE/

# Never enable live send
grep OUTREACH_ENABLE_LIVE_SEND .env   # should be false or unset
```

See also: `docs/cloudflare-access.md`, `scripts/pre-alpha-start.sh`, `PRE_ALPHA_READINESS_PHASE_A_RESULTS.md`.
