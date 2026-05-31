# TikTok Analytics Phase A — Results

**Date:** 2026-05-31  
**Status:** Complete  
**Scope:** Manual/import analytics dashboard — no TikTok OAuth, no changes to opportunity sources

---

## Summary

Phase A delivers a **platform-agnostic creator analytics layer** with TikTok as the first supported platform. Kellie can import CSV/JSON/manual video performance data, view a full analytics dashboard, and receive **data-driven Benson recommendations** — all without a TikTok connection.

Demo mode auto-seeds **30 KC-themed sample videos** on first API load when the catalog is empty.

---

## What Was Built

### Database (`24_creator_analytics.sql`)

| Table | Purpose |
|---|---|
| `creator_accounts` | Platform + username (TikTok first; Instagram/YouTube-ready) |
| `creator_videos` | Video metadata, tags, optional `opportunity_id` link |
| `creator_metrics_snapshots` | Time-series metrics per import (views, engagement, watch time, etc.) |

Nullable columns preserved for future API fields: `saves`, `watch_time_seconds`, `average_watch_duration_seconds`, `completion_rate`, `follower_count_snapshot`.

### Core module (`services/core/src/creator-analytics/`)

| File | Role |
|---|---|
| `types.ts` | Shared types, CSV template header |
| `parse.ts` | CSV/JSON parsing, engagement rate, time buckets |
| `import.ts` | Upsert videos + snapshots, account creation |
| `dashboard.ts` | Rollups, patterns, recommendations |
| `demo-seed.ts` | 30 deterministic KC demo videos |

### API (`/api/analytics/*`)

Registered when `ENABLE_OPPORTUNITIES_API=true`.

| Route | Method | Purpose |
|---|---|---|
| `/api/analytics` | GET | Platform hub summary |
| `/api/analytics/tiktok` | GET | Full TikTok dashboard payload |
| `/api/analytics/import/template` | GET | CSV template download |
| `/api/analytics/import/csv` | POST | CSV text or multipart file |
| `/api/analytics/import/json` | POST | JSON array upload |
| `/api/analytics/import/manual` | POST | Single video entry |
| `/api/analytics/seed-demo` | POST | Force re-seed demo data |

### Dashboard

| Route | Description |
|---|---|
| `/analytics` | Hub — platform cards with links |
| `/analytics/tiktok` | Full dashboard (all required cards) |
| `/analytics/import` | CSV, JSON, manual import UI |

Navigation: **analytics** added to Benson nav (when `ENABLE_OPPORTUNITIES_UI=true`).

---

## Dashboard Cards Delivered

| Card | Data source |
|---|---|
| Top Videos | Latest snapshot, sorted by engagement (min 500 views) |
| Top Categories | `content_category` rollup |
| Top Locations | `location_tag` rollup |
| Top Posting Times | Weekday rollup (America/Chicago) |
| Growth Trend | Views aggregated by period |
| Engagement Trend | Engagement rate by period |
| Sponsor Performance | `sponsor_tag` rollup |
| Repeatable Winners | Multi-dimension patterns ≥1.5× baseline, n≥3 |
| Underperformers | Multi-dimension patterns ≤0.6× baseline, n≥3 |
| Benson Recommendations | Data-driven (see below) |

---

## Benson Recommendations (verified)

From demo data (`DEMO_MODE=true`, 30 videos):

| Type | Example |
|---|---|
| Repeat this topic | world cup content — 1.75× typical views |
| Repeat this location | Westport — 54,933 avg views |
| Repeat this sponsor type | sports bar — 1.93× baseline |
| Post more at this time | Thursday — 1.42× typical performance |
| Avoid this category | general — 0.19× baseline |

Recommendations require minimum sample sizes and confidence thresholds; weak signals are suppressed.

---

## Demo Mode

- On `GET /api/analytics` or `/api/analytics/tiktok`, if no TikTok videos exist and `DEMO_MODE=true`, **30 sample videos** are inserted automatically.
- Sample data includes dining, date night, world cup, estate sales, retail, Crossroads, Westport, Mission Hills, etc.
- Dashboard shows demo banner; no external API calls.

---

## Verification

| Check | Result |
|---|---|
| Migration applied | ✅ `pnpm migrate:creator-analytics` |
| TypeScript | ✅ `pnpm typecheck` (all packages) |
| `/analytics` | ✅ HTTP 200 |
| `/analytics/tiktok` | ✅ HTTP 200 |
| `/analytics/import` | ✅ HTTP 200 |
| Sample data | ✅ 30 videos, 1.1M total views |
| Recommendations | ✅ 5 data-driven recommendations |
| Import template | ✅ `GET /api/analytics/import/template` |

### Sample API response (abbreviated)

```
GET /api/analytics/tiktok
→ account: @kelliekc
→ summary: 30 videos, 1,110,700 views, 13.4% avg engagement
→ recommendations: 5 items (topic, location, sponsor, post time, avoid)
```

---

## Future Ready

- `creator_accounts.platform` uses existing `platform` enum (`tiktok`, `instagram`, `youtube_shorts`, `linkedin`)
- `connection_status` defaults to `import_only`; ready for OAuth in Phase B
- Metrics `source` column supports `api_display`, `api_business` when APIs connect
- Hub UI shows Instagram/YouTube as “coming soon”

---

## Commands

```bash
# Migration
pnpm migrate:creator-analytics

# Dev (requires ENABLE_OPPORTUNITIES_API/UI=true in .env)
pnpm dev:api
pnpm dev:dashboard

# Verify analytics compute
cd services/core && npx tsx src/scripts/verify-creator-analytics.ts
```

---

## Files Added / Modified

**New:**
- `db/migrations/24_creator_analytics.sql`
- `services/core/src/creator-analytics/*`
- `services/core/src/scripts/migrate-creator-analytics.ts`
- `services/core/src/scripts/verify-creator-analytics.ts`
- `services/api/src/routes/creator-analytics.ts`
- `dashboard/app/analytics/**`
- `dashboard/lib/creator-analytics-types.ts`

**Modified:**
- `services/core/src/schema.ts` — creator analytics tables
- `services/core/package.json` — export + migrate script
- `services/api/src/server.ts` — route registration
- `dashboard/lib/opportunities-ui.ts` — nav link
- `package.json` — migrate script

**Not modified:** Opportunity sources, scanners, scoring, publishing.

---

*Phase A complete. Ready for Phase B (TikTok OAuth + Display API sync) when approved.*
