# OPCC start-clock quality — early-morning suspicion audit

Date: 2026-08-21

**READ-ONLY. No code changes. No data mutations. No projection. No re-ingest.**

Does **not** reopen inverted-end repair.  
Does **not** reopen date-only / allDay day-key work.

---

## Overall verdict

**SOURCE DATA QUALITY ISSUE**

More precisely: **JSON-LD / HUMAN PAGE DISAGREEMENT** across the OPCC Events Archive cluster.

Human-visible detail pages publish normal daytime (or breakfast) clocks. Live JSON-LD publishes the same calendar date with a **systematically ~5 hour earlier** wall clock and a plausible `-05:00` offset. Current checked-in parsing **faithfully** follows JSON-LD and therefore reproduces the early stored clocks. Absolute ISO interpretation of those JSON-LD strings yields the same Chicago wall time as our naive wall-digit path (in CDT).

This is **not** “UTC mistaken for local” on a correct 8:00 AM `-05:00` stamp. The structured absolute instant itself is early morning Chicago; the HTML “Time” field disagrees.

---

## Source identity

| | |
| --- | --- |
| Name | Events Archive - Overland Park Convention Center |
| `sourceId` | `6ce4341e-5203-46d8-9ed9-0f6e7af25339` |
| Listing | `https://opconventioncenter.com/events?utm_source=openai` |

---

## Rows inspected (6)

| # | Role | Content id | Title |
| ---: | --- | --- | --- |
| 1 | Must-include early | `1695ee52-8ca5-4cc3-8ec2-417d77fcbbf6` | Inspiring Women in Public Administration Conference 2026 |
| 2 | Must-include early | `e1c13b2a-3eec-42d8-acff-cecbc8e1c52a` | Midwest Ability Summit 2026 |
| 3 | Must-include early | `ea3b1b49-07e7-42de-8061-856ad4de7c8a` | Blue Valley Education Breakfast 2026 |
| 4 | Early | `28d18544-42f4-4715-b415-f7ac94c6a6e6` | India Fest 2026 |
| 5 | Daytime control | `fa2b2775-8b62-4abd-bf22-6aa0b492a420` | Trinity Temple 50th Anniversary Gala |
| 6 | Early | `2b0fc667-c575-4a88-acd0-54c1d1ae417c` | MVP Law Kansas City Seminar |

Date-only control not required — timed path is clearly JSON-LD.

---

## Comparison table

| Title | Human-visible detail “Time” | Live JSON-LD `startDate` | Offset | Parser `startTime` / composed | Persisted `startTime` / `eventStartsAt` | Chicago wall of persisted UTC | Listing shows clock? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Inspiring Women | **8:00 am – 4:30 pm** | `2026-08-21T03:00:00-05:00` | `-05:00` | `03:00:00` / `T03:00:00` | `03:00:00` / `08:00Z` | **3:00 AM** | date only on listing card |
| Midwest Ability | **10:00 am – 4:00 pm** | `2026-08-22T05:00:00-05:00` | `-05:00` | `05:00:00` | `05:00:00` / `10:00Z` | **5:00 AM** | date only |
| Blue Valley Breakfast | **7:00 am – 9:00 am** | `2026-09-03T02:00:00-05:00` | `-05:00` | `02:00:00` | `02:00:00` / `07:00Z` | **2:00 AM** | date only |
| India Fest | **11:00 am – 6:00 pm** | `2026-08-23T06:00:00-05:00` | `-05:00` | `06:00:00` | `06:00:00` / `11:00Z` | **6:00 AM** | date only |
| Trinity Gala (control) | **5:00 pm** | `2026-08-22T12:00:00-05:00` | `-05:00` | `12:00:00` | `12:00:00` / `17:00Z` | **12:00 PM** | date only |
| MVP Law | **8:00 am – 4:00 pm** | `2026-09-16T03:00:00-05:00` | `-05:00` | `03:00:00` | `03:00:00` / `08:00Z` | **3:00 AM** | date only |

Systematic shift (human local minus JSON-LD wall digits) ≈ **5 hours** on every inspected row, including the “normal daytime” Trinity control (5:00 pm → JSON-LD noon).

---

## Timezone / offset interpretation

For each early row, live JSON-LD looks like:

`YYYY-MM-DDTHH:MM:SS-05:00`

| Interpretation | Result (Inspiring Women example) |
| --- | --- |
| Absolute ISO (`T03:00:00-05:00`) | `2026-08-21T08:00:00Z` = **3:00 AM** America/Chicago |
| Current parser (`splitDateTime` keeps wall digits `03:00:00`, drops offset; `parseEventDate` treats naive as Chicago wall) | same `08:00Z` = **3:00 AM** Chicago in CDT |

