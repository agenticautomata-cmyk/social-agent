# Phase 2L — Celebrity + Charity Events Results

**Date:** 2026-05-31  
**Status:** Complete — live opportunities ingested from ten new audience-alignment sources  
**Scope:** Kansas City celebrity appearances, charity galas, fundraisers, benefit concerts, sports celebrity events, and public appearances only  
**Out of scope (as requested):** Existing provider changes, scoring, ranking, UI logic

---

## Summary

Phase 2L adds a **Celebrity + Charity Events** vertical to surface high-engagement KC content: Big Slick, Children's Mercy fundraisers, Chiefs/Royals/Sporting KC/KC Current charity events, Kauffman benefit galas, Visit KC charity posts, nonprofit gala calendars, and local entertainment charity listings.

Ten new sources:

1. **Big Slick KC** (`big_slick_kc`) — official site scrape + curated Big Slick weekend entries
2. **Children's Mercy Events** (`childrens_mercy_events`) — curated Children's Mercy fundraiser directory
3. **Chiefs Charity Events** (`chiefs_charity_events`) — curated Chiefs Foundation community events
4. **Royals Charity Events** (`royals_charity_events`) — curated Royals Charities events
5. **Sporting KC Charity Events** (`sporting_kc_charity`) — curated Sporting KC Foundation events
6. **KC Current Charity Events** (`kc_current_charity`) — curated KC Current community charity events
7. **Kauffman Charity Galas** (`kauffman_charity_galas`) — Kauffman API charity filter + fallback galas
8. **Visit KC Charity Events** (`visitkc_charity_events`) — Visit KC RSS charity/celebrity keyword filter
9. **KC Nonprofit Galas** (`kc_nonprofit_galas`) — curated metro nonprofit gala calendar
10. **KC Entertainment Charity Events** (`kc_entertainment_charity`) — curated directory + Pitch RSS filter

**25 net-new rows** ingested (33 provider candidates; 8 skipped via URL dedup against existing Kauffman/Visit KC/sports rows). Total inventory: **385 → 410 rows** (+25).

All rows carry `celebrityFlag`, `charityFlag`, `fundraiserFlag`, `galaFlag` (where applicable) and `opportunityCategory`.

**Second full scan: 0 duplicates created** — dedup verified.

---

## Rows Created by Category

| Category | Count | Primary Source(s) |
|---|---|---|
| `sports_celebrity_event` | 9 | Visit KC Charity (5), Chiefs (2), KC Current (1), Royals (1) |
| `gala` | 7 | KC Nonprofit Galas (5), Sporting KC (1), Kauffman fallback (1) |
| `charity_event` | 4 | KC Entertainment Charity (4) |
| `fundraiser` | 3 | Children's Mercy (2), Big Slick (1) |
| `celebrity_event` | 1 | Big Slick KC (1) |
| `benefit_concert` | 1 | Kauffman fallback (1) |
| `public_appearance` | 0 | — |
| **Total** | **25** | |

### By source (first scan)

| Source | Found | Created | Skipped |
|---|---|---|---|
| Visit KC Charity Events | 5 | 5 | 0 |
| KC Nonprofit Galas | 5 | 5 | 0 |
| KC Entertainment Charity Events | 4 | 4 | 0 |
| Big Slick KC | 2 | 2 | 0 |
| Children's Mercy Events | 3 | 2 | 1 |
| Chiefs Charity Events | 3 | 2 | 1 |
| Kauffman Charity Galas | 2 | 2 | 0 |
| Sporting KC Charity Events | 3 | 1 | 2 |
| Royals Charity Events | 3 | 1 | 2 |
| KC Current Charity Events | 3 | 1 | 2 |
| **Total** | **33** | **25** | **8** |

Eight skips are URL-level dedup collisions with pre-existing Kauffman, Visit KC, or sports-community rows (same canonical URL, different source type).

---

## Field Coverage (25 rows)

| Field | Populated | Rate |
|---|---|---|
| title | 25 | 100% |
| category | 25 | 100% |
| sourceUrl | 25 | 100% |
| eventDate | 25 | 100% |
| ticketUrl | 25 | 100% |
| nonprofit | 19 | 76% |
| venue | 19 | 76% |
| address | 19 | 76% |
| celebrityNames | 7 | 28% |

