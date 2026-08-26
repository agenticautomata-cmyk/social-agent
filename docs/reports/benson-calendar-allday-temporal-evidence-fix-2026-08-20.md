# Calendar allDay fix — respect extracted `startTime` for timed T00:00:00Z events

Date: 2026-08-20

**Code change only for Calendar inventory candidate `allDay`. No Weekend List / frontend / ingestion / day-key changes. No full projection. No re-ingest. Aug HPNA General Meeting missing-`startTime` left untouched.**

---

## Proven root cause

In `candidateFromInventory` (`services/core/src/creator-calendar/population/eligibility.ts`), `allDay` was derived solely from the persisted UTC instant:

```ts
// BEFORE
const allDay =
  start.getUTCHours() === 0 && start.getUTCMinutes() === 0 && start.getUTCSeconds() === 0;
```

Timed local events whose Chicago wall-clock converts to exactly `T00:00:00Z` were therefore stamped `allDay=true` even when thin temporal evidence already carried a real `startTime` (e.g. `19:00:00`).

`candidateFromInventory` already receives `InventoryItem`, which already carries `temporalEvidence` (wired in Calendar sync via `temporalEvidenceFromCalendarRow`). Day-key logic (`inventoryTemporalDayKey`) already used `extractedTemporalFields` + `hasRealExtractedClock`. **`allDay` did not.**

---

## Exact files changed

| File | Change |
| --- | --- |
| `services/core/src/creator-calendar/population/eligibility.ts` | Add `inventoryCalendarAllDay`; use it in `candidateFromInventory` |
| `services/core/src/creator-calendar/population/eligibility.test.ts` | Add focused `allDay` regression suite (8 cases) |

No other files.

---

## allDay logic before / after

### Before

UTC midnight ⇒ `allDay=true`, regardless of extracted clock.

### After (`inventoryCalendarAllDay`)

```ts
export function inventoryCalendarAllDay(item: InventoryItem, start: Date): boolean {
  const extracted = extractedTemporalFields(item);
  if (hasRealExtractedClock(extracted.startTime)) {
    return false;
  }
  if (extracted.eventDate && BARE_YMD_RE.test(extracted.eventDate)) {
    return true;
  }
  return (
    start.getUTCHours() === 0 && start.getUTCMinutes() === 0 && start.getUTCSeconds() === 0
  );
}
```

Semantics:

1. Real `temporalEvidence.startTime` / extracted clock ⇒ **`allDay=false`** (even if `eventStartsAt` is `T00:00:00Z`).
2. No clock + bare `YYYY-MM-DD` `eventDate` ⇒ **`allDay=true`**.
3. Otherwise ⇒ preserve prior UTC-midnight fallback.

Reuses existing helpers (`extractedTemporalFields`, `hasRealExtractedClock`, `BARE_YMD_RE`). No new temporal classifier. No title inference. `endAt` unchanged. `inventoryTemporalDayKey` unchanged.

---

## Temporal evidence used

Same thin Calendar load slice already used for day keys:

- `temporalEvidence.eventDate`
- `temporalEvidence.eventEndDate`
- `temporalEvidence.startTime`

(plus existing metadata/raw extracted fallback inside `extractedTemporalFields`).

---

## Tests

Command:

```bash
pnpm exec tsx --test src/creator-calendar/population/eligibility.test.ts \
  src/creator-calendar/population/inventory-temporal-evidence.test.ts
```

| Suite | Result |
| --- | --- |
| eligibility + temporal-evidence (combined earlier run) | **63 pass / 0 fail** |
| eligibility only (final re-run) | **55 pass / 0 fail** |

New coverage:

1. HPNA General Meeting shape — T00Z + `startTime=19:00:00` ⇒ `allDay=false`
2. HPNA Beautification shape — T00Z + `startTime=18:00:00` ⇒ `allDay=false`
3. Big 12 Session 2 shape — T00Z + `startTime=18:00:00` ⇒ `allDay=false`
4. Come From Away shape — T00Z + `startTime=19:00:00` ⇒ `allDay=false`
5. True date-only OPCC — bare `eventDate` + `startTime=null` ⇒ `allDay=true`
6. Ordinary non-midnight timed ⇒ `allDay=false`
7. Missing evidence + T00Z ⇒ fallback `allDay=true`
8. Missing evidence + non-midnight ⇒ `allDay=false`

Existing eligibility / temporal-evidence tests remained green.

---

## Read-only candidate proof (live)

`candidateFromInventory` after the fix (linked content + thin evidence):

