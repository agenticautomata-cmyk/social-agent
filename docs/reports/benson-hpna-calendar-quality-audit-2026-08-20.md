# Hyde Park Neighborhood Association Calendar quality audit

Date: 2026-08-20  
Scope: **Read-only** re-audit of the created-94 HPNA source cluster under current Calendar semantics  
Prior: [benson-calendar-created-94-audit-2026-08-19.md](./benson-calendar-created-94-audit-2026-08-19.md) (~14 HPNA rows flagged largely for UTC midnight)

**Code changed: no. Data changed: no. Projection / re-ingest: not run.**

---

## Verdict: **MIXED**

| Bucket | Finding |
| --- | --- |
| **Legitimate** | Most named HPNA meetings / market / Homes Tour with retained `startTime` are real neighborhood events; under current temporal evidence, **intended local day is correct** even when `startAt` is `T00:00:00Z`. Old “midnight = suspicious” is **not** enough to cancel these. |
| **Proven bad (still active)** | **11** Calendar rows titled exactly `Events — Hyde Park Neighborhood Association Kansas City MO` (listing/parent page identity + `#eventN` URLs). **1** chrome title `HERE ! Aug 19 HPNA Beautification…`. **1** CTA row `Vendor Application for 2026 Hyde Park Farmers Market` (form, not the market event). |
| **Extraction / representation defects** | (1) Timed evening events that persist as UTC midnight still get `allDay=true` (display flag wrong) even when `startTime` is present and day-key is correct. (2) At least one older General Meeting lost `startTime` and falls through date-only UTC YMD → **wrong day** vs source. |

Do **not** close the entire HPNA suspicion. Do **close** the blanket “allDay UTC midnight ⇒ bad” conclusion for rows that retain real clocks.

---

## Source identity + counts

| Field | Value |
| --- | --- |
| source id | `ffeaac23-4ef0-4715-be34-9b716b840b65` |
| source name | Events — Hyde Park Neighborhood Association Kansas City MO |
| listing URL | `https://www.hydeparkkc.org/events` (config `listingUrl` includes `?utm_source=openai`) |
| type | scrape / active |
| linked content rows | **59** |
| Calendar rows (all statuses) | **27** suggested (no cancelled on this join) |
| **Active Calendar** (`planning_status ≠ cancelled`) | **27** |
| planning-status breakdown | `suggested`: 27 |
| `allDay=true` | **4** |
| `allDay=false` | **23** |
| Content with extracted `startTime` present | **15** named/timed children (approx.) |
| Parent listing-title Calendar rows | **11** |
| Chrome `HERE !` title | **1** |

(Secondary source `887d03f4-…` Farmers Market page was **not** in scope; created-94 cluster maps to `ffeaac23`.)

---

## Compact audit table — all active HPNA Calendar rows

Legend: **P** = parent listing title; **C** = containerChild named event; **X** = chrome/CTA; day = `inventoryTemporalDayKey` with load-time evidence.

