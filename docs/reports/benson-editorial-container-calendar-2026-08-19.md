# Editorial / roundup parent pages vs child events (2026-08-19)

Scoped intake + calendar-projection fix. Discover ranking, trusted-creator logic, Alexa, Cloudflare, and AWS were not changed.

Live parent titles that were being projected as calendar events:

- “Where to Eat, Shop, Play, and Spend a Day in 20 KC Metro Neighborhoods”
- “Spend a Day in Parkville: Where to Eat, Shop, and Explore”
- “Family Shows in Kansas City | Schedule 2026–2027”
- “Events in Overland Park — Downtown OP”

These are container pages (editorial guides, listing hubs, multi-event schedules), not single events.

---

## Problem

Benson was creating `creator_calendar_items` whose **event title was the article / schedule / hub title**. Neighborhood guides with no showtimes became dated calendar rows. A 12-show theater schedule became one repeating “Family Shows in Kansas City | Schedule 2026–2027” item. An Overland Park events hub became one “Events in Overland Park” event, often at midnight.

Operator-facing symptom: Calendar showed source-page headlines instead of the concrete shows, markets, and performances on those pages.

---

## Root cause

Three interacting mistakes, not a ranking bug.

### 1. Container pages were classified as one official event

`scoreEventOccurrenceSignals()` looks at the **whole page**. A hub/schedule with:

- the word “events” or “shows”
- several dates
- venues
- “get tickets”

scores ≥3 signal families (`dated` + `venue` + `tickets` + `lexicon`) and sets `isEventOccurrence = true`.

That is correct for a **single festival item page** (`/events-1/panda-fest`). It is wrong for `/events`, a 2026–2027 family-show schedule, or “Events in Overland Park — Downtown OP”.

### 2. Ask Benson then collapsed every child into the parent title

In `collect-from-link.ts`, when `officialEventOccurrence` was true:

```ts
extraction.opportunities = [officialOpp]; // or first extracted row only
```

JSON-LD Events and LLM child rows were discarded. `buildFallbackEventOpportunity()` named the row after `pageTitle` (the article/schedule). The first date found on the page was attached to that parent title — including date-only / midnight parser output.

### 3. Calendar eligibility treated the parent as an event

`inventoryEventIdentity()` matches `\bevents?\b` in the title. “Events in Overland Park…” therefore had event identity.

`isEditorialArticleItem()` only caught a narrow headline class (`where to eat` at start, Pitch columns, `Drink This Now`). It missed:

- “Spend a Day in Parkville: Where to Eat, Shop, and Explore” (colon, no question mark)
- “Family Shows … | Schedule 2026–2027”
- “Events in Overland Park — Downtown OP”

`calendarStartAtFromDateTime()` / `Date.parse` can yield `00:00` / UTC midnight when a page has a year range or a date with no clock. That midnight value was treated as evidence the **parent article** was an event.

Projection (`ensureCalendarInventoryProjections`) only upserts newly eligible candidates. It does **not** retract suggested rows that later fail eligibility. Bad parents stayed on Calendar until an explicit repair.

---

## Corrected route

Parent-page vs child-event is decided **before** official-occurrence collapse and **before** calendar projection.

### Container detection (`classifyEditorialContainer`)

Not title-only. Evidence includes:

| Signal | Meaning |
| --- | --- |
| Container title / URL | “events in…”, “things to do…”, “where to eat/shop/play…”, “spend a day in…”, “guide to…”, “schedule 2026–2027”, `/events`, `/schedule` |
| JSON-LD graph | ≥2 `Event` / `TheaterEvent` / `Festival` nodes, or `Article` / `NewsArticle` / `CollectionPage` / `ItemList` |
| Dated blocks | Distinct month+day mentions on the page (a 12-show schedule vs one festival range) |
| Extracted entity count | ≥2 child titles that are not the parent headline |
| Embedded Event | One JSON-LD Event whose **name ≠ article title** inside an editorial wrapper |

Kinds: `editorial_article` | `roundup` | `listing_hub` | `destination_guide` | `multi_event_schedule`.

`parentRepresentsSingleEvent` stays true only for a real single occurrence (event item path, ≤1 Event node, ≤2 date mentions, no container title). That is the Panda Fest / City Fest path from 2026-08-15. It is **not** widened.

If the page is a container and the parent is not itself one event:

- `officialEventOccurrence` is forced **false** (no child collapse)
- children are decomposed
- parent calendar eligibility is **false**

### Child extraction

1. Parse JSON-LD Event nodes (`jsonld-events.ts`) — no LLM required for schema.org Events.
2. Merge with LLM extraction (`mergeExtractedOpportunities` — official/JSON-LD URL wins on the same title+date+venue).
3. `decomposeEditorialOpportunities`:
   - drop rows whose title is the parent article/schedule
   - keep children with a **concrete calendar date** (not year-only / `2026-2027`)
   - attach `parentArticleUrl`, `publisher`, child `sourceUrl` when present
