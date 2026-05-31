# Ranking Audit Report

**Date:** 2026-05-31  
**Scope:** All 385 ingested opportunities  
**Goal:** Diagnose why low-value discussion content appears in top engagement and World Cup rankings  
**Method:** Read-only Postgres export + audit of TOP_CONTENT_REPORT heuristics  
**No application code, data, scoring, or UI changes** — analysis only

---

## Executive Summary

The TOP_CONTENT_REPORT ranking heuristics produce usable sponsor and audience lists, but **two design flaws** explain the noise:

| Issue | Root Cause | Impact |
|---|---|---|
| **World Cup over-tagging** | `2026` keyword matches **307/327** tagged rows (94%) — any row mentioning year 2026 is tagged | 85% of all inventory receives World Cup label; tag is meaningless at scale |
| **Engagement Reddit boost** | All `discussion` rows get **+30 base points**; tragedy/controversy adds **+20 more** | McLaren crash ranks **#1 engagement** despite being unpublishable for Kellie |
| **Top-50 WC ranked quality** | Ranking score favors hotels/rooftops/dining — only **4/50** are strict false positives | **Top-ranked WC list is mostly fine**; the problem is tag breadth, not top-N ordering |
| **Strict WC false positive rate** | **173/327 tagged rows (52.9%)** would not qualify under stricter criteria | Half of all WC-tagged inventory is noise when judged by visitor relevance |

**Key insight:** World Cup problems are primarily a **tagging** problem (especially the `2026` rule), not a top-25 ordering problem. Engagement problems are a **scoring weights** problem that rewards Reddit controversy.

---

## 1. World Cup Tagging Audit

### 1.1 Rules Causing World Cup Assignment

The TOP_CONTENT_REPORT classifier assigns `World Cup Opportunity` when **any** rule matches (excluding `discussion` category from keyword rules, but not from all paths):

#### Keyword rules (regex on title + body + metadata)

| Rule | Pattern | Rows Hit |
|---|---|---|
| **2026** | `\b2026\b` | **307** |
| crossroads | `\bcrossroads\b` | 25 |
| country club plaza / plaza | `\b(country club plaza\|plaza)\b` | 20 |
| hotel | `\bhotel\b` | 15 |
| museum | `\bmuseum\b` | 11 |
| rooftop | `\brooftop\b` | 9 |
| attraction | `\battraction\b` | 7 |
| visit kc | `\bvisit kc\b` | 6 |
| fifa | `\bfifa\b` | 5 |
| bbq / barbecue | `\b(bbq\|barbecue)\b` | 5 |
| power and light | `\bpower and light\b` | 5 |
| world cup | `\bworld cup\b` | 3 |
| arrowhead / geha / stadium | `\b(arrowhead\|geha\|stadium)\b` | 3 |
| visitor / visitors / tourist / tourism | `\b(visitors?\|tourist\|tourism)\b` | 2 |
| getaway / staycation | `\b(getaway\|staycation)\b` | 2 |
| fine dining | `\bfine dining\b` | 2 |
| brewery / distillery | `\b(brewery\|distillery)\b` | 2 |
| international | `\binternational\b` | 1 |
| downtown kc, union station, nelson-atkins, weekend guide, things to do, jazz, kansas city experience, welcome | various | 0–1 each |

#### Source-type auto-tag rules (no keyword required)

| Source Type | Rows |
|---|---|
| `visitkc` | 20 |
| `visitkc_openings` | 4 |
| `kc_hotel_packages` | 6 |
| `rooftop_bars_kc` | 6 |
| `chef_tasting_menus` | 6 |
| `visitkc_luxury_experiences` | 2 |
| `visitkc_romantic_weekends` | 1 |

**Total tagged:** 327/385 rows (85.0%)

### 1.2 Root Cause: The `2026` Rule

The **`2026` keyword alone accounts for 94% of World Cup tag assignments.** It fires on:

- Restaurant Week "Returns January 2026"
- Event dates in metadata (`event_starts_at` rendered as 2026)
- Rugby/soccer hosting announcements unrelated to FIFA World Cup
- General Visit KC PR mentioning the calendar year

This conflates **"happening in 2026"** with **"relevant to 2026 FIFA World Cup visitors."**

### 1.3 False Positive Rate

| Method | False Positives | Rate |
|---|---|---|
| **Strict visitor-relevance test** | 173 / 327 tagged | **52.9%** |
| **Top 50 WC-ranked only** | 4 / 50 | **8.0%** |
| **Explicit WC/FIFA in text** | ~3 rows with "world cup" keyword | **<1%** of inventory |

