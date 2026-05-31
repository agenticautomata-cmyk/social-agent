# Content Pillar Analysis

**Date:** 2026-05-31  
**Scope:** All ingested opportunities currently in the database  
**Method:** Live API snapshot (`GET /api/content?ingested=true&limit=200`) + keyword/source classification  
**No code changes** — analysis only

---

## Executive Summary

The database holds **112 ingested opportunities** across five active sources. After classifying every row into Kellie's ten content pillars, the inventory is **heavily skewed toward Sports (23%)** and **Other (30%)**, while core tourism pillars — **Openings, Free Things To Do, Dining, and Weekend Activities** — are critically thin.

| Finding | Detail |
|---|---|
| Strongest pillar | **Sports** — 26 rows (20 Sporting KC matches + 6 from other sources) |
| Weakest actionable pillars | **Free Things To Do** (2), **Openings** (3), **Luxury Deals** (5) |
| Biggest noise bucket | **Other** — 34 rows (30%); **33 of 34 are Reddit** help/Q&A threads |
| Best source mix | Non-Reddit sources: **59 of 60 rows** are actionable; Reddit: **19 of 52** (37%) |
| Kellie-ready share | **78 of 112 (70%)** classify into a purposeful pillar; **34 rows are off-brand** |

**Bottom line:** Ingest breadth has improved since Phase 2A (Visit KC → venues → sports), but **pillar balance still does not match Kellie's audience**. Sports calendar volume dominates; dining, openings, free activities, and weekend guides need dedicated sources — not more Reddit volume.

---

## Methodology

Each row was classified into exactly one pillar using title, body, hook, `opportunityCategory`, source type, and metadata. Rules prioritize:

1. **Source signal** — Sporting KC → Sports; Kauffman/Union Station → Events or Family
2. **Keyword/topic match** — restaurant, opening, free, world cup, family, etc.
3. **Fallback** — Reddit discussion/help threads → Other

### Pillars defined

| Pillar | Definition |
|---|---|
| **Luxury Deals** | Exclusive savings, VIP, premium offers, Restaurant Week deals |
| **Dining** | Restaurants, BBQ, breweries, food events, culinary tourism |
| **Openings** | New venues, grand openings, museum/store/restaurant launches |
| **Sports** | MLS, NWSL, Chiefs, Royals, rugby, game-day events |
| **Family Activities** | Kid-friendly, zoo, Science City, planetarium, family shows |
| **Events** | Concerts, exhibitions, festivals, performances, cultural happenings |
| **Weekend Activities** | "This weekend," date-night, getaway, weekly roundups |
| **Free Things To Do** | Explicitly free admission, no-cover, community free events |
| **World Cup** | FIFA 2026, World Cup host city, WC tourism angles |
| **Other** | Help requests, politics, contractors, crime, misc discussion |

---

## 1. Counts by Pillar

| Pillar | Count | Sample titles |
|---|---|---|
| **Sports** | **26** | Sporting KC vs Minnesota United; Premier League Fan Fest; Beyblade Tournament |
| **Other** | **34** | Sunroom skylight replacement; Dating Chats/Discords?; Red Lobster closes |
| **Events** | **14** | Mrs. Doubtfire; Glenn Miller Orchestra; Berlin Wall exhibition |
| **Family Activities** | **9** | Bluey's Big Play; Science City; Daily Planetarium Shows |
| **World Cup** | **8** | Matador WC matches guide; Rugby World Cup host bid; FIFA resident deals |
| **Dining** | **6** | KC Restaurant Week; BBQ Experience; Black-owned brewery profile |
| **Luxury Deals** | **5** | Exclusive distillery savings; Restaurant Week returns 2026 |
| **Weekend Activities** | **5** | BBC Best Places to Travel; Dog activities this weekend? |
| **Openings** | **3** | New Media Tech Museum opening; European Tour Send-off |
| **Free Things To Do** | **2** | Future Stages Festival FREE; Sunset Music Fest free concerts |
| **Total** | **112** | |

---

## 2. Percentages by Pillar

### All rows (n = 112)

| Pillar | Count | % of total |
|---|---|---|
| Sports | 26 | **23.2%** |
| Other | 34 | **30.4%** |
| Events | 14 | **12.5%** |
| Family Activities | 9 | **8.0%** |
| World Cup | 8 | **7.1%** |
| Dining | 6 | **5.4%** |
| Luxury Deals | 5 | **4.5%** |
| Weekend Activities | 5 | **4.5%** |
| Openings | 3 | **2.7%** |
| Free Things To Do | 2 | **1.8%** |

### Actionable rows only (n = 78, excluding Other)

