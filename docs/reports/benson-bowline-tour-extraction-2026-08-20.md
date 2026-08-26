# Bowline Brothers tour-listing extraction defect

Date: 2026-08-20  
Scope: venue-as-title child extraction for `[Benson] Shows — The Bowline Brothers` (`7fb75a94-1f95-4e5a-9b41-2cc012a3ea80`).  
Listing URL: `https://www.bowlinebrothers.com/shows?utm_source=openai`

**Calendar was not re-projected. The 53 existing suggested Calendar rows were not cancelled or updated.**  
Frozen surfaces (Calendar eligibility guards, listing_chrome, venue_as_title, T-Mobile, Downtown OP, Family Shows, OPCC / HPNA / CommUNITY Fest, Alexa / Discover / Today / ranking) were not edited.

---

## Problem statement

There were **53 active suggested Calendar rows** from this source with titles like:

- Tin Roof Delray Beach
- Tin Roof Fort Lauderdale
- Tin Roof Indianapolis
- Limitless Brewing

The Calendar `venue_as_title` guard could not reject them because underlying `content_items` had:

- `venue` = null (in `raw_payload.extracted`)
- `locationName` = null
- `businessName` = null

The parser stored the **venue string as the event title** and lost venue/location semantics. Dates and times on the cards were already correct.

Prior audit (`benson-calendar-chrome-venue-cleanup-2026-08-20.md`) confirmed: `isVenueAsTitleContainerChild` requires title ≡ a place key; with all place fields null, Bowline rows still pass eligibility as `ok: true`.

---

## Investigation first — live page structure

### Parent page

| Field | Live value |
| --- | --- |
| URL path | `/shows` (Squarespace artist tour page) |
| Document title | `Shows — The Bowline Brothers` (HTML entity `&mdash;`) |
| JSON-LD | `@type: WebSite`, `name: "The Bowline Brothers"` — **no Event objects** |
| Container classification | `multi_event_schedule`, `isContainer: true`, `datedMentionCount: 170` |

The parent establishes performer identity via page title and Website JSON-LD. It does **not** provide per-card show titles.

### Card shape (Squarespace eventlist)

Each child is an `<article class="eventlist-event">` with:

```html
<h1 class="eventlist-title"><a href="/shows/tin-roof-delray">Tin Roof Delray Beach</a></h1>
<time class="event-date">Sep 3 to Sep 4</time>
<time datetime="2026-09-03">Thu, Sep 3, 2026</time>
<time datetime="2026-09-03T22:00:00">10:00 PM</time>
...
Google Calendar ICS View Event
```

There is **no** separate event/show title and **no** location class or address block. City appears only as a suffix inside the venue H1 when the venue name includes it (e.g. “Tin Roof Delray Beach”, “Tin Roof Kansas City”). Venues like “Limitless Brewing” or “The Levee” carry **no city on the card**.

Plain-text card example:

```
Sep 3 to Sep 4 Tin Roof Delray Beach Thu, Sep 3, 2026 10:00 PM Fri, Sep 4, 2026 2:00 AM Google Calendar ICS View Event
```

Live page: **64** eventlist H1 headings; extraction produced **64** blocks, finalized to **40** children (dedupe cap + same-day collapse).

---

## Five representative traces (before fix)

Path for all broken rows: `parseWeekdayDateCard` / `parseDateFirstCard` → `titleFromPrefix` / `splitTitleAndVenue` → venue string becomes `title`, `venueFromSuffix` returns null (no suffix after times).

| Show | Raw H1 / card title | Visible date/time | Structured candidate (pre-fix) | Persisted `raw_payload.extracted` (pre-fix) |
| --- | --- | --- | --- | --- |
| Tin Roof Delray Beach | `Tin Roof Delray Beach` | Thu Sep 3, 2026 10:00 PM | title=`Tin Roof Delray Beach`, venue=null | title=`Tin Roof Delray Beach`, venue/location/businessName=null, `eventDate=2026-09-03T22:00:00`, `startTime=22:00:00` |
| Tin Roof Fort Lauderdale | `Tin Roof Fort Lauderdale` | Fri Sep 5, 2026 10:00 PM | title=`Tin Roof Fort Lauderdale`, venue=null | same pattern, `eventDate=2026-09-05T22:00:00` |
| Tin Roof Indianapolis | `Tin Roof Indianapolis` | Sat Sep 12, 2026 9:00 PM | title=`Tin Roof Indianapolis`, venue=null | same pattern |
| Limitless Brewing | `Limitless Brewing` | Thu Sep 18, 2026 8:00 PM | title=`Limitless Brewing`, venue=null | same pattern; **no city on card** |
| Tin Roof Kansas City | `Tin Roof Kansas City` | Fri Oct 2, 2026 9:00 PM | title=`Tin Roof Kansas City`, venue=null (most rows) | one older row already had performer title + venue from a prior partial path; majority were venue-as-title |

Example persisted row before fix (`5389af35-151c-4e02-b5d2-77ff978c3c50`):

