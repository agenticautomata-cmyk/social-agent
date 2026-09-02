# Benson Watchlist Brief Relevance — 2026-09-02

## Executive summary

This pass is a narrow Today’s Brief quality repair. It does **not** add features, redesign pages, expand the taxonomy, generate pitches, create Discover cards, or rebuild the Watchlist pipeline.

The precision pass removed known false positives. Production Today’s Brief still filled slot 5 with `@theepitomekc`: Lloyd “fine too” / “5’2” — a poll, not actionable intelligence.

Today’s Brief now answers: **what changed that Kellie may reasonably need to know or act on?** A Watchlist finding may occupy a Brief slot only when a concrete current development can be stated in one evidence-backed sentence. Four strong lines beat five lines with engagement bait. Recency of extraction does not outrank usefulness.

Production Home Today’s Brief after this pass:

1. Video-growth (package date) +1 view, now 275
2. Video-growth (luxury shopping) +9 views, now 842
3. Video-growth (United Market KC) +53 views, now 1,620
4. Watchlist checked 40 sources.
5. Watchlist: `@blackfoodtruckfridays`: Next date is Friday, September 4, 2026.

Lloyd/5’2 is absent. No poll, meme, or vague caption replaced it. Ozone’s expired 8/23 reschedule remains absent. Video-growth lines remain first.

`@hookedonkc` was treated as an operator-added source (`createdBy: creator`). Its first Instagram check completed sequentially under the shared session. It was not deleted or disabled. First-check historical recap posts did not enter Today’s Brief merely because they were newly processed.

Blue Room operator-facing summaries now agree with structured dates: Paganova is Saturday, September 5, 2026; Ernest Melton Monday Night Jam is Monday, September 7, 2026. Original research prose is preserved in audit metadata and marked superseded.

## Root cause of the Lloyd/5’2 Brief line

Exact stored finding (not deleted):

| Field | Value |
|---|---|
| id | `b551d3db-2b05-4d8e-aee2-dceb70804ffc` |
| source | `@theepitomekc` |
| URL | https://www.instagram.com/reel/DcjYHWoiyba/ |
| type | `event` |
| created | 2026-09-02T06:47:18.899Z (after the precision deploy, during a later IG check) |
| route | `calendar_eligible` |
| confidence | high |
| currentlyActionable | true |
| eventDate | 2026-09-05 |
| title | first sentence of the caption (the poll) |

The caption is engagement-led (“HELP US SETTLE THE AGE-OLD QUESTION… fine too or 5’2”) with a buried concert sentence: Lloyd LIVE at For The Love of R&B Festival, Saturday September 5, Grandview Amphitheater. That festival already exists as a curator event lead from `@stashhouse_kd` (`e2f6732d-…`).

Why the prior gates failed:

1. `CONCRETE_EVENT` matched `live at`, so `hasConcreteDevelopment` was true.
2. `BAIT` only matched like/comment/tag/follow — not polls or questions.
3. Rejection was `BAIT && !hasConcreteDevelopment`, so the buried “LIVE at” skipped the bait reject.
4. Brief wording used the raw `title` (first sentence), so the poll occupied slot 5.
5. Home previously ranked among the newest extracted findings. Recency outranked usefulness.

**Suppressed, not deleted**, via `applyWatchlistBriefRelevanceRepair()`:

| id | Title (abbrev.) | URL | skipReason |
|---|---|---|---|
| `b551d3db-…` | HELP US SETTLE… fine too / 5’2 | `/reel/DcjYHWoiyba/` | `engagement_bait: poll/question caption is not actionable Watchlist intelligence for Today’s Brief` |
| `73624cea-…` | DID YOU KNOW THIS VIP LOUNGE… | `/reel/DcgwuU8CZx6/` | same |
| `1c01da60-…` | What are you doing in Kansas City this weekend? | `/p/DckCucmigDu/` | same |

`sourceScreen: watchlist_brief_relevance_repair`. `signalState=skipped`. Rows remain in the database.

Going forward, `isEngagementLedText` rejects poll/question-led captions **even when a buried event sentence exists**. Pipeline roundup extraction also skips `eventName` values that are engagement-led or contain `?`.

## Before/after Brief eligibility rules

### Before

