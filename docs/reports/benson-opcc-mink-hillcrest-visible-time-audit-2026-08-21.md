# OPCC MINK + Hillcrest visible-Time audit

Date: 2026-08-21

**READ-ONLY. No code changes. No data mutations. No projection. No re-ingest.**

Six previously repaired OPCC visible-Time rows **not reopened**.  
Date-only / allDay logic **not reopened**.

---

## Overall verdict

**BOTH NEED HISTORICAL REPAIR**

Both rows show the same OPCC defect as the earlier six: human-visible MEC Time disagrees with JSON-LD wall clocks by ~5 hours. Persisted clocks follow JSON-LD; the current corrected parser prefers MEC Time and produces different UTC instants. **Do not mutate in this audit.**

---

## Source identity

| | |
| --- | --- |
| Name | Events Archive - Overland Park Convention Center |
| `sourceId` | `6ce4341e-5203-46d8-9ed9-0f6e7af25339` |

---

## Exact two content ids + Calendar ids

| # | Content id | Title | Calendar id |
| ---: | --- | --- | --- |
| 1 | `28fc1697-abb1-4a0e-b8da-eca9748a3fda` | MINK Law Day 2026 | `70ad9bfc-9e93-4ea3-9b66-65c7e38e5cc4` |
| 2 | `d73d4acb-93c6-4d05-8587-b317ee09b8c8` | Hillcrest Transitional Housing 2026 | `8df5626c-8e59-4217-b00d-60de803b64b5` |

Optional already-fixed control: **not needed** — both pages expose clear MEC Time + conflicting JSON-LD.

---

## 1. MINK Law Day 2026

| Field | Value |
| --- | --- |
| Content id | `28fc1697-abb1-4a0e-b8da-eca9748a3fda` |
| Title | MINK Law Day 2026 |
| Detail URL | `https://opconventioncenter.com/events/mink-law-day-2026/` |
| Visible Time (`mec-single-event-time` → `abbr.mec-events-abbr`) | **`2:30 pm - 6:00 pm`** |
| Live JSON-LD `startDate` | `2026-09-02T09:30:00-05:00` |
| Live JSON-LD `endDate` | `2026-09-02T13:00:00-05:00` |
| Corrected parser `startTime` | **`14:30:00`** |
| Corrected parser `endTime` | **`18:00:00`** |
| Corrected `eventDate` / `eventEndDate` | `2026-09-02T14:30:00` / `2026-09-02T18:00:00` |
| Corrected UTC | **`2026-09-02T19:30:00Z` – `2026-09-02T23:00:00Z`** |
| Chicago wall of corrected | Sep 2, 2026, **2:30 PM – 6:00 PM** |
| Persisted `startTime` / `endTime` | `09:30:00` / `13:00:00` |
| Persisted `eventDate` / `eventEndDate` | `2026-09-02T09:30:00` / `2026-09-02T13:00:00` |
| Persisted `eventStartsAt` / `eventEndsAt` | `2026-09-02T14:30:00Z` / `2026-09-02T18:00:00Z` |
| Calendar `startAt` / `endAt` | `14:30Z` / `18:00Z` (`allDay=false`, suggested) |
| Current values match corrected parser | **no** |
| Corrected end ≥ start | **yes** |

**Classification: STALE HISTORICAL TIME**

JSON-LD / human disagreement: visible **2:30–6:00 pm** vs JSON-LD wall **09:30 / 13:00** with `-05:00`. Persisted follows JSON-LD; corrected follows MEC.

---

## 2. Hillcrest Transitional Housing 2026