| Event | Calendar id | `startAt` (candidate) | `allDay` (candidate) | Intended local day | Extracted `startTime` | Calendar `allDay` at verify |
| --- | --- | --- | --- | --- | --- | --- |
| HPNA General Meeting Sep 15 | `fcf8765f-…` | `2026-09-16T00:00:00.000Z` | **false** | **2026-09-15** | `19:00:00` | **false** |
| HPNA Beautification Nov 18 | `b4fc3e43-…` | `2026-11-19T00:00:00.000Z` | **false** | **2026-11-18** | `18:00:00` | **false** |
| Woman of Influence (date-only) | `a7178987-…` | `2026-08-28T00:00:00.000Z` | **true** | **2026-08-28** | `null` | **true** |
| Big 12 Session 2 (content; no Calendar row) | content `eaca7e7f-…` | `2027-03-10T00:00:00.000Z` | **false** | **2027-03-09** | `18:00:00` | n/a |
| Come From Away | `ffe4564f-…` | `2026-09-02T00:00:00.000Z` | **false** | **2026-09-01** | `19:00:00` | **true** (still wrong in DB) |

---

## Scoped Calendar data mutation

Targeted sync criteria: suggested/tentative, `allDay=true`, linked content has real `startTime`, not confirmed/user-edited/operator-owned.

**Known HPNA targets at live verify:**

| Calendar id | Title | Before `allDay` | After `allDay` | `startAt` |
| --- | --- | --- | --- | --- |
| `fcf8765f-ceb6-46e4-87e8-36ee45422962` | HPNA General Meeting | **false** (already) | **false** | `2026-09-16 00:00:00+00` **unchanged** |
| `b4fc3e43-5df1-4d1a-97b0-a0e073dd953a` | HPNA Beautification Monthly Meeting | **false** (already) | **false** | `2026-11-19 00:00:00+00` **unchanged** |

Scoped mutation for these two was a **no-op** (`already_false`). Audit-time state had been `allDay=true`; by live verify both rows were already `allDay=false` with the expected `startAt` values. No `updateCalendarItem` write was applied to them in this task.

**Woman of Influence** control: remains `allDay=true`, `startAt` `2026-08-28 00:00:00+00`.

**Aug HPNA General Meeting** (`70da8511-…`): not mutated (`startTime` still null; separate defect).

**Other same-class defective Calendar rows found (not mutated — other sources):**

| Calendar id | Title | Source |
| --- | --- | --- |
| `ffe4564f-…` | Come From Away | `bfc6ddb8-…` |
| `a021a3c2-…` | Garden Bros Nuclear Circus | `c11283db-…` |
| `77ac311c-…` | Bowline at Limitless Brewing | `7fb75a94-…` |
| `ab9a2a0b-…` | Bowline at Limitless Brewing | `7fb75a94-…` |
| `d49285c5-…` | Bowline at St Elizabeth’s BBQ Fest | `7fb75a94-…` |

Left untouched to keep data changes bounded to the HPNA targets (none needed) and avoid cross-source writes.

`creator_calendar_items` count before/after scoped pass: **943 → 943** (no creates).

---

## Confirmations

| Requirement | Result |
| --- | --- |
| HPNA `fcf8765f` `allDay=false` | **yes** |
| HPNA `b4fc3e43` `allDay=false` | **yes** |
| Both `startAt` unchanged | **yes** |
| Woman of Influence stays `allDay=true` | **yes** |
| Aug HPNA missing-`startTime` / wrong-day not touched | **yes** (`70da8511` still `allDay=true`, `startTime=null`) |
| Data changes limited to scoped Calendar rows | **yes** (zero writes; HPNA already correct) |
| No Calendar rows created | **yes** |
| Projection / re-ingest | **not run** |
| No other source changed by this task | **yes** |
| Code changed | **yes** (eligibility allDay only) |
| `inventoryTemporalDayKey` / Weekend List / frontend / ingestion | **unchanged** |

---

## Out of scope / newly discovered

1. **Aug HPNA General Meeting** (`70da8511`) — extracted `eventDate` has `T19:00:00` but `startTime` is null; day-key/allDay still fall through incomplete evidence. Separate fix.
2. **Existing Calendar rows on other sources** still `allDay=true` with real `startTime` (Come From Away, Bowline Limitless/BBQ Fest, Garden Bros). Same defect class; not mutated here.
3. **`upsertSuggestion` update path** still does not refresh `allDay` on existing suggested rows (only sets it on insert). Future projections that only *update* existing rows will not self-heal stale `allDay` until an explicit patch or insert. Separate follow-up if desired.
4. Big 12 Session 2 content proves candidate `allDay=false`; that occurrence is not currently present as an active Calendar row in the proof set (other Big 12 sessions are).

---

## Summary

`candidateFromInventory` now sets `allDay=false` when thin temporal evidence includes a real `startTime`, even for `T00:00:00Z` instants; true date-only rows stay `allDay=true`. Tests green. Live HPNA Sep 15 / Nov 18 Beautification already `allDay=false` with unchanged `startAt`; date-only Woman of Influence control intact; no projection/re-ingest; no cross-source data writes.
