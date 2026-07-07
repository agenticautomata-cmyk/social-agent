# Phase C: Operational Workflow Wiring — results

Completed: 2026-06-01

## Goal

Connect **415 live ingested `content_items`** into a complete daily workflow on Benson home, daily briefing, refresh automation, pipeline, opportunity actions, and dashboard metrics — without new sources, scoring changes, UI redesign, or mock data.

---

## 1. Benson Home (`/`)

**API:** `GET /api/pre-alpha/home` (extended with `computeOperationalHomeData`)

| Section | Data source |
|---------|-------------|
| Today's top opportunities | Command center priority merge (post today + confidence + trending) |
| Top sponsor candidates | `computeTopSponsorCandidates` (limit 5) |
| Source health summary | `listSourceRegistry` — 57 total, 56 healthy, 1 unhealthy |
| New items since last refresh | `first_seen_at` after last live refresh batch |
| Dashboard metrics | sources, healthy sources, content items, sponsor candidates, active pipeline deals |

**Verified metrics:**

```json
{
  "totalSources": 57,
  "healthySources": 56,
  "contentItems": 415,
  "sponsorCandidates": 193,
  "activePipelineDeals": 0
}
```

**Refresh summary on home:**

- Last refresh: 2026-06-01 (live batch)
- Items discovered (last batch): 423
- Healthy sources (last batch): 56
- Failed sources (last batch): 1 (Share Intake — manual)

---

## 2. Daily Briefing

**Home** embeds morning briefing lanes (same ingested inventory as `/editor`):

| Lane | Content |
|------|---------|
| Highest priority | Top 5 from postToday + highestConfidence + trending |
| Top events | Events in next 21 days, audience-weighted |
| Top sponsor opportunities | Top 5 sponsor recommendations |
| Top business openings | `businessOpening` / opening categories |

**Full briefing:** `/editor` (unchanged route) — sections + Benson priorities + `OpportunityActionBar` on every card.

---

## 3. Refresh Automation

**Home panel:**

- **One-click** `POST /api/sources/refresh-all` — “refresh all sources” button
- Displays: last refresh time, items discovered, healthy/failed counts, new items since refresh
- Link to `/sources` for operator detail

**Core:** `getLastLiveRefreshSummary()` aggregates the latest live ingestion batch (`services/core/src/source-ingestion/last-refresh.ts`).

---

## 4. Pipeline Integration

Existing pipeline (`/pipeline`) uses DB statuses mapped to Kellie workflow labels in the UI:

| Workflow label | DB status |
|----------------|-----------|
| New | `lead` |
| Contacted | `contacted` |
| Interested | `interested` |
| Negotiating | `negotiating` |
| Closed | `won` |
| Rejected | `lost` |

(Also: Meeting Scheduled, Proposal Sent — unchanged.)

**From sponsor/home cards:**

- Create sponsor lead → `POST .../lead`
- Add to pipeline → `POST .../create-pipeline-opportunity`
- Update stage via sponsor intelligence actions + `/pipeline`

No schema migration; display-only workflow aliases in `WORKFLOW_PIPELINE_LABELS`.

---

## 5. Opportunity Actions

**`OpportunityActionBar`** (`dashboard/components/opportunity-action-bar.tsx`) on home briefing cards and **editor** cards:

| Action | Mechanism |
|--------|-----------|
| Save | `plan_this_week` / planner `save` |
| Plan today | planner quick action |
| Plan this week | planner quick action |
| Mark covered | planner quick action |
| Create sponsor lead | `CreateSponsorLeadButton` |
| Dismiss | `POST /api/sponsor-intelligence/.../dismiss` (not_interested) |

Sponsor intelligence cards retain full `SponsorIntelligenceActions` (lead, pipeline, draft, planner, dismiss).

---

## 6. Reporting (dashboard metrics on home)

| Metric | Value (verified) |
|--------|------------------|
| Total sources | 57 |
| Healthy sources | 56 |
| Content items (ingested) | 415 |
| Sponsor candidates (eligible) | 193 |
| Active pipeline deals | 0 |

Additional home stats: open actions, overdue, outreach mode, pipeline value.

---

## 7. Validation

| Check | Result |
|-------|--------|
| Ingested rows (non-mock) | **415** |
| Mock external ids | **0** |
| `GET /api/pre-alpha/home` | **200** with live sections populated |
| `/` | **200** |
| `/editor` | **200** |
| `/planner` | **200** |
| `/sponsor-intelligence` | **200** |
| `/pipeline` | **200** |
| `/reports/top-sponsor-candidates` | **200** |

**Demo mode:** Banner may still show (`DEMO_MODE=true` for outreach simulate). **Inventory is 100% ingested KC data** via `loadIngestedInventoryItems()` — no demo pipeline rows without `source_id`.

**`newItemsSinceRefresh: 0`** after initial bulk ingest is expected: `first_seen_at` matches the last refresh window. Subsequent refreshes will increment this when new external IDs appear.

---

## Files created

| File |
|------|
| `services/core/src/source-ingestion/last-refresh.ts` |
| `services/core/src/pre-alpha/operational-home.ts` |
| `dashboard/components/opportunity-action-bar.tsx` |
| `PHASE_C_RESULTS.md` |

## Files changed

| File | Change |
|------|--------|
| `services/core/src/pre-alpha/home.ts` | Merge operational home data into response |
| `services/core/src/pre-alpha/index.ts` | Export operational-home |
| `services/core/src/source-ingestion/index.ts` | Export last-refresh |
| `dashboard/lib/pre-alpha-types.ts` | Extended home types |
| `dashboard/lib/sponsor-pipeline-types.ts` | Workflow pipeline labels |
| `dashboard/app/home-dashboard-panel.tsx` | Full operational home UI + refresh |
| `dashboard/app/editor/command-center-panel.tsx` | OpportunityActionBar with dismiss |

---

## Daily workflow for Kellie

1. **`/`** — Metrics, refresh all sources, morning briefing lanes, quick actions on top picks.
2. **`/editor`** — Full daily briefing with save / plan / dismiss / sponsor lead.
3. **`/sponsor-intelligence`** + **`/pipeline`** — Move candidates through workflow stages.
4. **`/sources`** — Deep refresh and per-source health.

---

## Out of scope (per instructions)

- No new ingestion sources
- No scoring algorithm changes
- No UI redesign (same components and layout patterns)
- No mock seed content added
