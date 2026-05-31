# Phase 2C — Union Station Events Results

**Date:** 2026-05-31  
**Status:** Complete — live Union Station events ingested via JSON event API  
**Scope:** Union Station events only  
**Out of scope (as requested):** Reddit/Visit KC/Crossroads changes, scoring, LLM ranking, Google Maps, Eventbrite

---

## Summary

Phase 2C adds **Union Station Kansas City events** as a fourth KC source (`source_type = union_station`). After evaluating available machine-readable feeds, the implementation uses Union Station's WordPress JSON endpoint **`/wp-json/us/v1/nav-events?date=YYYY-MM-DD`** — the only live structured source returning current events. The events RSS feed (`/events/feed/`) is valid but **empty**.

**4 live events** were ingested on first scan. Reddit (52), Visit KC (20), and Crossroads (0) remain operational.

---

## Source Evaluation

| Source | URL | Format | Status | Verdict |
|---|---|---|---|---|
| Events RSS | `https://unionstation.org/events/feed/` | RSS 2.0 | HTTP 200, **0 items** | Valid but empty |
| Main site RSS | `https://unionstation.org/feed/` | RSS 2.0 | 9 news posts, not events | Wrong content type |
| Tribe Events REST | `/wp-json/tribe/events/v1/events` | JSON | 404 | Not available |
| ICS export | `?ical=1` variants | iCalendar | Returns HTML | Not available |
| **Nav events API** | **`/wp-json/us/v1/nav-events?date=`** | **JSON** | **HTTP 200, live events** | **Selected** |

### Why nav-events API

- Returns structured event objects with `id`, `name`, `url`, `location`, and `sessions` (start/end datetimes)
- Powers the Union Station events calendar UI
- Requires `date` query param — provider scans **14-day horizon** and deduplicates events across days
- No authentication required

**Example event fields:**

```json
{
  "id": "019db089-e69f-5526-c0ac-9e4f2d19ce5f",
  "name": "The Mandalorian and Grogu",
  "url": "https://unionstation.org/event/the-mandalorian-and-grogu/",
  "location": "Regnier Extreme Screen Theatre",
  "sessions": {
    "event_session": {
      "_data": [
        { "start_datetime": "2026-05-31T17:30:00Z", "end_datetime": "2026-05-31T19:30:00Z" }
      ]
    }
  }
}
```

---

## What Changed

### New provider (`services/core/src/providers/union-station.ts`)

- Fetches `https://unionstation.org/wp-json/us/v1/nav-events` for each day in horizon
- Merges sessions across days; deduplicates by event `id` or URL path
- Extracts title, URL, publication date (earliest session start), venue, event start/end
- Default location clues: `union station` + venue name

**Stored per item (`content_items` + `metadata.unionStation`):**

| Field | Storage |
|---|---|
| URL | `source_url`, `metadata.unionStation.url` |
| Title | `topic` |
| Publication date | `metadata.unionStation.publishedAt` |
| Event times | `event_starts_at`, `event_ends_at`, `metadata.unionStation.eventStartsAt/EndsAt` |
| Venue | `location_name`, `metadata.unionStation.venue` |
| Content type | `metadata.unionStation.contentType` = `event` |
| Location clues | `metadata.unionStation.locationClues` |

`metadata.ingest` is `union_station_event_api`. Hook is `Union Station`.

### Deduplication

| Layer | Key |
|---|---|
| Per-source | `(source_id, source_external_id)` — event UUID or URL path |
| Cross-source | `source_url` match — skips if URL already ingested from another source |

Reddit, Visit KC, and Crossroads insert paths were **not modified**.

### Database

| File | Purpose |
|---|---|
| `db/migrations/09_union_station_source_type.sql` | `ALTER TYPE source_type ADD VALUE 'union_station'` |
| `db/init/09_union_station_source_type.sql` | Docker init |
| `services/core/src/schema.ts` | `'union_station'` in `sourceTypeEnum` |

### Scanner (`services/core/src/scanner/index.ts`)

- Added `insertUnionStationOpportunity`, `scanUnionStationSource`
- `scanAllActiveSources()` includes `union_station`
- **Reddit, Visit KC, Crossroads functions unchanged**

### Seed

```json
{
  "type": "union_station",
  "name": "Union Station Events",
  "config": {
    "apiUrl": "https://unionstation.org/wp-json/us/v1/nav-events",
    "horizonDays": 14,
    "limit": 50
  }
}
```

### Dashboard

- Subtitle: `union station + crossroads + visit kc + reddit`
- Source labels: `Union Station Events` / `Union Station`
- Link label: `union station`

---

## Verification Results

### 1. Migration

```bash
pnpm migrate:union-station
```

| Check | Result |
|---|---|
| `source_type` enum includes `union_station` | ✅ |

### 2. Seed

```bash
pnpm seed
```

| Check | Result |
|---|---|
| Union Station source created | ✅ `Union Station Events` (`200039ef-bd6b-46e9-bcc9-3fb1aee17cc5`) |
| Reddit / Visit KC / Crossroads unchanged | ✅ |

### 3. Typecheck

```bash
pnpm typecheck
```

