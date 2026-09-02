# Benson Watchlist Information Yield — 2026-09-02

## Executive summary

Watchlist now tells Kellie what changed across the accounts and sites she asked Benson to watch — not only dated events.

This pass did **not** redo Playwright, scheduling, Discover trust, pitches, or the dashboard shell. It completed the ten never-checked Instagram first checks sequentially against the shared session, broadened extraction only where live captions proved the event-only parser was missing useful information, and surfaced those findings on the existing Watchlist list/detail pages and Today’s Brief.

Production verification shows additional findings that did not exist as Watchlist intelligence before this pass, including Swift’s Fish Friday lunch special, Swift’s Labor Day food-truck week, stashhouse vendor spots, ozone’s Episode 3 reschedule, and Black Food Truck Fridays weather cancellations. First-check accounts that had produced nothing now have stored posts and findings.

The classifier is deterministic keyword matching, not a new model. It recovered real intelligence **and** over-accepted some caption fragments. Those misses are listed below. Discover was not auto-flooded. Video-growth lines in Today’s Brief remain first.

`@hookedonkc` appeared as a 43rd watcher during this window. This pass did **not** add it and did **not** first-check it.

## Before-and-after production counts

Inspected `source_watchers`, `curator_social_posts`, `curator_event_leads`, `early_signals`, scout items, and public Watchlist/Home pages — not status fields alone.

| Metric | Before this pass | After this pass (2026-09-02 ~05:50Z) |
|---|---:|---:|
| Watched sources | 42 | **43** (`@hookedonkc` appeared; not added here) |
| Instagram / web / RSS | 26 / 15 / 1 | 27 / 15 / 1 |
| Healthy | 31 | **41** |
| Ready / never checked | 10 Instagram | **1** (`@hookedonkc`) |
| Unsupported / stopped | 1 (Crossroads KC) | **1** (Crossroads KC) |
| Failed / blocked / challenged | 0 | **0** |
| Instagram first-checks completed this pass | 0 of 10 | **10 of 10**, sequential, no challenge |
| Curator Watchlist findings created in last 2 days | event-only leads | **86** signals (`event` 42, `curator_event_lead` 20, plus **24** non-event types) |
| Watchlist activity window (last 36h, API list) | buried in Early Signals | 16–31 recent findings visible on Watchlist + Brief |
| Discover auto-inserts from this pass | — | **0** |
| Migrations | — | **none** |

Yield classification of the 43 rows:

| Class | Count |
|---|---:|
| Productive | 23 |
| Healthy but currently quiet | 17 |
| Low yield | 1 (`@k1ngdula`) |
| Needs operator review | 1 (`@hookedonkc`) |
| Unsupported | 1 (Crossroads KC) |
| Degraded / blocked / duplicative (auto) | 0 |

## All 43 sources — health and yield

Items = stored `curator_social_posts`. Type columns = `early_signals` with `source_category=curator_watchlist` created in the last two days. Web/RSS rows with 0 curator posts are **not** combined into one “zero yield” number; see the zero-yield reason column.