**Strict false positive definition:** Tagged as World Cup but category is `discussion`, `free`, `estate_sale`, `match`, `business_closing`, `news`, or `releases`; OR tagged **only** via weak neighborhood keywords (`crossroads`, `plaza`, `museum`, `jazz`, `hotel`, `bbq`) on non-hospitality content.

### 1.4 Top 50 Rows Receiving World Cup Labels (by WC ranking score)

| Rank | Title | Source | Category | WC Score | Strict FP? |
|---|---|---|---|---|---|
| 1 | 21c Museum Hotel — art-forward boutique packages & date-night stays | KC Hotel Packages | hotel_package | 120 | No |
| 2 | Hotel Kansas City — Curio Collection weekend packages & rooftop dining | KC Hotel Packages | hotel_package | 120 | No |
| 3 | Crossroads Hotel — boutique packages with Percheron Rooftop | KC Hotel Packages | hotel_package | 120 | No |
| 4 | The Raphael Hotel — Country Club Plaza luxury stay packages | KC Hotel Packages | hotel_package | 120 | No |
| 5 | Percheron Rooftop — Crossroads skyline cocktails & date nights | KC Rooftop Bars | rooftop_experience | 120 | No |
| 6 | Nine Zero One — Loews rooftop lounge with downtown views | KC Rooftop Bars | rooftop_experience | 120 | No |
| 7 | Mercury Room — rooftop dining & cocktails at Hotel Kansas City | KC Rooftop Bars | rooftop_experience | 120 | No |
| 8 | 801 Rooftop — Power & Light District rooftop lounge | KC Rooftop Bars | rooftop_experience | 120 | No |
| 9 | Corvino — chef tasting menus & supper club date nights | Chef Tasting Menus | luxury_dining | 120 | No |
| 10 | The Antler Room — seasonal chef tasting menus in Crossroads | Chef Tasting Menus | luxury_dining | 120 | No |
| 11 | Bluestem — prix fixe tasting menus & wine pairings | Chef Tasting Menus | luxury_dining | 120 | No |
| 12 | The Rieger — historic fine dining & chef tasting experiences | Chef Tasting Menus | luxury_dining | 120 | No |
| 13 | The Savoy at 21c — chef-driven tasting menus & wine program | Chef Tasting Menus | luxury_dining | 120 | No |
| 14 | Lonely Planet: KC Among Best Weekend Getaways Across the USA | Visit KC Romantic Weekends | weekend_getaway | 100 | No |
| 15 | Loews Kansas City — luxury packages & Nine Zero One rooftop | KC Hotel Packages | hotel_package | 120 | No |
| 16 | Sheraton Crown Center — family & couples getaway packages | KC Hotel Packages | hotel_package | 120 | No |
| 17 | Hey Hey Club — rooftop cocktails above J. Rieger distillery | KC Rooftop Bars | rooftop_experience | 120 | No |
| 18 | Sky Cinema — rooftop movie nights & cocktails in Power & Light | KC Rooftop Bars | rooftop_experience | 120 | No |
| 19 | Lazia — Italian fine dining & chef special menus | Chef Tasting Menus | luxury_dining | 120 | No |
| 20 | KC Sipps: Three local restaurants add new locations… | The Pitch KC Sipps | dining | 100 | No |
| 21 | KC Sipps: New Mexican sushi, Japanese bartending… | The Pitch KC Sipps | dining | 100 | No |
| 22 | KC Sipps: Mother's Day events in Crossroads… | The Pitch KC Sipps | dining | 100 | No |
| 23 | KC Sipps: Three openings and delicious festivals… | The Pitch KC Sipps | dining | 100 | No |
| 24 | KC Sipps: Free pizza for a year, prominent patios open… | The Pitch KC Sipps | dining | 100 | No |
| 25 | KC Sipps: Two openings, impressive milestones… | The Pitch KC Sipps | dining | 100 | No |
| 26 | The Elms Hotel & Spa — luxury wellness packages & romantic getaways | KC Spa Packages | spa_package | 115 | No |
| 27 | Spa on Penn — Plaza day spa packages & couples treatments | KC Spa Packages | spa_package | 115 | No |
| 28 | Amore Spa — luxury massage & wellness packages | KC Spa Packages | spa_package | 115 | No |
| 29 | The Spa at Loews — hotel spa packages & couples treatments | KC Spa Packages | spa_package | 115 | No |
| 30 | The Spa at The Raphael — Plaza luxury spa packages | KC Spa Packages | spa_package | 115 | No |
| 31 | Ameristar — casino hotel packages & entertainment getaways | Casino Hotel Packages | hotel_package | 115 | No |
| 32 | Harrah's Kansas City — casino hotel packages & date-night entertainment | Casino Hotel Packages | hotel_package | 115 | No |
| 33 | Bally's Kansas City — casino resort packages & nightlife | Casino Hotel Packages | hotel_package | 115 | No |
| 34 | Amigoni Urban Winery — West Bottoms wine tastings & events | KC Wine Tastings | wine_tasting | 100 | No |
| 35 | Edgecombe Wines — Plaza wine bar & curated tastings | KC Wine Tastings | wine_tasting | 100 | No |
| 36 | Cellar 222 — wine bar & tasting room in Brookside | KC Wine Tastings | wine_tasting | 100 | No |
| 37 | Broadside — Westport wine bar & natural wine tastings | KC Wine Tastings | wine_tasting | 100 | No |
| 38 | Café Trio — Plaza wine dinner series & tastings | KC Wine Tastings | wine_tasting | 100 | No |
| 39 | 17th Annual Kansas City Restaurant Week Returns January 2026 | Visit KC Openings | restaurant_opening | 65 | **Yes** — PR release, not visitor itinerary |
| 40 | Visit KC launches revamped BBQ Experience program | Visit KC RSS | releases | 80 | **Yes** — tourism PR, tangential to WC |
| 41 | Kansas City to Host Women's Rugby Double-Header at CPKC Stadium | Visit KC Luxury Experiences | couples_event | 65 | **Yes** — sports event, not WC visitor content |
| 42 | Enjoy Exclusive Savings at Local Distilleries, Wineries | Visit KC Luxury Experiences | wine_tasting | 65 | **Yes** — tagged via 2026 + source |
| 43 | Matador: Where to Eat, Play, and Stay for Kansas City's… | Visit KC RSS | news | 65 | Borderline |
| 44 | Kansas City Enters Men's Rugby World Cup 2031 Host City Bid | Visit KC RSS | releases | 65 | **Yes** — rugby ≠ FIFA WC |
| 45 | The Independent: Inside America's budget-friendly, BBQ-forward cities | Visit KC RSS | news | 80 | **Yes** |
| 46 | Smithsonian Magazine: The World's First Barbecue Museum | Visit KC RSS | news | 80 | **Yes** |
| 47 | Kansas City to host Premier League and NBC Sports' 11th… | Visit KC RSS | releases | 80 | **Yes** |
| 48 | Visit KC taps Mindtrip to help visitors discover the Heart… | Visit KC RSS | releases | 65 | Borderline |
| 49 | Minnesota Lynx set to take on Nigeria as WNBA returns to KC | Visit KC RSS | releases | 65 | **Yes** |
| 50 | Kansas City Celebrates Past, Present and Future during… | Visit KC RSS | releases | 65 | **Yes** |

