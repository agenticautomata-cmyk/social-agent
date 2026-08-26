# JSON-LD eventEndsAt before eventStartsAt — fix

Date: 2026-08-20  
Live proof target: CommUNITY Fest content `00f95609-5077-4410-ae54-a52f439c83b8`  
URL: `https://unitedwaygkc.org/event/community-fest-2026/`

**Scope:** invalid end-time persistence only. No Calendar projection, no Calendar status change, no CommUNITY classification / eligibility / container / dedupe work, no other sources.

---

## Proven root cause

Not offset loss on start (start was already correct). Not a stale non-update alone.

**Branch:** JSON-LD `endDate` clock was parsed, then **discarded**.

| Step | What happened |
| --- | --- |
| Raw JSON-LD | `endDate = 2026-11-06T14:00:00-06:00` |
| `splitDateTime` in `jsonld-events.ts` | Correctly split → date `2026-11-06`, time `14:00:00` |
| `eventFromNode` | Stored **`endDate: end.date` only**; **no `endTime` field** (start kept `startTime`) |
| `jsonLdEventsToOpportunities` | `eventEndDate: ev.endDate` → date-only `2026-11-06` |
| `parseEventDate('2026-11-06')` | `2026-11-06T00:00:00.000Z` (date-only → midnight UTC) |
| Persist | `eventEndsAt` midnight UTC **before** `eventStartsAt` `14:00Z` |

So `2026-11-06T14:00:00-06:00` became `2026-11-06T00:00:00Z` via **end-time truncation to date-only**, then date-only midnight semantics — not a separate endTime field failing at persist, and not inventing an overnight.

---

## Fix (generic)

1. Add `endTime` on `JsonLdEvent`; populate from `splitDateTime`.
2. `composeJsonLdOpportunityDates` — mirror start composition; bump end calendar day +1 when same-day end clock is before start (overnight).
3. Wire through `jsonLdEventsToOpportunities` and `jsonLdToBlocks`.
4. `sanitizeEventEndInstant` — never persist `end < start` (drops inverted date-only ends without inventing a clock). Used in scrape-listing + collect-from-link insert/update paths.

No CommUNITY Fest hardcoding.

---

## Files changed

| File | Change |
| --- | --- |
| `services/core/src/ask-benson/jsonld-events.ts` | `endTime` + `composeJsonLdOpportunityDates` |
| `services/core/src/ask-benson/editorial-container.ts` | use compose for opportunities |
| `services/core/src/ask-benson/container-event-blocks.ts` | use compose for JSON-LD blocks |
| `services/core/src/ask-benson/listing-extract.ts` | `sanitizeEventEndInstant` |
| `services/core/src/ask-benson/scrape-listing.ts` | sanitize on create/update |
| `services/core/src/ask-benson/collect-from-link.ts` | sanitize on persist |
| `services/core/src/ask-benson/jsonld-events.test.ts` | regression cases |

---

## Tests

```bash
pnpm exec tsx --test \
  src/ask-benson/jsonld-events.test.ts \
  src/ask-benson/editorial-container.test.ts \
  src/ask-benson/container-event-blocks.test.ts
```

**31 pass / 0 fail**, including:

1. `08:00-06:00` / `14:00-06:00` → `14:00Z` / `20:00Z`  
2. Same-day timed end > start  
3. Overnight next-day end preserved (+ same-date overnight clock bump)  
4. No endDate → no invented end  
5. Date-only end semantics preserved  
6. Downtown OP / Family Shows / Panda Fest container tests still green  

---

## Live proof (CommUNITY Fest re-ingest only)

`scrapeListingUrl` on the single event URL. **No Calendar projection.**

| | Before | After |
| --- | --- | --- |
| `eventStartsAt` | `2026-11-06T14:00:00.000Z` | `2026-11-06T14:00:00.000Z` (unchanged) |
| `eventEndsAt` | `2026-11-06T00:00:00.000Z` | **`2026-11-06T20:00:00.000Z`** |
| end > start | no | **yes** |
| content rows (CommUNITY URL/topic) | 3 | **3** (no new content) |
| Calendar rows | 1 suggested `8185be73-…` | **1 suggested same id** (untouched) |
| Calendar `end_at` | still stale midnight | **not updated** (no projection — by design) |

Scrape result: `created: 0`, `updated: 2` (same content id twice from extract path), `extractedCount: 2` — no duplicate content/calendar rows created.

---

## Calendar touched?

**No.** Status remains `suggested`; no cancel/create/repoint; projection not run. Stale Calendar `end_at` is expected until a future scoped Calendar sync (out of this task).
