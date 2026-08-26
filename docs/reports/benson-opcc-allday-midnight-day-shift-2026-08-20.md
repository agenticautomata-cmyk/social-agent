# OPCC date-only / UTC-midnight Calendar day shift — read-only proof

Date: 2026-08-20  
Source cluster: Overland Park Convention Center (`opconventioncenter.com`)  
Scope: **read-only**. No mutations, no projection, no re-ingest, no code changes.  
Out of scope: HPNA, T-Mobile, CommUNITY Fest, Bowline, Downtown OP / Family Shows, confirmed/operator rows.

---

## Verdict

**There is a real user-visible one-day shift** for OPCC date-only / `allDay=true` rows stored as `YYYY-MM-DDT00:00:00Z`.

Calendar does **not** use the UTC `YYYY-MM-DD` date key for all-day events. It converts `startAt` to **America/Chicago first**, then buckets and formats. UTC midnight → previous local evening → **previous calendar day**.

`allDay=true` is set at population time but **ignored** by dashboard day grouping / all-day “when” formatting.

This is **not** a false alarm from “wall-clock would show prior evening.” Both the **day section key** and the **displayed date label** shift back one day.

---

## Code path (exact)

### Persist / population (how midnight + allDay arise)

1. Extracted `eventDate` is date-only (`2026-08-28`).
2. `parseEventDate('YYYY-MM-DD')` → `YYYY-MM-DDT00:00:00.000Z` (`listing-extract.ts`).
3. `candidateFromInventory` sets `allDay` when UTC h/m/s are all 0 (`eligibility.ts` ~414–415).
4. Calendar stores that instant + `allDay=true`.

### Dashboard (where display breaks)

`dashboard/app/calendar/calendar-panel.tsx`:

```44:72:dashboard/app/calendar/calendar-panel.tsx
function formatWhen(item: CalendarItemView): string {
  const start = new Date(item.startAt);
  if (item.allDay) {
    return start.toLocaleDateString('en-US', {
      timeZone: CREATOR_TIMEZONE,  // America/Chicago — shifts UTC midnight back one day
      ...
    });
  }
  ...
}

function groupByDay(items: CalendarItemView[]): Map<string, CalendarItemView[]> {
  ...
    const key = getLocalCalendarDay(item.startAt); // ALWAYS Chicago-local; ignores allDay
  ...
}
```

`getLocalCalendarDay` (`dashboard/lib/calendar-local-date.ts`) formats the instant in `America/Chicago` — no all-day / UTC-date-key branch.

**America/Chicago conversion happens before / instead of allDay date-key handling** for both grouping and the all-day “when” string.

### Already-aware helper (not used by Calendar panel)

`dashboard/lib/datetime.ts` `formatDate` **already documents and mitigates** this for generic date display by anchoring UTC midnight at UTC noon. Calendar panel does **not** use that path for day sections or `formatWhen`.

---

## Rows inspected (5)

### 1–2 / 5 — date-only + allDay (broken)

| | Woman of Influence | Just Between Friends |
| --- | --- | --- |
| Calendar id | `a7178987-6b5f-4724-9324-6a3ad1cc60a5` | `3ee12813-992d-4428-83b2-f080d06e78d6` |
| Source URL | `/events/kansas-city-business-journal-women-of-influence/` | `/events/just-between-friends-consignment-sale/` |
| JSON-LD `startDate` | **`2026-08-28`** (date-only) | **`2026-09-02`** (date-only; end `2026-09-06`) |
| Intended local date | **Aug 28, 2026** | **Sep 2, 2026** (sale start) |
| content `eventDate` | `2026-08-28` | `2026-09-02` |
| content `eventStartsAt` | `2026-08-28T00:00:00.000Z` | `2026-09-02T00:00:00.000Z` |
| Calendar `startAt` | `2026-08-28T00:00:00.000Z` | `2026-09-02T00:00:00.000Z` |
| `allDay` | **true** | **true** |
| UTC YMD slice | `2026-08-28` | `2026-09-02` |
| `groupByDay` key (`getLocalCalendarDay`) | **`2026-08-27`** | **`2026-09-01`** |
| `formatWhen` (allDay) | **`Thu, Aug 27`** | **`Tue, Sep 1`** |
| Chicago wall of instant | Thu Aug 27, 7:00 PM | Tue Sep 1, 7:00 PM |
| One-day shift vs source | **yes (−1)** | **yes (−1)** |

