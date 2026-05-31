# Inventory Review UI — Results

**Date:** 2026-05-31  
**Route:** `/review/inventory`  
**Mode:** DEMO_MODE (unchanged)

## Summary

Built an internal inventory review dashboard to browse and judge Benson's current opportunity database. No new sources, ingestion providers, scoring, ranking, or Share Intake changes were made.

## What Was Added

### Backend (`@social-agent/core/inventory`)

| File | Purpose |
|------|---------|
| `services/core/src/inventory/normalize.ts` | Normalizes `content_items` → inventory rows with flags, badges, audience score, “why it matters”, stats, presets, filter, search, sort |
| `services/core/src/inventory/index.ts` | Re-exports |
| `services/core/package.json` | Added `"./inventory"` export |

### API (`/api/inventory`)

| Route | Purpose |
|-------|---------|
| `GET /api/inventory/stats` | Summary stats only |
| `GET /api/inventory` | Filtered/sorted list + stats + filter options |
| `GET /api/inventory/:id` | Detail with raw content item |

Registered in `services/api/src/server.ts` when `ENABLE_OPPORTUNITIES_API=true`.

### Dashboard

| File | Purpose |
|------|---------|
| `dashboard/app/review/inventory/page.tsx` | Page shell (gated by `ENABLE_OPPORTUNITIES_UI`) |
| `dashboard/app/review/inventory/inventory-review-panel.tsx` | Client UI: stats, presets, filters, search, sort, table, detail drawer |
| `dashboard/lib/inventory-types.ts` | Shared types and preset/sort/flag constants |
| `dashboard/lib/opportunities-ui.ts` | Nav link: `[inventory review]` |

## Live Data Snapshot (2026-05-31)

| Metric | Value |
|--------|-------|
| Total ingested opportunities | **412** |
| Unique sources | 41 |
| Unique categories | 37 |
| Pillar/flag buckets | 11 |
| Review states | 1 (`planned`) |
| Newest item | 2026-05-31T16:12:23.585Z |
| Oldest item | 2026-05-31T06:13:13.394Z |

### Top sources

| Source | Count |
|--------|-------|
| r/kansascity | 73 |
| KC Parks Events | 50 |
| The Pitch KC Openings | 36 |
| KC Library Events | 29 |
| EstateSales.net Kansas City | 23 |

### Top pillars / flags

| Pillar | Count |
|--------|-------|
| sponsor friendly | 164 |
| free event | 83 |
| reddit | 73 |
| business opening | 55 |
| dining | 53 |
| estate sale | 40 |
| sports | 30 |
| celebrity/charity | 25 |

## Features Delivered

1. **Summary stats** — total, by source, category, pillar/flags, state, newest/oldest dates
2. **Filters** — source, category, state, date range, neighborhood, individual flags
3. **Search** — title, summary, business, venue, neighborhood, source URL (server-side)
4. **Sorting** — newest, oldest, source, category, title, sponsor-first, audience-first
5. **Table view** — title, source, category, date, venue, neighborhood, badges, link, state
6. **Detail drawer** — full title, summary, source URL, raw metadata, flags, dates, venue, “why it matters”, notes placeholder
7. **Preset views** — Sponsor Friendly, Luxury/Date Night, Dining/Openings, Estate Sales, Free Things, Celebrity/Charity, World Cup/Visitors, Reddit Only, Hide Reddit Noise
8. **Demo mode banner** — “Demo mode: review UI only. Data may be local/dev.”

## Verification Checklist

| Check | Result |
|-------|--------|
| `/review/inventory` loads (HTTP 200) | ✅ |
| `/opportunities` still works (HTTP 200) | ✅ |
| `/intake` still works (HTTP 200) | ✅ |
| `GET /api/inventory` returns 412 items | ✅ |
| Preset `sponsor_friendly` → 164 items | ✅ |
| Preset `reddit_only` → 73 items | ✅ |
| Preset `hide_reddit` → 339 items | ✅ |
| Search `restaurant` → 66 items | ✅ |
| Flag `freeEvent` → 83 items | ✅ |
| Sort `audience_first` works | ✅ |
| Detail `GET /api/inventory/:id` works | ✅ |
| `pnpm typecheck` passes (core, api, dashboard, workers) | ✅ |
| No new sources added | ✅ |
| No ingestion provider changes | ✅ |
| No scoring/ranking changes | ✅ |
| Share Intake unchanged | ✅ |
| DEMO_MODE preserved | ✅ |

## Intentionally Not Changed

- Ingestion providers and scanner
- Scoring and ranking logic
- Share Intake backend and `/intake` UI
- `/opportunities` page behavior
- Final polished public UI (deferred)

## Usage

1. Ensure stack is running with opportunities flags:
   - `ENABLE_OPPORTUNITIES_API=true`
   - `ENABLE_OPPORTUNITIES_UI=true`
   - `DEMO_MODE=true`
2. Open dashboard → **inventory review** or navigate to `/review/inventory`
3. Use presets and filters to slice the database; click any row for detail drawer

## Notes

- Flag/pillar detection is heuristic over existing metadata — review UI only, not production scoring.
- Stats panel reflects the full unfiltered ingested set; table count reflects active filters/presets.
- Notes field in detail drawer is a read-only placeholder for future editorial workflow.
