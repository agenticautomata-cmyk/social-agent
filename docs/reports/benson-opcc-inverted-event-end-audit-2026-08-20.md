# OPCC timed inverted `eventEndsAt < eventStartsAt` — read-only audit

Date: 2026-08-20 (audit executed 2026-08-21)

**READ-ONLY. No code changes. No data mutations. No projection. No re-ingest.**

Does **not** reopen date-only / allDay day-key work.  
Does **not** judge whether 3:00 AM / 5:00 AM OPCC clocks are plausible — only interval ordering.

---

## Verdict

**STALE HISTORICAL ROWS**

All inspected inversions match the pre-`sanitizeEventEndInstant` / pre-JSON-LD `endTime` retention pattern. Current checked-in parsing + sanitizer does **not** re-persist inverted ends for these detail pages (either a valid timed end is produced, or the bad date-only end is dropped to null).

---

## OPCC source identity

| | |
| --- | --- |
| Primary source | **Events Archive - Overland Park Convention Center** |
| `sourceId` | `6ce4341e-5203-46d8-9ed9-0f6e7af25339` |
| Listing | `https://opconventioncenter.com/events?utm_source=openai` |
| Cluster note | Also considered Home & Garden show source `21c19d44-…` (0 inverted hits) |

---

## Bounded query

Filter (OPCC cluster only):

- `eventStartsAt` present  
- `eventEndsAt` present  
- `eventEndsAt < eventStartsAt`  
- extracted `startTime` non-empty (timed)

| Metric | Count |
| --- | ---: |
| Timed OPCC rows with both ends | **8** |
| Of those with `eventEndsAt < eventStartsAt` | **8** |

**Not zero — continued.**

### Exact inverted content ids (all 8)

1. `1695ee52-8ca5-4cc3-8ec2-417d77fcbbf6` — Inspiring Women in Public Administration Conference 2026  
2. `e1c13b2a-3eec-42d8-acff-cecbc8e1c52a` — Midwest Ability Summit 2026  
3. `fa2b2775-8b62-4abd-bf22-6aa0b492a420` — Trinity Temple 50th Anniversary Gala  
4. `28d18544-42f4-4715-b415-f7ac94c6a6e6` — India Fest 2026  
5. `d73d4acb-93c6-4d05-8587-b317ee09b8c8` — Hillcrest Transitional Housing 2026  
6. `28fc1697-abb1-4a0e-b8da-eca9748a3fda` — MINK Law Day 2026  
7. `ea3b1b49-07e7-42de-8061-856ad4de7c8a` — Blue Valley Education Breakfast 2026  
8. `2b0fc667-c575-4a88-acd0-54c1d1ae417c` — MVP Law Kansas City Seminar  

---

## Compact evidence (5 inspected, incl. Inspiring Women)

Shared stored pattern: `eventEndDate` is **date-only** `YYYY-MM-DD`, `endTime` absent, `eventEndsAt` = that day’s **UTC midnight** → before timed `eventStartsAt`.

| Content id | Title | extracted start / end | persisted start / end | Calendar id | Cal start / end | Eligibility (now=Aug 21 07Z) |
| --- | --- | --- | --- | --- | --- | --- |
| `1695ee52-…` | Inspiring Women… | `T03:00:00` / **`2026-08-21`** | `08:00Z` / **`00:00Z`** | `bde29613-…` | same inverted | ok |
| `e1c13b2a-…` | Midwest Ability… | `T05:00:00` / **`2026-08-22`** | `10:00Z` / **`00:00Z`** | `4d0b181b-…` | same | ok |
| `fa2b2775-…` | Trinity Temple Gala | `T12:00:00` / **`2026-08-22`** | `17:00Z` / **`00:00Z`** | `4b9c2b70-…` | same | ok |
| `28d18544-…` | India Fest 2026 | `T06:00:00` / **`2026-08-23`** | `11:00Z` / **`00:00Z`** | `d668b3e5-…` | same | ok |
| `d73d4acb-…` | Hillcrest… | `T12:30:00` / **`2026-08-29`** | `17:30Z` / **`00:00Z`** | `8df5626c-…` | same | ok |

Critical class for stored rows: **A — historical stale persistence** from before JSON-LD `endTime` retention + `sanitizeEventEndInstant` (same family as CommUNITY Fest / `benson-jsonld-end-before-start-2026-08-20.md`).

---

## Current-parser dry run (read-only, not persisted)

Detail pages fetched; `parseJsonLdPageGraph` → `composeJsonLdOpportunityDates` / `jsonLdEventsToOpportunities` → `parseEventDate` + `sanitizeEventEndInstant`.

| Hit | Live JSON-LD endTime | Current composed `eventEndDate` | Parsed end vs start | `sanitizeEventEndInstant` | Would current code persist inversion? |
| --- | --- | --- | --- | --- | --- |
| Inspiring Women | **`11:30:00`** | `2026-08-21T11:30:00` | `16:30Z` ≥ `08:00Z` | keeps end | **No** |
| Midwest Ability | **`11:00:00`** | `2026-08-22T11:00:00` | `16:00Z` ≥ `10:00Z` | keeps end | **No** |
| Trinity Temple | **null** (date-only end) | still `2026-08-22` | raw end `00:00Z` < start | **drops → null** | **No** (null end, not inverted) |
| India Fest | **`13:00:00`** | `2026-08-23T13:00:00` | `18:00Z` ≥ `11:00Z` | keeps end | **No** |
| Hillcrest | **`16:00:00`** | `2026-08-29T16:00:00` | `21:00Z` ≥ `17:30Z` | keeps end | **No** |

**Would current code reproduce each stored inversion today?** **No** for all five inspected.

Trinity is still a **source date-only end** case (no end clock in JSON-LD); current sanitizer correctly refuses to persist midnight-before-start rather than writing an inverted interval.

---

## Recommended smallest next action (do not implement here)

Scoped data repair of the **8** OPCC content ids (and matching Calendar `endAt` where linked):

1. Re-parse each detail URL with current JSON-LD path.  
2. If composed end is timed and `sanitizeEventEndInstant` returns a value ≥ start → patch `extracted.eventEndDate` (+ `endTime` if present) and `eventEndsAt` / Calendar `endAt`.  
3. If end remains date-only / sanitize returns null (Trinity-like) → set `eventEndsAt` / Calendar `endAt` to **null** (clear the inverted midnight), do not invent an end clock.  
4. Do **not** change `eventStartsAt` / start clocks in this repair (clock-quality is separate).  
5. No full OPCC re-ingest / no Calendar projection required if patching is occurrence-scoped.

---

## Confirmations

| | |
| --- | --- |
| Code changed | **no** |
| Data changed | **no** |
| Projection / re-ingest | **not run** |
| Date-only / allDay logic reopened | **no** |
| OPCC clock-quality (3 AM / 5 AM plausibility) | **out of scope** |

---

## Out of scope / unrelated

- Whether OPCC JSON-LD start clocks (e.g. 03:00 / 05:00) are “real” local walls.  
- Date-only OPCC allDay day-shift (Woman of Influence class).  
- Non-OPCC inverted ends.

---

## Summary

**8 / 8** timed OPCC rows that have both ends are historically inverted (`eventEndsAt` midnight UTC before timed start) because stored `eventEndDate` is date-only. Current parser + sanitizer no longer persist that inversion. Repair is a scoped historical cleanup of those eight ids (and their Calendar `endAt`s), not a new code bug.