| Source | Platform | Health | Yield class | Last successful check | Items | Events | Promo | Open/close | Menu | Schedule | Participate | Collab | Community | Other | Leads | Zero-yield reason / notes |
|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Missouri New Liquor Licenses (KC metro cities) | web | healthy | healthy_quiet | 2026-09-02 05:45 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Adapter table: `permit` Early Signals; none in last 36h |
| KCMO Business Licenses (liquor / beer / wine) | web | healthy | healthy_quiet | 2026-09-02 05:45 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Same civic adapter path |
| KCMO Commercial Permits (tenant finish / remodel) | web | healthy | healthy_quiet | 2026-09-02 05:45 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Same civic adapter path |
| Independence MO Planning Commission | web | healthy | healthy_quiet | 2026-09-02 05:45 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | HTTP page watch; no new planning row in window |
| Lee's Summit Legistar Calendar | web | healthy | healthy_quiet | 2026-09-02 05:45 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | HTTP page watch; nothing new |
| KCMO Legistar Calendar (planning + liquor board) | web | healthy | healthy_quiet | 2026-09-02 05:45 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | HTTP page watch; nothing new |
| linktr.ee | web | healthy | healthy_quiet | 2026-09-02 05:45 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Healthy fetch; low creator-facing yield |
| Overland Park Planning Commission | web | healthy | healthy_quiet | 2026-09-02 05:45 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | HTTP page watch; nothing new |
| Union Station KC Events | web | healthy | healthy_quiet | 2026-09-02 05:45 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | HTTP page watch; nothing new this window |
| Visit KC Events RSS | rss | healthy | healthy_quiet | 2026-09-02 05:45 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Adapter/scout table, not curator posts; last scout item still pending |
| Oak Park Mall Directory (Coming Soon) | web | healthy | healthy_quiet | 2026-09-02 05:45 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | HTTP page watch; nothing new |
| KC Chamber Events (ribbon cuttings) | web | healthy | healthy_quiet | 2026-09-02 05:45 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | HTTP page watch; nothing new |
| Lee's Summit Development Project List | web | healthy | healthy_quiet | 2026-09-02 05:45 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | HTTP page watch; nothing new |
| Johnson County Planning Commission | web | healthy | healthy_quiet | 2026-09-02 05:45 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | HTTP page watch; nothing new |
| Crossroads Arts District Events | web | healthy | healthy_quiet | 2026-09-02 05:45 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Replacement URL healthy; no new curator events |
| Crossroads KC | web | unsupported | unsupported | 2026-07-24 05:22 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Intentionally unsupported / stopped |
| @ozone_show | instagram | healthy | productive | 2026-09-02 05:38 | 12 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | First check; schedule change recovered |
| @stashhouse_kd | instagram | healthy | productive | 2026-09-02 05:35 | 12 | 5 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 5 | First check; events + vendor call |
| @rio.entertainment | instagram | healthy | productive | 2026-09-02 05:30 | 12 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | First check; opening_closing is noisy (see audit) |
| @hookedonkc | instagram | ready | needs_operator_review | — | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Source has not run (not authorized this pass) |
| @theblueroomkc | instagram | healthy | productive | 2026-09-02 05:26 | 12 | 1 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | First check; 2 real event leads + caption noise |
| @elevationgrille | instagram | healthy | productive | 2026-09-02 05:22 | 12 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | First check |
| @comeupseason816_ | instagram | healthy | productive | 2026-09-02 05:17 | 12 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | First check |
| @romeo_ryonell | instagram | healthy | healthy_quiet | 2026-09-02 05:13 | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | First check succeeded; nothing genuinely new |
| @vyelounge | instagram | healthy | productive | 2026-09-02 05:10 | 12 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | First check; menu/cocktail baseline |
| @hobotone | instagram | healthy | productive | 2026-09-02 05:06 | 12 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | First check |
| @goodiesparty_ | instagram | healthy | productive | 2026-09-02 05:03 | 12 | 3 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | First check; Block Party / Bobby Valentino |
| @royalmansion6240 | instagram | healthy | healthy_quiet | 2026-09-02 04:25 | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Checked; nothing genuinely new this window |
| @swiftscajuncuisine | instagram | healthy | productive | 2026-09-02 04:25 | 23 | 2 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 3 | Promotion + schedule recovered |
| @bizzybodyb007 | instagram | healthy | productive | 2026-09-02 04:24 | 31 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | Repeat Ghostface coverage (cross-source) |
| @boonetheater | instagram | healthy | productive | 2026-09-02 04:21 | 12 | 1 | 1* | 0 | 0 | 0 | 1* | 0 | 0 | 0 | 1 | *Ghostface tickets also classified promo + participation |
| @k1ngdula | instagram | healthy | low_yield | 2026-08-27 15:27 | 14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Posts stored; little concrete intelligence |
| @kcjukehouse | instagram | healthy | productive | 2026-08-27 15:27 | 21 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Prior events; due for next IG cycle |
| @theblakkco | instagram | healthy | productive | 2026-08-27 15:27 | 18 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Backfill produced an event finding |
| @marksmybarber | instagram | healthy | productive | 2026-08-27 11:27 | 37 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Prior yield |
| @jasfoodjourney | instagram | healthy | productive | 2026-08-27 11:26 | 40 | 119† | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | †Historical `curator_event_leads` count, not 2-day findings |
| @kclifestylegirl | instagram | healthy | productive | 2026-08-27 11:26 | 55 | 4 | 3 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Backfill; opening_closing on hotel reel is weak |
| @kcrednation | instagram | healthy | productive | 2026-08-27 07:24 | 15 | 11 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Happy-hour promotion recovered |
| @unlokced_ | instagram | healthy | productive | 2026-08-27 07:24 | 25 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Backfill event |
| @sherrislounge | instagram | healthy | productive | 2026-08-27 07:24 | 29 | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | Weekly schedule recovered |
| @livelovekansascity | instagram | healthy | productive | 2026-08-27 03:23 | 14 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Backfill event |
| @blackfoodtruckfridays | instagram | healthy | productive | 2026-08-27 03:23 | 14 | 1 | 1 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | Storm cancel recovered |
| @urbankansascity | instagram | healthy | productive | 2026-08-27 03:23 | 20 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Backfill event |