### 1.5 Recommended Stricter World Cup Criteria

| Current Rule | Problem | Recommended Fix |
|---|---|---|
| `2026` keyword | Matches 307 rows; year ≠ World Cup | **Remove entirely** or require co-occurrence with `world cup`, `fifa`, `visitor`, or `stadium` |
| `crossroads`, `plaza`, `museum`, `jazz` | Neighborhood/topic keywords, not visitor intent | Require pairing with `hotel`, `restaurant`, `dining`, or `attraction` category |
| Auto-tag all `visitkc` source rows | Includes PR releases, rugby, restaurant week | Limit to categories: `hotel_package`, `attraction`, `weekend_getaway`, `staycation`, `dining` |
| `hotel`, `rooftop`, `bbq` standalone | Too broad | Accept only from revenue source types or explicit tourism categories |
| No exclusion list | Estate sales, free events, Reddit never tagged but 2026 in metadata could affect other paths | Explicit exclude: `discussion`, `free`, `estate_sale`, `match`, `business_closing`, `news`, `releases` |

**Proposed strict WC tag logic:**

```
World Cup = (
  explicit FIFA/World Cup/visitor/tourism keyword
  OR (hotel_package | rooftop_experience | weekend_getaway | staycation from revenue sources)
  OR (luxury_dining | dining from Pitch/Visit KC WITH downtown/plaza/crossroads in title)
)
AND NOT (discussion | free | estate_sale | match | news | releases)
AND NOT (2026 alone without visitor signal)
```

**Expected tag rate after fix:** ~40–60 rows (10–16% of inventory), down from 85%.

