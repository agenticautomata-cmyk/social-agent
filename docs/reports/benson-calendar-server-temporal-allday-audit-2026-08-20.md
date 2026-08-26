# Server-side Calendar eligibility temporal checks — date-only / all-day audit

Date: 2026-08-20  
Scope: **Read-only** audit of temporal paths in `evaluateInventoryCalendarEligibility` / `candidateFromInventory`  
Related UI fixes: [all-day display](./benson-calendar-allday-display-fix-2026-08-20.md), [all-day past filter](./benson-calendar-allday-past-filter-fix-2026-08-20.md)

**Code changed: no. Data changed: no. Projection / re-ingest: not run.**

---

## Verdict: **BUG**

Server-side inventory Calendar eligibility **can mark single-day date-only events as `past_event` one Chicago day too early**.

Proven on Woman of Influence (and The Calling) when `NOW` is the intended event calendar day.

`isOperatorTemporallyCurrent` / `evaluateTemporalState` already handle UTC-midnight date-only correctly. The failure is a **separate** `past_event` branch that always runs `getLocalCalendarDay` on the bare instant (Chicago), ignoring date-only semantics.

---

## Exact temporal eligibility code path

`evaluateInventoryCalendarEligibility(item, now)` (`services/core/src/creator-calendar/population/eligibility.ts`):

| Order | Check | Helper | Date-only aware? |
| --- | --- | --- | --- |
| 1 | `not_temporally_current` | `isOperatorTemporallyCurrent` → `evaluateTemporalState` | **Yes** — UTC midnight → date-only; expands to Chicago start/end of **UTC YYYY-MM-DD** |
| 2 | `stale_freshness` | `isAudienceFreshContent` | Instant math / 24h window — not day-key based |
| 3 | **`past_event`** | `getLocalCalendarDay(start)` vs `getLocalCalendarDay(now)` (+ end) | **No** — always America/Chicago on the instant |
| … | geo / identity / etc. | — | n/a |

Failing branch (lines ~265–270):

```ts
const start = new Date(item.eventDate);
const todayKey = getLocalCalendarDay(now);       // Chicago
const eventKey = getLocalCalendarDay(start);     // Chicago — shifts UTC midnight back 1 day
if (eventKey < todayKey && (!item.eventEndDate || getLocalCalendarDay(new Date(item.eventEndDate)) < todayKey)) {
  return { ok: false, reason: 'expired', detail: 'past_event' };
}
```

`candidateFromInventory` only **sets** `allDay` from UTC midnight; it does **not** participate in temporal eligibility. Eligibility runs on `InventoryItem` **before** / without requiring the candidate’s `allDay` flag.

---

## Date-only evidence available at eligibility time

| Signal | Available on `InventoryItem`? | Notes |
| --- | --- | --- |
| `eventDate` ISO (`…T00:00:00.000Z`) | **yes** | From `content_items.event_starts_at` |
| `eventEndDate` ISO | **yes** | May also be UTC midnight |
| `raw_payload.extracted.eventDate` (`YYYY-MM-DD`) | via `metadata` / raw payload if loaded | Present on OPCC rows audited |
| `raw_payload.extracted.startTime` | via raw payload | `null` for true date-only |
| `candidate.allDay` | **not** on inventory input | Derived later in `candidateFromInventory` |
| Explicit `dateOnly` metadata flag | **no** | — |

Reliable distinction for a fix:

- **A (date-only):** extracted `eventDate` is `YYYY-MM-DD` and `startTime` null, **or** reuse existing `isDateOnlyTimestamp` (UTC midnight) as `evaluateTemporalState` already does  
- **B (timed):** non-midnight instant and/or real `startTime`

Do **not** rely on midnight alone if a real timed `00:00` local event must stay timed — prefer extracted `startTime` when present; UTC-midnight sentinel remains the feed convention already used by `temporal-state.ts`.

---

## Bounded rows inspected

| # | Row | content id | Intended date | Extracted | Stored start | Chicago day of start |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Woman of Influence (OPCC) | `0e56903e-…` | **2026-08-28** | `eventDate=2026-08-28`, `startTime=null` | `2026-08-28T00:00:00Z` | **2026-08-27** |
| 2 | Just Between Friends (OPCC) | `e342a110-…` | **2026-09-02**–06 | date-only start/end | `…09-02T00:00:00Z` / end `09-06` | start → **09-01** |
| 3 | KHA Convention (OPCC) | `31deca08-…` | **2026-09-10**–11 | date-only | `…09-10T00:00:00Z` / end `09-11` | start → **09-09** |
| 4 | Inspiring Women (timed OPCC) | `1695ee52-…` | Aug 21 timed | `startTime=03:00:00` | `2026-08-21T08:00:00Z` | **2026-08-21** (aligned) |
| 5 | The Calling (OPCC date-only) | `e3fd2608-…` | **2026-08-28** | date-only | `2026-08-28T00:00:00Z` | **2026-08-27** |