| Pillar | Count | % of actionable |
|---|---|---|
| Sports | 26 | **33.3%** |
| Events | 14 | **17.9%** |
| Family Activities | 9 | **11.5%** |
| World Cup | 8 | **10.3%** |
| Dining | 6 | **7.7%** |
| Luxury Deals | 5 | **6.4%** |
| Weekend Activities | 5 | **6.4%** |
| Openings | 3 | **3.8%** |
| Free Things To Do | 2 | **2.6%** |

### Visual distribution (actionable only)

```
Sports              █████████████████████████████████ 33%
Events              ██████████████████ 18%
Family Activities   ███████████ 12%
World Cup           ██████████ 10%
Dining              ████████ 8%
Luxury Deals        ██████ 6%
Weekend Activities  ██████ 6%
Openings            ████ 4%
Free Things To Do   ██ 3%
```

---

## 3. Pillar Breakdown by Source

| Source | Total | Sports | Events | Family | WC | Dining | Luxury | Weekend | Openings | Free | Other |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Reddit** | 52 | 3 | 2 | 4 | 1 | 2 | 2 | 2 | 2 | 1 | **33** |
| **Sporting KC** | 20 | **20** | — | — | — | — | — | — | — | — | — |
| **Visit KC** | 20 | 3 | — | — | 7 | 4 | 3 | 2 | — | — | 1 |
| **Kauffman** | 16 | — | 10 | 3 | — | — | — | 1 | 1 | 1 | — |
| **Union Station** | 4 | — | 2 | 2 | — | — | — | — | — | — | — |
| **Crossroads** | 0 | — | — | — | — | — | — | — | — | — | — |

**Observations:**

- **Reddit** supplies 63% of all "Other" rows and only 2 genuine Openings, 2 Dining, 2 Events
- **Sporting KC** fills Sports exclusively — 20 match rows, no pillar diversity
- **Visit KC** drives World Cup (7), Dining (4), Luxury (3) — strong tourism PR but light on dated local events
- **Kauffman** is pure Events/Family (13 of 16 actionable)
- **Union Station** is Family + Events (4 rows total — small but on-brand)
- **Crossroads** is wired but **0 rows** (empty RSS feed)

---

## 4. Underrepresented Pillars

Compared to a balanced Kellie content mix (~78 actionable rows), pillars are ranked by gap from target:

| Pillar | Actual | Target~ | Gap | Status |
|---|---|---|---|---|
| **Openings** | 3 | 9 | **−6** | 🔴 Critical |
| **Weekend Activities** | 5 | 11 | **−6** | 🔴 Critical |
| **Dining** | 6 | 11 | **−5** | 🔴 Critical |
| **Free Things To Do** | 2 | 7 | **−5** | 🔴 Critical |
| **Luxury Deals** | 5 | 6 | −1 | 🟡 Slight gap |
| **Family Activities** | 9 | 9 | 0 | 🟢 On target |
| **Events** | 14 | 13 | +1 | 🟢 On target |
| **World Cup** | 8 | 4 | +4 | 🟢 Slight surplus |
| **Sports** | 26 | 7 | **+19** | 🔵 Overrepresented |

### Why these pillars matter for Kellie's audience

Kellie creates **local discovery and tourism content** for Kansas City visitors and residents. Her highest-engagement formats map to:

| Pillar | Audience value | Current gap |
|---|---|---|
| **Dining** | Core KC identity (BBQ, new restaurants) | Only 6 rows; no dedicated restaurant opening feed |
| **Openings** | "New in KC" is a proven social format | 3 rows total; 1 is a real opening (Media Tech Museum) |
| **Weekend Activities** | "What to do this weekend" drives saves/shares | 5 rows; mostly travel listicles, not dated plans |
| **Free Things To Do** | High reach, family-friendly, shareable | 2 rows; both from venue sources |
| **Luxury Deals** | Date night / premium audience upsell | 5 rows; mostly Restaurant Week PR |
| **Family Activities** | Parent demographic; zoo/museum content | 9 rows — acceptable but concentrated in 2 venues |
| **Events** | Concerts, exhibits, festivals | 14 rows — healthy from Kauffman + Union Station |
| **Sports** | Game-day content | 26 rows — **3.7× target**; 20 are repetitive match listings |
| **World Cup** | 2026 timely angle | 8 rows — good PR coverage from Visit KC |
| **Other** | Not postable | 34 rows — **30% of inventory is noise** |

### Root causes

1. **No restaurant/opening source** — highest-value Kellie pillar has no feed
2. **No free-events aggregate** — libraries, parks, museums with free days untapped
3. **No weekend roundup source** — The Pitch, IN Kansas City, Visit KC calendar not ingested
4. **Crossroads empty** — Night Market / First Fridays not flowing
5. **Sporting KC fills Sports disproportionately** — one match ≠ one unique content piece
6. **Reddit inflates Other** — 52 rows ingested, 33 off-brand