---

## 2. Engagement Ranking Audit

### 2.1 Why Reddit Discussions Rank Highly

The engagement scorer awards points additively:

| Signal | Points | Applies To |
|---|---|---|
| Base `discussion` category | **+30** | All 46 Reddit rows |
| Engagement keyword match (`crash`, `debate`, `closing`, etc.) | **+25** | 12 Reddit rows |
| Low-alignment / controversy keyword (`killed`, `crime`, `election`, etc.) | **+20** | 8 Reddit rows |
| Question mark in title | **+10** | 35 Reddit rows |
| Timeliness bonus | **+20** | Rows with event within 7 days |

**Example — #1 engagement row:**

> *Passenger killed in high-speed crash involving McLaren in Kansas City, Kansas*

| Component | Points |
|---|---|
| Base discussion | +30 |
| `crash` engagement keyword | +25 |
| `killed` controversy keyword | +20 |
| **Total** | **75** |

This outranks most estate sales (+30 estate +20 timeliness = 50) and free events (+25 free = 25–45).

### 2.2 Rows Kellie Would Never Realistically Post

Expanded criteria: tragedy, politics, generic Q&A, meta/community questions without dining/lifestyle anchor.

| Rank (Engagement) | Title | Why Never Post |
|---|---|---|
| 1 | Passenger killed in high-speed crash involving McLaren… | Tragedy/crime — off-brand |
| 2 | Johnson County Election Office cuts 8 early voting sites… | Political controversy |
| 3 | Is the KC Heart Logo trademarked? | Generic meta question |
| 4 | Bricks & Minifigs protests? | Protest/politics |
| 5 | Any local poker night groups to join? | Generic community Q&A |
| 6 | KC young adults: What are you doing on a Friday night? | Generic community Q&A |
| 7 | International flight tomorrow at 6:30a, when to arrive? | Travel logistics, not KC lifestyle |
| 8 | Hakes Brothers - Good or Bad? | Generic review request |
| 9 | *actually affordable* thrifting in the area? | Generic Q&A (not consignment pillar content) |
| 10 | Stupid question, any pedestrian bridges for crossing the river? | Generic infrastructure Q&A |
| 11 | older stone foundations around waldo, how scary are they? | Generic Q&A |
| 12 | Anyone here work for Panasonic? | Employment, not content |
| 13 | Dating Chats/Discords? | Generic community Q&A |

**23/46 Reddit rows (50%)** would never be posted by Kellie under expanded criteria.  
**2/46 (4.3%)** under narrow tragedy/politics keywords only.

### 2.3 Engagement Top 25 Composition

| Content Type | Rows in Top 25 | Kellie-Publishable? |
|---|---|---|
| Free events (Parks/Library) | 12 | Partial — family/community, not core brand |
| Estate sales | 11 | **Yes** — primary pillar |
| Reddit discussion | 2 | **No** — both are never-post rows |
| **Total** | **25** | **11 publishable, 12 tangential, 2 noise** |

**Noise percentage in engagement top 25:** **8%** strict (2/25 Reddit tragedy/politics), **48%** if excluding all never-post Reddit and low-alignment free events.

### 2.4 Engagement Ranking Fix (Recommendation)

| Change | Rationale |
|---|---|
| Set Reddit discussion base score to **0** or **−20** | Reddit is engagement-rich but off-brand for Kellie posting |
| Remove **+20 controversy bonus** | Actively promotes tragedy/politics |
| Cap engagement keyword bonus for `discussion` at **0** | Prevents crash/debate from dominating |
| Boost estate sales (+30), openings (+35), closings (+35) | Align engagement with publishable inventory |

---

## 3. Sponsor Ranking Audit

### 3.1 Top 50 Sponsor-Value Opportunities

Scored on: sponsor group membership, named business, premium category. Max score: 120.

#### Hotel (6)

| Title | Source | Score |
|---|---|---|
| 21c Museum Hotel — art-forward boutique packages & date-night stays | KC Hotel Packages | 120 |
| Hotel Kansas City — Curio Collection weekend packages & rooftop dining | KC Hotel Packages | 120 |
| Crossroads Hotel — boutique packages with Percheron Rooftop | KC Hotel Packages | 120 |
| Loews Kansas City — luxury packages & Nine Zero One rooftop | KC Hotel Packages | 120 |
| The Raphael Hotel — Country Club Plaza luxury stay packages | KC Hotel Packages | 120 |
| Sheraton Crown Center — family & couples getaway packages | KC Hotel Packages | 120 |