### 5 — date-only + allDay with clear multi-day source evidence

| | Kansas Hospital Association Convention & Trade Show |
| --- | --- |
| Calendar id | `07089353-8dd3-4f08-9297-358e812a3ecc` |
| JSON-LD | `startDate: 2026-09-10`, `endDate: 2026-09-11` |
| Intended start local date | **Sep 10, 2026** |
| content `eventDate` | `2026-09-10` |
| content / Calendar start | `2026-09-10T00:00:00.000Z`, `allDay=true` |
| `groupByDay` key | **`2026-09-09`** |
| `formatWhen` | **`Wed, Sep 9`** |
| One-day shift vs source | **yes (−1)** |

### 3–4 — timed controls (no UTC-midnight day-key shift)

| | Inspiring Women Conference | Midwest Ability Summit |
| --- | --- | --- |
| Calendar id | `bde29613-7f1f-4dec-8e09-32044cce80b1` | `4d0b181b-d8e5-4279-8e6b-709bf81bc1ed` |
| JSON-LD start | `2026-08-21T03:00:00-05:00` | `2026-08-22T05:00:00-05:00` |
| Calendar `startAt` | `2026-08-21T08:00:00.000Z` | `2026-08-22T10:00:00.000Z` |
| `allDay` | **false** | **false** |
| UTC YMD | `2026-08-21` | `2026-08-22` |
| `groupByDay` key | `2026-08-21` | `2026-08-22` |
| Shift of day key vs UTC YMD | **no** | **no** |

Timed controls confirm: non-midnight starts that land on the same Chicago calendar day as the intended date do **not** exhibit the all-day UTC-midnight −1 day bug. (Separate clock-quality questions on OPCC JSON-LD offsets are out of scope here.)

---

## Intended source date vs displayed Calendar date (summary)

| Event | Intended (source) | Displayed day key / label | Shift? |
| --- | --- | --- | --- |
| Woman of Influence | Aug 28 | Aug 27 | **yes** |
| Just Between Friends | Sep 2 | Sep 1 | **yes** |
| KHA Convention | Sep 10 | Sep 9 | **yes** |
| Inspiring Women (timed) | Aug 21 | Aug 21 | no (day key) |
| Midwest Ability (timed) | Aug 22 | Aug 22 | no (day key) |

---

## Recommended smallest fix (do not implement in this task)

**Dashboard Calendar only**, where the bug is user-visible:

In `calendar-panel.tsx` `groupByDay` and all-day `formatWhen` (or a tiny helper shared with them):

- If `item.allDay === true` **or** `startAt` is a UTC-midnight date-only sentinel,  
  use **UTC `YYYY-MM-DD`** (`startAt.slice(0, 10)` / UTC date parts) as the day key and display date —  
  **or** reuse the existing UTC-noon anchor pattern from `dashboard/lib/datetime.ts` `formatDate`.

Do **not** need OPCC-specific logic. Do **not** require a full Calendar projection to prove the UI fix.

Optional later (broader, not smallest): align storage so date-only events are not ambiguous instants — only if product wants API/Google export semantics fixed the same way.

---

## Freeze confirmation

| | |
| --- | --- |
| Code changed | **no** |
| Data changed | **no** |
| Projection / re-ingest | **not run** |
| HPNA / T-Mobile / CommUNITY / Bowline / Downtown OP / Family Shows | **not touched** |
