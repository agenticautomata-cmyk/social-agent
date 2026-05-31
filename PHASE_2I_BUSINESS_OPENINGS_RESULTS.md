# Phase 2I — Business Openings Sources Results

**Date:** 2026-05-31  
**Status:** Complete — live business opening opportunities ingested from Pitch KC, In Kansas City, and Visit KC  
**Scope:** Business openings sources only (priorities 1–8 as category classification)  
**Out of scope (as requested):** Existing provider changes, scoring, ranking, UI logic

---

## Summary

Phase 2I addresses the **Openings** pillar gap (previously ~3 rows / ~1% of inventory).

Three new sources:

1. **The Pitch KC Openings** (`pitch_openings`) — KC Sipps roundup parsing + dining/business/category RSS feeds
2. **In Kansas City Openings** (`inkc_openings`) — filtered main site RSS
3. **Visit KC Openings** (`visitkc_openings`) — filtered tourism news RSS with opening-specific tagging

**38 net-new opening rows** after quality cleanup (34 Pitch + 4 Visit KC). In Kansas City feed yielded **0 rows** after false-positive filters (low opening signal in recent feed).

All rows carry `openingFlag: true` and a category-specific `opportunityCategory`.

Total ingested inventory: **256 → 297 rows** (+41 gross on first scan; quality removals = **+38 net**).

---

## Rows Created

| Source | First Scan Found | First Scan Created | After Quality Filters |
|---|---|---|---|
| The Pitch KC Openings | 38 | 38 | **34** (removed interview/review false positives) |
| Visit KC Openings | 3 | 0* | **4** (hash-URL dedup fix applied) |
| In Kansas City Openings | 3 | 3 | **0** (3 false positives removed; filter tightened) |
| **Total** | **44** | **41** | **38** |

\*First Visit KC scan hit cross-source URL dedup against existing `visitkc` rows. Fixed by appending `#business-opening` to opening-specific URLs.

### Category breakdown (38 rows)

| Category | Count |
|---|---|
| `coffee_opening` | 13 |
| `restaurant_opening` | 11 |
| `grand_opening` | 10 |
| `entertainment_opening` | 4 |
| `boutique_opening` | 2 |
| `hotel_opening` | 0 |

Priorities 4–8 (restaurant, boutique, hotel, coffee, entertainment) are implemented as **classifiers** on ingested items, not separate source types. Hotel openings had no matches in current feed windows.

---

## Duplicates Removed

| Mechanism | Result |
|---|---|
| Per-source `(source_id, source_external_id)` | Second scan: **0 created**, 36 skipped (Pitch) |
| Cross-source `source_url` match | Visit KC base URLs deduped against `visitkc`; hash suffix allows opening-tagged rows |
| KC Sipps sub-opening IDs | `{article-slug}#opening-{business-slug}` prevents roundup collapse |
| Cross-feed Pitch dedup | Same business from Sipps + category feeds deduped by `externalId` |

**Second full scan: 0 duplicates created** — dedup verified.

---

## Source Quality

| Source | Quality | Notes |
|---|---|---|
| **The Pitch KC Openings** | ★★★★☆ **High** | Best yield. KC Sipps `<b>Name:</b>` parsing extracts individual businesses from weekly roundups. 34 actionable rows with business names and opening dates. |
| **Visit KC Openings** | ★★★☆☆ **Medium** | Tourism PR angle — museum openings, new programs, Restaurant Week. 4 rows; good for destination content, weaker on neighborhood retail. |
| **In Kansas City Openings** | ★☆☆☆☆ **Low (current feed)** | Main RSS rarely tags openings in titles. Recent feed is lifestyle/skyline/weekend guides. Source wired and filtered; expect sporadic hits. |

### Field coverage (38 rows)

| Field | Populated | Rate |
|---|---|---|
| businessName | 38 | 100% |
| category | 38 | 100% |
| openingDate | 38 | 100% |
| sourceUrl | 38 | 100% |
| neighborhood | ~29 | ~76% |
| address | 4 | 11% |
| website | 0 | 0% |

Address and website gaps reflect RSS summary format — Pitch Sipps blocks rarely include full street addresses or business URLs in feed HTML.

### Rejected / stale feeds evaluated

| Feed | Status |
|---|---|
| `thepitchkc.com/tag/openings/feed/` | HTTP 200 — **stale** (2012 content) |
| `thepitchkc.com/tag/now-open/feed/` | HTTP 200 — **stale** (2009–2010) |
| `thepitchkc.com/category/business/feed/` | HTTP 404 |
| `inkansascity.com/category/business/feed/` | HTTP 404 |
| `thepitchkc.com/tag/hotel/feed/` | HTTP 404 |

