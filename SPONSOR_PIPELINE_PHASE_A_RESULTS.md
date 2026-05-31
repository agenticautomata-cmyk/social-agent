# Sponsor Pipeline Phase A — Results

**Date:** 2026-05-31  
**Status:** Complete  
**Scope:** Sponsor deal pipeline CRM, dashboard reporting, intelligence + planner links — no outreach logic changes

---

## Summary

Sponsor Pipeline Phase A tracks sponsor deals from first contact through **Won** or **Lost**. Each sponsor contact can have multiple pipeline opportunities with estimated/actual value, status, notes, and optional **content planner list** linkage. Reporting is isolated from outreach send/approval logic.

---

## What Was Built

### Database

**Migration:** `db/migrations/30_sponsor_pipeline.sql`  
**Script:** `pnpm migrate:sponsor-pipeline`

| Table | Purpose |
|---|---|
| `sponsor_opportunities` | Deal records linked to `sponsor_contacts` |

**Status enum:** `lead` · `contacted` · `interested` · `meeting_scheduled` · `proposal_sent` · `negotiating` · `won` · `lost`

| Field | Notes |
|---|---|
| `title` | Deal name (e.g. "Country Club Plaza Summer Campaign") |
| `estimated_value` / `actual_value` | Pipeline and closed revenue |
| `lead_source` | e.g. `sponsor_intelligence`, `crm`, `manual` |
| `planner_list_name` | Links to content planner shortlist list name |
| `closed_at` | Set when status → won or lost |

### Core module

`services/core/src/sponsor-pipeline/`

- CRUD + `markOpportunityWon` / `markOpportunityLost`
- `getSponsorPipelineSummary` per sponsor
- `computePipelineDashboard` — KPIs + by-status board
- `computePipelineReporting` — lead source, category, revenue
- `createOpportunityFromIntelligence`

**Export:** `@social-agent/core/sponsor-pipeline`

### API (`ENABLE_OPPORTUNITIES_API=true`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/pipeline` | Dashboard KPIs + opportunities |
| `GET` | `/api/pipeline/reporting` | Lead source / category reports |
| `GET` | `/api/pipeline/opportunities` | List (filter by sponsor, openOnly) |
| `POST` | `/api/pipeline/opportunities` | Create deal |
| `PUT` | `/api/pipeline/opportunities/:id` | Update deal |
| `POST` | `/api/pipeline/opportunities/:id/won` | Mark won |
| `POST` | `/api/pipeline/opportunities/:id/lost` | Mark lost |
| `POST` | `/api/pipeline/from-intelligence/:contentItemId` | Create from intelligence |

**Sponsor detail:** `GET /api/sponsors/:id` includes `pipeline` summary.

**Sponsor intelligence:**

- `POST …/create-pipeline-opportunity`
- `PUT …/pipeline-opportunity/:id`
- `POST …/pipeline-opportunity/:id/won|lost`
- `GET …/pipeline-opportunities`

### Dashboard

| Route | Purpose |
|---|---|
| `/pipeline` | KPIs, status board, reporting tables, open deals |
| `/sponsors/[id]` | Open pipeline value, closed value, per-deal actions |

Nav: **pipeline** after **sponsors**.

### Sponsor intelligence actions

- Create Opportunity
- Update Opportunity (status + planner list)
- Mark Won / Mark Lost
- (Existing: create lead, draft outreach, planner, dismiss)

### Planner integration

`planner_list_name` on each opportunity — aligns deals with content planner shortlist names (e.g. `shopping` for a shopping content plan). Does not auto-create `planner_items`; Kellie links by list name for campaign alignment.

### Safety

- No imports from sponsor-pipeline in outreach send module
- Financial fields used for **reporting and CRM display only**
- Outreach approval/send flow unchanged

---

## Dashboard metrics

| Metric | Calculation |
|---|---|
| Total pipeline value | Sum `estimated_value` for open statuses |
| Won this month | Count + sum `actual_value` (fallback `estimated`) for `won` closed this calendar month |
| Lost this month | Count of `lost` closed this month |
| Conversion rate | `won / (won + lost)` all time |
| Average deal size | Mean closed value for all `won` deals |

---

## Verification

| Check | Result |
|---|---|
| `pnpm -r typecheck` | ✅ Passes |
| `pnpm migrate:sponsor-pipeline` | ✅ Applied |
| `/pipeline` loads | ✅ HTTP 200 |
| Opportunity creation | ✅ POST returns deal with planner link |
| Sponsor linking | ✅ `GET /api/sponsors/:id` includes pipeline summary |
| Won tracking | ✅ Status `won`, `closed_at` set |
| Revenue totals | ✅ Open $5,000 → won $4,500 → closed value $4,500, open $0 |

### Sample commands

```bash
pnpm migrate:sponsor-pipeline

curl -s http://localhost:4000/api/pipeline | jq '.totalPipelineValue, .wonThisMonth, .conversionRate'

curl -s -X POST http://localhost:4000/api/pipeline/opportunities \
  -H 'Content-Type: application/json' \
  -d '{"sponsorContactId":"<uuid>","title":"Plaza Summer Campaign","estimatedValue":5000,"plannerListName":"shopping"}'

curl -s -X POST http://localhost:4000/api/pipeline/opportunities/<id>/won \
  -d '{"actualValue":4500}'
```

---

## Not in scope (Phase A)

- Kanban drag-and-drop
- Auto-sync planner_items rows from pipeline
- Outreach triggers on stage change
- Forecast weighting / probability by stage

---

## Next steps (Phase B)

- Pipeline board drag-and-drop status updates
- Stage-change activity log
- Optional webhook when deal → won (notify Benson content planning)
