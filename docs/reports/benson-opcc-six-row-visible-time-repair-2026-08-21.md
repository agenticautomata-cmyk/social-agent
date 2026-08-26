# OPCC six-row visible-time historical repair

Date: 2026-08-21

**BOUNDED DATA REPAIR ONLY.**  
Code unchanged. Calendar projection **not run**. Full OPCC re-ingest **not run**.  
MINK Law Day + Hillcrest Transitional Housing explicitly **out of scope**.

Related:
- [benson-opcc-start-clock-quality-audit-2026-08-21.md](./benson-opcc-start-clock-quality-audit-2026-08-21.md)
- [benson-opcc-visible-time-precedence-fix-2026-08-21.md](./benson-opcc-visible-time-precedence-fix-2026-08-21.md)

---

## Source identity

| | |
| --- | --- |
| Name | Events Archive - Overland Park Convention Center |
| `sourceId` | `6ce4341e-5203-46d8-9ed9-0f6e7af25339` |

---

## Exact six content ids + linked Calendar ids

| # | Content id | Title | Calendar id |
| ---: | --- | --- | --- |
| 1 | `1695ee52-8ca5-4cc3-8ec2-417d77fcbbf6` | Inspiring Women in Public Administration Conference 2026 | `bde29613-7f1f-4dec-8e09-32044cce80b1` |
| 2 | `e1c13b2a-3eec-42d8-acff-cecbc8e1c52a` | Midwest Ability Summit 2026 | `4d0b181b-d8e5-4279-8e6b-709bf81bc1ed` |
| 3 | `ea3b1b49-07e7-42de-8061-856ad4de7c8a` | Blue Valley Education Breakfast 2026 | `06c11a1b-c024-4b80-8b17-763a6356545f` |
| 4 | `28d18544-42f4-4715-b415-f7ac94c6a6e6` | India Fest 2026 | `d668b3e5-3fb9-41ba-9b80-871e4106da6f` |
| 5 | `fa2b2775-8b62-4abd-bf22-6aa0b492a420` | Trinity Temple 50th Anniversary Gala | `4b9c2b70-dd59-4ae3-a9ce-f6e6e00046a8` |
| 6 | `2b0fc667-c575-4a88-acd0-54c1d1ae417c` | MVP Law Kansas City Seminar | `8d5d2446-3319-4549-b024-130bbb1dc1d5` |

**Skipped:** none (0).

---

## Pre-mutation proof (all six)

For each target before write:

- `sourceId` = OPCC  
- detail URL resolved and live-fetched  
- current corrected parser (`parseJsonLdPageGraph` → `jsonLdEventsToOpportunities` → `overlayOpccDetailVisibleTime`) matched by title + event date + detail URL  
- human-visible `.mec-single-event-time` Time matched expected proof string  
- UTC via `parseEventDate` + `sanitizeEventEndInstant` matched expected CDT instants  
- linked Calendar: exactly one active row; `planningStatus=suggested`; `userEditedAt=null`; `createdBy=benson_inventory`; not protected  

---

## Corrected parser → repair targets

| Title | Visible Time | Corrected start/end local | Corrected UTC |
| --- | --- | --- | --- |
| Inspiring Women | `8:00 am - 4:30 pm` | 8:00 AM – 4:30 PM | `13:00Z` – `21:30Z` |
| Midwest Ability | `10:00 am - 4:00 pm` | 10:00 AM – 4:00 PM | `15:00Z` – `21:00Z` |
| Blue Valley Breakfast | `7:00 am - 9:00 am` | 7:00 AM – 9:00 AM | `12:00Z` – `14:00Z` |
| India Fest | `11:00 am - 6:00 pm` | 11:00 AM – 6:00 PM | `16:00Z` – `23:00Z` |
| Trinity Gala | `5:00 pm` | 5:00 PM, **no invented end** | `22:00Z` / **null** |
| MVP Law | `8:00 am - 4:00 pm` | 8:00 AM – 4:00 PM | `13:00Z` – `21:00Z` |

---

## Content before → after

