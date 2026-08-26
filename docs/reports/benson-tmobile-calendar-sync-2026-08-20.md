# T-Mobile Center Calendar sync (scoped)

Date: 2026-08-20  
Source: `[Benson] T-Mobile Center Concerts`  
`sourceId`: `6d79fc9a-84b1-4797-a0b8-263481642f69`

Companion to [benson-tmobile-showtime-2026-08-19.md](./benson-tmobile-showtime-2026-08-19.md) (content re-ingest) and [benson-jsonld-early-utc-clock-audit-2026-08-19.md](./benson-jsonld-early-utc-clock-audit-2026-08-19.md) (JSON-LD clock narrowing).

**Full 2026–2027 Calendar projection was not run. T-Mobile content was not re-ingested. No code changes. No other sources were mutated.**

---

## Why this pass existed

Content already had corrected instants after the T-Mobile re-ingest:

- 14 trustworthy real showtimes
- 26 legitimately date-only
- 0 remaining erroneous Chicago-midnight `T05:00Z` / `T06:00Z` on `content_items.event_starts_at`

Calendar rows still held the **pre-fix** `startAt` values from the 2026-08-19 created-94 projection (`T05:00Z` CDT / `T06:00Z` CST = Chicago midnight). This pass reconciled existing T-Mobile Calendar rows to current content.

---

## Frozen (untouched)

| Surface | Status |
| --- | --- |
| Full Calendar projection | not run |
| T-Mobile re-ingest | not run |
| Bowline / Downtown OP / Family Shows / OPCC / HPNA / CommUNITY Fest | not mutated |
| Rest of created-94 batch | not mutated |
| listing_chrome / venue_as_title | not edited |
| Classifier / extraction | not edited |
| Alexa / Discover / Today / ranking | not edited |
| Neighborhoods `546d8013` | not mutated |
| Application code | not edited |

---

## Method

Join `creator_calendar_items` to `content_items` where:

- `source_record_type = 'content_item'`
- `source_record_id = content_items.id`
- `content_items.source_id = 6d79fc9a-…`

**Eligible to mutate:** `planning_status` in `suggested` / `tentative`, `user_edited_at` is null, and not operator-owned (`created_by = kellie` with no `population_source`).

**Skipped automatically:** `confirmed`, `dismissed`, `cancelled`, `completed`, `missed`, user-edited, operator-owned.

For each eligible row:

1. Compare Calendar `startAt` / `allDay` to `content_items.event_starts_at` and `raw_payload.extracted.startTime`.
2. If content has a trustworthy showtime (`startTime` set and not `00:00:00`): set Calendar `startAt` to that instant, `allDay = false`.
3. If content is date-only: set Calendar `startAt` to UTC midnight (`…T00:00:00Z`), `allDay = true`. Do not invent a clock.
4. Update existing rows only. Do not insert a second Calendar row.

---

## Counts before mutation

| Metric | Count |
| --- | --- |
| T-Mobile dated content rows | 40 |
| Content rows with any Calendar row | 31 |
| Active T-Mobile Calendar rows | 31 |
| Updatable suggested/tentative | **31** |
| Confirmed / operator / user-edited skipped | **0** |
| Calendar `startAt`/`allDay` differs from content | **31** |
| Real-showtime corrections needed | 10 |
| Date-only corrections needed | 21 |
| Old Chicago-midnight `T05:00Z`/`T06:00Z` still on Calendar | **31** |

Every active T-Mobile Calendar row still had the erroneous midnight pattern.

---

## Mutation

31 suggested Calendar rows updated in place:

```sql
start_at  = content_items.event_starts_at
all_day   = true  when extracted.startTime is null or '00:00:00'
            false otherwise
updated_at = now()
```

| Result | Count |
| --- | --- |
| Rows created | **0** |
| Rows updated | **31** |
| Duplicate Calendar rows after | **0** |
| Other-source Calendar updates in the same window | **0** |

---

## Counts after mutation

| Metric | Count |
| --- | --- |
| Rows examined | 31 |
| Rows updated | 31 |
| Rows still differing from content | **0** |
| Duplicate Calendar rows | **0** |
| Old `T05:00Z`/`T06:00Z` Chicago-midnight pattern remaining | **0** |
| Confirmed/operator skipped | **0** |
| Real-showtime Calendar rows | 10 |
| Date-only Calendar rows (`allDay=true`) | 21 |

---

## Representative before → after

| Event | Content `eventStartsAt` | Calendar before | Calendar after | Chicago display |
| --- | --- | --- | --- | --- |
| Hot Wheels 10/03 6:30 PM | `2026-10-03T23:30:00.000Z` (`startTime` `18:30:00`) | `2026-10-03T05:00:00Z` `allDay=false` | `2026-10-03T23:30:00.000Z` `allDay=false` | **Oct 3, 6:30 PM** |
| PBR 10/23 7:45 PM | `2026-10-24T00:45:00.000Z` (`startTime` `19:45:00`) | `2026-10-23T05:00:00Z` `allDay=false` | `2026-10-24T00:45:00.000Z` `allDay=false` | **Oct 23, 7:45 PM** |
| Jayhawks vs Missouri | `2026-12-06T00:00:00.000Z` (`startTime` null) | `2026-12-06T06:00:00Z` `allDay=false` | `2026-12-06T00:00:00.000Z` `allDay=true` | date-only; **not** 03:30AM |
| Benson Boone | `2026-08-31T00:00:00.000Z` (`startTime` null) | `2026-08-31T05:00:00Z` `allDay=false` | `2026-08-31T00:00:00.000Z` `allDay=true` | date-only (no trustworthy showtime) |

UTC midnight date-only rows display as the previous Chicago evening in wall-clock formatters. That is existing date-only / `allDay` semantics, not a new invented clock.

---

## Content without a Calendar row (not created)

Nine dated T-Mobile content rows had no Calendar row. This pass did **not** insert them.

| Title (truncated) | `eventStartsAt` |
| --- | --- |
| Megan Moroney | `2026-08-16T00:00:00.000Z` |
| J. Cole Tickets \| 19th August | `2026-08-19T00:00:00.000Z` |
| Hot Wheels Monster Trucks Live Glow-N-Fire (short title) | `2026-10-03T00:00:00.000Z` |
| Christmas Together: Amy Grant… | `2026-12-07T00:00:00.000Z` |
| Kansas State vs Wichita State (`03:30AM` chrome, date-only) | `2026-12-11T00:00:00.000Z` |
| Big 12 Session 1 11:30 AM | `2027-03-09T17:30:00.000Z` |
| Big 12 Session 2 6:00 PM | `2027-03-10T00:00:00.000Z` |
| Big 12 Session 4 6:00 PM | `2027-03-11T00:00:00.000Z` |
| Big 12 Session 6 6:00 PM | `2027-03-12T00:00:00.000Z` |

Likely reasons they never got a Calendar row in the 94-create pass: past relative to that window, duplicate identity vs a sibling, or not eligible at projection time. A later **scoped create** could add the remaining future children if desired; that was out of this task.

---

## What remains (not this task)

- Other created-94 clusters (Bowline venue-as-title, OPCC/HPNA midnight, CommUNITY Fest parent-as-event) are still on Calendar as-is.
- Date-only T-Mobile concerts still have no wall-clock because hub/detail JSON-LD is UTC midnight. Overlay cannot invent a showtime.
- Full-window projection still should not be treated as a cleanup tool for those other sources.
