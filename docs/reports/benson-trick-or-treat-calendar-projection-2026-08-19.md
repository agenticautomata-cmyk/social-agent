# Trick-or-Treat Calendar projection gap — Downtown OP child (2026-08-19)

Scoped Calendar fix after [editorial-container final cleanup](./benson-editorial-container-final-cleanup-2026-08-19.md). Companion to [editorial-container Calendar](./benson-editorial-container-calendar-2026-08-19.md).

Only `e39847f4-009e-4be4-bdc8-e407a5a998ce` (**Trick-or-Treat Event**, Downtown OP editorial-container child, 2026-10-24 2:00 PM) was missing a `creator_calendar_items` row. Five sibling future Downtown OP children already had active suggested rows.

Classifier, child extraction, shared-hub persist, Ask Benson SHA-256 ids, parent-article suppression, ranking, Discover, Today, Alexa, Cloudflare / AWS, the confirmed Neighborhoods calendar row `546d8013-26e2-4a25-a0dc-07eaba51c501`, and same-day showtime identity were not changed.

Campaign `3b85115b-548b-4d91-8963-e41a55087a6b`.  
Downtown OP source `495e6e57-2cfe-490b-84de-38cfe2b6440e` (`https://www.downtownop.org/events?utm_source=openai`).

---

## Symptom

Editorial-container re-ingest produced 11 structured Downtown OP children, 10 new `containerChild` rows + Farmers Market reconciled, and **6** future `containerChild` rows in the Calendar window `2026-08-19` → `2027-12-31`.

| Future child | content id | Calendar before this fix |
| --- | --- | --- |
| Third Fridays (2026-08-21) | `005f068a-87d1-40a0-8621-a48733961ad3` | suggested `99ab0150` |
| Wellness Wednesdays | `4b193fa1-a34a-4312-8405-d8cf804f169e` | suggested `91e6ed17` |
| Movie Night | `d08348ea-7564-42bd-adbc-7c944fd4fb2e` | suggested `286a5a4f` |
| Harvesting Hope | `5387e436-ae7e-4031-9e65-5a7f2044a4d3` | suggested `5f944c84` |
| Bourbon, Bacon & Brews | `f0709a89-95ca-4f30-a5c4-1d251376783b` | suggested `64d08ebe` |
| **Trick-or-Treat Event** | **`e39847f4-009e-4be4-bdc8-e407a5a998ce`** | **none** |

Past Downtown OP children (Car Show, July Third Fridays, Health Screening, Concerts 8/13) and Farmers Market (Apr 18) were correctly out of the upcoming window.

---

## Investigation (no inference from row absence)

Traced `e39847f4` through the real projection path:

`content_items` load (window + not expired/archived)  
→ `normalizeInventoryItem`  
→ `loadSkippedContentIdsForItems`  
→ `evaluateInventoryCalendarEligibility`  
→ `candidateFromInventory`  
→ `dedupePopulationCandidates`  
→ `loadDismissedFingerprints`  
→ `findExistingForCandidate`  
→ `upsertSuggestion`

Compared against Bourbon, Harvesting Hope, and Movie Night using the inventory load projection (the same column set Calendar uses), not a guessed subset of fields.

### Side-by-side content rows (live, 2026-08-19T16:36Z)

| Field | Trick-or-Treat `e39847f4` | Bourbon `f0709a89` | Harvesting Hope `5387e436` | Movie Night `d08348ea` |
| --- | --- | --- | --- | --- |
| topic | Trick-or-Treat Event | Bourbon, Bacon & Brews | Harvesting Hope | Movie Night |
| eventStartsAt | `2026-10-24T19:00:00.000Z` (Chicago 2:00 PM) | `2026-10-09T21:00:00.000Z` | `2026-10-01T22:30:00.000Z` | `2026-09-12T23:00:00.000Z` |
| eventEndsAt | `2026-10-24T21:00:00.000Z` | `2026-10-10T01:00:00.000Z` | `2026-10-02T01:00:00.000Z` | `2026-09-13T02:00:00.000Z` |
| locationName | `null` | `null` | `null` | Clock Tower Plaza |
| sourceUrl | downtownop.org/events?utm_source=openai | same hub | same hub | same hub |
| sourceExternalId | `…-trick-or-treat-event-2026-10-24-novenue` | `…-bourbon-bacon-brews-2026-10-09-novenue` | `…-harvesting-hope-2026-10-01-novenue` | `…-movie-night-2026-09-12-clock-tower-plaza` |
| type | industry_insight | same | same | same |
| opportunityCategory | Event | Event | Event | Event |
| lifecycleStatus | upcoming | upcoming | upcoming | upcoming |
| creatorValueStatus | creator_candidate | creator_candidate | creator_candidate | creator_candidate |
| calendarEligible | true | true | true | true |
| containerChild | true | true | true | true |
| editorialContainer | unset | unset | unset | unset |
| hook | Events in Overland Park — Downtown OP | same parent document title | same | same |
| tags | `container_card` | `container_card` | `container_card` | `container_card` |

