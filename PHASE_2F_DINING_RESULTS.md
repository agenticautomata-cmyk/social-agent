# Phase 2F — KC Dining Sources Results

**Date:** 2026-05-31  
**Status:** Complete — live dining opportunities ingested via KC Restaurant Week RSS + The Pitch KC Sipps RSS  
**Scope:** KC Restaurant Week + restaurant opening/dining announcement sources only  
**Out of scope (as requested):** Reddit/Visit KC RSS/Union Station/Kauffman/Sporting KC changes, scoring, LLM ranking, additional phases

---

## Summary

Phase 2F adds two dining-focused KC sources to address the **Dining** and **Openings** pillar gaps identified in `CONTENT_PILLAR_ANALYSIS.md`:

1. **KC Restaurant Week** (`source_type = restaurant_week`) — official Drupal RSS at `kcrestaurantweek.com/rss.xml` with per-restaurant listings, addresses, menu types, and season dates
2. **The Pitch KC Sipps** (`source_type = pitch_dining`) — local restaurant opening tracker column via tag RSS at `thepitchkc.com/tag/kc-sipps/feed/`

**20 new dining rows** ingested on first scan (10 Restaurant Week + 10 KC Sipps). Second scan created **0 duplicates**. Existing sources remain operational with unchanged row counts.

---

## Source Evaluation (Pre-Implementation)

Sources evaluated against user priority order: official KCRW → opening trackers → dining calendars → association feeds → food publications.

| Rank | Source | URL / Method | Format | Status | Verdict |
|---|---|---|---|---|---|
| **1** | **KC Restaurant Week official RSS** | `https://www.kcrestaurantweek.com/rss.xml` | RSS (Drupal) | HTTP 200, 10 items | **Selected — Restaurant Week source** |
| 2 | KCRW restaurant directory | `kcrestaurantweek.com/restaurants` | HTML (240+ listings) | Public, no API | High value but requires scrape; RSS sufficient for Phase 2F seed |
| 3 | KCRW Drupal JSON:API | `/jsonapi/node/restaurant` | JSON | 404 / empty | Not available publicly |
| 4 | KCRW blog RSS | `/blog/rss.xml`, `/feed/` | RSS | 404 | Not available |
| 5 | Visit KC Restaurant Week PR | Already in `visitkc` RSS | RSS | Live (3 rows) | **Not modified** — announcement-only, no per-restaurant data |
| **6** | **The Pitch KC Sipps column** | `thepitchkc.com/tag/kc-sipps/feed/` | RSS (WordPress) | HTTP 200, 10+ items | **Selected — Opening tracker source** |
| 7 | The Pitch Food & Drink category | `/category/food-drink/feed/` | RSS | HTTP 200 | Broader mix (reviews, brewery news); KC Sipps is higher signal for openings |
| 8 | IN Kansas City dining | `inkansascity.com` | HTML | No public RSS found | Deferred — scrape-only |
| 9 | Greater KC Restaurant Association | Industry org | — | No public event feed | Deferred |
| 10 | PR Newswire / EIN restaurant PR | Press wire | RSS/API | Generic national wire | Lower editorial value vs local Pitch coverage |

### Why these two sources

| Criterion | KC Restaurant Week RSS | The Pitch KC Sipps |
|---|---|---|
| **Business value** | Official anchor event; 240+ restaurant participants; luxury/dining pillar | Weekly curated openings, festivals, chef events — direct "Openings" pillar fill |
| **Data richness** | Venue name, street address, region, menu type, season dates | Opening flags, event dates, venue names, addresses in body |
| **Machine-readable** | RSS with structured HTML address fields | Standard WordPress RSS with full article body |
| **Auth** | None | None |
| **Kellie fit** | Restaurant Week multicourse menus, date-night, charity angle | "What's new in KC dining" — proven social format |

---

## What Changed

### New provider: `restaurant-week.ts`

- Fetches official KCRW RSS
- Distinguishes **restaurant listings** (single-segment slug) from **announcements** (charity/news posts)
- Parses address, region, menu types from HTML-encoded description fields
- Applies configured season dates (`2026-01-09` → `2026-01-18`) to all participant listings
- Sets `restaurantWeekFlag: true` on all items

