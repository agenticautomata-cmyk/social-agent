# Phase 2H — Estate Sales Sources Results

**Date:** 2026-05-31  
**Status:** Complete — live estate sale opportunities ingested via EstateSales.net, EstateSales.org, and Brown Button  
**Scope:** Estate sales sources only (priorities 1–3 from CONTENT_BALANCE_REPORT.md)  
**Out of scope (as requested):** Existing provider changes, scoring, ranking, UI logic

---

## Summary

Phase 2H addresses the largest content gap identified in CONTENT_BALANCE_REPORT.md: **Estate Sales = 0 rows (0%)** before this phase.

Three new sources were added:

1. **EstateSales.net Kansas City** (`source_type = estate_sales_net`) — NGRX embedded JSON scrape from 10 KC-metro ZIP listing pages
2. **EstateSales.org Kansas City** (`source_type = estate_sales_org`) — metro listing scrape + JSON-LD Event detail pages
3. **Brown Button Estate Sales** (`source_type = brown_button_estates`) — official company upcoming-sales calendar scrape

**40 new estate-sale rows** ingested on first scan (23 EstateSales.net + 6 EstateSales.org + 11 Brown Button). Second scan created **0 duplicates**. All rows carry `estateSaleFlag: true` and `opportunityCategory: 'estate_sale'`.

Total ingested inventory: **216 → 256 rows** (+40).

---

## Source Evaluation (Pre-Implementation)

Evaluated against user priority: EstateSales.net → EstateSales.org → company calendars → public RSS.

| Priority | Source | URL / Method | Format | Status | Verdict |
|---|---|---|---|---|---|
| **1** | **EstateSales.net KC** | `estatesales.net/MO/Kansas-City/{zip}` (10 ZIP pages) | Angular NGRX_STATE JSON in `<script type="application/json">` | HTTP 200 | **Selected** — richest structured data |
| 1b | EstateSales.net metro | `estatesales.net/KS-MO/Kansas-City` | Same JSON | HTTP 200, only ~20 rows | ZIP pages preferred for coverage |
| 1c | EstateSales.net RSS | `/feed` on ZIP pages | RSS | HTTP 404 | **Rejected** — no public feed |
| **2** | **EstateSales.org KC** | `estatesales.org/estate-sales/mo/kansas-city` | HTML listing + JSON-LD Event on detail pages | HTTP 200 | **Selected** |
| 2b | EstateSales.org legacy URLs | `/Kansas-City-MO`, `/MO/Kansas-City` | — | HTTP 404 | **Rejected** — URL pattern changed |
| **3** | **Brown Button** | `brownbutton.com/upcoming-estate-sales/` | Elementor HTML + "Bidding open" date hints | HTTP 200, 11 active sales | **Selected** — official KC company calendar |
| 3b | Brown Button WP API | `/wp-json/wp/v2/estate_sales` | JSON | HTTP 200 | Not used — mixes ended sales with upcoming |
| 3c | Brown Button KC landing | `/kansas-city-estate-sales/` | HTML | No listing links | Upcoming page used instead |
| **4** | Public estate sale RSS | EstateSales.net + EstateSales.org `/feed` | RSS | HTTP 404 both | **Rejected** — no public RSS found |

### Why these three

| Criterion | EstateSales.net | EstateSales.org | Brown Button |
|---|---|---|---|
| **Priority rank** | #1 marketplace | #2 marketplace | #3 official company |
| **Structured data** | Full sale rows (dates, address, company, geo) | JSON-LD Event schema | Title + bidding date range |
| **KC metro coverage** | 23 active sales across MO/KS ZIPs | 6 sales on metro page | 11 upcoming KC-region sales |
| **Address capture** | Direct from sale row | JSON-LD PostalAddress | Limited (online sales) |
| **Company capture** | `orgName` field | JSON-LD organizer | Fixed: Brown Button Estate Sale Services |
| **Dedup key** | Numeric sale ID | Trailing listing ID | URL slug |

