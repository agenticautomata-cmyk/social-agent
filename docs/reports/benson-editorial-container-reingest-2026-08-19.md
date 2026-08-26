# Editorial-container follow-up re-ingest (2026-08-19)

Verification + live re-ingest only. Companion to [benson-editorial-container-calendar-2026-08-19.md](./benson-editorial-container-calendar-2026-08-19.md).

The 2026-08-19 classifier/eligibility/repair work **stamped parents and cancelled suggested parent calendar rows**. It did **not** re-fetch the live source pages. This follow-up asked Benson to ingest those four URLs through the normal Ask Benson / listing path (`classifyEditorialContainer` + child decomposition) and then prove Calendar no longer treats the parent titles as events.

**Stopped after ingest.** Child population failed. No further code changes were made (classifier, Calendar eligibility, ranking, Today, Discover, Alexa, trusted-creator routing, Cloudflare, and AWS were left untouched).

Ran locally against the local DB at **2026-08-19T03:18:28Z**. Projection window used for the post-ingest Calendar check: `2026-08-01` → `2027-12-31`.

---

## Constraints honored

- Did not change `classifyEditorialContainer`
- Did not change Calendar eligibility
- Did not change ranking, Today, Discover, Alexa, trusted-creator routing, Cloudflare, or AWS
- Did not broaden scope when ingest exposed persist/extraction failures
- Did not retract the pre-existing **confirmed** neighborhoods calendar row (repair never touched confirmed)

---

## Method

Resolved live source URLs from the repaired parent `content_items`, then ingested each through the path that already contains classifier + decompose:

| Parent | Original ingest | Re-ingest path | Live URL |
| --- | --- | --- | --- |
| Where to Eat, Shop, Play… 20 KC Metro Neighborhoods | `inkc_openings_rss` / `visitkc_luxury_rss` | Ask Benson `collectOpportunitiesFromLink` | `https://www.inkansascity.com/home-design/neighborhoods/where-to-eat-shop-play-and-spend-a-day-in-20-kc-metro-neighborhoods/` |
| Spend a Day in Parkville… | `visitkc_luxury_rss` | Ask Benson `collectOpportunitiesFromLink` | `https://www.inkansascity.com/innovators-influencers/local-news/spend-a-day-in-parkville-where-to-eat-shop-and-explore/` |
| Family Shows in Kansas City \| Schedule 2026–2027 | `scrape_listing` source `c11283db-d5d4-4814-9dfe-eb19f6860988` | `scrapeListingUrl` (same source + campaign) | `https://kc.events/family?utm_source=openai` |
| Events in Overland Park — Downtown OP | `scrape_listing` source `495e6e57-2cfe-490b-84de-38cfe2b6440e` | `scrapeListingUrl` (same source + campaign) | `https://www.downtownop.org/events?utm_source=openai` |

Campaign: `3b85115b-548b-4d91-8963-e41a55087a6b`.

For each URL:

1. Fetch page (`fetchPageContent`) and run `classifyEditorialContainer` + JSON-LD Event parse (pre-ingest snapshot).
2. Ingest via Ask Benson or listing scrape.
3. After all four, run `ensureCalendarInventoryProjections(2026-08-01, 2027-12-31)`.
4. Query `content_items` and `creator_calendar_items` for parent titles, related URLs, and persisted child IDs.

Ask Benson was called with the URL as `userMessage` (not an explicit “add these events” command), which is the normal pasted-URL path.

---

## Verdict

| Expected | Result |
| --- | --- |
| Classifier treats all four as containers, not one event | **Pass** |
| Parent article/hub never reappears as a **new** Calendar event | **Pass** for Parkville, Family Shows, Downtown OP |
| None of the four parent titles are active suggested/confirmed Calendar rows | **Fail** — neighborhoods remains **confirmed** (`546d8013`) |
| Parkville-style guide with no dated events stays discovery/reference only | **Pass** (no new dated parent or children) |
| Schedule/hub pages produce individual dated children where supported | **Fail** — 0 new children from Family Shows and Downtown OP, despite live page text containing dated cards |
| No invented midnight parent events from this ingest | **Pass** |
| No duplicate children if an official/existing child already exists | **Pass** (Garden Bros / Farmers Market not duplicated) |
| Genuine existing child events remain untouched/reconciled | **Pass** |

