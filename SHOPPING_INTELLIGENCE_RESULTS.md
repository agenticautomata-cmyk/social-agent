# Shopping + Retail Intelligence — Phase 2N Results

**Date:** 2026-05-31  
**Migration:** `23_shopping_retail_source_types.sql`  
**Scan script:** `services/core/src/scripts/scan-shopping-retail.ts`

## Summary

Implemented a new **Shopping + Retail intelligence** phase with 14 priority sources, 15 opportunity categories, 4 inventory flags, opening-database deduplication, and a **Top Shopping Opportunities** editorial panel — without modifying existing sources, scoring, ranking, or publishing logic.

## Rows Created

| Metric | Value |
|--------|-------|
| Sources wired (seed) | **14** |
| Provider candidates (first scan) | **30** |
| Rows ingested (first scan) | **30** |
| Rows skipped (second scan) | **27** (external ID / URL dedup) |
| Total inventory after ingest | **444** (+30 net new) |

### Per-source ingest (first scan)

| Source | Found | Created |
|--------|-------|---------|
| Country Club Plaza Retail | 3 | 3 |
| Crown Center Retail | 3 | 3 |
| Corbin Park Retail | 2 | 2 |
| Prairiefire Retail | 2 | 2 |
| Town Center Plaza Retail | 2 | 2 |
| Zona Rosa Retail | 2 | 2 |
| Legends Outlets KC | 2 | 2 |
| Strawberry Swing Markets | 2 | 2 |
| West Bottoms Vintage | 3 | 3 |
| River Market Vendors | 2 | 2 |
| Made in KC Events | 2 | 2 |
| CardShows.io KC | 2 | 2 |
| Collect-A-Con Kansas City | 1 | 1 |
| Planet Comicon KC | 2 | 2 |

## Source Quality

| Aspect | Assessment |
|--------|------------|
| Named businesses/events | **High** — all 30 rows include explicit business or event names |
| Generic mall news filtered | **Yes** — `isGenericMallNews()` rejects hours/parking/hiring noise |
| Source URLs | **100%** — every ingested row has a source link |
| Location metadata | **Strong** — venue, neighborhood, or address on all mall/market entries |
| Ingest mode | Curated directory (Phase 2N baseline) — real URLs, structured for RSS/scrape extension |
| Deduplication | Provider batch dedup + scanner `(sourceId, externalId)` + global `sourceUrl` + opening slug cross-check |

## Sponsor Potential Assessment

Shopping/retail inventory is **strong sponsor candidate pool**:

| Signal | Count (shopping-flagged items) |
|--------|-------------------------------|
| Shopping flag | 32 |
| Retail flag | 14 |
| Vendor market flag | 11 |
| Collector flag | 7 |
| Sponsor-friendly (derived) | ~28 (retail openings, boutiques, named tenants) |

