# OPCC inverted `eventEndsAt` — bounded eight-row repair

Date: 2026-08-20 (executed 2026-08-21)

**No code changes. No Calendar projection. No full OPCC re-ingest. Start clocks untouched.**

Related audit: [benson-opcc-inverted-event-end-audit-2026-08-20.md](./benson-opcc-inverted-event-end-audit-2026-08-20.md)

---

## Source identity

| | |
| --- | --- |
| Name | Events Archive - Overland Park Convention Center |
| `sourceId` | `6ce4341e-5203-46d8-9ed9-0f6e7af25339` |

---

## Exact eight target content ids

1. `1695ee52-8ca5-4cc3-8ec2-417d77fcbbf6` — Inspiring Women in Public Administration Conference 2026  
2. `e1c13b2a-3eec-42d8-acff-cecbc8e1c52a` — Midwest Ability Summit 2026  
3. `fa2b2775-8b62-4abd-bf22-6aa0b492a420` — Trinity Temple 50th Anniversary Gala  
4. `28d18544-42f4-4715-b415-f7ac94c6a6e6` — India Fest 2026  
5. `d73d4acb-93c6-4d05-8587-b317ee09b8c8` — Hillcrest Transitional Housing 2026  
6. `28fc1697-abb1-4a0e-b8da-eca9748a3fda` — MINK Law Day 2026  
7. `ea3b1b49-07e7-42de-8061-856ad4de7c8a` — Blue Valley Education Breakfast 2026  
8. `2b0fc667-c575-4a88-acd0-54c1d1ae417c` — MVP Law Kansas City Seminar  

---

## Pre-mutation verification

For all eight: OPCC `sourceId` match; `eventStartsAt` + `eventEndsAt` present; `eventEndsAt < eventStartsAt`; detail URL resolved; current JSON-LD path matched by title + start day.

**Skipped:** none (0 class C).

---

## Classification + current-parser result

| Content id | Title | Class | Parsed `endTime` | Composed `eventEndDate` | Sanitized UTC end |
| --- | --- | --- | --- | --- | --- |
| `1695ee52-…` | Inspiring Women… | **A** | `11:30:00` | `2026-08-21T11:30:00` | `2026-08-21T16:30:00Z` |
| `e1c13b2a-…` | Midwest Ability… | **A** | `11:00:00` | `2026-08-22T11:00:00` | `2026-08-22T16:00:00Z` |
| `fa2b2775-…` | Trinity Temple Gala | **B** | null | `2026-08-22` (date-only) | **null** |
| `28d18544-…` | India Fest | **A** | `13:00:00` | `2026-08-23T13:00:00` | `2026-08-23T18:00:00Z` |
| `d73d4acb-…` | Hillcrest… | **A** | `16:00:00` | `2026-08-29T16:00:00` | `2026-08-29T21:00:00Z` |
| `28fc1697-…` | MINK Law Day | **A** | `13:00:00` | `2026-09-02T13:00:00` | `2026-09-02T18:00:00Z` |
| `ea3b1b49-…` | Blue Valley Breakfast | **A** | `04:00:00` | `2026-09-03T04:00:00` | `2026-09-03T09:00:00Z` |
| `2b0fc667-…` | MVP Law Seminar | **A** | `11:00:00` | `2026-09-16T11:00:00` | `2026-09-16T16:00:00Z` |

---

## Content repair results

| Title | Class | `eventStartsAt` | old `eventEndsAt` | new `eventEndsAt` | extracted end fields changed |
| --- | --- | --- | --- | --- | --- |
| Inspiring Women | A | unchanged `…08:00Z` | `…00:00Z` | **`…16:30Z`** | `eventEndDate` → `T11:30:00`; `endTime` → `11:30:00` |
| Midwest Ability | A | unchanged `…10:00Z` | `…00:00Z` | **`…16:00Z`** | `T11:00:00` / `11:00:00` |
| Trinity Temple | B | unchanged `…17:00Z` | `…00:00Z` | **`null`** | kept date-only `eventEndDate=2026-08-22`; no invented clock |
| India Fest | A | unchanged `…11:00Z` | `…00:00Z` | **`…18:00Z`** | `T13:00:00` / `13:00:00` |
| Hillcrest | A | unchanged `…17:30Z` | `…00:00Z` | **`…21:00Z`** | `T16:00:00` / `16:00:00` |
| MINK Law Day | A | unchanged `…14:30Z` | `…00:00Z` | **`…18:00Z`** | `T13:00:00` / `13:00:00` |
| Blue Valley Breakfast | A | unchanged `…07:00Z` | `…00:00Z` | **`…09:00Z`** | `T04:00:00` / `04:00:00` |
| MVP Law Seminar | A | unchanged `…08:00Z` | `…00:00Z` | **`…16:00Z`** | `T11:00:00` / `11:00:00` |

For all eight: `extracted.eventDate` + `startTime` unchanged. Narrow `jsonb_set` only (no whole-payload replace).

---

## Linked Calendar repair

| Content | Calendar id | old `endAt` | new `endAt` | `startAt` |
| --- | --- | --- | --- | --- |
| Inspiring Women | `bde29613-7f1f-4dec-8e09-32044cce80b1` | `…00:00Z` | **`…16:30Z`** | unchanged |
| Midwest Ability | `4d0b181b-d8e5-4279-8e6b-709bf81bc1ed` | `…00:00Z` | **`…16:00Z`** | unchanged |
| Trinity Temple | `4b9c2b70-dd59-4ae3-a9ce-f6e6e00046a8` | `…00:00Z` | **`null`** | unchanged |
| India Fest | `d668b3e5-3fb9-41ba-9b80-871e4106da6f` | `…00:00Z` | **`…18:00Z`** | unchanged |
| Hillcrest | `8df5626c-8e59-4217-b00d-60de803b64b5` | `…00:00Z` | **`…21:00Z`** | unchanged |
| MINK Law Day | `70ad9bfc-9e93-4ea3-9b66-65c7e38e5cc4` | `…00:00Z` | **`…18:00Z`** | unchanged |
| Blue Valley | `06c11a1b-c024-4b80-8b17-763a6356545f` | `…00:00Z` | **`…09:00Z`** | unchanged |
| MVP Law | `8d5d2446-3319-4549-b024-130bbb1dc1d5` | `…00:00Z` | **`…16:00Z`** | unchanged |

All eight Calendar rows were suggested / unprotected; title, `allDay`, location, `sourceRecordId`, ownership preserved.

---

## Assertions

| Check | Result |
| --- | --- |
| Every `eventStartsAt` / Calendar `startAt` unchanged | **yes** |
| No repaired content still `eventEndsAt < eventStartsAt` | **yes** (`stillInverted=[]`) |
| Class B received **null** end, not invented clock | **yes** (Trinity) |
| Rows skipped | **0** |

---

## Global safety

| Metric | Before | After |
| --- | ---: | ---: |
| `content_items` | 5956 | **5956** |
| `creator_calendar_items` | 951 | **951** |
| `calendar_dismissal_feedback` | 33 | **33** |
| Other content updated | — | **none** |
| Other Calendar updated | — | **none** |
| Calendar rows created | — | **none** |

| Confirmation | |
| --- | --- |
| Code changed | **no** |
| Projection / full re-ingest | **not run** |
| OPCC start-clock quality (3 AM / 5 AM) | **out of scope** |
| Date-only / allDay logic | **not reopened** |

---

## Summary

Repaired all **8** historical OPCC inverted ends: **7** class A with parser-proven timed ends, **1** class B (Trinity) cleared to null. Starts untouched; no inversions remain on these ids.
