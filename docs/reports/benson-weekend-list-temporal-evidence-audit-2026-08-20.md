# Weekend List temporal evidence audit (date-only vs timed T00:00Z)

Date: 2026-08-20  
Scope: **Read-only** — does Weekend List suffer the same true date-only vs real timed `T00:00:00Z` ambiguity that Calendar population just fixed?  
Related: [Calendar thin evidence fix](./benson-calendar-inventory-temporal-evidence-fix-2026-08-20.md), [midnight timed evidence audit](./benson-calendar-server-midnight-timed-evidence-audit-2026-08-20.md)

**Code changed: no. Data changed: no. Projection / re-ingest: not run. `stale_freshness`: not investigated.**

---

## Verdict: **BUG**

Weekend List **does not distinguish** a real timed `T00:00Z` event from a true date-only `T00:00Z` event.

It always interprets occurrence days with `getLocalCalendarDay(..., America/Chicago)` on the persisted ISO instant. There is no load-time extracted `startTime` / bare `YYYY-MM-DD` evidence on the Weekend List path.

| Kind | What happens today | Correct? |
| --- | --- | --- |
| **True date-only** (`startTime=null`, UTC midnight) | Chicago shifts to **previous** local day | **no** (proven: Woman of Influence → Aug 27, intended Aug 28) |
| **Real timed @ T00:00Z** (e.g. 18:00 local) | Chicago day of instant matches intended local day | **day yes, accidentally**; time label **no** (`startTimeLabel` treats UTC midnight as “no clock”) |
| Ordinary non-midnight timed | Chicago day + wall clock label | yes |

So the failure mode is the **mirror** of Calendar’s pre-evidence `past_event` bug: Calendar’s blind Chicago key hurt timed rows when it used a date-only fallback without evidence; Weekend List’s blind Chicago key **hurts true date-only** and happens to place timed `T00:00Z` on the right day while stripping their time display.

---

## Exact Weekend List load / normalization path

`loadWeekendList` (`services/core/src/creator-calendar/weekend-list.ts`):

1. `loadByBoard('Weekend')` — planner board membership (`contentItemId`, notes, status)
2. `loadInventoryForIds(ids)`:
   - `db.select({ ...inventoryLoadContentItemSelect, sourceName, sourceType })`
   - **Does not** use `calendarInventoryExtractedTemporalSelect`
   - `normalizeInventoryItem(item, sourceName, sourceType)` — **no** `{ temporalEvidence }`
3. `toWeekendListSource(item, notes)` — copies `eventDate` / `eventEndDate` ISO only; drops any chance of temporal evidence (none was loaded anyway)
4. `buildWeekendList(sources, now)`:
   - `occurrenceDayKeys(eventDate, eventEndDate)` → **always** `getLocalCalendarDay`
   - `dayKeyForWindow` → Fri/Sat/Sun bucket
   - `startTimeLabel(eventDate)` → returns **null** if UTC hours/minutes/seconds are all `0`
5. Related membership helper `itemBelongsOnCurrentWeekendList` → `eventFallsInChicagoWeekend` → also **always** `getLocalCalendarDay` (same blind Chicago day)

Calendar population (already fixed) additionally selects three jsonb paths and passes `temporalEvidence` into normalize; Weekend List does not.

---

## Temporal fields retained vs lost

| Field | On `content_items` | After Weekend List select | After normalize | Used for day placement | Used for time label |
| --- | --- | --- | --- | --- | --- |
| `event_starts_at` | yes | yes → `eventDate` | yes | yes (Chicago only) | yes (UTC-midnight ⇒ null) |
| `event_ends_at` | yes | yes → `eventEndDate` | yes | yes (Chicago only) | no |
| `raw_payload.extracted.eventDate` | yes on sample | **lost** | lost | no | no |
| `raw_payload.extracted.eventEndDate` | yes on sample | **lost** | lost | no | no |
| `raw_payload.extracted.startTime` | yes for timed sample | **lost** | lost | no | no |
| `metadata.extracted` | usually absent | absent | absent | no | no |
| `InventoryItem.temporalEvidence` | n/a | **null / unset** | unset | no | no |
| Explicit allDay flag | n/a | none | none | no | no |

**Information-loss point:** `loadInventoryForIds` uses shared `inventoryLoadContentItemSelect` only (omits `raw_payload`) and does not attach the Calendar thin temporal projection.

**Wrong-day branch (date-only):** `occurrenceDayKeys` lines ~143–150:

```ts
const start = getLocalCalendarDay(new Date(eventDate), timezone);
```

For `2026-08-28T00:00:00.000Z` → `2026-08-27`.

**Wrong time-label branch (timed T00Z):** `startTimeLabel` lines ~125–129:

```ts
if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) return null;
```

Treats every UTC-midnight instant as “no displayable clock,” including real 6 PM / 7 PM local shows stored as `T00:00Z`.

---

## Bounded live rows inspected (5)

Production-shaped Weekend List load: shared inventory select → `normalizeInventoryItem` (no temporalEvidence) → same day/time helpers as `buildWeekendList`.

### 1. Woman of Influence — true date-only