A finding could appear in Today’s Brief when it was recently accepted, currently actionable, not expired, and not low-confidence / contradictory. Concrete-development was true if `live at` appeared anywhere in the caption. Brief text was the stored title (often the first caption sentence). Home used a small recency window. Empty usefulness still filled a fifth slot.

### After

`isWatchlistBriefEligible` requires all of:

- not `historical_baseline`
- not low confidence
- not contradictory dates; not uncertain dated events
- currently actionable
- not expired (`endIsoDate` honored)
- not engagement-led (polls, questions, who-agrees, appearance commentary openers)
- a **concrete one-sentence summary** from `summarizeWatchlistFindingForBrief`

A Watchlist finding may appear only when that summarizer can state at least one current development:

- confirmed opening or closing
- meaningful schedule change or cancellation (stale “canceled today” without a future date is dropped)
- upcoming creator-relevant event with a named, dated development
- specific sale, special, price, or offer with terms
- vendor/application/participation opportunity
- named menu or product launch
- confirmed business, venue, or community development
- collaboration with a specific consequence
- other verified change with clear creator-facing value

Excluded: polls, engagement prompts, appearance commentary, memes/jokes/reactions, generic hype, atmosphere/lifestyle copy, throwbacks, vague invitations, ordinary engagement posts, findings whose useful development cannot be stated clearly in one sentence, and stale / expired / contradictory / uncertain / low-confidence rows.

If no eligible development exists, Brief emits only the operational “Watchlist checked N sources.” line. It does **not** fill the fifth Home slot with a weak finding.

Home strips “awaiting review” and “Needs attention” from Today’s Brief (`homeWatchlistBriefLines`). Those remain on the Watchlist “What changed” operator list.

## Ranking behavior

When several findings qualify, rank is:

1. cancellations, closures, and material schedule changes (100 / 98 / 95)
2. time-sensitive participation / vendor opportunities (90)
3. openings and significant business developments (80 / 75)
4. currently valid specials or offers (70)
5. strong upcoming creator-relevant events (60)
6. other verified information (40)

Tie-breakers inside a rank: evidence-backed sentence required; higher confidence and current dates already required for eligibility. **Recently extracted does not add rank.**

Production ranking among eligible rows: BFTF storm-cancel makeup (`83d5058b-…`, schedule_change, next date 2026-09-04) outranks Swift Food Truck week (95), stashhouse vendor spots (90), Fish Friday (70), and hookedonkc vendor spaces (90). Slot 5 is therefore the Sept 4 next date, not a caption fragment and not first-check noise.

## Brief wording changes

`formatWatchlistBriefLines` no longer repeats weak caption titles. `summarizeWatchlistFindingForBrief` emits deterministic, evidence-backed sentences or returns null.

Examples now enforced by tests:

- Fish Friday → “Fish Friday special runs 11 AM–3 PM at 3415 Main.”
- BFTF storm cancel with future makeup → “Next date is Friday, September 4, 2026.”
- Stashhouse vendor spots → “Vendor spots are available for Saturday, September 5, 2026.”
- hookedonkc vendor CTA evidence → “Vendor spaces start at $50 for Friday, September 18, 2026.” (not “Sign up and secure your spot now!”)

A stale “canceled today’s event” with no future `eventDate` returns null and cannot occupy a slot. Hours-only “5 PM–9 PM” is rejected as a Brief sentence.

Production slot 5: `Watchlist: @blackfoodtruckfridays: Next date is Friday, September 4, 2026.`

## Findings accepted and rejected during verification

### Rejected from Today’s Brief (kept in DB)

| Finding | Why |
|---|---|
| Lloyd / 5’2 poll `@theepitomekc` `/reel/DcjYHWoiyba/` | Engagement-led; skipped with reason |
| VIP lounge “DID YOU KNOW…” | Question/engagement-led; skipped |
| “What are you doing in Kansas City this weekend?” | Poll/question; skipped |
| Ozone Episode 3 reschedule to 8/23/26 | Expired; `historical_baseline`; absent from Brief |
| BFTF Aug 28 “NO EVENT tomorrow” | Expired date; summarizer would emit a past next-date and eligibility rejects it |
| hookedonkc listening-session recaps / founder-journey reels | No concrete development stored as Brief-eligible |
| hookedonkc “Sign up and secure your spot now!” **title** | Weak CTA title; cannot appear as Brief wording. The underlying vendor terms can, but lost ranking to BFTF Sept 4 |

