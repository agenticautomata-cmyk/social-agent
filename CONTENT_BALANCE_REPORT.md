# Content Balance Report

**Date:** 2026-05-31  
**Scope:** All 216 ingested opportunities in the database  
**Method:** Full Postgres export + keyword/source classification  
**No code changes** — analysis only

---

## Executive Summary

The feed has grown from 112 rows (pre-Phase 2F/2G) to **216 rows** across **11 active sources**. Phase 2G (free events) reshaped the inventory dramatically: **83 new free-tagged rows** now occupy **38% of the feed**. Kellie's **primary audience pillars** — luxury, dining, openings, date nights, staycations — represent only **~14%** of total inventory. **Estate sales are entirely absent (0 rows).**

| Finding | Detail |
|---|---|
| Largest source | **r/kansascity** — 53 rows (24.5%), mostly discussion noise |
| Largest pillar | **Free Things To Do** — 83 rows (38.4%) after Phase 2G |
| Largest feed bucket | **Free Events** — 90 rows (41.7% multi-label) |
| Critical gap | **Estate Sales** — 0%; **Date Nights** — 0.5%; **Staycations** — 3.7% |
| Overrepresented | Free Events, Sports (Sporting KC), Reddit discussion |
| Kellie core appeal | **~61%** of feed matches primary + secondary audience |
| General KC / off-brand | **~39%** (sports calendars, Reddit noise, generic attractions) |

**Bottom line:** Ingest volume is healthy, but **content balance does not match Kellie's business model**. The feed reads like a community events calendar (parks, library, sports) rather than a luxury lifestyle and dining discovery engine. Estate sales — a stated primary pillar — have no source at all.

---

## Methodology

Data pulled from all `content_items` where `source_id IS NOT NULL` (216 rows). Each row classified by:

1. **`metadata.ingest`** and **`metadata.opportunityCategory`** (authoritative when set)
2. Source-specific metadata (`restaurantWeek`, `pitchDining`, `kcParks`, etc.)
3. Title/body keyword heuristics for cross-cutting buckets

Feed bucket percentages use **multi-label counting** (a Restaurant Week row counts toward both Dining and Luxury Deals). Audience tier percentages use **exclusive priority** (Primary > Secondary > Tertiary > General > Noise).

---

## 1. Counts by Source

| Source | Count | % of Total | Active Rows |
|---|---|---|---|
| **r/kansascity** | 53 | 24.5% | 53 |
| **KC Parks Events** | 50 | 23.1% | 50 |
| **KC Library Events** | 29 | 13.4% | 29 |
| **Sporting KC Schedule** | 20 | 9.3% | 20 |
| **Visit KC RSS** | 20 | 9.3% | 20 |
| **Kauffman Center Events** | 16 | 7.4% | 16 |
| **The Pitch KC Sipps** | 10 | 4.6% | 10 |
| **KC Restaurant Week** | 10 | 4.6% | 10 |
| **Crossroads First Fridays** | 4 | 1.9% | 4 |
| **Union Station Events** | 4 | 1.9% | 4 |
| **Crossroads RSS** | 0 | 0% | 0 (wired, empty feed) |
| **Total** | **216** | **100%** | |

### Source concentration

```
r/kansascity          ████████████████████████  24.5%
KC Parks              ███████████████████████   23.1%
KC Library            █████████████             13.4%
Sporting KC           █████████                  9.3%
Visit KC              █████████                  9.3%
Kauffman              ███████                    7.4%
Pitch KC Sipps        █████                      4.6%
KC Restaurant Week    █████                      4.6%
First Fridays         ██                         1.9%
Union Station         ██                         1.9%
```

**Three sources (Reddit + Parks + Library) account for 61% of the entire feed.**

---

## 2. Counts by Content Pillar

| Pillar | Count | % | Δ vs Pre-2G (112 rows) |
|---|---|---|---|
| **Free Things To Do** | 83 | **38.4%** | +81 |
| **Other** (noise) | 43 | **19.9%** | +9 |
| **Events** | 21 | 9.7% | +7 |
| **Sports** | 20 | 9.3% | −6 (same SKC, recategorized) |
| **Luxury Deals** | 14 | 6.5% | +9 |
| **Openings** | 13 | 6.0% | +10 |
| **Family Activities** | 9 | 4.2% | 0 |
| **Weekend Activities** | 6 | 2.8% | +1 |
| **World Cup** | 4 | 1.9% | −4 |
| **Dining** | 3 | 1.4% | −3 (recategorized to Luxury/Openings) |
| **Total** | **216** | **100%** | +104 |