---

## Estimated Sponsor Potential

Sponsor potential scored on: local business specificity, opening timeliness, category commercial value, and content postability for Kellie's audience.

| Category | Rows | Sponsor Potential | Rationale |
|---|---|---|---|
| **Restaurant openings** | 11 | **High** | Direct dining sponsor fit (restaurants, food brands, delivery). Named venues with dates — ideal for "new in KC" reels. |
| **Coffee openings** | 13 | **High** | Strong local lifestyle content; cafe/roaster sponsors, morning-show adjacency. High volume from Pitch coffee tag + Sipps. |
| **Grand opening** | 10 | **Medium–High** | Mixed retail/services; sponsor as "welcome to the neighborhood" local business spotlights. |
| **Entertainment opening** | 4 | **Medium** | Venue/attraction content; ticket partners, experience brands. Some rows are venue reviews vs. hard openings. |
| **Boutique opening** | 2 | **Medium** | Retail/local maker sponsors; low volume today. |
| **Hotel opening** | 0 | **N/A** | No current feed matches; Visit KC PR may surface when new properties announce. |

**Overall sponsor potential: Medium–High.** Pitch KC Sipps alone delivers ~34 named, dated local businesses — the highest sponsor-ready opening inventory in the pipeline. Coffee + restaurant categories (24 rows) are the strongest monetization cluster.

---

## What Changed

### New shared module: `business-openings-shared.ts`

- RSS parsing, opening signal detection, category classification
- KC Sipps `<b>Business:</b>` block extraction from Opening sections
- Address, neighborhood, opening date, website parsing
- Six category classifiers per user spec

### New providers

| Provider | Method |
|---|---|
| `pitch-openings.ts` | 9 RSS feeds (Sipps, dining, new-restaurants, new-business, business, coffee, boutique, entertainment, restaurant) |
| `inkc-openings.ts` | Main site RSS + opening keyword filter + lifestyle exclusions |
| `visitkc-openings.ts` | news.visitkc.com RSS + opening filter + `#business-opening` URL suffix |

### Scanner

- `insertBusinessOpeningOpportunity` + `buildBusinessOpeningMetadata`
- Metadata keys: `pitchOpenings`, `inkcOpenings`, `visitkcOpenings`
- `event_starts_at` set from `openingDate`

**Stored fields (per metadata block):**

| User field | Storage |
|---|---|
| businessName | `metadata.*.businessName`, `topic` |
| category | `metadata.opportunityCategory`, `metadata.*.category` |
| openingDate | `event_starts_at`, `metadata.*.openingDate` |
| address | `metadata.*.address` |
| neighborhood | `metadata.*.neighborhood`, `location_name` |
| website | `metadata.*.website` |
| sourceUrl | `source_url`, `metadata.*.sourceUrl` |
| openingFlag | `metadata.*.openingFlag = true` |

---

## Sample Rows

**Pitch KC Sipps (restaurant):**

- **District Biskuits** — restaurant_opening — from KC Sipps roundup
- **The Laos House** — grand_opening — new location opening

**Pitch KC Sipps (coffee):**

- **Café 333** — grand_opening
- **PH Coffee** — coffee_opening

**Visit KC (entertainment):**

- **Smithsonian Magazine: The World's First Barbecue Museum** — entertainment_opening — "now open in Kansas City"

---

## Commands

```bash
cd services/core && pnpm migrate:business-openings
pnpm seed
curl -X POST http://localhost:4000/api/scanner/run
```

---

## Files Added / Modified

### New

```
services/core/src/providers/business-openings-shared.ts
services/core/src/providers/pitch-openings.ts
services/core/src/providers/inkc-openings.ts
services/core/src/providers/visitkc-openings.ts
services/core/src/scripts/migrate-business-openings.ts
db/migrations/18_business_openings_source_types.sql
db/init/18_business_openings_source_types.sql
PHASE_2I_BUSINESS_OPENINGS_RESULTS.md
```

### Modified (wiring only)

```
services/core/src/providers/index.ts
services/core/src/schema.ts
services/core/src/scanner/index.ts
services/core/src/scripts/seed.ts
services/core/package.json
```

### Not modified

- All existing providers (`pitch-dining.ts`, `visitkc.ts`, etc.)
- Scoring, ranking, dashboard UI

---

## Phase 2I Complete

Business openings — a core Kellie audience pillar — now has **38 live, opening-tagged rows** with category classification across coffee, restaurant, grand opening, entertainment, and boutique types. Pitch KC Sipps parsing is the primary high-quality source; Visit KC adds tourism-angle openings; In Kansas City is wired for future hits.