---

## 5. Full Row Classification

<details>
<summary>All 112 rows by pillar (click to expand)</summary>

### Dining (6)
| Source | Title |
|---|---|
| visitkc | KC Restaurant Week 2025 Generates $129K Donation to Local Charity |
| visitkc | Visit KC launches revamped BBQ Experience program |
| visitkc | Smithsonian Magazine: The World's First Barbecue Museum… |
| visitkc | Adventure: Could Missouri's first Black-owned brewery… |
| reddit | Mexican sit-down restaurants |
| reddit | Best halfway authentic Mexican breakfast/brunch… |

### Openings (3)
| Source | Title |
|---|---|
| reddit | New Media Tech Museum opening this Monday at 1600 Baltimore in the Crossroads |
| reddit | Trying to explain… KC is in Missouri (borderline; classified opening-adjacent) |
| kauffman | Kansas City Symphony Presents European Tour Send-off Concert |

### Sports (26)
| Source | Count | Notes |
|---|---|---|
| sporting_kc | 20 | Full MLS schedule through horizon |
| visitkc | 3 | Premier League, WNBA, Black History sports angles |
| reddit | 3 | Beyblade tournament, weekly roundup, West Bottoms trains |

### Family Activities (9)
| Source | Title |
|---|---|
| kauffman | Bluey's Big Play; Mrs. Doubtfire; Oliver! |
| union_station | Science City General Admission; Daily Planetarium Shows |
| reddit | Place to see axolotl; Need help with a few things; Looking for an adventures; Thank-you story |

### Events (14)
| Source | Title |
|---|---|
| kauffman | 10 performances (Symphony, Graham Nash, Herbie Hancock, Broadway, etc.) |
| union_station | Berlin Wall exhibition; The Mandalorian and Grogu |
| reddit | Wedding reception at Liberty Memorial; Playing raytown records |

### Weekend Activities (5)
| Source | Title |
|---|---|
| visitkc | BBC Best Places to Travel 2025; Lonely Planet Weekend Getaways |
| kauffman | Gil Shaham Plays Brahms |
| reddit | Dog activities this weekend?; KC young adults Friday night? |

### Free Things To Do (2)
| Source | Title |
|---|---|
| kauffman | Future Stages Festival FREE Family-Friendly Event |
| reddit | Sunset Music Fest free concerts (Leawood) |

### Luxury Deals (5)
| Source | Title |
|---|---|
| visitkc | Restaurant Week 2026; Exclusive distillery/winery savings; Restaurant Week guide |
| reddit | BCBS/NKC Health deal; Worlds of Fun seasonal pass |

### World Cup (8)
| Source | Title |
|---|---|
| visitkc | 7 rows (Matador WC guide, rugby host bid, budget-friendly WC city, etc.) |
| reddit | Has KC negotiated FIFA deals for residents? |

### Other (34)
33 Reddit help/Q&A/politics/contractor threads + 1 Visit KC awards listicle.

</details>

---

## 6. Recommended Next Sources (Ranked by Business Value)

Ranked by **pillar gap filled × editorial quality × estimated daily yield** for Kellie's tourism/discovery audience. Sources already ingested are noted; focus is on what to add next.

| Rank | Source | Primary pillars filled | Feed type | Est. daily yield | Why now |
|---|---|---|---|---|---|
| **1** | **Visit KC events calendar** | Dining, Events, Weekend, Free, World Cup | HTML/JSON scrape | 15–40 | Biggest single gap-closer; 4,000+ dated listings; fills 5 underrepresented pillars |
| **2** | **KC Restaurant Week + new restaurant trackers** | Dining, Openings, Luxury | RSS + rules | 2–8 | Openings pillar at 3 rows; KC's strongest brand pillar is food |
| **3** | **KC Zoo events** | Family, Free, Weekend | HTML/API | 1–3 | Family pillar OK but zoo adds dated, visual, recurring content |
| **4** | **Nelson-Atkins + Kemper Museum** | Events, Free, Family | HTML/ICS | 2–5 | Free Things pillar at 2 rows; museum exhibits = premium Kellie content |
| **5** | **Powell Gardens** | Events, Family, Free, Weekend | HTML/ICS | 2–5 | Seasonal festivals (butterflies, luminary nights) — high visual appeal |
| **6** | **First Fridays (Crossroads rule + scrape)** | Weekend, Events, Free, Openings | Synthetic + HTML | 0–1 (spike monthly) | Signature KC moment; Crossroads RSS empty — use rules + events page |
| **7** | **KC Current (NWSL) schedule** | Sports, Family, World Cup adjacency | JSON/HTML (Forge pattern) | 0–1 | Diversify Sports beyond SKC; women's sports audience |
| **8** | **Chiefs / Royals schedules** | Sports, Weekend, Family | JSON/ICS | 0–2 | Seasonal spikes; broader sports pillar without 20 identical match rows |
| **9** | **Free events aggregate** (Library, Parks & Rec, Money Museum) | Free, Family, Weekend | ICS/HTML | 3–12 | Directly addresses most underrepresented pillar |
| **10** | **The Pitch / IN Kansas City events** | Dining, Openings, Weekend, Events | HTML | 2–5 | Local editorial picks; strong "what's new" signal |
| **11** | **Local festival seed pack** (Plaza Art Fair, Irish Fest, Boulevardia) | Events, Weekend, Free | Rules + RSS | 1–5 | Seasonal spikes; rule-based annual dates low effort |
| **12** | **Reddit filter (not new source)** | — | Filter pipeline | 50→5 | Stop Other pillar inflation; keep 2 openings, 1 weekly roundup |