Zero-yield causes kept separate:

| Cause | Sources |
|---|---|
| Nothing genuinely new after a successful check | `@romeo_ryonell`, `@royalmansion6240`, several civic/page watches this window |
| Source has not run | `@hookedonkc` |
| Extraction missed useful content (before this pass; now recovered) | Swift lunch special; stashhouse vendor spots; ozone reschedule; BFTF cancel |
| Source content inaccessible / challenged | none |
| Mostly irrelevant / low creator-facing value | `linktr.ee`, `@k1ngdula` |
| Extracted but stuck before a useful surface (before this pass) | accepted leads lived only in Early Signals |
| Adapter records information in a different table | Visit KC RSS scout items; civic `permit` / planning adapters |
| Parser only recognized dated events (root cause of this pass) | Instagram caption path before taxonomy |
| Intentionally unsupported | Crossroads KC |

## Results for the ten first-check Instagram accounts

Operator procedure: `runWatcherNow` one account at a time, 45s pause, shared Instagram Playwright session, existing lock. Not concurrent. No login, challenge, or captcha.

Every account inspected **12** posts, **0** already known, **12** newly processed. Session: ready. Downstream: Watchlist activity + Early Signals (and Calendar eligibility / Brief when routed). Next check: last success + 12h.

| Account | Check | Inspected | Known | New posts | Pipeline `newItems` (qualified) | Batches | Extracted (accepted types) | Rejected / noise | Session | Next check | Destination |
|---|---|---:|---:|---:|---:|---|---|---|---|---|---|
| `@goodiesparty_` | succeeded | 12 | 0 | 12 | 1 | 12 posts / 1 session | event×3, promotion_sale×1, curator_event_lead×1 (Goodies Block Party, Bobby Valentino) | Throwback caption also tagged event | none | 2026-09-02 17:03Z | Calendar eligible + Watchlist + Early Signals; 1 `discover_review` recommendation |
| `@hobotone` | succeeded | 12 | 0 | 12 | 0 | 12 posts | event + opening_closing | opening_closing may be a premiere, not a venue open | none | 2026-09-02 17:06Z | Calendar + Early Signals |
| `@vyelounge` | succeeded | 12 | 0 | 12 | 0 | 12 posts | product_menu_launch×1 (`historical_baseline`) | cocktail caption is thin | none | 2026-09-02 17:10Z | Watchlist activity |
| `@romeo_ryonell` | succeeded | 12 | 0 | 12 | 0 | 12 posts | none | posts inspected; no concrete development persisted | none | 2026-09-02 17:13Z | Quiet successful check |
| `@comeupseason816_` | succeeded | 12 | 0 | 12 | 5 | 12 posts | event×2–3, curator_event_lead×3 (All White Party, CASA Labor Day) | — | none | 2026-09-02 17:17Z | Calendar + Early Signals |
| `@elevationgrille` | succeeded | 12 | 0 | 12 | 1 | 12 posts | event (BLISS Sat), promotion_sale, curator_event_lead | “What’s going on at Elevation!!!” is weak promo | none | 2026-09-02 17:22Z | Calendar + Watchlist + Early Signals |
| `@theblueroomkc` | succeeded | 12 | 0 | 12 | 12 | 12 posts | Ernest Melton Mon Night Jam (2026-09-05), Paganova (2026-09-03) | two caption fragments accepted as event/promo | none | 2026-09-02 17:26Z | Early Signals + Watchlist; event leads verified/partial |
| `@rio.entertainment` | succeeded | 12 | 0 | 12 | 1 | 12 posts | curator_event_lead GALAXY; opening_closing | opening_closing from “COME OUT AN MEET AN GREET” is incorrect | none | 2026-09-02 17:30Z | Early Signals |
| `@stashhouse_kd` | succeeded | 12 | 0 | 12 | 6 | 12 posts | 5–6 events + participation_call vendor spots + several leads | some promo/event doubles on the same caption | none | 2026-09-02 17:35Z | Calendar + Early Signals + Watchlist |
| `@ozone_show` | succeeded | 12 | 0 | 12 | 0 | 12 posts | schedule_change Episode 3 rescheduled to 8/23/26 (`historical_baseline`) | date already passed; still surfaced on Brief | none | 2026-09-02 17:38Z | Watchlist activity + Today’s Brief |

