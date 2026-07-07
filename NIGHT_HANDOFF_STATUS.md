# Night handoff — Benson pre-alpha

**Generated:** 2026-06-01 (night stabilization pass)  
**Stack:** clean restart completed (`pre-alpha:stop` → kill strays → `pre-alpha:start`)

---

## TikTok OAuth

| Check | Result |
|-------|--------|
| `TIKTOK_CLIENT_KEY` in `.env` | **Empty — blocker** |
| `TIKTOK_CLIENT_SECRET` in `.env` | **Empty — blocker** |
| `TIKTOK_REDIRECT_URI` | `https://api.kckellie.com/api/analytics/tiktok/oauth/callback` ✓ |
| `DASHBOARD_PUBLIC_URL` | `https://benson.kckellie.com` ✓ |
| Cloudflare Access on callback | **Not blocking** — `GET /api/analytics/tiktok/oauth/callback` returns **302** to Benson settings (not Access login) |
| OAuth callback ever received code+state | **No** — OAuth never started; `/oauth/start` returns **503** `credentials_missing` |
| Token exchange | **Never attempted** (no credentials) |
| Row in `creator_platform_connections` | **0 rows** |
| Public `/api/analytics/tiktok/status` | `credentials_missing` |

**Root cause (confirmed):** TikTok API credentials are not configured in production `.env`. Kellie’s earlier TikTok login could not complete because Benson cannot build an authorization URL or exchange tokens without `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`.

**To unblock (Elliott, before Kellie retries TikTok):**

1. Add sandbox (or live) `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` to `.env`.
2. Confirm TikTok Developer Portal redirect URI matches exactly:  
   `https://api.kckellie.com/api/analytics/tiktok/oauth/callback`
3. If using **Sandbox** mode, add Kellie’s TikTok account as a **Target User**.
4. Restart API: `pnpm pre-alpha:stop && pnpm pre-alpha:start`

**Cloudflare Access:** No change needed. Callback path on `api.kckellie.com` is already reachable without Access. Dashboard pages remain behind Access (expected).

---

## TikTok sync / analytics data

| Check | Result |
|-------|--------|
| `/api/analytics/sync` (manual) | HTTP 200 |
| TikTok provider result | `ok: true`, `updated: 30`, `imported: 0` |
| Data source | **Local seeded `creator_videos` rows** (30 TikTok demo/import rows in DB), **not** live TikTok API |
| Reason | No connected account + `DEMO_MODE=true` → sync uses `syncProviderFromLocalData` |

**Blocker for real TikTok metrics:** OAuth credentials + successful connection. Until then, Analytics → TikTok shows aggregated local/demo video data only. This is intentional safety behavior — we are **not** faking live API responses.

---

## Demo mode / header status

| Setting | Value | Visible to Kellie |
|---------|-------|-------------------|
| `DEMO_MODE` (env) | `true` | **Not shown** in header/banner |
| Header strip | — | `live KC · outreach simulate · posting off` |
| Top banner | — | `live KC data · outreach simulate · posting disabled` |
| Page-level notes | — | Some pages still say “demo mode” in context (e.g. analytics hub, planner) meaning simulate/read-only — not fake KC ingest |

**Why `DEMO_MODE` stayed `true`:** Flipping it off could enable real provider calls (posting, live analytics mocks off) before accounts are ready. Labeling was corrected instead.

**Bug fixed tonight:** `/api/sources/freshness` returned 500 (`toISOString is not a function` on Postgres timestamp). Fixed in `services/core/src/source-ingestion/freshness.ts`. Public endpoint now **200**.

---

## Safety gates

| Gate | Status |
|------|--------|
| Live email (`OUTREACH_ENABLE_LIVE_SEND`) | **false** — blocked |
| Outreach mode | **simulate** |
| `safety.liveSendBlocked` | **true** |
| Video pipeline / posting | **disabled** (`DISABLE_VIDEO_PIPELINE=true`, TikTok publish uses mock when `DEMO_MODE=true`) |
| Real KC ingest | **active** — 415 ingested content items |

