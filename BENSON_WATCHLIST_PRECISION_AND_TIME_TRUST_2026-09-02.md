# Benson Watchlist Precision and Time Trust — 2026-09-02

## Executive summary

This pass repaired the Watchlist information taxonomy that shipped earlier today. It did **not** add sources, redesign the dashboard, generate pitches, or create Discover cards.

The yield pass increased information. This pass makes findings fewer, cleaner, temporally correct, and safe to surface.

What changed in production:

- Known false positives are skipped with an auditable reason. Rows were **not** deleted.
- One caption now prefers a single primary type. Ticket-on-sale is an event, not a promotion or participation call.
- Keyword presence is no longer enough. Acceptance requires a concrete development.
- Weekday and calendar date must agree. Contradictory dates are not routed to Calendar or Today’s Brief.
- Blue Room Monday Night Jam is **2026-09-07** (Monday), not 2026-09-05 (Saturday). Paganova is **2026-09-05** (Saturday), not 2026-09-03 (Thursday).
- Today’s Brief no longer calls Ozone’s 8/23 reschedule “New.” Video-growth lines remain first.
- `@goodiesparty_` ThrowbackThursday (`/reel/DcjRivYhHQr/`) was the Discover-review trigger. It is skipped. Zero Discover cards were created this pass.
- `@hookedonkc` was **not** created, checked, deleted, or modified here. It is a UI “Add source” from 2026-09-02 05:30:50Z.
- The ordinary-concert Things To Do Weekly fixture was date-stale. Production lane policy is still correct. The fixture now freezes `now` before the event.

Success metric: a higher percentage of useful, defensible findings — not more findings.

## Before/after precision counts by type

Audited every accepted **non-event** Watchlist finding created after 2026-09-01 (`source_category=curator_watchlist`), plus the required false-positive events. Labels were judged against caption/OCR evidence, not stored types alone.

### 24 non-event findings from the September 2 yield pass

| Disposition | Before (as stored/surfaced) | After this pass |
|---|---:|---:|
| Correct | 4 | **4 still surfaced** (Fish Friday, $7 drink specials, vendor spots, Elevation $1 wings / reverse happy hour) |
| Partially correct | 3 | **2 still surfaced** (Swift truck week window repaired; BFTF Sept 4 makeup kept as schedule). Collaboration kept as thin-but-dated. |
| Incorrect | 11 | **0 surfaced** (skipped with reason) |
| Duplicate/redundant | 2 | **0 surfaced** |
| Stale/non-actionable | 4 | **0 in Today’s Brief**. Ozone remains on Watchlist detail as historical_baseline. BFTF Aug 28 / Sherri Aug 25 / Hot Country 8.27 skipped or Brief-ineligible. |
| Unverifiable | 0 | 0 |

### Required extra events

| Finding | Before | After |
|---|---|---|
| FIFA “FREE ADVICE…” event | Surfaced | Skipped |
| Blue Room “Some bands…” event | Surfaced | Skipped |
| `@goodiesparty_` ThrowbackThursday event (`discover_review`) | Surfaced + Discover-review route | Skipped |

Operator suppression wrote **18 skipped** rows and repaired **2** curator leads (plus matching Early Signals dates). Already-skipped on re-run: 18.

## Every audited finding and disposition