---

## What Changed

### New provider: `estate-sales-net.ts`

- Fetches 10 KC-metro ZIP listing pages (64108, 64111, 64112, 64114, 64106, 66204, 66221, 66209, 64086, 64055)
- Parses embedded `NGRX_STATE.ui.sales.saleRows` JSON from Angular SSR
- Builds canonical sale URLs (`/{state}/{city}/{zip}/{id}` or `/marketplace/{id}`)
- Filters to 60-day horizon; deduplicates across ZIP pages by sale ID
- Infers neighborhood from title/address via shared KC location clues

### New provider: `estate-sales-org.ts`

- Scrapes metro listing page for sale detail links
- Fetches each detail page; parses `application/ld+json` Event schema
- Extracts title, start/end dates, address, city, company (organizer), URL
- Rate-limited sequential fetches (300ms delay, max 40 details)

### New provider: `brown-button-estates.ts`

- Scrapes official upcoming sales page for `estate_sales` links
- Parses "Bidding open May 26th–31st" date ranges from card text
- Infers city from sale title (Kansas City, Overland Park, Prairie Village, etc.)
- Company fixed to Brown Button Estate Sale Services

### Scanner wiring

- New `insertEstateSaleOpportunity` + `buildEstateSaleMetadata` (separate from free-event helper)
- Three scan handlers: `scanEstateSalesNetSource`, `scanEstateSalesOrgSource`, `scanBrownButtonEstatesSource`
- Dedup: per-source `(source_id, source_external_id)` + cross-source `source_url`

**Stored per item (metadata key varies by source):**

| Field | Storage |
|---|---|
| Title | `topic` |
| Start date | `event_starts_at`, `metadata.*.eventStartsAt` |
| End date | `event_ends_at`, `metadata.*.eventEndsAt` |
| Address | `metadata.*.address` |
| Neighborhood | `metadata.*.neighborhood`, `location_name` (hint) |
| City | `metadata.*.city` |
| Company | `metadata.*.company` |
| URL | `source_url`, `metadata.*.url` |
| Tags | `metadata.opportunityCategory = 'estate_sale'`, `metadata.*.estateSaleFlag = true` |

Metadata keys: `estateSalesNet`, `estateSalesOrg`, `brownButtonEstates`

---

## Live Scan Results

### First scan (2026-05-31)

| Source | Found | Created | Skipped |
|---|---|---|---|
| EstateSales.net Kansas City | 23 | 23 | 0 |
| EstateSales.org Kansas City | 6 | 6 | 0 |
| Brown Button Estate Sales | 11 | 11 | 0 |
| **Total new estate sales** | **40** | **40** | **0** |

All other existing sources re-scanned with 0 new rows (dedup working).

### Second scan (dedup verification)

| Source | Found | Created | Skipped |
|---|---|---|---|
| EstateSales.net Kansas City | 23 | 0 | 23 |
| EstateSales.org Kansas City | 6 | 0 | 6 |
| Brown Button Estate Sales | 11 | 0 | 11 |

**0 duplicates created** on repeat scan.

---

## Field Coverage (40 estate sale rows)

| Field | Populated | Rate |
|---|---|---|
| Title | 40 | 100% |
| Start date | 27 | 68% |
| End date | 29 | 73% |
| Address | 16 | 40% |
| Neighborhood | 27 | 68% |
| City | 40 | 100% |
| Company | 35 | 88% |
| URL | 40 | 100% |
| `estateSaleFlag` | 40 | 100% |
| `opportunityCategory` | 40 | 100% |

Address gaps are expected for online-only auctions where EstateSales.net withholds street address until sale day. Brown Button online sales similarly lack street addresses.

---

## Sample Ingested Rows

**EstateSales.net (in-person sale with address):**