---

## Data counts (live DB)

| Metric | Count |
|--------|------:|
| Ingested content items (`source_id` set) | **415** |
| Sponsor contacts (leads) | **4** |
| Sponsor candidates (scored) | **191** |
| Connected platform accounts | **0** |
| TikTok videos in analytics tables (local/seed) | **30** |
| Sources refreshed today | **57** |

---

## Verification (post-restart)

### API — all OK

| URL | Status |
|-----|--------|
| https://api.kckellie.com/health | **200** |
| https://api.kckellie.com/api/analytics/connectors | **200** |
| https://api.kckellie.com/api/analytics/tiktok/status | **200** (`credentials_missing`) |
| https://api.kckellie.com/api/sources/freshness | **200** (was 500, fixed) |
| https://api.kckellie.com/api/pre-alpha/status | **200** (`preAlphaReady: true`) |

### Dashboard (public, unauthenticated curl)

All return **Cloudflare Access login** (302 → login page → 200). This is **expected** — Kellie signs in with her Access identity.

| URL | Notes |
|-----|-------|
| https://benson.kckellie.com | Access login → home |
| https://benson.kckellie.com/analytics | Access login → analytics hub |
| https://benson.kckellie.com/analytics/tiktok/settings | Access login → TikTok settings |
| https://benson.kckellie.com/sponsor-intelligence | Access login → sponsor intel |
| https://benson.kckellie.com/planner | Access login → planner |
| https://benson.kckellie.com/sources | Access login → sources |

### Dashboard (local, authenticated stack)

All **200**: `/`, `/analytics`, `/analytics/tiktok/settings`, `/sponsor-intelligence`, `/planner`, `/sources`

---

## For Kellie tonight

**Open:** https://benson.kckellie.com  
(Sign in via Cloudflare Access when prompted.)

**Safe to click / use:**

- **Home** — real KC inventory summary (415 items), sponsor pipeline snapshot
- **Sources** — ingestion freshness, source list, refresh status
- **Sponsor Intelligence** — scored candidates from real ingest
- **Sponsors** — CRM contacts (4 leads)
- **Planner** — plan content from live inventory
- **Editor / Inventory review** — browse and triage KC items
- **Analytics hub** — read-only connector overview (Meta/TikTok disconnected is expected)
- **Feedback footer** — submit pre-alpha notes

**Avoid / expect limitations:**

- **Connect TikTok** — will fail until Elliott adds API credentials to the server (settings page shows “credentials missing”)
- **Connect Meta (Facebook/Instagram)** — same if Meta app credentials not configured
- **Sync analytics expecting live TikTok numbers** — shows local/demo video aggregates until OAuth works
- **Send outreach email** — simulate only; no real sends
- **Post / publish video** — disabled
- **“Refresh all sources”** if it errors on `manual` source type — known partial failure on last batch run; does not wipe data

---

## Changes made this pass

1. Fixed `/api/sources/freshness` timestamp coercion bug
2. Removed misleading “demo mode on” from ingestion freshness banner
3. Header/banner already show accurate live-data + safety labels (prior pass)
4. Confirmed `.env`: `TIKTOK_REDIRECT_URI`, `DASHBOARD_PUBLIC_URL`, `OUTREACH_ENABLE_LIVE_SEND=false`
5. Clean restart: API `:4000`, dashboard `:3000`, Postgres unchanged

---

## READY FOR KELLIE: **YES**

Kellie can safely use Benson tonight for real KC content browsing, sponsor intelligence, planner, and sources. The app is up, the API is healthy, live email and posting remain blocked, and 415 ingested KC items are available. TikTok (and Meta) account connection is **not** available until Elliott adds platform API credentials and restarts the stack; Analytics TikTok metrics are from local seed data, not a live TikTok pull — she should treat Analytics as informational until OAuth is configured.
