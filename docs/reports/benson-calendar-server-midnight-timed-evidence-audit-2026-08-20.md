# Server Calendar: timed vs date-only evidence in production inventory load

Date: 2026-08-20  
Scope: **Read-only** audit — can `inventoryTemporalDayKey` distinguish true date-only UTC-midnight events from real timed events at exactly `T00:00:00Z` on the **actual** Calendar population path?  
Related: [past_event day-key fix](./benson-calendar-server-temporal-allday-fix-2026-08-20.md)

**Code changed: no. Data changed: no. Projection / re-ingest: not run. `stale_freshness`: not investigated.**

---

## Verdict: **production ambiguity EXISTS**

On the production-shaped Calendar inventory path, a real timed event persisted at exactly `T00:00:00.000Z` **does not** retain `startTime` (or equivalent) on `InventoryItem`.  
`inventoryTemporalDayKey` therefore hits the `isDateOnlyTimestamp` fallback and classifies it as **date-only**, using the UTC `YYYY-MM-DD` instead of the America/Chicago local day.

True date-only OPCC rows happen to get the correct UTC day via that same fallback. Timed `T00:00Z` rows get the **wrong** day key.

**Regression is not protected in the actual load path.**

---

## Exact InventoryItem load / normalization path

Calendar population (`collectInventoryCandidates` in `services/core/src/creator-calendar/population/sync.ts`):

1. `db.select({ ...inventoryLoadContentItemSelect, sourceName, sourceType })`
2. `normalizeInventoryItem(item, sourceName, sourceType)`
3. `evaluateInventoryCalendarEligibility(item, now)` → `inventoryTemporalDayKey(...)`

### Load projection

`services/core/src/inventory/inventory-load-projection.ts`:

- **Selects** `metadata`, dates, location fields, scores, lifecycle, etc.
- **Explicitly omits** `rawPayload` (documented in `INVENTORY_LOAD_OMITTED_CONTENT_COLUMNS`).

### Normalization

`normalizeInventoryItem` (`services/core/src/inventory/normalize.ts`):

- Sets `eventDate` / `eventEndDate` from `eventStartsAt` / `eventEndsAt`.
- Passes through `metadata: (item.metadata ?? {})` **as stored**.
- Does **not** read `raw_payload`.
- Does **not** promote `raw_payload.extracted` into `metadata.extracted`.

### Helper preference (`inventoryTemporalDayKey`)

1. `metadata.extracted.startTime` **or** `metadata.rawPayload.extracted.startTime` with a real clock → Chicago timed day  
2. Bare `YYYY-MM-DD` extracted eventDate / eventEndDate → that encoded day  
3. Else if `isDateOnlyTimestamp` (UTC midnight) → UTC `YYYY-MM-DD` date-only fallback  
4. Else → Chicago timed day  

On production InventoryItem, steps 1–2 almost always miss for listing-scrape rows (no `metadata.extracted`, no `metadata.rawPayload`).

---

## Fields retained vs lost

| Field | On `content_items` | After Calendar `inventoryLoadContentItemSelect` | On `InventoryItem` after normalize | Visible to `inventoryTemporalDayKey` |
| --- | --- | --- | --- | --- |
| `event_starts_at` | yes | yes → `eventStartsAt` | `eventDate` ISO | yes (instant only) |
| `metadata` | yes | yes | `metadata` copy | yes |
| `metadata.extracted.*` | usually **absent** on sample | same | same | no useful temporal evidence |
| `raw_payload` | yes | **omitted** | not present | **no** |
| `raw_payload.extracted.eventDate` | yes on sample | **lost at select** | lost | **no** |
| `raw_payload.extracted.startTime` | yes for timed sample | **lost at select** | lost | **no** |
| Explicit `dateOnly` / `allDay` flag on metadata | not used as authority here | — | — | no |

**Information-loss point:** Calendar inventory **SELECT omits `raw_payload`**. Evidence still exists in the database; it never reaches normalize or eligibility. Secondary gap: ingest does not copy a thin `extracted` temporal slice into `metadata`, so even full-row normalize (if raw were selected without promotion) would still need `metadata.rawPayload` or a promoted `metadata.extracted` for the helper’s current lookup.

---

## Bounded live rows inspected (5)

All via production-shaped select → `normalizeInventoryItem` → `inventoryTemporalDayKey` (read-only).

### 1. True date-only — Woman of Influence

| | |
| --- | --- |
| content id | `0e56903e-c364-4756-9563-875d3235b765` |
| title | KC Business Journal: Woman of Influence \| Overland Park Convention Center |
| source | Events Archive - Overland Park Convention Center |
| persisted `eventStartsAt` | `2026-08-28T00:00:00.000Z` |
| raw `extracted.eventDate` | `2026-08-28` |
| raw `extracted.startTime` | `null` |
| after normalize | no `metadata.extracted`; no `metadata.rawPayload` |
| `inventoryTemporalDayKey` | **`2026-08-28`** |
| intended Chicago / calendar day | **2026-08-28** (date-only) |
| helper class | **date-only** (UTC midnight fallback) |
| Correct? | **yes** (fallback matches intent) |

### 2. Real timed @ T00:00Z — Big 12 Session 2 (6:00 PM local)

| | |
| --- | --- |
| content id | `eaca7e7f-2828-490f-b096-14165b3646c4` |
| title | Big 12 Mens Basketball Tournament - Session 2 Tickets \| 03/09/2027 06:00PM \| T-Mobile Center… |
| source | [Benson] T-Mobile Center Concerts |
| persisted `eventStartsAt` | `2027-03-10T00:00:00.000Z` |
| raw `extracted.eventDate` | `2027-03-09T18:00:00` |
| raw `extracted.startTime` | **`18:00:00`** |
| after normalize | no extracted / rawPayload on metadata |
| production day key | **`2027-03-10`** (date-only fallback) |
| Chicago day of instant | **`2027-03-09`** |
| intended | timed 6:00 PM → Chicago day **2027-03-09** |
| helper class (production) | **date-only** (wrong) |
| day key if raw extracted were on metadata | **`2027-03-09`** (timed branch) |
| Correct in production path? | **no** |

