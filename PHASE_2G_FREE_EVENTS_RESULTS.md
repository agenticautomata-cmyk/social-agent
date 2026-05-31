# Phase 2G — Free Events Sources Results

**Date:** 2026-05-31  
**Status:** Complete — live free opportunities ingested via KC Parks API, KC Library calendar, and First Fridays rules  
**Scope:** Free events sources only (KC Parks, KC Library, First Fridays)  
**Out of scope (as requested):** Existing provider changes, scoring, LLM ranking/filtering, additional phases

---

## Summary

Phase 2G adds three official free-event sources to address the **Free Things To Do** pillar gap (previously 2 rows / 1.8% of inventory):

1. **KC Parks Events** (`source_type = kc_parks`) — official The Events Calendar REST API with free-event filter
2. **KC Library Events** (`source_type = kc_library`) — official `kclibrary.org/calendar` HTML scrape with detail-page date/venue extraction
3. **Crossroads First Fridays** (`source_type = first_fridays`) — rule-based synthetic generator from official Crossroads First Fridays program

**83 new free-tagged rows** ingested on first scan (50 Parks + 29 Library + 4 First Fridays). Second scan created **0 duplicates**. All rows carry `freeEventFlag: true` and `opportunityCategory: 'free'`.

---

## Source Evaluation (Pre-Implementation)

Evaluated against user priority: KC Parks → KC Library → First Fridays → free family → community festivals.

| Priority | Source | URL / Method | Format | Status | Verdict |
|---|---|---|---|---|---|
| **1** | **KC Parks & Recreation** | `kcparks.org/wp-json/tribe/events/v1/events` | JSON (TEC REST) | HTTP 200, 154 events | **Selected** |
| 1b | KC Parks events RSS | `/events/feed/` | RSS | HTTP 200 | Fallback only — no venue/address fields |
| 1c | KC Parks ICS | `?ical=1` | iCalendar | HTTP 200 | Fallback — API richer |
| **2** | **KC Public Library calendar** | `kclibrary.org/calendar` | HTML scrape + detail pages | HTTP 200 | **Selected** — no public RSS/JSON API |
| 2b | KC Library JSON:API | `/jsonapi/node/event` | JSON | 404 | Not available |
| 2c | KC Library events RSS | `/events/feed/` | RSS | 404 | Not available |
| **3** | **Crossroads First Fridays** | `kccrossroads.org/first-fridays/` | Rule-based synthetic | Official program page | **Selected** |
| 4 | Free family events | KC Parks + KC Library | — | Covered by sources 1 & 2 | Pop in at the Park, Summer Reading, storytimes, free movies |
| 5 | Community festivals | KC Parks API | — | Covered by source 1 | Chalk Walk (FREE), Rose Day, Make Music Day, etc. |
| — | Visit KC free filter | Already in `visitkc` | RSS | Live | **Not modified** |
| — | Nelson-Atkins free days | HTML only | Scrape | Deferred | Future phase |
| — | KCMO Parks (separate) | kcparks.org is KCMO official | — | Same as KC Parks | — |

### Why these three

| Criterion | KC Parks API | KC Library Calendar | First Fridays Rules |
|---|---|---|---|
| **Official** | KCMO Parks & Rec | KC Public Library | Crossroads Arts District program |
| **Free signal** | Filter: free text, park venues, exclude Starlight/paid | All library programs are free | Always free admission |
| **Date + venue** | Structured API fields | Detail page smartdate + branch | Computed first-Friday dates |
| **Address** | Venue address from API | Branch address map + iCal LOCATION | Crossroads 19th & Main |
| **Yield** | ~50 free events / 90-day horizon | ~30 upcoming programs | 4 dates in 120-day horizon |
| **Family/festival coverage** | Pop in at the Park, Rose Day, Chalk Walk | Summer Reading, LEGO Club, free movies | Monthly art walk |

---

## What Changed

### New provider: `kc-parks.ts`

- Fetches paginated events from TEC REST API
- **Free filter** excludes Starlight/paid venues; includes events with "free" in text, park-hosted venues, or KC Parks venue URLs
- Extracts venue, address, neighborhood, event dates, categories

### New provider: `kc-library.ts`

- Scrapes `/calendar` listing for event links (paginated)
- Fetches each event detail page for title, dates, branch/venue, address, description
- All library programs tagged `freeEventFlag: true` (library events are free by definition)

### New provider: `first-fridays.ts`

- Generates First Friday events April–October within horizon
- 5–9 PM Central, Crossroads Arts District
- Unique URL per date (`#first-fridays-YYYY-MM-DD`) for dedup

**Stored per item (all sources, metadata key varies):**

