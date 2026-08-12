# Benson Home Eligibility — Batch 2

**Date:** 2026-08-10  
**Mode:** Implementation only (no deploy)  
**Authoritative audit:** `docs/reports/benson-decision-quality-audit-2026-08-10.md`  
**Scope:** Batch 2 only — Home eligibility / polished-goods gate  
**Preserved:** Batch 1 evidence orchestration, Workspace/M85, researchRunId fencing, email actionability, discovery skip, partnership lifecycle  

---

## Exact Job Opportunities producer path

Production fixture:

| Field | Value |
|-------|-------|
| id | `2188d040-12de-45dc-a640-4f9b65811954` |
| topic | Job Opportunities |
| opportunityCategory | **Employment** |
| creator_value_status | `creator_candidate` (pre-reconcile) |
| lifecycle_status | `active` |
| ingest | **`ask_benson_link`** |
| source_url | `https://style-encore.com/locations/overland-park-ks/jobs?...` |
| sources.name | **Share Intake** (Ask Benson link path persists onto the Share Intake source row) |

**Why Home accepted it (before Batch 2):**

1. Ask Benson link intake (`collect-from-link.ts`) **hardcodes** `creatorValueStatus: 'creator_candidate'` + `lifecycleStatus: 'active'`.
2. Extract/LLM set structured `metadata.opportunityCategory = "Employment"`.
3. `loadIngestedInventoryItems` includes all `creator_candidate|actionable|top_pick` rows.
4. No employment/intent eligibility gate existed before ranking.
5. Same-day Ask Benson rows get **+45** `discoveredToday` boost → `mergePriorityCards` promoted it to Top Move.
6. UI showed `Source: Share Intake` (join on `sources.name`) and `Confidence: High` (metadata-completeness heuristic ≥ 75 — not usefulness).

**Not** a Share Intake promote default (that path leaves `hidden_raw_signal`). The Share Intake label is the **source row name** used by Ask Benson link persistence.

---

## Eligibility contract

```
candidate pool
  → Home eligibility gate (isHomeEligible)
  → skip/planner excludeIds
  → section ranking (computeCommandCenter)
  → mergePriorityCards → Top / Second Move
```

`evaluateHomeEligibility(item)` rejects when any of:

| Reason | Rule |
|--------|------|
| `employment_jobs_careers` | Structured category / tags / jobs|careers URL path / strong title patterns (`isEmploymentOpportunity`) — not bare “career”/“opportunity” prose |
| `raw_unqualified_intake` | `hidden_raw_signal` / researching / rejected; unconfirmed share_intake candidate |
| `malformed_entity` | Empty/junk title or no durable identity signals |
| `incompatible_category_rule` | Existing estate/library/liquor/article hide rules |
| `quiet_library_only` | `programLibraryQuiet` / library quiet metadata when present |
| `ticket_resale_junk` | Generic ticket-reseller shells |
| `not_creator_facing_status` | Status outside creator_candidate/actionable/top_pick |
| `lifecycle_not_current` | `expired` / `archived` only (Batch 3 owns full freshness) |
| `invalid_cta_target` | No http(s) sourceUrl, businessName, maps id, or eventDate |
| `generic_low_signal` | `creator_candidate` alone without creator/sponsor/content relevance |

**Confidence is not an eligibility input.** Home Morning Briefing no longer renders “Confidence: High”.

---

## Files changed

| Path | Change |
|------|--------|
| `services/core/src/creator-agent/employment-intent.ts` | **New** structured employment detector |
| `services/core/src/inventory/home-eligibility.ts` | **New** Home eligibility authority |
| `services/core/src/inventory/home-eligibility.test.ts` | **New** regression fixtures |
| `services/core/src/inventory/command-center.ts` | Eligibility filter before section ranking; confidence section copy |
| `services/core/src/pre-alpha/operational-home.ts` | Gate Top/Second merge inputs, events, openings, Ask Benson today, sponsor follow-up |
| `services/core/src/creator-agent/exclusion-rules.ts` | Employment hide rule wired into category rules |
| `services/core/src/inventory/index.ts` | Exports |
| `dashboard/components/home-morning-briefing.tsx` | Hide misleading Confidence label |
| `services/core/src/scripts/reconcile-employment-home-eligibility.ts` | **New** demote employment visible rows → `hidden_raw_signal` |
| `services/core/package.json` | Include `home-eligibility.test.ts` in test glob |

Batch 1 orchestration untouched.

---

## Migration decision

**Migration: NO**

Code-level eligibility + status demotion reconciliation. No new columns/tables.

---

## Reconciliation performed

Ran `reconcile-employment-home-eligibility.ts` against local/prod DB `localhost:5433/social_agent`:

- Scanned visible statuses; demoted **8** employment-intent rows to `hidden_raw_signal`
- Including Job Opportunities (`2188d040-…`) and Career Opportunities
- Also retail hiring listings tagged `employment` (e.g. Zona Rosa sales associate posts)
- Records **preserved** (no delete); explanation tagged `reconcile:employment_home_ineligible_batch2`

Gate alone already excluded Job Opportunities from Home before demotion; reconciliation keeps them out of the creator-facing load pool.

---

## Tests

```
node --import tsx --test \
  src/inventory/home-eligibility.test.ts \
  src/inventory/command-center.test.ts \
  src/creator-agent/creator-agent.test.ts
```

**Result: 31 passed / 0 failed**

Covers: employment rejection, creator_candidate insufficient, eligible sponsor accepted, raw intake rejected, invalid CTA rejected, confidence independence, skip excludeIds, ranking on eligible set only.

---

## Local smoke

`computeOperationalHomeData()` against production-like local data:

| Check | Result |
|-------|--------|
| Job Opportunities eligibility | `eligible: false` / `employment_jobs_careers` |
| Appears as Top/Second Move / Ask Benson today / sponsor follow-up | **No** |
| Legitimate cards still present | **Yes** (e.g. Plato’s Closet Canary, Style Encore, hotel offers) |
| 500s | None |
| Paid research | Not triggered |

**SMOKE PASS**

---

## Known limitations deferred

| Batch | Deferred |
|-------|----------|
| **3** | Authoritative freshness/lifecycle recompute; expired events still “current” beyond the soft `expired`/`archived` check |
| **5** | Full executable CTA orchestration / sponsor href correctness beyond cheap target validity |
| — | Write-path stop-hardcoding `creator_candidate` on Ask Benson/newsletter (downstream Home gate is primary fix this batch) |
| **7** | Full program-library quiet mode (hook reads metadata if present only) |

---

## Deployment readiness

- No migration
- No deploy this pass
- Local tests + smoke green
- Reconciliation already applied on local DB (safe demotion)

**READY FOR DEPLOY REVIEW**
