# Benson Employment Intent Hardening — Residual Closeout

**Date:** 2026-08-10 (impl) / verified 2026-08-11T05:27Z–05:29Z  
**Mode:** Residual fix after Batch 2 Home eligibility + Batch 3 freshness  
**Fixture:** `ff3c79b5-77e2-4aff-9991-d7874ec5e9c5` — “Open Interviews for Multiple Positions”  
**Not started:** Batch 4+  
**Preserved:** Workspace/M85, researchRunId fencing, Batch 1 evidence orchestration, Batch 2/3 gates, email actionability, discovery skip, partnership lifecycle, Gmail soft-status  

---

## Verdict

**EMPLOYMENT INTENT HARDENING VERIFIED**

---

## Problem

Batch 3 post-deploy found Home `dailyBriefing.topEvents` still included Style Encore **Open Interviews for Multiple Positions**:

| Field | Value |
|-------|-------|
| Category | `luxury_resale` (wrong) |
| Producer | `discount_watch` scrape |
| `sourceUrl` | Google Maps (not `/jobs`) |
| Body | Hiring copy + embedded `/jobs` URLs |
| Old detector | Missed — title lacked classic “job opportunities” / path patterns; summary not consulted |

This was outside the Batch 2 “Job Opportunities” fixture gate (`isEmployment=false` under the old detector).

---

## Implementation (pre-deploy)

| Change | Path |
|--------|------|
| Hardened detector | `services/core/src/creator-agent/employment-intent.ts` |
| Tests (hiring vs creator-interview / false positives) | `services/core/src/creator-agent/employment-intent.test.ts` |
| Reconcile passes `script` as summary | `services/core/src/scripts/reconcile-employment-home-eligibility.ts` |
| Score-promote cannot re-lift hiring titles / body `/jobs` / “currently hiring” | `db/migrations/68_creator_agent_corrective.sql`, `db/init/68_creator_agent_corrective.sql` |

Detector rules (summary):

- Title patterns: `open interviews`, `multiple positions`, walk-in interviews, hiring-event forms
- Summary/body: stronger hiring-event language only (avoids incidental “employment opportunities” prose)
- Allow designer/creator/media interview language to pass
- `luxury_resale` + Maps URL no longer shields hiring-event titles/bodies

---

## Deploy (careful / host-constrained)

Host was memory-thrashing (8GB, Cursor + bloated API + workers). Full `benson:deploy-local` was **not** used end-to-end.

| Step | Result |
|------|--------|
| Workers | Left **stopped** (fingerprint stamped only) |
| Voicebox / n8n | Remained stopped from prior stabilization |
| API | Restarted after OOM balloon (~3GB → ~300MB) |
| Dashboard | Force production rebuild once (`BUILD_ID=fZ4HYAOQvzLh_FyMnd98b`) |
| Extra fix during verify | Gmail status refresh soft-fails on network timeout so Home does not 500 (`connections.ts`) |

### Deployed fingerprint

| Field | Value |
|-------|-------|
| Status | **MATCH** |
| source / api / dashboard / worker | `7eab4dcf40b52da5` |
| apiStartedAt | `2026-08-11T05:27:34.883Z` |
| dashboardBuiltAt | `2026-08-11T05:17:49Z` |
| checkedAt | `2026-08-11T05:27:45.909Z` |

### Runtime health

| Check | Result |
|-------|--------|
| API `/health` | 200 |
| Dashboard `/` and `/home` | 200 |
| `/api/pre-alpha/home` | 200 (~67s; host still constrained) |
| Workers process | **Off** (intentional) |
| Fingerprints | MATCH |
| Migration applied this deploy | **None** (SQL harden is for future promote path / init) |

---

## Verification

### Unit tests

`pnpm exec tsx --test src/creator-agent/employment-intent.test.ts`

- **11/11 pass** including Open Interviews fixture Home-ineligible + creator-facing clamp

### Live DB fixture

```
ff3c79b5-77e2-4aff-9991-d7874ec5e9c5
topic: Open Interviews for Multiple Positions
creator_value_status: hidden_raw_signal
lifecycle_status: upcoming
category: luxury_resale
provenance employment_home_ineligible: true
```

Earlier read-only gate check (same row):

| Gate | Result |
|------|--------|
| `isEmploymentOpportunity` | `true` |
| `canPromoteToCreatorFacing` | `false` |
| clamp → | `hidden_raw_signal` |
| `evaluateHomeEligibility` | `eligible: false` / `employment_jobs_careers` |

### Home payload (`GET /api/pre-alpha/home`)

| Check | Result |
|-------|--------|
| HTTP | 200 |
| `systemOk` | true |
| “Open Interviews” in payload | **absent** |
| Fixture id in payload | **absent** |
| Hiring-title leaks in `topEvents` | **none** |
| Legitimate events still present | yes (Unforked, Skynyrd, Legends Live, Kids/Water/Fish, Rails/Rides) |

### False-positive safety (test suite)

Farmhouse / Reddit “job seekers” prose / New World grand opening remain non-employment in unit tests. No additional live demotion sweep was run during this closeout.

---

## Notes / residual ops

1. **Workers off** — restart when host has headroom (`benson_start_workers` or full deploy). Fingerprint file already MATCH; restart will keep parity if source unchanged.
2. **Home latency ~50–70s** on this box — environmental (RAM/CPU), not employment-gate logic.
3. **Gmail soft-fail** — unblocks Home when `oauth2.googleapis.com` times out; does not change OAuth credentials or reconnect flow.
4. **Do not start Batch 4** from this residual.

---

## Files touched (this residual)

- `services/core/src/creator-agent/employment-intent.ts`
- `services/core/src/creator-agent/employment-intent.test.ts`
- `services/core/src/scripts/reconcile-employment-home-eligibility.ts`
- `db/migrations/68_creator_agent_corrective.sql`
- `db/init/68_creator_agent_corrective.sql`
- `services/core/src/gmail-oauth/connections.ts` (verify unblock: soft-fail status refresh)
- `docs/reports/benson-employment-intent-hardening-2026-08-10.md` (this report)

---

**EMPLOYMENT INTENT HARDENING VERIFIED**
