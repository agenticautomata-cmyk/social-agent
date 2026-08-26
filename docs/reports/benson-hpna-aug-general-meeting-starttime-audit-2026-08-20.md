# HPNA Aug 18 General Meeting — missing `startTime` / wrong-day audit

Date: 2026-08-20 (audit executed 2026-08-21)

**READ-ONLY. No code changes. No data mutations. No projection. No re-ingest.**

Does **not** reopen allDay / upsertSuggestion fixes.

---

## Verdict

**STALE HISTORICAL ROW / CURRENT CODE ALREADY FIXED**

---

## Target + control

| Role | Event | Calendar id | Content id |
| --- | --- | --- | --- |
| **Target** | HPNA General Meeting (Aug 18) | `70da8511-5d64-4fe4-9eba-fbb6962809e1` | `7e2bc7e5-54ca-49f4-808b-24049d7c5606` |
| **Control** | HPNA General Meeting (Sep 15) | `fcf8765f-ceb6-46e4-87e8-36ee45422962` | `68ee369b-0a40-4ca9-9beb-96c4be3dece1` |

Source: Hyde Park NA events listing — `https://www.hydeparkkc.org/events`  
`sourceId`: `ffeaac23-4ef0-4715-be34-9b716b840b65`

---

## Exact source evidence (live page)

Both cards share the same listing-card pattern on the live HTML:

**Aug 18**

- Title: HPNA General Meeting  
- Tuesday, August 18, 2026  
- **7:00 PM – 8:00 PM**  
- Pilgrim Chapel  

**Sep 15**

- Title: HPNA General Meeting  
- Tuesday, September 15, 2026  
- **7:00 PM – 8:00 PM**  
- Pilgrim Chapel  

Markup/structure is **not** materially different for the clock fields. Source still supplies 7:00 PM for Aug 18 today.

---

## End-to-end field trace (Aug 18 target)

| Stage | title | eventDate | eventEndDate | startTime | Notes |
| --- | --- | --- | --- | --- | --- |
| Live source HTML / card | HPNA General Meeting | Aug 18, 2026 (wall) | — | **7:00 PM** (and 8:00 PM end) | Present on page |
| Persisted `raw_payload.extracted` | HPNA General Meeting | `2026-08-18T19:00:00` | **absent** | **absent / null** | No `startTime` key in extracted object |
| `content_items.event_starts_at` | — | — | — | — | `2026-08-19T00:00:00Z` (UTC of 18th 7pm CT) |
| Calendar thin temporal evidence | — | `2026-08-18T19:00:00` | null | **null** | Faithful load of payload |
| `inventoryTemporalDayKey` | — | — | — | — | **`2026-08-19`** (date-only / UTC-midnight fallback because no extracted clock) |
| Calendar row | HPNA General Meeting | `start_at=2026-08-19T00:00:00Z` | null | — | `allDay=true` (pre-repair historical stamp; not reopened here) |

### Sep 15 control (same pipeline)

| Stage | eventDate | startTime | day key |
| --- | --- | --- | --- |
| `raw_payload.extracted` | `2026-09-15T19:00:00` | **`19:00:00`** | — |
| Thin evidence | same | **`19:00:00`** | — |
| `inventoryTemporalDayKey` | — | — | **`2026-09-15`** (correct) |

---

## Exact first point `startTime` becomes absent

**Class D (+ historical class A for the old extract path): the clock was never stored as `extracted.startTime` on this content row.**

Proven:

1. Live source has 7:00 PM.  
2. Persisted `raw_payload.extracted` for `7e2bc7e5-…` has keys  
   `tags, title, venue, category, location, eventDate, sourceUrl, confidence, businessName`  
   — **no `startTime` key at all**.  
3. Thin Calendar evidence correctly reads `startTime: null` from that payload (not a load bug).  
4. Persistence did **not** drop a present field; the field was never in the stored extracted object.

