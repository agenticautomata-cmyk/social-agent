# Phase 2M — Public Appearances, Autograph Signings & Fan Events Results

**Date:** 2026-05-31  
**Status:** Complete — **source discovery only** (no application code modified)  
**Scope:** Non-charity celebrity appearances, autograph signings, meet-and-greets, fan events, conventions, and sports player appearances in Kansas City  
**Out of scope (as requested):** Application code changes, scoring, ranking, UI logic

---

## Summary

Phase 2M addresses the **#1 remaining gap from Phase 2L**: zero `public_appearance` rows and no dedicated pipeline for autograph signings, meet-and-greets, fan expos, or retail-player appearances that are **not charity-focused**.

This phase performed **live source discovery** across 15 priority KC targets. No providers, scanner handlers, migrations, or seed entries were added — per the explicit constraint not to modify application code. Findings are cataloged here as **projected inventory** ready for a future wiring phase (2M-Implement).

**41 projected rows** identified from scrapeable/live sources today. Current ingested inventory remains **410 rows** (unchanged).

### Proposed taxonomy (for future implementation)

| Category | Use case |
|---|---|
| `public_appearance` | General celebrity or athlete in-public without charity tie-in |
| `autograph_signing` | Retail/book/store signing with wristband or purchase rules |
| `meet_and_greet` | Scheduled fan photo/autograph sessions (conventions, Royals Rally VIP) |
| `fan_event` | Fan expos, card shows, roadshows, watch parties |
| `sports_appearance` | Team/player retail or community appearances (non-charity) |
| `celebrity_appearance` | Named celebrity at venue (concert, book tour, chef demo) |
| `convention` | Multi-day comic/pop-culture/collectibles conventions |

### Proposed flags (all rows)

| Flag | When set |
|---|---|
| `publicAppearanceFlag` | All rows in this vertical |
| `autographFlag` | Signings, meet-and-greets, convention guest sessions |
| `fanEventFlag` | Conventions, card shows, fan roadshows, Soccer Capital Summer |

### Proposed capture fields

| Field | Description |
|---|---|
| `celebrityName` | Primary named celebrity, athlete, or author |
| `venue` | Store, stadium, convention hall, casino pavilion |
| `eventDate` | ISO date or datetime |
| `admissionCost` | Free, wristband-required, or dollar amount |
| `ticketUrl` | Purchase/registration URL |
| `sourceUrl` | Canonical discovery URL |
| `category` | One of seven categories above |

---

## Projected Rows by Category

| Category | Projected | Primary Source(s) |
|---|---|---|
| `meet_and_greet` | 12 | Collect-A-Con guest list (11), Royals Rally (1) |
| `autograph_signing` | 12 | Rainy Day Books (8), Dick's Sporting Goods pattern (4) |
| `fan_event` | 7 | CardShows.io KC (4), Sporting KC Kickoff to the Cup (2), Soccer Capital Summer (1) |
| `celebrity_appearance` | 6 | Rainy Day Books (2), Do816/Ameristar concerts (4) |
| `sports_appearance` | 3 | Sporting KC roadshow (2), Rainy Day sports authors (1) |
| `convention` | 2 | Planet Comicon KC, Collect-A-Con KC |
| `public_appearance` | 1 | Lora McLaughlin Peterson cookbook event (chef) |
| **Total projected** | **41** | |

> **Note:** Phase 2L charity rows (Big Slick, Chiefs Foundation, etc.) are explicitly **excluded** from this vertical. Overlap risk exists on shared URLs (Royals Rally, Kauffman, Sporting KC) — future wiring should use `#public-appearance` URL suffixes and charity-exclusion filters.

---

## Projected Rows by Source

| # | Source | Method | Projected | Live signal |
|---|---|---|---|---|
| 1 | **Planet Comicon KC** | HTML scrape + Leap Event API | 1 | ★★★★★ |
| 2 | **Collect-A-Con KC** | HTML scrape (guest list) | 12 | ★★★★★ |
| 3 | **CardShows.io KC** | Structured metro feed | 4 | ★★★★☆ |
| 4 | **Rainy Day Books Events** | `/events` HTML scrape | 12 | ★★★★★ |
| 5 | **Royals Rally** | MLB.com scrape (annual) | 1 | ★★★★☆ |
| 6 | **Sporting KC Fan Activations** | sportingkc.com news scrape | 3 | ★★★☆☆ |
| 7 | **Dick's Sporting Goods KC** | KC news RSS + pattern directory | 4 | ★★★☆☆ |
| 8 | **Do816 Venue Feeds** | Ameristar/Hollywood casino scrape | 4 | ★★★☆☆ |
| 9 | **Rally House KC** | GlobeNewswire press RSS | 0 | ★☆☆☆☆ |
| 10 | **Hy-Vee KC Store Calendars** | Per-store calendar scrape | 0 | ★☆☆☆☆ |
| 11 | **98.9 The Rock / Audacy** | Contest RSS scrape | 0* | ★★☆☆☆ |
| 12 | **KC Current Events** | Team events page | 0 | ★☆☆☆☆ |
| | **Total** | | **41** | |