---

## 3. Counts by Category (`opportunityCategory`)

| Category | Count | % | Primary Source(s) |
|---|---|---|---|
| **free** | 83 | 38.4% | KC Parks, KC Library, First Fridays |
| **discussion** | 31 | 14.4% | Reddit |
| **dining** | 20 | 9.3% | Restaurant Week, Pitch KC Sipps |
| **match** | 20 | 9.3% | Sporting KC |
| **performance** | 16 | 7.4% | Kauffman |
| **releases** | 12 | 5.6% | Visit KC |
| **event** | 10 | 4.6% | Mixed |
| **news** | 8 | 3.7% | Visit KC |
| **deal** | 7 | 3.2% | Reddit, Visit KC |
| **restaurant_opening** | 4 | 1.9% | Reddit, Pitch |
| **attraction** | 4 | 1.9% | Union Station, Reddit |
| **festival** | 1 | 0.5% | Reddit |

---

## 4. Top 20 Neighborhoods

| Rank | Neighborhood | Count | % |
|---|---|---|---|
| 1 | *(unknown / not parsed)* | 60 | 27.8% |
| 2 | kansas city (generic) | 22 | 10.2% |
| 3 | mission | 15 | 6.9% |
| 4 | **crossroads** | 13 | 6.0% |
| 5 | plaza | 8 | 3.7% |
| 6 | **northeast** | 5 | 2.3% |
| 7 | **westport** | 5 | 2.3% |
| 8 | overland park | 5 | 2.3% |
| 9 | country club plaza | 4 | 1.9% |
| 10 | **downtown** | 3 | 1.4% |
| 11 | **northland** | 3 | 1.4% |
| 12 | waldo | 3 | 1.4% |
| 13 | lucile h. bluford branch area | 3 | 1.4% |
| 14 | bookmobile routes | 3 | 1.4% |
| 15 | lakeside nature center area | 3 | 1.4% |
| 16 | trails west branch area | 2 | 0.9% |
| 17 | brookside | 2 | 0.9% |
| 18 | historic northeast | 2 | 0.9% |
| 19 | midtown | 2 | 0.9% |
| 20 | independence | 2 | 0.9% |

**Note:** 28% of rows lack a parsed neighborhood — mostly Sporting KC matches, generic Reddit posts, and Kauffman performances. Location enrichment is a data quality gap.

---

## 5. Top 20 Venues

| Rank | Venue | Count | % |
|---|---|---|---|
| 1 | **Children's Mercy Park** | 20 | 9.3% |
| 2 | *(location_name: "kansas city")* | 17 | 7.9% |
| 3 | *(location_name: "mission")* | 10 | 4.6% |
| 4 | **Central Library** | 6 | 2.8% |
| 5 | **Gillham Park** | 6 | 2.8% |
| 6 | **Lakeside Nature Center** | 6 | 2.8% |
| 7 | **Helzberg Hall** (Kauffman) | 7 | 3.2% |
| 8 | **Muriel Kauffman Theatre** | 7 | 3.2% |
| 9 | **Spring Valley Park** | 5 | 2.3% |
| 10 | **Mill Creek Park** | 5 | 2.3% |
| 11 | **Crossroads Arts District** | 4 | 1.9% |
| 12 | **Plaza Branch Library** | 4 | 1.9% |
| 13 | **Holmes Park** | 4 | 1.9% |
| 14 | **Lucile H. Bluford Branch** | 4 | 1.9% |
| 15 | National World War I Museum | 4 | 1.9% |
| 16 | **North-East Branch Library** | 3 | 1.4% |
| 17 | **Lykins Square Park** | 3 | 1.4% |
| 18 | Bookmobile (mobile) | 3 | 1.4% |
| 19 | **Trails West Branch Library** | 2 | 0.9% |
| 20 | Loose Park | 2 | 0.9% |

**Sporting KC alone accounts for 20 identical venue entries** — one venue, 20 match dates.

---

## 6. Feed Occupancy by Content Type

Multi-label counts (rows can appear in multiple buckets):