The classifier is doing its job. Child materialization failed downstream: LLM extraction still emitted one parent-titled row; listing persist URL-dedupes children that share the hub URL; Ask Benson persist identity collided on a truncated hex hash.

Ask Benson identity was fixed later the same day: [benson-ask-benson-external-id-collision-2026-08-19.md](./benson-ask-benson-external-id-collision-2026-08-19.md). Listing URL-dedupe and extraction were not.

---

## Calendar proof (after re-ingest)

Query: `creator_calendar_items` whose title matches any of the four parents (and close `ilike` variants), `planningStatus` in `suggested` / `confirmed` / `tentative`.

| Title | Active rows |
| --- | --- |
| Spend a Day in Parkville: Where to Eat, Shop, and Explore | **none** (cancelled `8f61fbcb` only) |
| Family Shows in Kansas City \| Schedule 2026–2027 | **none** (cancelled copies only) |
| Events in Overland Park — Downtown OP | **none** (cancelled copies only) |
| Where to Eat, Shop, Play, and Spend a Day in 20 KC Metro Neighborhoods | **1 confirmed** |

Active row:

| Field | Value |
| --- | --- |
| id | `546d8013-26e2-4a25-a0dc-07eaba51c501` |
| planningStatus | `confirmed` |
| startAt | `2026-08-21T05:00:00.000Z` |
| sourceUrl | neighborhoods article URL (no hash) |
| sourceRecordId | `4256ab24-4d51-497e-b7fb-979f31adb61c` |

This row existed **before** re-ingest. The 2026-08-19 repair only cancelled `suggested`/`tentative`. Re-ingest did not create it and did not project a new neighborhoods parent (content stamp `calendarEligible=false`). It is still an active Calendar event because confirmed rows are protected.

Projection after ingest: scanned 389, eligible 338, created 54, updated 283, duplicates 51. Rejected `editorial_container` sample was empty in the report window (parents already stamped ineligible / no `eventStartsAt`). Created sample included unrelated inventory (Hobby Havoc, Festival of Lights, Garden Bros already existed, etc.). None of the four parent titles appeared in the created sample.

---

## Source 1 — 20 KC Metro Neighborhoods

### Live page

| | |
| --- | --- |
| URL | `https://www.inkansascity.com/home-design/neighborhoods/where-to-eat-shop-play-and-spend-a-day-in-20-kc-metro-neighborhoods/` |
| Fetch | ok |
| Page title | Where to Eat, Shop, Play, and Spend a Day in 20 KC Metro Neighborhoods - IN Kansas City Magazine |
| JSON-LD Events | 0 |

### Parent classification

```json
{
  "isContainer": true,
  "kind": "destination_guide",
  "parentRepresentsSingleEvent": false,
  "evidence": ["container_title", "container_url"],
  "jsonLdEventCount": 0,
  "datedMentionCount": 0,
  "extractedChildCount": 0,
  "hasArticleSchema": false
}
```

Parent is **not** calendar-eligible from classification.

### Extraction / persist

| | |
| --- | --- |
| Path | Ask Benson `collectOpportunitiesFromLink` |
| `extractedCount` | 1 (undated parent discovery — expected; no showtimes) |
| created / updated (ingest API) | 0 / 1 |
| Concrete child events | **0** |
| Child titles + dates | none |
| Each child persisted | n/a |
| Each child projected | n/a |

Ingest **reported** an update of:

- contentItemId `ac3a048f-6dc8-44ed-8939-13f187c1dfc6`
- title in the ingest result: the neighborhoods magazine title
- `eventStartsAt`: null

That ID is **not** the neighborhoods article. After ingest the row is still:

| Field | Value |
| --- | --- |
| topic | The Reunion Hosted By DJ DOT WAV |
| sourceUrl | `https://theosc.co/events` |
| sourceExternalId | `ask-benson-user-event-68747470733a2f2f` |
| eventStartsAt | `2026-08-29T15:00:00.000Z` |

`persistIngestedContentItem` matched on `sourceId` + that colliding external id and **only touched freshness** (`lastSeenAt` / `updatedAt`). Reunion title, URL, and date were not overwritten. The neighborhoods article was not rewritten via Ask Benson.

