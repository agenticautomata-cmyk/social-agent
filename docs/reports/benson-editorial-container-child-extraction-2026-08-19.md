# Editorial-container child extraction — hub/schedule pages (2026-08-19)

Scoped extraction fix after [shared-hub persist](./benson-container-child-hub-persist-2026-08-19.md). Companion to [editorial-container re-ingest](./benson-editorial-container-reingest-2026-08-19.md).

Persistence was already ready for multiple child events that share one listing URL. Extraction still returned **one** opportunity from pages that clearly contain many dated cards.

Classifier, Calendar eligibility, Ask Benson SHA-256 ids, shared-hub persist identity, ranking, Discover, Today, Alexa, Cloudflare, AWS, and the confirmed Neighborhoods calendar row were not changed. Event names for Downtown OP / Family Shows are **not** hardcoded in the parser.

Live proof: re-ingest **only**

- `https://www.downtownop.org/events?utm_source=openai`
- `https://kc.events/family?utm_source=openai`

at **2026-08-19T14:02Z** via `scrapeListingUrl`. Neighborhoods and Parkville were not re-ingested.

---

## Problem

After the persist fix, Downtown OP re-ingest still reported `extractedCount=1`. That single row reconciled onto existing Farmers Market `2a8ee718`. Third Fridays, Movie Night, and the rest never reached persist because they were never extracted.

Family Shows previously extracted one parent/schedule row (`Family Shows in Kansas City | Schedule 2026–2027`) even though the live page lists many dated performances.

`extractOpportunitiesFromPage` already had an `editorialContainer` prompt:

> One opportunity per distinct dated event… Do NOT emit the parent article/page title.

Prompt-only was not enough. The text the model actually received was a **single flattened blob**.

---

## Page text structure (what extraction actually saw)

### Listing scrape `htmlToText`

```ts
html
  .replace(/<script>…<\/script>/g, ' ')
  .replace(/<style>…<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 12000);
```

Effects:

1. All JSON-LD Event `<script type="application/ld+json">` blocks are deleted.
2. Card boundaries (headings, list items, `time` elements) collapse to one line.
3. Family Shows (~15k flattened chars) is truncated at 12k.

`scrapeListingUrl` then ran `parseJsonLdPageGraph(page.text)` on that stripped text → **0 JSON-LD events** on both live hubs, even though Family Shows HTML contains a JSON-LD Event per row.

Ask Benson `fetchUrlWithPipeline` concatenates JSON-LD stringify into `page.text`, so Ask Benson could see schema events; listing scrape could not.

### Downtown OP (live flatten, 3209 chars, no 12k truncation)

Squarespace event list. Repeated card shape after flatten:

```
Apr 18 to Dec 19 Overland Park Farmers Market Sat, Apr 18, 2026 7:30 AM Sat, Dec 19, 2026 12:00 PM Matt Ross Community Center (map) Google Calendar ICS … View Event
Aug 21 Third Fridays Friday, August 21, 2026 5:00 PM 7:00 PM Downtown Overland Park (map) … View Event
Sep 12 Movie Night Saturday, September 12, 2026 6:00 PM 9:00 PM Clock Tower Plaza (map) … View Event
```

JSON-LD Event count: **0**. Children depend on card parse, not schema.

### Family Shows (live flatten ~15k, sliced to 12k)

Date-first schedule rows:

```
Aug 20 2026 4:30 PM Thu CIRCUS Garden Bros Nuclear Circus : Fun Factory … Independence Center Mall … View Tickets
Aug 21 2026 6:30 PM Fri CHILDREN / FAMILY What If Puppets … The Carlsen Center - Polsky Theatre … View Tickets
Oct 24 2026 2:00 PM Sat … The Snowy Day … Starlight Theatre … View Tickets
```

Plus a calendar chrome grid (`19 AUG 2026 20 AUG 2026 …`) and `Updated : August 19, 2026` metadata — not events.

Raw HTML also has per-row JSON-LD Event and `gsb-event-row` cards. None of that survived `htmlToText`.

---

## Old extraction path

```
fetchPageContent → text = htmlToText(html).slice(0, 12000)
classifyEditorialContainer(pageText)          // already correct: container
extractOpportunitiesFromPage({ pageText, editorialContainer: true })
  → one LLM call on the entire blob
  → typically 1 parent/schedule row
parseJsonLdPageGraph(page.text)               // 0 events (scripts stripped)
decomposeEditorialOpportunities               // drops parent if no dated children
                                              // or keeps one child if LLM returned Farmers Market
```

Ask Benson called the same extractor with `editorialContainer: pageEditorial`, where

```ts
pageEditorial = isEditorialRoundupSource(url, title, text)
```