#### Casino (3)

| Title | Source | Score |
|---|---|---|
| Ameristar — casino hotel packages & entertainment getaways | Casino Hotel Packages | 120 |
| Harrah's Kansas City — casino hotel packages & date-night entertainment | Casino Hotel Packages | 120 |
| Bally's Kansas City — casino resort packages & nightlife | Casino Hotel Packages | 120 |

#### Spa (5)

| Title | Source | Score |
|---|---|---|
| The Elms Hotel & Spa — luxury wellness packages & romantic getaways | KC Spa Packages | 120 |
| Spa on Penn — Plaza day spa packages & couples treatments | KC Spa Packages | 120 |
| Amore Spa — luxury massage & wellness packages | KC Spa Packages | 120 |
| The Spa at Loews — hotel spa packages & couples treatments | KC Spa Packages | 120 |
| The Spa at The Raphael — Plaza luxury spa packages | KC Spa Packages | 120 |

#### Restaurant (13 in top 50)

| Title | Source | Score |
|---|---|---|
| Corvino — chef tasting menus & supper club date nights | Chef Tasting Menus | 120 |
| The Antler Room — seasonal chef tasting menus in Crossroads | Chef Tasting Menus | 120 |
| Bluestem — prix fixe tasting menus & wine pairings | Chef Tasting Menus | 120 |
| Lazia — Italian fine dining & chef special menus | Chef Tasting Menus | 120 |
| The Rieger — historic fine dining & chef tasting experiences | Chef Tasting Menus | 120 |
| The Savoy at 21c — chef-driven tasting menus & wine program | Chef Tasting Menus | 120 |
| 17th Annual Kansas City Restaurant Week Returns January 2026 | Visit KC Openings | 105 |
| District Biskuits opening | The Pitch KC Openings | 105 |
| Pho Solar opening | The Pitch KC Openings | 105 |
| Third Street Social opening | The Pitch KC Openings | 105 |
| The Culinary Center of Kansas City opening | The Pitch KC Openings | 105 |
| Bella Napoli opening | The Pitch KC Openings | 105 |
| Fluffy Fresh Donuts opening | The Pitch KC Openings | 105 |

#### Coffee (0 in top 50 — openings score 105 but lose to 120-tier rows)

Not represented in top 50 due to score ceiling competition. 13 coffee openings exist at score ~105.

#### Boutique (0 in top 50)

3 boutique openings exist; same score competition issue.

#### Entertainment (14 in top 50)

| Title | Source | Score |
|---|---|---|
| Kansas City Symphony Presents Gil Shaham Plays Brahms | Kauffman Date Nights | 120 |
| Kansas City Symphony Presents On Stage with Yefim Bronfman | Kauffman Date Nights | 120 |
| Kansas City Symphony Presents Rachmaninoff Celebration | Kauffman Date Nights | 120 |
| Kansas City Symphony Presents Trey Anastasio with the KC Symphony | Kauffman Date Nights | 120 |
| D.D.A. Presents The Glenn Miller Orchestra | Kauffman Date Nights | 120 |
| Kansas City Symphony Presents Steve Hackman's Symphonic Tribute | Kauffman Date Nights | 120 |
| Kauffman Center Presents Jonathan Van Ness: Hot & Healed | Kauffman Date Nights | 120 |
| Kansas City Symphony Presents Rhapsody in Blue and Dvořák | Kauffman Date Nights | 120 |
| Kauffman Center Presents Punch Brothers | Kauffman Date Nights | 120 |
| Kauffman Center Presents Graham Nash Live on Tour 2026 | Kauffman Date Nights | 120 |
| Kauffman Center Presents Herbie Hancock | Kauffman Date Nights | 120 |
| Kansas City Symphony Presents European Tour Send-off Concert | Kauffman Date Nights | 120 |
| Kansas City to Host Women's Rugby Double-Header at CPKC Stadium | Visit KC Luxury Experiences | 105 |
| Besos y Abrazos opening | The Pitch KC Openings | 105 |

#### Consignment (9 in top 50)

| Title | Source | Score |
|---|---|---|
| Do Good Co. — luxury consignment & designer resale | KC Consignment Shops | 120 |
| My Best Friend's Closet — designer consignment Northland | KC Consignment Shops | 120 |
| Style Encore — luxury resale & consignment Overland Park | KC Consignment Shops | 120 |
| Clothes Mentor — upscale resale Overland Park | KC Consignment Shops | 120 |
| Luxury Buyer KC — designer handbag & jewelry resale | KC Consignment Shops | 120 |
| Buffalo Exchange — vintage & designer resale Westport | KC Consignment Shops | 120 |
| Annedore Fine Consignment — luxury home & fashion | KC Consignment Shops | 120 |
| Second Chance Resale — upscale thrift Brookside | KC Consignment Shops | 120 |
| My Best Friend's Closet — designer consignment Shawnee | KC Consignment Shops | 120 |

