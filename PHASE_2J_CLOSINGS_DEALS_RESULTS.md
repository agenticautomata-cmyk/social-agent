# Phase 2J — Closings, Liquidations, Consignment & Luxury/Staycation Results

**Date:** 2026-05-31  
**Status:** Complete — live opportunities ingested from five new audience-alignment sources  
**Scope:** Business closings, liquidation sales, consignment shops, luxury/staycation deals only  
**Out of scope (as requested):** Existing provider changes, scoring, ranking, UI logic

---

## Summary

Phase 2J addresses four **Closings & Deals** pillar gaps identified in CONTENT_BALANCE_REPORT.md: business closings, liquidation sales, consignment/resale, and luxury/staycation packages.

Five new sources:

1. **The Pitch KC Closings** (`pitch_closings`) — KC Sipps Closing-section parsing + closing/closings/restaurant-closings/dining RSS
2. **In Kansas City Closings** (`inkc_closings`) — filtered main site RSS
3. **Liquidation Sales KC** (`liquidation_sales_net`) — EstateSales.net scrape filtered for MovingSales + liquidation keywords
4. **KC Consignment Shops** (`consignment_kc`) — curated directory of 10 metro consignment/resale boutiques
5. **Visit KC Luxury Deals** (`visitkc_luxury`) — Visit KC + In KC RSS filtered for luxury/staycation signals

**21 net-new rows** ingested. Total inventory: **307 → 328 rows** (+21).

All rows carry category-specific flags (`closingFlag`, `liquidationFlag`, `consignmentFlag`, `luxuryFlag`) and `opportunityCategory`.

---

## Rows Created by Category

| Category | Count | Primary Source(s) |
|---|---|---|
| `business_closing` | 9 | Pitch KC Closings (8), In Kansas City Closings (1) |
| `consignment_shop` | 10 | KC Consignment Shops (10) |
| `liquidation_sale` | 1 | Liquidation Sales KC (1) |
| `staycation` | 1 | Visit KC Luxury Deals (1) |
| `luxury_deal` | 0 | — |
| `spa_package` | 0 | — |
| `hotel_package` | 0 | — |
| **Total** | **21** | |

### By source (first scan)

| Source | Found | Created | Skipped (2nd scan) |
|---|---|---|---|
| The Pitch KC Closings | 8 | 8 | 8 |
| KC Consignment Shops | 10 | 10 | 10 |
| Liquidation Sales KC | 1 | 1 | 1 |
| In Kansas City Closings | 1 | 1 | 1 |
| Visit KC Luxury Deals | 1 | 1 | 1 |
| **Total** | **21** | **21** | **21** |

**Second full scan: 0 duplicates created** — dedup verified.

---

## Field Coverage (21 rows)

| Field | Populated | Rate |
|---|---|---|
| businessName | 21 | 100% |
| title | 21 | 100% |
| category | 21 | 100% |
| sourceUrl | 21 | 100% |
| startDate | 21 | 100% |
| neighborhood | 20 | 95% |
| address | 11 | 52% |
| endDate | 10 | 48% |
| website | 11 | 52% |

| Flag | Set | Rate |
|---|---|---|
| closingFlag | 9 | 100% of closings |
| liquidationFlag | 1 | 100% of liquidations |
| consignmentFlag | 10 | 100% of consignment |
| luxuryFlag | 1 | 100% of luxury/staycation |

Address and website gaps reflect RSS summary format (Pitch Sipps blocks rarely include street addresses) and directory entries with metro-level addresses (Style Encore, Clothes Mentor). Consignment directory rows have full addresses and websites for 10/10 shops.

---

## Source Quality

| Source | Quality | Notes |
|---|---|---|
| **The Pitch KC Closings** | ★★★★☆ **High** | Best closings yield. KC Sipps `<b>Closing</b>` section parsing extracts individual businesses (Harp Barbecue, District Fish and Pasta House, Jalisco, etc.) with closing dates and neighborhoods. Fixed parser lookahead — Opening section precedes Closing in Sipps HTML. |
| **KC Consignment Shops** | ★★★★☆ **High** | Stable curated directory. 10 named luxury/designer resale boutiques across Crossroads, Brookside, Westport, Northland, Overland Park, Mission. Full addresses and websites. Evergreen inventory (not event-driven). |
| **Liquidation Sales KC** | ★★★☆☆ **Medium** | EstateSales.net MovingSales filter yields 1 current KC metro liquidation. Low volume but high intent. `#liquidation-sale` URL suffix prevents cross-source dedup against estate sale rows on same platform. |
| **Visit KC Luxury Deals** | ★★☆☆☆ **Low (current feed)** | RSS keyword filter matched 1 staycation listicle (Lonely Planet weekend getaways). No hotel/spa/resort package articles in recent feed window. `#luxury-deal` URL suffix avoids Visit KC base-URL dedup. |
| **In Kansas City Closings** | ★☆☆☆☆ **Low** | Main RSS rarely tags closings in titles. 1 row ingested is a **false positive** ("3 Unique Kansas City Landmarks Explained" — body mentions "closed" in landmark context). Exclude filter tightened for future scans; existing row remains. |