and `isEditorialRoundupSource` can return **true from URL/title cues alone** without `classifyEditorialContainer(...).isContainer`. Listing scrape already passed `.isContainer`. Ask Benson did not.

---

## New extraction rule

Applies only when the caller already set `editorialContainer=true`. This module does **not** classify containers.

### `prepareContainerExtraction`

1. **Chrome strip** on HTML: drop `script` / `style` / `nav` / `header` / `footer`; keep block newlines internally, then flatten for card split.
2. **JSON-LD from raw HTML** (not stripped text). Each Event with name + start date becomes a structured candidate.
3. **Card split**
   - If ≥2 `View Event` / `View Tickets` / `Get Tickets` hits → split on those delimiters.
   - Else split on date-first (`Aug 20 2026 4:30 PM`) or weekday-date (`Saturday, September 12, 2026`) anchors.
   - Skip dates labeled `Updated:` / `Published:` / `as of` so article metadata is not an event.
4. **Structured parse per card**
   - Title-first (hub): text immediately before the weekday date, after stripping parent title / nav / `All Events` / leading `Apr 18 to Dec 19` range crumbs.
   - Date-first (schedule): clock + skip weekday / ALL-CAPS category pills / “High Demand”, then title/venue (including doubled desktop+mobile phrases).
   - First clock is start time. Second date in the same card is an end date (Farmers Market Apr 18–Dec 19), not a second event.
   - No clock → `eventDate` is `YYYY-MM-DD`, `startTime` null. Never invent `T00:00:00` / midnight.
5. **Merge** JSON-LD + text cards by `titlesMatch` + calendar day. Prefer shorter clean titles; prefer visible text clocks over JSON-LD `Z` timestamps when both exist.
6. **Heading+`<time datetime>` HTML cards** only if JSON-LD + text parse together still have &lt; 2 children (avoids Squarespace heading/nav duplicates).
7. **Finalize:** drop parent document title, drop chrome titles, cap at 40, dedupe `title|YYYY-MM-DD|venue`.
8. **`shouldSplit`:** true only when ≥2 dated titled blocks. One festival date → do not split. Guide with no dated cards → zero children.

### `extractOpportunitiesFromPage` when `editorialContainer`

| Structured children | Action |
| --- | --- |
| ≥ 2 | Return them. **No LLM.** |
| `shouldSplit` and chunks remain | LLM each chunk (max 8), merge, same finalize |
| otherwise | Existing single-page LLM (guides / ordinary pages) |

Non-container, discount-watch, and directory listing paths are unchanged. Classifier still receives the original flattened `page.text` (12k), not HTML.

### JSON-LD merge after extract

`scrapeListingUrl` / `collect-from-link` used to always `mergeExtractedOpportunities(jsonLd, extract)`. JSON-LD names (`Garden Bros Nuclear Circus: Fun Factory`) and text names (`Garden Bros Nuclear Circus`) are different exact keys, so the same day could persist twice.

After this ingest, JSON-LD is merged **only if extract returned &lt; 2 opportunities**. Container preprocessing already folded HTML JSON-LD in.

---

## Ask Benson wiring

**Was (wrong relative to the requested contract):**

```ts
editorialContainer: pageEditorial  // isEditorialRoundupSource(...)
```

`isEditorialRoundupSource` returns true if the URL/title looks like a roundup **or** if `classifyEditorialContainer(...).isContainer`. A destination-guide URL can therefore enter the container extraction prompt even when the classifier says not a container.

**Now:**

```ts
const jsonLdGraph = parseJsonLdPageGraph(page.text);
const preContainer = classifyEditorialContainer({
  url: pageUrl,
  title: page.title,
  pageText: page.text,
  jsonLdEvents: jsonLdGraph.events,
  hasArticleSchema: jsonLdGraph.hasArticleSchema,
});
extractOpportunitiesFromPage({
  ...,
  editorialContainer: preContainer.isContainer,
});
```

The classifier function itself was not edited. Listing scrape already used `.isContainer` and now also passes `pageHtml`.

---

## What we refused to do

- Did not change `classifyEditorialContainer`.
- Did not hardcode Downtown OP or Family Shows event names.
- Did not create children from generic prose with no concrete date.
- Did not treat `Updated : August 19, 2026` as an event.
- Did not split genuine single-event festival pages.
- Did not invent midnight for date-only cards.
- Did not re-ingest Neighborhoods / Parkville.
- Did not touch ranking, Discover, Today, Alexa, Cloudflare, AWS.

---

## Tests