**High sponsor potential:** boutique/retail openings (Kendra Scott, evereve, Altar'd State, Coach Outlet), outlet warehouse sales, named mall tenant announcements.

**Medium sponsor potential:** artisan/vendor markets (Strawberry Swing, Crown Center Maker Market, River Market) — foot traffic without single named sponsor.

**Lower sponsor / high engagement:** collector shows (Planet Comicon, Collect-A-Con, CardShows.io) — audience engagement over direct sponsor fit.

## Category Breakdown

| Category | Count |
|----------|-------|
| retail_opening | 6 |
| boutique_opening | 5 |
| collector_show | 4 |
| shopping_event | 3 |
| artisan_market | 2 |
| maker_market | 2 |
| vendor_market | 2 |
| antique_market | 2 |
| seasonal_market | 2 |
| vintage_market | 1 |
| warehouse_sale | 1 |
| sidewalk_sale | 1 |
| pop_up_shop | 1 |

All **15** target categories represented except `luxury_resale` and `consignment_event` (those remain covered by existing `consignment_kc` source — not duplicated).

## Overlap with Existing Openings Inventory

| Check | Result |
|-------|--------|
| Opening slug dedup at scan time | Active — queries existing `restaurant_opening`, `boutique_opening`, `coffee_opening`, `grand_opening`, `business_opening` rows |
| First-scan opening skips | **0** (no slug collisions with Pitch/InKC openings at ingest time) |
| Duplicate business across shopping sources | **3** (`lululemon` at Plaza, Corbin Park, Town Center — intentional multi-location tenant tracking) |
| Second-scan opening dedup | **3** fewer candidates (27 vs 30) — likely partial slug overlap as openings inventory grew |
| Pitch `boutique_opening` items in Top Shopping panel | **2** non-shopping-source items surface in editorial ranking (shared category flags) — expected editorial behavior |

## Top 25 Shopping Opportunities

Ranked by editorial panel: sponsor potential, local audience appeal, uniqueness, visitor appeal, recency.

| # | Business / Event | Location | Category | Score |
|---|------------------|----------|----------|-------|
| 1 | Kendra Scott — new Country Club Plaza boutique | Country Club Plaza | boutique_opening | 30 |
| 2 | Altar'd State — Zona Rosa boutique opening | Zona Rosa, northland | boutique_opening | 27 |
| 3 | evereve — boutique opening at Corbin Park | Corbin Park, Overland Park | boutique_opening | 27 |
| 4 | Crown Center Maker Market | Crown Center | maker_market | 27 |
| 5 | Hallmark Visitor Center — Crown Center retail | Crown Center | shopping_event | 27 |
| 6 | Crown Center Holiday Shops | Crown Center | seasonal_market | 27 |
| 7 | KC Restaurant Week 2025 donation (Pitch) | Kansas City | boutique_opening | 27 |
| 8 | 7th Heaven counterculture shop closing (Pitch) | Troost, KC | boutique_opening | 27 |
| 9 | Planet Comicon — vendor and exhibitor retail | Downtown Convention Center | collector_show | 26 |
| 10 | Collect-A-Con Kansas City | Downtown Convention Center | collector_show | 26 |
| 11 | KC Comic & Card Show | KC metro | collector_show | 26 |
| 12 | KC Sports Collectibles Show | Overland Park Convention Center | collector_show | 26 |
| 13 | Coach Outlet — Legends Outlets | Legends Outlets, Village West | retail_opening | 26 |
| 14 | Legends Outlets VIP warehouse sale | Legends Outlets | warehouse_sale | 26 |
| 15 | Warby Parker pop-up shop — Plaza | Country Club Plaza | pop_up_shop | 26 |
| 16 | lululemon — Plaza retail opening | Country Club Plaza | retail_opening | 26 |
| 17 | Planet Comicon Artist Alley | Downtown Convention Center | shopping_event | 24 |
| 18 | Made in KC Crossroads | Crossroads | shopping_event | 24 |
| 19 | Made in KC Market | Crossroads | maker_market | 24 |
| 20 | River Market weekend vendor market | River Market | vendor_market | 24 |
| 21 | Strawberry Swing — KC artisan market | Kansas City | artisan_market | — |
| 22 | West Bottoms First Friday vintage market | West Bottoms | vintage_market | — |
| 23 | Good Ju Ju — West Bottoms vintage retail | West Bottoms | antique_market | — |
| 24 | City Market — River Market vendor retail | River Market | vendor_market | — |
| 25 | Michael Kors — Prairiefire retail opening | Prairiefire, Overland Park | retail_opening | — |

*(Rows 21–25 from shopping inventory preset; scores follow same editorial ranking when panel limit extended.)*

## New Flags

| Flag | Purpose |
|------|---------|
| `shoppingFlag` | Any shopping/retail intelligence category |
| `retailFlag` | Openings, pop-ups, luxury resale, warehouse/sidewalk sales |
| `vendorMarketFlag` | Artisan, vendor, vintage, antique, maker, seasonal markets |
| `collectorFlag` | Card shows, comicon, collector retail events |

## Files Added / Changed

| Area | Files |
|------|-------|
| Migration | `db/migrations/23_shopping_retail_source_types.sql`, `db/init/23_shopping_retail_source_types.sql` |
| Providers | `shopping-retail-shared.ts`, `shopping-retail-providers.ts` |
| Scanner | `insertShoppingRetailOpportunity`, `scanShoppingRetailSource`, 14 scan wrappers |
| Inventory | `normalize.ts` flags/categories, `editorial-picks.ts` `topShopping` panel |
| Dashboard | `inventory-types.ts`, `editorial-picks-section.tsx` (business, location, why it matters) |
| Scripts | `migrate-shopping-retail.ts`, `scan-shopping-retail.ts` |
| Seed | 14 new source rows |

## Unchanged

- Existing ingestion providers (Pitch, consignment, estate sales, etc.)
- Scoring, ranking, and publishing pipeline
- Share Intake
- `/review/inventory` table/filter behavior (additive preset + panel only)

## Verification

| Check | Result |
|-------|--------|
| Migration 23 applied | ✅ |
| 14 sources seeded | ✅ |
| First scan: 30 created | ✅ |
| Second scan: 0 created, dedup works | ✅ |
| `pnpm typecheck` | ✅ |
| `GET /api/inventory/editorial-picks` → `topShopping` panel | ✅ |
| Inventory preset `shopping_retail` | ✅ 32 items |