| Flag | Set | Rate |
|---|---|---|
| charityFlag | 25 | 100% |
| fundraiserFlag | 15 | 60% |
| galaFlag | 7 | 28% |
| celebrityFlag | 11 | 44% |

Nonprofit/venue/address gaps reflect Visit KC RSS articles (editorial, no structured beneficiary) and sports community events tagged as charity partnerships without named venues. Celebrity name coverage is low because most curated sports/nonprofit rows list foundations rather than individual celebrity hosts.

---

## Celebrity Names Detected

**11 verified KC celebrities** extracted across 7 rows:

| Name | Context |
|---|---|
| Paul Rudd | Big Slick KC |
| Jason Sudeikis | Big Slick KC |
| Eric Stonestreet | Big Slick KC |
| Rob Riggle | Big Slick KC |
| David Koechner | Big Slick KC |
| Patrick Mahomes | Chiefs Charity Events |
| Travis Kelce | Chiefs Charity Events |
| Andy Reid | Chiefs Charity Events |
| Bobby Witt Jr. | Royals Charity Events |
| Salvador Perez | Royals Charity Events |
| George Brett | Royals Charity Events |

**4 false-positive extractions** from RSS title parsing (should be filtered in a future pass):

- `hosted by Kansas City` — Big Slick page copy
- `with Alisa Weilerstein` — Kauffman concert title
- `with Cast` — entertainment RSS fragment
- `with The Kansas City` / `with The Pitch` — RSS byline fragments

---

## Nonprofit / Beneficiary Detected

**14 unique beneficiaries** across 19 rows:

| Nonprofit | Rows |
|---|---|
| Children's Mercy Kansas City | 2 |
| Kansas City Chiefs Foundation | 2 |
| Sporting KC Foundation | 1 |
| KC Current Community | 1 |
| Kansas City Royals Charities | 1 |
| Kauffman Center for the Performing Arts | 2 |
| Kansas City Symphony | 1 |
| Kansas City Ballet | 1 |
| United Way of Greater Kansas City | 1 |
| American Red Cross Greater Kansas City | 1 |
| H&R Block Foundation | 1 |
| Union Station Kansas City | 1 |
| Crossroads Community Association | 1 |
| Power & Light District Foundation | 1 |

6 rows (primarily Visit KC RSS) have no structured nonprofit — editorial sports/tourism articles matched charity keywords without a named beneficiary.

---

## Source Quality

| Source | Quality | Notes |
|---|---|---|
| **Big Slick KC** | ★★★★★ **High** | Live scrape of bigslickkc.org succeeds (200 OK). Extracts Paul Rudd, Jason Sudeikis, Eric Stonestreet, Rob Riggle, David Koechner. Two evergreen rows (weekend + charity poker). Highest celebrity signal in the vertical. |
| **KC Nonprofit Galas** | ★★★★☆ **High** | Stable curated directory of 5 named metro galas (United Way, Ballet, Symphony, Red Cross, H&R Block). Full venue, address, ticket URLs. Evergreen inventory. |
| **KC Entertainment Charity Events** | ★★★★☆ **High** | Curated directory (4 rows) + Pitch RSS filter. Crossroads/Union Station benefit events with nonprofit and venue metadata. |
| **Children's Mercy Events** | ★★★☆☆ **Medium** | Curated directory (3 candidates). Live `/about/events/` page returns 404 — directory-only until CMS feed available. 1 URL dedup skip. |
| **Chiefs Charity Events** | ★★★☆☆ **Medium** | Curated Red Friday / Foundation events with Mahomes/Kelce/Reid names. 1 dedup skip. No live community calendar scrape yet. |
| **Royals Charity Events** | ★★★☆☆ **Medium** | Curated Royals Charities events (Witt, Perez, Brett). 2 dedup skips against existing sports rows. |
| **Sporting KC Charity Events** | ★★★☆☆ **Medium** | Curated Foundation Gala + community events. 2 dedup skips. |
| **KC Current Charity Events** | ★★★☆☆ **Medium** | Curated Pride Night + community partnership events. 2 dedup skips. |
| **Kauffman Charity Galas** | ★★☆☆☆ **Low–Medium** | Kauffman API returned **0 charity-filtered events** in live scan; provider falls back to 2 curated gala/benefit entries. Symphony concert row ingested via API filter is weak charity signal. |
| **Visit KC Charity Events** | ★★☆☆☆ **Low** | RSS keyword filter matched 5 articles; several are sports tourism (WNBA exhibition) not true charity galas. `#charity-event` URL suffix prevents base-URL dedup but content precision is noisy. |