| Watched source | Source post URL | Caption / evidence (abbrev.) | Stored type(s) | Title | Date/time | Baseline | Route | Correct? | Reason if not |
|---|---|---|---|---|---|---|---|---|---|
| `@swiftscajuncuisine` | https://www.instagram.com/p/DclohnJOqvP/ | Fish Friday lunch special 11am–3pm, 3415 Main | promotion_sale | Fish Friday lunch special! | none | new | watchlist_activity | **correct** | — |
| `@swiftscajuncuisine` | https://www.instagram.com/p/DcwWRQkKGwa/ | Food truck all week Sept 1 until Labor Day Sept 7 | schedule_change | Catch Swifts Food Truck all week long… | 2026-09-01 (window through 2026-09-07) | new | todays_brief | **partially correct** | Type right; stored `currentlyActionable=false` because start date was treated as expired. Repaired `endIsoDate=2026-09-07`. |
| `@stashhouse_kd` | https://www.instagram.com/p/DchLiKEuvRU/ | Vendor spots both days, Labor Day weekend | participation_call | 2 concerts .. | 2026-09-05 (Saturday) | new | early_signals | **correct** | Weekday agrees. |
| `@kcrednation` | https://www.instagram.com/p/DcTiCunR9KP/ | 1st Fridays Happy Hour $7 drink specials | promotion_sale | 🚨1st Fridays Happy Hour🚨… | none | new | watchlist_activity | **correct** | Concrete offer. |
| `@elevationgrille` | https://www.instagram.com/p/DbGPH50lo1u/ | Reverse Happy Hour; Bike Night; free entry; $1 wings; $3 beer | promotion_sale | What’s going on at Elevation!!! | none | new | watchlist_activity | **correct** | Weak opener, but a concrete offer. Not suppressed. |
| `@lzwegotone` | https://www.instagram.com/p/DcuaOwyDR0A/ | This Sunday Sept 6, R&B Room at Laila Lounge | collaboration | This Sunday - September 6th… | 2026-09-06 (Sunday) | new | watchlist_activity | **partially correct** | Dated event; “collaboration” is thin. Date weekday agrees. Left in place. |
| `@ozone_show` | https://www.instagram.com/p/DcJAvSOxAE6/ | Episode 3 RESCHEDULED to 8/23/26 | schedule_change | Episode 3 (Tha Town) RESCHEDULED to 8/23/26 | 2026-08-23 | historical_baseline | watchlist_activity | **stale** | Type right; already passed. Excluded from Brief. Not deleted. |
| `@blackfoodtruckfridays` | https://www.instagram.com/p/DcmlfSAT3Uh/ | Storm cancel; join next week Sept 4; makeup Aug 28 | schedule_change + promotion_sale | Due to the storm, today’s event has been canceled. | 2026-09-04 | new | todays_brief / watchlist_activity | **partial + redundant** | Schedule toward Sept 4 kept. Promo copy of the same cancel skipped. |
| `@blackfoodtruckfridays` | https://www.instagram.com/p/DcRzszpT_Ez/ | NO EVENT tomorrow; rescheduled Aug 28 | schedule_change | Hi BFTF Fam, NO EVENT tomorrow… | 2026-08-28 | new | todays_brief | **stale** | Date passed. Brief eligibility now rejects expired dates. |
| `@sherrislounge` | https://www.instagram.com/p/DccpARTjdpv/ | Soundtrack All Week; Tuesday Reset Aug 25 | schedule_change | Kansas City’s Soundtrack All Week… | 2026-08-25 | new | todays_brief | **stale** | Already passed; not Brief-eligible. |
| `@kclifestylegirl` | https://www.instagram.com/reel/DchhnTdiedU/ | Correction 8.27.26 Hot Country Nights | promotion_sale | Correction: 8.27.26 … | none extracted | new | watchlist_activity | **stale** | Skipped. |
| `@sedwardskc` (caption also attributed to Boone in yield notes) | https://www.instagram.com/p/Da4Vtd8llkF/ | FREE ADVICE The FIFA World Cup is over | event | FREE ADVICE The FIFA World Cup is over. | none | — | early_signals | **incorrect** | Skipped. Not an event. |
| `@theblueroomkc` | https://www.instagram.com/p/DcWLzktD1sN/ | Some bands you meet at happy hour… Tonight they’re back (published ~Aug 22) | event + promotion_sale | Some bands you meet at happy hour… | tonight → publication day, expired | new | early_signals / watchlist_activity | **incorrect** | Atmosphere / stale “tonight.” Skipped. |
| `@theblueroomkc` | https://www.instagram.com/p/DcoNX6xjR0k/ | Some debuts you don't forget. Tonight, the follow-up. | promotion_sale | Some debuts you don't forget. | stale tonight | new | watchlist_activity | **incorrect** | No concrete new development. Skipped. |
| `@rio.entertainment` | https://www.instagram.com/p/DbcGQcKu9md/ | COME OUT AN MEET AN GREET / THE RE GRAND OPENING flyer | opening_closing | SAT WE GOING UP … COME OUT AN MEET AN GREET | none | new | early_signals | **incorrect** | Hype invite, not a business opening. Skipped. |
| `@tarantino1440` | https://www.instagram.com/p/DcpBspFAGLL/ | Tickets on sale … Ghostface after party THIS WEDNESDAY SEPT.2 | event + promotion_sale + participation_call | Tickets on sale now on Eventbrite… | 2026-09-02 (Wednesday) | new | calendar_eligible + extras | **event correct; extras redundant** | Event kept. Promo and participation skipped. |
| `@goodiesparty_` | https://www.instagram.com/reel/DcjRivYhHQr/ | #ThrowbackThursday … Block Party tickets on sale | event (`discover_review`) + promotion_sale | ThrowbackThursday to one of our favorites… | none | new | discover_review / watchlist_activity | **incorrect** | Throwback. Discover-review trigger. Both skipped. Separate Block Party posts remain events. |
| `@kclifestylegirl` | https://www.instagram.com/reel/DcT3UM5iOIT/ | Looking for your next home builder | promotion_sale | LOOKING FOR YOUR NEXT HOME BUILDER… | none | new | watchlist_activity | **incorrect** | No concrete offer. Skipped. |
| `@kclifestylegirl` | https://www.instagram.com/reel/DcMV9y8CqON/ | Save this for your next staycation / boutique hotel | opening_closing | Save this for your next staycation… | none | new | early_signals | **incorrect** | Not an opening. Skipped. |
| `@mauricemillerforever` | https://www.instagram.com/reel/Dcv_1TXONkA/ | first look at Step Into My Life | opening_closing | Kansas City’s own Maurice Miller presents a first look… | none | new | early_signals | **incorrect** | Premiere language, not a venue open. Skipped. |
| `@theepitomekc` | https://www.instagram.com/reel/DctvyNEM07C/ | I KNOW y’all know them Jacquees songs! Come see Jacquees LIVE this Saturday | promotion_sale (event also stored) | I KNOW y’all know them Jacquees songs! | Saturday unnamed | new | watchlist_activity | **incorrect promo** | Promo skipped. Event row remains (live Saturday show). |
| `@kclifestylegirl` | https://www.instagram.com/reel/DcToioTCkU7/ | Jonas Brothers tickets ON SALE NOW | promotion_sale + event | THE JONAS BROTHERS ARE COMING TO KANSAS CITY! | 2026-11-03 | new | watchlist_activity / calendar_eligible | **promo incorrect** | Tickets on sale ≠ discount. Promo skipped. Event kept. |
| `@vyelounge` | https://www.instagram.com/p/DcBmfbTRkML/ | Bright, refreshing… Fine and Dandy ✨ New menu! | product_menu_launch | Bright, refreshing, and made for the perfect night out. | none | historical_baseline | watchlist_activity | **incorrect** | Atmosphere title; not a named launch we can defend. Skipped. |