4. If there are **no** dated children (Parkville-style guide): keep one undated discovery/reference row. Do **not** invent midnight. Do **not** project to `creator_calendar_items`.

LLM prompt for container pages: do not emit the parent title as an event; one row per dated performance; empty list for guides without showtimes.

### Calendar projection guard

`isCalendarParentContainerItem()` + `evaluateInventoryCalendarEligibility()`:

- `metadata.calendarEligible === false` → excluded
- `metadata.editorialContainer === true` → excluded unless `parentRepresentsSingleEvent`
- classifier on title/source/summary → `detail: 'editorial_container'`
- container titles are not event identity (`inventoryEventIdentity` returns false)
- `calendarSuggestionIsDisplayable()` hides leftover suggested rows at read time (Calendar + voice weekend-calendar)

Weekend Things To Do uses the same container-title gate so a schedule headline cannot be a weekend pick.

Midnight / date-only on a **child** with a real day (all-day market) remains allowed. Midnight / year-range on a **parent article** is not event evidence (`isFallbackMidnightDate` / `isInventedArticleDate`).

### Provenance

| Field | Role |
| --- | --- |
| `sourceUrl` | Child official/detail URL when present, else parent page |
| `metadata.parentArticleUrl` / `listingSourceUrl` | Parent article / hub URL (View source still works) |
| `metadata.publisher` | Host/source |
| `metadata.calendarEligible` | Explicit projection stamp |
| `metadata.editorialContainer` | Parent discovery row only |

Dedupe is unchanged: `findMatchingUserOpportunity` / `dedupePopulationCandidates` / stronger verification. A roundup child and an official event page with the same title+day+venue merge; the stronger source URL wins.

---

## Behavior matrix

| Page | Parent calendar | Children |
| --- | --- | --- |
| Neighborhood guide, no showtimes (Parkville) | No | None; parent retained as undated discovery |
| “Events in Overland Park” hub with dated cards | No | One candidate per dated event |
| Theater/family-show schedule (12 performances) | No | Up to 12 dated shows |
| Genuine single festival item page (Panda Fest) | Yes — one event | Not decomposed |
| Editorial wrapper + one embedded Event JSON-LD | No | The embedded event survives with its own title/date/URL |
| Parser midnight / year range on an article | No | Not used as parent event evidence |
| Same show on roundup + official page | — | One child after existing dedupe |

---

## Files changed

| Path | Change |
| --- | --- |
| `services/core/src/ask-benson/editorial-container.ts` | **New.** Classifier, child eligibility, decompose, midnight/year-range guards, provenance |
| `services/core/src/ask-benson/jsonld-events.ts` | **New.** schema.org Event / ItemList / @graph extraction |
| `services/core/src/ask-benson/editorial-roundup.ts` | Broader `isEditorialRoundupSource` via classifier |
| `services/core/src/ask-benson/event-occurrence.ts` | Container pages are not `isEventOccurrence` |
| `services/core/src/ask-benson/collect-from-link.ts` | Classify → merge JSON-LD → decompose → do not collapse containers; stamp metadata |
| `services/core/src/ask-benson/scrape-listing.ts` | Same decompose + parent stamp on listing scrape |
| `services/core/src/ask-benson/listing-extract.ts` | Optional provenance fields; container LLM prompt; `parentArticleUrl` on listing provenance |
| `services/core/src/ask-benson/url-intake-dedupe.ts` | Listing-hub / schedule containers count as multi-event source pages |
| `services/core/src/creator-calendar/population/eligibility.ts` | `isCalendarParentContainerItem`; displayable hide; container titles ≠ event identity |
| `services/core/src/creator-calendar/weekend-things-to-do.ts` | Container titles excluded |
| `services/core/src/scripts/repair-parent-article-calendar.ts` | **New.** Narrow audit/repair of existing parent rows |

Not changed: Discover ranking, partnership/trusted-creator routing (`isEditorialRoundupUrl` only), Alexa, Cloudflare, AWS.

---

## Tests

```
pnpm exec tsx --test \
  src/ask-benson/editorial-container.test.ts \
  src/ask-benson/jsonld-events.test.ts \
  src/ask-benson/event-occurrence.test.ts \
  src/ask-benson/editorial-roundup.test.ts \
  src/creator-calendar/population/eligibility.test.ts
```

**40 passed**, 0 failed.

| Case | Assertion |
| --- | --- |
| 1. Parkville / no dated events | Container; parent not calendar-eligible; `eventDate` cleared |
| 2. Events in Overland Park | Parent not an event; 3 dated children with `parentArticleUrl` |
| 3. Family-show schedule | `multi_event_schedule`; 4 performances; schedule title dropped; `2026-2027` is not a child date |
| 4. Panda Fest item page | `parentRepresentsSingleEvent`; still calendar-eligible |
| 5. NewsArticle + one Event JSON-LD | Child “Wine Down Sundays” kept; article title dropped; child URL + parent URL both set |
| 6. Midnight / `2026` / `2026-2027` | `isFallbackMidnightDate`; neighborhood article not projected |
| 7. Roundup + official duplicate | `mergeExtractedOpportunities` → 1 row, official `sourceUrl` |
| Occurrence | Schedule page `isEventOccurrence === false`; festival item page still true |

