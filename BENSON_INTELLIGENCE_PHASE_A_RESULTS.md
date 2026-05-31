# Benson Intelligence Phase A Results

**Date:** 2026-05-31  
**Scope:** Unified recommendation engine across Editor, Planner, Sponsors, Outreach, Pipeline, and Analytics — no new opportunity sources or scraping.

---

## Summary

Benson Intelligence Phase A connects existing systems into one scoring and briefing layer. Every editorial card can show five Benson scores, human-readable reasons, similar-content analytics, and linked pipeline deals. Editor Home and `/benson` surface today's priorities; Planner and Sponsor detail show cross-system links.

---

## 1. Recommendation scoring

Core module: `services/core/src/benson-intelligence/`

Each content item receives:

| Score | Source |
|-------|--------|
| **Audience** | Sponsor-intelligence audience fit + TikTok category performance boost |
| **Sponsor** | Sponsor-fit heuristics (business name, flags, category) |
| **Revenue** | Revenue potential + pipeline stage boost (`proposal_sent`, `negotiating`, `won`, etc.) |
| **Trend** | Freshness (72h/168h) + engagement flags + audience signal |
| **Confidence** | Verified metadata / non-Reddit ingest confidence |

---

## 2. Revenue awareness

Pipeline opportunities link to content via:

- Sponsor contact `source_opportunity_id`
- Planner `listName` matching opportunity `planner_list_name`
- Won deals included for historical revenue context

Active stages (`proposal_sent`, `negotiating`) boost revenue score and trigger "Linked to active sponsor opportunity."

---

## 3. Editor Home

- **Today's priorities** banner (up to 4 items): pipeline follow-ups, post today, outreach approval, weekend/planner review
- Per card: **Why Benson picked this**, five score bars, similar analytics, linked deals
- API: `GET /api/editor` via `computeBensonEditorHome`

---

## 4. Planner integration

- `GET /api/content-planner` and `/week` enrich planner cards with `linkedPipelineOpportunities`
- Hub recent items and weekly columns show sponsor deal hints

---

## 5. Sponsor integration

- `GET /api/sponsors/:id` returns `plannedContent[]` (planner items tied to source opportunity or deal list names)
- Sponsor detail panel: **planned content** section

---

## 6. Analytics integration

- Category rollups from existing TikTok creator analytics (`loadVideosWithLatestMetrics`)
- Cards show avg views, engagement %, completion % where sample size ≥ 1

---

## 7. Benson briefing

Shared `computeBriefingPriorities()` powers:

- Editor Home top banner
- `/benson` executive hub priorities list

---

## 8. Dashboard `/benson`

- Page: `dashboard/app/benson/`
- API: `GET /api/benson`
- Executive sections: Content, Sponsors, Pipeline, Analytics, Outreach (metrics + highlights + deep links)
- Nav: **benson** link when `ENABLE_OPPORTUNITIES_UI=true`

---

## 9. Verification

| Check | Result |
|-------|--------|
| `@social-agent/core` typecheck | PASS |
| `@social-agent/api` typecheck | PASS |
| `dashboard` typecheck | PASS |
| New sources / scraping | None added |
| Outreach send/approval logic | Unchanged |

### Smoke (with API running, `ENABLE_OPPORTUNITIES_API=true`)

```bash
curl -s http://localhost:4000/api/editor?limit=2 | jq '.briefingPriorities, .sections.postToday.items[0].bensonScores'
curl -s http://localhost:4000/api/benson | jq '.briefingPriorities, .sections.pipeline.summary'
curl -s http://localhost:4000/api/content-planner/week | jq '.days[0].items[0].linkedPipelineOpportunities'
```

---

## Files added

- `services/core/src/benson-intelligence/*`
- `services/api/src/routes/benson.ts`
- `dashboard/app/benson/*`
- `dashboard/lib/benson-intelligence-types.ts`
- `dashboard/components/linked-pipeline-opps.tsx`

## Files updated

- `services/core/src/editor/home.ts` (via benson editor wrapper)
- `services/api/src/routes/editor.ts`, `sponsors.ts`, `server.ts`
- `services/core/src/content-planner/hub.ts`, `week.ts`
- `services/core/package.json`
- `dashboard/app/editor/command-center-panel.tsx`
- `dashboard/lib/command-center-types.ts`, `planner-types.ts`, `opportunities-ui.ts`
- Planner + sponsor detail panels

---

*Phase A complete. Benson connects existing editorial, CRM, pipeline, outreach, and analytics without expanding the scanner.*