### Accepted as Brief-eligible (ranked; only the top development is shown)

| Finding | Sentence | Rank | Shown in Home Brief? |
|---|---|---|---|
| `@blackfoodtruckfridays` `/p/DcmlfSAT3Uh/` schedule_change | Next date is Friday, September 4, 2026. | 100 | **Yes** (slot 5) |
| `@swiftscajuncuisine` truck week through Labor Day | Food truck is out all week through Labor Day, September 7. | 95 | No (outranked) |
| `@stashhouse_kd` vendor spots | Vendor spots are available for Saturday, September 5, 2026. | 90 | No |
| `@hookedonkc` vendor spaces $50 | Vendor spaces start at $50 for Friday, September 18, 2026. | 90 | No |
| `@swiftscajuncuisine` Fish Friday | Fish Friday special runs 11 AM–3 PM at 3415 Main. | 70 | No |

Classifier regression: new Lloyd-class captions are rejected at ingest (`engagement_bait`), not only skipped after the fact.

## Blue Room conflicting-summary repair

Structured dates were already correct from the precision pass. Operator-facing prose was not.

| Surface | Paganova | Ernest Melton Monday Night Jam |
|---|---|---|
| Event lead `eventDate` | **2026-09-05** 20:30 | **2026-09-07** 19:00 |
| Watchlist “What Benson found” | Paganova is Saturday, 2026-09-05. Previous date 2026-09-03 superseded. | …is Monday, 2026-09-07. Previous date 2026-09-05 superseded. |
| Event Leads card | 2026-09-05 · 20:30 VERIFIED | 2026-09-07 · 19:00 VERIFIED |
| Early Signal header | Sat, Sep 5, 2026 | Mon, Sep 7, 2026 |
| Early Signal summary | corrected + superseded | corrected + superseded |
| Captured evidence “Date claimed” | **2026-09-05** | **2026-09-07** (was 2026-09-05; repaired this pass) |
| Calendar item `startAt` | 2026-09-06T01:30:00Z = Sat Sep 5 8:30 PM Chicago | 2026-09-08T00:00:00Z = Mon Sep 7 7:00 PM Chicago |

Lead IDs: Paganova `6a97b91d-5cb4-4df4-a272-7ba690fc412a`; Melton `2e76fc63-935f-4465-be01-a2925f2f93dc`. Linked signals `5dbfe9ec-…` and `2cf5feac-…`.

`researchSummary.originalSummary` still contains the original web-research prose (including wrong dates) as audit metadata. `originalResearchSuperseded: true`. Display summary is the corrected sentence plus the date-repair reason (`weekday_contradiction`).

## Search for other date/summary conflicts

Swept all `curator_watchlist` early signals and all curator event leads where `previousEventDate` disagrees with structured `eventDate`.

- Remaining **visible** summary conflicts (operator-facing summary still asserting the old date as current): **0**
- Remaining Event Lead display-summary conflicts: **0**
- Additional repair this pass: Early Signal `contentRecommendation.confirmedFacts` “Date claimed” lines that still showed the pre-repair ISO. Melton and Paganova facts now match structured dates.

Calendar suggestions for these two leads were already using the repaired lead dates (Chicago-local `startAt`). Weekend List does not include them (not selected). No other repaired-date / contradictory-summary pairs were found.

## `@hookedonkc` first-check results

Treated as operator-added. Database: `createdBy: creator`, `adapterType: social_account`, created 2026-09-02T05:30:50.207Z via the Watchlist Add Source UI. No evidence of an automated or unauthorized insert. **Not deleted or disabled.**

First check: `runWatcherNow` with the shared curator Instagram lock (sequential; not concurrent with a cycle).

| Field | After check |
|---|---|
| id | `ff41988f-f875-4d01-a3cb-c4d1a4ec437d` |
| health | healthy |
| lastSuccessfulCheck | 2026-09-02T07:35:45.049Z |
| posts processed | 12 |
| events extracted | 5 |
| verified yield | 3 |
| enabled / paused | true / false |

### Source URLs processed (12)

https://www.instagram.com/reel/Dctgr4bRJVf/ · `/reel/DcwHbzlRvAQ/` · `/reel/Dcr13LUybhg/` · `/reel/DcoL26aT71M/` · `/reel/DcRMeEUKNTK/` · `/reel/DcnBQEbtBoj/` · `/reel/DcUKpmDCE9P/` · `/p/DcwWK4Ciet0/` · `/p/DcoVOsQiIdI/` · `/p/Dcjl6BJlYA0/` · `/p/DcYrAvqFQ11/` · `/p/Db3jBPCCWTs/`