Stopped: no. Instagram challenge: no.

## Concrete missed-information examples found during audit

These existed on the source and were missed by event-only extraction **before** this pass. After backfill + first-check they are stored with URLs.

| Source | Evidence URL | What was on the source | Before | After |
|---|---|---|---|---|
| `@swiftscajuncuisine` | https://www.instagram.com/p/DclohnJOqvP/ | Fish Friday lunch special, 11am–3pm, restaurant only, 3415 Main | Not extracted (no dated public event) | `promotion_sale` → Watchlist activity |
| `@swiftscajuncuisine` | https://www.instagram.com/p/DcwWRQkKGwa/ | Food truck all week Sept 1–Labor Day Sept 7, metro locations | Stops sometimes misnamed as events | `schedule_change` + event; Brief-eligible |
| `@stashhouse_kd` | https://www.instagram.com/p/DchLiKEuvRU/ | Labor Day weekend, 2 concerts, **vendor spots available** | Event extracted; vendor call missed | `participation_call` + event |
| `@ozone_show` | https://www.instagram.com/p/DcJAvSOxAE6/ | Episode 3 (Tha Town) **RESCHEDULED** to 8/23/26 | Never checked | `schedule_change` (historical; date already passed) |
| `@blackfoodtruckfridays` | https://www.instagram.com/p/DcmlfSAT3Uh/ and https://www.instagram.com/p/DcRzszpT_Ez/ | Storm cancellation / no event tomorrow | Not a dated new event | `schedule_change` (+ promo on one post) |
| `@kcrednation` | https://www.instagram.com/p/DcTiCunR9KP/ | 1st Fridays Happy Hour, $7 drinks till 7 | Buried / event-only | `promotion_sale` |
| `@goodiesparty_` | https://www.instagram.com/p/Db_OAnBO2_F/ | Goodies Block Party / tickets | Never checked | event + curator_event_lead |
| `@theblueroomkc` | https://www.instagram.com/p/Dcwr0RuDpXY/ | Monday Night Jam / Paganova dates | Never checked | two curator event leads |
| Civic liquor / permits | `data.mo.gov` / `data.kcmo.org` adapters | New licenses and permits | Lived only in Early Signals | Activity will list last-36h `permit`/`opening`/`closing`/`planning`; **none present in this 36h window** |
| Visit KC RSS | https://www.visitkc.com/events/art-gallery-closing-reception/ | Scout item “Art Gallery Closing Reception” (pending since 2026-08-21) | Healthy RSS, 0 curator posts | Still adapter/scout table — not a curator event |