| Content Type | Count | % of Feed | Kellie Tier |
|---|---|---|---|
| **Free Events** | 90 | **41.7%** | Secondary |
| **Family Activities** | 50 | 23.1% | Secondary |
| **Attractions** | 44 | 20.4% | General KC |
| **Dining** | 39 | 18.1% | **Primary** |
| **Luxury Deals** | 29 | 13.4% | **Primary** |
| **Sports** | 30 | 13.9% | Tertiary |
| **Weekend Activities** | 21 | 9.7% | **Primary** |
| **Festivals** | 18 | 8.3% | Secondary |
| **Restaurant Openings** | 16 | 7.4% | **Primary** |
| **World Cup** | 9 | 4.2% | Tertiary |
| **Staycations** | 8 | 3.7% | **Primary** |
| **Date Nights** | 1 | **0.5%** | **Primary** |
| **Estate Sales** | 0 | **0.0%** | **Primary** |

### Primary bucket (exclusive — each row counted once)

| Bucket | Count | % of Total | % of Actionable (178) |
|---|---|---|---|
| Free Events | 74 | 34.3% | 41.6% |
| Luxury Deals | 29 | 13.4% | 16.3% |
| Family Activities | 20 | 9.3% | 11.2% |
| Dining | 15 | 6.9% | 8.4% |
| Attractions | 14 | 6.5% | 7.9% |
| Sports | 13 | 6.0% | 7.3% |
| Staycations | 7 | 3.2% | 3.9% |
| Restaurant Openings | 5 | 2.3% | 2.8% |
| Weekend Activities | 1 | 0.5% | 0.6% |
| Date Nights | 0 | 0.0% | 0.0% |
| Estate Sales | 0 | 0.0% | 0.0% |

---

## 7. Kellie Audience Alignment

### Audience tier model

| Tier | Pillars | Target Share (ideal) | Actual Share |
|---|---|---|---|
| **Primary** | Luxury Deals, Estate Sales, Dining, Restaurant Openings, Date Nights, Staycations, Weekend Activities | ~40–50% | **14.4%** (31 rows) |
| **Secondary** | Free Events, Family Activities, Festivals | ~25–30% | **46.3%** (100 rows) |
| **Tertiary** | Sports, World Cup | ~10–15% | **6.9%** (15 rows) |
| **General KC** | Attractions, generic tourism PR | ~10% | **11.1%** (24 rows) |
| **Off-brand / noise** | Reddit help threads, irrelevant discussion | <10% | **21.3%** (46 rows) |

### Audience appeal estimate

| Audience | Rows | % | Interpretation |
|---|---|---|---|
| **Kellie's existing audience** (Primary + Secondary) | 131 | **60.6%** | Content Kellie would consider posting with editorial judgment |
| **General Kansas City events audience** | 39 | **18.1%** | Sports calendars, Kauffman performances, Visit KC PR — postable but not core brand |
| **Off-brand / not postable** | 46 | **21.3%** | Reddit noise, help threads, irrelevant discussion |

**Refined estimate for Kellie's core business** (luxury lifestyle, dining, estate sales, date nights):

| Segment | % of Feed | Notes |
|---|---|---|
| **Directly on-brand for Kellie's primary business** | **~14–18%** | Dining, luxury, openings, staycations — the content that drives sponsorship and affiliate revenue |
| **On-brand for Kellie's secondary content** | **~46%** | Free events, family, festivals — good engagement but lower monetization |
| **General KC events audience** | **~18%** | Sports, attractions, tourism PR — broad appeal, not Kellie's niche |
| **Not postable** | **~21%** | Reddit discussion noise |

**Kellie's existing audience would find ~60% of the feed relevant at some level, but only ~15% is directly aligned with her primary revenue pillars.** The remaining 45% is secondary-tier content (mostly free community events from Phase 2G) that builds engagement but doesn't match luxury/dining/estate sale positioning.

---

## 8. Overrepresented Content

| Content | Rows | % | Source Driver | Issue |
|---|---|---|---|---|
| **Free Events** | 90 | 41.7% | KC Parks (50), KC Library (29), First Fridays (4) | Phase 2G over-corrected the free pillar gap; now dominates feed |
| **Reddit discussion** | 31 | 14.4% | r/kansascity (31 of 53) | Help threads, ISO posts, contractor questions — not postable |
| **Sports matches** | 20 | 9.3% | Sporting KC (20 identical format) | 20 rows = 1 content theme with 20 dates |
| **Library programs** | 29 | 13.4% | KC Library | LEGO Club, storytime, bookmobile — low visual appeal for Kellie |
| **Luxury/Dining overlap** | 29+39 | — | Restaurant Week + Pitch + Visit KC | Same KCRW rows counted in both buckets; actual unique dining content ~20 rows |

---

## 9. Underrepresented Content

