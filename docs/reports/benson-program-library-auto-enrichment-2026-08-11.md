# Benson Program Library Auto-Enrichment — 2026-08-11

**Date:** 2026-08-11 (~22:05 UTC)  
**Authoritative baseline:** `docs/reports/benson-program-library-post-deploy-2026-08-11.md`  
**Scope:** Gradual saved-program enrichment worker + minimal UI status labels only

---

## Summary

Added a conservative **Program Library auto-enrichment worker** that reuses the existing `verifyProgramMissingInfo()` path, background spend gate, evidence/provenance model, and quiet-library rules. At most **one saved program per 6-hour cycle**, sequential, with **24-hour backoff** on failed/empty attempts.

---

## Scheduler / cadence

| Setting | Value |
|---------|--------|
| Worker ID | `program-library-enrichment` |
| Interval | **6 hours** (`PROGRAM_LIBRARY_ENRICHMENT_INTERVAL_MS`, default `21600000`) |
| Boot stagger | 180s initial delay |
| Per run | **Maximum 1 program** |
| Parallelism | **None** (single cron worker loop) |
| Infrastructure | Reuses existing `createCronWorker` + worker heartbeat |

---

## Selection order (saved programs only)

Eligible when `programLibraryMode = saved`, not in backoff, and not recently verified.

| Priority | Condition |
|----------|-----------|
| 1 | Needs verification + missing official program/application URL |
| 2 | Needs verification + missing commission/benefit |
| 3 | Missing affiliate network/platform |
| 4 | Missing eligibility, cookie window, or contact path |
| 5 | Fully verified but stale (>30 days since `lastVerifiedAt`) |

Freshness windows:
- Operator-supplied / needs verification: **7 days** (existing enrich guard, bypassed by selector when stale)
- Fully verified: **30 days** recheck

Activated/inactive records are **never** selected.

---

## Backoff / attempt metadata (JSONB, no migration)

Stored on partnership metadata:

- `lastEnrichmentAttemptAt`
- `lastEnrichmentResult` (`success` | `no_result` | `failed` | …)
- `nextEligibleEnrichmentAt`

On failed/empty search: **24-hour backoff**, program data unchanged. Worker restart respects backoff (no immediate re-verify).

---

## Research execution

Calls **same** `verifyProgramMissingInfo()` as `POST /api/program-library/:id/verify`.

Automated worker telemetry:

| Field | Value |
|-------|--------|
| `context` | `background` |
| `caller` | `program_library.auto_enrichment` |
| `process` | `worker` |
| `trigger` | `auto_enrichment` |
| `partnershipId` | durable program UUID |

**Not** labeled as user context. Does **not** activate, pitch, follow up, or surface on Home/Discover/Action Center.

---

## Per-run cap / spend safety

- Budget gate: `shouldSkipBackgroundLlm('web_search')` before selection/enrichment
- Gate skip → **0 search calls**, clean cycle exit, no retry loop, program not marked verified
- `verifyProgramMissingInfo()` already issues **one** web search per invocation — no broadening

---

## UI (minimal)

Human-readable secondary status on list/detail via `backgroundStatusLabel`:

- Verification queued
- Last checked Aug 11
- Check failed — retry later

No internal enum names exposed.

---

## Tests (mocks only — no paid search)

| Suite | Result |
|-------|--------|
| `program-library.test.ts` | **12/12 pass** |
| `auto-enrichment.test.ts` | **9/9 pass** |
| Home eligibility + scrape guardrails + Intl cache (regression spot-check) | **58/58 pass** combined run |

Proved:
- Max 1 program per run
- Activated excluded
- Recently verified skipped
- Failed/no-result backoff + selector advances
- Budget gate → 0 search calls
- Telemetry caller/context/process
- Enrichment stays `mode=saved`
- Operator conflict preserved
- Quiet on Home/Discover
- Worker-restart backoff respected
- 3-cycle mocked smoke (A → B → C)

---

## Deploy

**Method:** `scripts/benson-deploy-local.sh` (API + workers + dashboard rebuild)  
**Deployed fingerprint:** `af955257cb332f83`  
**Migrations:** None  

### Deployed files

**Core**
- `services/core/src/program-library/auto-enrichment.ts`
- `services/core/src/program-library/auto-enrichment.test.ts`
- `services/core/src/program-library/enrich.ts` (caller/process options)
- `services/core/src/program-library/metadata.ts`
- `services/core/src/program-library/types.ts`
- `services/core/src/program-library/list.ts`
- `services/core/src/program-library/labels.ts`
- `services/core/src/program-library/index.ts`
- `services/core/src/env.ts`
- `services/core/src/worker-heartbeat/definitions.ts`

**Workers**
- `services/workers/src/workflows/program-library-enrichment.ts`
- `services/workers/src/benson.ts`

**Dashboard**
- `dashboard/app/program-library/program-library-panel.tsx`
- `dashboard/app/program-library/[id]/program-library-detail-panel.tsx`

**Not touched:** Home memory, scrape guardrails, employment/freshness, contact authority, email actionability, discovery skip, Voicebox/n8n.

---

## Post-deploy verification

| Check | Result |
|-------|--------|
| API `/health` | **OK** |
| Dashboard `/program-library` | **200** |
| Workers | **Running** (deploy restart) |
| Deploy-time fingerprint parity | **MATCH** (`af955257cb332f83`) |
| Seed idempotent | `{ updated: 15, canonicalCount: 15, missing: [] }` |
| Saved programs in partnerships list | **0 overlap** |
| `backgroundStatusLabel` on API list | **44/44** programs expose label field |

### First live enrichment cycle (single observation)

Observed one `runProgramLibraryAutoEnrichmentCycle()` call (same path as worker):

```json
{
  "ran": false,
  "skipReason": "background_budget_gate",
  "searchCalls": 0,
  "caller": "program_library.auto_enrichment",
  "context": "background",
  "process": "worker"
}
```

| Metric | Value |
|--------|--------|
| Selected program (next candidate if gate open) | `AutoEnrich Smoke …` test artifact — priority tier 1 |
| Paid search calls | **0** |
| Paid search cost | **$0.00** (budget gate) |
| Program mode after | N/A (cycle skipped before verify) |
| Remaining eligible saved programs | **17** |

Budget gate blocking search is **expected PASS** behavior: zero paid calls, clean skip, no retry loop.

Gradual 6-hour worker cadence will continue automatically; seed programs (missing official URLs) are natural tier-1 candidates once budget allows.

---

## Verdict

| Criterion | Met? |
|-----------|------|
| Reuses existing verify path | **Yes** |
| Max 1 program / 6h | **Yes** |
| Backoff on failure | **Yes** |
| Quiet-library preserved | **Yes** |
| Tests green (58/58 spot run) | **Yes** |
| Deploy MATCH | **Yes** |
| First cycle clean budget skip | **Yes** |

**PROGRAM LIBRARY AUTO-ENRICHMENT VERIFIED**