| Field | Value |
| --- | --- |
| Content id | `d73d4acb-93c6-4d05-8587-b317ee09b8c8` |
| Title | Hillcrest Transitional Housing 2026 |
| Detail URL | `https://opconventioncenter.com/events/hillcrest-transitional-housing-2026/` |
| Visible Time | **`5:30 pm - 9:00 pm`** |
| Live JSON-LD `startDate` | `2026-08-29T12:30:00-05:00` |
| Live JSON-LD `endDate` | `2026-08-29T16:00:00-05:00` |
| Corrected parser `startTime` | **`17:30:00`** |
| Corrected parser `endTime` | **`21:00:00`** |
| Corrected `eventDate` / `eventEndDate` | `2026-08-29T17:30:00` / `2026-08-29T21:00:00` |
| Corrected UTC | **`2026-08-29T22:30:00Z` – `2026-08-30T02:00:00Z`** |
| Chicago wall of corrected | Aug 29, 2026, **5:30 PM – 9:00 PM** |
| Persisted `startTime` / `endTime` | `12:30:00` / `16:00:00` |
| Persisted `eventDate` / `eventEndDate` | `2026-08-29T12:30:00` / `2026-08-29T16:00:00` |
| Persisted `eventStartsAt` / `eventEndsAt` | `2026-08-29T17:30:00Z` / `2026-08-29T21:00:00Z` |
| Calendar `startAt` / `endAt` | `17:30Z` / `21:00Z` (`allDay=false`, suggested) |
| Current values match corrected parser | **no** |
| Corrected end ≥ start | **yes** |

**Classification: STALE HISTORICAL TIME**

Same pattern: visible **5:30–9:00 pm** vs JSON-LD wall **12:30 / 16:00**.

---

## Persisted vs corrected (repair preview — not applied)

| Row | Field | Persisted (now) | Corrected (needed) |
| --- | --- | --- | --- |
| MINK | `startTime` | `09:30:00` | **`14:30:00`** |
| MINK | `endTime` | `13:00:00` | **`18:00:00`** |
| MINK | `eventDate` | `…T09:30:00` | **`…T14:30:00`** |
| MINK | `eventEndDate` | `…T13:00:00` | **`…T18:00:00`** |
| MINK | `eventStartsAt` / Cal `startAt` | `14:30Z` | **`19:30Z`** |
| MINK | `eventEndsAt` / Cal `endAt` | `18:00Z` | **`23:00Z`** |
| Hillcrest | `startTime` | `12:30:00` | **`17:30:00`** |
| Hillcrest | `endTime` | `16:00:00` | **`21:00:00`** |
| Hillcrest | `eventDate` | `…T12:30:00` | **`…T17:30:00`** |
| Hillcrest | `eventEndDate` | `…T16:00:00` | **`…T21:00:00`** |
| Hillcrest | `eventStartsAt` / Cal `startAt` | `17:30Z` | **`22:30Z`** |
| Hillcrest | `eventEndsAt` / Cal `endAt` | `21:00Z` | **`2026-08-30T02:00:00Z`** |

No +5h hardcode assumed — values come from MEC visible clocks via the existing OPCC overlay.

---

## Recommended smallest next action (do not implement yet)

Bounded two-row historical repair (same pattern as the six-row visible-Time repair):

1. Re-verify live MEC Time still matches above.  
2. Patch only these two content ids’ extracted temporal fields + `eventStartsAt`/`eventEndsAt`.  
3. Patch linked Calendar `startAt`/`endAt` via `updateCalendarItem` if still suggested / unprotected.  
4. Do not touch other OPCC rows; do not re-ingest; do not project.

---

## Confirmations

| | |
| --- | --- |
| Code changed | **no** |
| Data changed | **no** |
| Projection / re-ingest | **not run** |
| Six previously repaired OPCC rows | **not reopened** |
| Date-only / allDay logic | **not reopened** |

---

## Out of scope

- Implementing the two-row repair  
- Other OPCC timed/date-only rows  
- Non-OPCC sources  
- Re-auditing the six already-repaired visible-Time rows  

---

## Summary

Neither MINK nor Hillcrest is already correct. Both are stale JSON-LD-backed clocks while live detail pages show afternoon/evening MEC Times. Cluster verdict: **BOTH NEED HISTORICAL REPAIR**.
