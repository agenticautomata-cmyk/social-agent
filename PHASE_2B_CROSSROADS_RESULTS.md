# Phase 2B — Crossroads RSS Results

**Date:** 2026-05-31  
**Status:** Complete — Crossroads RSS pipeline wired; live feed currently empty  
**Scope:** Crossroads Arts District RSS only  
**Out of scope (as requested):** Reddit/Visit KC changes, Google Maps, Eventbrite, World Cup feeds, LLM scoring

---

## Summary

Phase 2B adds **Crossroads Arts District RSS** (`https://kccrossroads.org/feed/`) as a third KC source with `source_type = crossroads`. The provider, scanner, seed, migration, API, and dashboard are fully wired. Reddit and Visit KC ingestion were **not modified**.

At verification time the live Crossroads RSS feed returned **zero `<item>` elements** (WordPress site has pages but no published posts in the feed). The scanner completes successfully; rows will ingest automatically when Crossroads publishes to RSS. Parser behavior was validated against a representative WordPress RSS item.

---

## What Changed

### New provider (`services/core/src/providers/crossroads.ts`)

- Fetches RSS 2.0 from `https://kccrossroads.org/feed/`
- Parses WordPress fields: `<title>`, `<link>`, `<pubDate>`, `<category>`, `content:encoded`, `<description>`
- Extracts title, URL, publication date, content type, location clues
- Default neighborhood: **crossroads** prepended to location clues
- Content type from first `<category>` or URL path inference (`/events/`, `/crossroads-events/`)

**Stored per item (`content_items` + `metadata.crossroads`):**

| Field | Storage |
|---|---|
| URL | `source_url`, `metadata.crossroads.url` |
| Title | `topic` |
| Publication date | `metadata.crossroads.publishedAt` |
| Content type | `metadata.crossroads.contentType`, `metadata.opportunityCategory` |
| Categories | `metadata.crossroads.categories` |
| Location clues | `location_name`, `metadata.crossroads.locationClues` |

`metadata.ingest` is `crossroads_rss`. Hook is `Crossroads`.

### Deduplication

| Layer | Key | Scope |
|---|---|---|
| Per-source | `(source_id, source_external_id)` | Same as Reddit/Visit KC |
| Cross-source | `source_url` match | **Crossroads only** — skips if URL already ingested from Reddit or Visit KC |

Reddit and Visit KC insert paths were not changed.

### Database

| File | Purpose |
|---|---|
| `db/migrations/08_crossroads_source_type.sql` | `ALTER TYPE source_type ADD VALUE 'crossroads'` |
| `db/init/08_crossroads_source_type.sql` | Same for Docker init |
| `services/core/src/schema.ts` | `'crossroads'` added to `sourceTypeEnum` |

### Scanner (`services/core/src/scanner/index.ts`)

- Added `insertCrossroadsOpportunity`, `scanCrossroadsSource`
- `scanSourceByType()` routes `crossroads` → new path
- `scanAllActiveSources()` scans `reddit`, `visitkc`, and `crossroads`
- **Reddit and Visit KC functions unchanged**

### Seed (`services/core/src/scripts/seed.ts`)

```json
{
  "type": "crossroads",
  "name": "Crossroads RSS",
  "config": { "feedUrl": "https://kccrossroads.org/feed/", "limit": 50 },
  "pollIntervalCron": "0 */6 * * *"
}
```

### Dashboard (`dashboard/lib/opportunities-ui.ts`)

- Subtitle: `crossroads + visit kc + reddit rss`
- Source labels: `Crossroads RSS` / `Crossroads`
- Link label: `crossroads`
- Published date and location from `metadata.crossroads`

### Ops scripts

| Script | Purpose |
|---|---|
| `pnpm migrate:crossroads` | Apply enum migration |
| `pnpm seed` | Upsert Crossroads source |
| `POST /api/scanner/run` | Scan all active reddit + visitkc + crossroads sources |

---

## Verification Results

### 1. Migration

```bash
pnpm migrate:crossroads
```

| Check | Result |
|---|---|
| `source_type` enum includes `crossroads` | ✅ |

### 2. Seed

```bash
pnpm seed
```

| Check | Result |
|---|---|
| Crossroads source created | ✅ `Crossroads RSS` (`5342c995-f259-42a8-8e5c-81b5f992cbf0`) |
| Reddit source unchanged | ✅ |
| Visit KC source unchanged | ✅ |

### 3. Typecheck

```bash
pnpm typecheck
```

| Check | Result |
|---|---|
| All packages pass | ✅ |

### 4. Provider parser (sample WordPress RSS item)

Validated `normalizeCrossroadsItem()` with representative event:

```json
{
  "externalId": "crossroads-events/crossroads-night-market-2026-5",
  "title": "Crossroads Night Market Returns May 2026",
  "url": "https://kccrossroads.org/crossroads-events/crossroads-night-market-2026-5/",
  "publishedAt": "2026-05-30T19:22:01.000Z",
  "contentType": "events",
  "categories": ["Events", "First Friday"],
  "locationClues": ["crossroads"],
  "locationHint": "crossroads"
}
```