Script for Trick-or-Treat: `Oct 24 Trick-or-Treat Event Saturday, October 24, 2026 2:00 PM 4:00 PM Google Calendar ICS Free community event!`

SQL window inclusion: `eventStartsAt` is inside `2026-08-19T05:00:00Z` … `2027-12-31`. `creatorValueStatus` is not `rejected`/`archived`. `lifecycleStatus` is not `expired`/`archived`.

### Eligibility / identity signals (normalized inventory items)

All four:

| Check | Trick-or-Treat | Siblings |
| --- | --- | --- |
| skipped content id | false | false |
| `isCalendarParentContainerItem` (current code) | **false** (child bypass) | false |
| `classifyEditorialContainer` on hub URL | `listing_hub`, `isContainer=true`, evidence `listing_index_path` | same |
| `inventoryEventIdentity` | true (`Event` in title) | true |
| `isEditorialArticleItem` | false | false |
| `isPrivateOrMemberOnly` | false | false |
| `isSeasonallyStaleTitle` | false (Halloween is not in seasonal-title rules) | false |
| `isAudienceFreshContent` | true, ageDays 0 | true |
| `evaluateInventoryCalendarEligibility` | **`{ ok: true }`** | `{ ok: true }` |

Skip-match identity for Trick-or-Treat after Calendar Chicago-day overlay:

```
key: 92b497007eca82f6cbaeac09c70c0584
tokens: ["trick", "or", "treat"]   // "event" stripped as title noise
day: 2026-10-24
city: ""
venue: ""
```

Same-day Calendar neighbors that are **not** this event: Halloween Train (`2026-10-24T15:00:00Z`), The Snowy Day (`2026-10-24T19:00:00Z`, Family Shows). Identity match requires same Chicago day **and** same city **and** (same key, token containment, or ≥3 shared tokens). Empty city vs `kansas city` does not match. Titles do not share three tokens with Trick-or-Treat.

### Pipeline trace for `e39847f4` (after child bypass, before re-project)

| Stage | Result |
| --- | --- |
| In projection window | yes |
| Skip list | not skipped |
| Eligibility | **ok** |
| Candidate after eligibility | present, count 1 |
| `dedupePopulationCandidates` | **kept as itself**; `mergedSourceIds` null; not absorbed into another candidate |
| Dismissed fingerprints / dismissed Calendar rows | none |
| `findExistingForCandidate` (idempotency, occurrence fingerprint, skip identity) | **no match** |
| `creator_calendar_items` same title / `%trick-or-treat%` / this `sourceRecordId` | **empty** |
| Global idempotency key `skip:92b49700…` | **empty** (no unique-key collision hiding a row outside the window) |

Not a legitimate reconcile. The record was simply never inserted.

---

## Proven drop branch (why it was missing)

Historical Calendar passes for this hub (`ensureCalendarInventoryProjections` ~2026-08-19T14:37Z created the five sibling rows; ~14:45Z created 0 / updated 363) ran `isCalendarParentContainerItem` **without** treating `metadata.containerChild === true` as “not a parent.”

Shared-hub persist stores each child with `sourceUrl` = the listing hub (`https://www.downtownop.org/events?utm_source=openai`). `isEventIndexPath` uses pathname `/events`, so `classifyEditorialContainer` returns `kind: listing_hub`, `isContainer: true`.

```
evaluateInventoryCalendarEligibility
  → isCalendarParentContainerItem
      calendarEligible === false?  no
      parentRepresentsSingleEvent? no
      editorialContainer === true? no
      classifyEditorialContainer({ url: hub /events, title: child title })
        → isContainer && !parentRepresentsSingleEvent → true
  → { ok: false, reason: "excluded", detail: "editorial_container" }
```

The candidate was **never built**. Dedupe, dismissed lookup, and upsert never saw it.

Sibling rows exist because they were inserted on the 14:37 pass (`createdAt` 14:37:12–16Z, `populationSource` `scrape_listing`). Trick-or-Treat had no prior row, so later passes that still classified hub-URL children as parents had nothing to update.

This is not title-specific. Any dated `containerChild` whose `sourceUrl` is an `/events` (or `/calendar` / `/schedule`) index path hits the same branch unless the child bypass runs first.

---

## Fix

Smallest generic correction, already in `isCalendarParentContainerItem`:

```173:191:services/core/src/creator-calendar/population/eligibility.ts
export function isCalendarParentContainerItem(
  item: Pick<InventoryItem, 'title' | 'sourceUrl' | 'summary' | 'metadata' | 'eventDate' | 'category' | 'ingest' | 'sourceName'>,
): boolean {
  const meta = item.metadata ?? {};
  if (meta.calendarEligible === false) return true;
  // Dated extracted children keep the hub listing URL as sourceUrl (shared-hub
  // persist). Re-classifying that URL as a listing hub would drop every child.
  if (meta.containerChild === true) return false;
  if (meta.parentRepresentsSingleEvent === true) return false;
  if (meta.editorialContainer === true) return true;
  const classified = classifyEditorialContainer({
    url: item.sourceUrl,
    title: item.title,
    pageText: item.summary,
  });
  if (classified.isContainer && !classified.parentRepresentsSingleEvent) return true;
  if (looksLikeEditorialContainerTitle(item.title)) return true;
  return false;
}
```