**Stored per item (`metadata.restaurantWeek`):**

| Field | Storage |
|---|---|
| Title | `topic` — restaurant name or prefixed announcement |
| Venue | `metadata.restaurantWeek.venue` |
| Address | `metadata.restaurantWeek.address`, `location_name` |
| Region | `metadata.restaurantWeek.region`, `locationClues` |
| Season dates | `event_starts_at`, `event_ends_at` |
| URL | `source_url` |
| Dining category | `metadata.restaurantWeek.diningCategory` (`dinner`, `lunch`, `brunch`, `announcement`, `charity`) |
| Opening flag | `metadata.restaurantWeek.openingFlag` |
| Restaurant week flag | `metadata.restaurantWeek.restaurantWeekFlag` |
| Menu types | `metadata.restaurantWeek.menuTypes` |

`metadata.ingest` = `restaurant_week_rss`. Hook = `KC Restaurant Week`. `opportunityCategory` = `dining`.

### New provider: `pitch-dining.ts`

- Fetches The Pitch **KC Sipps** tag RSS (171 historical posts; ingests latest 30)
- Detects **opening flag** from title/body keywords (open, grand opening, new location, ribbon-cutting, etc.)
- Infers **dining category**: `opening`, `food_festival`, `chef_event`, `tasting`, `restaurant_week`, `closing`, `dining`
- Extracts addresses from "is located at …" and "at 123 … MO/KS" patterns
- Parses event date ranges from body text

**Stored per item (`metadata.pitchDining`):**

| Field | Storage |
|---|---|
| Title | `topic` — full KC Sipps headline |
| Venue | `metadata.pitchDining.venue` |
| Address | `metadata.pitchDining.address` |
| Event dates | `event_starts_at`, `event_ends_at` (when parsed) |
| URL | `source_url` |
| Dining category | `metadata.pitchDining.diningCategory` |
| Opening flag | `metadata.pitchDining.openingFlag` |
| Restaurant week flag | `metadata.pitchDining.restaurantWeekFlag` |

`metadata.ingest` = `pitch_dining_rss`. Hook = `The Pitch`. `opportunityCategory` = `dining`.

### Deduplication

| Source | Per-source key | Cross-source |
|---|---|---|
| Restaurant Week | `(source_id, slug external_id)` | `source_url` |
| Pitch Dining | `(source_id, slug external_id)` | `source_url` |

Prior source insert paths were **not modified**.

### Database

| File | Purpose |
|---|---|
| `db/migrations/12_restaurant_week_source_type.sql` | `ALTER TYPE source_type ADD VALUE 'restaurant_week'` |
| `db/migrations/13_pitch_dining_source_type.sql` | `ALTER TYPE source_type ADD VALUE 'pitch_dining'` |
| `db/init/12_restaurant_week_source_type.sql` | Docker init mirror |
| `db/init/13_pitch_dining_source_type.sql` | Docker init mirror |
| `services/core/src/schema.ts` | Enum values added |

### Scanner (`services/core/src/scanner/index.ts`)

- Added `insertRestaurantWeekOpportunity`, `scanRestaurantWeekSource`
- Added `insertPitchDiningOpportunity`, `scanPitchDiningSource`
- `scanAllActiveSources()` includes `restaurant_week` and `pitch_dining`
- **Reddit, Visit KC, Crossroads, Union Station, Kauffman, Sporting KC functions unchanged**

### Seed

```json
{
  "type": "restaurant_week",
  "name": "KC Restaurant Week",
  "config": {
    "feedUrl": "https://www.kcrestaurantweek.com/rss.xml",
    "limit": 50,
    "seasonStart": "2026-01-09",
    "seasonEnd": "2026-01-18"
  }
}
```

```json
{
  "type": "pitch_dining",
  "name": "The Pitch KC Sipps",
  "config": {
    "feedUrl": "https://www.thepitchkc.com/tag/kc-sipps/feed/",
    "limit": 30
  }
}
```

### Dashboard

- Subtitle includes restaurant week + pitch dining
- Source labels: `KC Restaurant Week` / `The Pitch`
- Link labels: `restaurant week` / `the pitch`

