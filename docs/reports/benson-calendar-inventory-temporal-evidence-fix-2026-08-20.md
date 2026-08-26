# Calendar inventory temporal evidence retention fix

Date: 2026-08-20  
Scope: Load-time retention of thin `raw_payload.extracted` temporal fields for Calendar population only  
Prior audit: [benson-calendar-server-midnight-timed-evidence-audit-2026-08-20.md](./benson-calendar-server-midnight-timed-evidence-audit-2026-08-20.md)

**Data changed: no. Projection / re-ingest: not run. `stale_freshness`: not changed. Full `raw_payload` not loaded into `InventoryItem`.**

---

## Proven root cause

`inventoryTemporalDayKey` is correct when explicit extracted evidence is present. Production Calendar population used `inventoryLoadContentItemSelect`, which **omits `raw_payload`**. Listing-scrape rows store:

- `raw_payload.extracted.eventDate`
- `raw_payload.extracted.eventEndDate`
- `raw_payload.extracted.startTime`

…and typically **do not** copy those into `metadata.extracted`.

After normalize, timed events at exactly `T00:00:00.000Z` lost `startTime`, hit `isDateOnlyTimestamp`, and were classified as date-only (wrong UTC day). Example: Big 12 Session 2 → day key `2027-03-10` instead of Chicago `2027-03-09`.

---

## Callers inspected before changing shared load code

| Caller of `inventoryLoadContentItemSelect` | Role |
| --- | --- |
| `creator-calendar/population/sync.ts` | Calendar population (**this fix**) |
| `creator-calendar/weekend-list.ts` | Weekend list inventory hydrate |
| `inventory/load-ingested.ts` | General inventory load |
| `source-ingestion/source-items.ts` | Source item listing |
| `scripts/normalization-hotspot-audit.ts` | Audit script |
| `scripts/inventory-normalization-peak-audit.ts` | Audit script |
| `scripts/inventory-warm-process-audit.ts` | Audit script |
| `inventory/load-ingested-projection.test.ts` | Projection contract tests |

| Caller of `normalizeInventoryItem` (no select) | Role |
| --- | --- |
| API inventory routes, sponsor-outreach, content-planner, smoke/verify scripts, etc. | Various |

**Decision:** Do **not** add fields to shared `inventoryLoadContentItemSelect` (would affect many inventory consumers). Use a **Calendar-only** thin SQL projection of three jsonb text paths.

---

## Exact implementation choice

**Choice:** Calendar-specific SELECT of only:

```sql
raw_payload -> 'extracted' ->> 'eventDate'
raw_payload -> 'extracted' ->> 'eventEndDate'
raw_payload -> 'extracted' ->> 'startTime'
```

Mapped at load time into `InventoryItem.temporalEvidence` via `normalizeInventoryItem(..., { temporalEvidence })`.

**Why narrower than loading full `raw_payload`:** Only three scalar text extractions fields are needed for `inventoryTemporalDayKey`. The full scrape payload (body, HTML remnants, etc.) stays out of the InventoryItem and out of the Calendar candidate path.

`inventoryTemporalDayKey` semantics unchanged aside from reading `item.temporalEvidence` before `metadata.extracted` / `metadata.rawPayload`.

---

## Exact fields newly retained

Load-time only on `InventoryItem` (not written back to `content_items`):

```ts
temporalEvidence: {
  eventDate: string | null;
  eventEndDate: string | null;
  startTime: string | null;
}
```

---

## Files changed

| File | Change |
| --- | --- |
| `services/core/src/creator-calendar/population/inventory-temporal-evidence.ts` | Thin Calendar SELECT + row → evidence mapper |
| `services/core/src/creator-calendar/population/sync.ts` | Use thin SELECT; pass evidence into normalize |
| `services/core/src/inventory/normalize.ts` | `InventoryTemporalEvidence` + optional normalize options |
| `services/core/src/creator-calendar/population/eligibility.ts` | Prefer `temporalEvidence` in extracted-field lookup |
| `services/core/src/creator-calendar/population/inventory-temporal-evidence.test.ts` | Production-shaped regressions |
| `docs/reports/benson-calendar-inventory-temporal-evidence-fix-2026-08-20.md` | This report |

**Not changed:** `inventoryLoadContentItemSelect`, `temporal-state.ts`, `candidateFromInventory`, frontend, ingestion, freshness, Today/Discover/ranking.

---

## Tests run

```bash
cd services/core && node --import tsx --test \
  src/creator-calendar/population/eligibility.test.ts \
  src/creator-calendar/population/inventory-temporal-evidence.test.ts
```

| | |
| --- | --- |
| Result | **49 pass / 0 fail** |
| Suites | 5 (existing eligibility + new temporal-evidence suite) |

Production-shaped suite proves select/normalize-compatible input (no `metadata.extracted`, no full raw blob):

1. Woman of Influence → `2026-08-28`
2. Big 12 Session 2 → `2027-03-09`
3. Big 12 Session 4 → `2027-03-10`
4. Come From Away → `2026-09-01`
5. Ordinary non-midnight timed → unchanged `2026-08-21`
6. Date-only start/end pair → encoded dates both sides
7. Missing evidence → UTC-midnight fallback
8. Full `raw_payload` not on InventoryItem

---

## Bounded live before/after (read-only)

Actual production-shaped Calendar query (`inventoryLoadContentItemSelect` + `calendarInventoryExtractedTemporalSelect` → normalize → `inventoryTemporalDayKey`). No writes.

| Row | Retained evidence | Day key after | Intended | Correct |
| --- | --- | --- | --- | --- |
| Woman of Influence | `eventDate=2026-08-28`, `startTime=null` | **2026-08-28** | Aug 28 | **yes** |
| Big 12 Session 2 | `startTime=18:00:00` | **2027-03-09** | Mar 9 | **yes** (was Mar 10 without evidence) |
| Big 12 Session 4 | `startTime=18:00:00` | **2027-03-10** | Mar 10 | **yes** (was Mar 11) |
| Come From Away | `startTime=19:00:00` | **2026-09-01** | Sep 1 | **yes** (was Sep 2) |
| Inspiring Women | non-midnight + `startTime=03:00:00` | **2026-08-21** | Aug 21 | **yes** (unchanged) |

---

## Confirmations

| Check | Status |
| --- | --- |
| Full `raw_payload` loaded into `InventoryItem` | **no** |
| `stale_freshness` changed | **no** |
| Data mutated | **no** |
| Projection / re-ingest run | **not run** |
| Shared `inventoryLoadContentItemSelect` expanded | **no** (Calendar-only aliases) |

---

## Out of scope (newly observed)

1. **Weekend List** still uses shared inventory select without thin temporal evidence — same T00Z ambiguity may remain there until similarly wired.  
2. **Come From Away** raw `eventEndDate` string `2026-09-01` vs start evidence — end-date quality not audited beyond carrying the field.  
3. **`stale_freshness`** still not investigated.  
4. Ingest still does not persist `metadata.extracted` temporal fields; this fix is load-time only by design.
