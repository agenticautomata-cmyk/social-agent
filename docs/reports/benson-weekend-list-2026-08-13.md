# Benson Weekend List — 2026-08-13

**Scope:** Turn existing Weekend-board selections into an operator-facing `/weekend-list` with copyable flyer brief. No Calendar/Today/Discover/Home redesign. No image generation, LLM, scraping, or scoring changes. Later/snooze untouched.

## Existing selection authority found

Single durable system already existed:

| Surface | Persistence |
|---|---|
| Calendar shortlist **Add to weekend list** / **Selected · Remove** | `POST /api/calendar/weekend-things-to-do/:id` → `setWeekendListMembership` |
| Calendar agenda **Add to weekend list** | `PUT /api/content-planner/items/:id` `{ action: 'plan_weekend' }` |
| Today **Plan for weekend** | existing `plan_weekend` planner action |

All of these upsert `planner_items` with `listName = 'Weekend'` (unique on `content_item_id`). Remove moves the row to **Saved For Later**.

**No second selection system was added.**

## Implementation / reuse

- New operator page: `/weekend-list`
- API: `GET /api/calendar/weekend-list` (optional `?friday=YYYY-MM-DD` for past weekends)
- Remove on the page reuses `POST /api/calendar/weekend-things-to-do/:id` `{ selected: false }`
- Calendar header link: **Weekend List · N selected**
- Planner Weekend board tile now opens `/weekend-list`
- Daily sidebar item **Weekend List** (not a new mobile bottom tab)

Grouping uses the content item’s **event occurrence date** in America/Chicago, not discovery time and not `plannedDate` (which `plan_weekend` sets to next Saturday).

## Migration

**No.** `planner_items.listName = 'Weekend'` already represents the bucket.

## Duplicate handling

`planner_items.content_item_id` is unique. Re-adding the same event upserts the same row. Multi-day events appear once (first Fri–Sun day they occur) with an “Also Saturday–Sunday” note when they span.

September / other-date Weekend-board rows stay on the planner; they are **not** shown in the current Fri–Sun list (`outsideWindowCount` notes them).

## Current-weekend calculation

`getChicagoWeekendDayKeys()` — America/Chicago Fri–Sun.

- Regression window: **Fri Aug 14 – Sun Aug 16, 2026**
- Monday Aug 17 advances to **Aug 21–23**
- After Sunday passes, old Weekend-board rows remain; they fall into **Past weekends** instead of being deleted

## Copy output examples (live, Aug 14–16, 2026)

Deterministic. No LLM. No IDs, scores, or DB state names.

```
THINGS TO DO THIS WEEKEND IN KC
August 14–16, 2026

FRIDAY

816 Day | Kansas City
Kansas City Power & Light District
Kansas City, MO
…
Source: https://www.816day.org/?utm_source=openai

SATURDAY

Hike with a Naturalist
10:30 AM
Lakeside Nature Center
kansas city
…
Source: https://kcparks.org/event/hike-with-a-naturalist-16/
```

Copy full list adds complete addresses, source names, operator notes, and verification caveats.

Note: 816 Day’s stored summary currently talks about Cleo Club (inventory text). Weekend List does not rewrite research copy.

## Live 816 Day + Hike regression

1. **816 Day \| Kansas City** already on Weekend board → Weekend List **FRIDAY**; View source `https://www.816day.org/?utm_source=openai`; venue Power & Light; address `50 E 13th St, Kansas City, MO 64106`.
2. **Hike with a Naturalist** (`1e285ae1-…`, Aug 15 10:30 AM) added via existing `setWeekendListMembership(true)` → appears under **SATURDAY**; source `https://kcparks.org/event/hike-with-a-naturalist-16/`.
3. Calendar shortlist shows **Selected · Remove** for both; header **Weekend List · 3 selected**. Other dated Hike instances still **Add to weekend list**.
4. Re-POST 816 Day → still one 816 Day row.
5. Flyer brief contains both in Fri then Sat chronological order.

Discover **Add to Things To Do** still uses its existing Today helper (not the Weekend board). Today **Plan for weekend** already shares `plan_weekend`. Calendar is the required feed.

## Mobile smoke (390×844)

`/weekend-list`: range + selected count, Copy flyer brief / Copy full list, Friday 816 Day with View source + Remove, Saturday Hike with time/venue/address. No Skip. Bottom nav unchanged (Home / Today / Discover / Pitches / More).

## Health / fingerprint

| Check | Result |
|---|---|
| API `/api/health/ready` | healthy |
| Dashboard `:3000` | 200 |
| Workers | running (`tsx src/benson.ts`) |
| Fingerprints | **MATCH** `287ee0a54bd3d0b8` |

WEEKEND LIST VERIFIED  
BENSON LEFT HEALTHY  
STOP.