### Architecture notes

- Shared module `celebrity-charity-shared.ts` centralizes 7 categories, 4 flags, celebrity/nonprofit extraction, RSS normalization, and charity directory loader.
- Scanner uses `insertCelebrityCharityEvent` with URL + externalId dedup (same pattern as prior phases).
- Migration `21_celebrity_charity_source_types.sql` adds 10 source type enum values.
- Metadata keys: `bigSlickKc`, `childrensMercyEvents`, `chiefsCharityEvents`, `royalsCharityEvents`, `sportingKcCharity`, `kcCurrentCharity`, `kauffmanCharityGalas`, `visitkcCharityEvents`, `kcNonprofitGalas`, `kcEntertainmentCharity`.

---

## Estimated Sponsor Potential

| Category | Rows | Sponsor Potential | Rationale |
|---|---|---|---|
| **Celebrity events (Big Slick)** | 2 | **Very High** | Paul Rudd/Jason Sudeikis anchor — national celebrity draw, Children's Mercy tie-in. Ideal for lifestyle/philanthropy sponsors, ticket affiliate, red-carpet content. |
| **Sports celebrity charity** | 9 | **High** | Chiefs/Royals/Sporting KC/KC Current foundation events. Strong local sports audience; Mahomes/Kelce names unlock engagement. Sponsor as team merch, sports bars, tailgate brands. |
| **Nonprofit galas** | 7 | **High** | Named institutions (Ballet, Symphony, United Way, Red Cross). Black-tie audience = luxury sponsor fit (jewelry, formalwear, fine dining, hotels). |
| **Fundraisers** | 3 | **Medium–High** | Children's Mercy + Big Slick poker. Donation/ticket CTAs present on all rows. |
| **Benefit concerts** | 1 | **Medium** | Kauffman Helzberg Hall series. Arts patron audience; ticket URL available. |
| **Public appearances** | 0 | **N/A** | No meet-and-greet rows ingested yet. |

**Overall sponsor potential: High.** The vertical combines two strong monetization clusters: **national celebrity anchors** (Big Slick) and **named institutional galas** (Ballet, Symphony, United Way). Sports foundation events add recurring local engagement. Visit KC RSS noise is the main quality drag.

---

## Engagement Potential

| Signal | Assessment |
|---|---|
| **Celebrity hook density** | **High** — Big Slick row alone carries 5 A-list names; Chiefs rows add Mahomes/Kelce/Reid. 44% of rows carry `celebrityFlag`. |
| **Timeliness** | **Medium** — Most curated directory rows use `startDate = now` (evergreen). Big Slick eventDate set to June 6 annually. Visit KC RSS rows have real publish dates. Same timeliness inflation noted in RANKING_AUDIT_REPORT for directory sources. |
| **Shareability** | **Very High** — Celebrity + charity is top-tier social content (red carpet, athlete philanthropy, gala fashion). Big Slick and Chiefs clusters are strongest. |
| **Comment bait** | **High** — "Which celebrity are you most excited to see?" / "Are you going to Red Friday?" / sports charity debates drive comments. |
| **Local pride angle** | **Very High** — KC-native celebrities (Rudd, Sudeikis, Stonestreet) + hometown heroes (Mahomes, Kelce, Witt) = strong identity content. |
| **False-positive risk** | **Medium** — Visit KC WNBA article and Kauffman symphony row tagged as charity without true gala/celebrity context. May rank oddly until scoring differentiates directory vs. RSS noise. |

**Overall engagement potential: High.** This vertical directly targets Kellie's highest-engagement content archetype: local celebrity + cause. Big Slick weekend alone could anchor multiple content pieces (poker tournament, red carpet, celebrity softball, auction).

---

## Content Balance Impact

