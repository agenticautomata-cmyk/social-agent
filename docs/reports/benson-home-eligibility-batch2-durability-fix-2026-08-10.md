# Benson Home Eligibility — Batch 2 Durability Fix

**Date:** 2026-08-10  
**Mode:** Root-cause fix only (no deploy)  
**Authoritative post-deploy report:** `docs/reports/benson-home-eligibility-batch2-post-deploy-2026-08-10.md`  
**Scope:** Reconciliation durability only — do not start Batch 3, redesign Home, or redeploy  

---

## Exact re-promotion producer

| Field | Value |
|-------|-------|
| Process | `pnpm migrate:pre-alpha` during Benson local boot / `benson:deploy-local` |
| Trigger | Deploy/boot migration chain (`scripts/benson-runtime-lib.sh` → `migrate:pre-alpha`) |
| File | `db/migrations/68_creator_agent_corrective.sql` |
| Function path | `applyMigrationFile()` in `services/core/src/scripts/migration-runner.ts` → `db.unsafe(sql)` (full file re-executed; no applied-migration skip for DML) |
| SQL | Final `UPDATE content_items SET creator_value_status = 'creator_candidate' WHERE creator_value_status = 'hidden_raw_signal' AND … relevance_score >= 0.55 …` |
| Timestamp match | Boot `2026-08-10T15:30:49-05:00` (= `20:30:49Z`) applied migration 68; 103 rows share `updated_at = 2026-08-10T20:30:58.678Z` via `content_items_updated_at` trigger |

### Why the 6 employment rows flipped (and 2 did not)

| Row | relevance | Hit old promote? |
|-----|-----------|------------------|
| Job Opportunities | 0.39 | No (stayed demoted) |
| Career Opportunities (Clothes Mentor) | 0.48 | No |
| KCMO Career Center | 0.81 | **Yes** |
| Kansas City Job Opportunities | 0.69 | **Yes** |
| Career Opportunities with the City of KC | 0.69 | **Yes** |
| LOFT / Build-a-Bear / Spencer's sales roles | 0.63 | **Yes** (employment tag) |

Pattern on the 103-row burst: **22** high-relevance → `creator_candidate`, **81** others touched to `hidden_raw_signal` (estate/library hide DML in same file). Provenance tag preserved because promote SQL does not rewrite `creator_relevance_explanation`.

---

## Root cause

1. Migration **68 is re-applied on every `migrate:pre-alpha`** (DDL is `IF NOT EXISTS`; **DML always re-runs**).
2. The score-promote UPDATE **hardcodes** `creator_candidate` for any `hidden_raw_signal` with score/urgency thresholds.
3. It **ignores**:
   - structured employment category/tags/jobs URL/title
   - Batch 2 reconciliation demotions
   - even the estate/library hide UPDATEs earlier in the same file (scored estate rows got `category_rule:…_hidden` explanations appended, then were immediately re-promoted — duplicate explanation appends up to length 72)
4. Same producer can overwrite other deliberate non-creator-facing decisions whenever score ≥ 0.55.

Home eligibility still excluded these rows (Batch 2 gate), but durable state was contradictory.

---

## Fix

### Reusable creator-facing promotion gate

New: `services/core/src/creator-agent/creator-facing-eligibility.ts`

- `evaluateCreatorFacingPromotion` / `canPromoteToCreatorFacing` / `clampCreatorFacingStatus`
- Employment intent via `isEmploymentOpportunity` (structured metadata precedence)
- Also blocks other `evaluateCategoryRules` hides
- **Reconcile provenance tag is not an eligibility input**

### Wired into relevance producer

`evaluateCreatorRelevance` clamps any proposed `creator_candidate` / `actionable` through the gate.  
`evaluateAndPersistContentItem` **preserves** `reconcile:*` explanation tags across re-evals.

### Migration 68 promote SQL hardened

`db/migrations/68_creator_agent_corrective.sql` + `db/init/68_creator_agent_corrective.sql`:

- Exclude structured employment (category / tags / jobs|careers URL / title patterns)
- Exclude rows already carrying `category_rule:.*_hidden` (stop undoing prior hides)

---

## Files changed

| Path | Change |
|------|--------|
| `services/core/src/creator-agent/creator-facing-eligibility.ts` | **New** reusable promotion gate |
| `services/core/src/creator-agent/creator-facing-eligibility.test.ts` | **New** durability regressions |
| `services/core/src/creator-agent/relevance-gate.ts` | Clamp promotions; preserve reconcile tags on persist |
| `services/core/src/creator-agent/index.ts` | Export employment + creator-facing helpers |
| `db/migrations/68_creator_agent_corrective.sql` | Harden score-promote UPDATE |
| `db/init/68_creator_agent_corrective.sql` | Same |

Untouched: Batch 1 orchestration, Workspace/fencing, email, discovery-skip, Home UI, Batch 3 freshness.

---

## Tests

```
node --import tsx --test \
  src/creator-agent/creator-facing-eligibility.test.ts \
  src/creator-agent/creator-agent.test.ts \
  src/inventory/home-eligibility.test.ts
```

**Result: 33 passed / 0 failed**

Covered:

1. Employment `hidden_raw_signal` cannot be re-promoted by score/relevance path  
2. Legitimate creator/sponsor item still can be promoted  
3. Reconciliation tag does not itself drive classification  
4. Structured employment metadata takes precedence over generic “opportunity/career” prose  
5. Repeated promotion attempts remain stable/idempotent  

---

## Data correction performed

Reconcile was necessary (6/8 were creator-facing again). Ran idempotent:

`pnpm exec tsx src/scripts/reconcile-employment-home-eligibility.ts`

- Demoted **6** employment rows → `hidden_raw_signal`
- Preserved rows, evidence, provenance tag
- No deletes
- Subsequent `--dry-run`: `employmentVisible: 0`

---

## Producer rerun result

Simulated the **fixed** migration-68 promote UPDATE against live DB (twice):

| Check | Result |
|-------|--------|
| Old promote SQL would hit of the 8 | **6** |
| After fixed promote — all 8 non-creator-facing | **Yes** |
| Second promote run still all 8 hidden | **Yes** (`PRODUCER_RERUN_PASS`) |
| Legitimate rows still promoted by same SQL | **Yes** (e.g. GOLDBAR Fashion Show Exhibition, Semi-Annual Sale, Summer Movie Nights) |
| Home still excludes Job Opportunities; Plato cards present | **Yes** |
| Paid research | Not triggered |

---

## Deployment readiness

- Root cause identified and fixed in the exact re-running producer  
- Live data corrected; producer simulation green  
- Unit regressions green  
- **No deploy in this pass** (per instructions)

**READY FOR DEPLOY REVIEW**
