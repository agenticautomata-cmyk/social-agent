# Dashboard Calendar all-day day-shift fix

Date: 2026-08-20  
Scope: **Dashboard Calendar presentation only**  
Related investigation: [OPCC all-day midnight day-shift proof](./benson-opcc-allday-midnight-day-shift-2026-08-20.md)

**No storage / API / content / Calendar-row mutations. No projection. No re-ingest. No OPCC/HPNA/T-Mobile/CommUNITY/Bowline/Downtown OP/Family Shows ingestion changes.**

---

## Problem

Date-only Calendar items are stored correctly as:

- `startAt = YYYY-MM-DDT00:00:00Z`
- `allDay = true`

The dashboard was converting that instant through **America/Chicago** for both day bucketing and the all-day “when” label. UTC midnight → prior Chicago evening → **previous calendar day**.

### Proven live examples (before fix)

| Event | Intended / source | Dashboard showed |
| --- | --- | --- |
| Woman of Influence | 2026-08-28 | Aug 27 |
| Just Between Friends | 2026-09-02 | Sep 1 |
| Kansas Hospital Association Convention | 2026-09-10 | Sep 9 |

Timed OPCC controls (`allDay = false`) were already correct for day keys.

---

## Broken path (before)

`dashboard/app/calendar/calendar-panel.tsx`:

1. **`groupByDay()`** always called `getLocalCalendarDay(item.startAt)` (Chicago).
2. **`formatWhen()`** for `allDay=true` used `toLocaleDateString(..., { timeZone: 'America/Chicago' })`.

`allDay` was set at population time but **ignored** for grouping / all-day labeling.

Note: `dashboard/lib/datetime.ts` `formatDate` already anchored UTC midnight at noon for generic date display; Calendar panel did not use that path.

---

## Fix

### New helpers — `dashboard/lib/calendar-local-date.ts`

| Helper | Behavior |
| --- | --- |
| `getAllDayCalendarDay(date)` | UTC `YYYY-MM-DD` from `startAt` (`timeZone: 'UTC'`) |
| `getCalendarItemDayKey({ startAt, allDay })` | `allDay === true` → UTC date key; else existing Chicago `getLocalCalendarDay` |
| `formatCalendarAllDayWhen(date)` | Compact label via UTC (e.g. `Fri, Aug 28`) |

**Branch rule:** date-only semantics apply **only** when `item.allDay === true`.  
UTC midnight with `allDay === false` continues through normal Chicago handling (legitimate timed midnight).

### Wiring — `dashboard/app/calendar/calendar-panel.tsx`

- `groupByDay` → `getCalendarItemDayKey(item)`
- `formatWhen` → `formatCalendarAllDayWhen(item.startAt)` when `allDay`; timed path unchanged (`America/Chicago` wall clock)

---

## Files changed

| File | Change |
| --- | --- |
| `dashboard/lib/calendar-local-date.ts` | all-day helpers |
| `dashboard/app/calendar/calendar-panel.tsx` | use helpers for group + when |
| `dashboard/lib/calendar-local-date.test.ts` | focused regressions |

---

## Tests

```bash
cd dashboard && pnpm exec tsx --test lib/calendar-local-date.test.ts
```

**Result: 10 pass / 0 fail**

| # | Case | Expected |
| --- | --- | --- |
| 1 | `2026-08-28T00:00:00Z`, `allDay=true` | day `2026-08-28`, label `Fri, Aug 28` |
| 2 | `2026-09-02T00:00:00Z`, `allDay=true` | day `2026-09-02`, label `Wed, Sep 2` |
| 3 | `2026-09-10T00:00:00Z`, `allDay=true` (KHA multi-day start) | day `2026-09-10`, label `Thu, Sep 10` |
| 4 | timed OPCC-style `allDay=false` | Chicago-local day unchanged |
| 5 | `2026-08-28T00:00:00Z`, `allDay=false` | **not** UTC-date semantics → `2026-08-27` Chicago |

---

## After (same three OPCC fixtures)

| Event | Day key | Label |
| --- | --- | --- |
| Woman of Influence | **2026-08-28** | Fri, Aug 28 |
| Just Between Friends | **2026-09-02** | Wed, Sep 2 |
| KHA Convention | **2026-09-10** | Thu, Sep 10 |

Timed controls: unchanged Chicago-local behavior.

---

## Explicit non-changes

| Item | Status |
| --- | --- |
| Data / `content_items` / `creator_calendar_items` | **unchanged** |
| `parseEventDate` / `candidateFromInventory` / Calendar API | **unchanged** |
| Calendar projection / re-ingest | **not run** |
| Storage semantics for date-only instants | **unchanged** |
| HPNA / T-Mobile / CommUNITY / Bowline / Downtown OP / Family Shows | **not touched** |

---

## Out of scope (noted, not fixed here)

`calendar-panel.tsx` still filters “past” via `isPriorCalendarDay(i.startAt)`, which converts through Chicago and can treat an all-day UTC-midnight start as the prior evening. That is a separate past-filter concern; this task fixed **grouping + when label** only.
