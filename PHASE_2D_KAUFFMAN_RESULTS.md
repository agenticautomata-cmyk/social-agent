# Phase 2D — Kauffman Center Events Results

**Date:** 2026-05-31  
**Status:** Complete — live Kauffman performances ingested via TNEW JSON API  
**Scope:** Kauffman Center events only  
**Out of scope (as requested):** Reddit/Visit KC/Crossroads/Union Station changes, scoring, LLM ranking, Google Maps, Eventbrite

---

## Summary

Phase 2D adds **Kauffman Center for the Performing Arts** as a fifth KC source (`source_type = kauffman`). After evaluating RSS, ICS, and WordPress APIs, the implementation uses the **Tessitura TNEW JSON endpoint** at `https://tickets.kauffmancenter.org/api/products/productionseasons` (POST). **16 live productions** were ingested on first scan with titles, ticket URLs, venues, and performance dates. All existing sources remain operational.

---

## Source Evaluation

| Source | URL / Method | Format | Status | Verdict |
|---|---|---|---|---|
| Events RSS | `/events/feed/` | RSS 2.0 | HTTP 200, **0 items** (comments feed) | Empty |
| Main site RSS | `/feed/` | RSS 2.0 | 12 news posts | Wrong content type |
| Tribe Events REST | `/wp-json/tribe/events/v1/events` | JSON | 404 | Not available |
| ICS export | `?ical=1` | iCalendar | Returns HTML | Not available |
| Events page HTML | `/events/` | HTML | 26 server-rendered cards | Structured but scrape-only |
| **TNEW productionseasons** | **`/api/products/productionseasons`** | **JSON (POST)** | **HTTP 200, 16 productions** | **Selected** |

### Why TNEW JSON API

- Powers Kauffman's official ticketing site (`tickets.kauffmancenter.org`)
- Returns structured production objects with performance dates, venues, and ticket URLs
- Single POST request for a date range (no HTML scraping)
- Same data source as the public events calendar

**Request:**

```http
POST https://tickets.kauffmancenter.org/api/products/productionseasons
Content-Type: application/json

{"startDate":"2026-05-31","endDate":"2026-08-29"}
```

**Response fields used:** `productionSeasonId`, `productionTitle`, `description`, `performances[]`, `productionSeasonActionUrl`

---

## What Changed

### New provider (`services/core/src/providers/kauffman.ts`)

- POSTs to TNEW `productionseasons` API with configurable `horizonDays` (default 90)
- One opportunity row per production (deduped by `productionSeasonId`)
- Extracts title (HTML stripped), ticket overview URL, venue, next performance date/time
- Default location clues: `kauffman center` + venue name

**Stored per item (`content_items` + `metadata.kauffman`):**

| Field | Storage |
|---|---|
| URL | `source_url` → `https://tickets.kauffmancenter.org/overview/{id}` |
| Title | `topic` |
| Publication date | `metadata.kauffman.publishedAt` (next performance start) |
| Event times | `event_starts_at`, `metadata.kauffman.eventStartsAt` |
| Venue | `location_name`, `metadata.kauffman.venue` |
| Content type | `performance` |
| Location clues | `metadata.kauffman.locationClues` |
| Production ID | `source_external_id`, `metadata.kauffman.productionSeasonId` |

`metadata.ingest` is `kauffman_event_api`. Hook is `Kauffman Center`.

### Deduplication

| Layer | Key |
|---|---|
| Per-source | `(source_id, productionSeasonId)` |
| Cross-source | `source_url` match |

Prior source insert paths were **not modified**.

### Database

| File | Purpose |
|---|---|
| `db/migrations/10_kauffman_source_type.sql` | `ALTER TYPE source_type ADD VALUE 'kauffman'` |
| `db/init/10_kauffman_source_type.sql` | Docker init |
| `services/core/src/schema.ts` | `'kauffman'` in `sourceTypeEnum` |

### Scanner (`services/core/src/scanner/index.ts`)

- Added `insertKauffmanOpportunity`, `scanKauffmanSource`
- `scanAllActiveSources()` includes `kauffman`
- **Reddit, Visit KC, Crossroads, Union Station functions unchanged**

### Seed

```json
{
  "type": "kauffman",
  "name": "Kauffman Center Events",
  "config": {
    "apiUrl": "https://tickets.kauffmancenter.org/api/products/productionseasons",
    "horizonDays": 90,
    "limit": 50
  }
}
```

### Dashboard

- Subtitle includes kauffman
- Source labels: `Kauffman Center Events` / `Kauffman Center`
- Link label: `kauffman`

---

## Verification Results

### 1. Migration

```bash
pnpm migrate:kauffman
```

| Check | Result |
|---|---|
| `source_type` enum includes `kauffman` | ✅ |

### 2. Seed

```bash
pnpm seed
```

| Check | Result |
|---|---|
| Kauffman source created | ✅ `Kauffman Center Events` (`8375c731-7087-4ff4-882c-a3d664fd3a22`) |
| Prior sources unchanged | ✅ |

### 3. Typecheck

```bash
pnpm typecheck
```

| Check | Result |
|---|---|
| All packages pass | ✅ |

### 4. Live scan

```bash
curl -X POST http://localhost:4000/api/scanner/run
```

**First scan:**