| Content | Rows | % | Gap vs Ideal (~40% primary feed) | Status |
|---|---|---|---|---|
| **Estate Sales** | 0 | 0.0% | **−40+ rows** | 🔴 No source exists |
| **Date Nights** | 1 | 0.5% | **−15 rows** | 🔴 Critical |
| **Weekend Activities** | 21 multi / 1 exclusive | 0.5–9.7% | **−15 rows** | 🔴 No dedicated roundup source |
| **Staycations** | 8 | 3.7% | **−12 rows** | 🟡 Only Visit KC travel listicles |
| **Restaurant Openings** | 16 multi / 5 exclusive | 2.3–7.4% | **−10 rows** | 🟡 Pitch helps; needs dedicated tracker |
| **Luxury Deals** | 29 | 13.4% | **−5 rows** | 🟢 Improved via KCRW; needs hotel/spa |
| **Dining** | 39 multi / 15 exclusive | 6.9–18.1% | **−5 rows** | 🟢 Improved via Phase 2F |

---

## 10. Sources Creating Feed Imbalance

| Source | Rows | % | Dominant Bucket | Imbalance Effect |
|---|---|---|---|---|
| **KC Parks Events** | 50 | 23.1% | Free Events (50) | Inflated free pillar from 2 → 83 rows in one phase |
| **KC Library Events** | 29 | 13.4% | Free Events (29) | Family/library programs not Kellie-primary content |
| **r/kansascity** | 53 | 24.5% | Discussion (31), mixed | 58% of Reddit rows are noise; dilutes feed quality |
| **Sporting KC Schedule** | 20 | 9.3% | Sports (20) | Single-format match listings; 1 theme × 20 dates |
| **Visit KC RSS** | 20 | 9.3% | Mixed PR | Tourism press releases, not dated local events |
| **KC Restaurant Week** | 10 | 4.6% | Dining + Luxury | ✅ On-brand but seasonal (Jan only) |
| **The Pitch KC Sipps** | 10 | 4.6% | Dining + Openings | ✅ Highest editorial quality per row |

### Source quality per row (Kellie-postable rate)

| Source | Postable Rate | Notes |
|---|---|---|
| KC Restaurant Week | ~100% | Every row is on-brand dining/luxury |
| The Pitch KC Sipps | ~100% | Curated openings, festivals, dining |
| Kauffman Center | ~100% | Premium date-night / attraction content |
| Union Station | ~100% | Family + attraction |
| Crossroads First Fridays | ~100% | Signature KC free event |
| Visit KC RSS | ~60% | Mix of tourism PR and useful announcements |
| KC Parks | ~40% | Many community meetings, board meetings, niche programs |
| KC Library | ~30% | Mostly recurring programs (LEGO Club, storytime) |
| Sporting KC | ~50% | Postable on match weeks; 20 identical rows otherwise |
| Reddit | ~35% | 31/53 discussion; 11/53 deal/opening/event |

---

## 11. Missing High-Value Content Categories

| Category | Current | Needed Source | Business Value |
|---|---|---|---|
| **Estate Sales** | 0 rows | EstateSales.net KC, KC Star classifieds, Craigslist estate filter | Primary pillar — zero coverage |
| **Date Nights** | 1 row | OpenTable KC, romantic restaurant openings, Kauffman date-night picks | Primary pillar — premium audience |
| **Weekend Roundups** | 1 exclusive row | The Pitch events, IN Kansas City, Visit KC calendar | Primary pillar — highest-engagement format |
| **Hotel/Spa Deals** | 0 rows | Hotel KC packages, spa day deals, Visit KC luxury filter | Primary pillar — sponsor-friendly |
| **New Restaurant Openings** | 16 multi-label | Dedicated opening tracker beyond Pitch KC Sipps | Primary pillar — proven social format |
| **Farmers Markets / Seasonal** | 0 rows | City Market, Overland Park farmers market, seasonal rules | Secondary — visual, recurring |
| **Nelson-Atkins / Kemper Free Days** | 0 rows | Museum free-day calendars | Secondary — free pillar depth |

---

## 12. Missing Sponsor-Friendly Categories

Sponsor-friendly content drives revenue for Kellie's media property. Current coverage:

| Sponsor Category | Rows | Sponsor Potential | Gap |
|---|---|---|---|
| **Restaurant / Dining** | 39 | Restaurant Week, local restaurant ads, delivery apps | 🟢 Improved (Phase 2F) |
| **Luxury / Premium** | 29 | Distillery, hotel, spa, premium experiences | 🟡 KCRW only; no hotel/spa source |
| **Sports** | 30 | Sporting KC, Chiefs, Royals sponsors | 🟡 SKC only; no Chiefs/Royals |
| **Real Estate / Estate Sales** | 0 | Estate sale companies, moving services, stagers | 🔴 Zero coverage |
| **Family / Kids** | 50 | Zoo, Science City, family attractions | 🟢 Parks + Library cover this |
| **Automotive** | 0 | Dealership events, car shows | 🔴 No source |
| **Fashion / Retail** | 0 | Plaza events, trunk shows, pop-ups | 🔴 No source |
| **Health / Wellness** | ~5 | Spa, fitness, wellness events | 🔴 Minimal |
| **Festival Title Sponsors** | 18 | Plaza Art Fair, Irish Fest, Restaurant Week | 🟡 Festival names present; no sponsor metadata |

---

## 13. Recommendations

### 1. Next Highest Business-Value Source Phase

**Phase 2H: Visit KC Events Calendar + Weekend Roundups**

| Source | Pillars Filled | Est. Yield | Why First |
|---|---|---|---|
| **Visit KC events calendar** (`visitkc.com/events/`) | Dining, Weekend, Date Night, Festivals, Openings | 15–40/day | Single source fills 5 primary gaps; 4,000+ dated listings |
| **The Pitch / IN Kansas City events** | Weekend, Openings, Date Night, Festivals | 2–5/day | Editorial picks Kellie would actually post |
| **Reddit pre-display filter** (not new source) | — | 50→8 rows | Cuts 31 discussion rows; no new ingest needed |

**Expected impact:** Primary audience share rises from ~14% to ~30%; weekend and date-night gaps close.

---

### 2. Next Highest Sponsor-Value Source Phase

**Phase 2I: Sports Brands + Luxury/Hospitality**

| Source | Sponsor Angle | Est. Yield |
|---|---|---|
| **Chiefs schedule** | Toyota, Hy-Vee, local sports sponsors | 0–2/week (seasonal) |
| **Royals schedule** | Corporate suite partners, Boulevard | 0–2/week (seasonal) |
| **KC Current (NWSL)** | Women's sports, CPKC Stadium sponsors | 0–1/week |
| **Hotel KC / 21c / Crossroads Hotel packages** | Direct hospitality sponsor content | 1–3/month |
| **Restaurant Week (seasonal spike)** | Already ingested; activate Jan/Feb | 10–50/season |

---

### 3. Best Estate Sale Source Options

| Rank | Source | URL / Method | Format | Quality | Difficulty |
|---|---|---|---|---|---|
| **1** | **EstateSales.net — Kansas City** | `estatesales.net/Kansas-City-MO` | HTML scrape | High — photos, dates, addresses, professional listings | Medium |
| **2** | **Craigslist KC — garage/estate/moving** | `kansascity.craigslist.org/search/gms` | RSS/HTML | Medium — high volume, mixed quality | Low |
| **3** | **KC Star Marketplace** | `marketplace.kansascity.com` | HTML scrape | Medium — local trust signal | Medium |
| **4** | **Facebook Marketplace estate sales** | Graph API / scrape | JSON | High volume but auth required | High |
| **5** | **YardSaleSearch.com KC** | Regional aggregator | HTML | Low–Medium | Low |

**Recommendation:** **EstateSales.net KC metro scrape** as primary; Craigslist `gms` RSS as secondary volume source. Tag all rows `opportunityCategory: 'estate_sale'`, `freeEventFlag: false`.

---

### 4. Best Luxury / Staycation Source Options

| Rank | Source | Content Type | Format |
|---|---|---|---|
| **1** | **Visit KC events calendar** (luxury/dining filter) | Spa, hotel, premium dining | HTML/JSON scrape |
| **2** | **KC Restaurant Week** | Already ingested; seasonal anchor | RSS ✅ |
| **3** | **Hotel packages** — 21c Museum Hotel, Hotel KC, Crossroads Hotel | Staycation packages, date-night deals | HTML scrape |
| **4** | **Spa/wellness** — The Elms, Spa on Penn, Amore Spa | Luxury day packages | HTML |
| **5** | **Visit KC media RSS** (`news.visitkc.com/media_rss.xml`) | Premium experience PR | RSS |
| **6** | **The Pitch "Best Of" / luxury dining** | Editorial luxury picks | RSS (food/drink category) |

---

### 5. Best Date-Night Source Options