### 3. Real timed @ T00:00Z — Big 12 Session 4 (6:00 PM local)

| | |
| --- | --- |
| content id | `e0949f9c-75d1-4881-8ab0-e0c7a31b05f7` |
| title | Big 12 Mens Basketball Tournament - Session 4 Tickets \| 03/10/2027 06:00PM \| T-Mobile Center… |
| source | [Benson] T-Mobile Center Concerts |
| persisted `eventStartsAt` | `2027-03-11T00:00:00.000Z` |
| raw `extracted.eventDate` | `2027-03-10T18:00:00` |
| raw `extracted.startTime` | **`18:00:00`** |
| after normalize | no extracted / rawPayload on metadata |
| production day key | **`2027-03-11`** |
| Chicago day of instant | **`2027-03-10`** |
| intended | timed → **2027-03-10** |
| helper class (production) | **date-only** (wrong) |
| with raw on metadata | **`2027-03-10`** |
| Correct in production path? | **no** |

### 4. Corroborating timed @ T00:00Z — Come From Away (Family Shows)

| | |
| --- | --- |
| content id | `a132e46e-3d4d-46ea-a2ef-fa0ff82862c0` |
| title | Come From Away |
| source | Family Friendly Shows in Kansas City, MO |
| persisted `eventStartsAt` | `2026-09-02T00:00:00.000Z` |
| raw `extracted.eventDate` | `2026-09-01T19:00:00` |
| raw `extracted.startTime` | **`19:00:00`** |
| production day key | **`2026-09-02`** (wrong date-only) |
| Chicago / intended | **`2026-09-01`** |
| with raw on metadata | **`2026-09-01`** |
| Correct in production path? | **no** |

### 5. Ordinary timed non-midnight control — Inspiring Women

| | |
| --- | --- |
| content id | `1695ee52-8ca5-4cc3-8ec2-417d77fcbbf6` |
| title | Inspiring Women in Public Administration Conference 2026 \| … |
| source | Events Archive - Overland Park Convention Center |
| persisted `eventStartsAt` | `2026-08-21T08:00:00.000Z` (not midnight) |
| raw `extracted.startTime` | `03:00:00` (also absent from metadata after load) |
| production day key | **`2026-08-21`** |
| Chicago day of instant | **`2026-08-21`** |
| helper class | **timed** via non-midnight instant (step 4), not via startTime |
| Correct? | **yes** for day key; startTime still lost, but `isDateOnlyTimestamp` is false so no date-only misfire |

---

## True date-only vs real timed T00Z comparison

| | Woman of Influence (A) | Big 12 Session 2/4 (B) |
| --- | --- | --- |
| Stored instant | `T00:00:00Z` | `T00:00:00Z` |
| Raw `startTime` | `null` | `18:00:00` |
| Evidence on production InventoryItem | neither extracted nor startTime | neither extracted nor startTime |
| `isDateOnlyTimestamp` | true | true |
| Production `inventoryTemporalDayKey` | UTC YMD (correct for A) | UTC YMD (**incorrect for B**) |
| If raw extracted were available to helper | same UTC YMD | Chicago local day (correct) |

**Critical answer:** For a real timed event at `T00:00Z`, production-shaped `InventoryItem` does **not** retain enough evidence for `inventoryTemporalDayKey` to choose the timed Chicago branch.

---

## Exact information-loss point

1. **Primary (Calendar path):** `inventoryLoadContentItemSelect` never fetches `raw_payload`, where `extracted.startTime` / date-only `eventDate` live for these listing rows.  
2. **Secondary (ingest shape):** `content_items.metadata` for the sample does not already contain `extracted` temporal fields, and `normalizeInventoryItem` does not promote them from raw.

The helper’s preference order is sound **when evidence is present**. The production load path strips that evidence before the helper runs.

---

## Recommended smallest fix (do **not** implement in this audit)

Prefer carrying an **existing** explicit timed/date-only signal through inventory normalization (not venue/source special cases, not title inference, not a second temporal system):

**Smallest durable option:** During `normalizeInventoryItem` (or a thin Calendar-load enrichment), if `metadata.extracted` lacks temporal fields, promote a **minimal** slice from raw only when available:

- `eventDate`, `eventEndDate`, `startTime` (strings as already extracted)

Alternatively (load-only): extend the Calendar inventory select with a narrow SQL projection of `raw_payload->'extracted'` into a metadata-compatible shape without pulling the full raw blob.

Either way, `inventoryTemporalDayKey` already knows how to use that evidence; the gap is retention, not a new classifier.

---

## Confirmations

| | |
| --- | --- |
| Code changed | **no** |
| Data changed | **no** |
| Projection / re-ingest | **not run** |
| `stale_freshness` investigated | **no** (explicitly out of scope) |

---

## Out of scope (observed, not expanded)

1. Why many T-Mobile “date-only looking” concerts store bare `YYYY-MM-DD` with `startTime: null` while title shows a calendar day without clock — separate extraction quality.  
2. Odd early-morning OPCC clocks (Inspiring Women `03:00:00`) — clock quality, not this ambiguity.  
3. Whether promoting extracted into `metadata` at ingest time would help Discover/Today paths — not audited here.  
4. Frontend all-day display / past filter — already separate; not re-audited.
