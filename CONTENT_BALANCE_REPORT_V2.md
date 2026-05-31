# Content Balance Report V2

**Date:** 2026-05-31  
**Scope:** All 385 ingested opportunities in the database (post-Phase 2K Revenue Alignment)  
**Method:** Full Postgres export + `metadata.opportunityCategory`, ingest keys, and revenue flags  
**No scoring, ranking, or UI changes** — source ingestion only

---

## Executive Summary

Phase 2K adds **48 sponsor-oriented revenue rows** across hotel packages, spa packages, date nights, luxury dining, rooftop experiences, and wine tastings. Total inventory grows from **328 → 385 rows** (+17.4%).

| Finding | Detail |
|---|---|
| Total ingested rows | **385** across **30 active sources** |
| Phase 2K net-new rows | **48** (10 revenue-alignment sources) |
| Sponsor inventory | **188 rows (48.8%)** — named businesses, bookable experiences, premium categories |
| Traffic inventory | **129 rows (33.5%)** — free events + Reddit discussion |
| Revenue category rows | **49 rows (12.7%)** — hotel, spa, date night, luxury dining, rooftop, wine, couples, getaway |
| Largest remaining gap | **Dynamic hotel/spa deal scraping** — directories are evergreen, not time-bound promotions |
| Highest sponsorship potential | **Hotel packages (9)**, **Date nights (12)**, **Luxury dining (6)**, **Estate sales (40)** |

**Bottom line:** Phase 2K materially shifts the feed toward Kellie's revenue pillars. Sponsor inventory now approaches **half the feed** (up from ~35% pre-2K). Traffic-heavy free/community content still occupies one-third, but the luxury lifestyle, dining, and date-night verticals are no longer hollow categories.

---

## Methodology

Each row classified by:

1. **`metadata.opportunityCategory`** (authoritative when set)
2. **`metadata.ingest`** and source-specific metadata keys (`kcHotelPackages`, `kauffmanDateNights`, etc.)
3. Revenue flags: `hotelFlag`, `spaFlag`, `dateNightFlag`, `luxuryFlag`, `rooftopFlag`

**Sponsor inventory** = rows in sponsor-friendly categories OR carrying explicit revenue/opening/consignment flags.  
**Traffic inventory** = `free` + `discussion` categories (community calendar + Reddit noise).

---

## 1. Content Mix Percentages

### By category (`opportunityCategory`)

| Category | Count | % of Total | Δ vs V1 (328 rows) |
|---|---|---|---|
| **free** | 83 | **21.6%** | −16.6pp (was 38.4% at 216 rows; diluted by growth) |
| **discussion** | 46 | **11.9%** | stable share |
| **estate_sale** | 40 | **10.4%** | +4.0pp (Phase 2H) |
| **dining** | 20 | **5.2%** | stable |
| **match** (Sporting KC) | 20 | **5.2%** | stable |
| **performance** (Kauffman general) | 16 | **4.2%** | stable |
| **date_night** | 12 | **3.1%** | **+2.8pp (Phase 2K)** |
| **restaurant_opening** | 14 | **3.6%** | Phase 2I |
| **coffee_opening** | 13 | **3.4%** | Phase 2I |
| **consignment_shop** | 10 | **2.6%** | Phase 2J |
| **hotel_package** | 9 | **2.3%** | **+2.3pp (Phase 2K)** |
| **business_closing** | 9 | **2.3%** | Phase 2J |
| **wine_tasting** | 7 | **1.8%** | **+1.8pp (Phase 2K)** |
| **luxury_dining** | 6 | **1.6%** | **+1.6pp (Phase 2K)** |
| **rooftop_experience** | 6 | **1.6%** | **+1.6pp (Phase 2K)** |
| **spa_package** | 5 | **1.3%** | **+1.3pp (Phase 2K)** |
| **couples_event** | 2 | **0.5%** | **+0.5pp (Phase 2K)** |
| **weekend_getaway** | 1 | **0.3%** | **+0.3pp (Phase 2K)** |
| Other (news, deal, event, etc.) | 54 | **14.0%** | — |

### By content pillar (cluster view)

| Pillar | Rows | % | Notes |
|---|---|---|---|
| **Free / Community** | 94 | **24.4%** | Parks, library, first Fridays, generic events |
| **Discussion / Noise** | 46 | **11.9%** | Reddit |
| **Shopping & Deals** | 51 | **13.3%** | Estate sales, consignment, liquidation |
| **Dining & Openings** | 77 | **20.0%** | Restaurant week, Pitch dining, all opening categories |
| **Revenue / Sponsor** | 49 | **12.7%** | Phase 2K revenue categories |
| **Date Night & Entertainment** | 34 | **8.8%** | Kauffman date nights + performances + rooftops |
| **Sports** | 20 | **5.2%** | Sporting KC |
| **Other** | 14 | **3.6%** | News, attractions, closings |

