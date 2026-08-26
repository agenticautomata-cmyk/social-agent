# Weekend List temporal evidence fix

Date: 2026-08-20  
Scope: Weekend List server day/time semantics for true date-only vs real timed `T00:00:00Z`  
Prior audit: [benson-weekend-list-temporal-evidence-audit-2026-08-20.md](./benson-weekend-list-temporal-evidence-audit-2026-08-20.md)

**Data changed: no. Projection / re-ingest: not run. Board membership unchanged. `stale_freshness` not investigated/changed. Shared `inventoryLoadContentItemSelect` not expanded. Full `raw_payload` not loaded into InventoryItem.**

---

## Proven root cause

Weekend List `loadInventoryForIds` used only shared `inventoryLoadContentItemSelect` (no thin extracted fields) and called `normalizeInventoryItem` without `temporalEvidence`.

Day placement (`occurrenceDayKeys`) and membership (`eventFallsInChicagoWeekend`) always used blind `getLocalCalendarDay` on the ISO instant. True date-only UTC midnight shifted −1 Chicago day (Woman of Influence → Aug 27).

`startTimeLabel` treated every UTC-midnight instant as “no clock,” so real timed `T00:00Z` rows lost their evening labels even when day placement happened to be correct via Chicago conversion.

---

## Exact files changed

| File | Change |
| --- | --- |
| `services/core/src/creator-calendar/weekend-list.ts` | Thin temporal SELECT in load; `temporalEvidence` on `WeekendListSource`; evidence-aware day keys + time labels |
| `services/core/src/creator-calendar/weekend-things-to-do.ts` | `eventFallsInChicagoWeekend` uses `inventoryTemporalDayKey` (+ optional evidence) |
| `services/core/src/creator-calendar/weekend-list.test.ts` | Production-shaped day/time/membership regressions |
| `services/core/src/creator-calendar/population/inventory-temporal-evidence.ts` | Comment only: helper shared by Calendar + Weekend List |
| `docs/reports/benson-weekend-list-temporal-evidence-fix-2026-08-20.md` | This report |

---

## Exact existing Calendar helpers reused

- `calendarInventoryExtractedTemporalSelect`
- `temporalEvidenceFromCalendarRow`
- `normalizeInventoryItem(..., { temporalEvidence })`
- `inventoryTemporalDayKey(...)`

No second jsonb projection. No rename required (comment updated to note Weekend List reuse).

---

## Weekend List load path before / after

**Before**

```
loadInventoryForIds
→ inventoryLoadContentItemSelect
→ normalizeInventoryItem(item)          // no temporalEvidence
→ toWeekendListSource                   // ISO dates only
→ buildWeekendList                      // blind Chicago days; UTC-midnight ⇒ no time
```

**After**

```
loadInventoryForIds
→ inventoryLoadContentItemSelect
  + calendarInventoryExtractedTemporalSelect   // three jsonb text paths only
→ normalizeInventoryItem(item, …, { temporalEvidence })
→ toWeekendListSource                   // + temporalEvidence
→ buildWeekendList                      // inventoryTemporalDayKey; evidence clock for labels
```

---

## Day-placement fix

`weekendOccurrenceDayKeys` (exported; replaces private blind helper) uses `inventoryTemporalDayKey` for start and end:

- true date-only → encoded UTC `YYYY-MM-DD`
- timed (incl. extracted clock at `T00:00Z`) → America/Chicago local day

---

## Membership-path fix

`eventFallsInChicagoWeekend(eventDate, eventEndDate, now, temporalEvidence?)` now uses the same `inventoryTemporalDayKey` semantics (optional evidence).

`itemBelongsOnCurrentWeekendList` passes `temporalEvidence` through.

Things To Do call sites that already have `InventoryItem` pass `item.temporalEvidence` when present (usually absent on shared inventory load — helper falls back to existing `isDateOnlyTimestamp` / Chicago rules).

---

## Time-label fix

`startTimeLabel(iso, timezone, temporalEvidence?)`:

1. If `temporalEvidence.startTime` matches a real clock → format wall clock (`18:00:00` → `6:00 PM`)
2. Else preserve prior behavior (UTC midnight ⇒ null; otherwise Chicago wall time from ISO)

Does not infer from titles. Does not treat `T00:00Z` alone as “no clock” when extracted `startTime` is present.

---

## Tests run

```bash
cd services/core && node --import tsx --test \
  src/creator-calendar/weekend-list.test.ts \
  src/creator-calendar/population/eligibility.test.ts \
  src/creator-calendar/population/inventory-temporal-evidence.test.ts
```

| | |
| --- | --- |
| Result | **67 pass / 0 fail** |

Includes existing Weekend List suite + new evidence cases + Calendar eligibility/temporal-evidence suites (shared helper wiring).

---

## Bounded production-shaped verification (5 rows)

Actual Weekend List–shaped load (shared select + thin temporal aliases → normalize → day/time helpers). No board mutation; ids exercised directly.

| Row | Day | Time | Correct |
| --- | --- | --- | --- |
| Woman of Influence | **2026-08-28** | none | **yes** |
| Big 12 Session 2 | **2027-03-09** | **6:00 PM** | **yes** |
| Big 12 Session 4 | **2027-03-10** | **6:00 PM** | **yes** |
| Come From Away | **2026-09-01** | **7:00 PM** | **yes** |
| Inspiring Women | **2026-08-21** | **3:00 AM** | **yes** (unchanged day; clock from extracted `03:00:00`) |

---

## Confirmations

| Check | Status |
| --- | --- |
| Full `raw_payload` on InventoryItem | **no** |
| Shared `inventoryLoadContentItemSelect` expanded | **no** |
| Calendar population path / `inventoryTemporalDayKey` semantics | **unchanged** (Weekend List consumes existing helper) |
| Data writes | **no** |
| Projection / re-ingest | **not run** |
| Planner board membership | **not changed** |
| `stale_freshness` | **not investigated / not changed** |

---

## Out of scope

1. **Things To Do eligibility tests** that call `isOperatorTemporallyCurrent` without a controlled `now` can fail when wall-clock is after fixture event dates (`reason: stale`) — pre-existing temporal-check wiring, not this day-key fix.  
2. Inspiring Women 3:00 AM clock quality.  
3. Come From Away end-before-start storage quirks (day list correctly collapses when end ≤ start).  
4. Frontend Weekend List panel beyond server labels.  
5. Expanding shared inventory loader for Discover/Today.