| Source | itemsFound | itemsCreated | itemsSkipped | Status |
|---|---|---|---|---|
| Union Station | 4 | 0 | 4 | success |
| Visit KC | 20 | 0 | 20 | success |
| Crossroads | 0 | 0 | 0 | success |
| Reddit | 50 | 0 | 50 | success |
| **Kauffman** | **16** | **16** | **0** | **success** |

**Second scan (dedup):**

| Source | itemsFound | itemsCreated | itemsSkipped |
|---|---|---|---|
| Kauffman | 16 | 0 | 16 |

### 5. Database / API

```bash
curl 'http://localhost:4000/api/content?ingested=true&limit=200'
```

| Source | Count |
|---|---|
| Reddit | 52 |
| Visit KC | 20 |
| Crossroads | 0 |
| Union Station | 4 |
| **Kauffman** | **16** |
| **Total** | **92** |

Sample Kauffman row:

```json
{
  "topic": "Kansas City Symphony Presents Gil Shaham Plays Brahms",
  "sourceUrl": "https://tickets.kauffmancenter.org/overview/23417",
  "sourceType": "kauffman",
  "sourceName": "Kauffman Center Events",
  "locationName": "Helzberg Hall",
  "eventStartsAt": "2026-05-31T19:00:00.000Z",
  "metadata": {
    "ingest": "kauffman_event_api",
    "opportunityCategory": "performance",
    "kauffman": {
      "url": "https://tickets.kauffmancenter.org/overview/23417",
      "publishedAt": "2026-05-31T19:00:00.000Z",
      "venue": "Helzberg Hall",
      "contentType": "performance",
      "locationClues": ["kauffman center", "helzberg hall"],
      "productionSeasonId": "23417"
    }
  }
}
```

### 6. Opportunities UI

`http://localhost:3000/opportunities`

| Check | Result |
|---|---|
| HTTP status | ✅ 200 |
| Kauffman rows visible | ✅ 16 performances |
| Source labels | ✅ `kauffman center events` |

### 7. Existing sources unchanged

| Check | Result |
|---|---|
| `reddit.ts` modified | ❌ not touched |
| `visitkc.ts` modified | ❌ not touched |
| `crossroads.ts` modified | ❌ not touched |
| `union-station.ts` modified | ❌ not touched |
| Reddit count | ✅ 52 |
| Visit KC count | ✅ 20 |
| Union Station count | ✅ 4 |

---

## Ingested Performances (16 total, by date)

| Date | Title | Venue |
|---|---|---|
| 2026-05-31 | Gil Shaham Plays Brahms | Helzberg Hall |
| 2026-06-03 | Mrs. Doubtfire | Muriel Kauffman Theatre |
| 2026-06-05 | On Stage with Yefim Bronfman | Helzberg Hall |
| 2026-06-06 | Rachmaninoff Celebration | Helzberg Hall |
| 2026-06-11 | Trey Anastasio with the Kansas City Symphony | Helzberg Hall |
| 2026-06-12 | The Glenn Miller Orchestra | Muriel Kauffman Theatre |
| 2026-06-12 | Steve Hackman's Symphonic Fusion | Helzberg Hall |
| 2026-06-14 | Future Stages Festival | Kauffman Center (outdoor) |
| 2026-06-19 | Jonathan Van Ness: Hot & Healed | Muriel Kauffman Theatre |
| 2026-06-20 | Rhapsody in Blue and Dvořák's "New World" | Helzberg Hall |
| 2026-06-24 | Punch Brothers | Muriel Kauffman Theatre |
| 2026-07-15 | Graham Nash Live on Tour 2026 | Muriel Kauffman Theatre |
| 2026-08-01 | Lionel Bart's Oliver! | Muriel Kauffman Theatre |
| 2026-08-07 | Herbie Hancock | — |
| 2026-08-21 | Bluey's Big Play | Muriel Kauffman Theatre |
| 2026-08-22 | European Tour Send-off Concert | Helzberg Hall |

---

## Known Limitations

| Limitation | Notes |
|---|---|
| One row per production | Multi-performance runs (e.g. Mrs. Doubtfire, 8 shows) stored as single opportunity with earliest date |
| Venue parsing | Extracted from description HTML; some outdoor/special events lack standard hall names |
| 90-day horizon | Configurable via `horizonDays` in source config |
| TNEW API stability | Undocumented public endpoint; could change with ticketing platform updates |

---

## Manual Retest

```bash
pnpm migrate:kauffman
pnpm seed
curl -X POST http://localhost:4000/api/scanner/run
curl 'http://localhost:4000/api/content?ingested=true&limit=200'
open http://localhost:3000/opportunities
```

---

## Files Changed

```
services/core/src/providers/kauffman.ts              — new TNEW event API provider
services/core/src/providers/index.ts                   — export kauffman
services/core/src/scanner/index.ts                     — kauffman scan path (others untouched)
services/core/src/schema.ts                            — kauffman enum value
services/core/src/scripts/seed.ts                      — Kauffman source seed
services/core/src/scripts/migrate-kauffman.ts          — migration runner (new)
services/core/package.json                             — migrate:kauffman script
db/migrations/10_kauffman_source_type.sql              — enum migration (new)
db/init/10_kauffman_source_type.sql                    — init script (new)
dashboard/lib/opportunities-ui.ts                      — Kauffman source display
package.json                                           — migrate:kauffman script
```

**Not modified:** `reddit.ts`, `visitkc.ts`, `crossroads.ts`, `union-station.ts`

---

**Phase 2D Kauffman complete.** Live performances ingested and displayed alongside existing opportunities. No commit created — awaiting approval.