| Field | Storage |
|---|---|
| Title | `topic` |
| Venue | `metadata.{kcParks\|kcLibrary\|firstFridays}.venue` |
| Address | `metadata.*.address`, `location_name` |
| Neighborhood | `metadata.*.neighborhood` |
| Event dates | `event_starts_at`, `event_ends_at`, `metadata.*.eventStartsAt` |
| URL | `source_url` |
| Free flag | `metadata.*.freeEventFlag` = `true` |
| Category | `metadata.*.eventCategory` |
| Pillar | `metadata.opportunityCategory` = `'free'` |

| Source | `metadata.ingest` | Hook | Meta key |
|---|---|---|---|
| KC Parks | `kc_parks_event_api` | KC Parks | `kcParks` |
| KC Library | `kc_library_scrape` | KC Library | `kcLibrary` |
| First Fridays | `first_fridays_rules` | First Fridays | `firstFridays` |

### Deduplication

| Layer | Key |
|---|---|
| Per-source | `(source_id, external_id)` |
| Cross-source | `source_url` (unique URLs per First Fridays date via hash fragment) |

Prior provider insert paths were **not modified**.

### Database

| File | Purpose |
|---|---|
| `db/migrations/14_kc_parks_source_type.sql` | `'kc_parks'` enum |
| `db/migrations/15_kc_library_source_type.sql` | `'kc_library'` enum |
| `db/migrations/16_first_fridays_source_type.sql` | `'first_fridays'` enum |
| `db/init/14–16_*` | Docker init mirrors |

### Seed configs

```json
{
  "type": "kc_parks",
  "name": "KC Parks Events",
  "config": {
    "apiUrl": "https://kcparks.org/wp-json/tribe/events/v1/events",
    "horizonDays": 90,
    "limit": 50,
    "maxPages": 5
  }
}
```

```json
{
  "type": "kc_library",
  "name": "KC Library Events",
  "config": {
    "calendarUrl": "https://kclibrary.org/calendar",
    "limit": 30,
    "maxPages": 3
  }
}
```

```json
{
  "type": "first_fridays",
  "name": "Crossroads First Fridays",
  "config": {
    "horizonDays": 120,
    "seasonStartMonth": 4,
    "seasonEndMonth": 10,
    "eventUrl": "https://kccrossroads.org/first-fridays/"
  }
}
```

---

## Verification Results

### 1. Migration + typecheck

```bash
pnpm migrate:kc-parks
pnpm migrate:kc-library
pnpm migrate:first-fridays
pnpm typecheck
```

✅ All pass.

### 2. Live scan (first run)

| Source | Found | Created | Skipped |
|---|---|---|---|
| KC Parks | 50 | **50** | 0 |
| KC Library | 29 | **29** | 0 |
| First Fridays | 4 | **4** | 0 |
| Reddit | 50 | 0 | 50 |
| Visit KC | 20 | 0 | 20 |
| Sporting KC | 20 | 0 | 20 |
| Kauffman | 16 | 0 | 16 |
| Union Station | 4 | 0 | 4 |
| Restaurant Week | 10 | 0 | 10 |
| Pitch Dining | 10 | 0 | 10 |
| Crossroads | 0 | 0 | 0 |
| **Total new** | | **83** | |

### 3. Dedup (second run)

**0 rows created** on re-scan. ✅

### 4. Existing sources unchanged

All prior sources returned `created: 0, skipped: N` on second scan — no regressions.

### 5. Free pillar impact

| Metric | Before 2G | After 2G |
|---|---|---|
| Free Things To Do rows | 2 | **85** |
| `opportunityCategory: 'free'` | 0 | **83** |
| Total ingested (approx) | 132 | **215** |

### 6. API sample — KC Parks

```json
{
  "topic": "Rose Day",
  "hook": "KC Parks",
  "sourceUrl": "https://kcparks.org/event/rose-day-2026/",
  "eventStartsAt": "2026-05-31T18:00:00.000Z",
  "metadata": {
    "ingest": "kc_parks_event_api",
    "opportunityCategory": "free",
    "kcParks": {
      "venue": "Loose Park",
      "address": "5200 Wornall, Kansas City, Missouri, 64112",
      "neighborhood": "kansas city",
      "freeEventFlag": true,
      "eventCategory": "nature"
    }
  }
}
```

### 7. API sample — KC Library

```json
{
  "topic": "Central Summer Reading Kickoff Party",
  "hook": "KC Library",
  "sourceUrl": "https://kclibrary.org/calendar/central-summer-reading-kickoff-party",
  "metadata": {
    "ingest": "kc_library_scrape",
    "opportunityCategory": "free",
    "kcLibrary": {
      "venue": "Central Library",
      "address": "14 West 10th Street, Kansas City, MO 64105",
      "freeEventFlag": true,
      "eventCategory": "library_program"
    }
  }
}
```