## Root causes of missed information

1. **Event-centric parser.** Instagram captions went through `parseRoundupSlideText` into `curator_event_leads`. Lunch specials, vendor applications, reschedules, and cancellations without a clean event date were dropped.
2. **First-check backlog.** Ten Instagram rows were Ready with zero `lastSuccessfulCheck`. The scheduler cap (3 due IG sources per ~4h) would have taken multiple cycles. This pass ran them sequentially instead of waiting.
3. **Downstream burial.** Accepted curator leads promoted to Early Signals (`curator_event_lead`) and did not appear as “what changed” on Watchlist or Today’s Brief.
4. **Split tables.** Web/RSS adapters write scout items and civic Early Signals. Watchlist detail “Posts processed / Events extracted” counts curator tables, so a healthy Visit KC or liquor-license check looked like zero yield.
5. **No posting-batch intelligence types.** Multiple posts in one session were inspected for events only.

## Extraction taxonomy implemented

Existing project types reused where they already existed (`event`, civic `permit`/`opening`/`closing`/`planning`, `curator_event_lead`). New Watchlist types, only after the live audit:

- `event`
- `opening_closing`
- `schedule_change`
- `promotion_sale`
- `product_menu_launch`
- `participation_call`
- `collaboration`
- `community_news`
- `venue_business_update`
- `other_verified_update`

Required fields on every finding: canonical source identity, originating post/page URL, watched source, retrieved timestamp, publication timestamp **only when verified** (never fabricated), concise summary, type, evidence, confidence/verification, freshness/actionable flag, downstream route, rejection reason when not accepted.

Rejections: `page_chrome`, `engagement_bait`, `inspirational`, `recycled_promo`, `no_concrete_development`, `expired`, `duplicate`, `unsupported_inference`, `missing_evidence`.

No pitch generation.

## Posting-batch behavior

- Instagram checks still walk every new post in the inspected window (12 on first check; Boone repeat = 12 already known, 0 new).
- Findings are not limited to the newest post. Boone’s Ghostface tickets post and older World Cup / film-festival posts were all classified.
- Carousels remain one post unless independently actionable (unchanged).
- `collapseWatchlistFindings` / `findingCanonicalKey` collapse the same announcement on the same watched source.
- Separate announcements in one batch stay separate (Ghostface tickets vs a vendor call).
- First-ever check sets `firstCheckBaseline`. Stale inspirational posts are rejected. Currently actionable items stay `baselineKind: new`. Historical-but-stored items (ozone reschedule, vye cocktail) are labeled `historical_baseline`.

## Historical-baseline behavior

First-check posts are not reported as “happening today” unless currently actionable. Ozone’s already-passed 8/23 reschedule was labeled historical_baseline **but** still appeared as “New from @ozone_show” on Today’s Brief because Brief takes the latest accepted finding. That is a remaining limitation.

Boone’s July M&Ms chrome (`https://www.instagram.com/p/DabJY45K_PI/`) is correctly rejected in tests as not a concrete development.

## Deduplication behavior

- Same canonical key + `contentHash` `watchlist-finding:` suppresses repeats.
- Boone repeat check: 12 already processed · 0 new. No second Ghostface lead.
- Cross-source keys **include watched source**, so Boone / `@tarantino1440` / `@bizzybodyb007` can each keep Ghostface. That is intentional attribution, not a merge. Recommend operator awareness, not auto-delete.

## Downstream routing

Deterministic `routeWatchlistFinding`:

| Finding | Route |
|---|---|
| Upcoming dated public event (non-low confidence) | `calendar_eligible` (existing Calendar eligibility + Discover trust still apply; **no auto-flood**) |
| High-confidence event / participation / opening | `discover_review` recommendation only |
| Weaker event / participation / opening | `early_signals` |
| Schedule change / community news | `todays_brief` |
| Other medium-confidence updates | `watchlist_activity` |
| Low confidence | `early_signals` |
| Historical non-actionable event | `suppressed` |
| Duplicate / stale | suppressed with hash reason |
| Pure promotional noise | rejected at classify |