---

## Verification Results

### 1. Migration

```bash
pnpm migrate:restaurant-week
pnpm migrate:pitch-dining
```

| Check | Result |
|---|---|
| `restaurant_week` enum value | ✅ Added |
| `pitch_dining` enum value | ✅ Added |

### 2. Typecheck

```bash
pnpm typecheck
```

✅ All packages pass.

### 3. Seed

```bash
pnpm seed
```

| Source | Result |
|---|---|
| KC Restaurant Week | ✅ Wired |
| The Pitch KC Sipps | ✅ Wired |

### 4. Live scan (first run)

```bash
curl -X POST http://localhost:4000/api/scanner/run
```

| Source | Found | Created | Skipped |
|---|---|---|---|
| KC Restaurant Week | 10 | **10** | 0 |
| The Pitch KC Sipps | 10 | **10** | 0 |
| Reddit | 50 | 0 | 50 |
| Visit KC | 20 | 0 | 20 |
| Sporting KC | 20 | 0 | 20 |
| Kauffman | 16 | 0 | 16 |
| Union Station | 4 | 0 | 4 |
| Crossroads | 0 | 0 | 0 |
| **Total new** | | **20** | |

### 5. Dedup verification (second run)

| Source | Found | Created | Skipped |
|---|---|---|---|
| All sources | — | **0** | all prior rows |

✅ No duplicate rows created on re-scan.

### 6. Existing sources unchanged

| Source | Row count (before → after) |
|---|---|
| Reddit | 52 → 52 |
| Visit KC | 20 → 20 |
| Sporting KC | 20 → 20 |
| Kauffman | 16 → 16 |
| Union Station | 4 → 4 |
| Crossroads | 0 → 0 |
| **Total ingested** | 112 → **132** (+20 dining) |

### 7. API sample — Restaurant Week

```json
{
  "topic": "Em Chamas Brazilian Grill",
  "hook": "KC Restaurant Week",
  "sourceUrl": "https://www.kcrestaurantweek.com/em-chamas-brazilian-grill",
  "locationName": "Northland",
  "eventStartsAt": "2026-01-09T12:00:00.000Z",
  "eventEndsAt": "2026-01-18T23:59:59.000Z",
  "metadata": {
    "ingest": "restaurant_week_rss",
    "opportunityCategory": "dining",
    "restaurantWeek": {
      "venue": "Em Chamas Brazilian Grill",
      "address": "6101 NW 63rd Terrace, Kansas City, MO, 64151",
      "region": "Northland",
      "diningCategory": "dinner",
      "openingFlag": false,
      "restaurantWeekFlag": true,
      "menuTypes": ["dinner menu"]
    }
  }
}
```

### 8. API sample — Pitch Dining (opening)

```json
{
  "topic": "KC Sipps: Three local restaurants add new locations, a Pride Month pre-party, and a free three-day Italian festival",
  "hook": "The Pitch",
  "sourceUrl": "https://www.thepitchkc.com/kc-sipps-three-local-restaurants-add-new-locations-a-pride-month-pre-party-and-a-free-three-day-italian-festival/",
  "metadata": {
    "ingest": "pitch_dining_rss",
    "opportunityCategory": "dining",
    "pitchDining": {
      "diningCategory": "opening",
      "openingFlag": true,
      "restaurantWeekFlag": false,
      "venue": "Three local restaurants add new locations"
    }
  }
}
```

### 9. Opportunities page

| Check | Result |
|---|---|
| `GET /api/opportunities?ingested=true` | ✅ 20 dining rows returned |
| Dashboard `/opportunities` | ✅ HTTP 200 |
| Category column shows `dining` | ✅ via `opportunityCategory` |
| Source labels display | ✅ KC Restaurant Week / The Pitch |

---

## Ingested Data Sample

### KC Restaurant Week (10 rows)

