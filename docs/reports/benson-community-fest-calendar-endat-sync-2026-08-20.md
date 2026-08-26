# CommUNITY Fest Calendar endAt sync

Date: 2026-08-20  
Calendar id: `8185be73-01d0-458b-9c4b-7592f357d137`  
Linked content id: `00f95609-5077-4410-ae54-a52f439c83b8`  
Source URL: `https://unitedwaygkc.org/event/community-fest-2026/`

**No code changes. No Calendar projection. No re-ingest. No other rows/sources touched.**

Related: [JSON-LD end-before-start fix](./benson-jsonld-end-before-start-2026-08-20.md) (content `eventEndsAt` corrected earlier; Calendar `end_at` was still stale).

---

## Preconditions verified

| Check | Result |
| --- | --- |
| `sourceRecordId` → expected content | yes (`00f95609-…c83b8`) |
| Content `eventStartsAt` | `2026-11-06T14:00:00.000Z` |
| Content `eventEndsAt` | `2026-11-06T20:00:00.000Z` |
| Calendar `startAt` equals content start | yes |
| Calendar `endAt` differed from content end | yes (`00:00Z` vs `20:00Z`) |
| `planningStatus` | `suggested` |
| `userEditedAt` | null |

---

## Action

Updated **only** `endAt` via existing `updateCalendarItem({ endAt: '2026-11-06T20:00:00.000Z' })`.

Did **not** change: title, startAt, location, planningStatus, sourceRecordId, idempotency keys, fingerprints (no dismissal path).

---

## After

| Field | Before | After |
| --- | --- | --- |
| Calendar id | `8185be73-01d0-458b-9c4b-7592f357d137` | unchanged |
| `startAt` | `2026-11-06T14:00:00.000Z` | unchanged |
| `endAt` | `2026-11-06T00:00:00.000Z` | **`2026-11-06T20:00:00.000Z`** |
| `planningStatus` | `suggested` | unchanged |
| `sourceRecordId` | `00f95609-5077-4410-ae54-a52f439c83b8` | unchanged |
| title | 2026 CommUNITY Fest Presented by G.E.H.A - United Way of Greater Kansas City | unchanged |
| location | Kansas City | unchanged |

| Verify | Result |
| --- | --- |
| Duplicate CommUNITY Fest Calendar rows | **0** (single suggested row) |
| Other Calendar rows changed | **0** |
| Code changed | **no** |
| Projection / re-ingest | **not run** |

Calendar `endAt` now matches linked content `eventEndsAt` (`20:00Z` = JSON-LD `14:00-06:00`).