Last-2-day stored routes:

| Route | Count |
|---:|---:|
| `calendar_eligible` | 26 |
| `early_signals` | 20 |
| unknown / curator lead without watchlist route | 20 |
| `watchlist_activity` | 15 |
| `todays_brief` | 4 |
| `discover_review` | 1 (`@goodiesparty_` Throwback/Block Party) |
| Discover cards auto-created | **0** |

Watchlist list “What changed” answers: sources checked, most important new finding, awaiting review, nothing-new list, still-first-check (`@hookedonkc`). Detail “What Benson found” lists per-source findings with type + route. Existing activity/history surfaces were extended; no new dashboard.

## Today’s Brief behavior

`buildHomeShowroom({ watchlistBriefLines })` appends after video-growth `changes`, then slices to 5.

Public Home (`https://benson.kckellie.com/home`) at verification:

1. “Everything costs more…” +2 views (273)
2. “I’m searching Kansas City…” +45 views (817)
3. “United Market KC…” +133 views (1,517)
4. Watchlist checked 29 sources.
5. New from `@ozone_show`: Episode 3 rescheduled…

Follower line (“+2 followers, 6,658”) remains on the card. TikTok per-video deltas were not replaced.

## Source comparison sample

### Boone Theater (`@boonetheater`)

- **Correctly accepted:** Ghostface Killah Official After Party, 2026-09-02, Boone Theater — `https://www.instagram.com/p/DcpBspFAGLL/` and curator lead. Tickets-on-sale also stored.
- **Correctly rejected:** July M&Ms chrome (test + first-check baseline). Repeat check 0 new.
- **Incorrectly accepted:** “FREE ADVICE The FIFA World Cup is over.” `https://www.instagram.com/p/Da4Vtd8llkF/` as `event`.
- **Incorrectly classified:** same Ghostface tickets post also `participation_call` + `promotion_sale`.
- **Duplicated:** none on repeat check. Cross-source Ghostface remains on `@tarantino1440` / `@bizzybodyb007`.
- **Extracted but failed to surface (before):** Ghostface lived in Early Signals only; now on Watchlist detail.

### The Blue Room (`@theblueroomkc`)

- **Correctly accepted:** Ernest Melton Monday Night Jam 2026-09-05; Paganova 2026-09-03 from `https://www.instagram.com/p/Dcwr0RuDpXY/`.
- **Incorrectly accepted / classified:** “Some bands you meet at happy hour…” `https://www.instagram.com/p/DcWLzktD1sN/` as event + promotion; “Some debuts you don't forget.” `https://www.instagram.com/p/DcoNX6xjR0k/` as promotion.

### Restaurant / food — Swift’s (`@swiftscajuncuisine`)

- **Correctly accepted:** Fish Friday `https://www.instagram.com/p/DclohnJOqvP/` promotion; truck week `https://www.instagram.com/p/DcwWRQkKGwa/` schedule/event.
- **Incorrectly classified (pre-existing parser):** food-truck stops can still appear as named events (`Strangers Rest Baptist Church` lead).

### Entertainment / nightlife — stashhouse / comeup / elevation

- **Correctly accepted:** Haunted Mansion, Baddies & Bosses, Labor Day amphitheater posts; vendor spots `https://www.instagram.com/p/DchLiKEuvRU/`; All White Party `https://www.instagram.com/p/DcBoEb_NQ4M/`; BLISS at Elevation `https://www.instagram.com/p/DcuYZiKAo3c/`.
- **Incorrectly classified:** rio `https://www.instagram.com/p/DbcGQcKu9md/` as `opening_closing`.

### Community — Black Food Truck Fridays / Visit KC / civic