Boone Ghostface event at the same URL on `@boonetheater` remains calendar-eligible. FIFA was stored under `@sedwardskc`, not `@boonetheater`.

## False-positive repairs

Classifier (`watchlist-intelligence.ts`) now:

- Rejects FIFA / “FREE ADVICE”, atmosphere openers without a current concrete offer, “COME OUT AN MEET” hype, throwback-only, and keyword-without-development.
- Treats tickets on sale as event evidence only with a named show / after party — **not** promotion or participation.
- Emits at most one primary type and one independently supported secondary. Event+promotion from tickets is forbidden.
- Requires a concrete development (specific event, offer with terms, confirmed open/close, stated schedule change, named menu/product, application/vendor call, explicit partnership, or verifiable community/business news).

Stored false positives are `signalState=skipped` with `skipReason` and `sourceScreen=watchlist_precision_repair`. Confirmed rows are never skipped.

Regression fixtures live in `watchlist-intelligence.test.ts`.

## Temporal-resolution root cause

Blue Room carousel `https://www.instagram.com/p/Dcwr0RuDpXY/` (published **2026-09-01T22:00:11Z**, Tuesday afternoon Chicago):

```
THURSDAY — …
FRIDAY — …
SATURDAY — Paganova, 8:30 & 10
MONDAY — Ernest Melton opens the Monday Night Jam, 7 pm
```