| Rank | Source | Why |
|---|---|---|
| **1** | **Kauffman Center** (existing) | Premium concerts, ballet — classic date night; already 16 rows |
| **2** | **New romantic restaurant openings** (Pitch KC Sipps + opening tracker) | "New spot for date night" is Kellie's highest-engagement dining format |
| **3** | **Visit KC calendar** (filter: evening events, dining, performances) | Dated, venue-backed |
| **4** | **Boulevard / winery / cocktail events** | Already in Pitch feed; could tag `dateNightFlag` |
| **5** | **First Fridays** (existing) | Free date-night alternative in Crossroads |
| **6** | **OpenTable / Resy KC trending** | "Most booked this week" — strong date-night signal | Hard — no public API |

---

## 14. Ideal vs Actual Feed Mix

Target mix for Kellie's business (216 rows):

| Tier | Category | Ideal % | Actual % | Δ |
|---|---|---|---|---|
| Primary | Luxury Deals | 10% | 13.4% | +3 ✅ |
| Primary | Estate Sales | 8% | **0.0%** | **−8** 🔴 |
| Primary | Dining | 12% | 18.1% | +6 ✅ |
| Primary | Restaurant Openings | 8% | 7.4% | −1 🟢 |
| Primary | Date Nights | 6% | **0.5%** | **−6** 🔴 |
| Primary | Staycations | 5% | 3.7% | −1 🟡 |
| Primary | Weekend Activities | 10% | 9.7% | −0 🟢 |
| Secondary | Free Events | 15% | **41.7%** | **+27** 🔵 over |
| Secondary | Family Activities | 8% | 23.1% | +15 🔵 over |
| Secondary | Festivals | 6% | 8.3% | +2 🟢 |
| Tertiary | Sports | 8% | 13.9% | +6 🔵 over |
| Tertiary | World Cup | 4% | 4.2% | 0 🟢 |
| — | Attractions | 5% | 20.4% | +15 🔵 over |
| — | Noise/Other | <5% | 21.3% | +16 🔴 |

---

## 15. Strategic Summary

### What Phase 2F and 2G accomplished

- **Dining** improved from 6 → 39 multi-label rows (Restaurant Week + Pitch)
- **Free Events** improved from 2 → 90 rows (Parks + Library + First Fridays)
- **Luxury Deals** improved from 5 → 29 rows (KCRW + Visit KC)
- **Openings** improved from 3 → 16 rows (Pitch KC Sipps)

### What remains broken

1. **Estate Sales** — primary pillar, zero sources, zero rows
2. **Date Nights** — 1 row in 216; no romantic dining or evening event source
3. **Feed skew** — 62% of feed is free/community content (Phase 2G) vs Kellie's luxury/dining brand
4. **Reddit noise** — 31 discussion rows (14%) should be filtered, not displayed
5. **Sporting KC duplication** — 20 match rows = 1 editorial piece

### Recommended phase sequence

| Phase | Focus | Primary Gap Closed |
|---|---|---|
| **2H** | Visit KC calendar + Pitch events + Reddit filter | Weekend, Date Night, Openings |
| **2I** | EstateSales.net + Craigslist estate sales | Estate Sales (0 → 15+) |
| **2J** | Hotel/spa packages + luxury hospitality | Staycations, Luxury Deals |
| **2K** | Chiefs/Royals/KC Current | Sports sponsor content |
| **2L** | Nelson-Atkins + Zoo free days | Attractions depth (optional) |

---

## Appendix: Source × Bucket Matrix

| Source | Free | Dining | Luxury | Openings | Sports | Family | Festivals | Attractions |
|---|---|---|---|---|---|---|---|---|
| KC Parks | 50 | 6 | — | — | 4 | 20 | 8 | — |
| KC Library | 29 | — | — | — | — | 25 | — | — |
| Reddit | 2 | 4 | 5 | 6 | 1 | 2 | 1 | 4 |
| Sporting KC | — | — | — | — | 20 | — | — | — |
| Visit KC | — | 7 | 7 | 4 | 5 | — | — | — |
| Restaurant Week | — | 10 | 10 | — | — | — | — | — |
| Pitch KC Sipps | 3 | 10 | 10 | 10 | — | — | 3 | — |
| Kauffman | 1 | — | — | — | — | 3 | — | 16 |
| Union Station | — | — | — | — | — | 4 | — | 4 |
| First Fridays | 4 | — | — | — | — | — | 4 | — |

---

**Analysis complete.** 216 ingested rows evaluated. No application code modified.