- **Correctly accepted:** BFTF storm cancel URLs above.
- **Visit KC RSS:** healthy `rss_feed` check; scout item Art Gallery Closing Reception still pending; 0 curator posts. Zero yield = different table + nothing new this run, not “source failed.”
- **Municipal:** Missouri New Liquor + KCMO liquor/beer/wine healthy at 05:45Z. No `permit` rows in last 36h. Zero yield = adapter quiet, not inaccessible.

### General website — linktr.ee / Union Station / Oak Park Mall

Healthy HTTP watches, 0 curator posts, nothing new this window. Low creator-facing value on linktr.ee.

## Source removal / replacement recommendations

Do **not** auto-delete or disable.

| Candidate | Recommendation | Evidence |
|---|---|---|
| Crossroads KC | Keep stopped | Already unsupported |
| `linktr.ee` | Consider replace with a specific venue/link-in-bio that changes | Healthy fetch, no creator-facing findings |
| `@k1ngdula` | Review / replace | 14 posts, 0 findings, last check 2026-08-27 |
| `@hookedonkc` | Operator decide whether to keep and first-check | Unrequested Ready source |
| Civic permit feeds | Keep | Productive as Early Signals when rows appear; do not expect Watchlist event counts |
| Ghostface trio (Boone / tarantino1440 / bizzybody) | Keep all; do not merge automatically | Same announcement, different watched sources |

## Files and migrations changed

No migrations.

| File | Change |
|---|---|
| `services/core/src/curator-watchlist/watchlist-intelligence.ts` | Taxonomy, classify, collapse, route, Brief lines, yield class |
| `services/core/src/curator-watchlist/watchlist-intelligence.test.ts` | Required regression coverage |
| `services/core/src/curator-watchlist/watchlist-activity.ts` | Persist findings, activity, per-source findings, backfill helper |
| `services/core/src/curator-watchlist/pipeline.ts` | Classify caption/OCR after event parse; first-check baseline |
| `services/core/src/curator-watchlist/index.ts` | Exports |
| `services/core/src/pre-alpha/home-showroom.ts` | Append Watchlist Brief lines after video-growth |
| `services/core/src/pre-alpha/home.ts` | Soft-timeout load of Watchlist activity for Brief |
| `services/core/src/pre-alpha/home-showroom.test.ts` | Coexistence test |
| `services/api/src/routes/watchlist.ts` | `GET /` returns `{ items, activity }`; detail includes `findings` |
| `dashboard/app/watchlist/watchlist-panel.tsx` | “What changed” card |
| `dashboard/app/watchlist/[id]/watchlist-detail-panel.tsx` | “What Benson found” |
| `scripts/benson-deploy-local.sh` | Includes `watchlist-intelligence.test.ts` |
| `docs/ops/screenshots/watchlist-information-yield-2026-09-02-*.png` | Public mobile/desktop evidence |

## Tests and exact results

Required cases covered in `watchlist-intelligence.test.ts` + Home coexistence:

- Multiple information types from one account (Swift lunch + truck week)
- Posting batches with separate announcements
- Repeated posts about one announcement → `duplicate`
- Historical first-check baseline
- Currently actionable information during baseline
- Opening/closing, schedule-change, promotion expiration, product/menu, participation call, community update
- Source provenance; missing publication date not fabricated
- Unsupported inference rejected
- Cross-source duplicate keys differ by watched source
- Routing toward Calendar / Discover review / Early Signals
- Successful quiet check stays `healthy_quiet`
- Today’s Brief coexistence with video-growth
- Source yield classification

**Focused Watchlist + routing + Discover trust + Calendar eligibility + Playwright runtime (prior deploy run):** `# tests 104` `# pass 104` `# fail 0` then `FOCUSED_TESTS_OK`.

**Re-run this verification (includes Home showroom):** `# tests 121` `# pass 120` `# fail 1`.

The single failure is **pre-existing and date-sensitive**, not loosened:

- `ordinary concert can qualify for Things To Do Weekly but not Film This/Home` in `home-showroom.test.ts` (`content-lane separation`).

New test `Watchlist brief lines sit beside video-growth copy instead of replacing it`: **pass**.

**Dashboard `tsc --noEmit`:** exit 0.