```
Free/Community     ████████████████████████   24.4%
Dining/Openings    ████████████████████       20.0%
Shopping/Deals     █████████████              13.3%
Revenue/Sponsor    ████████████               12.7%
Discussion         ███████████                11.9%
Date Night/Ent.    ████████                    8.8%
Sports             █████                       5.2%
Other              ███                         3.6%
```

---

## 2. Sponsor Inventory Percentages

| Tier | Definition | Rows | % of Total |
|---|---|---|---|
| **Primary sponsor inventory** | Hotel, spa, date night, luxury dining, rooftop, wine, couples, getaway, estate sale, consignment, restaurant week, premium openings | **188** | **48.8%** |
| **Secondary engagement** | Performances, general dining, closings, deals, attractions | **68** | **17.7%** |
| **Traffic / off-brand** | Free events, Reddit discussion, generic community | **129** | **33.5%** |

### Phase 2K contribution to sponsor inventory

| Phase 2K Source | Rows | Sponsor Tier |
|---|---|---|
| Kauffman Date Nights | 12 | Primary — ticketed date-night performances |
| KC Hotel Packages | 6 | Primary — named luxury hotels with packages |
| Chef Tasting Menus | 6 | Primary — fine dining, chef-driven |
| KC Rooftop Bars | 6 | Primary — bookable date-night venues |
| KC Wine Tastings | 5 | Primary — tasting rooms, wine dinners |
| KC Spa Packages | 5 | Primary — bookable spa packages |
| Casino Hotel Packages | 3 | Primary — casino resort packages |
| Visit KC Luxury Experiences | 2 | Secondary — editorial PR |
| Romantic Restaurant Events | 2 | Primary — couples dining events |
| Visit KC Romantic Weekends | 1 | Secondary — editorial listicle |
| **Phase 2K total** | **48** | **100% sponsor-oriented** |

**Pre-2K sponsor inventory:** ~140 rows (42.7% of 328)  
**Post-2K sponsor inventory:** 188 rows (**48.8%** of 385)  
**Δ:** +48 rows, **+6.1 percentage points** toward sponsor-friendly mix

---

## 3. Estimated Advertiser Appeal by Category

Scored on: local business specificity, booking/revenue intent, category commercial value, and content postability for Kellie's luxury lifestyle audience.

| Category | Rows | Advertiser Appeal | Rationale |
|---|---|---|---|
| **hotel_package** | 9 | ★★★★★ **Very High** | Named hotels (21c, Loews, Raphael, Crossroads, casino resorts). Direct hospitality sponsor fit. Package pages drive affiliate and sponsored stay content. |
| **date_night** | 12 | ★★★★★ **Very High** | Kauffman evening performances with dates, venues, ticket URLs. Ideal "dinner + show" content. Ticket partners and restaurant adjacency. |
| **estate_sale** | 40 | ★★★★☆ **High** | Treasure-hunt audience; estate sale companies as repeat sponsors. High engagement, moderate direct ad value. |
| **luxury_dining** | 6 | ★★★★★ **Very High** | Corvino, Bluestem, Antler Room, Savoy — chef tasting menus. Restaurant sponsors, wine partners, reservation platforms. |
| **spa_package** | 5 | ★★★★☆ **High** | Elms, Spa on Penn, Loews Spa — couples packages. Wellness and hospitality sponsors. |
| **rooftop_experience** | 6 | ★★★★☆ **High** | Percheron, Nine Zero One, Mercury Room — skyline date nights. Bar/lounge and hotel sponsors. |
| **wine_tasting** | 7 | ★★★★☆ **High** | Amigoni, Edgecombe, Cellar 222 — tasting events. Winery and restaurant wine-program sponsors. |
| **restaurant_opening** | 14 | ★★★★☆ **High** | Named new restaurants with dates. Local business spotlight sponsors. |
| **consignment_shop** | 10 | ★★★★☆ **High** | Luxury resale boutiques. Fashion/lifestyle affiliate potential. |
| **coffee_opening** | 13 | ★★★☆☆ **Medium–High** | High volume; cafe sponsors but lower ticket value. |
| **couples_event** | 2 | ★★★★☆ **High** | Low volume; high intent when present. |
| **weekend_getaway** | 1 | ★★★☆☆ **Medium** | Editorial; needs structured package data for booking CTAs. |
| **performance** (general) | 16 | ★★★☆☆ **Medium** | Kauffman general calendar; overlaps date_night subset. |
| **free** | 83 | ★☆☆☆☆ **Low** | Community engagement; minimal sponsor value. |
| **discussion** | 46 | ★☆☆☆☆ **Low** | Reddit noise; not sponsor-ready. |

