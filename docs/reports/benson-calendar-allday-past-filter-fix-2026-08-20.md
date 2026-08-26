# Dashboard Calendar all-day past-filter fix

Date: 2026-08-20  
Scope: **Dashboard Calendar past filtering only**  
Related: [all-day display/grouping fix](./benson-calendar-allday-display-fix-2026-08-20.md), [OPCC midnight day-shift proof](./benson-opcc-allday-midnight-day-shift-2026-08-20.md)

**No storage / API / content / Calendar-row mutations. No projection. No re-ingest.**

---

## Root cause

Grouping and all-day “when” labels already use shared day-key semantics:

- `allDay === true` → UTC `YYYY-MM-DD` encoded in `startAt`
- `allDay === false` → America/Chicago local day

The past filter still called:

```ts
isPriorCalendarDay(i.startAt)
```

That helper always converts `startAt` through **America/Chicago**. For an all-day row:

| Field | Value |
| --- | --- |
| `startAt` | `2026-08-28T00:00:00Z` |
| `allDay` | `true` |
| Grouping day | `2026-08-28` |
| `isPriorCalendarDay(startAt)` Chicago day | `2026-08-27` |

So on creator-local **Aug 28**, the event correctly appeared under Aug 28 but could be treated as **past** (Chicago Aug 27) and hidden when “show past” was off.

---

## Implementation summary

Extended `dashboard/lib/calendar-local-date.ts` with:

```ts
isPriorCalendarItemDay(item, now?)
  => getCalendarItemDayKey(item) < getLocalCalendarDay(now)
```

Same day-key rules as grouping. Does **not** infer all-day from UTC midnight alone — only `item.allDay === true`.

`dashboard/app/calendar/calendar-panel.tsx` past filter:

```ts
// before
!isPriorCalendarDay(i.startAt)

// after
!isPriorCalendarItemDay(i)
```

`isPriorCalendarDay` left intact for timed-only callers/tests.

---

## Files changed

| File | Change |
| --- | --- |
| `dashboard/lib/calendar-local-date.ts` | add `isPriorCalendarItemDay` |
| `dashboard/app/calendar/calendar-panel.tsx` | past filter uses `isPriorCalendarItemDay` |
| `dashboard/lib/calendar-local-date.test.ts` | past-filter regressions |
| `docs/reports/benson-calendar-allday-past-filter-fix-2026-08-20.md` | this report |

Unrelated files: **not changed**.

---

## Tests

```bash
cd dashboard && pnpm exec tsx --test lib/calendar-local-date.test.ts
```

**Result: 15 pass / 0 fail** (3 suites)

| Suite | Count |
| --- | ---: |
| Existing `calendar-local-date` | 5 |
| All-day display/grouping (prior fix) | 5 |
| All-day past filter (this fix) | 5 |

Past-filter cases:

1. `2026-08-28T00:00:00Z` + `allDay=true`, today Aug 28 → **not past**  
2. Same item, today Aug 29 → **past**  
3. Same item, today Aug 27 → **not past** (future)  
4. Timed `allDay=false` → Chicago comparison unchanged (matches `isPriorCalendarDay`)  
5. UTC midnight + `allDay=false` → Chicago path (past on Aug 28); all-day twin not past  

---

## Before / after examples

| Item | Today (Chicago) | Before (`isPriorCalendarDay`) | After (`isPriorCalendarItemDay`) |
| --- | --- | --- | --- |
| All-day Woman of Influence `2026-08-28T00:00:00Z` | Aug 28 | treated as Aug 27 → **past / hidden** | Aug 28 → **not past / visible** |
| Same | Aug 29 | past | past |
| Same | Aug 27 | not past | not past |
| Timed evening Aug 21 CT (`…T01:00:00Z` next UTC day) | Aug 22 | past | past (unchanged) |
| Midnight UTC + `allDay=false` | Aug 28 | past (Chicago Aug 27) | past (unchanged; not all-day branch) |

Past filtering now **agrees with all-day grouping**. Timed behavior unchanged.

---

## Confirmation

| Check | Result |
| --- | --- |
| Data / `content_items` / `creator_calendar_items` changed | **no** |
| Calendar projection / re-ingest | **not run** |
| Storage / `parseEventDate` / `candidateFromInventory` / API | **unchanged** |
| Grouping / `formatWhen` behavior from prior fix | **unchanged** |
| OPCC / HPNA / T-Mobile / CommUNITY / Bowline / Downtown OP / Family Shows ingestion | **not touched** |

---

## Out of scope (discovered, not fixed)

No new blockers found in this pass beyond the intended past-filter bug.

Still out of scope if revisited later:

- Changing how date-only events are **stored** (still `T00:00:00Z` + `allDay=true`)
- Google Calendar export / sync all-day day semantics
- Server-side eligibility “past event” checks that may still use Chicago conversion on bare instants without `allDay`
