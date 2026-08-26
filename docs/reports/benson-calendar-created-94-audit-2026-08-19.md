# Audit: 94 Calendar rows created 2026-08-19T16:47–16:48Z

Read-only. No code changes. No row mutations. Projection was **not** re-run.

Pass: `ensureCalendarInventoryProjections(2026-08-19T05:00:00.000Z, 2027-12-31T23:59:59.000Z)`  
Reported: created **94**, updated 366, duplicates 69.

**STOP. Not all 94 are legitimate.** Do not treat this pass as clean. Do not fix in this task.

---

## Exact common failure pattern (read this first)

The 94 inserts are **everything** that `upsertSuggestion` created in that single-flight, not only Downtown OP Trick-or-Treat.

The `metadata.containerChild === true` bypass stopped hub `/events` URLs from being classified as parents. That is why many real listing children finally inserted. The same door also admitted **listing-scrape children that are not usable Calendar events**:

1. **Hub chrome / nav copy stored as a child** — title is page UI, not a show (`in calendar view Concerts Happening This Week Today`).
2. **Date-only / midnight clocks** — `allDay=true` or `startAt` at UTC midnight (`T00:00:00Z`), so Chicago day is the **previous** evening; some titles include a clock the stored instant ignores.
3. **Ticketmaster/arena date-only dump** — 31 T-Mobile Center rows, almost all `T05:00:00Z` / `T06:00:00Z` (Chicago **midnight**). Titles often contain `03:30AM` or a show time that is **not** the stored `startAt`.
4. **Band tour listing with venue-as-title** — Bowline Brothers: 26 rows titled `Tin Roof Delray Beach`, `Tin Roof Fort Lauderdale`, `Tin Roof Indianapolis`, etc. Those are venues (many out of market), not show names.
5. **Parent/single-event page in the same create batch** — CommUNITY Fest: `containerChild` unset, Calendar title equals the source/parent document title. This one did **not** need the child bypass; it is still one of the 94 creates.

`calendarEligible === false` suppressed children were **not** in the 94. Known parent article titles were **not** reactivated.

---

## 1. Total = 94 proof

`creator_calendar_items.created_at` on 2026-08-19:

| Minute (UTC) | count |
| --- | --- |
| 16:47 | 35 |
| 16:48 | 59 |
| **Total** | **94** |

Range: `2026-08-19T16:47:42.952Z` … `2026-08-19T16:48:35.232Z`.  
**94 distinct `sourceRecordId`s.** Ingest of every row: `scrape_listing`.

---

## 2. Group counts

### By source (ranked)

| n | sourceName | sourceId |
| --- | --- | --- |
| 31 | [Benson] T-Mobile Center Concerts | `6d79fc9a-84b1-4797-a0b8-263481642f69` |
| 26 | [Benson] Shows — The Bowline Brothers | `7fb75a94-1f95-4e5a-9b41-2cc012a3ea80` |
| 14 | Events — Hyde Park Neighborhood Association Kansas City MO | `ffeaac23-4ef0-4715-be34-9b716b840b65` |
| 11 | Events Archive - Overland Park Convention Center | `6ce4341e-5203-46d8-9ed9-0f6e7af25339` |
| 6 | Family Friendly Shows in Kansas City, MO | `bfc6ddb8-5f6a-4b28-978a-4fcb43edddd0` |
| 2 | [Benson] J. Cole Tickets, 2026 Concert Tour Dates \| Ticketmaster | `8784ee04-de9c-4a27-9cb9-63d4e20bed51` |
| 2 | KC Convention Center Events | `2bb065c1-9337-475f-a749-889547a9a774` |
| 1 | Events in Overland Park — Downtown OP | `495e6e57-2cfe-490b-84de-38cfe2b6440e` |
| 1 | 2026 CommUNITY Fest Presented by G.E.H.A - United Way of Greater Kansas | `a84e0860-7511-4411-88aa-432a93d5c263` |

### Ingest / category / containerChild / month / domain

| ingest | n |
| --- | --- |
| scrape_listing | 94 |

| opportunityCategory | n |
| --- | --- |
| Event | 91 |
| Festival | 3 |

| containerChild | n |
| --- | --- |
| true | 93 |
| unset | **1** (CommUNITY Fest) |

| Chicago month | n |
| --- | --- |
| 2026-08 | 21 |
| 2026-09 | 24 |
| 2026-10 | 19 |
| 2026-11 | 16 |
| 2026-12 | 7 |
| 2027-03 | 7 |

| domain (from calendar/content URL) | n |
| --- | --- |
| bowlinebrothers.com | 26 |
| kansascityarena.com | 16 |
| ticketsqueeze.com | 15 |
| hydeparkkc.org | 14 |
| opconventioncenter.com | 11 |
| kansascity.events | 6 |
| kcconvention.com | 2 |
| downtownop.org | 1 |
| unitedwaygkc.org | 1 |
| ticketmaster.com | 1 |
| ticketmaster.ca | 1 |