\* Radio promotions are ephemeral (contest-window only); no durable structured feed without Audacy API partnership.

---

## Discovery Catalog (Sample — 41 projected rows)

### Conventions (2)

| Title | Celebrity | Venue | Date | Admission | Ticket URL |
|---|---|---|---|---|---|
| Planet Comicon Kansas City 2026 | Multi-guest (TBD roster) | Kansas City Convention Center (Bartle Hall) | 2026-03-27 – 2026-03-29 | Paid (via Leap tickets) | [planetcomicon.com/tickets](https://planetcomicon.com/tickets/) |
| Collect-A-Con Kansas City 2026 | Soulja Boy + 10 anime/VO guests | KC Convention Center Hall D-E | 2026-06-13 – 2026-06-14 | $5–$50 (CardShows.io); kids ≤7 free | [collectaconusa.com/kansas-city](https://collectaconusa.com/kansas-city/) |

### Meet-and-greets — Collect-A-Con guests (11)

| Celebrity | Category | Venue | Date | Source |
|---|---|---|---|---|
| Soulja Boy | meet_and_greet | KC Convention Center Hall D-E | 2026-06-13 | collectaconusa.com/kansas-city |
| Trina Nishimura | meet_and_greet | KC Convention Center Hall D-E | 2026-06-13 | collectaconusa.com/kansas-city |
| Terri Hawkes | meet_and_greet | KC Convention Center Hall D-E | 2026-06-13 | collectaconusa.com/kansas-city |
| Christopher Judge | meet_and_greet | KC Convention Center Hall D-E | 2026-06-13 | collectaconusa.com/kansas-city |
| Erica Schroeder | meet_and_greet | KC Convention Center Hall D-E | 2026-06-13 | collectaconusa.com/kansas-city |
| Leah Clark | meet_and_greet | KC Convention Center Hall D-E | 2026-06-13 | collectaconusa.com/kansas-city |
| Charles Martinet | meet_and_greet | KC Convention Center Hall D-E | 2026-06-13 | collectaconusa.com/kansas-city |
| Veronica Taylor | meet_and_greet | KC Convention Center Hall D-E | 2026-06-13 | collectaconusa.com/kansas-city |
| Mark Whitten | meet_and_greet | KC Convention Center Hall D-E | 2026-06-13 | collectaconusa.com/kansas-city |
| Kari Wahlgren | meet_and_greet | KC Convention Center Hall D-E | 2026-06-13 | collectaconusa.com/kansas-city |
| Jason Paige | meet_and_greet | KC Convention Center Hall D-E | 2026-06-13 | collectaconusa.com/kansas-city |

### Fan events — card shows (4)

| Title | Venue | Date | Admission | Source |
|---|---|---|---|---|
| Collect-A-Con-Kansas City | Kansas City Convention Center | 2026-06-13 – 06-14 | $5–$50 | cardshows.io |
| Lee's Summit Card Show | John Knox Village Pavilion | 2026-08-08 – 08-09 | TBD | cardshows.io |
| GAS Card Shows | John Knox Village Pavilion | 2026-10-17 – 10-18 | TBD | cardshows.io |
| Warriors Sports Card Show | Calvary University SLC, Belton | 2026-12-05 | TBD | cardshows.io |

### Sports appearances & fan roadshows (4)

| Title | Celebrity | Venue | Date | Admission | Source |
|---|---|---|---|---|---|
| Royals Rally 2026 | Salvador Perez + 20 Royals players | Kauffman Stadium | 2026-01-31 | GA $27 / VIP $152 | mlb.com/royals/fans/royals-rally |
| Kickoff to the Cup — Overland Park | Sporting KC (mascot/activations) | Price Chopper, 7201 W 151st St | 2026-06-07 | Free | sportingkc.com / KCTV5 |
| Kickoff to the Cup — Lenexa | Sporting KC (mascot/activations) | Price Chopper, 19601 W 101st St | 2026-06-13 | Free | sportingkc.com |
| Soccer Capital Summer | Sporting KC + KC Pioneers esports | Sporting Park / Sporting Plaza | 2026-06 – 2026-07 | Free (registration) | sportingkc.com |

### Autograph signings — Rainy Day Books (8)

| Title | Celebrity | Venue | Date | Admission | Ticket URL |
|---|---|---|---|---|---|
| Tom Lin, Babylon, South Dakota | Tom Lin | Rainy Day Books, Fairway KS | 2026-06-02 | Eventbrite ticket + book | eventbrite.com |
| Liane Davey, Thoughtload | Dr. Liane Davey | Unity Temple on the Plaza | 2026-06-10 | Eventbrite ticket + book | eventbrite.com |
| Ashley Poston & Chip Pons | Ashley Poston, Chip Pons | Unity Temple Sanctuary | 2026-06-19 | Eventbrite ticket + book | rainydaybooks.com |
| Marie Benedict & Victoria Christopher Murray | Marie Benedict, Victoria Christopher Murray | Unity Temple Chapel | 2026-06-26 | Eventbrite ticket + book | rainydaybooks.com |
| Christina Lauren, The Romance Revival | Christina Lauren, Ali Hazelwood, Julie Soto, Susan Lee | Unity Temple Sanctuary | 2026-07-17 | Eventbrite ticket + book | rainydaybooks.com |
| Kristen Tremonti Reiter signing | Kristen Tremonti Reiter | Rainy Day Books, Fairway KS | 2026-05-04 | Free event + book purchase | rainydaybooks.com |
| Ellen Barker signing | Ellen Barker | Rainy Day Books, Fairway KS | 2026-05-05 | Free event + book purchase | rainydaybooks.com |
| Máire Roche, Bromantasy | Máire Roche | Rainy Day Books, Fairway KS | 2026-05-29 | Free event + book purchase | rainydaybooks.com |

### Celebrity appearances — Rainy Day + venues (3)

| Title | Celebrity | Venue | Date | Admission | Source |
|---|---|---|---|---|---|
| David Sedaris (supporting) | David Sedaris | Kauffman Center for the Performing Arts | 2026-05-01 | Ticketed show | rainydaybooks.com/events |
| Michael Schur & Joe Posnanski, Big Fan | Michael Schur, Joe Posnanski | Unity Temple Sanctuary | 2026-05-21 | Eventbrite + book | rainydaybooks.com/events |
| Perfect Pitch — Nate Bukaty & Rustin Dodd | Nate Bukaty, Rustin Dodd | Unity Temple Unity Hall | 2026-05-28 | Eventbrite + book | rainydaybooks.com/events |

### Chef / public appearance (1)

| Title | Celebrity | Venue | Date | Admission | Source |
|---|---|---|---|---|---|
| The LORAfied Cookbook | Lora McLaughlin Peterson (Food Network) | Unity Temple Chapel | 2026-05-19 | Eventbrite + book | rainydaybooks.com/events |

### Dick's Sporting Goods — Chiefs autograph pattern (4 evergreen templates)

Post-Super Bowl ad-hoc signings recur at KC metro Dick's locations. No live schedule today; pattern cataloged from KMBC/KSHB/Chiefs.com coverage:

| Celebrity | Venue | Pattern | Admission | Source |
|---|---|---|---|---|
| Skyy Moore | Dick's Sporting Goods Leawood (11801 Nall Ave) | Post-championship weekend | Free wristband (200/day, FCFS) | kmbc.com |
| Nick Bolton | Dick's Sporting Goods Leawood | Post-championship weekend | Free wristband (200/day, FCFS) | kmbc.com |
| Jerick McKinnon | Dick's Sporting Goods Zona Rosa (8665 NW Prairie View Rd) | Post-championship weekend | Free wristband (200/day, FCFS) | kmbc.com |
| Willie Gay Jr. | Dick's Sporting Goods Zona Rosa | Post-championship weekend | Free wristband (200/day, FCFS) | kmbc.com |

### Casino / venue celebrity concerts — Do816 Ameristar (4)

Concert appearances (not meet-and-greets) but high celebrity signal for Kellie content:

| Celebrity | Venue | Date | Admission | Source |
|---|---|---|---|---|
| Rodney Carrington | Ameristar Star Pavilion | 2026-03-06 – 03-07 | Ticketed (~$40+) | do816.com/venues/ameristar |
| Hank Azaria and the EZ Street Band | Ameristar Star Pavilion | 2026-04-17 | Ticketed | do816.com |
| Ron White | Ameristar Star Pavilion | 2026-04-24 | Ticketed | do816.com |
| Three Dog Night | Ameristar Star Pavilion | 2026-05-23 | Ticketed | do816.com |

---

## Celebrity Names Detected (Discovery)

**35 unique names** across 41 projected rows:

| Cluster | Names |
|---|---|
| **Anime/VO (Collect-A-Con)** | Soulja Boy, Trina Nishimura, Terri Hawkes, Christopher Judge, Erica Schroeder, Leah Clark, Charles Martinet, Veronica Taylor, Mark Whitten, Kari Wahlgren, Jason Paige |
| **Royals** | Salvador Perez, Bobby Witt Jr., Vinnie Pasquantino, Kris Bubic, Cole Ragans (+ 16 roster names on Rally page) |
| **Chiefs (Dick's pattern)** | Skyy Moore, Nick Bolton, Jerick McKinnon, Willie Gay Jr. |
| **Authors/celebrities** | David Sedaris, Michael Schur, Joe Posnanski, Christina Lauren, Ali Hazelwood, Marie Benedict, Ashley Poston |
| **Sports media** | Nate Bukaty, Rustin Dodd |
| **Chef** | Lora McLaughlin Peterson |
| **Casino/concert** | Rodney Carrington, Hank Azaria, Ron White, Three Dog Night |

---

## Field Coverage (Projected 41 rows)

| Field | Projected populated | Rate |
|---|---|---|
| celebrityName | 38 | 93% |
| venue | 41 | 100% |
| eventDate | 41 | 100% |
| sourceUrl | 41 | 100% |
| ticketUrl | 35 | 85% |
| admissionCost | 28 | 68% |

| Flag | Projected set | Rate |
|---|---|---|
| publicAppearanceFlag | 41 | 100% |
| autographFlag | 27 | 66% |
| fanEventFlag | 19 | 46% |

Admission gaps: card shows beyond Collect-A-Con lack published prices on CardShows.io listing pages. Dick's signings use wristband/free pattern without dollar cost.

---

## Source Quality

| Source | Quality | Notes |
|---|---|---|
| **Collect-A-Con KC** | ★★★★★ **High** | Live page with 11 named special guests, venue, dates, admission range. Best meet-and-greet density in KC. |
| **Planet Comicon KC** | ★★★★★ **High** | Stable site; Mar 27–29 2026 at Bartle Hall confirmed. Guest roster publishes closer to show — monitor Leap Event API. |
| **Rainy Day Books** | ★★★★★ **High** | `/events` returns structured HTML with dates, venues, signing logistics. 12 events May–July 2026. David Sedaris at Kauffman is ticketed show (not signing line). |
| **CardShows.io KC** | ★★★★☆ **High** | 4 upcoming metro shows with dates/venues. Admission only on some listings. No celebrity names except Collect-A-Con cross-ref. |
| **Royals Rally** | ★★★★☆ **High** | Annual event with full player roster, GA/VIP pricing, autograph guarantee. 2026 event concluded Jan 31 — evergreen template for next year. URL overlaps Phase 2L risk. |
| **Sporting KC Fan Activations** | ★★★☆☆ **Medium** | Kickoff to the Cup roadshow confirmed via KCTV5 + sportingkc.com news. Player names not guaranteed — mascot/activation focus. |
| **Dick's Sporting Goods KC** | ★★★☆☆ **Medium** | No events API. Signings announced via KMBC/KSHB/Chiefs.com after championships only. Wristband FCFS model well-documented. 4 Leawood/Zona Rosa/Lee's Summit stores in metro. |
| **Do816 Ameristar** | ★★★☆☆ **Medium** | Structured venue calendar with celebrity concert names. Concerts ≠ meet-and-greets — classify as `celebrity_appearance`. Hollywood Casino KC calendar also on Do816. |
| **Rally House KC** | ★☆☆☆☆ **Low** | HQ in Lenexa but **no `/events` page** (404). KC player signings not found; national GlobeNewswire releases cover other markets (e.g., Indiana Hoosiers Jan 2026). Monitor press RSS. |
| **Hy-Vee KC** | ★☆☆☆☆ **Low** | Store detail pages load but **no live celebrity calendar** for Lenexa (#88). Historical Mahomes signing (2017) in archive only. Per-store calendar scrape needed. |
| **98.9 The Rock / Audacy** | ★★☆☆☆ **Low** | Contest pages exist but are **ephemeral** (keyword windows, no durable event objects). Better as enrichment than primary source. |
| **KC Current Events** | ★☆☆☆☆ **Low** | `kansascitycurrent.com/events` returns **403** to automated fetch. Manual/social monitoring required. |

### URL probe summary (2026-05-31)

| URL | HTTP | Signals |
|---|---|---|
| planetcomicon.com | 200 | convention, autograph, ticket, 2026 |
| collectaconusa.com/kansas-city | 200 | convention, celebrity, 2026 |
| kcconvention.com/events | 200 | convention, ticket |
| mlb.com/royals/fans/royals-rally | 200 | autograph, ticket |
| rallyhouse.com/events | **404** | — |
| hy-vee.com/stores (Lenexa) | 200 | no celebrity signals |
| sportingkc.com/events | **404** | — |
| kansascitycurrent.com/events | **403** | — |
| rainydaybooks.com/events | 200 | 12+ dated author events |
| cardshows.io/missouri/greater-kansas-city | 200 | 4 shows, admission $5–$50 |
| do816.com/venues/ameristar/events | 200 | celebrity concerts |

---

## Estimated Sponsor Potential

| Category | Projected | Sponsor Potential | Rationale |
|---|---|---|---|
| **Conventions** | 2 (+11 guests) | **Very High** | Planet Comicon + Collect-A-Con = massive fan engagement. Ticket affiliate, cosplay content, vendor haul videos. Collect-A-Con anime guests drive niche but loyal audience. |
| **Autograph signings (retail)** | 4 (Dick's) | **High** | Dick's Sporting Goods + Rally House (when active) = sporting goods sponsor fit. Wristband FOMO drives urgency content. |
| **Book signings** | 8 | **Medium–High** | Rainy Day Books events = literary/lifestyle audience. Unity Temple cluster supports date-night + Plaza dining adjacency (Phase 2K revenue alignment). |
| **Sports fan roadshows** | 3 | **Medium** | Price Chopper × Sporting KC = grocery + soccer sponsors. Free events = high attendance, lower ticket affiliate. |
| **Card shows** | 4 | **Medium** | Collector/treasure-hunt audience overlaps Phase 2H estate sales. Local shop sponsor potential. |
| **Casino concerts** | 4 | **Medium** | Ameristar/Hollywood Casino entertainment sponsors. Not true meet-and-greets — weaker autograph content. |
| **Royals Rally** | 1 | **High** | $27–$152 tiered pricing; 20+ named players; guaranteed autograph — premium sports content. |

**Overall sponsor potential: High.** Conventions + retail autograph signings + Royals Rally form a strong monetization triangle. Rainy Day Books adds literary crossover. Dick's/Rally House/Hy-Vee retail appearances need news-RSS triggers since no stable calendars exist.

---

## Engagement Potential

| Signal | Assessment |
|---|---|
| **Celebrity density** | **Very High** — Collect-A-Con alone delivers 11 named guests; Royals Rally adds 20+ players; Rainy Day adds Sedaris, Schur, Christina Lauren cluster. |
| **Timeliness** | **High** — Most rows have real 2026 dates (Mar–Dec). Dick's templates are evergreen post-championship triggers. |
| **Shareability** | **Very High** — Autograph wristband lines, convention cosplay, and "which guest are you seeing?" polls are proven engagement formats. |
| **FOMO / urgency** | **Very High** — Dick's 200 wristband cap, Royals Rally timed sessions, Collect-A-Con guest photo ops. |
| **Charity separation** | **Clean** — Vertical explicitly excludes Phase 2L charity rows. Big Slick, Chiefs Foundation, Children's Mercy filtered out. |
| **False-positive risk** | **Low–Medium** — Do816 concerts tagged as appearances (not M&G). Sporting KC roadshows may lack named players. |

**Overall engagement potential: Very High.** This vertical fills the biggest content gap left after Phase 2L — non-charity celebrity access moments that drive "I was there" social proof.

---

## Content Balance Impact (Projected)

| Metric | Current (post-2L) | After 2M wiring |
|---|---|---|
| Total ingested rows | 410 | ~451 (+41) |
| Public appearance rows | 0 | ~41 |
| Convention/fan expo rows | 0 | ~9 |
| Autograph signing rows | 0 | ~12 |
| Non-charity sports appearance rows | 0 | ~7 |

Phase 2M would complement Phase 2L without overlap when charity-exclusion filters and URL suffix dedup are applied. Combined celebrity coverage: **charity galas (2L) + public access (2M) = complete KC celebrity calendar.**

---

## Top Remaining Gaps After Discovery

| Gap | Current State | Recommended Next Source |
|---|---|---|
| **Rally House KC live calendar** | 404 on `/events`; 0 KC rows | GlobeNewswire RSS filter `Rally House` + KC geo; Facebook event scrape per store |
| **Hy-Vee player appearances** | No live KC calendar | Per-store `calendar/detail.aspx?s={id}` scrape for 20 metro stores |
| **Dick's signing announcements** | Ad-hoc post-championship only | KMBC/KSHB/Chiefs.com RSS keyword filter (`Dick's Sporting Goods` + autograph) |
| **KC Current appearances** | 403 on events page | Instagram/Facebook event API; NWSL schedule cross-ref |
| **Chiefs non-charity appearances** | No public fan fest 2026 | chiefs.com/news RSS; Draft Fest STM-only excluded from public feed |
| **Hollywood Casino KC** | Do816 feed exists, not cataloged | do816.com/venues/hollywood-casino scrape |
| **GrabaSeat / Meet&Greet brokers** | grabagreatseat.com fetch failed | Retry with alternate URL; Ticketmaster VIP packages |
| **Celebrity chef demos** | 1 Rainy Day chef row | Sur La Table, Whole Foods, Hen House demo calendars |
| **Radio station appearances** | Ephemeral contests only | Audacy API or 96.5 The Fan / 98.9 The Rock contest RSS |
| **Planet Comicon guest roster** | TBD until show week | Leap Event API poll weekly pre-March 2026 |

---

## Recommended Implementation Plan (Future Phase — Not Executed)

When application code changes are permitted, wire **10 sources** following the Phase 2L isolated-vertical pattern:

| Provider file | Source type | Method |
|---|---|---|
| `planet-comicon-kc.ts` | `planet_comicon_kc` | HTML + Leap Event API |
| `collect-a-con-kc.ts` | `collect_a_con_kc` | Guest list scrape + convention row |
| `cardshows-kc.ts` | `cardshows_kc` | CardShows.io metro scrape |
| `rainy-day-appearances.ts` | `rainy_day_appearances` | `/events` HTML parse |
| `royals-rally.ts` | `royals_rally` | MLB.com scrape (annual template) |
| `sporting-kc-fan-events.ts` | `sporting_kc_fan_events` | News RSS + Price Chopper activations |
| `dicks-autograph-kc.ts` | `dicks_autograph_kc` | KC news RSS + 4-store directory |
| `do816-celebrity-kc.ts` | `do816_celebrity_kc` | Ameristar + Hollywood Casino venue feeds |
| `rally-house-appearances.ts` | `rally_house_appearances` | GlobeNewswire RSS (0 rows until KC events publish) |
| `hyvee-appearances-kc.ts` | `hyvee_appearances_kc` | Per-store calendar scrape |

Shared module: `public-appearance-shared.ts` — 7 categories, 3 flags, charity-exclusion filter (`CHARITY_SIGNAL_RE` inverse from Phase 2L).

Migration: `22_public_appearance_source_types.sql` (10 enum values).

Metadata keys: `planetComicon`, `collectACon`, `cardshowsKc`, `rainyDayAppearances`, `royalsRally`, `sportingKcFanEvents`, `dicksAutographKc`, `do816Celebrity`, `rallyHouseAppearances`, `hyveeAppearances`.

---

## What Changed

**Nothing.** Per requirements:

- No application code modified
- No scoring changes
- No ranking changes
- No UI changes
- No database migrations
- No live scan executed
- Ingested inventory unchanged at **410 rows**

This document is the sole deliverable for Phase 2M.

---

## Verification

| Check | Result |
|---|---|
| Application code modified | **No** (per requirement) |
| Live URL probes (12 sources) | 10 reachable, 2 blocked/404 |
| Projected discoverable rows | **41** |
| Charity overlap excluded | **Yes** |
| Phase 2L inventory unchanged | **410 rows** |
| Deliverable | `PHASE_2M_PUBLIC_APPEARANCES_RESULTS.md` |