```
cd services/core
pnpm exec tsx --test \
  src/ask-benson/container-event-blocks.test.ts \
  src/ask-benson/editorial-container.test.ts \
  src/ask-benson/user-opportunity-add.test.ts \
  src/ask-benson/container-child-persist.test.ts
```

`container-event-blocks.test.ts`: **6 passed**. Related suites still green.

| # | Fixture | Proof |
| --- | --- | --- |
| 1 | Downtown OP-style short hub (`View Event` cards) | ≥6 dated children; parent title absent; Farmers Market / Third Fridays / Movie Night present |
| 2 | Long flattened Family Shows-style schedule | ≥4 performances; Garden Bros / What If Puppets / The Snowy Day; schedule title absent; `chunkContainerBlocks(..., 500)` ≥ 2 chunks |
| 3 | Genuine single-event festival page | `shouldSplit=false`; structured children 0 (not split into prose dates) |
| 4 | Editorial guide, no dated cards (`Updated : August 19, 2026` only) | 0 children; `decomposeEditorialOpportunities` keeps undated parent discovery |
| 5 | Duplicate hub text concatenated twice | Movie Night once after finalize |
| 6 | Date/time | Timed child keeps `T07:30:00`; date-only stays `2026-10-12` without `T00:00:00`; parent title / invented midnight absent |

Parser has no allowlist of those show names. Fixtures only illustrate card shapes.

---

## Live regression proof

Campaign `3b85115b-548b-4d91-8963-e41a55087a6b`. `webResearchLimit=0`. `beginScrapeRefreshWave` / `endScrapeRefreshWave` around each scrape.

### Downtown OP

`https://www.downtownop.org/events?utm_source=openai`  
Source `495e6e57-2cfe-490b-84de-38cfe2b6440e`

| | |
| --- | --- |
| Classifier | `isContainer=true`, kind `multi_event_schedule`, `parentRepresentsSingleEvent=false` |
| Evidence | `container_title`, `listing_index_path`, `multiple_dated_blocks` |
| JSON-LD Event count | **0** (none on the page) |
| Candidate blocks | **11** |
| Delimiters | `View Event` |
| Chunks | 1 (hub text is short; no LLM) |
| Structured / extracted | **11** |
| Persist | **created=10**, **updated=1** |
| Parent title extracted? | **No** |

| Title | Card date/time | Persist | id |
| --- | --- | --- | --- |
| Overland Park Farmers Market | 2026-04-18 7:30 AM | **updated** (not overwritten) | `2a8ee718-ed95-42bd-88ae-436e36e753ba` |
| Third Fridays | 2026-08-21 5:00 PM | created | `005f068a-87d1-40a0-8621-a48733961ad3` |
| Wellness Wednesdays | 2026-09-02 6:30 PM | created | `4b193fa1-a34a-4312-8405-d8cf804f169e` |
| Movie Night | 2026-09-12 6:00 PM | created | `d08348ea-7564-42bd-adbc-7c944fd4fb2e` |
| Harvesting Hope | 2026-10-01 5:30 PM | created | `5387e436-ae7e-4031-9e65-5a7f2044a4d3` |
| Bourbon, Bacon & Brews | 2026-10-09 4:00 PM | created | `f0709a89-95ca-4f30-a5c4-1d251376783b` |
| Trick-or-Treat Event | 2026-10-24 2:00 PM | created | `e39847f4-009e-4be4-bdc8-e407a5a998ce` |
| Concerts in the Park: Twice on Sunday | 2026-08-13 7:00 PM | created | `b9888643-0224-42da-b712-a53b00598ddf` |
| Health and Cancer Screening | 2026-07-18 10:00 AM | created | `16bbdb8e-5e9a-4b34-999c-2c9fbee85030` |
| Third Fridays (July) | 2026-07-17 5:00 PM | created | `93c32a89-7399-44cd-b43e-f87738472a46` |
| Downtown OP Car Show | 2026-06-11 6:00 PM | created | `e13109cb-f28f-4c5c-8849-bc8a3d98e040` |

Farmers Market after ingest:

| Field | Value |
| --- | --- |
| id | `2a8ee718-ed95-42bd-88ae-436e36e753ba` |
| topic | Overland Park Farmers Market |
| sourceUrl | `https://www.downtownop.org/events?utm_source=openai` |
| sourceExternalId | `scrape_listing-38fa8fcfd5ed3cd8-0-overland-park-farmers-market` (**legacy, not rewritten**) |
| eventStartsAt | `2026-04-18T12:30:00.000Z` (unchanged stored instant) |
| locationName | Matt Ross Community Center |

New children: `sourceUrl` = hub, `containerChild=true`, internal id `scrape_listing-<listingHash>-<slug>-<YYYY-MM-DD>-<venue|novenue>`. Two Third Fridays rows are different days, so different identities.