---

## Repair of existing records (local DB, 2026-08-19)

```
pnpm exec tsx src/scripts/repair-parent-article-calendar.ts
```

Scope: content/calendar rows matching the four live titles (and close `ilike` variants). **Does not delete** child events. **Does not write dismissal fingerprints** (would be too broad for “Events in Overland Park”). Suggested/tentative calendar rows are `cancelled` with a parent-container note.

| | Count |
| --- | --- |
| Content items scanned / stamped | **25 / 25** |
| Calendar suggestions scanned / cancelled | **24 / 24** |

Stamp on `content_items`: `editorialContainer: true`, `calendarEligible: false`, `eventStartsAt: null`, `parentArticleRepair: '2026-08-19'`. Discovery provenance (topic, source URL, metadata) kept.

### Content before → after (representative)

| id | Title | Before `eventStartsAt` | After |
| --- | --- | --- | --- |
| `438485d3-11ef-4077-a71e-e8f9cb2a7a22` | Events in Overland Park — Downtown OP | `2026-08-14T00:00:00.000Z` (midnight) | `null`, not calendar-eligible |
| `92169d77-dba1-447c-9ad4-8b008bc7d02a` | Events in Overland Park — Downtown OP | `2026-10-09T21:00:00.000Z` | `null`, not calendar-eligible |
| `4256ab24-4d51-497e-b7fb-979f31adb61c` | Where to Eat, Shop, Play… 20 KC Metro Neighborhoods | `2026-08-21T05:00:00.000Z` | `null`, not calendar-eligible |
| `572963d8-c3c0-46fc-acf4-f3dfbad3bf4c` | Spend a Day in Parkville: Where to Eat, Shop, and Explore | `2026-08-21T05:00:00.000Z` | `null`, not calendar-eligible |
| `4763d5c9-b442-4786-b315-7414800ff03b` | Family Shows in Kansas City \| Schedule 2026–2027 | `2026-08-20T21:30:00.000Z` | `null`, not calendar-eligible |

Many duplicate **Family Shows** and **Overland Park** content rows existed (re-ingest of the same parent). All matching parents were stamped; none were deleted.

### Calendar before → after (representative)

| id | Title | Before | After |
| --- | --- | --- | --- |
| `8f53dfcc-5c39-4cd1-9720-95cb4055896b` | Events in Overland Park — Downtown OP | suggested `2026-08-14T00:00:00Z` | cancelled |
| `ff64a9cd-1b79-4398-97d9-976cd2b6b2f3` | Events in Overland Park — Downtown OP | suggested `2026-10-09T21:00:00Z` | cancelled |
| `8f61fbcb-085d-4b76-a1f5-8239813d3f46` | Spend a Day in Parkville… | suggested `2026-08-21T05:00:00Z` | cancelled |
| `d4b3583c-50ab-4bed-af57-aee0d3cfc088` | Family Shows… Schedule 2026–2027 | suggested `2026-08-20T21:30:00Z` | cancelled |

~19 additional **Family Shows** suggested copies (late July–late August startAts) were cancelled the same way. No Neighborhoods-guide calendar row was in the suggested/tentative window at repair time; the content stamp still blocks re-projection.

Child performances (Lion King, Jazz in the Park, etc.) were **not** in the parent-title match set and were left alone.

---

## Ingest going forward (Ask Benson / listing scrape)

```
fetch page
  → JSON-LD Event graph
  → classifyEditorialContainer (url, title, schema, dates, child titles)
  → if container: do not collapse to officialOpp
  → merge JSON-LD children + LLM rows
  → decompose (drop parent title; keep dated children; or undated parent discovery)
  → persist with parentArticleUrl + calendarEligible
  → projection reads calendarEligible / isCalendarParentContainerItem
```

Re-ingest of a schedule URL can now create the dated shows. Repair did **not** re-fetch those pages; it only suppressed the bad parents. Extracting the 12 family shows from the live schedule URL is a follow-up ingest, not part of this repair.

---

## Out of scope / not done

- Discover ranking and Today lane redesign
- Trusted-creator / partnership URL routing (`isEditorialRoundupUrl` unchanged)
- Alexa, Cloudflare, AWS
- Automatic re-scrape of the four parent URLs to populate children — **attempted 2026-08-19**; see [benson-editorial-container-reingest-2026-08-19.md](./benson-editorial-container-reingest-2026-08-19.md). Classifier passed; child persist/extraction failed; no further code changes.
- Retracting **confirmed** calendar rows (repair only touched `suggested` / `tentative`)

---

## How to re-run repair

```
cd services/core
pnpm exec tsx src/scripts/repair-parent-article-calendar.ts
```

Idempotent on already-stamped rows (re-stamps the same metadata; already-cancelled calendar rows are skipped by the `suggested`/`tentative` filter).