So for these CDT-era stamps, **parser wall-digit path ≡ absolute offset path**. We are not inventing 3 AM by misreading a correct `T08:00:00-05:00` as UTC.

What would a correct stamp for the human 8:00 AM page look like?

`2026-08-21T08:00:00-05:00` (= `13:00Z`)

That is **not** what OPCC publishes.

Likely source-side construction error (human local minus 5h, then labeled `-05:00`) — consistent across the sample — but the audit treats that as **structured vs human disagreement**, not a proven CMS root cause.

---

## Answers to critical questions

1. **Does the human page say 3:00 / 5:00 AM?**  
   **No** for the inspected set. Detail pages say 8:00 am, 10:00 am, 7:00 am, 11:00 am, 5:00 pm, 8:00 am respectively.

2. **Does JSON-LD encode an offset?**  
   **Yes** — always `-05:00` on these timed starts (not `Z`, not bare local without offset).

3. **Is our parser treating local as UTC or vice versa?**  
   **No bug needed to explain these rows.** Absolute `-05:00` and our Chicago-naive composition agree. The early clock is in the JSON-LD itself relative to the HTML Time field.

4. **Listing vs detail?**  
   Listing cards show **date only** (no clock) for these titles. Detail HTML Time disagrees with JSON-LD. No third listing clock to break the tie.

5. **Does current parsing reproduce the early clock today?**  
   **Yes** for all six (`reproducesPersistedStartTime: true`).

6. **Historical/stale while source/parser now correct?**  
   **No** — live JSON-LD still matches persisted early clocks.

---

## Per-row classification

| Row | Classification |
| --- | --- |
| Inspiring Women | **JSON-LD / HUMAN PAGE DISAGREEMENT** |
| Midwest Ability | **JSON-LD / HUMAN PAGE DISAGREEMENT** |
| Blue Valley Breakfast | **JSON-LD / HUMAN PAGE DISAGREEMENT** |
| India Fest | **JSON-LD / HUMAN PAGE DISAGREEMENT** |
| Trinity Gala (control) | **JSON-LD / HUMAN PAGE DISAGREEMENT** (same −5h pattern; not “early morning,” still wrong vs HTML) |
| MVP Law | **JSON-LD / HUMAN PAGE DISAGREEMENT** |

None classified as SOURCE GENUINELY EARLY (HTML does not say early AM).  
None as TIMEZONE PARSE BUG for this sample.  
None as HISTORICAL STALE ROW.

---

## Current-parser dry-run summary

Path: `parseJsonLdPageGraph` → `composeJsonLdOpportunityDates` / `jsonLdEventsToOpportunities` → `parseEventDate` (America/Chicago for naive `T…`).

Branch of note (not a CDT mis-parse of these strings): `splitDateTime` in `jsonld-events.ts` extracts `HH:MM:SS` from the ISO **literal** and does not convert via the attached offset; for `-05:00` in CDT that coincides with absolute instant semantics.

---

## Recommended smallest next action (do not implement)

1. **Do not mass-shift OPCC starts by +5h in data** without an evidence-priority rule — that would be guessing even though the pattern is strong.  
2. Smallest **generic** product fix if desired later: when detail-page visible Time (or ICS/export text) clearly disagrees with JSON-LD start by a fixed offset, prefer human/ICS clock over JSON-LD **or** validate JSON-LD against visible Time before trust.  
3. Narrowest diagnostic: confirm whether OPCC’s CMS always emits `local−5` with `-05:00` (vendor bug) — out of code scope.  
4. Leave persisted starts unchanged until an evidence-priority policy exists.

---

## Confirmations

| | |
| --- | --- |
| Code changed | **no** |
| Data changed | **no** |
| Projection / re-ingest | **not run** |
| Inverted-end repair reopened | **no** |
| Date-only / allDay logic reopened | **no** |

---

## Out of scope

- End-interval repairs already completed on these rows.  
- Whether breakfast “should” be 7 AM socially — HTML already says 7:00 am; JSON-LD says 2:00 am.  
- Non-OPCC sources.  
- Date-only OPCC Woman of Influence class.

---

## Summary

Suspicious 2–6 AM OPCC clocks are **not** genuine human-published times and **not** a UTC/`Z` misread of correct stamps. Live HTML shows ordinary daytime/breakfast hours; live JSON-LD is ~5 hours earlier with `-05:00`. Current parser correctly follows JSON-LD and therefore matches persisted early clocks. Cluster verdict: **source structured-data quality / JSON-LD vs human disagreement**.
