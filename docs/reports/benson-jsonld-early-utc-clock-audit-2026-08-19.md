# Audit: UTC-labeled 01:00–05:59 JSON-LD clock rejection

Date: 2026-08-19  
Scope: narrow the T-Mobile showtime fix so generic JSON-LD parsing does not discard legitimate early UTC clocks.  
Companion to [benson-tmobile-showtime-2026-08-19.md](./benson-tmobile-showtime-2026-08-19.md).

**Calendar was not re-projected. The 94 Calendar rows were not touched. T-Mobile persisted rows were not re-ingested.**

---

## Verdict

| Question | Answer |
| --- | --- |
| Was the 01:00–05:59 rule global? | **Yes.** It lived in `jsonld-events.splitDateTime` via `isTrustworthyListingClock(..., { utcLabeled: true })`. |
| Was it already source-scoped? | **No.** Every caller of `parseJsonLdPageGraph` inherited it. |
| Code change required? | **Yes.** Rule narrowed into `overlayListingShowtime` only. |
| T-Mobile live state disturbed? | **No.** No re-ingest; representative rows unchanged. |

---

## What triggered this audit

The T-Mobile showtime fix added this logic to `splitDateTime`:

```ts
if ((opts?.utcLabeled ?? false) && hour >= 1 && hour <= 5) return false;
```

That rejected any `Z` / `+00:00` clock between 01:00 and 05:59 as “listing chrome.” It correctly blocked TicketSqueeze garbage such as:

- JSON-LD: `2026-12-06T03:30:00+00:00`
- Title: `Kansas Jayhawks vs. Missouri Tigers Tickets | 12/06/2026 03:30AM | T-Mobile Center`

But `splitDateTime` is the **generic** JSON-LD parser. It is not T-Mobile-specific.

---

## Call sites (all global before the fix)

`splitDateTime` is private; it runs whenever `parseJsonLdPageGraph` → `eventFromNode` parses `startDate` / `endDate`.

| Caller | Path | Effect of global 01–05 rule |
| --- | --- | --- |
| Listing scrape | `scrape-listing.ts` → hub JSON-LD merge | Hub Jayhawks node would lose `03:30:00` at parse time (overlay could not recover). |
| Ask Benson link | `collect-from-link.ts` | Any pasted page with early UTC JSON-LD would lose clock. |
| Editorial classifier | `editorial-container.ts` → `classifyEditorialContainer` | Event counts / child detection skewed. |
| Container blocks | `container-event-blocks.ts` → `jsonLdToBlocks` | Structured children from JSON-LD lose early clocks. |
| Listing overlay | `listing-showtime.ts` → `jsonLdClockForTitle` | Child ticket fetch re-parsed through the same global filter. |

**Conclusion:** the rule was **not** scoped to TicketSqueeze. It applied to every JSON-LD Event source in the repo.

---

## Bounded DB / fixture evidence of real early clocks

No full-window JSON-LD scan was run. A bounded sample (`LIMIT 25`) on `raw_payload.extracted.eventDate ~ 'T0[1-5]:'` found persisted rows that the global rule would corrupt on re-scrape:

| Topic | `eventDate` | `startTime` | Source shape |
| --- | --- | --- | --- |
| MVP Law Kansas City Seminar | `2026-09-16T03:00:00` | `03:00:00` | OPCC detail page |
| Blue Valley Education Breakfast 2026 | `2026-09-03T02:00:00` | `02:00:00` | OPCC detail page |
| Midwest Ability Summit 2026 | `2026-08-22T05:00:00` | `05:00:00` | OPCC detail page |
| Inspiring Women in Public Administration | `2026-08-21T03:00:00` | `03:00:00` | OPCC detail page |
| Kansas City Comic-Con | `2026-10-31T03:30:00-05:00` | null | UNation (real `-05:00` offset — unaffected by UTC rule, but shows early clocks exist) |

**Risk:** the next OPCC or similar re-ingest would strip `T03:00:00` / `T02:00:00` showtimes and leave date-only rows, even when those are legitimate seminar/breakfast times.

Existing tests already proved Family Shows real offsets survive:

- `2026-10-12T19:00:00-05:00` → `startTime: 19:00:00` (unchanged by this audit)

---

## Exact risk

1. **False negative on generic JSON-LD** — A real `2026-09-16T03:00:00Z` Event from an unrelated source would parse as date-only at the JSON-LD layer, before any listing/card evidence could corroborate it.
2. **Over-broad offset handling** — Missing offset on naive ISO (`2026-09-16T03:00:00`) was treated as UTC-labeled, so even non-TicketSqueeze naive timestamps in the 01–05 window were dropped.
3. **Jayhawks ambiguity** — At the JSON-LD layer, `2026-12-06T03:30:00+00:00` is indistinguishable from a hypothetical real 3:30 AM UTC event. The “this is chrome” signal lives in **title/card evidence** (`03:30AM`), not in the ISO string alone.

---

## Fix applied

### Generic JSON-LD (`jsonld-events.ts`) — midnight only

`isTrustworthyListingClock` now rejects **only midnight** (`00:00:00`). The `utcLabeled` option and `isUtcishOffset` helper were removed.

`splitDateTime` behavior after narrow:

| Input | `startDate` | `startTime` |
| --- | --- | --- |
| `2026-08-31T00:00:00+00:00` | `2026-08-31` | null (date-only placeholder) |
| `2026-10-03T18:30:00+00:00` | `2026-10-03` | `18:30:00` (TicketSqueeze wall clock preserved at parse) |
| `2026-12-06T03:30:00+00:00` | `2026-12-06` | `03:30:00` (survives at parse; overlay decides trust) |
| `2026-09-16T03:00:00Z` | `2026-09-16` | `03:00:00` (legitimate generic UTC clock survives) |
| `2026-10-12T19:00:00-05:00` | `2026-10-12` | `19:00:00` (Family Shows — unchanged) |