Existing repaired parent (untouched as a discovery row):

| Field | Value |
| --- | --- |
| id | `4256ab24-4d51-497e-b7fb-979f31adb61c` |
| ingest | `inkc_openings_rss` |
| sourceUrl | article URL |
| eventStartsAt | null |
| calendarEligible | false |
| editorialContainer | true |
| parentArticleRepair | 2026-08-19 |

Related content count before/after: **2 / 2**. No new rows.

### Calendar / provenance

- New parent Calendar event: **no**
- Pre-existing confirmed parent: **yes** (`546d8013`, midnight-ish `2026-08-21T05:00:00Z`)
- Source URL retained on the RSS parent and on the confirmed calendar row
- Dedupe outcome: Ask Benson identity collision onto Reunion; neighborhoods parent not duplicated

---

## Source 2 — Spend a Day in Parkville

### Live page

| | |
| --- | --- |
| URL | `https://www.inkansascity.com/innovators-influencers/local-news/spend-a-day-in-parkville-where-to-eat-shop-and-explore/` |
| Fetch | ok |
| Page title | Spend a Day in Parkville: Where to Eat, Shop, and Explore - IN Kansas City Magazine |
| JSON-LD Events | 0 |

### Parent classification

```json
{
  "isContainer": true,
  "kind": "destination_guide",
  "parentRepresentsSingleEvent": false,
  "evidence": ["container_title"],
  "jsonLdEventCount": 0,
  "datedMentionCount": 2,
  "extractedChildCount": 0,
  "hasArticleSchema": false
}
```

Two dated mentions on the page are not enough (and not child event titles) to treat this as a schedule. Parent is **not** calendar-eligible.

### Extraction / persist

| | |
| --- | --- |
| Path | Ask Benson `collectOpportunitiesFromLink` |
| `extractedCount` | 1 (undated parent — **expected**) |
| created / updated (ingest API) | 0 / 1 |
| Concrete child events | **0** |
| Child titles + dates | none |

Same Reunion collision as neighborhoods: ingest reported update of `ac3a048f`, but the stored row remains DJ DOT WAV / `theosc.co/events`. Parkville discovery row was not rewritten.

Existing repaired parent:

| Field | Value |
| --- | --- |
| id | `572963d8-c3c0-46fc-acf4-f3dfbad3bf4c` |
| ingest | `visitkc_luxury_rss` |
| sourceUrl | Parkville article URL + `#luxury-deal` |
| eventStartsAt | null |
| calendarEligible | false |
| editorialContainer | true |

Related content count before/after: **1 / 1**.

### Calendar / provenance

- Parent Calendar: cancelled `8f61fbcb` (`2026-08-21T05:00:00Z`) — not reactivated
- No new dated parent or children
- Source URL retained on the RSS parent
- This source **meets** the “Parkville-style guide stays discovery/reference only” expectation. The persist collision is still a defect for Ask Benson URL intake in general.

---

## Source 3 — Family Shows in Kansas City | Schedule 2026–2027

### Live page

| | |
| --- | --- |
| URL | `https://kc.events/family?utm_source=openai` |
| Fetch | ok |
| Page title | Family Shows in Kansas City \| Schedule 2026–2027 |
| JSON-LD Events | 0 |
| `htmlToText` length | 12 000 chars, one flattened line |

Page text **does** contain dated child performances, including:

- Garden Bros Nuclear Circus: Fun Factory — Aug 20 2026 4:30 PM / 7:30 PM — Independence Center Mall
- Garden Bros — Aug 21 2026 4:30 PM
- What If Puppets — Oct 8–10 2026 — Carlsen Center / Polsky Theatre
- The Snowy Day — Oct 24 2026 — Starlight Theatre

The live hub claims **238 upcoming shows**. This is a supported child-decomposition case.

### Parent classification

```json
{
  "isContainer": true,
  "kind": "multi_event_schedule",
  "parentRepresentsSingleEvent": false,
  "evidence": ["container_title", "multiple_dated_blocks"],
  "jsonLdEventCount": 0,
  "datedMentionCount": 16,
  "extractedChildCount": 0,
  "hasArticleSchema": false
}
```