Historical parent copies titled **Events in Overland Park — Downtown OP** (`eventStartsAt=null`) were not re-created by this extract (parent title dropped). They remain as earlier repair artifacts.

### Family Shows

`https://kc.events/family?utm_source=openai`  
Source `c11283db-d5d4-4814-9dfe-eb19f6860988`

| | |
| --- | --- |
| Classifier | `isContainer=true`, kind `multi_event_schedule`, `parentRepresentsSingleEvent=false` |
| Evidence | `container_title`, `multiple_jsonld_events`, `multiple_dated_blocks` |
| JSON-LD Event count from HTML | **13** unique name+day+venue |
| Candidate blocks | **13** |
| Delimiters | `View Tickets` |
| Chunks | 1 at default 3800 chars (13 short structured cards). Fixture #2 still proves chunking at 500 chars. |
| Extracted children | **13** |
| Schedule title extracted? | **No** |

Extracted set included:

- Garden Bros Nuclear Circus (multiple days, Independence Center Mall)
- Bluey's Big Play (Muriel Kauffman Theatre)
- What If Puppets (The Carlsen Center – Polsky Theatre)
- The Snowy Day (Starlight Theatre)

Same show + same venue + same calendar day collapses to one row, matching persist identity. Live HTML has 4:30 PM and 7:30 PM Garden Bros on Aug 20; those are one child, not two.

This ingest still ran the **old** post-extract JSON-LD merge, so a few **Garden Bros Nuclear Circus: Fun Factory** variants were also inserted (`a3eae9e3`, `6aefd2bc`, `95f07a99`, `eb7e0c97`) beside shorter JSON-LD/text titles. Source now has **16** `containerChild=true` rows. Subsequent scrapes skip that merge when extract already returned ≥2 children.

Legacy rows **not deleted:**

- `bbfc5cd9` Garden Bros Nuclear Circus: Fun Factory (legacy listing index id)
- `f0eb5109` Garden Bros … at Independence Center Mall (discovery ingest)

Historical parent copies of **Family Shows in Kansas City \| Schedule 2026–2027** (`eventStartsAt=null`) were not emitted by this extract.

---

## Call sites

| Path | Container flag | HTML | JSON-LD |
| --- | --- | --- | --- |
| `scrape-listing.ts` | `classifyEditorialContainer(...).isContainer` | `pageHtml` from `fetchPageContent` | Parsed from HTML; merged only if extract &lt; 2 |
| `collect-from-link.ts` | same `.isContainer` | pipeline `page.text` (already includes JSON-LD stringify) | Parsed from `page.text`; same merge guard |
| Discount watch / directory | unchanged | n/a | n/a |

---

## What this did not fix

1. **Same-day multiple showtimes** — title+day+venue identity (extract and persist) keeps one Garden Bros per day. Changing that would be a persist+extract identity change.
2. **JSON-LD `Z` vs local clocks** — text cards overwrite JSON-LD clocks when merged inside preprocessing; leftover Fun Factory variants from this one ingest remain in DB.
3. **Legacy parent discovery rows** — earlier parent-title copies with `eventStartsAt=null` were not deleted.
4. **Neighborhoods / Parkville** — not re-ingested (guides with no dated cards; extraction now returns zero children for that shape).
5. **Confirmed Neighborhoods calendar row** `546d8013`.
6. **Classifier / eligibility / ranking / Discover / Today / Alexa / Cloudflare / AWS.**

---

## Files

| Path | Change |
| --- | --- |
| `services/core/src/ask-benson/container-event-blocks.ts` | **New.** Segmentation, card parse, HTML JSON-LD, chunking, parent-title drop, title+day+venue dedupe |
| `services/core/src/ask-benson/container-event-blocks.test.ts` | **New.** Six fixtures |
| `services/core/src/ask-benson/listing-extract.ts` | Container path uses preprocessing; `fetchPageContent` returns `html`; 12k flatten kept for classifier `text` |
| `services/core/src/ask-benson/scrape-listing.ts` | JSON-LD from HTML; pass `pageHtml`; skip redundant JSON-LD merge when extract already has children |
| `services/core/src/ask-benson/collect-from-link.ts` | Pass `classifyEditorialContainer().isContainer` into extraction; same JSON-LD merge guard |

Not changed: `editorial-container.ts` classifier, Calendar eligibility, `container-child-persist.ts` identity helpers.

---

## How to re-check extraction without ingest

```
cd services/core
pnpm exec tsx --test src/ask-benson/container-event-blocks.test.ts
```

Those tests do not call OpenAI when structured parse finds ≥2 cards, and they do not write to the database.
