# Server Calendar eligibility `past_event` date-only day-key fix

Date: 2026-08-20  
Scope: **Only** the `past_event` comparison inside `evaluateInventoryCalendarEligibility`  
Prior audit: [benson-calendar-server-temporal-allday-audit-2026-08-20.md](./benson-calendar-server-temporal-allday-audit-2026-08-20.md)

**Data changed: no. Projection / re-ingest: not run. `stale_freshness` policy: not changed.**

---

## Proven root cause

`evaluateInventoryCalendarEligibility` compared inventory start/end to “today” with:

```ts
getLocalCalendarDay(new Date(item.eventDate))  // America/Chicago
```

True date-only rows stored as UTC midnight (`2026-08-28T00:00:00.000Z`) convert to the **previous** Chicago calendar day (`2026-08-27`). On the intended event day (Aug 28 Chicago), single-day date-only events incorrectly returned `detail = past_event`.

`isOperatorTemporallyCurrent` / `evaluateTemporalState` already treated UTC-midnight as date-only using the encoded UTC `YYYY-MM-DD`. The bug was only the separate `past_event` branch.

---

## Exact files changed

| File | Change |
| --- | --- |
| `services/core/src/creator-calendar/population/eligibility.ts` | Added `inventoryTemporalDayKey` (+ small extracted-field helpers); `past_event` branch uses it for start and end |
| `services/core/src/creator-calendar/population/eligibility.test.ts` | Focused regressions for date-only / timed / UTC-midnight+clock |
| `docs/reports/benson-calendar-server-temporal-allday-fix-2026-08-20.md` | This report |

**Not changed:** `temporal-state.ts`, `candidateFromInventory`, frontend Calendar, storage/`content_items`/`creator_calendar_items`, freshness policy, Today / Discover / ranking, OPCC extraction, HPNA / T-Mobile / CommUNITY / Bowline / Downtown OP / Family Shows.

---

## Exact date-only evidence used

Preference order inside `inventoryTemporalDayKey`:

1. **Timed evidence:** `metadata.extracted.startTime` or `metadata.rawPayload.extracted.startTime` matches a real clock (`HH:MM…`) → **America/Chicago** `getLocalCalendarDay(instant)`.
2. **True date-only evidence:** extracted `eventDate` / `eventEndDate` (for end) is bare `YYYY-MM-DD` → use that encoded day.
3. **Conservative fallback** (when extracted evidence absent): existing `isDateOnlyTimestamp` (UTC midnight sentinel, same convention as `temporal-state.ts`) → UTC `YYYY-MM-DD` via `toISOString().slice(0, 10)`.
4. Otherwise → Chicago local day.

Do **not** reclassify as date-only when extracted `startTime` proves a real clock, even if the stored instant is exactly `T00:00:00.000Z`.

Live inventory load for Calendar often omits `raw_payload`; OPCC rows in this verify had **no** `metadata.extracted`. Fallback (3) is what fixed Woman of Influence / The Calling day keys in production-shaped loads.

---

## Helper / branch implemented

**Helper:** `inventoryTemporalDayKey(iso, item, which: 'start' | 'end')`

**Branch** (only `past_event` in `evaluateInventoryCalendarEligibility`):

```ts
const todayKey = getLocalCalendarDay(now);
const eventKey = inventoryTemporalDayKey(item.eventDate, item, 'start');
const endKey = inventoryTemporalDayKey(item.eventEndDate, item, 'end');
if (eventKey && eventKey < todayKey && (!endKey || endKey < todayKey)) {
  return { ok: false, reason: 'expired', detail: 'past_event' };
}
```

---

## Tests run

Command:

```bash
cd services/core && node --import tsx --test src/creator-calendar/population/eligibility.test.ts
```

| | |
| --- | --- |
| Result | **41 pass / 0 fail** |
| Suites | 4 |

Covered:

1. Woman of Influence–style bare `YYYY-MM-DD` + `startTime: null` — eligible Aug 27 & Aug 28; after day not eligible; day key `2026-08-28`
2. The Calling equivalent — not `past_event` on Aug 28
3. Multi-day date-only start/end keys (`2026-08-28` / `2026-08-30`) — mid-range not past by day-key rule; after end is past by day-key rule
4. Timed OPCC-style — Chicago local day unchanged
5. Real timed event at UTC midnight with non-null `startTime` — Chicago day, **not** UTC YMD
6. Existing eligibility suite remains green (incl. geography / container-child / curator-lead / category stamp)

---

## Controlled before/after (bounded rows, read-only)

Loaded live `content_items` via inventory normalize (no writes). Controlled `NOW` ≈ Chicago noon (`…T17:00:00Z`).

### Before (audit / old Chicago-instant keys)

| Row | NOW Chicago Aug 28 | Old start key | Detail |
| --- | --- | --- | --- |
| Woman of Influence (`0e56903e-…`) | Aug 28 | **2026-08-27** | **`past_event`** |
| The Calling (`e3fd2608-…`) | Aug 28 | **2026-08-27** | **`past_event`** |

### After (this fix)

| Row | content id | Stored start | New start key | NOW | ok | detail | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Woman of Influence | `0e56903e-…` | `2026-08-28T00:00:00Z` | **2026-08-28** | Aug 27 | **true** | — | |
| Woman of Influence | | | **2026-08-28** | **Aug 28** | **true** | — | **no `past_event`** |
| Woman of Influence | | | **2026-08-28** | Aug 29 | false | `stale_freshness` | freshness before past (unchanged policy) |
| The Calling | `e3fd2608-…` | `2026-08-28T00:00:00Z` | **2026-08-28** | **Aug 28** | false | `editorial_container` | **not** `past_event`; day key fixed |
| Just Between Friends | `e342a110-…` | Sep 2–6 UTC midnight | start **09-02** / end **09-06** | Sep 2 | **true** | — | intended start day |
| KHA Convention | `31deca08-…` | Sep 10–11 UTC midnight | start **09-10** / end **09-11** | Sep 10 | **true** | — | intended start day |
| Inspiring Women (timed) | `1695ee52-…` | `2026-08-21T08:00:00Z` | **2026-08-21** (= old Chicago) | Aug 20 / 21 | **true** | — | **unchanged** timed behavior |

Simulated old vs new on Woman of Influence @ Aug 28 noon Chicago:

| | event key | `eventKey < todayKey` |
| --- | --- | --- |
| Old `getLocalCalendarDay` | `2026-08-27` | **true** → `past_event` |
| New `inventoryTemporalDayKey` | `2026-08-28` | **false** → not past |

---

## Confirmations

| Check | Status |
| --- | --- |
| Timed UTC-midnight + extracted clock regression protected | **yes** (unit test: startTime present → Chicago, not UTC YMD) |
| `stale_freshness` changed | **no** |
| Code scope limited to eligibility `past_event` + helper/tests/report | **yes** |
| Data changed | **no** |
| Projection / re-ingest run | **not run** |
| `temporal-state.ts` / `candidateFromInventory` / frontend Calendar | **untouched** |

---

## Remaining related issues (out of scope)

1. **`stale_freshness`:** After the intended UTC-midnight day (and often mid multi-day ranges), `isAudienceFreshContent` can reject with `stale_freshness` before `past_event` is evaluated. Not fixed here.
2. **The Calling `editorial_container`:** After the day-key fix, Aug 28 no longer fails as `past_event`, but this row still fails eligibility as `editorial_container`. Separate content/identity issue.
3. Live Calendar inventory load often lacks `raw_payload.extracted`; day-key fix relies on `isDateOnlyTimestamp` fallback unless extracted fields are present on `metadata`.
4. Timed OPCC end-before-start quirks (e.g. Inspiring Women end at UTC midnight) — not part of this fix.