- `topic`: `Tin Roof Delray Beach`
- `locationName`: null
- `raw_payload.extracted.title`: `Tin Roof Delray Beach`
- `raw_payload.extracted.venue`: null
- `raw_payload.extracted.eventDate`: `2026-09-03T22:00:00`
- `raw_payload.extracted.startTime`: `22:00:00`

**Where venue text became title:** `container-event-blocks.ts` weekday/date-first card parsers set `title` from the card prefix (the H1 text) and only populate `venue` from text *after* the datetime block via `venueFromSuffix`. Squarespace cards put the venue **before** the datetime, so suffix parsing finds nothing.

**Where venue/city were lost:** not in Calendar projection or persist — the structured opportunity never received `venue` / `location` fields at extraction time.

---

## Fix (generic tour / venue-only child promotion)

No Bowline Brothers event names or venue names were hardcoded.

File: `services/core/src/ask-benson/container-event-blocks.ts`

### 1. Gate on artist tour URL path

`isArtistTourListingUrl` matches paths ending in `/shows`, `/show`, `/tour`, `/tour-dates`, `/concerts`, `/gigs`.

- Bowline `/shows` → **matches**
- Downtown OP `/events` → **does not match**
- Family Shows `/family` → **does not match**

### 2. Recover performer from parent page (do not invent)

`resolveTourPerformer`:

- `tourPerformerFromPageTitle` — patterns like `Shows — The Bowline Brothers` or reverse
- `tourPerformerFromWebsiteJsonLd` — Website / MusicGroup / MusicArtist name when present

Returns null for civic/editorial hub titles (`looksLikeEditorialContainerTitle`).

Live: performer = **`The Bowline Brothers`** from page title.

### 3. Promote venue-only children to performances

`promoteVenueOnlyTourChild` runs after `mergeContainerBlocks` when performer is known:

| Condition | Action |
| --- | --- |
| Child already has `venue` | unchanged |
| Title matches performer | unchanged |
| Title contains ` at ` (real event title) | unchanged |
| Chrome / editorial container title | unchanged |
| Otherwise (venue-only H1) | `venue = title`, `title = "{performer} at {venue}"`, `location = cityFromVenueLabel(venue) ?? venue` |

`stripTourChromeFromVenueLabel` removes listing chrome glued onto the first card (`Upcoming Shows Aug 20 …`).

### 4. City recovery from venue label (no new geography system)

`cityFromVenueLabel` extracts trailing locality from venue text when evidence supports it:

- `Tin Roof Delray Beach` → `Delray Beach`
- `Tin Roof Fort Lauderdale` → `Fort Lauderdale`
- `Tin Roof Kansas City` → `Kansas City`
- `Limitless Brewing` → **null** (brewing = venue-type token, not a city)
- `St Elizabeth's BBQ Fest` → **null** (`fest` excluded)

Uses existing location fields consumed by Calendar `wrong_city` / `isKcMetroLocation` / `isOutOfMarketLocation` in `url-geo.ts` and `eligibility.ts`. No state abbreviations are invented when absent from the card.

### 5. Dates / times

Card `<time datetime="…">` clocks are preserved. No midnight or invented clocks added.

---

## Tests added

File: `services/core/src/ask-benson/container-event-blocks.test.ts` — suite **`artist tour venue-only child promotion`** (8 cases).

| # | Case | Result |
| --- | --- | --- |
| 1 | Artist tour page + venue-only child | title=`The Bowline Brothers at Tin Roof Delray Beach`, venue populated, location=`Delray Beach`, real time preserved |
| 2 | Two venues on different dates | distinct children (Delray vs Fort Lauderdale) |
| 3 | Out-of-market location preserved | Indianapolis venue + location for existing wrong_city logic |
| 4 | Kansas City-area venue | `recordBar Kansas City` / `Tin Roof Kansas City` survives with location=`Kansas City` |
| 5 | Real child event title | `Hometown Reunion Show` at Knuckleheads **not** rewritten to performer format |
| 6 | Downtown OP / Family Shows | unchanged (no `Bowline Brothers at …` titles) |
| 7 | `cityFromVenueLabel` edge cases | Brewing/Fest tokens rejected |
| 8 | Upcoming-shows chrome on first card | stripped; title=`The Bowline Brothers at Limitless Brewing` |

Run: `pnpm exec tsx --test src/ask-benson/container-event-blocks.test.ts` → **14/14 pass** (including prior editorial container suite).

Related suites still green: `listing-showtime.test.ts`, `event-occurrence.test.ts`, `eligibility.test.ts`.

---

## Live re-ingest (Bowline only)

Path: `scrapeListingUrl` on source `7fb75a94-…`, campaign `3b85115b-548b-4d91-8963-e41a55087a6b`, `webResearchLimit=0`.

| Metric | Value |
| --- | --- |
| Children extracted | **40** |
| Persist outcomes | **27 created**, **13 updated** |
| Content rows before | **80** |
| Content rows after | **107** |
| New performer-format rows | **27** (`The Bowline Brothers at …`) |
| New rows with venue recovered | **27 / 27** |
| New rows with location recovered | **27 / 27** |
| Old venue-as-title rows (no place fields) | **39** (kept; identity did not match new titles) |