| Title | `startTime` | `eventDate` | `endTime` | `eventEndDate` | `eventStartsAt` | `eventEndsAt` |
| --- | --- | --- | --- | --- | --- | --- |
| Inspiring Women | `03:00:00` → **`08:00:00`** | `…T03:00:00` → **`…T08:00:00`** | `11:30:00` → **`16:30:00`** | `…T11:30:00` → **`…T16:30:00`** | `08:00Z` → **`13:00Z`** | `16:30Z` → **`21:30Z`** |
| Midwest Ability | `05:00:00` → **`10:00:00`** | `…T05:00:00` → **`…T10:00:00`** | `11:00:00` → **`16:00:00`** | `…T11:00:00` → **`…T16:00:00`** | `10:00Z` → **`15:00Z`** | `16:00Z` → **`21:00Z`** |
| Blue Valley | `02:00:00` → **`07:00:00`** | `…T02:00:00` → **`…T07:00:00`** | `04:00:00` → **`09:00:00`** | `…T04:00:00` → **`…T09:00:00`** | `07:00Z` → **`12:00Z`** | `09:00Z` → **`14:00Z`** |
| India Fest | `06:00:00` → **`11:00:00`** | `…T06:00:00` → **`…T11:00:00`** | `13:00:00` → **`18:00:00`** | `…T13:00:00` → **`…T18:00:00`** | `11:00Z` → **`16:00Z`** | `18:00Z` → **`23:00Z`** |
| Trinity Gala | `12:00:00` → **`17:00:00`** | `…T12:00:00` → **`…T17:00:00`** | `null` → **`null`** (not invented) | `2026-08-22` preserved date-only | `17:00Z` → **`22:00Z`** | **`null`** (unchanged) |
| MVP Law | `03:00:00` → **`08:00:00`** | `…T03:00:00` → **`…T08:00:00`** | `11:00:00` → **`16:00:00`** | `…T11:00:00` → **`…T16:00:00`** | `08:00Z` → **`13:00Z`** | `16:00Z` → **`21:00Z`** |

Updates used narrow `jsonb_set` on `extracted.startTime` / `eventDate` / `endTime` / `eventEndDate` only (Trinity: start fields only). Entire `raw_payload` not replaced. Title, `sourceExternalId`, source URL, venue/location, content id unchanged.

---

## Calendar before → after

| Title | Calendar id | `startAt` | `endAt` | `allDay` |
| --- | --- | --- | --- | --- |
| Inspiring Women | `bde29613-…` | `08:00Z` → **`13:00Z`** | `16:30Z` → **`21:30Z`** | false → false |
| Midwest Ability | `4d0b181b-…` | `10:00Z` → **`15:00Z`** | `16:00Z` → **`21:00Z`** | false → false |
| Blue Valley | `06c11a1b-…` | `07:00Z` → **`12:00Z`** | `09:00Z` → **`14:00Z`** | false → false |
| India Fest | `d668b3e5-…` | `11:00Z` → **`16:00Z`** | `18:00Z` → **`23:00Z`** | false → false |
| Trinity Gala | `4b9c2b70-…` | `17:00Z` → **`22:00Z`** | **null** → **null** | false → false |
| MVP Law | `8d5d2446-…` | `08:00Z` → **`13:00Z`** | `16:00Z` → **`21:00Z`** | false → false |

Patched via existing `updateCalendarItem` (not `upsertSuggestion`). Same Calendar ids. Title, location, `sourceRecordId`, `planningStatus=suggested`, `createdBy=benson_inventory`, `userEditedAt=null`, notes preserved. No replacement rows. `allDay` already false; left false.

---

## Trinity — no invented end

- Visible HTML: start-only `5:00 pm`  
- After repair: `endTime=null`, `eventEndDate=2026-08-22` (date-only preserved), `eventEndsAt=null`, Calendar `endAt=null`  
- Sanitizer still yields null for date-only end against timed start  

---

## End ≥ start

Every repaired row: `eventEndsAt` is **null** (Trinity) **or** `>= eventStartsAt`. Same for Calendar `endAt` / `startAt`.

---

## Global safety

| Metric | Before | After |
| --- | ---: | ---: |
| `content_items` | 6032 | **6032** |
| `creator_calendar_items` | 963 | **963** |
| `calendar_dismissal_feedback` | 33 | **33** |

| Confirmation | |
| --- | --- |
| Exactly six content ids considered | **yes** |
| Rows skipped | **0** |
| Other content rows changed | **no** (only the six) |
| Other Calendar rows changed | **no** (only the six linked) |
| Calendar rows created | **none** |
| Dismissal fingerprints added | **none** (count unchanged) |
| Code changed | **no** |
| Projection | **not run** |
| Full OPCC re-ingest | **not run** |

### Explicitly out of scope

| Row | Content id | Status |
| --- | --- | --- |
| MINK Law Day 2026 | `28fc1697-abb1-4a0e-b8da-eca9748a3fda` | untouched (`startTime` still `09:30:00`, `eventStartsAt` `14:30Z`) |
| Hillcrest Transitional Housing 2026 | `d73d4acb-93c6-4d05-8587-b317ee09b8c8` | untouched (`startTime` still `12:30:00`, `eventStartsAt` `17:30Z`) |

Also out of scope: date-only/allDay semantics; non-OPCC sources; other OPCC timed rows not in this six-id set.

---

## Summary

All six audited OPCC historical timed occurrences now store and display the human-visible detail-page clocks (via the already-shipped OPCC visible-Time precedence parser), with Calendar `startAt`/`endAt` patched to match. Trinity remains start-only with null end.