- **Easy PZ Overland Park Estate Sale** — 7612 Eby Avenue, Overland Park — Easy Pz Estate Sales, LLC — May 29–31
- **BB Realty and Auctions Live Auction in Lees Summit** — 1820 Northeast County Park Road — May 31

**EstateSales.net (online auction):**

- **Sunset Hills 6,000+ sf Contemporary Art Fashion & Design Online Estate Sale** — Kansas City — Brown Button — May 29–Jun 2

**EstateSales.org (JSON-LD):**

- **June Gold and Silver Coin Auction** — Kansas City — KC Auction & Appraisal Company — online through Jun 3

**Brown Button (company calendar):**

- **Eclectic Antique & Contemporary Kansas City Online Estate Sale** — Kansas City — Bidding open May 26th–31st

---

## Content Balance Impact

| Metric | Before 2H | After 2H |
|---|---|---|
| Total ingested rows | 216 | 256 |
| Estate sale rows | 0 (0%) | 40 (15.6% of new total) |
| Largest gap (estate sales) | Empty | **Filled** |

Estate sales now represent the fourth-largest source category by row count, directly addressing the #1 recommendation in CONTENT_BALANCE_REPORT.md.

---

## Cross-Source Overlap Note

Some sales appear on both EstateSales.net and Brown Button (or EstateSales.org) with **different URLs** — e.g., Brown Button online sales link to `brownbutton.com/estate_sales/...` while EstateSales.net uses `estatesales.net/...`. Per-source and URL dedup prevents re-ingestion within a source; cross-marketplace duplicates with different URLs are retained intentionally since each URL is a distinct discovery path.

---

## Database & Config

### Migration

```bash
cd services/core && pnpm migrate:estate-sales
```

Adds enum values: `estate_sales_net`, `estate_sales_org`, `brown_button_estates`

### Seed sources

```bash
cd services/core && pnpm seed
```

### Trigger scan

```bash
curl -X POST http://localhost:4000/api/scanner/run
```

Requires `ENABLE_KC_SCANNER=ON`.

---

## Files Added / Modified

### New files

```
services/core/src/providers/estate-sales-net.ts          (new)
services/core/src/providers/estate-sales-org.ts        (new)
services/core/src/providers/brown-button-estates.ts    (new)
services/core/src/scripts/migrate-estate-sales.ts      (new)
db/migrations/17_estate_sales_source_types.sql         (new)
db/init/17_estate_sales_source_types.sql               (new)
PHASE_2H_ESTATE_SALES_RESULTS.md                       (new)
```

### Modified (wiring only — no existing provider edits)

```
services/core/src/providers/index.ts                   (exports)
services/core/src/schema.ts                            (source_type enum)
services/core/src/scanner/index.ts                     (scan + insert handlers)
services/core/src/scripts/seed.ts                      (3 source seed blocks)
services/core/package.json                             (migrate:estate-sales script)
```

### Not modified (per requirements)

- All existing provider files (`reddit.ts`, `visitkc.ts`, `kc-parks.ts`, etc.)
- Scoring / ranking / LLM opportunity logic
- Dashboard UI (`dashboard/lib/opportunities-ui.ts`)

---

## Verification Checklist

- [x] Migration 17 applied (`estate_sales_net`, `estate_sales_org`, `brown_button_estates`)
- [x] Three sources seeded and active
- [x] Live scan ingested 40 estate sale rows
- [x] Repeat scan created 0 duplicates
- [x] All rows tagged `opportunityCategory: 'estate_sale'` and `estateSaleFlag: true`
- [x] Required fields captured (title, dates, address, neighborhood, city, company, URL)
- [x] No existing providers modified
- [x] No scoring, ranking, or UI changes

---

## Phase 2H Complete

Estate sales — the largest content gap — is now populated with 40 live KC-metro opportunities from the top three source tiers. Public RSS feeds were evaluated and rejected (404 on both marketplaces). Ready for next audience-alignment phase when directed.
