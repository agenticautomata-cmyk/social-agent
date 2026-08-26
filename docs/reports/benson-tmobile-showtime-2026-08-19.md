# T-Mobile Center date/time extraction defect

Date: 2026-08-19  
Scope: listing/card showtime loss for `[Benson] T-Mobile Center Concerts` (`6d79fc9a-84b1-4797-a0b8-263481642f69`).  
Listing URL: `https://www.kansascityarena.com/events?utm_source=openai`

**Calendar was not re-projected. The 94 Calendar rows were not cleaned up.**  
Frozen surfaces (listing_chrome, venue_as_title, classifier, shared-hub identity helpers, Downtown OP / Family Shows / Bowline / OPCC / HPNA / CommUNITY Fest, Alexa / Discover / Today / ranking) were not edited.

---

## Investigation first — where the showtime is lost

### Listing shape

The hub page JSON-LD for every Event is a **UTC midnight placeholder**:

`startDate: "2026-08-31T00:00:00+00:00"`

Visible hub cards are date + name only (`Aug 31 Benson Boone T-Mobile Center INFO TICKETS`). They do not contain 6:30 PM.

Linked `url` values are either venue detail pages (still midnight JSON-LD, title like `Benson Boone Tickets | 31st August | T-Mobile Center`) or TicketSqueeze pages whose **title and JSON-LD carry a clock** with a fake `+00:00` offset:

| Page | JSON-LD `startDate` | Visible title clock |
| --- | --- | --- |
| Hot Wheels ticket | `2026-10-03T18:30:00+00:00` | `06:30PM` |
| PBR ticket | `2026-10-23T19:45:00+00:00` | `07:45PM` |
| Jayhawks ticket | `2026-12-06T03:30:00+00:00` | `03:30AM` (chrome, not tip-off) |
| Boone detail | `2026-08-31T00:00:00+00:00` | none |

`+00:00` on TicketSqueeze is **not** a real UTC instant. `18:30+00:00` is wall-clock 6:30 PM, matching the title. Honoring the offset via `Date.parse` would store 1:30 PM CDT.

### Stage that converted events to local midnight

Traced on live `raw_payload.extracted` before the fix:

1. **Raw hub JSON-LD** — `startDate` is `YYYY-MM-DDT00:00:00+00:00`.
2. **Extracted opportunity** — `splitDateTime` kept `00:00:00` as `startTime` and dropped the offset. `eventDate` became naive `2026-08-31T00:00:00`. Summary text: `Benson Boone 2026-08-31 00:00:00 T-Mobile Center`.
3. **Child fetch (scrape-listing enrich)** — TicketSqueeze HTML was fetched **only to replace the title** with a longer string (`… | 10/23/2026 07:45PM | …`). `eventDate` / `startTime` were **not** overlaid.
4. **`parseEventDate`** — `Date.parse('2026-08-31T00:00:00')` with process TZ `America/Chicago` → `2026-08-31T05:00:00.000Z` (CDT midnight) or `T06:00:00Z` (CST midnight).
5. **Persisted `content_items.eventStartsAt`** — that Chicago-midnight instant.
6. **Calendar `startAt`** — `candidateFromInventory` copies `eventDate` / `eventStartsAt` through. Clock was already gone.

**The conversion to local midnight is persist `parseEventDate` of naive `T00:00:00`, not Calendar projection.**

### Five representative traces (before → after this ingest)

| Event | Before `eventStartsAt` | After | Notes |
| --- | --- | --- | --- |
| Benson Boone | `2026-08-31T05:00:00Z` | `2026-08-31T00:00:00.000Z` | Hub + detail JSON-LD midnight only → **date-only** (existing UTC-midnight / all-day semantics). Title unchanged. |
| Kansas Jayhawks vs Missouri | `2026-12-06T06:00:00Z` | `2026-12-06T00:00:00.000Z` | Title `03:30AM` + JSON-LD `T03:30:00+00:00` **rejected** as chrome → date-only. |
| Hot Wheels 10/03 6:30 PM | `2026-10-03T05:00:00Z` | `2026-10-03T23:30:00.000Z` | Overlay 18:30 wall → **6:30 PM CDT**. |
| PBR 10/23 7:45 PM | `2026-10-23T05:00:00Z` | `2026-10-24T00:45:00.000Z` | Overlay 19:45 wall → **7:45 PM CDT**. |
| Christmas Together (ordinal date, no clock) | `2026-12-07T06:00:00Z` | `2026-12-07T00:00:00.000Z` | Genuine date-only. |

Calendar `startAt` for these rows is **still the old midnight** until a later projection.

---

## Fix (generic to this listing/card shape)

No T-Mobile event names or individual dates were hardcoded.

1. **`jsonld-events.splitDateTime`**  
   - `T00:00:00` (any offset) → date-only, `startTime` null.  
   - UTC-labeled (`Z` / `+00:00`) clocks between 01:00 and 05:59 → date-only (03:30AM chrome).  
   - Evening wall clocks on fake `+00:00` kept as `HH:MM:SS` (matches TicketSqueeze titles).  
   - Real offsets such as `-05:00` (Family Shows) still keep 19:00.