| Venue | Address | Category | Menu |
|---|---|---|---|
| Em Chamas Brazilian Grill | 6101 NW 63rd Terrace, KC MO | dinner | Dinner Menu |
| Taco Naco KC | — | restaurant_week | — |
| E9 Grille @ Tap Ins KC | — | restaurant_week | — |
| The Indian Belly | — | restaurant_week | — |
| Modern Market Eatery | — | restaurant_week | — |
| District Fish & Pasta House | — | restaurant_week | — |
| KC Restaurant Week: New Ways to Donate… | — | charity | — |
| Ruchi Indian Cuisine | 11168 Antioch Rd, Overland Park KS | lunch | Lunch Menu |
| Lilico's Taverna | 1615 Oak St, KC MO | dinner | Dinner Menu |
| Urban Restaurant | 3420 Troost Ave, KC MO | brunch | Brunch Menu |

### The Pitch KC Sipps (10 rows)

| Title | Category | Opening |
|---|---|---|
| Three local restaurants add new locations… | opening | ✅ |
| New Mexican sushi, Japanese bartending… | opening | ✅ |
| A sad Town Topic update, and a salty weekend… | food_festival | — |
| Mother's Day events in Crossroads… | dining | — |
| Three openings and delicious festivals… | opening | ✅ |
| Free pizza for a year, prominent patios… | opening | ✅ |
| Two openings, impressive milestones… | opening | ✅ |
| New waterfront eateries and patio dining | opening | ✅ |
| Sandwich Week is underway… | opening | ✅ |
| Spring brings new events, hours, and menus | opening | ✅ |

---

## Known Limitations

1. **KCRW RSS cap** — Feed returns ~10 featured restaurants, not the full 240+ participant directory. Full coverage requires a future HTML/API scrape of `/restaurants`.
2. **Season dates from config** — KCRW RSS does not embed event dates per item; season window is configured in seed (`seasonStart`/`seasonEnd`). Update seed when 2027 dates are announced.
3. **Pitch venue extraction** — Multi-venue KC Sipps roundups set `venue` to the headline clause; individual restaurant names are in the body text.
4. **Opening detection is heuristic** — Keyword-based; no LLM classification (per scope).
5. **Cross-source overlap** — Visit KC RSS may mention Restaurant Week in PR; dedup is URL-based only (different URLs, so both may appear — acceptable for now).

---

## Manual Retest

```bash
# Migrations + seed
pnpm migrate:restaurant-week
pnpm migrate:pitch-dining
pnpm seed

# Live scan
curl -X POST http://localhost:4000/api/scanner/run

# Verify dining rows
curl -s "http://localhost:4000/api/content?ingested=true&limit=200" | \
  jq '[.items[].item | select(.metadata.ingest | IN("restaurant_week_rss", "pitch_dining_rss"))] | length'

# Dedup check (expect 0 created)
curl -X POST http://localhost:4000/api/scanner/run | jq '.totalCreated'

# Filter dining category
curl -s "http://localhost:4000/api/opportunities?ingested=true&limit=200" | \
  jq '[.items[].opportunity | select(.metadata.opportunityCategory == "dining")] | length'
```

---

## Files Changed

```
services/core/src/providers/restaurant-week.ts          (new)
services/core/src/providers/pitch-dining.ts             (new)
services/core/src/providers/index.ts                    (exports)
services/core/src/scanner/index.ts                      (insert + scan + dispatch)
services/core/src/schema.ts                             (enum values)
services/core/src/scripts/migrate-restaurant-week.ts    (new)
services/core/src/scripts/migrate-pitch-dining.ts       (new)
services/core/src/scripts/seed.ts                       (two seed blocks)
dashboard/lib/opportunities-ui.ts                       (labels + meta types)
db/migrations/12_restaurant_week_source_type.sql        (new)
db/migrations/13_pitch_dining_source_type.sql           (new)
db/init/12_restaurant_week_source_type.sql              (new)
db/init/13_pitch_dining_source_type.sql                 (new)
package.json                                            (migrate scripts)
services/core/package.json                              (migrate scripts)
PHASE_2F_DINING_RESULTS.md                              (this file)
```

**Not modified:** `reddit.ts`, `visitkc.ts`, `crossroads.ts`, `union-station.ts`, `kauffman.ts`, `sporting-kc.ts`, scoring, LLM ranking.

---

**Phase 2F complete.** 20 live dining opportunities ingested. Stop here — no scoring, no ranking, no additional phases.