`extractedChildCount: 0` here is the **pre-LLM** classifier input (JSON-LD titles only). Dated-block evidence is what made it a schedule.

Listing scrape **does** pass `editorialContainer: preContainer.isContainer` into `extractOpportunitiesFromPage`, so the container LLM prompt ran (“one opportunity per distinct dated event; do not emit the parent title”).

### Extraction / persist

| | |
| --- | --- |
| Path | `scrapeListingUrl` on existing scrape source |
| `extractedCount` | **1** |
| created / updated | 0 / 1 |
| Concrete children extracted this run | **0** |
| Document title | Family Shows in Kansas City \| Schedule 2026–2027 |

The single extracted/persisted row is still the **parent schedule title**:

| Field | Value |
| --- | --- |
| id | `bacb8e10-f37f-4b0f-8f50-4538ec7ef5b9` |
| topic | Family Shows in Kansas City \| Schedule 2026–2027 |
| sourceUrl | `https://kc.events/family?utm_source=openai#event-1` |
| sourceExternalId | `scrape_listing-c12443238d2740c3-0-family-shows-in-kansas-city-schedule-2026-2027` |
| eventStartsAt | null |
| calendarEligible | false |
| editorialContainer | true |
| outcome | updated (touch existing parent; same external id as the old parent-titled scrape row) |

`rawPayload.extracted` on that row is still the **historical** Garden Bros object (title “Garden Bros Nuclear Circus: Fun Factory”, 2026-08-20T16:30:00, Independence, MO). Listing persist on an existing `sourceId`+`externalId` hit only refreshes `lastSeenAt` — it does not replace topic or raw payload. So the LLM almost certainly returned the parent title again (external id slug matches the schedule headline). Decompose then kept an undated parent because `titlesMatch(parent)`.

Related content count before/after: **17 / 17**. No new rows.

### Children that already existed (untouched)

| id | Title | eventStartsAt | Calendar |
| --- | --- | --- | --- |
| `bbfc5cd9-8055-4d7e-8796-3737df69b0e8` | Garden Bros Nuclear Circus: Fun Factory | `2026-08-21T00:30:00.000Z` | suggested `f43554b7` |
| `f0eb5109-746c-4d60-ab73-bc80e40a18fb` | Garden Bros Nuclear Circus: Fun Factory at Independence Center Mall | `2026-08-20T00:00:00.000Z` | suggested `f22a7297` |

These were **not** duplicated. The rest of the schedule (What If Puppets, The Snowy Day, later 2026–2027 shows) was **not** extracted.

### Calendar / provenance

- Parent schedule title: cancelled copies only (e.g. `d4b3583c` on `bacb8e10`). Not reactivated.
- Provenance: listing URL retained on parent and on Garden Bros rows (`kc.events/family?utm_source=openai`, with/without trailing slash and hashes)
- Dedupe: existing Garden Bros kept; parent scrape row touched; no new children

---

## Source 4 — Events in Overland Park — Downtown OP

### Live page

| | |
| --- | --- |
| URL | `https://www.downtownop.org/events?utm_source=openai` |
| Fetch | ok |
| Page title | Events in Overland Park — Downtown OP (`&mdash;` in HTML) |
| JSON-LD Events | 0 |
| `htmlToText` length | 3 209 chars |

Dated cards **present in text**:

| Title | Dates / times on page |
| --- | --- |
| Overland Park Farmers Market | Sat Apr 18 2026 7:30 AM → Sat Dec 19 2026 12:00 PM |
| Third Fridays | Friday August 21 2026 5:00 PM–7:00 PM |
| Wellness Wednesdays | Wednesday September 2 2026 6:30 PM–7:30 PM |
| Movie Night | Saturday September 12 2026 6:00 PM–9:00 PM |
| Harvesting Hope | Thursday October 1 2026 5:30 PM–8:00 PM |
| Bourbon, Bacon & Brews | Friday October 9 2026 4:00 PM–8:00 PM |
| Trick-or-Treat Event | Saturday October 24 2026 2:00 PM–4:00 PM |
| Concerts in the Park: Twice on Sunday | Thursday August 13 2026 7:00 PM–9:00 PM |
| Health and Cancer Screening | Saturday July 18 2026 (past) |
| Downtown OP Car Show | Thursday June 11 2026 (past) |