Constraints honored:

- No hardcoded title `Trick-or-Treat Event`
- No hardcoded content id `e39847f4`
- Parent hub rows still excluded (`editorialContainer: true` and/or `calendarEligible: false`, or classifier + container title)
- Suppressed children still excluded (`containerChild` + `calendarEligible: false` → first line treats them as parent-ineligible)
- Past-event exclusion unchanged
- Dedupe unchanged
- Quality filters (wrong city, private, editorial article, freshness, event identity) unchanged

This pass did **not** special-case Halloween. Seasonal title rules still do not include trick-or-treat; a dated October child in August is eligible via `eventDate`, same as Harvesting Hope.

---

## Tests

`services/core/src/creator-calendar/population/eligibility.test.ts`

1. Existing: dated hub-listing child with shared `/events` URL (Harvesting Hope fixture, neighborhood Overland Park).
2. **Added:** dated hub-listing child with **no venue / neighborhood / locationName**, metro only on `sourceName` (`Events in Overland Park — Downtown OP`), title/summary matching the live Trick-or-Treat card. Asserts `isCalendarParentContainerItem === false` and eligibility `ok`.
3. Existing: parent hub row still rejected; suppressed `containerChild` + `calendarEligible: false` still `editorial_container`.

Focused run:

```
cd services/core
pnpm exec tsx --test \
  src/creator-calendar/population/eligibility.test.ts \
  src/creator-calendar/population/sync.test.ts \
  src/creator-calendar/population/projection-freshness.test.ts \
  src/creator-calendar/population/calendar-category.test.ts
```

**46 passed**, 0 failed.

---

## Projection proof

`ensureCalendarInventoryProjections('2026-08-19T05:00:00.000Z', '2027-12-31T23:59:59.000Z')` at **2026-08-19T16:4xZ**.

| | |
| --- | --- |
| created | 94 |
| updated | 366 |
| existingPreserved | 0 |
| duplicates | 69 |

`created: 94` is the first full-window pass after hub children with `containerChild=true` are allowed through eligibility. Those are other dated listing-hub children previously dropped by the same URL-as-parent branch, not a Trick-or-Treat duplicate fan-out.

### Trick-or-Treat final Calendar row

| | |
| --- | --- |
| creator_calendar_items id | `34818bfe-c429-4bf7-9249-45a62be558b2` |
| title | Trick-or-Treat Event |
| startAt | `2026-10-24T19:00:00.000Z` |
| planningStatus | **suggested** |
| sourceRecordId | `e39847f4-009e-4be4-bdc8-e407a5a998ce` |

`ilike title '%trick-or-treat%'` returns **this one row only**.

### Sibling Downtown OP (unchanged identities)

| Title | sourceRecordId | calendar id | status | startAt |
| --- | --- | --- | --- | --- |
| Third Fridays | `005f068a` | `99ab0150` | suggested | 2026-08-21T22:00:00Z |
| Wellness Wednesdays | `4b193fa1` | `91e6ed17` | suggested | 2026-09-02T23:30:00Z |
| Movie Night | `d08348ea` | `286a5a4f` | suggested | 2026-09-12T23:00:00Z |
| Harvesting Hope | `5387e436` | `5f944c84` | suggested | 2026-10-01T22:30:00Z |
| Bourbon, Bacon & Brews | `f0709a89` | `64d08ebe` | suggested | 2026-10-09T21:00:00Z |

### Parent title

**Events in Overland Park — Downtown OP:** 0 suggested / tentative / confirmed, 5 cancelled. Not re-created.

Confirmed Neighborhoods row `546d8013` was not read as part of this projection’s mutation set and was not cancelled.

---

## What this did not change

- `classifyEditorialContainer`
- container-event-block extraction
- shared-hub persist (title + UTC day + venue; same-day showtimes still collapse)
- Ask Benson SHA-256 external ids
- ranking, Discover, Today, Alexa
- Cloudflare / AWS
- Dedupe (`calendarIdentitiesMatch` / `dedupePopulationCandidates`)

---

## Files

| Path | Change |
| --- | --- |
| `services/core/src/creator-calendar/population/eligibility.ts` | Generic `containerChild === true` bypass so hub `sourceUrl` is not reclassified as a parent (required for any such child, including Trick-or-Treat) |
| `services/core/src/creator-calendar/population/eligibility.test.ts` | Hub-child with venue; hub-child with **no** venue (live Trick-or-Treat shape); parent + suppressed-child still rejected |

---

## How to re-check

```
cd services/core
pnpm exec tsx --test src/creator-calendar/population/eligibility.test.ts
```

Those tests do not write Calendar rows. Live presence: `creator_calendar_items.source_record_id = e39847f4-009e-4be4-bdc8-e407a5a998ce` should be one suggested row dated 2026-10-24 2:00 PM Chicago.
