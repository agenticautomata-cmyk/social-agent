# Wiring ingested data — results

Completed: 2026-06-01

## Goal

Turn **415 ingested `content_items`** into daily workflows for Kellie using existing surfaces only — no new sources, paid APIs, live email, or UI redesign.

---

## What was wired

### 1. Shared ingested inventory loader

**`loadIngestedInventoryItems()`** (`services/core/src/inventory/load-ingested.ts`)

- Requires `source_id` (real KC ingest only)
- Excludes `source_external_id LIKE 'mock_%'` and mock reddit URLs
- Used by: editor, content-planner, sponsor-intelligence, benson API routes

**Result:** Editor, planner, and sponsor intel all read the same **415** ingested rows. **0** mock rows in DB; **0** pipeline items without `source_id`.

### 2. Editor daily briefing (`/editor`)

- Already used `computeBensonEditorHome` over inventory; now fed **only ingested items**
- Briefing sections (`postToday`, `highestConfidence`, `discoveredToday`, etc.) surface live picks
- Cards show **source link**, Benson scores, planner quick actions, create sponsor lead

**Verified:** `GET /api/editor?limit=3` → `postToday` items from e.g. Chef Tasting Menus with real titles.

### 3. Planner (`/planner`)

- **`plan_this_week`** quick action → board **This Week**, Monday of current week
- **`topIngestedPicks`** on planner hub (12 week-ranked ingested items) with save / plan today / plan this week / mark covered / sponsor lead
- Shortlist and weekly plan unchanged; actions use ingested IDs

**Verified:** `GET /api/content-planner` → `topIngestedPicks: 12`.

### 4. Sponsor intelligence (`/sponsor-intelligence`)

- Ingested-only inventory
- Cards show **sponsor name**, **source item title**, **source name**, **source URL**, scores (fit, audience, revenue, confidence, priority), **why Benson recommends**
- Link to **Top 50** report

**Verified:** Sample candidate includes Visit KC URL and full score object.

### 5. Top 50 Sponsor Candidates report

- **API:** `GET /api/sponsor-intelligence/top-candidates?limit=50`
- **Page:** `/reports/top-sponsor-candidates`
- Flat ranked list by `contactFirst` score from existing sponsor intelligence rules

### 6. Zero item sources report

- **API:** `GET /api/reports/zero-item-sources`
- **Page:** `/reports/zero-item-sources`
- Lists sources with **0** stored items: name, type, last run, status, reason, last error
- Linked from `/sources`

**Verified:** **5** zero-item sources (Share Intake manual, Crossroads RSS, In KC Closings/Openings, Liquidation Sales KC).

---

## Verification summary

| Check | Result |
|-------|--------|
| Ingested rows in DB | **415** |
| Mock / non-ingested excluded | **0** mock external ids; loader filters applied |
| `GET /api/editor` | Real ingested items in sections |
| `GET /api/content-planner` | `topIngestedPicks` populated |
| `GET /api/sponsor-intelligence` | Source-linked candidates with URLs + scores |
| `GET /api/sponsor-intelligence/top-candidates?limit=50` | **200** |
| `GET /api/reports/zero-item-sources` | **200**, count **5** |
| Dashboard `/editor` | **200** |
| Dashboard `/planner` | **200** |
| Dashboard `/sponsor-intelligence` | **200** |
| Dashboard `/reports/top-sponsor-candidates` | **200** |
| Dashboard `/reports/zero-item-sources` | **200** |

### Demo mode note

`DEMO_MODE=true` still shows a **demo mode** banner on some pages (simulated outreach/analytics flags). **Data shown is live ingest**, not mock seed content. Outreach remains simulate-only; live email not enabled.

---

## Files created

| File |
|------|
| `services/core/src/inventory/load-ingested.ts` |
| `services/core/src/sponsor-intelligence/top-candidates.ts` |
| `services/core/src/source-ingestion/zero-items.ts` |
| `services/api/src/routes/reports.ts` |
| `dashboard/app/reports/top-sponsor-candidates/page.tsx` |
| `dashboard/app/reports/top-sponsor-candidates/top-sponsor-candidates-panel.tsx` |
| `dashboard/app/reports/zero-item-sources/page.tsx` |
| `dashboard/app/reports/zero-item-sources/zero-item-sources-panel.tsx` |
| `WIRING_INGESTED_DATA_RESULTS.md` |

## Files changed

| File | Change |
|------|--------|
| `services/core/src/inventory/index.ts` | Export `loadIngestedInventoryItems` |
| `services/core/src/content-planner/constants.ts` | `plan_this_week` action |
| `services/core/src/content-planner/items.ts` | Handler for `plan_this_week` |
| `services/core/src/content-planner/hub.ts` | `topIngestedPicks` on hub response |
| `services/core/src/sponsor-intelligence/index.ts` | Export top candidates |
| `services/core/src/source-ingestion/index.ts` | Export zero-items |
| `services/api/src/routes/editor.ts` | Ingested loader |
| `services/api/src/routes/content-planner.ts` | Ingested loader + `plan_this_week` |
| `services/api/src/routes/sponsor-intelligence.ts` | Ingested loader + `/top-candidates` |
| `services/api/src/routes/benson.ts` | Ingested loader |
| `services/api/src/server.ts` | Register `/api/reports` |
| `dashboard/lib/planner-types.ts` | Types for new action + picks |
| `dashboard/components/planner-quick-actions.tsx` | Plan this week button |
| `dashboard/app/planner/planner-hub-panel.tsx` | Top ingested picks section |
| `dashboard/app/editor/command-center-panel.tsx` | Source URL on cards |
| `dashboard/app/sponsor-intelligence/sponsor-intelligence-panel.tsx` | Title, source URL, report link |
| `dashboard/app/sources/sources-panel.tsx` | Link to zero-item report |
| `dashboard/lib/opportunities-ui.ts` | Nav: top sponsors, zero sources |

---

## Daily workflow for Kellie

1. **`/editor`** — morning briefing from top ingested opportunities; save or plan from each card.
2. **`/planner`** — review **top ingested picks**; plan today / this week; track shortlist.
3. **`/sponsor-intelligence`** — sponsor lanes with source-linked candidates and scores.
4. **`/reports/top-sponsor-candidates`** — full ranked top 50 for outreach prioritization.
5. **`/reports/zero-item-sources`** — operator view of feeds that need attention.

---

## Remaining / out of scope

- Share Intake remains manual (zero items until promoted via intake).
- `plan weekend` kept alongside **plan this week** (no removal).
- No new ingestion sources or paid APIs added.