This is a supported hub-decomposition case.

### Parent classification

```json
{
  "isContainer": true,
  "kind": "multi_event_schedule",
  "parentRepresentsSingleEvent": false,
  "evidence": ["container_title", "listing_index_path", "multiple_dated_blocks"],
  "jsonLdEventCount": 0,
  "datedMentionCount": 24,
  "extractedChildCount": 0,
  "hasArticleSchema": false
}
```

### Extraction / persist

| | |
| --- | --- |
| Path | `scrapeListingUrl` on existing scrape source |
| `extractedCount` | **1** |
| created / updated | **0 / 0** |
| Concrete children extracted this run | **0** |
| Items returned by scrape | **[]** (dropped after persist) |

Related content count before/after: **8 / 8**.

**Why persist dropped the row:** an existing genuine child already owns the exact hub URL:

| Field | Value |
| --- | --- |
| id | `2a8ee718-ed95-42bd-88ae-436e36e753ba` |
| topic | Overland Park Farmers Market |
| sourceUrl | `https://www.downtownop.org/events?utm_source=openai` (no fragment) |
| sourceExternalId | `scrape_listing-38fa8fcfd5ed3cd8-0-overland-park-farmers-market` |
| eventStartsAt | `2026-04-18T12:30:00.000Z` |

`persistIngestedContentItem` URL-dedupes on exact `sourceUrl`. The new extracted row used the listing URL (no child detail link). Persist touched Farmers Market and returned `updated`. Scrape-listing then loaded by the **new** parent external id (`…-0-events-in-overland-park-…`) and found nothing → `continue`, so created=0, updated=0, items=[].

Farmers Market title/date were **not** overwritten. It is **not** on Calendar (start April 2026, already past relative to ingest day).

Existing repaired **parent** rows (still stamped, still undated) include:

| id | sourceUrl fragment |
| --- | --- |
| `438485d3-…` | `#concerts-in-the-park` |
| `92169d77-…` | `#event6` |
| `f306c74e-…` | `#third-fridays-august` |
| `0e1a20d0-…` | `#movie-night` |
| `1716d2fb-…` | `#event5` |
| `78f562ea-…` | `#concerts-in-the-park-twice-on-sunday` |
| `b1edc6c1-…` | `#event7` |

Those fragments are leftover from the era when the hub was stored as one event per scrape index. They are not separate child titles. All remain `calendarEligible=false`, `editorialContainer=true`, `eventStartsAt=null`.

### Calendar / provenance

Cancelled parent-title rows (not reactivated):

| id | former startAt |
| --- | --- |
| `8f53dfcc` | `2026-08-14T00:00:00Z` (midnight) |
| `ff64a9cd` | `2026-10-09T21:00:00Z` |
| `63b6fcde` | `2026-09-12T23:00:00Z` |
| `6047a6ce` | `2026-09-12T23:00:00Z` |
| `d623dccf` | `2026-08-21T22:00:00Z` |

No new midnight parent event. Listing URL retained on Farmers Market and on the cancelled parent copies. Third Fridays / Movie Night / Bourbon Bacon & Brews / Trick-or-Treat were **not** created as children.

---

## Failure analysis (why children did not populate)

Classifier and Calendar eligibility are **not** the miss. Three downstream defects, in order of impact:

### 1. LLM extraction still returned one parent-titled row

Family Shows and Downtown OP both ran the editorial-container prompt. Live `htmlToText` contains distinct dated cards. JSON-LD Event count is 0 on both pages, so children depend entirely on the LLM.

Observed: `extractedCount === 1` and the Family Shows persist key slugs to the **schedule title**. Decompose then drops calendar eligibility for that row (`titlesMatch` parent) and keeps an undated discovery parent.

Family Shows text is a single 12k-character line (nav chrome + 238-show dump), which likely biases the model toward one summary row. Downtown OP text is only ~3k characters with clearly separated cards, and still came back as one row — so flattening is not the only cause.

Ask Benson `collect-from-link` still passes `editorialContainer: pageEditorial` (`isEditorialRoundupSource`), **not** `classifyEditorialContainer.isContainer`, into the LLM. That wiring gap matters less for these two guides (0 dated children is correct) than for future Ask Benson hub pastes.