---

## 3. Per-row mechanical checks

| Check | Failures |
| --- | --- |
| sourceRecordId exists on content_items | 0 |
| metadata.containerChild === true | **1** |
| metadata.calendarEligible !== false | 0 |
| content eventStartsAt present | 0 |
| title not equal to parent document/source title | **1** (same CommUNITY Fest row) |
| startAt in projection window | 0 |
| not expired/archived/rejected | 0 |
| missing/malformed title | 0 |
| title looks like parent/listing/schedule/guide | **1** (Ticketmaster chrome) |
| UTC midnight or allDay | **8** |
| logical dup among the 94 (Calendar identity) | 0 |
| prior active occurrenceFingerprint / idempotencyKey | 0 |

No two of the 94 share Calendar skip identity. Fingerprint/key did not collide with an **older** active row (narrow check; not a full-window title/day/venue scan — the previous attempt hung on that).

---

## 4–5. Sources with ≥5 new rows

### T-Mobile Center Concerts — 31 — **needs review**

Dated arena shows (Boone, Clapton, Doja Cat, PBR, Big 12, NCAA, etc.). Legitimate **events**, but **clocks are wrong**: almost every `startAt` is Chicago midnight (`2026-08/09/10 …T05:00:00Z`, after DST `T06:00:00Z`). Titles often include `06:30PM`, `07:45PM`, or garbage `03:30AM`. This is a date-only Ticketmaster/listing dump, not a trusted showtime.

Representative: Benson Boone 8/31 `4fe81e25`; Kansas Jayhawks vs Missouri `12/06/2026 03:30AM` stored `2026-12-06T06:00:00Z` `8754c66c`.

### Bowline Brothers — 26 — **needs review / largely junk for Calendar**

Children of a **band tour** hub. Titles are **venue names**, not performances. Includes **Delray Beach, Fort Lauderdale, Fayetteville, Indianapolis** (out of market). KC venues (Tin Roof Kansas City, Limitless Brewing, The Brooksider, Harpos Columbia) are at least local/regional, but still venue-as-title. Three UTC-midnight/allDay: `Upcoming Shows Aug 20 Limitless Brewing` `77ac311c` (chrome + date), BBQ Fest `d49285c5`, Limitless Brewing `8759c722`.

### Hyde Park Neighborhood Association — 14 — **mostly legitimate local meetings**

Board / crime / beautification / general meetings, Homes Tour, Farmers Market. One chrome prefix: `HERE ! Aug 19 HPNA Beautification Monthly Meeting` `7fd35545`. Two allDay UTC midnight: General Meeting `fcf8765f`, Beautification `b4fc3e43` (Chicago day slips to the previous date).

### Overland Park Convention Center archive — 11 — **mostly legitimate named events**

India Fest, galas, conferences, consignment sale. Three allDay UTC midnight (Chicago day −1): Woman of Influence `a7178987`, Just Between Friends `3ee12813`, Kansas Hospital Association `07089353`.

### Family Friendly Shows (kansascity.events) — 6 — **legitimate named show, repeated days**

All **Wicked**, 8/21–8/29 Chicago evenings (`T00:30:00Z`). Same-day multi-showtime collapse is existing identity, not a new duplicate key. Looks like real schedule children.

---

## 6. Known-good Downtown OP

Only **Trick-or-Treat Event** was among the 94 creates (siblings already existed from the 14:37 pass).

| Title | calendar id | sourceRecordId | startAt |
| --- | --- | --- | --- |
| Trick-or-Treat Event | `34818bfe-c429-4bf7-9249-45a62be558b2` | `e39847f4-009e-4be4-bdc8-e407a5a998ce` | `2026-10-24T19:00:00.000Z` |

`containerChild=true`, `calendarEligible` not false, concrete 2:00 PM Chicago. **Correct.**

The other five future Downtown OP children were **not** in the created-94 set (already suggested).

---

## 7. Parent titles — still zero active

| Title | active | cancelled | created in this pass |
| --- | --- | --- | --- |
| Events in Overland Park — Downtown OP | **0** | 5 | 0 |
| Family Shows in Kansas City \| Schedule 2026–2027 | **0** | 18 | 0 |
| Spend a Day in Parkville: Where to Eat, Shop, and Explore | **0** | 1 | 0 |

Neighborhoods confirmed `546d8013-26e2-4a25-a0dc-07eaba51c501` still **confirmed**, `updatedAt` 2026-08-15T02:44:03.711Z — not mutated.

---

## FINAL VERDICT