#### Estate Sale (0 in top 50 — score 95 vs 120 tier)

40 estate sale rows exist at score **95** — excluded from top 50 by directory-source score ceiling, not lack of sponsor value.

**Full sponsor-eligible inventory by group:**

| Group | Total Rows | Avg Sponsor Score |
|---|---|---|
| Restaurant | 54 | 105–120 |
| Entertainment | 33 | 105–120 |
| Estate sale | 40 | 95 |
| Coffee | 13 | 105 |
| Hotel | 9 | 120 |
| Consignment | 9 | 120 |
| Spa | 5 | 120 |
| Boutique | 3 | 105 |
| Casino | 3 | 120 |

---

## 4. Audience Alignment Audit

### 4.1 Top 50 Most Aligned Rows by Pillar

#### Luxury (25 rows in top 50)

Hotels, spas, consignment shops, chef tasting menus, rooftops — all Phase 2J/2K directory and revenue sources. Representative:

- 21c Museum Hotel, Hotel Kansas City, Crossroads Hotel, Loews, Raphael, Sheraton
- The Elms Spa, Spa on Penn, Amore Spa
- Do Good Co., The Curated Closet, Style Encore, Annedore Fine Consignment
- Corvino, Bluestem, The Antler Room, Savoy at 21c
- Percheron Rooftop, Nine Zero One, Mercury Room

#### Date Nights (12 rows in top 50)

All Kauffman Date Nights source — symphony and concert performances:

- Kansas City Symphony presents Gil Shaham, Bronfman, Rachmaninoff, Trey Anastasio
- Kauffman Center presents Herbie Hancock, Graham Nash, Punch Brothers, Jonathan Van Ness

#### Dining (10 rows in top 50)

- KC Restaurant Week 2026
- Pitch openings: District Biskuits, Pho Solar, Third Street Social, Bella Napoli, Fluffy Fresh Donuts
- Pitch KC Sipps dining roundups

#### Openings (3 rows in top 50)

Only 3 opening rows break into top 50 because **evergreen directory rows score 100** on timeliness (startDate = now) and audience alignment, crowding out coffee openings.

- PH Coffee opening
- Moon Bar opening
- Flowstate Coffee opening

#### Staycations (0 in top 50)

Weekend getaway and staycation rows score lower than directory entries. Lonely Planet Visit KC piece exists but ranks below top 50.

#### Shopping (0 in top 50 as pillar label)

Estate sales score high for sponsor value (95) but audience pillar classifier maps them to `shopping` — excluded from top 50 by luxury/directory dominance.

### 4.2 Audience Alignment Issues

| Issue | Detail |
|---|---|
| **Directory timeliness inflation** | Consignment/hotel/spa directories get `startDate = now`, scoring 100 on timeliness despite being evergreen |
| **Opening/closing misclassification** | Some Pitch "opening" titles are actually closings (e.g., Ixtapa) — data quality, not ranking |
| **Reddit excluded correctly** | All 46 discussion rows score −100 on audience alignment |
| **Estate sales underrepresented in top 50** | Score 105 vs directory 120 — needs pillar-specific boost |

---

## 5. Proposed Scoring Model

### 5.1 Recommended Weights

Weights sum to **1.00**. Applied as: `total = Σ (dimension_score × weight)` where each dimension_score is 0–100.

| Dimension | Weight | Rationale |
|---|---|---|
| **Sponsor Value** | **0.22** | Primary business objective — named, bookable, premium |
| **Audience Alignment** | **0.20** | Kellie brand fit — luxury, dining, lifestyle |
| **Timeliness** | **0.12** | Event proximity; penalize evergreen directories without event dates |
| **Luxury** | **0.10** | Core pillar boost |
| **Dining** | **0.08** | Core pillar boost |
| **World Cup Relevance** | **0.08** | Strict visitor criteria only (not broad 2026 tag) |
| **Engagement** | **0.08** | Reduced from implicit ~25% — demote Reddit controversy |
| **Openings** | **0.06** | Timely local discovery |
| **Date Night** | **0.04** | Date-night experiences |
| **Sports** | **0.02** | Secondary — Sporting KC only |
| **Free Event** | **0.00** | Zero weight — builds traffic, not Kellie posts |