### Representative before → after

| Venue | Before title | After title | After venue | After location |
| --- | --- | --- | --- | --- |
| Tin Roof Delray Beach | `Tin Roof Delray Beach` | `The Bowline Brothers at Tin Roof Delray Beach` | `Tin Roof Delray Beach` | `Delray Beach` |
| Tin Roof Fort Lauderdale | `Tin Roof Fort Lauderdale` | `The Bowline Brothers at Tin Roof Fort Lauderdale` | `Tin Roof Fort Lauderdale` | `Fort Lauderdale` |
| Tin Roof Indianapolis | `Tin Roof Indianapolis` | `The Bowline Brothers at Tin Roof Indianapolis` | `Tin Roof Indianapolis` | `Indianapolis` |
| Limitless Brewing | `Upcoming Shows Aug 20 Limitless Brewing` (chrome) | `The Bowline Brothers at Limitless Brewing` | `Limitless Brewing` | `Limitless Brewing` (no city on card) |
| Tin Roof Kansas City | `Tin Roof Kansas City` (most rows) | `The Bowline Brothers at Tin Roof Kansas City` | `Tin Roof Kansas City` | `Kansas City` |

### Geography on new rows (existing helpers)

| Bucket | Count | Notes |
| --- | --- | --- |
| Clearly KC-metro (`isKcMetroLocation`) | **4** | All `Tin Roof Kansas City` |
| Clearly out-of-market (Chicago / Orlando via `CALENDAR_OUT_OF_MARKET_RE` or `isOutOfMarketLocation`) | **3** | Chicago ×2, Orlando ×1 in regex hit set |
| Recovered non-KC city on card | **15** | Delray Beach, Fort Lauderdale, Orlando, Fayetteville, Columbia, Chicago, Indianapolis, Detroit, Cincinnati, … |
| Venue recovered, no city on card | **8** | Limitless Brewing, The Levee, The Brooksider, St Elizabeth's BBQ Fest, … |

### Remaining bad rows

| Check | Count |
| --- | --- |
| Pre-existing venue-like title, no venue/location fields | **39** |
| New rows with venue-like title and no place | **0** |

### Duplicates / collapse during same ingest pass

**13 updated** outcomes correspond to consecutive-night pairs at the same venue (e.g. two Delray nights, two Fort Lauderdale nights) where shared-hub persist identity matched on normalized title + venue + **UTC day** from `eventStartsAt`. Evening showtimes (10:00 PM CDT) land on the next UTC calendar day, so back-to-back local nights can share a UTC day key and the second pass **updates** the first row instead of creating a sibling.

Extraction still emits distinct children per card date; persist identity collapse is a **pre-existing** shared-hub behavior, not introduced by this fix. Not addressed in this task.

Duplicate display titles in ingest item list (same title, different nights) are expected from multi-night runs at one venue.

---

## Calendar status (unchanged)

| Check | Result |
| --- | --- |
| Calendar projection run | **No** |
| Bowline Calendar rows cancelled | **0** |
| Linked Calendar rows | **53** |
| All linked statuses | **suggested** |
| Sample suggested titles still venue-only | `Tin Roof Delray Beach`, `Tin Roof Kansas City`, `Limitless Brewing`, `The Levee`, … |

Calendar still points at pre-fix content rows. A later projection/sync pass can adopt corrected content once old rows are reconciled or cancelled.

---

## Files changed

| File | Change |
| --- | --- |
| `services/core/src/ask-benson/container-event-blocks.ts` | Tour performer resolution, venue-only promotion, city-from-venue-label, chrome strip, hook in `prepareContainerExtraction` |
| `services/core/src/ask-benson/container-event-blocks.test.ts` | 8 new tour-listing fixtures |

**Not changed:** Calendar eligibility guards, `listing_chrome`, `venue_as_title`, `editorial-container` classifier, shared-hub persist identity, Downtown OP / Family Shows sources, T-Mobile, OPCC / HPNA / CommUNITY Fest.

---

## Follow-up (not this task)

1. **Calendar sync** — Project or manually sync from new performer-format content rows; then cancel the 53 venue-titled suggested rows tied to old content ids.
2. **Old content cleanup** — 39 pre-existing venue-as-title content rows remain alongside 27 new corrected rows; dedupe/reconcile by venue + local date when ready.
3. **Multi-night persist identity** — Consider local-day key for shared-hub child match when evening clocks cross UTC midnight (affects Tin Roof two-night runs and similar).
4. **Venue-only no-city cards** — Limitless Brewing, The Levee, The Brooksider have venue but no city on source; Calendar wrong_city may still be ambiguous until enriched elsewhere — do not invent geography.

---

## Summary

Squarespace artist `/shows` pages put the **venue name in the event H1** with no separate show title. Generic tour-listing promotion now titles children as **`{performer} at {venue}`**, fills `venue` / `location` from card evidence, and preserves real card clocks. Bowline re-ingest created **27** corrected content rows; **53** Calendar suggestions and **39** legacy content rows await a later cleanup/projection pass.