| Class | Count | Notes |
| --- | --- | --- |
| Clearly legitimate | **~45–55** | Trick-or-Treat; most HPNA meetings + Homes Tour + market; most OPCC named events with real clocks; Wicked × 6; J. Cole Fall-Off Tour; some KC Convention / local Bowline |
| Suspicious / needs review | **~38–48** | Entire T-Mobile midnight dump (31); Bowline venue-as-title / out-of-market; UTC midnight/allDay slips; HPNA `HERE !` chrome |
| Clearly incorrect | **≥2** | CommUNITY Fest parent-as-event; Ticketmaster chrome child |

Automated mechanical split (strict flags only): **84 / 9 / 1**. Human review of clusters raises junk well above that. **Do not call the 94 clean.**

### Clearly incorrect (list every)

| calendar id | sourceRecordId | title | startAt | source | reason |
| --- | --- | --- | --- | --- | --- |
| `8185be73-01d0-458b-9c4b-7592f357d137` | `00f95609-5077-4410-ae54-a52f439c83b8` | 2026 CommUNITY Fest Presented by G.E.H.A - United Way of Greater Kansas City | 2026-11-06T14:00:00.000Z | United Way CommUNITY Fest listing | **`containerChild` unset; Calendar title equals parent/source title** |
| `1b17dfb6-d5c2-466e-95e0-02136371f472` | `f7a8d1c6-b7dd-43d6-af4f-2c09fdc84b4e` | in calendar view Concerts Happening This Week Today | 2026-08-20T01:00:00.000Z | J. Cole Ticketmaster | **Listing chrome, not an event**; location `at Wed Aug 19 T-Mobile Center Kansas City, MO J.` |

### Suspicious (mechanical midnight/allDay + chrome; not exhaustive of T-Mobile/Bowline)

| calendar id | sourceRecordId | title | startAt | source | reason |
| --- | --- | --- | --- | --- | --- |
| `a7178987-6b5f-4724-9324-6a3ad1cc60a5` | `0e56903e-c364-4756-9563-875d3235b765` | KC Business Journal: Woman of Influence \| OPCC | 2026-08-28T00:00:00Z | OP Convention Center | allDay / UTC midnight; Chicago day 8/27 |
| `3ee12813-992d-4428-83b2-f080d06e78d6` | `e342a110-6a69-4944-8b43-eb77e2749ec8` | Just Between Friends Consignment Sale \| OPCC | 2026-09-02T00:00:00Z | OP Convention Center | allDay / UTC midnight; Chicago day 9/01 |
| `07089353-8dd3-4f08-9297-358e812a3ecc` | `31deca08-c0ba-4747-8880-ac310d6e04c7` | Kansas Hospital Association Convention & Trade Show \| OPCC | 2026-09-10T00:00:00Z | OP Convention Center | allDay / UTC midnight; Chicago day 9/09 |
| `fcf8765f-ceb6-46e4-87e8-36ee45422962` | `68ee369b-0a40-4ca9-9beb-96c4be3dece1` | HPNA General Meeting | 2026-09-16T00:00:00Z | Hyde Park NA | allDay / UTC midnight |
| `b4fc3e43-5df1-4d1a-97b0-a0e073dd953a` | `f234317b-638d-4cde-a77e-89c12976e7d2` | HPNA Beautification Monthly Meeting | 2026-11-19T00:00:00Z | Hyde Park NA | allDay / UTC midnight |
| `77ac311c-9bde-46c3-af8e-5a70235da178` | `04421a47-3322-48b1-9f41-16e3e320b968` | Upcoming Shows Aug 20 Limitless Brewing | 2026-08-21T00:00:00Z | Bowline Brothers | chrome title + allDay |
| `d49285c5-3e41-4fdd-a4f7-c45c1d6d5c9d` | `fd5b52f9-46cc-4082-883f-30cebf2732c8` | St Elizabeth’s BBQ Fest | 2026-09-19T00:00:00Z | Bowline Brothers | allDay / UTC midnight |
| `8759c722-c313-49d1-9f30-4898b0d090c8` | `2e417784-9c4e-4b7f-a380-bcebfff8e88b` | Limitless Brewing | 2026-09-18T00:00:00Z | Bowline Brothers | venue-as-title + allDay |

Plus the **31 T-Mobile** midnight-Chicago rows and **out-of-market Bowline venue titles** (Delray, Fort Lauderdale, Indianapolis, Fayetteville) as the large-cluster review set. Full 94 titles/dates are in the query output used for this audit (created_at 16:47–16:48Z).

---

## What this audit did not do

- Did not cancel, edit, or delete any row
- Did not re-run projection
- Did not change eligibility/extraction code
- Did not full-scan every pre-existing Calendar row for loose title/day/venue dupes (that scan hung the first attempt)
