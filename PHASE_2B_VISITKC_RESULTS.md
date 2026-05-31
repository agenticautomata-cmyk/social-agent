# Phase 2B — Visit KC RSS Results

**Date:** 2026-05-31  
**Status:** Complete — Visit KC RSS ingested alongside Reddit  
**Scope:** Visit KC source provider only; Reddit ingestion unchanged  
**Out of scope (as requested):** OAuth, scoring, LLM ranking, venue sources

---

## Summary

Phase 2B adds **Visit KC news releases via RSS** (`https://news.visitkc.com/rss.xml`) as a second high-value KC source. Twenty live items were ingested with title, URL, publication date, and location clues. Both Reddit and Visit KC opportunities display together on the Benson opportunities page. Reddit provider and ingest logic were not modified.

---

## What Changed

### New provider (`services/core/src/providers/visitkc.ts`)

- Fetches RSS 2.0 feed from `https://news.visitkc.com/rss.xml`
- Parses `<item>` blocks for title, link, pubDate, content, contentType
- Extracts location clues via shared `extractLocationClues()` helper (import only — no Reddit logic changes)
- Dedup key: URL path slug as `source_external_id`

**Stored per item (`content_items` + `metadata.visitkc`):**

| Field | Storage |
|---|---|
| URL | `source_url`, `metadata.visitkc.url` |
| Title | `topic` |
| Publication date | `metadata.visitkc.publishedAt` |
| Location clues | `location_name`, `metadata.visitkc.locationClues` |
| Content type | `metadata.visitkc.contentType`, `metadata.opportunityCategory` |

`metadata.ingest` is `visitkc_rss`. Hook is `Visit KC`.

### Database

| File | Purpose |
|---|---|
| `db/migrations/07_visitkc_source_type.sql` | `ALTER TYPE source_type ADD VALUE 'visitkc'` |
| `db/init/07_visitkc_source_type.sql` | Same for Docker init |
| `services/core/src/schema.ts` | `'visitkc'` added to `sourceTypeEnum` |

### Scanner (`services/core/src/scanner/index.ts`)

- Added `insertVisitKcOpportunity`, `scanVisitKcSource`
- `scanSourceByType()` routes `reddit` → existing Reddit path, `visitkc` → new path
- `scanAllActiveSources()` scans both active `reddit` and `visitkc` sources
- **Reddit functions unchanged**

### Seed (`services/core/src/scripts/seed.ts`)

New source row:

```json
{
  "type": "visitkc",
  "name": "Visit KC RSS",
  "config": { "feedUrl": "https://news.visitkc.com/rss.xml", "limit": 50 },
  "pollIntervalCron": "0 */6 * * *"
}
```

### API

| Route | Change |
|---|---|
| `GET /api/content` | Added `ingested=true` query param (alias for `reddit=true` — filters `source_id IS NOT NULL`) |
| `GET /api/content` | Returns `sourceName`, `sourceType` via sources join |
| `GET /api/opportunities` | Same `ingested` param + source fields |

### Dashboard

| File | Change |
|---|---|
| `dashboard/lib/opportunities-ui.ts` | Query uses `ingested=true`; Visit KC + Reddit labels; subtitle updated |
| `dashboard/app/opportunities/page.tsx` | Source column shows Visit KC / Reddit; link labels `visit kc` / `reddit` |

### Ops scripts

| Script | Purpose |
|---|---|
| `pnpm migrate:visitkc` | Apply enum migration |
| `pnpm seed` | Upsert Visit KC source |
| `POST /api/scanner/run` | Scan all active reddit + visitkc sources |

---

## Verification Results

### 1. Migration

```bash
pnpm migrate:visitkc
```

| Check | Result |
|---|---|
| `source_type` enum includes `visitkc` | ✅ |

### 2. Seed

```bash
pnpm seed
```

| Check | Result |
|---|---|
| Visit KC source created | ✅ `Visit KC RSS` |
| Reddit source unchanged | ✅ config still RSS |

### 3. Live scan

```bash
curl -X POST http://localhost:4000/api/scanner/run
```

**First scan (fresh Visit KC source):**

