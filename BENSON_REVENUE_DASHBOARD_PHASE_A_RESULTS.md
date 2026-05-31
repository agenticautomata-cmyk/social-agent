# Benson Revenue Dashboard Phase A Results

**Date:** 2026-05-31  
**Scope:** Single-page creator business health view at `/revenue` — pipeline, sponsors, and closed deals only. No new sources or analytics.

---

## Summary

The revenue dashboard aggregates existing **sponsor pipeline**, **sponsor CRM**, and **outreach** data into KPIs, charts, top opportunities, Benson forecast, and revenue-at-risk alerts.

---

## `/revenue` — KPIs

| Metric | Source |
|--------|--------|
| Pipeline Value | Open deal `estimated_value` sum |
| Won This Month | Won deals with `closed_at` in current month |
| Won This Quarter | Won deals in current calendar quarter (UTC) |
| Average Deal Size | Mean of won deal values |
| Open Opportunities | Open pipeline count |
| Sponsors Contacted | CRM: `sent`/`replied`/… status or `last_contacted_at` set |
| Sponsors Replied | CRM: `replied` or `converted` |
| Meetings Scheduled | Pipeline `meeting_scheduled` count |
| Proposal Sent Count | Pipeline `proposal_sent` count |

---

## Charts

1. **Pipeline by Stage** — value bars per stage from `computePipelineDashboard`
2. **Revenue by Sponsor Category** — won revenue from `computePipelineReporting`
3. **Monthly Revenue Trend** — won deals grouped by `closed_at` month (last 12 months)

---

## Top 10 Opportunities

Open deals sorted by estimated value: sponsor, stage, estimated value, expected close (`due_date` when set).

---

## Benson Forecast

Stage-weighted expected revenue scaled to historical close rate:

- **Conservative** — 65% of expected (capped by quarterly run-rate)
- **Expected** — blend of stage weights + pipeline × conversion
- **Optimistic** — 135% of expected

Uses existing `conversionRate` from closed won/lost deals.

---

## Revenue at Risk

Open opportunities with `updated_at` older than **14 days**.

---

## Links

Quick nav to Sponsor CRM (`/sponsors`), Pipeline (`/pipeline`), Outreach (`/outreach/queue`), Planner (`/planner`).

---

## API

`GET /api/revenue` — full dashboard payload

Core: `services/core/src/revenue-dashboard/`

---

## Verification

```bash
npx pnpm --filter @social-agent/core typecheck
curl -s http://localhost:4000/api/revenue | jq '.kpis, .forecast'
```

No new scraping. No TikTok/analytics ingestion added for this phase.

---

*Phase A complete.*
