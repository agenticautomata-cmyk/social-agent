# Benson Calendar Trust Correction (2026-09-12)

**Branch:** `release/scout-expansion-2026-07-25`  
**Fingerprint:** `8ef49ca431322cab` (MATCH after `pnpm benson:deploy-local`)  
**Hard bans honored:** no email, Telegram, pitches, forms, billable AI/image gen; Watchlist extractors unchanged.

## Problem

Watchlist extraction repairs were real, but Calendar suggestions still came from permissive `content_items` projection (often OpenAI web-search with `utm_source=openai`). Scout/Watchlist listings did not auto-create calendar rows. Sep 18–20 was noisy; Things To Do ignored `friday=` and only planned the current weekend.

## What shipped

### Phase 1 — Shared junk gates
- Exported shared Discover calendar junk helper `evaluateDiscoverCalendarJunkGates` in `discover-trust.ts` (remote-city headlines, SEO leftovers, fragmentary titles, OpenAI hub URLs, missing source URL).
- Wired into `evaluateInventoryCalendarEligibility`.
- Tightened `calendar_suggestion` in `public-event-eligibility.ts`: `concreteLocal` alone is insufficient for weak scrape/OpenAI rows (`hasStrongCalendarSuggestionEvidence`).
- Strengthened `calendarSuggestionIsDisplayable` (sourceUrl-aware).
- Exempted dated `containerChild` rows that legitimately share a parent hub URL.

### Phase 2 — Clean existing suggested junk
- Projection reconciliation dismisses unprotected `planningStatus=suggested` rows that no longer match eligible candidates.
- Protected confirmed / user-edited / Kellie-owned rows are never mutated.

### Phase 3 — Next-weekend planning
- `computeWeekendThingsToDo(now, fridayOverride?)` uses `weekendWindowFromFriday`.
- `GET /weekend-things-to-do?friday=YYYY-MM-DD` mirrors Weekend List.
- Calendar UI passes Friday when the active day is Fri–Sun.

### Phase 4 — Promote verified Watchlist → Calendar
- New `population/scout-promote.ts`: verified upcoming (~21 days) scout listings with canonical event detail URLs → `content_items` ingest `watchlist_verified` → existing projection creates suggestions.
- Skips Meetup `not_relevant` / quarantine and collection roots.
- Wired after successful Event Listing / DoStuff / Meetup / Eventbrite checks (`reviewOnly` / no auto-outreach).

## Live smoke (Sep 18–20)

| Metric | Before (pre-deploy) | After (MATCH + promote) |
| --- | --- | --- |
| Suggested rows | 46 | 32 |
| `utm_source=openai` | 25 | 12 |
| `kansascity.events` hubs | present | **0** |
| Things To Do `friday=2026-09-18` | Sep 11–13 (ignored) | **Sep 18–20**, count 9 |
| Watchlist verified on Calendar | none | Fantasy Lounge Newbie Night, 18th & Vine jam, Blues KC, etc. |

Remaining openai-tagged rows are mostly Instagram Watchlist leads or real Eventbrite/AXS detail URLs with tracking params — not OpenAI hub scrapes. Industry leftovers (e.g. MECC) and a few news-style titles can still appear; display/eligibility gates removed the Telluride/NanaWall/hub class.

## Tests / deploy

- Focused: eligibility, sync suppress, scout-promote, weekend friday override, discover-trust — **114/114 pass**
- Deploy suite inside `benson:deploy-local` — **256/256 pass**
- `pnpm benson:deployment-status` → **MATCH** `8ef49ca431322cab`

## Non-goals (unchanged)

- No auto Weekend Drop selection
- No auto-pitch / outreach from Calendar or Watchlist promote
- Watchlist extractors (Eventbrite/Wix/OSC/FL/MTH) behavior intact