| Source | itemsFound | itemsCreated | itemsSkipped |
|---|---|---|---|
| Reddit (r/kansascity) | 50 | 0 | 50 |
| Visit KC RSS | 20 | 20 | 0 |

**Second scan (dedup check):**

| Source | itemsFound | itemsCreated | itemsSkipped |
|---|---|---|---|
| Reddit | 50 | 0 | 50 |
| Visit KC | 20 | 0 | 20 |

### 4. Database / API

```bash
curl 'http://localhost:4000/api/content?ingested=true&limit=200'
```

| Check | Result |
|---|---|
| Total ingested rows | **70** (50 Reddit + 20 Visit KC) |
| Visit KC `metadata.ingest = visitkc_rss` | **20** |
| Reddit rows unchanged | **50** (`reddit_rss`) |
| `sourceType = visitkc` on Visit KC rows | ✅ |

Sample Visit KC row (abbreviated):

```json
{
  "topic": "BBC: Kansas City Named Among 25 Best Places to Travel in 2025",
  "sourceUrl": "https://www.bbc.com/travel/article/20250115-the-25-best-places-to-travel-in-2025",
  "sourceName": "Visit KC RSS",
  "sourceType": "visitkc",
  "metadata": {
    "ingest": "visitkc_rss",
    "opportunityCategory": "news",
    "visitkc": {
      "url": "https://www.bbc.com/travel/article/20250115-the-25-best-places-to-travel-in-2025",
      "publishedAt": "2025-01-17T15:14:00.000Z",
      "locationClues": ["kansas city"],
      "contentType": "news"
    }
  }
}
```

### 5. Opportunities UI

`http://localhost:3000/opportunities`

| Check | Result |
|---|---|
| HTTP status | ✅ 200 |
| Reddit rows visible | ✅ 50 |
| Visit KC rows visible | ✅ 20 |
| Source column | ✅ `visit kc rss` / `r/kansascity rss` |
| Subtitle | ✅ `visit kc + reddit rss — no scoring yet` |

### 6. Reddit unchanged

| Check | Result |
|---|---|
| `services/core/src/providers/reddit.ts` modified | ❌ not touched |
| Reddit ingest count | ✅ still 50 |
| Reddit dedup on re-scan | ✅ 50 skipped |

### 7. Benson unchanged

| Check | Result |
|---|---|
| Typecheck (`pnpm typecheck`) | ✅ all packages pass |
| Existing API routes | ✅ unchanged behavior with `reddit=true` |

---

## Manual Retest

```bash
pnpm migrate:visitkc
pnpm seed
curl -X POST http://localhost:4000/api/scanner/run
curl 'http://localhost:4000/api/content?ingested=true&limit=10'
open http://localhost:3000/opportunities
```

---

## Known Limitations

| Limitation | Notes |
|---|---|
| Feed size | Visit KC RSS returns ~20 items per fetch |
| External links | Many items link to third-party press (BBC, etc.) — expected for tourism PR |
| No scoring | All items land in `planned` state; ranking deferred to later phase |
| Location clues | Keyword extraction only; venue-specific parsing not yet implemented |

---

## Files Changed

```
services/core/src/providers/visitkc.ts           — new Visit KC RSS provider
services/core/src/providers/index.ts           — export visitkc
services/core/src/scanner/index.ts             — visitkc scan path (reddit untouched)
services/core/src/schema.ts                    — visitkc enum value
services/core/src/scripts/seed.ts              — Visit KC source seed
services/core/src/scripts/migrate-visitkc.ts   — migration runner (new)
services/core/package.json                     — migrate:visitkc script
db/migrations/07_visitkc_source_type.sql       — enum migration (new)
db/init/07_visitkc_source_type.sql             — init script (new)
services/api/src/routes/content.ts             — ingested query param
services/api/src/routes/opportunities.ts       — ingested query param
dashboard/lib/opportunities-ui.ts              — combined source display
dashboard/app/opportunities/page.tsx           — source columns for both feeds
package.json                                   — migrate:visitkc script
```

**Not modified:** `services/core/src/providers/reddit.ts`

---

**Phase 2B Visit KC complete.** Visit KC RSS ingests alongside Reddit and displays on the opportunities page. No commit created — awaiting approval.