### Useful findings stored

| Type | Title | Date | Route | Brief? |
|---|---|---|---|---|
| curator_event_lead | SAPPHIC CON 2026 | 2026-09-18 | early_signals | No (`currentlyActionable` false on the lead row) |
| curator_event_lead | REWIND: THE SAPPHIC BALL | 2026-09-18 | early_signals | No |
| curator_event_lead | THE CON: A DAY OF CONVERSATIONS AND COMMUNITY | 2026-09-19 | early_signals | No |
| curator_event_lead | ORIGINAL SIN: A SAPPHIC CABARET AND DANCE PARTY | 2026-09-19 | early_signals | No |
| curator_event_lead | THE SAPPHIC CON FESTIVAL | 2026-09-20 | early_signals | No (CONFLICTED) |
| collaboration | Original Sin takeover of `@woodyskc` 9/19 | uncertain | watchlist_activity | No |
| event | Sign up and secure your spot now! (`/p/Dcjl6BJlYA0/`, $50 vendor spaces) | 2026-09-18 | calendar_eligible | Eligible as “Vendor spaces start at $50…”; **not shown** — outranked by BFTF Sept 4 |

### Rejected noise (not stored as Brief lines)

Listening-session recaps, “not to be dramatic” vibe posts, founder-journey interview, Social House hype. No concrete current development. First-check historical content did **not** enter Today’s Brief merely because it was newly processed.

Watchlist “What changed” still lists stored titles, including “Sign up and secure your spot now!” That is the operator activity list, not Home Today’s Brief.

## Files changed

No migrations. Dashboard UI was not redesigned.

| File | Change |
|---|---|
| `services/core/src/curator-watchlist/watchlist-intelligence.ts` | Engagement-led reject; Brief eligibility requires a concrete sentence; usefulness ranking; deterministic summarizer |
| `services/core/src/curator-watchlist/watchlist-intelligence.test.ts` | Lloyd reject; ranking; no poll slot-fill; Fish Friday wording; schedule window vs special |
| `services/core/src/curator-watchlist/watchlist-activity.ts` | Brief pool 48; pass evidence into eligibility; auditable engagement skips; Blue Room display-summary + Date claimed repair |
| `services/core/src/curator-watchlist/pipeline.ts` | Skip roundup `eventName` values that are engagement-led or contain `?` |
| `services/core/src/pre-alpha/home.ts` | `homeWatchlistBriefLines` so Home does not show awaiting-review filler |

## Migrations

None.

## Exact tests and results

Deploy targeted suite (same list as `scripts/benson-deploy-local.sh`):

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

**`# tests 234` `# pass 234` `# fail 0`**

New Brief-relevance cases: Lloyd poll reject; Lloyd cannot occupy Brief when Fish Friday exists; cancellations outrank vendor/special/event; poll/vague caption does not fill a slot; Fish Friday wording; schedule window outranks a special when no cancellation exists.

Dashboard was **not** rebuilt this pass (no dashboard source changes). Fingerprints were rewritten onto the existing dashboard process.

## Production Brief output

Local `GET http://127.0.0.1:4000/api/pre-alpha/home` and public Home `https://benson.kckellie.com/home` (desktop and mobile):

1. “Everything costs more… and now I can’t even find a date on the package?!” gained 1 views since the last check, now at 275.
2. “I’m searching Kansas City and Kansas for the best places to shop luxury…” gained 9 views since the last check, now at 842.
3. “United Market KC has opened at 31st & Prospect, bringing a full-service…” gained 53 views since the last check, now at 1,620.
4. Watchlist checked 40 sources.
5. Watchlist: `@blackfoodtruckfridays`: Next date is Friday, September 4, 2026.

Checks: Lloyd absent. No poll / engagement bait / meme / vague caption in the Brief. Ozone absent. Stale “canceled today” absent. Hours-only “5 PM–9 PM” absent. Video-growth first. Slot 5 is a concrete schedule development.

`https://api.kckellie.com/api/pre-alpha/home` returned 403 without the public dashboard cookie. Public proof is the site Home and local API (the public dashboard proxies to this API).