| Cal id (8) | Title | Content (8) | Day key | allDay | startTime | Elig now | Class |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `07d9daa5` | Events — Hyde Park… | `771cec91` | 08-12 | n | null | expired | **P** |
| `70da8511` | HPNA General Meeting | `7e2bc7e5` | **08-19** | y | **null** | not_temporally_current | named / **clock lost** |
| `b750ea67` | Events — Hyde Park… | `d509c879` | 08-19 | n | null | not_temporally_current | **P** |
| `7fd35545` | HERE ! Aug 19 HPNA Beautification… | `b85432f3` | 08-19 | n | 18:00 | past_event | **X chrome** |
| `e01e155d` | HPNA Board Meeting | `04c5e764` | 09-01 | n | 18:30 | **ok** | **C** legit |
| `8a7f0cec` | Events — Hyde Park… | `d21941c5` | 09-01 | n | null | editorial_container | **P** |
| `88661eef` | Events — Hyde Park… | `92aa0c83` | 09-06 | n | null | editorial_container | **P** |
| `1ed5c3a9` | Vendor Application for 2026 Hyde Park Farmers Market | `e40e26b0` | 09-06 | n | null | **ok** | **X CTA** |
| `964f9e82` | Events — Hyde Park… | `279c26f2` | 09-09 | n | null | editorial_container | **P** |
| `f40b3f47` | HPNA Monthly Crime Meeting | `…` | 09-09 | n | 10:00 | **ok** | **C** |
| `fcf8765f` | HPNA General Meeting | `68ee369b` | **09-15** | **y** | **19:00** | **ok** | **C** + allDay flag defect |
| `fad07f53` | Events — Hyde Park… | `75942d0d` | 09-16 | y | null | editorial_container | **P** |
| `dd67b59c` | HPNA Beautification… | `c72b0e21` | 09-16 | n | 18:00 | **ok** | **C** |
| `b08a96c6` | Events — Hyde Park… | `5b6e18ab` | 09-16 | n | null | editorial_container | **P** |
| `704b71cf` | 2026 Hyde Park Homes Tour | `…` | 10-03 | n | 10:00 | **ok** | **C** |
| `2f709577` | Events — Hyde Park… | `b7cf6418` | 10-03 | n | null | editorial_container | **P** |
| `569b4081` | HPNA Board Meeting | `…` | 10-06 | n | 18:30 | **ok** | **C** |
| `afa51190` | Events — Hyde Park… | `c9bf5c4d` | 10-06 | n | null | editorial_container | **P** |
| `2090651e` | Hyde Park Farmers Market | `76e5156b` | 10-11 | n | 08:30 | **ok** | **C** |
| `98057151` | Events — Hyde Park… | `8da580ea` | 10-11 | n | null | editorial_container | **P** |
| `0230aba3` | HPNA Monthly Crime Meeting | `eb5f1fde` | 10-14 | n | 10:00 | **ok** | **C** |
| `e05003fc` | Events — Hyde Park… | `4eb19ad3` | 10-14 | n | null | editorial_container | **P** |
| `b5ea6150` | HPNA Beautification… | `9bafedaa` | 10-21 | n | 18:00 | **ok** | **C** |
| `75dba3db` | HPNA Board Meeting | `5e07d5e4` | 11-03 | n | 18:30 | **ok** | **C** |
| `7f3b8eb6` | HPNA Monthly Crime Meeting | `bcfd4930` | 11-11 | n | 10:00 | **ok** | **C** |
| `e5517791` | HPNA General Meeting | `91f32d3f` | 11-17 | n | 19:00 | **ok** | **C** |
| `b4fc3e43` | HPNA Beautification… | `f234317b` | **11-18** | **y** | **18:00** | **ok** | **C** + allDay flag defect |

---

## Representative source evidence (≤5)