How 2026-09-05 (Saturday) was assigned to Monday Night Jam:

1. `parseRoundupSlideText` (GPT-4o-mini) was told to emit ISO dates “when inferable” and invented calendar days.
2. `resolveWeekendDatesFromPostContext` **skipped** any row that already had `eventDate`, so weekday repair never ran.
3. Weekend math used `Date.getDay()` (server local/UTC), not America/Chicago.
4. `researchCuratorEventLead` then stamped VERIFIED without checking weekday vs date.

Correct resolution from Tuesday 2026-09-01 Chicago: next Saturday = **2026-09-05** (Paganova); next Monday = **2026-09-07** (Monday Night Jam).

Fixes:

- LLM prompt: do not guess dates; if `eventDate` is emitted it must fall on the named weekday.
- Roundup resolver: reconcile stated date with `dayHeading`; replace contradictory dates from publication weekday; never include the full caption (all weekdays) in that check.
- `watchlist-date-trust.ts`: Chicago calendar, UTC-noon weekday for date-only ISO, no fabricated `publishedAt`, no silent year that makes the weekday wrong. Contradictory stated years stay `contradictory`.
- Calendar eligibility rejects `weekday_contradiction`.
- Stored VERIFIED leads were **date-repaired** with `previousEventDate` + `dateRepairReason` in `research_summary` and `metadata`. Not deleted.

## Blue Room Monday/date investigation

| Lead | Stored before | Calendar weekday | After repair | Status |
|---|---|---|---|---|
| Ernest Melton opens the Monday Night Jam | 2026-09-05 | Saturday | **2026-09-07** Monday | VERIFIED kept |
| Paganova | 2026-09-03 | Thursday (heading SATURDAY) | **2026-09-05** Saturday | VERIFIED kept |

Event leads UI shows the repaired dates. Early Signals `eventDate` columns were synced to the same ISO days.

**Remaining limitation:** the research **summary prose** on those two `curator_event_lead` rows still quotes the old dates and “couldn’t locate” language from the original web-research call. That text is a historical record. Calendar/lead `eventDate` is the operator-facing date.

## Today’s Brief eligibility changes

`isWatchlistBriefEligible` now requires:

- not `historical_baseline`
- not low confidence
- not contradictory dates
- not uncertain **dated** events
- currently actionable
- not expired (honors `endIsoDate` for windows)

“New from” is used only when `publishedAt` is within 36 hours. Otherwise “Watchlist:”. Newly extracted ≠ newly published ≠ currently actionable.

Undated but currently actionable promotions (Fish Friday) may still appear. Expired dated items may not.

### Ozone verification

Public Home Today’s Brief (`https://benson.kckellie.com/home` and `GET /api/pre-alpha/home`):

1. “Everything costs more…” +1 view (274)
2. “I’m searching Kansas City…” +16 views (833)
3. “United Market KC…” +50 views (1,567)
4. Watchlist checked 36 sources.
5. Watchlist: `@theepitomekc`: Lloyd “fine too” / “5’2” question

**Ozone Episode 3 / 8/23/26 is absent.** Video-growth lines remain first. A currently actionable Watchlist line remains in slot 5.

Ozone’s row still exists on the `@ozone_show` Watchlist detail as historical_baseline. That is intentional.

## Discover-review audit

Exact trigger: Early Signal `6019bc9d-8506-465a-a1ce-e0cf3216b956`

- Source: `@goodiesparty_`
- URL: `https://www.instagram.com/reel/DcjRivYhHQr/`
- Type: `event`
- Route: `discover_review`
- Caption: `#ThrowbackThursday` + Block Party tickets

That row (and the sibling promotion) is skipped. Going forward, Discover review requires high confidence, resolved date when date-dependent, non-historical, non-throwback, primary event-with-date or participation_call, and concrete evidence.

**Discover cards auto-created this pass: 0.** `content_items` created after 2026-09-02 04:00Z with watchlist/early_signal ingest: **0**.

## `@hookedonkc` provenance investigation

Not created, first-checked, deleted, paused, or disabled in this pass.