2. **`overlayListingShowtime`** (`listing-showtime.ts`)  
   After scrape-listing fetches the child URL, overlay a trustworthy clock from child JSON-LD or `MM/DD/YYYY 06:30PM` title text. Does not change title. `Time: TBD` skips clocks.

3. **`parseEventDate`**  
   - `YYYY-MM-DD` and naive `T00:00:00` → UTC midnight (date-only / all-day).  
   - Naive `YYYY-MM-DDTHH:MM:SS` → America/Chicago wall time via `localWallTimeToUtc`.

4. **scrape-listing**  
   Apply overlay before persist. On update, write `eventStartsAt` (touch-only persist would otherwise leave midnight). Match existing children by ticket `sourceUrl` so evening clocks that cross UTC midnight do not insert duplicates. Identity helper file was not changed.

---

## Tests

```bash
node --import tsx --test \
  src/ask-benson/listing-showtime.test.ts \
  src/ask-benson/jsonld-events.test.ts \
  src/ask-benson/container-event-blocks.test.ts
```

**15 passed / 0 failed** (listing-showtime 7, jsonld-events 2, container-event-blocks 6).

Covered: 6:30 PM → `2026-10-03T23:30:00.000Z`; 7:45 PM survives; date-only stays date-only; 03:30AM rejected; TBD rejected; title/date unchanged; Downtown OP Harvesting Hope `T17:30:00` unchanged; Family Shows Garden Bros unchanged.

Known-good Downtown OP / Family Shows **extraction fixtures were not modified**.

---

## Live re-ingest (T-Mobile source only)

Path: `scrapeListingUrl` on source `6d79fc9a-…`, `webResearchLimit=0`.

| Pass | extracted | created | updated | content_items |
| --- | --- | --- | --- | --- |
| First (identity miss on UTC-day wrap) | 39 | 5 | 34 | 45 |
| After deleting those 5 content dupes (no Calendar rows) and matching by ticket URL | 39 | **0** | **39** | **40** |

Source rows re-ingested: **39 extracted children updated in place** (plus 1 pre-existing short-title Hot Wheels / Megan Moroney leftovers still on the source, 40 total content rows).

### Clock counts after ingest (content_items, not Calendar)

| Class | n |
| --- | --- |
| Real extracted showtime (`startTime` set) | **14** |
| Legitimately date-only (hub/detail midnight, or rejected 03:30AM / TBD) | **26** |
| Remaining Chicago-midnight `T05:00Z` / `T06:00Z` | **0** |
| Duplicate ticket URLs | **0** |

The 14 clocks are TicketSqueeze cards with evening/afternoon times (Hot Wheels, PBR, Missouri vs Nebraska 7:00 PM, Big 12 sessions 11:30 AM / 6:00 PM / 4:00 PM / 5:00 PM).

The 26 date-only rows are concerts whose hub **and** detail JSON-LD are UTC midnight (Boone, Clapton, Doja Cat, …) plus Jayhawks/K-State/Hall of Fame/Big 12 all-sessions `03:30AM` chrome and NCAA `Time: TBD`.

### Still-suspicious / limitations

- Date-only instants are UTC midnight (`T00:00:00.000Z`). In Chicago that **displays** as the previous evening; Calendar `allDay` still keys off UTC midnight. That is existing date-only semantics, not a new invented clock.
- Concert showtimes are **not on the hub page**. Without a child ticket/detail clock, they stay date-only. That is correct for this source’s JSON-LD.
- 6:00 PM CST persists as `T00:00:00.000Z` next UTC day (true 6:00 PM Chicago). Do not read that as date-only; `extracted startTime` is `18:00:00`.
- Five content duplicates from the first ingest were deleted (no Calendar rows). Original rows were then updated.
- **Calendar suggestions still show old midnight `startAt` until a later projection.**

---

## Files changed

| File | Role |
| --- | --- |
| `services/core/src/ask-benson/jsonld-events.ts` | Midnight / 03:30AM UTC-labeled clocks not treated as showtimes |
| `services/core/src/ask-benson/jsonld-events.test.ts` | Hub JSON-LD midnight vs 18:30 vs 03:30 |
| `services/core/src/ask-benson/listing-showtime.ts` | Child-card overlay |
| `services/core/src/ask-benson/listing-showtime.test.ts` | 6:30 / 7:45 / date-only / chrome / TBD / Downtown OP / Family Shows |
| `services/core/src/ask-benson/listing-extract.ts` | `parseEventDate` date-only vs Chicago wall |
| `services/core/src/ask-benson/scrape-listing.ts` | Overlay on child fetch; update `eventStartsAt`; match by ticket URL |
| `services/core/src/datetime.ts` | `localWallTimeToUtc` |