## URLs and screenshots

URLs:

- https://benson.kckellie.com/home
- https://benson.kckellie.com/watchlist
- https://benson.kckellie.com/watchlist/984cbe40-df64-4872-9c9e-b788abe4ecb4 (`@theblueroomkc`)
- https://benson.kckellie.com/watchlist/ff41988f-f875-4d01-a3cb-c4d1a4ec437d (`@hookedonkc`)
- https://benson.kckellie.com/signals/2cf5feac-d4b8-4712-a0c0-e71b9f11d8c2 (Melton)
- http://127.0.0.1:4000/api/pre-alpha/home
- http://127.0.0.1:4000/api/watchlist/984cbe40-df64-4872-9c9e-b788abe4ecb4
- http://127.0.0.1:4000/api/calendar/items
- http://127.0.0.1:4000/health

| Surface | File |
|---|---|
| Home Today’s Brief desktop | `docs/ops/screenshots/watchlist-brief-relevance-2026-09-02-home-desktop.png` |
| Home Today’s Brief mobile 390×844 | `docs/ops/screenshots/watchlist-brief-relevance-2026-09-02-home-mobile.png` |
| Watchlist list desktop | `docs/ops/screenshots/watchlist-brief-relevance-2026-09-02-list-desktop.png` |
| Watchlist list mobile | `docs/ops/screenshots/watchlist-brief-relevance-2026-09-02-list-mobile.png` |
| Blue Room What Benson found | `docs/ops/screenshots/watchlist-brief-relevance-2026-09-02-blueroom-desktop.png` |
| Blue Room Event Leads dates | `docs/ops/screenshots/watchlist-brief-relevance-2026-09-02-blueroom-event-leads-desktop.png` |
| Melton Early Signal Date claimed | `docs/ops/screenshots/watchlist-brief-relevance-2026-09-02-melton-signal-desktop.png` |
| `@hookedonkc` first check | `docs/ops/screenshots/watchlist-brief-relevance-2026-09-02-hookedonkc-desktop.png` |

Watchlist and Home loaded successfully on mobile and desktop.

## Discover cards

**Watchlist did not automatically create Discover cards this pass.** `content_items` created after 2026-09-02 07:00Z in this window are newsletter/scraper inventory (kcparent, Amazon, venue pages) — not Watchlist ingest and not from `@hookedonkc` / `@theepitomekc` Instagram URLs.

## Fingerprints

```
status: MATCH
source/api/dashboard/worker: 3a707679000ab567
apiStartedAt: 2026-09-02T07:56:46.847Z
dashboardBuiltAt: 2026-09-02T07:56:51.298Z
workerStartedAt: 2026-09-02T07:56:48.808Z
```

## Remaining limitations

- The Brief gate is deterministic keyword/evidence summarization. It can miss a valid caption that does not match known development patterns, and it can still prefer a dated schedule_change over a richer special when both qualify.
- The BFTF storm-cancel “next date” wording uses a 2026-09-03 floor so an Aug 28 “canceled today” post cannot revive as “canceled today.” That floor is calendar-specific to this repair window.
- `@hookedonkc` vendor row is stored as `event` titled “Sign up and secure your spot now!” Watchlist activity still shows that title. Today’s Brief will not show that caption; if it ever wins ranking it would say vendor spaces at $50 for Sept 18.
- Blue Room `originalSummary` still contains wrong-date research prose in audit metadata (intentional).
- Cross-source R&B festival (stashhouse vs epitomekc) remains duplicated. The Lloyd poll is skipped; the stashhouse festival lead is kept.
- hookedonkc roundup research still includes “couldn’t locate” language on some leads (Original Sin / THE CON). Structured dates on those cards are 2026-09-19. That is first-check research quality, not a Brief slot.
- Dashboard was not rebuilt this pass.

Today’s Brief on this deploy does **not** occupy a slot with low-information engagement content. The fifth line is a concrete, currently valid schedule development. If no such development exists later, the Brief will run with fewer than five lines rather than filling with bait.

## Commit hash and branch

Branch: `release/scout-expansion-2026-07-25`

Implementation commit SHA: `4664ce26188b91215719121d6f2770cb7fb9fe30` (`4664ce2`).

## Clean-tree and remote-match confirmation

Recorded after push in the follow-up docs commit.