| Field | Value |
|---|---|
| id | `ff41988f-f875-4d01-a3cb-c4d1a4ec437d` |
| created_at | 2026-09-02 05:30:50.207Z |
| created_by | `creator` |
| watcher_kind | `generic` (not curator) |
| canonical_key | `instagram:account:hookedonkc` |
| submitted_url | Instagram profile with `utm_source=ig`, `utm_content=link_in_bio` |
| health | pending / Ready |
| last_successful_check | **null** |
| enabled / paused | true / false |

`createdBy: 'creator'` is the Watchlist UI “Add source” path (`benson-scout/watchlist.ts` insert). It is not a seed, migration, Instagram first-check, or production ingestion.

Similar `created_by=creator` adds in the last 14 days: `@boonetheater` and `@ozone_show` on 2026-09-01 (intentional operator adds). The only unexplained extra watcher in that window is `@hookedonkc`.

Public Watchlist still lists “Still first-check: `@hookedonkc`.”

## Failing-test resolution

`ordinary concert can qualify for Things To Do Weekly but not Film This/Home` in `home-showroom.test.ts`.

**Production behavior is correct. The fixture was date-stale.** `qualifiesThingsToDoWeekly` uses `isOperatorTemporallyCurrent({ now: new Date() })`. Fixture `eventDate: 2026-08-20` is past as of 2026-09-02, so the test failed even though an ordinary concert **should** still qualify for Things To Do Weekly when current, and still must not enter Film This / Home.

Repair: pass `now = 2026-08-10T12:00:00.000Z` into `qualifiesThingsToDoWeekly` and `classifyContentLanes`. `home-showroom-lanes.ts` was **not** loosened.

## Files changed

No migrations.

| File | Change |
|---|---|
| `services/core/src/curator-watchlist/watchlist-date-trust.ts` | New deterministic date/weekday trust |
| `services/core/src/curator-watchlist/watchlist-date-trust.test.ts` | Year-boundary, weekday, slash-date, contradictory-year tests |
| `services/core/src/curator-watchlist/watchlist-intelligence.ts` | Evidence gate, primary type, Brief eligibility, Discover gate |
| `services/core/src/curator-watchlist/watchlist-intelligence.test.ts` | FP + Brief + throwback regressions |
| `services/core/src/curator-watchlist/roundup-parser.ts` | Weekday reconcile; no invented ISO; Chicago next-weekday |
| `services/core/src/curator-watchlist/curator-watchlist.test.ts` | Blue Room + year-boundary roundup tests |
| `services/core/src/curator-watchlist/watchlist-activity.ts` | Skip-filter, Brief metadata, auditable suppression + date repair |
| `services/core/src/creator-calendar/population/eligibility.ts` | `weekday_contradiction` |
| `services/core/src/creator-calendar/population/eligibility.test.ts` | Monday Night Jam contradiction tests |
| `services/core/src/creator-calendar/population/sync.ts` | Pass dayHeading / quoted text into eligibility |
| `services/core/src/pre-alpha/home-showroom.test.ts` | Frozen `now` for ordinary concert |
| `scripts/benson-deploy-local.sh` | Include new Watchlist + Home showroom tests |

Dashboard Watchlist list/detail UI was not redesigned.

## Migrations

None.

## Exact test commands and results

Dashboard:

```
cd dashboard && pnpm exec tsc --noEmit
```

Exit **0**.

Focused suite (also the deploy targeted list, including Playwright runtime, Watchlist state, scheduler, eligibility, heartbeat):

```
cd services/core && pnpm exec tsx --test \
  src/playwright-runtime/playwright-runtime.test.ts \
  src/curator-watchlist/watchlist-state.test.ts \
  src/curator-watchlist/watchlist-intelligence.test.ts \
  src/curator-watchlist/curator-watchlist.test.ts \
  src/curator-watchlist/watchlist-date-trust.test.ts \
  src/pre-alpha/home-showroom.test.ts \
  src/curator-watchlist/scheduler.test.ts \
  src/worker-heartbeat/worker-heartbeat.test.ts \
  src/creator-calendar/population/eligibility.test.ts \
  src/creator-calendar/population/sync.test.ts \
  src/creator-calendar/population/calendar-category.test.ts \
  src/creator-calendar/population/projection-freshness.test.ts \
  src/creator-calendar/category-snooze.test.ts \
  src/creator-calendar/weekend-things-to-do.test.ts \
  src/creator-calendar/dismiss.test.ts \
  src/gmail-inbox/discovery-newsletter-route.test.ts \
  src/newsletter-intelligence/date-normalize.test.ts
```

