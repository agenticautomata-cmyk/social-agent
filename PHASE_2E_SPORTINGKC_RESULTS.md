# Phase 2E — Sporting KC Schedule Results

**Date:** 2026-05-31  
**Status:** Complete — live Sporting KC matches ingested via official Forge JSON API  
**Scope:** Sporting KC schedule only  
**Out of scope (as requested):** Reddit/Visit KC/Union Station/Kauffman changes, scoring, LLM ranking, Google Maps, Eventbrite

---

## Summary

Phase 2E adds **Sporting Kansas City MLS schedule** as a sixth KC source (`source_type = sporting_kc`). After evaluating RSS, ICS, and authenticated stats APIs, the implementation uses Sporting KC's official **Deltatre Forge JSON API** at `https://dapi.sportingkc.com/v2/content/en-us/matches`. **20 upcoming matches** were ingested on first scan with opponent, date, home/away status, venue, and ticket/stream URLs. All existing sources remain operational.

---

## Source Evaluation

| Source | URL / Method | Format | Status | Verdict |
|---|---|---|---|---|
| Events RSS | `/events/feed/` | RSS | 404 | Not available |
| Main RSS | `/feed/` | RSS | 404 | Not available |
| ICS export | `?ical=1` | iCalendar | HTML page | Not available |
| MLS stats API | `stats-api.mlsdigital.net/v1` | JSON | 401 Unauthorized | Requires auth |
| Events page HTML | `/schedule` | HTML | 26 cards SSR | Scrape fallback only |
| TNEW tickets API | `POST /api/products/productionseasons` | JSON | Wrong domain (Kauffman pattern) | Not SKC schedule |
| **Forge DAPI matches** | **`dapi.sportingkc.com/v2/content/en-us/matches`** | **JSON (GET, paginated)** | **HTTP 200, live data** | **Selected** |

### Why Forge DAPI

- Official Sporting KC / MLS Next Gen content API (same backend as sportingkc.com schedule)
- Structured match objects: `optaId`, `matchDateTime`, `homeClubOptaId`, `awayClubOptaId`, `appleStreamURL`
- Public, no authentication required
- Paginated newest-first — **only 2 pages** needed to capture all upcoming SKC matches (~550ms)

**SKC club Opta ID:** `421` (from `/v2/content/en-us/clubs/sporting-kansas-city`)

---

## What Changed

### New provider (`services/core/src/providers/sporting-kc.ts`)

- Fetches paginated matches from Forge DAPI
- Filters for Sporting KC (`clubOptaId: 421`) and upcoming dates within horizon
- Stops pagination when page spans past dates (typically 2 pages)
- Extracts opponent from `appleStreamURL` slug (e.g. `sporting-kansas-city-vs-minnesota-united`)
- Home venue: **Children's Mercy Park**; away venue left null

**Stored per item (`content_items` + `metadata.sportingKc`):**

| Field | Storage |
|---|---|
| Title | `topic` — e.g. "Sporting KC vs Minnesota United" |
| Opponent | `metadata.sportingKc.opponent` |
| Home/Away | `metadata.sportingKc.homeAway` (`home` \| `away`) |
| URL | `source_url` — Apple TV stream URL or schedule page deep link |
| Kickoff | `event_starts_at`, `metadata.sportingKc.eventStartsAt` |
| Venue | `location_name`, `metadata.sportingKc.venue` |
| Location clues | `metadata.sportingKc.locationClues` |
| Match ID | `source_external_id` (Opta match ID) |

`metadata.ingest` is `sporting_kc_event_api`. Hook is `Sporting KC`.

### Deduplication

| Layer | Key |
|---|---|
| Per-source | `(source_id, opta match id)` |
| Cross-source | `source_url` match |

Prior source insert paths were **not modified**.

### Database

| File | Purpose |
|---|---|
| `db/migrations/11_sporting_kc_source_type.sql` | `ALTER TYPE source_type ADD VALUE 'sporting_kc'` |
| `db/init/11_sporting_kc_source_type.sql` | Docker init |
| `services/core/src/schema.ts` | `'sporting_kc'` in `sourceTypeEnum` |

### Scanner (`services/core/src/scanner/index.ts`)

- Added `insertSportingKcOpportunity`, `scanSportingKcSource`
- `scanAllActiveSources()` includes `sporting_kc`
- **Reddit, Visit KC, Crossroads, Union Station, Kauffman functions unchanged**

### Seed

```json
{
  "type": "sporting_kc",
  "name": "Sporting KC Schedule",
  "config": {
    "apiUrl": "https://dapi.sportingkc.com/v2/content/en-us/matches",
    "clubOptaId": 421,
    "horizonDays": 180,
    "limit": 50,
    "maxPages": 10
  }
}
```

### Dashboard

- Subtitle includes sporting kc
- Source labels: `Sporting KC Schedule` / `Sporting KC`
- Link label: `sporting kc`

---

## Verification Results

### 1. Migration

```bash
pnpm migrate:sporting-kc
```

| Check | Result |
|---|---|
| `source_type` enum includes `sporting_kc` | ✅ |

### 2. Seed

```bash
pnpm seed
```

| Check | Result |
|---|---|
| Sporting KC source created | ✅ `Sporting KC Schedule` (`3bc6cd5f-5f5d-491d-9c09-73b21f71b019`) |
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
| Crossroads | 0 | 0 | 0 | success |
| Reddit | 50 | 0 | 50 | success |
| **Sporting KC** | **20** | **20** | **0** | **success** |
| Kauffman | 16 | 0 | 16 | success |
| Union Station | 4 | 0 | 4 | success |
| Visit KC | 20 | 0 | 20 | success |