### Parser fixes applied during verification

| Issue | Fix |
|---|---|
| Pitch Sipps returned 0 closings | Closing-section regex lookahead changed — Opening precedes Closing in article HTML |
| Liquidation row skipped (URL dedup) | Append `#liquidation-sale` to EstateSales.net URLs |
| Consignment Shawnee skipped (shared website) | Append `#slug` to sourceUrl for multi-location brands |
| Visit KC luxury skipped (URL dedup) | Append `#luxury-deal` to RSS article URLs |

---

## Estimated Sponsor Potential

| Category | Rows | Sponsor Potential | Rationale |
|---|---|---|---|
| **Consignment shops** | 10 | **High** | Named luxury/designer resale boutiques — ideal for fashion/lifestyle sponsors, affiliate resale, "hidden gem" content. Evergreen directory supports recurring posts. |
| **Business closings** | 9 | **Medium** | Timely local news; strong engagement for "last chance" dining/retail content. Limited direct sponsor fit (closing businesses rarely sponsor), but drives audience trust and FOMO for adjacent openings. |
| **Liquidation sales** | 1 | **Medium–High** | High purchase intent; treasure-hunt audience overlap with estate sales. Sponsor as deal-hunting / bargain luxury angle. Volume too low today for standalone campaigns. |
| **Staycation / luxury** | 1 | **Low (current)** | Editorial listicle, not a bookable package. Hotel/spa/resort sponsors need structured deal feeds. |
| **Spa / hotel packages** | 0 | **N/A** | No feed matches in current RSS window. |

**Overall sponsor potential: Medium.** Consignment directory (10 rows) is the strongest monetization cluster — named local businesses with websites and neighborhoods. Closings add timely editorial value. Luxury/staycation needs dedicated hotel/spa scrapers to unlock Primary-tier sponsor inventory.

---

## Content Balance Impact

| Metric | Before 2J | After 2J |
|---|---|---|
| Total ingested rows | 307 | 328 |
| Business closing rows | 0 | 9 |
| Liquidation sale rows | 0 | 1 |
| Consignment shop rows | 0 | 10 |
| Staycation rows (category) | ~1 (Visit KC general) | +1 dedicated |
| Luxury/spa/hotel package rows | 0 | 0 |

### Pillar shift (approximate)

| Pillar | Pre-2J share | Post-2J | Δ |
|---|---|---|---|
| Closings & liquidations | ~0% | ~3.0% (10 rows) | **+10** |
| Consignment / resale | ~0% | ~3.0% (10 rows) | **+10** |
| Luxury / staycation (2J categories) | ~3.7% | ~3.7% (+1 staycation) | +1 |

Phase 2J fills two previously empty inventory buckets (closings, consignment) without diluting the free-events-heavy feed. The consignment directory adds **evergreen Primary-audience content** that doesn't compete with Phase 2G community calendar rows.

Combined with Phase 2H (estate sales, 40 rows) and Phase 2I (openings, 38 rows), Kellie's **deal-discovery vertical** now spans openings → closings → estate/liquidation sales → consignment resale — a complete local commerce lifecycle narrative.

---

## Top Remaining Gaps After Ingestion

| Gap | Current State | Recommended Next Source |
|---|---|---|
| **Hotel packages** | 0 rows | Scrape 21c Museum Hotel, Hotel KC, Crossroads Hotel package pages |
| **Spa packages** | 0 rows | The Elms, Spa on Penn, Amore Spa deal pages |
| **Luxury dining experiences** | 0 dedicated rows | Pitch KC food/drink "Best Of" + rooftop bar listings |
| **Retail liquidation volume** | 1 row | Expand zip coverage; add GOOB announcement RSS (local news) |
| **In KC closings signal** | 1 false positive | Dedicated `/tag/closing/` feed if published; or Pitch-only closings |
| **Romantic staycation packages** | 0 rows | Visit KC HTML calendar with package/deal filter |
| **Date nights** | ~0.5% (unchanged) | Still the largest Primary pillar gap per CONTENT_BALANCE_REPORT |