### 2. Listing persist cannot store multiple children that share the hub URL

`persistIngestedContentItem(..., { sourceUrl })` treats exact `sourceUrl` as a duplicate and only touches `lastSeenAt`.

Child `sourceUrl` is `opp.sourceUrl || listingUrl`. Hub pages rarely give per-card URLs in `htmlToText`, so every child would inherit `https://www.downtownop.org/events?utm_source=openai`. Farmers Market already owns that string, so **any** additional Downtown OP child (or a parent-titled retry) is swallowed.

Even if extraction had returned Third Fridays, Movie Night, and Bourbon Bacon & Brews, persist would not have created them unless each had a distinct `sourceUrl` (fragment, detail path, or canonical child URL).

Family Shows already has Garden Bros on `https://kc.events/family?utm_source=openai` (and a second row with a trailing slash). Same trap for additional shows.

### 3. Ask Benson external ids collide on `https://`

```ts
const key = [canonicalUrl, title, date, venue].join('|');
const hash = Buffer.from(key).toString('hex').slice(0, 16);
```

`canonicalUrl` is always an `https://…` string. The first 8 bytes of UTF-8 are `https://` = 16 hex chars `68747470733a2f2f`. Every Ask Benson user-event row that uses a https canonical URL therefore shares:

`ask-benson-user-event-68747470733a2f2f`

Neighborhoods and Parkville both matched The Reunion (`ac3a048f`) on the share-intake source. Because `persistIngestedContentItem` **touches** on external-id hit and does not merge topic, Reunion survived. The ingest API still reported `updated` with the **incoming** title, which is misleading.

If that path had gone through `persistUserConfirmedOpportunity` instead, Reunion’s topic/URL could have been merged. It did not, this run.

---

## What stayed healthy

- All four live pages classified as containers; none as `parentRepresentsSingleEvent`
- No new parent-titled suggested Calendar rows from this ingest
- Parkville/neighborhoods guides did not invent midnight children
- Garden Bros suggested Calendar rows left in place
- Farmers Market content row left in place
- Cancelled parent Calendar copies stayed cancelled
- Classifier, eligibility, ranking, Alexa, Cloudflare, AWS unchanged

---

## Repair vs this ingest (record inventory)

Repaired parent **content** rows (25 stamped on 2026-08-19) were not deleted. Representative IDs:

- Neighborhoods: `4256ab24`, `f4318bca`
- Parkville: `572963d8`
- Family Shows: `bacb8e10`, `4763d5c9`, plus ~15 duplicate parent-titled scrape rows with `#event-N` hashes
- Downtown OP: `438485d3`, `92169d77`, plus five more parent-titled hub hashes

Those duplicates are historical parent copies, not child events.

---

## Out of scope / not done

- No code fix for extraction, listing URL-dup, or Ask Benson hash truncation (stopped on regression)
- No change to `classifyEditorialContainer` or Calendar eligibility
- Confirmed neighborhoods calendar row `546d8013` not cancelled
- Did not force-create children by hand
- Did not deploy or restart Cloudflare / AWS
- Discover / Today / Alexa / trusted-creator routing untouched

---

## Recommended next fix

1. **Ask Benson persist identity** — **done** 2026-08-19. See [benson-ask-benson-external-id-collision-2026-08-19.md](./benson-ask-benson-external-id-collision-2026-08-19.md).
2. **Listing/Ask Benson child identity** — **done** 2026-08-19. See [benson-container-child-hub-persist-2026-08-19.md](./benson-container-child-hub-persist-2026-08-19.md). Hub `sourceUrl` is provenance; children match on title+day+venue. Downtown OP re-ingest still extracted **one** row — extraction not changed.
3. **Extraction** — **done** 2026-08-19. See [benson-editorial-container-child-extraction-2026-08-19.md](./benson-editorial-container-child-extraction-2026-08-19.md). Downtown OP extracted **11** dated children (Farmers Market reconciled, 10 created). Family Shows extracted **13** performances (schedule title absent). `classifyEditorialContainer` unchanged.

The neighborhoods **confirmed** row still needs an explicit operator decision; eligibility will not retract it.
