# TikTok OAuth Phase B — Results

**Date:** 2026-05-31  
**Status:** Complete (architecture & readiness only)  
**Scope:** OAuth UI, secure state flow, connection storage, credential gating — no fake OAuth, no video sync, manual import preserved

---

## Summary

Phase B prepares Benson for Kellie to connect TikTok from the dashboard. When API credentials are configured, **Connect TikTok** starts a real TikTok Login Kit authorization flow with HMAC-signed state. When credentials are missing, the UI and API return a clear setup message — no mock redirects or placeholder tokens.

Manual CSV/JSON import, demo mode seeding, and the existing `/analytics/tiktok` dashboard are unchanged.

---

## What Was Built

### Dashboard routes

| Route | Purpose |
|---|---|
| `/analytics/tiktok/connect` | Connect flow + setup instructions |
| `/analytics/tiktok/settings` | Connection status, scopes, disconnect, OAuth callback banners |

Shared component: `dashboard/components/tiktok-connection-panel.tsx`

Buttons: **Connect TikTok**, **Disconnect TikTok**, **Check Connection Status**

### API routes (`ENABLE_OPPORTUNITIES_API=true`)

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/api/analytics/tiktok/oauth/start` | Missing creds → `503` JSON; configured → `302` to TikTok or `?format=json` returns `{ authorizationUrl }` |
| `GET` | `/api/analytics/tiktok/oauth/callback` | Real code exchange + user info; redirects to settings |
| `GET` | `/api/analytics/tiktok/status` | Public connection status (no tokens) |
| `POST` | `/api/analytics/tiktok/disconnect` | Clears tokens; safe when already disconnected |

Existing analytics routes unchanged: `GET /api/analytics`, `GET /api/analytics/tiktok`, import endpoints.

### Database

**Migration:** `db/migrations/28_creator_platform_connections.sql`  
**Script:** `pnpm migrate:creator-platform-connections`

| Table | Purpose |
|---|---|
| `creator_platform_connections` | OAuth tokens (encrypted), scopes, status per creator account + platform |

**Status enum:** `connected` · `disconnected` · `expired` · `error` · `credentials_missing`

### Core module

`services/core/src/tiktok-oauth/`

| File | Role |
|---|---|
| `config.ts` | Reads `TIKTOK_CLIENT_KEY`, `SECRET`, `REDIRECT_URI` |
| `oauth-state.ts` | HMAC-signed state (10 min TTL, ties to `creator_account_id`) |
| `token-crypto.ts` | Placeholder `enc:v1:` encoding — document KMS upgrade before prod |
| `oauth.ts` | Real authorize URL + token exchange + user info (no fake OAuth) |
| `connections.ts` | Status, upsert, disconnect |
| `scopes.ts` | Requested scopes: `user.info.basic`, `video.list` |

**Export:** `@social-agent/core/tiktok-oauth`

### Environment variables

Documented in `.env.example`:

```bash
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=http://localhost:4000/api/analytics/tiktok/oauth/callback
# DASHBOARD_PUBLIC_URL=http://localhost:3000  # optional OAuth redirect base
```

Legacy `TIKTOK_ACCESS_TOKEN` / `TIKTOK_OPEN_ID` remain for publishing workers.

### Scope & field documentation

`docs/tiktok-oauth-scopes.md` — separates:

- Manual/CSV import fields (always)
- Display API likely fields (`video.list` / `video.query`)
- Business/Research fields (approval uncertain)

---

## Security notes

- Raw tokens are **never** logged (only `[redacted]`)
- Tokens are **never** sent to the frontend
- Phase B encryption is **not production-grade** — upgrade to AES-256-GCM or KMS before go-live
- OAuth `state` is signed with `TIKTOK_CLIENT_SECRET` and expires in 10 minutes

---

## Verification

| Check | Result |
|---|---|
| `/analytics/tiktok/connect` loads | ✅ HTTP 200 |
| `/analytics/tiktok/settings` loads | ✅ HTTP 200 |
| `GET /api/analytics/tiktok/status` (no creds) | ✅ `credentials_missing` + setup instructions |
| `GET /api/analytics/tiktok/oauth/start?format=json` (no creds) | ✅ HTTP 503 `credentials_missing` |
| `POST /api/analytics/tiktok/disconnect` (no connection) | ✅ `{ ok: true, alreadyDisconnected: true }` |
| `GET /api/analytics/tiktok` dashboard | ✅ HTTP 200 |
| `/analytics`, `/analytics/import` | ✅ HTTP 200 |
| TypeScript | ✅ `pnpm -r typecheck` passes |
| Migration | ✅ `pnpm migrate:creator-platform-connections` |

### Sample commands

```bash
pnpm migrate:creator-platform-connections

curl -s http://localhost:4000/api/analytics/tiktok/status | jq .
curl -s 'http://localhost:4000/api/analytics/tiktok/oauth/start?format=json' | jq .
curl -s -X POST http://localhost:4000/api/analytics/tiktok/disconnect | jq .
```

### Enabling real OAuth locally

1. Create a TikTok app at [developers.tiktok.com](https://developers.tiktok.com/)
2. Add Login Kit redirect URI matching `TIKTOK_REDIRECT_URI`
3. Set all three env vars in `.env` and restart API
4. Open `/analytics/tiktok/connect` → **Connect TikTok**

---

## Not in scope (Phase B)

- Automated `video.list` sync (Phase C)
- Using OAuth tokens in analytics ingest workers yet
- Business/Research API metrics
- Replacing manual CSV import
- Disabling demo mode

---

## Next steps (Phase C)

- `tiktok-catalog-sync` worker using stored refresh tokens
- “Sync now” on dashboard when `video.list` scope granted
- Merge API metrics with CSV without overwriting manual-only fields