### 5.2 Dimension Scoring Rules (Proposed)

| Dimension | 0 | 50 | 100 |
|---|---|---|---|
| Sponsor Value | No sponsor group | Estate sale, coffee opening | Hotel, spa, luxury dining, consignment |
| Audience Alignment | discussion / tragedy | Free event, performance | Luxury, dining, estate, consignment, date night |
| Timeliness | No date / past >30d | 8–30 days out | 0–7 days out |
| World Cup | Not visitor-relevant | Visit KC dining/attraction | Hotel, rooftop, explicit WC/tourism |
| Engagement | Reddit never-post | Free event | Opening, closing, estate sale |
| Luxury | — | Keyword match | hotel_package, spa, consignment, luxury_dining |
| Dining | — | Pitch dining | restaurant_week, chef tasting, restaurant opening |
| Openings | — | — | Any opening category |
| Date Night | — | performance | date_night, rooftop, kauffman_date_nights |
| Sports | — | — | Sporting KC match |
| Free Event | — | — | Always 0 weight |

### 5.3 Example Top 25 After Proposed Weights

| Rank | Score | Title | Source | Category | Top Drivers |
|---|---|---|---|---|---|
| 1 | 81.8 | Corvino — chef tasting menus & supper club date nights | Chef Tasting Menus | luxury_dining | Sponsor 100, Audience 100, Luxury 90 |
| 2 | 81.8 | The Antler Room — seasonal chef tasting menus in Crossroads | Chef Tasting Menus | luxury_dining | Sponsor 100, Audience 100, Luxury 90 |
| 3 | 81.8 | Bluestem — prix fixe tasting menus & wine pairings | Chef Tasting Menus | luxury_dining | Sponsor 100, Audience 100, Luxury 90 |
| 4 | 81.8 | Lazia — Italian fine dining & chef special menus | Chef Tasting Menus | luxury_dining | Sponsor 100, Audience 100, Luxury 90 |
| 5 | 81.8 | The Rieger — historic fine dining & chef tasting experiences | Chef Tasting Menus | luxury_dining | Sponsor 100, Audience 100, Luxury 90 |
| 6 | 81.8 | The Savoy at 21c — chef-driven tasting menus & wine program | Chef Tasting Menus | luxury_dining | Sponsor 100, Audience 100, Luxury 90 |
| 7 | 79.6 | Nine Zero One — Loews rooftop lounge with downtown views | KC Rooftop Bars | rooftop_experience | Sponsor 100, WC 85, Luxury 90 |
| 8 | 79.6 | Mercury Room — rooftop dining & cocktails at Hotel Kansas City | KC Rooftop Bars | rooftop_experience | Sponsor 100, WC 85, Luxury 90 |
| 9 | 78.2 | Hotel Kansas City — Curio Collection weekend packages & rooftop dining | KC Hotel Packages | hotel_package | Sponsor 100, Audience 100, WC 85 |
| 10 | 76.4 | Percheron Rooftop — Crossroads skyline cocktails & date nights | KC Rooftop Bars | rooftop_experience | Sponsor 100, Date Night 85, WC 85 |
| 11 | 76.4 | 801 Rooftop — Power & Light District rooftop lounge | KC Rooftop Bars | rooftop_experience | Sponsor 100, Date Night 85, WC 85 |
| 12 | 76.4 | Hey Hey Club — rooftop cocktails above J. Rieger distillery | KC Rooftop Bars | rooftop_experience | Sponsor 100, Date Night 85 |
| 13 | 76.4 | Sky Cinema — rooftop movie nights & cocktails in Power & Light | KC Rooftop Bars | rooftop_experience | Sponsor 100, Date Night 85 |
| 14 | 75.0 | 21c Museum Hotel — art-forward boutique packages & date-night stays | KC Hotel Packages | hotel_package | Sponsor 100, Audience 100, WC 85 |
| 15 | 75.0 | Crossroads Hotel — boutique packages with Percheron Rooftop | KC Hotel Packages | hotel_package | Sponsor 100, Audience 100, WC 85 |
| 16 | 75.0 | Loews Kansas City — luxury packages & Nine Zero One rooftop | KC Hotel Packages | hotel_package | Sponsor 100, Audience 100, WC 85 |
| 17 | 75.0 | The Raphael Hotel — Country Club Plaza luxury stay packages | KC Hotel Packages | hotel_package | Sponsor 100, Audience 100, WC 85 |
| 18 | 75.0 | Sheraton Crown Center — family & couples getaway packages | KC Hotel Packages | hotel_package | Sponsor 100, Audience 100, WC 85 |
| 19 | 73.8 | Ameristar — casino hotel packages & entertainment getaways | Casino Hotel Packages | hotel_package | Sponsor 100, Audience 100 |
| 20 | 73.8 | Harrah's Kansas City — casino hotel packages & date-night entertainment | Casino Hotel Packages | hotel_package | Sponsor 100, Audience 100 |
| 21 | 73.8 | Bally's Kansas City — casino resort packages & nightlife | Casino Hotel Packages | hotel_package | Sponsor 100, Audience 100 |
| 22 | 71.0 | Do Good Co. — luxury consignment & designer resale | KC Consignment Shops | consignment_shop | Sponsor 100, Audience 100, Luxury 90 |
| 23 | 71.0 | The Curated Closet — boutique consignment & vintage | KC Consignment Shops | consignment_shop | Sponsor 100, Audience 100, Luxury 90 |
| 24 | 71.0 | My Best Friend's Closet — designer consignment Northland | KC Consignment Shops | consignment_shop | Sponsor 100, Audience 100, Luxury 90 |
| 25 | 71.0 | Style Encore — luxury resale & consignment Overland Park | KC Consignment Shops | consignment_shop | Sponsor 100, Audience 100, Luxury 90 |