### Listing overlay (`listing-showtime.ts`) — TicketSqueeze chrome only

Early-AM rejection moved here, where title/card evidence exists:

| Helper | Role |
| --- | --- |
| `evidenceHasEarlyAmChrome(text)` | `\b0?[1-5]:\d{2}\s*a\.?m\.?\b` in title/text |
| `parseListingCardShowtime` | Rejects `1–5 AM` on slash-date card titles (existing) |
| `jsonLdIsTicketChrome` | JSON-LD clock is 01–05 **and** evidence has early AM chrome |
| `overlayListingShowtime` | Skips JSON-LD/card clocks when `jsonLdIsTicketChrome`; clears time when `ticketChromeAm` |

**Jayhawks path:** JSON-LD parses `03:30:00`, but overlay sees `03:30AM` in the title → `ticketChromeAm` → final `startTime: null`, `eventDate: 2026-12-06`.

**Generic 03:00Z path:** JSON-LD parses `03:00:00`, no AM chrome in evidence → overlay keeps `startTime: 03:00:00`.

**Verified T-Mobile behaviors preserved:**

| Case | Still correct? |
| --- | --- |
| Hub/detail `T00:00:00+00:00` → date-only | Yes |
| Hot Wheels `18:30+00:00` → 6:30 PM Chicago | Yes |
| PBR `19:45+00:00` → 7:45 PM Chicago | Yes |
| Jayhawks `03:30AM` chrome → date-only | Yes |
| `Time: TBD` → date-only | Yes |
| Family Shows `-05:00` clocks | Yes |
| Downtown OP card times | Yes |

---

## Files changed

| File | Change |
| --- | --- |
| `services/core/src/ask-benson/jsonld-events.ts` | Removed global 01–05 UTC rejection; midnight-only in `isTrustworthyListingClock` |
| `services/core/src/ask-benson/jsonld-events.test.ts` | Added `03:00Z` survival test; Jayhawks JSON-LD now asserts `03:30:00` at parse layer |
| `services/core/src/ask-benson/listing-showtime.ts` | Added `evidenceHasEarlyAmChrome` / `jsonLdIsTicketChrome`; overlay rejects chrome with evidence |
| `services/core/src/ask-benson/listing-showtime.test.ts` | Added generic `03:00Z` overlay regression |

No changes to Calendar eligibility, projection, scrape-listing persist logic, or T-Mobile DB rows in this pass.

---

## Tests

```bash
node --import tsx --test \
  src/ask-benson/listing-showtime.test.ts \
  src/ask-benson/jsonld-events.test.ts \
  src/ask-benson/container-event-blocks.test.ts \
  src/ask-benson/editorial-container.test.ts
```

Working directory: `services/core`.

**Result: 24 passed / 0 failed** (4 suites).

### Regression cases added or updated

| # | Case | Layer | Expected |
| --- | --- | --- | --- |
| 1 | Generic JSON-LD `2026-09-16T03:00:00Z` | `parseJsonLdPageGraph` | `startTime: 03:00:00` |
| 2 | Jayhawks `03:30AM` title + `T03:30:00+00:00` JSON-LD | `overlayListingShowtime` | date-only (`startTime: null`) |
| 3 | Hot Wheels `18:30+00:00` | parse + overlay | `18:30:00` → 6:30 PM Chicago instant |
| 4 | Benson Boone `T00:00:00+00:00` | parse | date-only |
| 5 | Family Shows `-05:00` | parse | `19:00:00` unchanged |
| 6 | Downtown OP Harvesting Hope | overlay | `T17:30:00` unchanged |
| 7 | Generic `03:00Z` with no AM chrome | overlay | `startTime: 03:00:00` kept |

---

## T-Mobile live persisted state (not disturbed)

No re-ingest. No Calendar projection. Representative rows after the code change (read-only check):

| Event | `eventStartsAt` | `extracted.startTime` | Status |
| --- | --- | --- | --- |
| Jayhawks vs Missouri | `2026-12-06T00:00:00.000Z` | null | date-only (chrome rejected at overlay during prior ingest) |
| Hot Wheels 10/03 6:30 PM | `2026-10-03T23:30:00.000Z` | `18:30:00` | real clock |
| PBR 10/23 7:45 PM | `2026-10-24T00:45:00.000Z` | `19:45:00` | real clock |

Calendar suggestions for these content rows still reflect the **pre-fix projection** until a later projection pass.

---

## Design note for future work

**Parse layer vs trust layer:**

- **Parse:** keep structured data faithfully (midnight placeholders → date-only; real ISO clocks → `HH:MM:SS`).
- **Trust (listing overlay):** use corroborating evidence (title AM chrome, TBD, card shape) to decide whether a parsed clock becomes `eventStartsAt`.

Do not put TicketSqueeze-specific heuristics back into `splitDateTime` unless they are guarded by source URL or ingest path — generic JSON-LD must remain source-agnostic.

---

## Frozen (untouched in this pass)

- Calendar projection / 94 created rows
- T-Mobile re-ingest
- listing_chrome / venue_as_title eligibility guards
- editorial-container classifier
- shared-hub persistence
- Downtown OP / Family Shows extraction fixtures (behavior verified green)
- Alexa / Discover / Today / ranking