So the first absence is at **normalized extracted opportunity → `raw_payload.extracted` for this Aug 15 ingest**, not later Calendar loading.

Clock evidence that *did* survive: wall time baked into `eventDate` as `…T19:00:00`. Without a separate `startTime`, current day-key logic treats the row as lacking an explicit clock and falls through to UTC-midnight / date-only semantics → **Aug 19**.

---

## Aug 18 vs Sep 15 stored shape (not markup)

| | Aug 18 (`7e2bc7e5`) | Sep 15 (`68ee369b`) |
| --- | --- | --- |
| Content `created_at` | **2026-08-15** | **2026-08-19** |
| `tags` | `community`, `meeting` | **`container_card`** |
| `category` | `Meeting` | `local_event` |
| `startTime` | **null** | **`19:00:00`** |
| `eventEndDate` | null | `2026-09-15T20:00:00` |
| `summary` | absent | card text with 7:00 PM / 8:00 PM |
| `source_external_id` | `…-0-hpna-general-meeting` (index-style) | `…-hpna-general-meeting-2026-09-16-pilgrim-chapel` (occurrence-style) |

Interpretation: Sep 15 was ingested via the **structured container_card** path. Aug 18 is an **older child** from an earlier extract shape (LLM-ish tags/category; no `startTime`), not a different live card layout.

---

## Current-parser dry run (read-only, not persisted)

Fetched live `https://www.hydeparkkc.org/events` and ran checked-in  
`extractEditorialContainerOpportunities({ pageHtml, pageUrl, pageTitle })`.

| Occurrence | eventDate | startTime | eventEndDate |
| --- | --- | --- | --- |
| **Aug 18 General Meeting** | `2026-08-18T19:00:00` | **`19:00:00`** | `2026-08-18T20:00:00` |
| **Sep 15 General Meeting** | `2026-09-15T19:00:00` | **`19:00:00`** | `2026-09-15T20:00:00` |

**Would current code reproduce the defect today?** **No.** Structured container extraction retains `startTime` for Aug 18 the same way it does for Sep 15.

---

## Recommended smallest next action (do not implement in this audit)

**Scoped repair of this one occurrence only** (no full HPNA re-ingest, no projection required for diagnosis):

1. Refresh `content_items` `7e2bc7e5-…` `raw_payload.extracted` from current container parse for that card: set `startTime=19:00:00`, `eventEndDate=2026-08-18T20:00:00` (keep title / venue / existing `eventDate` identity).  
2. Leave `eventStartsAt` as the already-correct UTC instant `2026-08-19T00:00:00Z` **or** re-derive from the same parse — do not invent a time from the title.  
3. After extracted `startTime` exists, Calendar thin evidence + `inventoryTemporalDayKey` will yield **2026-08-18** without new allDay classifier work.  
4. Optionally align Calendar `allDay` via existing upsert refresh if still stale — separate from this missing-clock root cause.

Do **not** special-case HPNA; prefer a one-row refresh from the same extractor that already works for Sep 15.

---

## Confirmations

| | |
| --- | --- |
| Code changed | **no** |
| Data changed | **no** |
| Projection / re-ingest | **not run** |
| allDay / upsert fixes reopened | **no** |

---

## Out of scope (noted only)

- Calendar `allDay` stamp on this row (`true`) — already covered by prior allDay/upsert work; not reopened.  
- Odd `endAt` / identity-key migration (`-0-hpna-general-meeting` vs occurrence keys) that may explain why later scrapes did not overwrite this child — separate cleanup if needed.  
- Full HPNA source inventory beyond this target + Sep 15 control.

---

## Summary

The Aug 18 General Meeting lost its clock because the **Aug 15 stored extract never had `startTime`**, while the time survived only inside `eventDate`. Live markup matches Sep 15; **current container parsing extracts `startTime=19:00:00` for Aug 18 today**. Defect is a **stale historical row**, not a current parser bug.
