# Benson Public-Event Suggestion Quality Fix — 2026-08-27

## Root cause

Multiple interacting defects (not a single failure mode):

1. **Multi-event archive extraction bypassed** — The Events Calendar (`type-tribe_events`) HTML cards were present on `kcconvention.com/events`, but `extractOpportunitiesFromPage` preferred the LLM path when `isDirectoryListingContent` returned true for calendar chrome. That yielded sparse children, hub `sourceUrl`s, and date-only midnight instants.
2. **Calendar eligibility bypassed creator-value authority** — `evaluateInventoryCalendarEligibility` accepted any dated event-identity row (IIDA “product fair” matched `fair`). Home / Things To Do / Film This used stricter lanes; Calendar did not.
3. **Topic vs extracted title** — Some children persisted `topic = "Events Archive - Kansas City Convention Center"` while `raw_payload.extracted.title` held the real name. Calendar projection used `topic`.
4. **Fake midnight display** — Date-only / Chicago-local `00:00` rows were stored with `allDay=false`, so the dashboard rendered **12:00 AM**.
5. **Stale suggestions** — Mutable calendar upserts did not refresh `startAt` when inventory clocks improved; past/ineligible suggestions lingered until a safe re-eval.

Home Show and Knuckle Noise **were** in inventory historically (under archive titles / hash URLs) but lost ranking/display to IIDA and page-level archive rows.

## Exact files changed

| File | Change |
|------|--------|
| `services/core/src/ask-benson/container-event-blocks.ts` | Tribe-events card extractor, More Info/Buy Tickets delimiters, next-page URL helper, venue guess from archive title |
| `services/core/src/ask-benson/listing-extract.ts` | Prefer structured tribe/container cards before directory/LLM path; hardened fetch UA/timeout |
| `services/core/src/ask-benson/scrape-listing.ts` | Bounded tribe pagination (≤2 extra pages) |
| `services/core/src/ask-benson/editorial-container.ts` | `events archive` title cue; `isPageLevelArchiveTitle` |
| `services/core/src/ask-benson/fixtures/kcconvention-events-archive.html` | Sanitized multi-card fixture |
| `services/core/src/ask-benson/kcconvention-public-event.acceptance.test.ts` | Acceptance coverage |
| `services/core/src/inventory/public-event-eligibility.ts` | **Canonical** public-event eligibility + post-eligibility score components |
| `services/core/src/inventory/normalize.ts` | Prefer extracted title when topic is archive; null-safe `isGenericFallbackWhyItMatters` |
| `services/core/src/inventory/index.ts` | Export public-event API |
| `services/core/src/pre-alpha/home-showroom-lanes.ts` | Ordinary-public language for home/consumer show + boxing |
| `services/core/src/creator-calendar/population/eligibility.ts` | Wire canonical gate; Chicago-midnight → allDay; venue-as-title no longer uses businessName |
| `services/core/src/creator-calendar/population/inventory-temporal-evidence.ts` | Select extracted title |
| `services/core/src/creator-calendar/population/sync.ts` | Refresh mutable suggestion title/startAt/endAt |
| `services/core/src/creator-calendar/weekend-things-to-do.ts` | Shared lane gate + rank after eligibility |
| `services/core/src/scripts/reeval-public-event-suggestions.ts` | Dry-run/apply safe suggestion re-eval |
| `dashboard/app/calendar/calendar-panel.tsx` | Local midnight → date + “Time TBD” |

## Database findings

**Source:** `KC Convention Center Events` (`2bb065c1-9337-475f-a749-889547a9a774`), listing `https://kcconvention.com/events`.

| Event | Finding |
|-------|---------|
| **IIDA** | Multiple `content_items` + calendar suggestions existed with correct titles; `creator_candidate`; date-only → `…T05:00:00Z`. Calendar-eligible under old gate. Now lifecycle/calendar **expired**; fails `narrow_industry_no_audience_value`. |
| **Kansas City Home Show** | Previously persisted as archive `topic` with correct `extracted.title` + 10:00 evidence; calendar row stuck at midnight. After re-ingest + re-eval: content `Kansas City Home Show` @ `2026-08-29T15:00:00Z` (10:00 CT), calendar **suggested** @ `15:00` `allDay=false`. |
| **Knuckle Noise!** | Independently extracted; calendar **suggested** @ `2026-08-29T22:00:00Z` (17:00 CT). One older duplicate remains `allDay=true` (date-only display). |

## Before / after extraction

| | Before | After (live re-ingest) |
|--|--------|-------------------------|
| Children from archive | Sparse LLM subset (often 1–3), hub URLs | **12** tribe cards with detail URLs |
| Home Show | Present under archive title / wrong projection | Title + `10:00:00` startTime |
| Knuckle Noise! | Present but weak projection | Title + `17:00:00` startTime |
| IIDA | Surfaced as suggestion | Not on current list page; residual rows expired / ineligible |
| Re-ingest counts | — | extracted **12**, created **10**, updated **2** |

## Before / after eligibility

| Item | Before | After |
|------|--------|-------|
| IIDA | Calendar OK (dated + “fair”) | `narrow_industry_no_audience_value` — calendar lane false |
| Home Show | Often hidden behind archive title / midnight | Things To Do Weekly **true**; Home Best Move **false**; Film This only with stronger fit |
| Knuckle Noise! | Independently evaluable | Audience sporting signals; calendar + Things To Do eligible when timely |
| Ranking | Projection without usefulness gate | Eligibility first; `rankPublicEventScore` ignores recency/confidence/ingestion order |

## Tests

Deploy gate + focused suites:

- `kcconvention-public-event.acceptance.test.ts` + container/eligibility/weekend suites: **91/91 pass**
- Deploy local precheck suite: **138/138 pass**

## Dry-run cleanup

- Scanned suggested: **939**
- Would expire: **495** (expired / archive / missing content / ineligible)
- Would fix allDay / clocks: **27**
- Protected skipped: **0**
- Focus: all IIDA → expire; archive titles → expire; Home Show retained after venue-as-title fix

## Applied cleanup

- First apply: **495** expired, **27** allDay fixes
- Second apply: **24** startAt refreshes (incl. Home Show → `15:00Z`, Knuckle → `22:00Z`)

## Deployment fingerprint

```
status: MATCH
source/api/dashboard/worker: d22214598c5f9ad3
```

## Live verification

- IIDA calendar rows: **expired** (not actionable)
- Home Show: content + calendar suggested at **10:00 CT** (not midnight)
- Knuckle Noise!: suggested at **5:00 PM CT**
- No new duplicate Home Show content row from re-ingest identity (updated existing)
- Fingerprints **MATCH** after `pnpm benson:deploy-local`

## Remaining limitations / unknowns

- One older Knuckle Noise! suggestion remains as `allDay=true` midnight encoding (date-only UI); harmless duplicate.
- Older archive-titled content rows still exist (not truncated); calendar no longer surfaces them.
- Alexa / Cloudflare / Google export semantics untouched.
- Disk pressure on the host caused one failed dashboard build mid-deploy; cleaned and redeployed successfully.
- Full Discover identity junk (P-014) still deferred.

## Final commit SHA

`351238bcbb6a09539ce29412c5685eb4e0d65b40`