**`# tests 228` `# pass 228` `# fail 0`**

Ordinary concert: **pass**. Public-event / Discover trust / Watchlist state tests were not loosened.

Core `tsc --noEmit` still has pre-existing errors in unrelated scripts. No new errors in Watchlist files (dashboard tsc covers the date-trust typing).

## Production URLs checked

- https://benson.kckellie.com/watchlist (mobile 390×844 and desktop)
- https://benson.kckellie.com/watchlist/c4a1f301-6008-432b-86da-187470805dd0 (`@boonetheater`)
- https://benson.kckellie.com/watchlist/984cbe40-df64-4872-9c9e-b788abe4ecb4 (`@theblueroomkc`)
- https://benson.kckellie.com/home
- https://api.kckellie.com/api/watchlist
- https://api.kckellie.com/api/pre-alpha/home
- http://127.0.0.1:4000/health
- http://127.0.0.1:3000/watchlist

Public dashboard returned 502 while two Next builds raced; recovered with a single Node 22 `next start`. Rechecked **200**.

## Mobile/desktop screenshots

| Surface | File |
|---|---|
| Watchlist list + What changed (390×844) | `docs/ops/screenshots/watchlist-precision-and-time-trust-2026-09-02-list-mobile.png` |
| Watchlist list desktop | `docs/ops/screenshots/watchlist-precision-and-time-trust-2026-09-02-list-desktop.png` |
| Home Today’s Brief (video-growth first, Ozone absent) | `docs/ops/screenshots/watchlist-precision-and-time-trust-2026-09-02-home-desktop.png` |
| Boone detail (FIFA gone; Ghostface event kept) | `docs/ops/screenshots/watchlist-precision-and-time-trust-2026-09-02-boone-desktop.png` |
| Blue Room detail (leads 2026-09-07 / 2026-09-05) | `docs/ops/screenshots/watchlist-precision-and-time-trust-2026-09-02-blueroom-desktop.png` |

## Fingerprints

```
status: MATCH
source/api/dashboard/worker: bd11bc1bdc40e474
apiStartedAt: 2026-09-02T06:58:20.003Z
dashboardBuiltAt: 2026-09-02T06:58:23.612Z
workerStartedAt: 2026-09-02T06:58:21.581Z
```

API identity `gitCommit` still showed `eb1d8a5` until this commit lands (runtime fingerprint is source+mtime, not git SHA).

## Remaining limitations

- Research-summary **prose** on Blue Room curator_event_lead rows still mentions the old dates. Lead `eventDate` is repaired.
- `@theepitomekc` Lloyd poll is currently the Brief Watchlist line. It is a dated engagement post, not one of the required false positives. Classifier still cannot rewrite titles.
- Ozone historical_baseline remains on the source detail page (not Brief).
- Cross-source Ghostface (Boone / tarantino / bizzybody) is still attributed separately.
- Civic/RSS adapters were not changed; Visit KC scout items are still not curator posts.
- `@hookedonkc` is still Ready / never checked. Operator authorization is required before first-check.
- Crossroads KC remains unsupported.
- Keyword classifier is still deterministic and fail-safe; it will miss some valid captions that lack the concrete patterns.
- Dashboard production build raced with a second `next build` once (ENOENT / EADDRINUSE). Not a Watchlist logic bug.
- Workers continued sequential Instagram checks during verification (`@kcrednation` / `@kclifestylegirl` later successful checks). Shared session was not challenged. `@hookedonkc` was not checked.

## Commit hash and branch

- Branch: `release/scout-expansion-2026-07-25`
- Implementation commit: `b733f626f7e6d0fc4872d0ab41e89557e01cb16b`
- Report SHA commit: `16c002a0286207c0bf4ba0ea755a9a1a30f15c60`
- Clean-tree: filled after push
- Remote-match: filled after push
