# Phase E: External Account Integration — Results

**Date:** 2026-05-31  
**Constraints:** No UI redesign, no new KC sources, no new scoring systems. Read-only analytics only — no publishing.

## Summary

Phase E replaces Phase D connector placeholders with real OAuth connections, read-only sync jobs, and creator dashboard metrics for TikTok, Facebook Page, and Instagram Professional.

## 1. Meta integration (Facebook + Instagram)

| Capability | Implementation |
|------------|----------------|
| OAuth | `GET /api/analytics/meta/oauth/start` → Facebook Login dialog |
| Callback | `GET /api/analytics/meta/oauth/callback` → long-lived user token → Page token + IG Business account |
| Token storage | `creator_platform_connections` (`access_token_encrypted`, same `enc:v1:` scheme as TikTok) |
| Scopes | Read-only: `pages_show_list`, `pages_read_engagement`, `instagram_basic`, `instagram_manage_insights` |
| Disconnect | `POST /api/analytics/meta/disconnect` |
| Status | `GET /api/analytics/meta/status` |
| UI | `/analytics/meta/settings` + `MetaConnectionPanel` |

**Env:**

```bash
IG_APP_ID=
IG_APP_SECRET=
META_REDIRECT_URI=http://localhost:4000/api/analytics/meta/oauth/callback
META_PAGE_ID=   # optional when multiple pages
```

## 2. TikTok integration

| Capability | Implementation |
|------------|----------------|
| OAuth | Existing Phase B flow (`/api/analytics/tiktok/oauth/*`) |
| Read-only sync | `video.list` + `video.query` → `creator_videos` + `creator_metrics_snapshots` (`source: api_display`) |
| Metrics on hub | Followers (from snapshots), posts, views, engagement totals on `analytics_connectors` |

## 3. Sync jobs

| Trigger | Mechanism |
|---------|-----------|
| Nightly | Worker `creator-analytics-sync` — 24h cron in `services/workers` |
| Manual | `POST /api/analytics/sync` — body `{ "provider": "all" \| "tiktok" \| "facebook" \| "instagram" }` |
| Status | `GET /api/analytics/sync/status` + per-connector `syncStatus`, `lastSyncAt`, `lastSuccessfulSyncAt`, `lastSyncError` |

**Migration 35** extends `analytics_connectors` with sync state and summary metrics columns; adds `facebook` to `platform` enum.

```bash
source .env && cd services/core && pnpm migrate:analytics-sync
```

## 4. Creator dashboard (`/analytics`)

Uses existing analytics hub — extended, not redesigned:

- **Sync all accounts** button
- Per-provider cards: followers, posts, views, engagement
- Account status (connected / disconnected / sync_error)
- Last sync + last successful sync
- Links to TikTok or Meta settings

`GET /api/analytics` now returns `connectors[]`, `readOnly: true`, `syncInProgress`.

## 5. Read-only guarantee

- No publish/post endpoints added
- Meta scopes exclude `pages_manage_posts`, `instagram_content_publish`, etc.
- TikTok sync uses Display API list/query only
- Hub copy states read-only explicitly

## Demo mode

When accounts are not connected but `DEMO_MODE=true`, sync aggregates existing imported/demo `creator_videos` into connector metrics so the dashboard stays usable.

## New modules

| Path | Role |
|------|------|
| `services/core/src/meta-oauth/` | Meta OAuth + connections |
| `services/core/src/creator-analytics-sync/` | TikTok + Meta sync orchestration |
| `services/core/src/analytics-connectors/state.ts` | Connector sync state updates |
| `services/workers/src/workflows/creator-analytics-sync.ts` | Nightly worker |

**Exports:** `@social-agent/core/meta-oauth`, `@social-agent/core/creator-analytics-sync`

## Verification

```bash
curl -s http://127.0.0.1:4000/api/analytics | jq '{readOnly, connectors: [.connectors[] | {provider, connected, syncStatus, totalViews}]}'
curl -s -X POST http://127.0.0.1:4000/api/analytics/sync -H 'Content-Type: application/json' -d '{"provider":"all"}' | jq '.results'
curl -s http://127.0.0.1:4000/api/analytics/meta/status | jq '.facebook.status, .instagram.status'
```

## Not in scope

- YouTube OAuth (connector row remains; sync skipped unless demo local data)
- Posting / scheduling / publishing pipeline changes
- New KC ingest sources or scoring
