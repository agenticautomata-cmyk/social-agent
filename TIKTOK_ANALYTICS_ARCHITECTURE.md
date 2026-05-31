# TikTok Analytics Architecture

**Date:** 2026-05-31  
**Status:** Design document — **no application code modified**  
**Primary user:** Kellie (creator)  
**Assistant:** Benson  
**Related:** [ARCHITECTURE.md](./ARCHITECTURE.md), [BENSON_VISION.md](./BENSON_VISION.md), [DEPENDENCY_MAP.md](./DEPENDENCY_MAP.md), [docs/publishing-setup.md](./docs/publishing-setup.md)

---

## Executive Summary

Benson today knows how **Benson-published** TikTok posts perform (`publications` → `post_metrics` → `topic_performance`), but Kellie's TikTok page is a living library of hundreds of videos — many posted manually, many tied to KC opportunities Benson never tracked. Without full-page analytics, Benson cannot learn what hooks, locations, categories, and post times actually drive views and engagement on *her* account.

This document designs a **creator analytics layer** that:

1. Ingests Kellie's TikTok video catalog and performance metrics (manual first, API later).
2. Enriches each video with editorial tags (category, location, hook style, sponsor).
3. Surfaces a dashboard of top performers, averages, and repeatable vs underperforming patterns.
4. Feeds a recommendation engine so Benson's planner and editorial picks bias toward proven formats.

**Design principle:** Ship value before API approval. Phase A (CSV import + dashboard) must work with zero TikTok developer scopes beyond what Benson already has for publishing. Phases B–D progressively automate ingestion as OAuth and API access expand.

**Critical constraint:** Do **not** assume TikTok exposes every metric through the public Display API. This design labels every field by **provenance** (API / manual / derived / unavailable) so engineers and Kellie never confuse "missing in Benson" with "missing on TikTok."

---

## Problem Statement

| Today | Gap |
|---|---|
| `analytics-ingest` worker polls IG Insights + TikTok Display API for **publications** tied to `content_items` | Kellie's full TikTok back catalog is invisible |
| `fetchTikTokStats()` returns views, likes, comments, shares; **hardcodes saves=0, watchTime=0** | No saves, watch time, completion, or audience metrics |
| `topic_performance` rolls up industry/type weights for the **planner** | No hook-style, location, post-time, or pillar-level learning |
| TikTok OAuth exists for **Content Posting API** via `platform_credentials` | No Benson UI "Connect TikTok" for analytics scopes; no `video.list` sync |

**Goal:** Give Kellie true creator analytics and let Benson learn what content performs best on her TikTok page.

---

## Relationship to Existing Analytics

```
┌─────────────────────────────────────────────────────────────────────────┐
│  EXISTING (keep)                    │  NEW (this design)                │
│  ─────────────────                  │  ──────────────────               │
│  publications                       │  tiktok_videos (full catalog)     │
│  post_metrics (time series)         │  tiktok_video_metrics (snapshots) │
│  topic_performance (planner bias)   │  tiktok_video_tags + rollups      │
│  Scope: Benson-published only       │  Scope: entire @kellie account    │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              Optional link: tiktok_videos.content_item_id
              When Benson published → auto-link publication.remote_post_id
              When manual post     → Kellie tags or AI infers from caption
```

The new layer **does not replace** `post_metrics`. Instead:

- Benson-published videos sync **both** systems (publication metrics for pipeline SLA, catalog metrics for creator learning).
- `topic_performance` continues to receive rollup updates from the TikTok catalog module once tag dimensions exist.
- Demo mode continues to serve deterministic mock data for both paths.

---

## Phased Delivery

### Phase A — Manual import + dashboard (MVP)

**Outcome:** Kellie uploads TikTok Studio / Creator Center CSV (or a Benson-defined template) and sees a working analytics dashboard within Benson.

