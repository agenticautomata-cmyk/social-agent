# HPNA Aug 18 General Meeting — one-row startTime repair

Date: 2026-08-20 (executed 2026-08-21)

**No code changes. No Calendar projection. No full HPNA re-ingest. One content row + one Calendar row only.**

Related audit: [benson-hpna-aug-general-meeting-starttime-audit-2026-08-20.md](./benson-hpna-aug-general-meeting-starttime-audit-2026-08-20.md)

---

## Targets

| | Id |
| --- | --- |
| Content | `7e2bc7e5-54ca-49f4-808b-24049d7c5606` |
| Calendar | `70da8511-5d64-4fe4-9eba-fbb6962809e1` |
| Event | HPNA General Meeting — Tue Aug 18, 2026 — 7:00–8:00 PM — Pilgrim Chapel |

---

## Pre-mutation proof

Live parse of `https://www.hydeparkkc.org/events` via `extractEditorialContainerOpportunities`:

| Field | Value |
| --- | --- |
| title | HPNA General Meeting |
| eventDate | `2026-08-18T19:00:00` |
| startTime | `19:00:00` |
| eventEndDate | `2026-08-18T20:00:00` |
| venue | Pilgrim Chapel |

DB identity checks (all passed):

- content still linked; `eventDate=2026-08-18T19:00:00`; `eventStartsAt=2026-08-19T00:00:00Z`
- Calendar `sourceRecordId` = this content; `suggested`; `userEditedAt=null`; `isProtected=false`

---

## Mutations

### Content (narrow `jsonb_set` only)

| Field | Before | After |
| --- | --- | --- |
| `extracted.startTime` | absent | **`19:00:00`** |
| `extracted.eventEndDate` | absent | **`2026-08-18T20:00:00`** (parser-proven) |
| `extracted.eventDate` | `2026-08-18T19:00:00` | unchanged |
| title / venue / location / sourceUrl / sourceExternalId | — | unchanged |
| `eventStartsAt` | `2026-08-19T00:00:00Z` | **unchanged** |
| `eventEndsAt` | null | **`2026-08-19T01:00:00Z`** via normal `parseEventDate` + `sanitizeEventEndInstant` of parser end |

Extracted keys added only: `startTime`, `eventEndDate`. No keys removed. Entire `raw_payload` object not replaced.

### Calendar

| Field | Before | After |
| --- | --- | --- |
| `allDay` | true | **false** (`updateCalendarItem`) |
| `startAt` | `2026-08-19T00:00:00Z` | unchanged |
| title / sourceRecordId / planningStatus / ownership | — | unchanged |

---

## Post-repair re-eval

Thin temporal evidence reload:

| | Value |
| --- | --- |
| `temporalEvidence.startTime` | `19:00:00` |
| `inventoryTemporalDayKey` | **`2026-08-18`** |
| `candidateFromInventory.allDay` | **false** |
| `candidate.startAt` | `2026-08-19T00:00:00.000Z` |

---

## Sep 15 control (read-only)

| | Value |
| --- | --- |
| startTime | `19:00:00` |
| day key | `2026-09-15` |
| Calendar `allDay` | false |

Not mutated.

---

## Global safety

| Metric | Before | After |
| --- | ---: | ---: |
| `content_items` | 5956 | **5956** |
| `creator_calendar_items` | 951 | **951** |
| `calendar_dismissal_feedback` | 33 | **33** |
| Other content updated | — | **none** |
| Other Calendar ids updated | — | **none** |

| Confirmation | |
| --- | --- |
| Code changed | **no** |
| Projection / full re-ingest | **not run** |
| Replacement rows | **none** |

---

## Summary

Restored missing `startTime` (and parser-proven `eventEndDate`) on the Aug 18 content row; day key is now **2026-08-18**; Calendar `allDay` flipped to **false** with `startAt` preserved.