Live listing: [hydeparkkc.org/events](https://www.hydeparkkc.org/events) — Squarespace-style event list with **explicit weekday + date + start/end clocks** (not date-only).

### 1. Timed control — HPNA Board Meeting Sep 1 (`e01e155d` / `04c5e764`)

| | |
| --- | --- |
| Source | Tuesday, September 1, 2026 · **6:30 PM – 7:30 PM** · Pilgrim Chapel |
| Extracted | `eventDate=2026-09-01T18:30:00`, `startTime=18:30:00` |
| Stored / Calendar | `2026-09-01T23:30:00Z`, `allDay=false` |
| Day key | **2026-09-01** |
| Verdict | **Genuine event**, representation OK |

### 2. “Midnight / allDay” created-94 suspect — HPNA General Meeting Sep 15 (`fcf8765f` / `68ee369b`)

| | |
| --- | --- |
| Source | Tuesday, **September 15**, 2026 · **7:00 PM – 8:00 PM** |
| Extracted | `eventDate=2026-09-15T19:00:00`, `startTime=19:00:00` |
| Stored | `eventStartsAt=2026-09-16T00:00:00Z` (= 7pm CDT Sep 15) |
| Calendar | `allDay=true` (flag from UTC-midnight heuristic) |
| Day key (evidence-aware) | **2026-09-15** (correct) |
| Verdict | **Genuine event**. Old “wrong Chicago day” fear is fixed for eligibility/day-key. Remaining defect: **`allDay=true` despite real clock**. |

### 3. Most suspicious title — `HERE ! Aug 19 HPNA Beautification…` (`7fd35545` / `b85432f3`)

| | |
| --- | --- |
| Source page copy | “Submit the form **HERE**!” above the events list; real event is “HPNA Beautification Monthly Meeting” Aug 19 6–7 PM |
| Extracted title | `HERE ! Aug 19 HPNA Beautification Monthly Meeting` (nav/CTA bleed) |
| Clock | `startTime=18:00:00` (correct meeting time) |
| Verdict | **Bad title / listing chrome**, not a separate real event. Eligibility currently `past_event` (date passed). |

### 4. Date-only-ish / clock-lost — HPNA General Meeting Aug 18 (`70da8511` / `7e2bc7e5`)

| | |
| --- | --- |
| Source | Tuesday, **August 18**, 2026 · **7:00 PM** |
| Extracted | `eventDate=2026-08-18T19:00:00`, **`startTime` absent** |
| Stored | `2026-08-19T00:00:00Z`, `allDay=true` |
| Day key | **2026-08-19** (UTC date-only fallback) vs intended **Aug 18** |
| Verdict | **Genuine meeting + extraction defect** (clock dropped → false date-only → wrong encoded day). |

### 5. Parent listing page as event — e.g. Sep 1 (`8a7f0cec` / `d21941c5`)

| | |
| --- | --- |
| Title | `Events — Hyde Park Neighborhood Association Kansas City MO` |
| URL | `…/events?…#event4` |
| Paired child | Board Meeting `e01e155d` same slot |
| Elig | `editorial_container` |
| Verdict | **Proven bad** parent/listing identity still active on Calendar |

---

## Date-only semantics proof (current stack)

1. **True clocks retained** (Sep 15 General Meeting, Nov 18 Beautification): `T00:00:00Z` + `startTime` → timed Chicago day = **intended local day**. Midnight alone is **not** a cancel reason.  
2. **`allDay=true`** on those rows is still a **display/classification** bug (`candidateFromInventory` / projection midnight heuristic), separate from day-key correctness.  
3. **Clock lost** (Aug 18 General Meeting): falls through `isDateOnlyTimestamp` → UTC YMD **one calendar day late** vs source. That is an extraction defect, not “valid date-only.”  
4. Source HTML **does provide real clocks** for these meetings; HPNA is not a date-only feed.

---

## Current eligibility results (wall-clock ≈ 2026-08-20)

| Detail | Count (active) | Meaning |
| --- | --- | --- |
| ok | ~13 | Mostly named container children |
| `editorial_container` | 9 | Parent listing titles (future) |
| `expired` / `not_temporally_current` / `past_event` | 4 | Past parents + past chrome + Aug General Meeting |
| `listing_chrome` / `venue_as_title` / `wrong_city` | **0** | — |

Note: `editorial_container` already fails **new** projection of parents; they remain **active suggested** Calendar rows until cancelled/cleaned (projection not run in this audit).

---

## Duplicate occurrence check

No exact duplicate of `title + intended day + venue` among **named** rows.

**Logical duplicates** exist as **parent + child pairs** on the same slot (same start instant / same meeting), e.g.:

- Sep 1 Board: child `e01e155d` + parent `8a7f0cec`  
- Sep 16 Beautification: child `dd67b59c` + parent `b08a96c6`  
- Oct 11 Market: child `2090651e` + parent `98057151`  

Parents use the site title; children use the real event title.

---

## Exact bad ids (do **not** cancel in this task)

### Parent listing titles (cancel candidates)

| Calendar id | Content id |
| --- | --- |
| `07d9daa5-eea5-4b00-9035-bbd913c99393` | `771cec91-44aa-40a8-a8c5-1f48468ef524` |
| `b750ea67-6196-4674-8656-3e1c27030ab5` | `d509c879-21ed-4924-8ecd-3a407210b899` |
| `8a7f0cec-0ffb-4bcf-89a4-cfe98d31bace` | `d21941c5-5a1e-4216-a64f-0932d8b8e5d0` |
| `88661eef-1bb1-408c-aa2e-2b08e63381a5` | `92aa0c83-b728-4b88-8416-f1d1a86a1634` |
| `964f9e82-e4fb-4a31-be74-a41151ab18cd` | `279c26f2-9661-4094-b846-1fb82930c6fd` |
| `fad07f53-680d-4daf-9008-21acad534daf` | `75942d0d-63c0-43f8-9883-0e3b9460d460` |
| `b08a96c6-f793-4617-bf3a-d0dceaf002a5` | `5b6e18ab-26c7-421b-988b-ac26e2b63468` |
| `2f709577-88ef-4de9-8715-94ae52079f06` | `b7cf6418-d60c-4b74-b866-522526a33987` |
| `afa51190-34c6-40fd-8144-263ec317fb40` | `c9bf5c4d-28f4-4325-9533-f10653502fca` |
| `98057151-d895-4ee5-8c7a-6a0187fb3082` | `8da580ea-0dfe-4192-9194-e0aeff4be639` |
| `e05003fc-0503-4956-8b5b-7f54067b4256` | `4eb19ad3-e6f1-4852-bebd-c5fec2d8644e` |

Evidence: title = source site name; URL = listing `#eventN`; eligibility `editorial_container` (when temporally current); duplicates real children.

### Chrome title

| Calendar id | Content id | Evidence |
| --- | --- | --- |
| `7fd35545-c824-4058-823d-00c45bca4f1b` | `b85432f3-3a0f-4c49-b9eb-aad2683756a8` | `HERE !` from “Submit the form HERE!”; not a distinct event |

### CTA / non-event identity (eligible today — quality bad)

| Calendar id | Content id | Evidence |
| --- | --- | --- |
| `1ed5c3a9-3322-4a6c-bd6e-a456943261cc` | `e40e26b0-d44e-43ce-8ab3-8e6be282f0da` | Title/URL = vendor **application** form (`tinyurl.com/HPMarket2026`); extracted card title is Farmers Market — should not be a separate Calendar event beside the market occurrence |

---

## Exact extraction defect branches (do **not** fix here)

1. **`allDay` from UTC midnight despite `startTime`**  
   Rows: `fcf8765f-…` (Sep 15 General Meeting), `b4fc3e43-…` (Nov 18 Beautification).  
   Persist `…T00:00:00Z` for 7pm/6pm CT + `raw_payload.extracted.startTime` set, but Calendar `allDay=true` via midnight heuristic in candidate/projection. Day-key path is already evidence-aware; **allDay stamp is not**.

2. **Missing `startTime` on otherwise timed extract**  
   Row: `70da8511-…` / content `7e2bc7e5-…`.  
   `eventDate` has `T19:00:00` local wall string but `startTime` omitted → load treats as date-only UTC YMD → **Aug 19 instead of Aug 18**.

3. **Parent listing ingest still materializes Calendar suggestions** with site title (historical projection); current eligibility would exclude on rebuild, but actives remain.

---

## Recommended next action

1. **Scoped cleanup (separate task):** cancel the **11** parent listing Calendar rows + **HERE !** chrome (+ optionally Vendor Application CTA). Do not cancel legitimate named children.  
2. **Do not** mass-cancel allDay midnight HPNA rows that retain `startTime` and correct day keys.  
3. **Follow-up code (separate):**  
   - `allDay` should respect extracted `startTime` (same thin evidence already used for day keys).  
   - Ensure timed extracts always populate `startTime` when `eventDate` carries a clock.  
4. Partially **close** created-94 HPNA “midnight suspicion”; **keep open** parent/chrome/CTA cleanup and allDay-flag defect.

---

## Confirmations

| | |
| --- | --- |
| Code changed | **no** |
| Data changed | **no** |
| Projection / re-ingest | **not run** |

---

## Out of scope

1. Farmers Market standalone source `887d03f4-…`.  
2. Implementing cancel/cleanup or allDay/startTime fixes.  
3. Full Calendar beyond this source.  
4. Whether `isCalendarParentContainerItem` should also catch Vendor Application CTAs (currently elig=ok).
