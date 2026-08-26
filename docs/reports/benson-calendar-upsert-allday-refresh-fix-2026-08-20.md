# Calendar upsertSuggestion — refresh `allDay` on existing mutable suggestions

Date: 2026-08-20 (report written 2026-08-21)

**Code-only fix. No live Calendar mutation. No projection. No re-ingest. `candidateFromInventory` / `inventoryCalendarAllDay` unchanged.**

Related: [allDay temporal-evidence fix](./benson-calendar-allday-temporal-evidence-fix-2026-08-20.md).

---

## Proven root cause

`candidateFromInventory` already stamps correct `allDay` (real `startTime` ⇒ false; bare date-only ⇒ true; else UTC-midnight fallback).

But `upsertSuggestion` only applied `allDay` on **INSERT**. The **existing-row UPDATE** branch never copied `candidate.allDay`, so stale suggestions could remain `allDay=true` forever across normal population refreshes.

### Exact existing upsert branch (before)

```ts
if (existing) {
  const patch = {
    updatedAt: now,
    verificationState: verification,
    metadata: meta,
    // fill-ins: sourceUrl, internalDetailUrl, location, notes, fingerprints, …
  };
  // allDay intentionally absent
  await db.update(creatorCalendarItems).set(patch)…
  return 'updated';
}
// INSERT path only:
allDay: candidate.allDay ?? false,
```

Fields previously refreshed on update: `updatedAt`, `verificationState`, `metadata`, plus conditional fill-ins (`sourceUrl`, `internalDetailUrl`, `location`, `notes`, fingerprint/idempotency/populationSource/calendarIntent when missing, and content_item source upgrade). **Not `allDay`. Not `startAt` / title.**

---

## Ownership / edit protections inspected

Gate at top of `upsertSuggestion`:

```ts
if (existing && isProtected(existing)) return 'preserved';
```

`isProtected` / exported `isProtectedCalendarSuggestion`:

| Guard | Effect |
| --- | --- |
| `userEditedAt` set | preserve |
| `planningStatus` ∈ `{confirmed, dismissed, cancelled, completed, missed}` | preserve |
| `createdBy === 'kellie'` **and** `populationSource == null` | preserve (operator/manual) |

`suggested` and `tentative` Benson-populated rows are **not** protected and enter the update path. Confirmed / user-edited / operator-manual never receive the allDay patch.

No new ownership framework — same gate as the rest of upsert.

---

## Exact files changed

| File | Change |
| --- | --- |
| `services/core/src/creator-calendar/population/sync.ts` | Export `isProtectedCalendarSuggestion` + `planSuggestionUpsertAllDay`; set `allDay` on mutable update patch |
| `services/core/src/creator-calendar/population/sync.test.ts` | Focused allDay refresh / protection regressions |

---

## Update semantics before / after

### Before

| Path | `allDay` |
| --- | --- |
| INSERT | `candidate.allDay ?? false` |
| UPDATE (mutable) | **unchanged** (stale value kept) |
| UPDATE (protected) | no write (`preserved`) |

### After

| Path | `allDay` |
| --- | --- |
| INSERT | unchanged (`candidate.allDay ?? false`) |
| UPDATE (mutable) | **`candidate.allDay ?? false`** (authoritative refresh) |
| UPDATE (protected) | unchanged (`preserved` before patch) |

Not changed: idempotency keys, `sourceRecordId` semantics (except existing content_item upgrade), `startAt`, title, eligibility, temporal evidence, Weekend List, frontend.

---

## Tests

```bash
pnpm exec tsx --test \
  src/creator-calendar/population/eligibility.test.ts \
  src/creator-calendar/population/sync.test.ts
```

| Result | Count |
| --- | ---: |
| Pass | **69** |
| Fail | **0** |

New suite (`upsertSuggestion allDay refresh on existing mutable rows`):

1. suggested `true` → candidate `false` ⇒ `updated` / `allDay=false` (not create)
2. suggested `false` → candidate `true` ⇒ `updated` / `allDay=true`
3. already matching ⇒ `updated` with same value (idempotent plan)
4. confirmed ⇒ `preserved`
5. user-edited ⇒ `preserved`
6. operator/manual (`kellie` + no `populationSource`) ⇒ `preserved`
7. no existing ⇒ `created` with candidate allDay
8. tentative remains refreshable

Existing population dedupe/merge + eligibility tests remained green.

---

## Read-only live proof (no writes)

Five known stale rows — corrected upsert **would** safely refresh; **not** applied in this task:

| Calendar id | Title | existing `allDay` | candidate `allDay` | `startAt` | extracted `startTime` | status | ownership | would safely update |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ffe4564f-…` | Come From Away | **true** | **false** | `2026-09-02 00:00:00+00` | `19:00:00` | suggested | `benson_inventory` / scrape_listing | **yes** |
| `a021a3c2-…` | Garden Bros Nuclear Circus | **true** | **false** | `2026-08-24 00:00:00+00` | `19:00:00` | suggested | same | **yes** |
| `77ac311c-…` | Bowline at Limitless Brewing | **true** | **false** | `2026-08-21 00:00:00+00` | `19:00:00` | suggested | same | **yes** |
| `ab9a2a0b-…` | Bowline at Limitless Brewing | **true** | **false** | `2026-09-18 00:00:00+00` | `19:00:00` | suggested | same | **yes** |
| `d49285c5-…` | Bowline at St Elizabeth’s BBQ Fest | **true** | **false** | `2026-09-19 00:00:00+00` | `19:00:00` | suggested | same | **yes** |

All five: `userEditedAt=null`, `isProtected=false`, plan `outcome=updated` with `allDay=false`. Candidate `startAt` / title match existing identity (no startAt rewrite in upsert).

### Controls

| Row | existing `allDay` | candidate `allDay` | Note |
| --- | --- | --- | --- |
| Woman of Influence (`a7178987-…`) | **true** | **true** | date-only control; refresh would be no-op |
| HPNA Sep 15 General (`fcf8765f-…`) | **false** | **false** | timed T00Z control; already correct |

`creator_calendar_items` count during proof: **943** (unchanged by this task).

---

## Confirmations

| Requirement | Result |
| --- | --- |
| Live data changed | **no** |
| Calendar rows created | **no** |
| Projection / re-ingest | **not run** |
| `candidateFromInventory` / `inventoryCalendarAllDay` | **unchanged** |
| Confirmed / user-edited / operator rows protected | **yes** (same `isProtected` gate) |
| true→false and false→true refresh proven in tests | **yes** |
| Aug HPNA missing-`startTime` / wrong-day | **out of scope** (not touched) |

---

## Out of scope / newly discovered

1. **Healing the five live stale rows** — deferred; next normal Calendar population that hits `upsertSuggestion` for those matches will refresh `allDay` under this fix. Do not run projection solely for that in this task.
2. **Aug HPNA General Meeting** (`70da8511`) missing `startTime` / wrong-day — still separate.
3. Upsert still does **not** refresh `startAt` / title on update (pre-existing; intentional for this scoped change).

---

## Summary

Mutable suggestion updates now set `allDay` from the current candidate under the existing `isProtected` gate. Stale `allDay=true` suggestions with timed evidence will self-heal on the next safe upsert; protected rows stay untouched. Live rows were only read for proof — not mutated.