### Sources already ingested — pillar contribution

| Source | Status | Pillar value | Action |
|---|---|---|---|
| Visit KC RSS | ✅ Live (20 rows) | World Cup, Dining, Luxury | Add **events calendar** for dated events |
| Sporting KC | ✅ Live (20 rows) | Sports only | Sufficient; dedupe match rows for content |
| Kauffman Center | ✅ Live (16 rows) | Events, Family | Maintain; strong pillar fit |
| Union Station | ✅ Live (4 rows) | Family, Events | Maintain; consider deduping daily exhibitions |
| Crossroads RSS | ⚠️ Wired, 0 rows | Events, Weekend, Openings | Fix feed or switch to events page scrape |
| Reddit | ✅ Live (52 rows) | Mostly Other | **Filter**, do not expand |

### Priority matrix: pillar × source

| Pillar | Best next source | Secondary |
|---|---|---|
| Openings | Restaurant trackers, The Pitch | Crossroads events scrape |
| Dining | Visit KC calendar, Restaurant Week | Reddit (filtered openings only) |
| Free Things To Do | Nelson-Atkins, Library ICS, Parks & Rec | Visit KC calendar (free filter) |
| Weekend Activities | Visit KC calendar, The Pitch | First Fridays rules |
| Luxury Deals | Restaurant Week, Visit KC specials | Hotel/spa deal pages (future) |
| Family Activities | KC Zoo, Nelson-Atkins | Union Station (existing) |
| Events | Visit KC calendar, Powell Gardens | Kauffman (existing) |
| Sports | KC Current, Chiefs/Royals | Sporting KC (existing) |
| World Cup | Visit KC calendar (2026 filter) | FIFA host city pages (future) |

---

## 7. Strategic Recommendations

### Immediate (highest ROI)

1. **Ingest Visit KC events calendar** — single source fills Dining, Weekend, Free, Events, and Openings gaps simultaneously
2. **Filter Reddit before display** — cuts Other from 30% to ~5% without losing the 2–3 high-signal Reddit rows
3. **Fix Crossroads ingest** — RSS empty; Night Market and First Fridays are core Weekend/Events pillars

### Medium term

4. **KC Zoo + Nelson-Atkins** — Family and Free pillars with strong visual content
5. **Restaurant Week dedicated source** — anchor Dining + Luxury during January/February spike
6. **Free events bundle** — library + parks ICS feeds tagged `price=free`

### Content strategy note

Sporting KC's 20 match rows should be treated as **one content theme with 20 dates**, not 20 unique opportunities. For Kellie's editorial calendar, collapse to home-game highlights (~10/postable) to avoid Sports pillar crowding out Dining and Openings.

---

## Appendix: Ideal vs Actual Pillar Mix

Target mix assumes Kellie posts **~3–5 times/week** across diverse pillars. Actual inventory vs balanced target (78 actionable rows):

| Pillar | Actual | Target | Δ |
|---|---|---|---|
| Dining | 6 | 11 | −5 |
| Openings | 3 | 9 | −6 |
| Events | 14 | 13 | +1 |
| Weekend Activities | 5 | 11 | −6 |
| Family Activities | 9 | 9 | 0 |
| Free Things To Do | 2 | 7 | −5 |
| Sports | 26 | 7 | +19 |
| Luxury Deals | 5 | 6 | −1 |
| World Cup | 8 | 4 | +4 |

**Five pillars are underrepresented by 5–6 rows each.** Visit KC calendar + free-events aggregate + restaurant tracker would rebalance the inventory within one implementation phase.

---

**Analysis complete.** Snapshot reflects 112 ingested rows as of 2026-05-31. No application code modified.