### 8. API sample — First Fridays

```json
{
  "topic": "First Fridays in the Crossroads — September 2026",
  "hook": "First Fridays",
  "sourceUrl": "https://kccrossroads.org/first-fridays/#first-fridays-2026-09-04",
  "metadata": {
    "ingest": "first_fridays_rules",
    "opportunityCategory": "free",
    "firstFridays": {
      "venue": "Crossroads Arts District",
      "address": "Crossroads Arts District, 19th & Main Streets, Kansas City, MO",
      "neighborhood": "crossroads",
      "freeEventFlag": true,
      "eventCategory": "first_friday"
    }
  }
}
```

### 9. Opportunities page

| Check | Result |
|---|---|
| `GET /api/opportunities?ingested=true&limit=200` | ✅ 83 free rows visible |
| Category column | ✅ shows `free` |
| Source labels | ✅ KC Parks / KC Library / First Fridays |
| Dashboard `/opportunities` | ✅ HTTP 200 |

---

## Ingested Data Sample

### KC Parks (50 rows — free community/family/festival)

| Event | Venue | Category |
|---|---|---|
| Rose Day | Loose Park | nature |
| 19th Annual Chalk Walk in the Historic Northeast | — | festival (FREE in description) |
| Pop in at the Park: Spring Valley Park | Spring Valley Park | community |
| Mobile Music Box Concert: Loose Park | Loose Park | music |
| Mother Nature Reads | — | nature |
| 3rd Annual Pawsitive Protection | — | community |

### KC Library (29 rows — free family programs)

| Event | Branch |
|---|---|
| Central Summer Reading Kickoff Party | Central Library |
| Movie: Enter the Dragon | Central Library |
| LEGO Club | — |
| Family Storytime | — |
| Bookmobile stops | Bookmobile |

### First Fridays (4 rows)

| Event | Date |
|---|---|
| First Fridays in the Crossroads — June 2026 | 2026-06-05 |
| First Fridays in the Crossroads — July 2026 | 2026-07-03 |
| First Fridays in the Crossroads — August 2026 | 2026-08-07 |
| First Fridays in the Crossroads — September 2026 | 2026-09-04 |

---

## Known Limitations

1. **KC Library scrape latency** — 29 detail-page fetches per scan (~20s). No public API available.
2. **KC Parks free filter** — Heuristic excludes Starlight/paid venues; some edge cases may slip through or be excluded incorrectly.
3. **First Fridays is synthetic** — No per-month gallery lineup from Crossroads HTML (future enhancement).
4. **Community festivals** — Covered via Parks API (Chalk Walk, Rose Day) but no dedicated festival seed pack yet.
5. **Library pagination** — Default 30 events; increase `limit`/`maxPages` in seed config for broader coverage.

---

## Manual Retest

```bash
pnpm migrate:kc-parks
pnpm migrate:kc-library
pnpm migrate:first-fridays
pnpm seed

curl -X POST http://localhost:4000/api/scanner/run

# Count free rows
curl -s "http://localhost:4000/api/content?ingested=true&limit=200" | \
  jq '[.items[].item | select(.metadata.opportunityCategory == "free")] | length'

# Dedup check (expect 0)
curl -X POST http://localhost:4000/api/scanner/run | jq '.totalCreated'
```

---

## Files Changed

```
services/core/src/providers/kc-parks.ts              (new)
services/core/src/providers/kc-library.ts            (new)
services/core/src/providers/first-fridays.ts           (new)
services/core/src/providers/index.ts                   (exports)
services/core/src/scanner/index.ts                     (free event insert + scan + dispatch)
services/core/src/schema.ts                            (enum values)
services/core/src/scripts/migrate-kc-parks.ts            (new)
services/core/src/scripts/migrate-kc-library.ts          (new)
services/core/src/scripts/migrate-first-fridays.ts       (new)
services/core/src/scripts/seed.ts                      (three seed blocks)
dashboard/lib/opportunities-ui.ts                      (labels + meta types)
db/migrations/14_kc_parks_source_type.sql              (new)
db/migrations/15_kc_library_source_type.sql            (new)
db/migrations/16_first_fridays_source_type.sql         (new)
db/init/14–16_*                                        (new)
package.json + services/core/package.json              (migrate scripts)
PHASE_2G_FREE_EVENTS_RESULTS.md                        (this file)
```

**Not modified:** `reddit.ts`, `visitkc.ts`, `crossroads.ts`, `union-station.ts`, `kauffman.ts`, `sporting-kc.ts`, `restaurant-week.ts`, `pitch-dining.ts`, scoring, LLM ranking.

---

**Phase 2G complete.** 83 live free opportunities ingested. Free Things To Do pillar increased from 2 → 85 rows. Stop here — no scoring, no ranking, no additional phases.