---

## Controlled NOW results

`NOW` ≈ Chicago noon (`…T17:00:00Z` in CDT season).  
Intended for single-day date-only: day-before = future/eligible; **event day = current / NOT past**; day-after = past/expired.

### 1. Woman of Influence (single-day date-only) — **fails**

| NOW (Chicago day) | `eventKey` | Intended | Actual eligibility | Detail |
| --- | --- | --- | --- | --- |
| Aug 27 | Aug 27 | eligible | **ok** | — |
| **Aug 28** | Aug 27 | **NOT past** | **`past_event`** | **one day early** |
| Aug 29 | Aug 27 | past | `stale_freshness` | (after `opCurrent` already false) |

Note: `isOperatorTemporallyCurrent` was still **true** on Aug 28 — only the later `past_event` branch killed it.

### 2. Just Between Friends (multi-day date-only)

| NOW | Actual | Notes |
| --- | --- | --- |
| Sep 1 | ok | — |
| Sep 2 (start day) | ok | `past_event` avoided because shifted **end** day (Sep 5 Chicago) still ≥ today |
| Sep 3 | `stale_freshness` | audience freshness; not `past_event` |

Wrong day keys still used; multi-day end masks the same-day `past_event` failure.

### 3. KHA Convention (multi-day date-only)

| NOW | Actual | Notes |
| --- | --- | --- |
| Sep 9 | ok | — |
| Sep 10 (start day) | ok | end key still covers today after −1 shift |
| Sep 11 | `stale_freshness` | — |

### 4. Inspiring Women (timed control)

| NOW | Actual |
| --- | --- |
| Aug 20 | ok |
| Aug 21 | ok |
| Aug 22 | stale / not current |

Timed control does **not** show the date-only −1 day `past_event` bug (Chicago day matches intended).

### 5. The Calling (single-day date-only) — **same bug as #1**

On Chicago **Aug 28** → `past_event` (eventKey Aug 27).

---

## Exact failure branch

**Function:** `evaluateInventoryCalendarEligibility`  
**Detail:** `past_event`  
**Mechanism:** `getLocalCalendarDay(new Date(item.eventDate))` on UTC-midnight date-only stamps yields **previous** Chicago calendar day, so when creator-local today equals the intended UTC date, `eventKey < todayKey` is true. For single-day events, end is also midnight the same UTC date → end key also behind → both conditions fire.

**Not** the failure point: `evaluateTemporalState` / `isOperatorTemporallyCurrent` (already date-only aware via `isDateOnlyTimestamp` + UTC YMD as intended day).

---

## Recommended smallest fix (do not implement in this task)

In the `past_event` comparison only (and symmetrically for `eventEndDate` when it is date-only):

Reuse the existing server helper pattern from `temporal-state.ts`:

- `isDateOnlyTimestamp(start)` → compare using **UTC `YYYY-MM-DD`** (`start.toISOString().slice(0, 10)`), same as `calendarDayKey` there  
- else → keep `getLocalCalendarDay(start)` (timed / Chicago)

Optionally prefer `raw_payload.extracted.eventDate` when it is a bare `YYYY-MM-DD` and `startTime` is null — but aligning with `isDateOnlyTimestamp` is the smallest generic match to operator temporal authority already in-repo.

Do **not** change `candidateFromInventory` allDay derivation in that same change unless needed for consistency elsewhere.

---

## Confirmation

| | |
| --- | --- |
| Code changed | **no** |
| Data changed | **no** |
| Projection / re-ingest | **not run** |
| Frontend / Today / Discover ranking | **not inspected** (out of scope) |

---

## Out of scope (newly observed)

1. **`isAudienceFreshContent`** can reject multi-day date-only rows with `stale_freshness` while `isOperatorTemporallyCurrent` is still true (e.g. JBF Sep 3). Separate freshness policy — not the `past_event` day-key bug.  
2. Timed OPCC JSON-LD clocks that look like odd early-morning walls (Inspiring Women 3:00 AM) — clock quality, not this audit.  
3. Inverted `eventEndsAt` before start on some timed OPCC rows — known class of end-time bugs; not expanded here.
