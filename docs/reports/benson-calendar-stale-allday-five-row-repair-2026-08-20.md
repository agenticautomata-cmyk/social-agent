# Bounded live repair — five stale `allDay=true` Calendar suggestions

Date: 2026-08-20 (executed 2026-08-21)

**No code changes. No Calendar projection. No re-ingest. Only the five explicit Calendar ids below were written.**

Related:
- [allDay temporal-evidence fix](./benson-calendar-allday-temporal-evidence-fix-2026-08-20.md)
- [upsertSuggestion allDay refresh](./benson-calendar-upsert-allday-refresh-fix-2026-08-20.md)

---

## Exact five full Calendar ids

| # | Title | Calendar id |
| ---: | --- | --- |
| 1 | Come From Away | `ffe4564f-b61e-4a8c-a4eb-6962eda75488` |
| 2 | Garden Bros Nuclear Circus | `a021a3c2-18d5-429e-83c9-d577b593769a` |
| 3 | The Bowline Brothers at Limitless Brewing | `77ac311c-9bde-46c3-af8e-5a70235da178` |
| 4 | The Bowline Brothers at Limitless Brewing | `ab9a2a0b-8f3a-419c-b386-87853cc2b26a` |
| 5 | The Bowline Brothers at St Elizabeth’s BBQ Fest | `d49285c5-3e41-4fdd-a4f7-c45c1d6d5c9d` |

---

## Mutation method

`upsertSuggestion` is module-private (not exported). Repair used the same safety gates and the same authoritative field write that the corrected upsert update path performs for mutable suggestions:

1. Re-load linked content → `candidateFromInventory`
2. `isProtectedCalendarSuggestion(existing) === false`
3. `planSuggestionUpsertAllDay(...)` ⇒ `{ outcome: 'updated', allDay: false }`
4. `candidate.allDay === false` and `candidate.startAt` matches existing occurrence
5. `updateCalendarItem(id, { allDay: false })` — only field written

No SQL hand-edit of `all_day`. No replacement rows. No projection window.

---

## Pre-mutation safety checks

For each of the five, immediately before write:

| Check | Result |
| --- | --- |
| `planningStatus` | all `suggested` |
| `userEditedAt` | all `null` |
| Ownership | all `createdBy=benson_inventory` |
| `isProtectedCalendarSuggestion` | all `false` |
| Linked content → candidate | resolved |
| `candidate.allDay` | all `false` |
| `candidate.startAt` vs existing | match |
| Duplicate / create needed | no |

**Rows skipped:** none.

---

## Rows updated (5 / 5)

| Calendar id | Title | before `allDay` | after `allDay` | `startAt` |
| --- | --- | --- | --- | --- |
| `ffe4564f-…` | Come From Away | **true** | **false** | `2026-09-02T00:00:00.000Z` unchanged |
| `a021a3c2-…` | Garden Bros Nuclear Circus | **true** | **false** | `2026-08-24T00:00:00.000Z` unchanged |
| `77ac311c-…` | Bowline Limitless | **true** | **false** | `2026-08-21T00:00:00.000Z` unchanged |
| `ab9a2a0b-…` | Bowline Limitless | **true** | **false** | `2026-09-18T00:00:00.000Z` unchanged |
| `d49285c5-…` | Bowline St Elizabeth’s BBQ Fest | **true** | **false** | `2026-09-19T00:00:00.000Z` unchanged |

### Identity / status preserved

For all five after write:

| Field | Preserved |
| --- | --- |
| Calendar id | yes |
| title | yes |
| `startAt` | yes |
| `endAt` | yes |
| location | yes |
| `sourceRecordId` | yes |
| `planningStatus` | `suggested` |
| `createdBy` | `benson_inventory` |
| `userEditedAt` | still `null` |

---

## Controls (read-only)

| Row | id | `allDay` | Note |
| --- | --- | --- | --- |
| Woman of Influence | `a7178987-6b5f-4724-9324-6a3ad1cc60a5` | **true** | unchanged |
| HPNA Sep 15 General Meeting | `fcf8765f-ceb6-46e4-87e8-36ee45422962` | **false** | unchanged |
| Aug HPNA General Meeting | `70da8511-5d64-4fe4-9eba-fbb6962809e1` | true | **not touched** (out of scope) |

---

## Global safety

| Metric | Before | After |
| --- | ---: | ---: |
| `creator_calendar_items` | 943 | **943** |
| `content_items` | 5956 | **5956** |
| `calendar_dismissal_feedback` | 33 | **33** |
| Other Calendar ids updated in task window | — | **none** |

---

## Confirmations

| Requirement | Result |
| --- | --- |
| Five rows `allDay` true → false | **yes** |
| No rows created | **yes** |
| No content_items changed | **yes** |
| No dismissal fingerprints | **yes** |
| No other Calendar rows changed | **yes** |
| Code changed | **no** |
| Projection / re-ingest | **not run** |
| Aug HPNA missing-`startTime` / wrong-day | **out of scope** (untouched) |

---

## Summary

All five proven-stale suggested rows were safely flipped to `allDay=false` with identity/`startAt`/status/ownership preserved. Controls intact. No creates, no projection, no code change.