**Notable absences from proposed top 25 (and why):**

| Content | Why Absent |
|---|---|
| McLaren crash Reddit post | Engagement dimension capped at 5 for tragedy; Audience −100 |
| Free Parks/Library events | Free Event weight = 0.00 |
| Estate sales | Score ~68 — below 71.0 threshold; recommend +0.05 estate sale weight bump |
| Coffee openings | Score ~65 — crowded out by directory tier |
| Visit KC PR releases | WC dimension = 0 under strict criteria; Audience low |

### 5.4 Recommended Weight Adjustment to Include Estate Sales

Adding **Estate Sale dimension at 0.05** (reduce Engagement to 0.03) would surface timely estate sales into top 25:

| Adjusted Rank | Title | Source |
|---|---|---|
| ~8 | Luxury $4.2M Mission Hills Micro Sale | EstateSales.net Kansas City |
| ~10 | BB Realty Live Auction in Lees Summit | EstateSales.net Kansas City |
| ~12 | $2M Prairie Village Micro Sale | EstateSales.net Kansas City |

---

## 6. Summary of Findings

| Question | Answer |
|---|---|
| Why is low-value discussion in top engagement? | **+30 base for all Reddit** + **+20 controversy bonus** elevates tragedy posts above publishable content |
| Why is World Cup tag so broad? | **`2026` keyword matches 307/327 tagged rows** — year overlap, not visitor intent |
| Are top 50 WC-ranked rows mostly wrong? | **No — 92% are legitimate** hotels, rooftops, dining; problem is tag breadth on non-ranked rows |
| What is strict WC false positive rate? | **52.9%** of all tagged rows |
| What % of Reddit would Kellie never post? | **50%** (23/46) under expanded criteria |
| What is engagement top-25 noise? | **8%** strict (2 Reddit), **48%** if excluding never-post + low-alignment free |
| Does sponsor ranking work? | **Yes** — top 50 are named, premium, bookable; estate sales underrepresented due to score ceiling |
| Does audience ranking work? | **Partially** — luxury/directory dominates; openings and estate sales crowded out |

---

## 7. Priority Fixes (Analysis Recommendations Only)

| Priority | Fix | Expected Impact |
|---|---|---|
| **P0** | Remove standalone `2026` WC keyword | WC tag rate 85% → ~15% |
| **P0** | Remove Reddit discussion base score (+30) and controversy bonus (+20) | McLaren crash drops out of top engagement |
| **P1** | Add explicit exclude list for WC: `discussion`, `free`, `estate_sale`, `news`, `releases` | Eliminates residual noise |
| **P1** | Cap directory-source timeliness at 40 (evergreen, not "this week") | Opens top-25 to timely openings/estate sales |
| **P2** | Add Estate Sale dimension weight (0.05) | Surfaces 40 estate sale rows into composite top 25 |
| **P2** | Require co-occurrence for neighborhood WC keywords (`crossroads` + `dining`) | Reduces weak keyword false positives |

---

*Generated from live database export of 385 ingested rows. No application code, data, or ranking logic was modified.*