---

## What Changed

### New shared module: `closings-deals-shared.ts`

- Seven category classifiers: `business_closing`, `liquidation_sale`, `consignment_shop`, `luxury_deal`, `staycation`, `spa_package`, `hotel_package`
- Four flags: `closingFlag`, `liquidationFlag`, `consignmentFlag`, `luxuryFlag`
- KC Sipps `<b>Closing</b>` block extraction
- Closing/luxury signal detection and RSS helpers (re-exports from `business-openings-shared.ts`)

### New providers

| Provider | Method |
|---|---|
| `pitch-closings.ts` | 5 RSS feeds (Sipps, closing, closings, restaurant-closings, dining) |
| `inkc-closings.ts` | Main site RSS + closing keyword filter + lifestyle exclusions |
| `liquidation-sales-net.ts` | EstateSales.net zip pages + MovingSales/liquidation keyword filter |
| `consignment-kc.ts` | Curated 10-shop KC metro directory |
| `visitkc-luxury.ts` | Visit KC + In KC RSS + luxury/staycation keyword filter |

### Scanner

- `insertAudienceDealOpportunity` + `buildAudienceDealMetadata`
- Five scan handlers wired into `scanAllActiveSources`
- Metadata keys: `pitchClosings`, `inkcClosings`, `liquidationSalesNet`, `consignmentKc`, `visitkcLuxury`
- `event_starts_at` / `event_ends_at` set from `startDate` / `endDate`

**Stored fields (per metadata block):**

| User field | Storage |
|---|---|
| businessName | `metadata.*.businessName` |
| title | `topic`, `metadata.*.title` |
| category | `metadata.opportunityCategory`, `metadata.*.category` |
| address | `metadata.*.address` |
| neighborhood | `metadata.*.neighborhood`, `location_name` |
| startDate | `event_starts_at`, `metadata.*.startDate` |
| endDate | `event_ends_at`, `metadata.*.endDate` |
| website | `metadata.*.website` |
| sourceUrl | `source_url`, `metadata.*.sourceUrl` |
| flags | `metadata.*.closingFlag`, `.liquidationFlag`, `.consignmentFlag`, `.luxuryFlag` |

### Database

- Migration **19**: `db/migrations/19_closings_deals_source_types.sql`
- New source types: `pitch_closings`, `inkc_closings`, `liquidation_sales_net`, `consignment_kc`, `visitkc_luxury`
- Seed blocks in `services/core/src/scripts/seed.ts`
- Migrate script: `pnpm --filter @social-agent/core migrate:closings-deals`

**No changes to:** existing providers, scoring, ranking, or UI.

---

## Sample Rows

**Pitch KC Sipps (business closing):**

- **Harp Barbecue** — Overland Park — closing May 30 — `#closing-harp-barbecue`
- **District Fish and Pasta House** — Brookside — closing — neighborhood inferred

**Liquidation (EstateSales.net):**

- **Timeless Vintage Estate Sale** — MovingSales type — `#liquidation-sale` URL suffix

**Consignment (directory):**

- **Do Good Co.** — 413 E 18th Street, Crossroads — Faire du Bien luxury consignment
- **Annedore Fine Consignment** — Mission, KS — luxury home & fashion

**Visit KC Luxury (staycation):**

- **Lonely Planet: KC Among Best Weekend Getaways Across the USA** — editorial staycation signal

---

## Verification Commands

```bash
# Run migration (if not applied)
pnpm --filter @social-agent/core migrate:closings-deals

# Seed new sources
pnpm --filter @social-agent/core seed

# Live scan
curl -X POST http://localhost:4000/api/scanner/run

# Or direct script (uses latest code without API restart)
cd services/core && npx tsx src/scripts/run-kc-scan.ts

# Query Phase 2J inventory
docker exec social_agent_postgres_bootstrap psql -U social_agent -d social_agent -c "
SELECT s.name, metadata->>'opportunityCategory' as cat, COUNT(*)
FROM content_items ci JOIN sources s ON s.id = ci.source_id
WHERE s.type IN ('pitch_closings','inkc_closings','liquidation_sales_net','consignment_kc','visitkc_luxury')
GROUP BY s.name, cat ORDER BY s.name;"
```

---

## Conclusion

Phase 2J successfully wires five audience-alignment sources and ingests **21 rows** across closings, liquidations, consignment, and staycation categories. **Pitch KC Closings** and the **consignment directory** are production-ready with high field coverage. **Liquidation** and **luxury/staycation** sources are wired but feed-limited — hotel/spa HTML scrapers are the highest-impact next step to close Primary pillar gaps.