---

## 4. Categories with Highest Sponsorship Potential

Ranked by: (rows × appeal score × revenue intent)

| Rank | Category | Rows | Weighted Potential | Best Sponsor Types |
|---|---|---|---|---|
| **1** | **hotel_package** | 9 | **Very High** | Hotels, tourism boards, booking platforms, casino resorts |
| **2** | **date_night** | 12 | **Very High** | Kauffman Center, restaurants, rideshare, florists, jewelers |
| **3** | **luxury_dining** | 6 | **Very High** | Fine dining, wine distributors, reservation apps |
| **4** | **estate_sale** | 40 | **High** | Estate sale companies, auction houses, storage, moving |
| **5** | **spa_package** | 5 | **High** | Spas, wellness brands, hotels with spa packages |
| **6** | **rooftop_experience** | 6 | **High** | Hotels, craft spirits, luxury lifestyle brands |
| **7** | **wine_tasting** | 7 | **High** | Wineries, wine bars, Plaza/Westport restaurants |
| **8** | **restaurant_opening** | 14 | **High** | New restaurants, food brands, delivery platforms |
| **9** | **consignment_shop** | 10 | **High** | Fashion resale, luxury consignment, lifestyle |
| **10** | **coffee_opening** | 13 | **Medium–High** | Cafes, roasters, morning-show adjacency |

**Top 3 categories for immediate monetization:** hotel packages, date nights, luxury dining — together **27 rows** of named, bookable, premium inventory.

---

## 5. Top Remaining Gaps After Phase 2K

| Gap | Current State | Impact | Recommended Next Source |
|---|---|---|---|
| **Dynamic hotel deal scraping** | 9 directory rows; no live package prices | High — sponsors want current offers | Scrape 21c, Loews, Raphael special-offers pages |
| **Spa promotion calendar** | 5 evergreen directory rows | Medium — no seasonal promos | Spa on Penn / Elms events calendar scrape |
| **Couples events volume** | 2 rows | Medium — high intent, low volume | Visit KC events calendar + restaurant Valentine's filters |
| **Weekend getaway packages** | 1 editorial row | Medium — staycation pillar still thin | Hotel package RSS/API integrations |
| **Romantic restaurant events** | 2 Pitch RSS rows | Medium — filter too strict or sparse feed | Expand to In KC dining + OpenTable events |
| **Wine tasting calendar** | 5 directory + 2 RSS | Low–Medium — need dated events | Amigoni / Cellar 222 event page scrape |
| **Sports sponsor inventory** | 20 Sporting KC only | Medium — Chiefs/Royals absent | Phase 2L sports sponsors (Chiefs, Royals) |
| **Real-time rooftop events** | 6 evergreen venues | Low — need seasonal programming | Per-venue Instagram/event scrape |
| **Date night beyond Kauffman** | 12 performance rows | Medium — no comedy clubs, jazz clubs | Green Lady Lounge, Blue Room, Folly Theater |
| **Affiliate-ready booking URLs** | Partial coverage | High — limits conversion | Deep-link hotel/spa booking pages in metadata |

---

## 6. Source Concentration (Post-2K)

| Source | Count | % | Sponsor-Ready |
|---|---|---|---|
| r/kansascity | 73 | 19.0% | Low |
| KC Parks Events | 50 | 13.0% | Low |
| The Pitch KC Openings | 36 | 9.4% | Medium–High |
| KC Library Events | 29 | 7.5% | Low |
| EstateSales.net | 23 | 6.0% | High |
| Sporting KC | 20 | 5.2% | Medium |
| Visit KC RSS | 20 | 5.2% | Medium |
| Kauffman Center Events | 16 | 4.2% | Medium–High |
| **Kauffman Date Nights** | **12** | **3.1%** | **High** |
| KC Consignment Shops | 10 | 2.6% | High |
| Pitch KC Sipps | 10 | 2.6% | Medium |
| KC Restaurant Week | 10 | 2.6% | Very High |
| **KC Hotel Packages** | **6** | **1.6%** | **Very High** |
| **Chef Tasting Menus** | **6** | **1.6%** | **Very High** |
| **KC Rooftop Bars** | **6** | **1.6%** | **High** |
| **KC Spa Packages** | **5** | **1.3%** | **High** |
| **KC Wine Tastings** | **5** | **1.3%** | **High** |