**Core `tsc --noEmit`:** pre-existing errors in unrelated scripts (`correct-false-positive-partnership-activity.ts`, `final-stabilization-verify.ts`, etc.). No new errors in Watchlist files.

**Production dashboard build:** completed; `/watchlist` 2.13 kB, `/watchlist/[id]` 5.43 kB; `dash:200` `watchlist:200`.

**Deploy precheck / fingerprints:** see below. Playwright provisioning was not redone.

Existing public-event, Discover trust, and Watchlist state tests were not loosened.

## Deployment verification

Live checks this pass:

- Instagram (10 first-checks + Boone/Swift already healthy)
- RSS (Visit KC, healthy, 05:45Z)
- Web civic/pages (liquor, permits, planning, Union Station, linktr.ee, Crossroads Arts) healthy 05:45Z
- Unsupported Crossroads KC unchanged

Public API `GET https://api.kckellie.com/api/watchlist` returns `{ ok, items, activity }` with `briefLines`, `findings`, `nothingNew`, `readySources`.

## Public mobile and desktop screenshots

| Surface | File |
|---|---|
| Watchlist list + What changed (390×844) | `docs/ops/screenshots/watchlist-information-yield-2026-09-02-list-mobile.png` |
| Home / Today’s Brief + video-growth (desktop) | `docs/ops/screenshots/watchlist-information-yield-2026-09-02-home-desktop.png` |
| Boone detail + What Benson found (desktop) | `docs/ops/screenshots/watchlist-information-yield-2026-09-02-boone-desktop.png` |
| Blue Room first-check detail (desktop) | `docs/ops/screenshots/watchlist-information-yield-2026-09-02-blueroom-desktop.png` |
| Visit KC RSS honest empty curator yield (desktop) | `docs/ops/screenshots/watchlist-information-yield-2026-09-02-visitkc-desktop.png` |

Verified at `https://benson.kckellie.com/watchlist`, `/watchlist/{boone,blueroom,visitkc}`, `/home`.

## Fingerprints

Runtime fingerprint (source = API = dashboard = worker) after this pass’s deploy and operator-script cleanup:

```
status: MATCH
source/api/dashboard/worker: 53a188ccc850ddf2
apiStartedAt: 2026-09-02T05:57:43.959Z
dashboardBuiltAt: 2026-09-02T05:44:55Z
workerStartedAt: 2026-09-02T05:57:45.496Z
```

Earlier in-pass runtime identity while temp audit scripts were still on disk was `2b2faa7b3bc1ef46`. Removing those scripts changed the source hash; fingerprints were rewritten to match. Running API/worker/dashboard code did not change.

Implementation commit at start of this pass: `5522a576dcd5b500f2d2ab4aed3da76de1683174` (Playwright repair). HEAD before this commit: `f8f3a9d72c532637d1b98a2c973f8f55bec192f4`.

This report’s commit hash is filled after commit.

## Remaining limitations and blocked sources

- Keyword classifier still over-accepts caption fragments (Blue Room happy-hour copy, Boone FIFA advice, rio “COME OUT” as opening).
- Titles often use the first caption sentence; they are not rewritten by an LLM.
- Historical baseline items can still appear as “New from …” on Today’s Brief.
- One caption can emit event + promotion + participation.
- Cross-source duplicates are attributed, not merged.
- Civic permits did not appear in the last 36h, so Watchlist activity did not show them even though the adapter path is wired.
- Visit KC scout items are not curator findings.
- `@hookedonkc` is Ready and unchecked.
- Crossroads KC remains unsupported.
- No Instagram challenge occurred; the shared session is still the single point of failure for IG.
- Classifier does not invent dates; some “this Saturday” events lack a stored `eventDate` and route to Early Signals instead of Calendar.

## Commit hash and branch

- Branch: `release/scout-expansion-2026-07-25`
- Implementation commit: `421f5d132424c28d56feff6edeb7f3a7a6242d03`
- Clean-tree / remote-match: recorded in the follow-up docs commit after push