**Second scan (dedup):**

| Source | itemsFound | itemsCreated | itemsSkipped |
|---|---|---|---|
| Sporting KC | 20 | 0 | 20 |

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
| Kauffman | 16 |
| **Sporting KC** | **20** |
| **Total** | **112** |

Sample Sporting KC row:

```json
{
  "topic": "Sporting KC vs Minnesota United",
  "sourceUrl": "https://tv.apple.com/us/sporting-event/sporting-kansas-city-vs-minnesota-united/...",
  "sourceType": "sporting_kc",
  "sourceName": "Sporting KC Schedule",
  "locationName": "Children's Mercy Park",
  "eventStartsAt": "2026-07-23T00:30:00.000Z",
  "metadata": {
    "ingest": "sporting_kc_event_api",
    "opportunityCategory": "match",
    "sportingKc": {
      "opponent": "Minnesota United",
      "homeAway": "home",
      "venue": "Children's Mercy Park",
      "locationClues": ["childrens mercy park", "sporting kc", "kansas city"],
      "eventStartsAt": "2026-07-23T00:30:00.000Z",
      "matchOptaId": "289022295"
    }
  }
}
```

### 6. Opportunities UI

`http://localhost:3000/opportunities`

| Check | Result |
|---|---|
| HTTP status | ✅ 200 |
| Sporting KC rows visible | ✅ 20 matches |
| Source labels | ✅ `sporting kc schedule` |

### 7. Existing sources unchanged

| Check | Result |
|---|---|
| `reddit.ts` modified | ❌ not touched |
| `visitkc.ts` modified | ❌ not touched |
| `union-station.ts` modified | ❌ not touched |
| `kauffman.ts` modified | ❌ not touched |
| `crossroads.ts` modified | ❌ not touched |
| Reddit count | ✅ 52 |
| Visit KC count | ✅ 20 |
| Union Station count | ✅ 4 |
| Kauffman count | ✅ 16 |

---

## Ingested Matches (20 upcoming, by date)

| Date | Match | Home/Away | Venue |
|---|---|---|---|
| 2026-07-17 | vs St Louis City SC | Away | — |
| 2026-07-23 | vs Minnesota United | Home | Children's Mercy Park |
| 2026-07-26 | at LAFC | Away | — |
| 2026-08-02 | vs Houston Dynamo | Home | Children's Mercy Park |
| 2026-08-16 | at Colorado Rapids | Away | — |
| 2026-08-20 | vs St Louis City SC | Home | Children's Mercy Park |
| 2026-08-23 | at Atlanta United | Away | — |
| 2026-08-30 | vs Vancouver Whitecaps | Home | Children's Mercy Park |
| 2026-09-06 | at FC Dallas | Away | — |
| 2026-09-13 | vs Orlando City | Home | Children's Mercy Park |
| 2026-09-19 | at Nashville SC | Away | — |
| 2026-09-26 | vs Austin FC | Home | Children's Mercy Park |
| 2026-10-04 | at Seattle Sounders | Away | — |
| 2026-10-17 | vs Real Salt Lake | Home | Children's Mercy Park |
| 2026-10-24 | vs Austin FC | Home | Children's Mercy Park |
| 2026-10-28 | at Minnesota United | Away | — |
| 2026-10-31 | vs FC Dallas | Home | Children's Mercy Park |
| 2026-11-07 | at San Diego FC | Away | — |

*(Additional matches through horizon end included in DB)*

---

## Known Limitations

| Limitation | Notes |
|---|---|
| Away venue names | Not in match API; only home games get Children's Mercy Park |
| Opponent parsing | Derived from Apple TV URL slug; fallback to abbreviations |
| One row per match | Multi-match production runs not applicable (each match is unique) |
| Pagination | Stops when page min date < now; max 10 pages safety cap |
| Apple TV URLs | Used as primary link when available; schedule page hash fallback |

---

## Manual Retest

```bash
pnpm migrate:sporting-kc
pnpm seed
curl -X POST http://localhost:4000/api/scanner/run
curl 'http://localhost:4000/api/content?ingested=true&limit=200'
open http://localhost:3000/opportunities
```

---

## Files Changed

```
services/core/src/providers/sporting-kc.ts              — new Forge DAPI match provider
services/core/src/providers/index.ts                    — export sporting-kc
services/core/src/scanner/index.ts                      — sporting_kc scan path (others untouched)
services/core/src/schema.ts                             — sporting_kc enum value
services/core/src/scripts/seed.ts                        — Sporting KC source seed
services/core/src/scripts/migrate-sporting-kc.ts        — migration runner (new)
services/core/package.json                              — migrate:sporting-kc script
db/migrations/11_sporting_kc_source_type.sql            — enum migration (new)
db/init/11_sporting_kc_source_type.sql                  — init script (new)
dashboard/lib/opportunities-ui.ts                       — Sporting KC source display
package.json                                            — migrate:sporting-kc script
```

**Not modified:** `reddit.ts`, `visitkc.ts`, `crossroads.ts`, `union-station.ts`, `kauffman.ts`

---

**Phase 2E Sporting KC complete.** Live MLS matches ingested and displayed alongside existing opportunities. No commit created — awaiting approval.