Top 3 sources (Reddit + Parks + Library) now account for **39.5%** of feed (down from 61% at 216 rows). Sponsor-ready sources account for **~35%** of total row count.

---

## 7. Ideal vs Actual Feed Mix (Revenue-Aligned)

| Bucket | Ideal Target | Actual (385 rows) | Δ | Status |
|---|---|---|---|---|
| Sponsor / Revenue inventory | 45–55% | **48.8%** | on target | ✅ |
| Dining & Openings | 15–20% | **20.0%** | on target | ✅ |
| Shopping & Deals | 10–15% | **13.3%** | on target | ✅ |
| Date Night & Entertainment | 8–12% | **8.8%** | −0.2pp | 🟡 |
| Free / Community | 10–15% | **24.4%** | +9–14pp | 🟡 overweight |
| Discussion / Noise | <5% | **11.9%** | +7–9pp | 🔴 overweight |
| Sports | 5–8% | **5.2%** | on target | ✅ |

---

## 8. Phase 2K Implementation Summary

**10 new sources wired (migration 20):**

| Source Type | Method | Rows |
|---|---|---|
| `visitkc_romantic_weekends` | Visit KC RSS filter | 1 |
| `visitkc_luxury_experiences` | Visit KC RSS filter | 2 |
| `kc_hotel_packages` | Curated hotel directory | 6 |
| `casino_hotel_packages` | Curated casino directory | 3 |
| `spa_packages_kc` | Curated spa directory | 5 |
| `rooftop_bars_kc` | Curated rooftop directory | 6 |
| `wine_tasting_kc` | Curated wine directory | 5 |
| `chef_tasting_menus` | Curated fine dining directory | 6 |
| `kauffman_date_nights` | TNEW API + evening filter | 12 |
| `romantic_restaurant_events` | Pitch RSS filter | 2 |

**Captured fields:** businessName, title, venue, address, neighborhood, eventDate, startDate, endDate, website, sourceUrl  
**Flags:** hotelFlag, spaFlag, dateNightFlag, luxuryFlag, rooftopFlag  
**Dedup verified:** Second scan 0 duplicates created.

---

## 9. Strategic Summary

| Phase | Focus | Rows Added | Sponsor Impact |
|---|---|---|---|
| 2G | Free events | +83 | Traffic ↑ |
| 2H | Estate sales | +40 | Shopping/deals ↑ |
| 2I | Business openings | +38 | Dining/openings ↑ |
| 2J | Closings/deals/consignment | +21 | Shopping/deals ↑ |
| **2K** | **Revenue alignment** | **+48** | **Sponsor inventory ↑↑** |

Phase 2K is the first phase explicitly optimized for **sponsor-friendly inventory over traffic inventory**. The feed now meets the ideal sponsor/revenue target range (48.8% vs 45–55% goal).

**Highest-ROI next steps:**
1. Dynamic hotel/spa offer scrapers (convert evergreen directories → time-bound deals)
2. Comedy/jazz club date-night sources ( diversify beyond Kauffman)
3. Reddit noise reduction or deprioritization in ranking (ranking out of scope — source-side filter only)
4. Sports sponsor phase (Chiefs/Royals/KC Current)

---

## Appendix: Phase 2K Category Breakdown

| Category | Count | Flags Set |
|---|---|---|
| date_night | 12 | dateNightFlag, luxuryFlag |
| hotel_package | 9 | hotelFlag, luxuryFlag |
| wine_tasting | 7 | dateNightFlag |
| rooftop_experience | 6 | rooftopFlag, dateNightFlag, luxuryFlag |
| luxury_dining | 6 | luxuryFlag, dateNightFlag |
| spa_package | 5 | spaFlag, luxuryFlag |
| couples_event | 2 | dateNightFlag, luxuryFlag |
| weekend_getaway | 1 | hotelFlag, luxuryFlag |

**Verification:**

```bash
pnpm --filter @social-agent/core migrate:revenue-alignment
pnpm --filter @social-agent/core seed
cd services/core && npx tsx src/scripts/run-kc-scan.ts

docker exec social_agent_postgres_bootstrap psql -U social_agent -d social_agent -c "
SELECT metadata->>'opportunityCategory' as cat, COUNT(*)
FROM content_items ci JOIN sources s ON s.id = ci.source_id
WHERE s.type LIKE '%hotel%' OR s.type LIKE '%spa%' OR s.type LIKE '%date_night%'
   OR s.type LIKE '%rooftop%' OR s.type LIKE '%wine%' OR s.type LIKE '%chef%'
   OR s.type LIKE '%romantic%' OR s.type LIKE '%luxury_experiences%'
GROUP BY cat ORDER BY count DESC;"
```