### 5. Live RSS fetch

```bash
# Provider fetch against https://kccrossroads.org/feed/
```

| Check | Result |
|---|---|
| HTTP status | ✅ 200 |
| Valid RSS 2.0 | ✅ |
| `<item>` count | **0** (empty channel — no published WordPress posts at verification time) |

**Note:** WordPress REST API also returns `[]` for posts. The site has static pages (e.g. Night Market page) but they are not syndicated via the main post RSS feed.

### 6. Live scan

```bash
curl -X POST http://localhost:4000/api/scanner/run
```

**First scan (Crossroads source newly seeded):**

| Source | itemsFound | itemsCreated | itemsSkipped | Status |
|---|---|---|---|---|
| Visit KC RSS | 20 | 0 | 20 | success |
| r/kansascity | 50 | 0 | 50 | success |
| **Crossroads RSS** | **0** | **0** | **0** | **success** |

**Second scan (dedup re-run):**

| Source | itemsFound | itemsCreated | itemsSkipped |
|---|---|---|---|
| Visit KC | 20 | 0 | 20 |
| Reddit | 50 | 0 | 50 |
| Crossroads | 0 | 0 | 0 |

Crossroads dedup path is ready; re-scan is idempotent. When items appear in the feed, per-source and cross-source URL dedup will apply on subsequent scans.

### 7. Database / API

```bash
curl 'http://localhost:4000/api/content?ingested=true&limit=200'
```

| Check | Result |
|---|---|
| Reddit rows | 52 |
| Visit KC rows | 20 |
| Crossroads rows | 0 (empty live feed) |
| Total ingested | 72 |
| API includes `sourceType` | ✅ |

```bash
curl 'http://localhost:4000/api/opportunities?ingested=true&limit=5'
```

| Check | Result |
|---|---|
| Mapped opportunity rows returned | ✅ |
| `sourceName` / `sourceType` present | ✅ |

### 8. Opportunities UI

`http://localhost:3000/opportunities`

| Check | Result |
|---|---|
| HTTP status | ✅ 200 |
| Subtitle mentions crossroads | ✅ |
| Crossroads label mapping in code | ✅ (no Crossroads rows yet — feed empty) |

### 9. Unchanged sources

| Check | Result |
|---|---|
| `services/core/src/providers/reddit.ts` modified | ❌ not touched |
| `services/core/src/providers/visitkc.ts` modified | ❌ not touched |
| Reddit ingest count stable | ✅ |
| Visit KC ingest count stable | ✅ 20 |

---

## Live Feed Empty — Impact

The Crossroads RSS URL is valid and returns HTTP 200, but the channel contains **no items**. This is a **source-side condition**, not a pipeline failure:

- Scanner runs to `success` with `itemsFound: 0`
- When Crossroads publishes WordPress posts to `/feed/`, the next scan will create rows
- Event pages (e.g. Night Market) exist as static pages but are not in the post RSS feed today

**Recommended follow-up (future phase, not implemented here):** supplement RSS with Crossroads events page scrape or a dedicated events feed if the site adds one.

---

## Manual Retest

```bash
pnpm migrate:crossroads
pnpm seed
curl -X POST http://localhost:4000/api/scanner/run
curl 'http://localhost:4000/api/content?ingested=true&limit=200'
open http://localhost:3000/opportunities
```

When the feed has items, expect:

```json
{
  "sourceType": "crossroads",
  "sourceName": "Crossroads RSS",
  "metadata": {
    "ingest": "crossroads_rss",
    "opportunityCategory": "events",
    "crossroads": {
      "url": "https://kccrossroads.org/...",
      "publishedAt": "2026-05-30T19:22:01.000Z",
      "locationClues": ["crossroads"],
      "contentType": "events",
      "categories": ["Events"]
    }
  }
}
```

---

## Files Changed

```
services/core/src/providers/crossroads.ts           — new Crossroads RSS provider
services/core/src/providers/index.ts              — export crossroads
services/core/src/scanner/index.ts                — crossroads scan path (reddit/visitkc untouched)
services/core/src/schema.ts                       — crossroads enum value
services/core/src/scripts/seed.ts                 — Crossroads source seed
services/core/src/scripts/migrate-crossroads.ts   — migration runner (new)
services/core/package.json                        — migrate:crossroads script
db/migrations/08_crossroads_source_type.sql       — enum migration (new)
db/init/08_crossroads_source_type.sql             — init script (new)
dashboard/lib/opportunities-ui.ts                 — Crossroads source display
package.json                                      — migrate:crossroads script
```

**Not modified:** `services/core/src/providers/reddit.ts`, `services/core/src/providers/visitkc.ts`

---

**Phase 2B Crossroads complete.** Pipeline verified end-to-end; live feed empty at verification time. No commit created — awaiting approval.