| Work | Detail |
|---|---|
| DB migration | `tiktok_accounts`, `tiktok_videos`, `tiktok_video_metrics`, `tiktok_video_tags`, `tiktok_import_batches` |
| Import API | `POST /api/analytics/tiktok/import` — validate, dedupe by `video_id`, merge metrics |
| Tagging UI | Bulk + per-video tag editor (category, location, hook, sponsor) |
| Dashboard | `/analytics/tiktok` — top videos, averages, patterns (see Dashboard section) |
| Demo mode | Seed ~30 mock videos with realistic KC content tags |
| Linking | Optional `content_item_id` column; manual search-and-link in video detail |

**No TikTok API calls required.** Kellie exports from TikTok app or Creator Center.

**Acceptance:** Kellie can answer "What hook style gets the most saves?" and "Which KC neighborhood over-indexes on engagement?" using imported data.

---

### Phase B — TikTok OAuth from Benson UI

**Outcome:** Kellie clicks **Connect TikTok** in Benson; tokens stored securely; connection status visible.

| Work | Detail |
|---|---|
| UI | Connect / Disconnect / Reconnect buttons on `/analytics/tiktok/settings` |
| OAuth flow | TikTok Login Kit authorization code → token exchange → store in `platform_credentials` (or parallel `tiktok_accounts` row referencing same target) |
| Scopes | Request **`video.list`** (Display API) in addition to existing posting scopes; document minimum scope set |
| Token rotation | Reuse `services/core/src/token-rotation` patterns (refresh before expiry, error surfacing in UI) |
| Webhook / callback | n8n or API route for OAuth redirect (see [n8n/README.md](./n8n/README.md)) |
| Account metadata | Store `open_id`, `@username`, display name, avatar URL, connected_at |

**Still no automated video sync** — connection proves identity and prepares Phase C.

**Acceptance:** Kellie connects once; Benson shows "Connected as @kellie" with token health indicator.

---

### Phase C — Display API video list ingestion

**Outcome:** Benson automatically pulls Kellie's video list and refreshes basic stats on a schedule.

| Work | Detail |
|---|---|
| Initial sync | `POST /v2/video/list/` — paginate cursor until exhausted |
| Stats refresh | `POST /v2/video/query/` — batch by `video_ids` (existing `fetchTikTokStats` pattern) |
| Worker | `tiktok-catalog-sync` cron (e.g. every 6h) + manual "Sync now" button |
| Dedup | Upsert on `platform + video_id`; preserve manual tags and CSV-only metrics |
| Merge rules | API overwrites API-sourced fields; never zero out manual-only fields unless user confirms |
| Link automation | Match `remote_post_id` from `publications` → set `content_item_id` |