| Metric | Before 2L | After 2L |
|---|---|---|
| Total ingested rows | 385 | 410 |
| Celebrity/charity rows | 0 | 25 |
| Rows with celebrity names | 0 | 7 |
| Rows with named nonprofit | 0 | 19 |
| Gala category rows | 0 | 7 |

Phase 2L opens a previously empty **Celebrity + Philanthropy** bucket without modifying existing sources, scoring, or ranking. Combined with Phase 2E (Sporting KC, 29 rows) and Phase 2D (Kauffman, 50 rows), Kellie now has overlapping but distinct sports-entertainment and charity-gala inventory.

---

## Top Remaining Gaps After Ingestion

| Gap | Current State | Recommended Next Source |
|---|---|---|
| **Public meet-and-greets** | 0 `public_appearance` rows | Celebrity booking agency calendars; venue VIP packages; GrabaSeat announcements |
| **Live Children's Mercy calendar** | Directory-only (404 on events page) | CMS/API scrape when events URL restored; Facebook event feed |
| **Kauffman charity API signal** | 0 API matches; 2 fallbacks | HTML gala page scrape; donor society event listings |
| **Visit KC precision** | 5 rows, ~2 weak matches | Tighter filter excluding sports tourism; require nonprofit keyword in body |
| **Celebrity name extraction** | 4 false positives | Blocklist "hosted by", "with Cast", "with The"; require known-celebrity list match |
| **Red carpet / black-tie coverage** | 7 gala rows, no live red carpet feed | Local society pages (Independent, Pitch "Seen" column) |
| **Benefit concert volume** | 1 row | Uptown Theater, Midland, Starlight benefit show calendars |
| **Player-specific charity events** | Generic foundation rows | Individual player foundation Instagram/RSS (15 and the Mahomies, etc.) |
| **Ticket date freshness** | Directory rows use `now` as startDate | Wire real event dates from ICS/calendar feeds when available |

---

## What Changed

### New shared module: `celebrity-charity-shared.ts`

- Seven categories: `celebrity_event`, `charity_event`, `fundraiser`, `benefit_concert`, `gala`, `sports_celebrity_event`, `public_appearance`
- Four flags: `celebrityFlag`, `charityFlag`, `fundraiserFlag`, `galaFlag`
- Capture fields: title, celebrityNames, nonprofit, venue, address, eventDate, ticketUrl, sourceUrl, category
- KC celebrity list, charity/gala signal regex, RSS normalization, curated directory loader

### New providers

| Provider | Method |
|---|---|
| `big-slick-kc.ts` | Live HTML scrape of bigslickkc.org + curated poker tournament |
| `childrens-mercy-events.ts` | Curated Children's Mercy fundraiser directory |
| `chiefs-charity-events.ts` | Curated Chiefs Foundation / Red Friday events |
| `royals-charity-events.ts` | Curated Royals Charities events |
| `sporting-kc-charity.ts` | Curated Sporting KC Foundation events |
| `kc-current-charity.ts` | Curated KC Current community charity events |
| `kauffman-charity-galas.ts` | Kauffman API + charity keyword filter + 2 fallback galas |
| `visitkc-charity-events.ts` | Visit KC RSS + charity/celebrity keyword filter |
| `kc-nonprofit-galas.ts` | Curated metro nonprofit gala calendar |
| `kc-entertainment-charity.ts` | Curated directory + Pitch RSS charity filter |

### Scanner / DB / seed

- `insertCelebrityCharityEvent` + `buildCelebrityCharityMetadata` in `scanner/index.ts`
- Ten scan handlers wired into `scanSourceByType` and `scanAllActiveSources`
- Migration `21_celebrity_charity_source_types.sql` (applied)
- Ten seed blocks in `seed.ts`
- `migrate:celebrity-charity` script in `package.json`

### Not modified (per requirements)

- Existing providers
- Scoring logic
- Ranking logic
- Dashboard / UI

---

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass |
| Migration 21 applied | Pass |
| Seed (10 sources) | Pass |
| First live scan | 25 created / 33 found |
| Second live scan (dedup) | 0 created |
| Total ingested inventory | 410 rows |

Diagnostic query script: `services/core/src/scripts/query-celebrity-charity.ts`