| | |
| --- | --- |
| id | `0e56903e-c364-4756-9563-875d3235b765` |
| persisted start | `2026-08-28T00:00:00.000Z` |
| raw extracted | `eventDate=2026-08-28`, `startTime=null` |
| after Weekend load | ISO only; `temporalEvidence` unset; no metadata.extracted |
| Weekend day keys | **`2026-08-27`** |
| `startTimeLabel` | `null` |
| intended | **2026-08-28** |
| correct | **no** |

### 2. Big 12 Session 2 — timed 6 PM → T00Z

| | |
| --- | --- |
| id | `eaca7e7f-2828-490f-b096-14165b3646c4` |
| persisted start | `2027-03-10T00:00:00.000Z` |
| raw extracted | `eventDate=2027-03-09T18:00:00`, `startTime=18:00:00` |
| after Weekend load | ISO only; evidence lost |
| Weekend day keys | **`2027-03-09`** |
| intended day | **2027-03-09** |
| day correct | **yes** (blind Chicago) |
| `startTimeLabel` | **`null`** (should show evening clock) |
| time correct | **no** |

### 3. Big 12 Session 4 — timed 6 PM → T00Z

| | |
| --- | --- |
| id | `e0949f9c-75d1-4881-8ab0-e0c7a31b05f7` |
| persisted start | `2027-03-11T00:00:00.000Z` |
| raw extracted | `startTime=18:00:00` |
| Weekend day keys | **`2027-03-10`** (intended) |
| day correct | **yes** |
| `startTimeLabel` | **`null`** |
| time correct | **no** |

### 4. Come From Away — timed 7 PM → T00Z

| | |
| --- | --- |
| id | `a132e46e-3d4d-46ea-a2ef-fa0ff82862c0` |
| persisted start | `2026-09-02T00:00:00.000Z` |
| raw extracted | `startTime=19:00:00` |
| Weekend day keys | **`2026-09-01`** (intended) |
| day correct | **yes** |
| `startTimeLabel` | **`null`** |
| time correct | **no** |

### 5. Inspiring Women — ordinary non-midnight timed control

| | |
| --- | --- |
| id | `1695ee52-8ca5-4cc3-8ec2-417d77fcbbf6` |
| persisted start | `2026-08-21T08:00:00.000Z` |
| Weekend day keys | **`2026-08-21`** |
| `startTimeLabel` | `3:00 AM` |
| intended | Aug 21 |
| correct | **yes** (day); clock quality of 3 AM is separate |

---

## True date-only vs timed T00Z comparison

| | Woman of Influence (A) | Big 12 Session 2 (B) |
| --- | --- | --- |
| Stored instant | `T00:00:00Z` | `T00:00:00Z` |
| Raw `startTime` | `null` | `18:00:00` |
| Evidence after Weekend load | none | none |
| Weekend day via Chicago | Aug 27 | Mar 9 |
| Intended | Aug 28 | Mar 9 |
| Distinguished by Weekend List? | **no** — same algorithm for both |

Critical answer: **No.** Weekend List cannot tell A from B; both are “Chicago day of ISO.” That coincides with B’s intended day and breaks A.

---

## Can Calendar’s thin temporal projection be reused?

**Yes.** Existing:

- `calendarInventoryExtractedTemporalSelect`
- `temporalEvidenceFromCalendarRow`
- `normalizeInventoryItem(..., { temporalEvidence })`
- `inventoryTemporalDayKey(...)`

live under `creator-calendar/population/inventory-temporal-evidence.ts` (+ eligibility helper). They do **not** require changing shared `inventoryLoadContentItemSelect`.

Weekend List `loadInventoryForIds` can mirror Calendar `collectInventoryCandidates`: spread the same three jsonb aliases, pass evidence into normalize, then use `inventoryTemporalDayKey` (or equivalent) inside `occurrenceDayKeys` / weekend membership instead of raw `getLocalCalendarDay`.

Optionally rename/move the select helper to a shared calendar-module name (e.g. drop the “calendarInventory” prefix) when wiring Weekend List — still one thin projection, not a second parser.

---

## Recommended smallest fix (do **not** implement here)

1. In `loadInventoryForIds`, reuse `calendarInventoryExtractedTemporalSelect` + `temporalEvidenceFromCalendarRow` + `normalizeInventoryItem(..., { temporalEvidence })`.
2. Carry `temporalEvidence` on `WeekendListSource` (or keep `InventoryItem` through placement).
3. Change `occurrenceDayKeys` (and ideally `eventFallsInChicagoWeekend` / `itemBelongsOnCurrentWeekendList`) to use `inventoryTemporalDayKey` for start/end.
4. Teach `startTimeLabel` to honor retained `startTime` when the ISO is UTC midnight but evidence proves a real clock (do not invent times; do not parse titles).

Do not load full `raw_payload`. Do not add source-specific exceptions.

---

## Confirmations

| | |
| --- | --- |
| Code changed | **no** |
| Data changed | **no** |
| Projection / re-ingest | **not run** |
| `stale_freshness` investigated | **no** |

---

## Out of scope

1. Whether these five rows are currently on the planner Weekend board — audit is path/semantics, not live board membership.  
2. Inspiring Women 3:00 AM clock quality.  
3. Come From Away `eventEndsAt` before start quirks.  
4. Frontend Weekend List UI beyond server day/time helpers.  
5. Calendar population (already fixed) — compared only for reuse.