**Metrics available in Phase C** — see [Field Provenance Matrix](#field-provenance-matrix).

**Acceptance:** New TikTok posts appear in dashboard within one sync cycle without CSV upload.

---

### Phase D — Advanced analytics (conditional)

**Outcome:** If TikTok Business / Research / Marketing API access is granted, ingest deeper metrics; otherwise document manual CSV as permanent fallback.

| Work | Detail |
|---|---|
| API discovery | Evaluate TikTok Marketing API, Creator Center exports, third-party analytics partners |
| Extended metrics | Saves, favorites, total watch time, avg watch duration, completion rate, traffic sources, audience demographics — **only if API returns them** |
| Feature flag | `ENABLE_TIKTOK_BUSINESS_ANALYTICS` — off by default until credentials verified |
| UI gating | Show advanced panels only when data exists; gray out with "Import from Studio CSV" CTA otherwise |

**Do not block Phases A–C on Phase D approval.**

---

## Field Provenance Matrix

Every column on `tiktok_videos` / `tiktok_video_metrics` carries a `source` enum: `api_display`, `api_business`, `csv_import`, `manual`, `derived`, `unavailable`.

### Identity & metadata

| Field | Display API (`video.list` / `video.query`) | Business / Studio API | CSV / manual import | Notes |
|---|---|---|---|---|
| `video_id` | ✅ `id` | ✅ | ✅ | Primary key with account |
| `caption` | ✅ `title` | ✅ | ✅ | TikTok API uses `title` for caption text |
| `post_url` | ✅ `share_url` | ✅ | ✅ | Constructible as `tiktok.com/@user/video/{id}` |
| `created_time` | ✅ `create_time` (Unix) | ✅ | ✅ | |
| `cover_image_url` | ✅ | ✅ | ⚠️ optional | Useful for dashboard thumbnails |
| `duration_seconds` | ✅ | ✅ | ⚠️ optional | |
| `is_benson_published` | — | — | ✅ derived | `content_item_id IS NOT NULL` |

### Engagement metrics (latest snapshot)

| Field | Display API | Business / Studio | CSV import | Notes |
|---|---|---|---|---|
| `views` | ✅ `view_count` | ✅ | ✅ | |
| `likes` | ✅ `like_count` | ✅ | ✅ | |
| `comments` | ✅ `comment_count` | ✅ | ✅ | |
| `shares` | ✅ `share_count` | ✅ | ✅ | |
| `saves` | ❌ **not in Display API** | ⚠️ app-dependent | ✅ Studio CSV often has | Existing code sets `saves: 0` — do not pretend otherwise |
| `reach` | ⚠️ sometimes `reach` | ⚠️ | ⚠️ | Treat as optional; fallback to views |
| `watch_time_seconds` | ❌ | ⚠️ | ✅ CSV | Total watch time |
| `avg_watch_duration_seconds` | ❌ | ⚠️ | ✅ CSV | |
| `completion_rate` | ❌ | ⚠️ | ✅ CSV | Percentage |
| `profile_views_from_video` | ❌ | ⚠️ | ⚠️ | Nice-to-have |
| `follows_from_video` | ❌ | ⚠️ | ⚠️ | Nice-to-have |

### Editorial tags (Benson-owned — never from TikTok API)

| Field | Source |
|---|---|
| `category_tags` | Manual, AI-assisted from caption, or linked `content_items.category` |
| `location_tags` | Manual, AI from caption/hashtags, or linked opportunity `location_clues` |
| `hook_tags` | Manual taxonomy (see below) or script metadata when Benson-published |
| `sponsor_tags` | Manual or linked opportunity `sponsorFlag` |
| `content_item_id` | Link to Benson opportunity / `content_items.id` |

### Derived metrics (computed in Benson)

| Field | Formula |
|---|---|
| `engagement_rate` | `(likes + comments + shares + saves) / views` — saves term omitted when null |
| `save_rate` | `saves / views` — only when saves known |
| `comment_rate` | `comments / views` |
| `share_rate` | `shares / views` |
| `hours_since_post` | `now - created_time` |
| `performance_index` | `views / account_median_views` — per-account normalization |
| `post_time_bucket` | Derived from `created_time` in America/Chicago |

---

## Data Model

### Entity diagram

```
tiktok_accounts
    │
    ├──< tiktok_videos
    │       │
    │       ├──< tiktok_video_metrics   (time series snapshots)
    │       ├──< tiktok_video_tags      (normalized tag rows, optional)
    │       └──> content_items          (nullable FK — Benson opportunity)
    │
    └──< tiktok_import_batches
            └──< tiktok_import_rows     (staging / error log)
```

### `tiktok_accounts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `publishing_target_id` | uuid FK → `publishing_targets` | Reuse existing TikTok target when present |
| `open_id` | text unique | TikTok user identifier |
| `username` | text | `@handle` without @ |
| `display_name` | text | |
| `avatar_url` | text | |
| `connection_status` | enum | `disconnected`, `connected`, `token_expired`, `sync_error` |
| `scopes` | text[] | Granted OAuth scopes |
| `last_sync_at` | timestamptz | |
| `last_sync_error` | text | |
| `created_at` / `updated_at` | timestamptz | |

Tokens remain in `platform_credentials` (existing table); this table holds **account identity and sync state**.

### `tiktok_videos`

One row per video per account. Latest metric values denormalized for fast dashboard queries; history in `tiktok_video_metrics`.

| Column | Type | Provenance |
|---|---|---|
| `id` | uuid PK | |
| `account_id` | uuid FK | |
| `video_id` | text | API / import — **unique with account_id** |
| `caption` | text | API / import |
| `post_url` | text | API / import |
| `cover_image_url` | text nullable | API |
| `duration_seconds` | integer nullable | API |
| `created_time` | timestamptz | API / import |
| `views` | bigint | API / import |
| `likes` | integer | API / import |
| `comments` | integer | API / import |
| `shares` | integer | API / import |
| `saves` | integer nullable | **null = unknown**, not zero |
| `reach` | integer nullable | |
| `watch_time_seconds` | bigint nullable | CSV / business API |
| `avg_watch_duration_seconds` | numeric nullable | CSV / business API |
| `completion_rate` | numeric nullable | CSV / business API |
| `engagement_rate` | numeric | derived |
| `category_tags` | text[] | Benson |
| `location_tags` | text[] | Benson |
| `hook_tags` | text[] | Benson |
| `sponsor_tags` | text[] | Benson |
| `content_item_id` | uuid FK nullable | Benson link |
| `metrics_source` | jsonb | Per-field source map for audit |
| `last_metrics_at` | timestamptz | |
| `import_batch_id` | uuid FK nullable | |
| `created_at` / `updated_at` | timestamptz | |

**Null vs zero:** Nullable metric columns use `NULL` for "not available." Dashboard copy: *"Saves not reported by TikTok API — import Studio CSV to unlock."*

### `tiktok_video_metrics`

Time-series snapshots (mirrors `post_metrics` pattern but for catalog videos).

| Column | Type |
|---|---|
| `id` | uuid PK |
| `video_id` | uuid FK → `tiktok_videos.id` |
| `fetched_at` | timestamptz |
| `hours_since_post` | integer |
| `views`, `likes`, `comments`, `shares`, `saves`, `reach`, `watch_time_seconds` | same as above |
| `engagement_rate` | numeric |
| `raw` | jsonb — full API response |

Snapshot schedule: 1h, 6h, 24h, 72h, 168h after post (reuse `SAMPLE_POINTS_HOURS` from existing analytics), then weekly for 90 days, then monthly.

### `tiktok_video_tags` (optional normalization)

If tag analytics need faceted search:

| Column | Type |
|---|---|
| `id` | uuid PK |
| `video_id` | uuid FK |
| `dimension` | enum: `category`, `location`, `hook`, `sponsor` |
| `value` | text |
| `source` | `manual`, `ai`, `opportunity_link` |

### `tiktok_import_batches` / `tiktok_import_rows`

| Batch column | Purpose |
|---|---|
| `filename`, `uploaded_by`, `status`, `row_count`, `error_count` | Audit trail |

Staging rows capture parse errors without polluting `tiktok_videos`.

### Hook tag taxonomy (starter set)

Controlled vocabulary for consistent rollups:

- `question` — opens with a question
- `controversy` — hot take / debate
- `listicle` — "3 things…", numbered
- `pov` — POV framing
- `storytime` — narrative arc
- `before_after` — transformation
- `urgency` — "this weekend only"
- `local_secret` — hidden gem framing
- `celebrity` — name-drop hook
- `sponsor_read` — explicit sponsorship opener

Kellie can add tags; Benson suggests via caption LLM pass on import.

### Category / location tags

Align with existing Benson vocabulary where possible:

- **Categories:** mirror `content_items` categories + shopping/retail flags from Phase 2N
- **Locations:** KC neighborhoods, venues, suburbs — reuse `location_clues` normalization from inventory

---

## API Surface (Benson)

All routes behind `ENABLE_TIKTOK_ANALYTICS` feature flag (new; default off until Phase A ships).

| Method | Route | Phase | Purpose |
|---|---|---|---|
| `GET` | `/api/analytics/tiktok/summary` | A | Dashboard aggregates |
| `GET` | `/api/analytics/tiktok/videos` | A | Paginated list + sort/filter |
| `GET` | `/api/analytics/tiktok/videos/:id` | A | Video detail + metric history |
| `PATCH` | `/api/analytics/tiktok/videos/:id` | A | Update tags, link opportunity |
| `POST` | `/api/analytics/tiktok/import` | A | CSV upload |
| `GET` | `/api/analytics/tiktok/import/template` | A | Download Benson CSV template |
| `GET` | `/api/analytics/tiktok/patterns` | A | Repeatable / underperforming patterns |
| `GET` | `/api/analytics/tiktok/oauth/start` | B | Redirect to TikTok authorize |
| `GET` | `/api/analytics/tiktok/oauth/callback` | B | Exchange code, store tokens |
| `DELETE` | `/api/analytics/tiktok/oauth` | B | Disconnect |
| `GET` | `/api/analytics/tiktok/account` | B | Connection status |
| `POST` | `/api/analytics/tiktok/sync` | C | Trigger manual sync |
| `GET` | `/api/analytics/tiktok/recommendations` | A+ | Planner-facing suggestions |

### CSV import format (Phase A template)

Minimum columns:

```csv
video_id,post_url,caption,created_time,views,likes,comments,shares,saves,watch_time_seconds,avg_watch_duration_seconds,completion_rate,category_tags,location_tags,hook_tags,sponsor_tags
```

- `category_tags` / `location_tags` / etc.: pipe-separated (`food|date-night`)
- `created_time`: ISO 8601 or `YYYY-MM-DD HH:mm` in America/Chicago
- Unknown metrics: leave blank (stored as NULL)

Import behavior:

1. Validate required columns (`video_id`, `created_time`, `views`).
2. Upsert on `(account_id, video_id)`.
3. Merge: CSV fills NULL manual fields; never overwrite newer API snapshot without `force=true` query param.
4. Return `{ imported, updated, skipped, errors[] }`.

---

## Dashboard Design

**Route:** `/analytics/tiktok`  
**Nav label:** TikTok Analytics (under Analytics or Editor section in dashboard)

### Page layout

```
┌──────────────────────────────────────────────────────────────────┐
│  TikTok Analytics          [Connect TikTok]  [Import CSV]  [Sync]│
│  @kellie · Last sync 2h ago · 847 videos                         │
├──────────────────────────────────────────────────────────────────┤
│  KPI strip: Total views (30d) | Avg engagement | Top category    │
├────────────────────────────┬─────────────────────────────────────┤
│  Top by views (table)      │  Top by engagement (table)        │
├────────────────────────────┴─────────────────────────────────────┤
│  Top by shares/saves (if data available — else upsell CSV import)│
├──────────────────────────────────────────────────────────────────┤
│  Performance by content pillar (bar chart)                       │
│  Performance by location · hook style · post time (heatmaps)     │
├──────────────────────────────────────────────────────────────────┤
│  ✅ Repeatable patterns          │  ⚠️ Underperforming patterns   │
├──────────────────────────────────────────────────────────────────┤
│  Recommendations for Benson ("Post more X on Thursday evenings") │
└──────────────────────────────────────────────────────────────────┘
```

### Dashboard panels (required)

| Panel | Query logic | Data requirement |
|---|---|---|
| **Top videos by views** | Sort `tiktok_videos.views DESC`, limit 20, filter date range | views (API or CSV) |
| **Top videos by engagement** | Sort by `engagement_rate DESC`, min views threshold (e.g. 500) | views + likes/comments/shares |
| **Top by shares** | Sort `shares DESC` | shares (API) |
| **Top by saves** | Sort `saves DESC` | **CSV or Phase D only** — show empty state otherwise |
| **Avg performance by category** | `GROUP BY unnest(category_tags)`, avg views & engagement | tags |
| **Avg performance by location** | Same for `location_tags` | tags |
| **Avg performance by hook style** | Same for `hook_tags` | tags |
| **Avg performance by post time** | Bucket `created_time` → weekday × hour (America/Chicago) | created_time |
| **Repeatable content patterns** | Combos where `performance_index > 1.5` AND count ≥ 3 | tags + derived index |
| **Underperforming patterns** | Combos where `performance_index < 0.6` AND count ≥ 3 | tags + derived index |

### Video detail view

**Route:** `/analytics/tiktok/videos/[videoId]`

- Thumbnail, caption, post URL (open in TikTok)
- Metric cards with source badges ("API", "CSV", "Unknown")
- Sparkline from `tiktok_video_metrics`
- Tag editor (category, location, hook, sponsor)
- **Link to Benson opportunity** — search `content_items`, set `content_item_id`
- If linked: show opportunity title, source, editorial flags

### Connect TikTok (Phase B)

```
┌─────────────────────────────────────┐
│  Connect your TikTok account        │
│                                     │
│  Benson will read your public       │
│  video list and performance stats   │
│  to improve content recommendations.│
│                                     │
│  [ Connect with TikTok ]            │
│                                     │
│  Or import a CSV export instead →   │
└─────────────────────────────────────┘
```

OAuth scopes (minimum for Phase C):

- `user.info.basic` — username, avatar
- `video.list` — enumerate videos
- (existing posting scopes remain on publishing target)

### Manual CSV fallback

Always visible — even after OAuth. TikTok Studio exports remain the only path for saves, watch time, and completion until Phase D.

---

## Pattern Detection & Recommendation Engine

### Repeatable patterns (winners)

Detect tag combinations that consistently beat account baseline:

```
FOR each combination of (category, hook) with count >= 3:
  performance_index = median(views) / account_median_views
  IF performance_index >= 1.5 AND median(engagement_rate) >= p75:
    EMIT pattern { type: 'winner', tags, sample_videos[], lift }
```

Also surface:

- Best post-time window per category
- Location × hook pairs that over-index
- Sponsor content vs organic baseline (only when `sponsor_tags` populated)

### Underperforming patterns

Same logic with `performance_index <= 0.6`. Flag for Kellie's review — not auto-suppressed.

### Recommendations output

`GET /api/analytics/tiktok/recommendations` returns structured objects consumed by:

1. **Dashboard panel** — human-readable cards
2. **Planner bias** — extends `topic_performance` with hook/location dimensions
3. **Editor / Command Center** — "Suggested hook: `local_secret` for Westport dining"

Example recommendation:

```json
{
  "type": "hook_timing",
  "confidence": 0.82,
  "message": "Videos tagged hook:local_secret + location:Westport posted Thursday 6–8pm average 2.1× your typical views.",
  "evidence": { "sample_size": 7, "performance_index": 2.1 },
  "action": "Consider a Westport hidden-gem post this Thursday evening."
}
```

### Confidence rules

| Sample size | Confidence cap |
|---|---|
| n = 1–2 | Do not emit |
| n = 3–5 | max 0.6 |
| n = 6–10 | max 0.8 |
| n > 10 | max 0.95 |

Require minimum 30-day recency unless explicitly querying all-time.

---

## Workers & Sync

| Worker | Schedule | Phase | Action |
|---|---|---|---|
| `tiktok-catalog-sync` | Every 6h | C | `video.list` → upsert videos → `video.query` → snapshot metrics |
| `tiktok-token-rotation` | Existing 1h cron | B | Reuse token-rotation for analytics credentials |
| `tiktok-pattern-rollup` | Daily | A | Recompute pattern tables / materialized views |
| `tiktok-tag-suggest` | On import | A | Optional LLM pass: caption → suggested hook/location tags |

Sync failure handling:

- Set `tiktok_accounts.connection_status = sync_error`
- Surface in dashboard banner with last error message
- CSV import remains fully functional (degraded mode)

---

## UI Components (dashboard)

| Component | Location |
|---|---|
| `TikTokAnalyticsPage` | `dashboard/app/analytics/tiktok/page.tsx` |
| `TikTokConnectButton` | settings + dashboard header |
| `TikTokCsvImportDialog` | dashboard header |
| `TikTokVideoTable` | sortable columns, source badges |
| `TikTokPerformanceCharts` | pillar / location / hook / time heatmaps |
| `TikTokPatternCards` | winners + underperformers |
| `TikTokRecommendations` | actionable suggestions |
| `TikTokVideoDetail` | `dashboard/app/analytics/tiktok/videos/[id]/page.tsx` |
| `LinkOpportunityModal` | search content_items |

Follow existing dashboard patterns from `/review/inventory` and `/editor` (server components + client panels, feature-flag gating).

---

## Security & Privacy

- OAuth tokens stored only in `platform_credentials` — never sent to client
- Analytics API routes server-side only (`server-only` fetch helpers)
- CSV uploads: max 10 MB, virus-scan optional, stored in ephemeral staging table then deleted
- Kellie-only UI — no public sharing of analytics
- `raw` jsonb retains API responses for debugging; exclude from client payloads by default

---

## Feature Flags

| Flag | Default | Phase |
|---|---|---|
| `ENABLE_TIKTOK_ANALYTICS` | `false` | A — master gate |
| `ENABLE_TIKTOK_ANALYTICS_UI` | `false` | A — dashboard routes |
| `ENABLE_TIKTOK_OAUTH_UI` | `false` | B |
| `ENABLE_TIKTOK_CATALOG_SYNC` | `false` | C |
| `ENABLE_TIKTOK_BUSINESS_ANALYTICS` | `false` | D |

Demo mode (`DEMO_MODE=true`): serve mock catalog (30 videos, KC-themed tags) without API keys.

---

## Migration Plan

| Migration | Contents |
|---|---|
| `24_tiktok_analytics.sql` | All tables, indexes, enums |
| Indexes | `(account_id, video_id)` unique, `(account_id, created_time DESC)`, GIN on tag arrays |
| Seed script | `scripts/seed-tiktok-analytics-demo.ts` for demo mode |

No changes to existing `publications` / `post_metrics` schema in Phase A.

---

## Testing Strategy

| Layer | Tests |
|---|---|
| CSV parser | Column mapping, timezone parsing, merge rules, error rows |
| API merge | API snapshot does not clobber CSV saves |
| Pattern engine | Deterministic fixtures with known medians |
| OAuth | Mock token exchange; rotation refresh |
| Dashboard | Snapshot tests for empty saves state vs populated |

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| TikTok Display API lacks saves / watch time | Phase A CSV; honest NULL handling; UI empty states |
| `video.list` pagination / rate limits | Cursor cache, exponential backoff, manual sync throttle |
| Tag sparse early on | AI suggest on import; prompt Kellie in video detail; link Benson opportunities |
| Duplicate videos (ID format changes) | Upsert on `video_id`; secondary match on `post_url` |
| App audit required for production OAuth | Phase A CSV unblocks; sandbox testing for B–C |
| Confusion with existing `post_metrics` | Separate tables, clear UI labeling "Full catalog" vs "Benson posts" |

---

## Success Metrics

| Metric | Target (90 days post Phase A) |
|---|---|
| Catalog coverage | ≥ 80% of Kellie's last 90-day videos imported or synced |
| Tag coverage | ≥ 70% of top-50 videos have hook + category tags |
| Dashboard usage | Kellie checks analytics ≥ 1×/week |
| Planner impact | Measurable lift in engagement on posts using recommended hook/time |
| Time to insight | < 5 min from CSV upload to first pattern card |

---

## Implementation Order (when approved)

1. Migration + core types + CSV import API (Phase A backend)
2. Dashboard MVP panels (Phase A UI)
3. Pattern rollup + recommendations (Phase A engine)
4. OAuth UI + callback (Phase B)
5. Catalog sync worker (Phase C)
6. Business API spike behind flag (Phase D)
7. Planner / Command Center integration hooks

---

## Appendix: Existing Code Touchpoints

| File | Relevance |
|---|---|
| `services/core/src/analytics/index.ts` | `fetchTikTokStats()` — Display API query; extend, do not duplicate |
| `services/core/src/token-rotation/index.ts` | TikTok refresh token rotation |
| `services/core/src/providers/tiktok.ts` | Content Posting API — separate from analytics |
| `services/core/src/schema.ts` | `platform_credentials`, `publications`, `post_metrics`, `topic_performance` |
| `services/workers/src/workflows/analytics-ingest.ts` | Existing publication metrics worker |
| `dashboard/lib/opportunities-ui.ts` | Nav link pattern for new analytics route |

---

*Document only. No application code was modified.*