| Check | Result |
|---|---|
| All packages pass | ✅ |

### 4. Live provider fetch

| Check | Result |
|---|---|
| Events in 14-day window | **4** unique events |
| Sample titles | The Mandalorian and Grogu, Berlin Wall, Science City, Daily Planetarium Shows |

### 5. Live scan

```bash
curl -X POST http://localhost:4000/api/scanner/run
```

**First scan:**

| Source | itemsFound | itemsCreated | itemsSkipped | Status |
|---|---|---|---|---|
| Visit KC | 20 | 0 | 20 | success |
| Crossroads | 0 | 0 | 0 | success |
| Reddit | 50 | 0 | 50 | success |
| **Union Station** | **4** | **4** | **0** | **success** |

**Second scan (dedup):**

| Source | itemsFound | itemsCreated | itemsSkipped |
|---|---|---|---|
| Union Station | 4 | 0 | 4 |

### 6. Database / API

```bash
curl 'http://localhost:4000/api/content?ingested=true&limit=200'
```

| Source | Count |
|---|---|
| Reddit | 52 |
| Visit KC | 20 |
| Crossroads | 0 |
| **Union Station** | **4** |
| **Total** | **76** |

Sample Union Station row:

```json
{
  "topic": "The Mandalorian and Grogu",
  "sourceUrl": "https://unionstation.org/event/the-mandalorian-and-grogu/",
  "sourceType": "union_station",
  "sourceName": "Union Station Events",
  "locationName": "Regnier Extreme Screen Theatre",
  "eventStartsAt": "2026-05-31T17:30:00.000Z",
  "metadata": {
    "ingest": "union_station_event_api",
    "opportunityCategory": "event",
    "unionStation": {
      "url": "https://unionstation.org/event/the-mandalorian-and-grogu/",
      "publishedAt": "2026-05-31T17:30:00.000Z",
      "venue": "Regnier Extreme Screen Theatre",
      "contentType": "event",
      "locationClues": ["union station", "regnier extreme screen theatre"],
      "eventStartsAt": "2026-05-31T17:30:00.000Z",
      "eventEndsAt": "2026-05-31T19:30:00.000Z"
    }
  }
}
```

```bash
curl 'http://localhost:4000/api/opportunities?ingested=true&limit=200'
```

| Check | Result |
|---|---|
| Union Station mapped rows | ✅ 4 |
| `sourceName` present | ✅ `Union Station Events` |

### 7. Opportunities UI

`http://localhost:3000/opportunities`

| Check | Result |
|---|---|
| HTTP status | ✅ 200 |
| Union Station rows visible | ✅ 4 events with source labels |
| Subtitle mentions union station | ✅ |

### 8. Existing sources unchanged

| Check | Result |
|---|---|
| `reddit.ts` modified | ❌ not touched |
| `visitkc.ts` modified | ❌ not touched |
| `crossroads.ts` modified | ❌ not touched |
| Reddit count stable | ✅ 52 |
| Visit KC count stable | ✅ 20 |

---

## Ingested Events (2026-05-31 scan)

| Title | Venue | Next session |
|---|---|---|
| The Mandalorian and Grogu | Regnier Extreme Screen Theatre | 2026-05-31 17:30 UTC |
| The Berlin Wall. A World Divided | Bank of America Gallery | 2026-05-31 16:00 UTC |
| Science City General Admission | Science City | 2026-05-31 17:00 UTC |
| Daily Planetarium Shows | Planetarium | ongoing (no session times in API) |

---

## Manual Retest

```bash
pnpm migrate:union-station
pnpm seed
curl -X POST http://localhost:4000/api/scanner/run
curl 'http://localhost:4000/api/content?ingested=true&limit=200'
open http://localhost:3000/opportunities
```

---

## Known Limitations

| Limitation | Notes |
|---|---|
| Date-param API | Must iterate days; no single "all events" endpoint |
| Empty events RSS | `/events/feed/` exists but publishes no items |
| Planetarium event | No `id` or sessions in API — uses URL path as external ID |
| 14-day horizon | Configurable via `horizonDays`; longer events may need tuning |
| Scan latency | 14 sequential API calls per scan (~15s) |

---

## Files Changed

```
services/core/src/providers/union-station.ts           — new Union Station event API provider
services/core/src/providers/index.ts                   — export union-station
services/core/src/scanner/index.ts                     — union_station scan path (others untouched)
services/core/src/schema.ts                            — union_station enum value
services/core/src/scripts/seed.ts                        — Union Station source seed
services/core/src/scripts/migrate-union-station.ts     — migration runner (new)
services/core/package.json                               — migrate:union-station script
db/migrations/09_union_station_source_type.sql         — enum migration (new)
db/init/09_union_station_source_type.sql               — init script (new)
dashboard/lib/opportunities-ui.ts                      — Union Station source display
package.json                                           — migrate:union-station script
```

**Not modified:** `reddit.ts`, `visitkc.ts`, `crossroads.ts`

---

**Phase 2C Union Station complete.** Live events ingested via JSON event API; displayed alongside existing opportunities. No commit created — awaiting approval.
