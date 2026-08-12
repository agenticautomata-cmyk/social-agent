# Benson Home Eligibility — Batch 2 Durability Post-Deploy

**Date:** 2026-08-10  
**Mode:** Deploy + verify durability fix only  
**Authoritative fix report:** `docs/reports/benson-home-eligibility-batch2-durability-fix-2026-08-10.md`  
**Scope:** Confirm real `migrate:pre-alpha` → Migration 68 no longer re-promotes employment / deliberate hides  

---

## Deployed fingerprint

| Field | Value |
|-------|-------|
| Status | **MATCH** |
| source / api / dashboard / worker | `2ab8f71332779080` |
| apiStartedAt (post boot) | `2026-08-10T23:34:08Z` |
| dashboardBuiltAt | `2026-08-10T23:25:25Z` |
| checkedAt | `2026-08-10T23:39:11.595Z` |

### Deploy path taken

1. `pnpm benson:deploy-local` — fingerprints MATCH; API/workers/dashboard healthy.  
   **Note:** `benson-deploy-local.sh` does **not** invoke `migrate:pre-alpha` (restart/build only).
2. To exercise the real producer: stopped API + workers, then `pnpm boot:prod` → `benson_boot_prod` → **Applying migrations…** → `pnpm migrate:pre-alpha` → **Applying 68_creator_agent_corrective.sql…** ✓.

No new schema migration required or applied for this fix (Migration 85 / `benson_conversations` unchanged; no `home_eligibility` table).

---

## Pre / post status of all 8 rows

Provenance tag: `reconcile:employment_home_ineligible_batch2`

| id | topic | pre status | post status | pre `updated_at` | post `updated_at` | re-promoted? | tag |
|----|-------|------------|-------------|------------------|-------------------|--------------|-----|
| `2188d040-…` | Job Opportunities | `hidden_raw_signal` | `hidden_raw_signal` | `18:07:39Z` | **unchanged** | No | yes |
| `bf62d7c2-…` | Career Opportunities | `hidden_raw_signal` | `hidden_raw_signal` | `18:07:39Z` | **unchanged** | No | yes |
| `b4b391d6-…` | Career Opportunities with the City of Kansas City | `hidden_raw_signal` | `hidden_raw_signal` | `23:16:22Z` | **unchanged** | No | yes |
| `e16c6319-…` | Kansas City Job Opportunities | `hidden_raw_signal` | `hidden_raw_signal` | `23:16:22Z` | **unchanged** | No | yes |
| `c1291117-…` | KCMO Career Center | `hidden_raw_signal` | `hidden_raw_signal` | `23:16:22Z` | **unchanged** | No | yes |
| `907472c8-…` | LOFT - Sales Associate - Zona Rosa | `hidden_raw_signal` | `hidden_raw_signal` | `23:16:22Z` | **unchanged** | No | yes |
| `5703b932-…` | Part-time Sales Lead at Build-a-Bear | `hidden_raw_signal` | `hidden_raw_signal` | `23:16:22Z` | **unchanged** | No | yes |
| `079b1328-…` | Spencer's Sales Associate - Zona Rosa | `hidden_raw_signal` | `hidden_raw_signal` | `23:16:22Z` | **unchanged** | No | yes |

**Summary:** all 8 remain non-creator-facing; none deleted; provenance intact; **no `updated_at` burst / re-promotion** from Migration 68 (contrast prior failure at `20:30:58Z`).

High-relevance employment rows (0.63–0.81) that previously flipped stayed demoted.

---

## Actual migrate:pre-alpha / Migration 68 execution evidence

From boot delta after `pnpm boot:prod` (`/tmp/batch2-durability/boot-migrate-delta.log`):

```
=== benson boot 2026-08-10T18:33:58-05:00 ===
Starting Postgres…
Applying migrations…
> social-agent@0.1.0 migrate:pre-alpha …
Applying 68_creator_agent_corrective.sql...
  ✓ creator agent corrective build
All pre-alpha migrations applied.
Benson stack healthy
```

### Migration 68 behavior after harden

| Check | Result |
|-------|--------|
| Employment rows excluded from promote | **Pass** (all 8 stayed `hidden_raw_signal`) |
| `category_rule:*_hidden` not re-promoted | **Pass** (`hidden_rule_but_facing = 0`; 112 such rows remain non-facing) |
| Legitimate high-relevance promotions still occur | **Pass** during migrate window — e.g. Savers thrift store (0.71), Live Match Screenings (0.99), Greenway Station Farmers Market (0.66), A Suite Deal (0.965), Crown Center Holiday Shops (0.74) |
| Deliberately hidden rows idempotent across this boot | **Pass** (employment `updated_at` unchanged) |

---

## Home results

| Check | Result |
|-------|--------|
| Job Opportunities absent from Top Move | **Pass** |
| Absent from Second Move / polished surfaces | **Pass** (employment IDs absent from `/api/pre-alpha/home`) |
| Absent from Sponsor Follow-up / priorities employment | **Pass** |
| Legitimate cards remain | **Pass** — Top: Plato Closet Gate Check / Plato's Closet Canary / Smoke |
| No misleading `Confidence: High` | **Pass** (API + mobile UI text) |
| Home HTTP | `/home` **200** |
| Mobile UI (390×844) | TOP MOVE = Plato Closet Gate Check; no Job Opportunities |

Priorities still show approval-gated pitches (“57 Benson pitches need approval”) — external send remains gated.

---

## Batch 1 regression

| Check | Result |
|-------|--------|
| Evidence orchestration canary (`askBenson` → `WHAT I DID`) | **Pass** (`B1_STILL_WORKS`) |
| Safe internal draft behavior | Present in canary (“Draft updated”) |
| External send/submit approval-gated | Intact (Home priorities → `/email/approvals`) |

---

## System health / regressions

| Check | Result |
|-------|--------|
| API healthy | OK (`benson-api`, production) |
| Dashboard healthy | `/home` 200 |
| Workers healthy | Benson worker process running |
| Fingerprints MATCH | `2ab8f71332779080` |
| Workspace / researchRunId fencing tests | **12/12 pass** (conversations-terminal + research-correlation + creator-facing eligibility) |
| Email actionability / discovery skip | Untouched; no code changes in those paths this pass |
| Paid research | Not triggered for durability checks; B1 canary used existing Ask Benson path only |
| Batch 3 / Home redesign / migration-runner redesign | **Untouched** |

---

## Unexpected findings

1. **`pnpm benson:deploy-local` does not run `migrate:pre-alpha`.** It only restarts API/workers/dashboard. The durability producer only runs when `benson_boot_prod` takes the cold-start path (API/workers unhealthy → “Applying migrations…”). Validation required an intentional stop + `pnpm boot:prod` after deploy-local. Migration-runner hygiene (replayed DML on every pre-alpha migrate) remains a later audit item; not expanded here.
2. Concurrent healthy-stack boot during deploy-local also skipped migrations (“API and workers healthy — refreshing dashboard”).

No additional replay-DML correctness failure observed beyond the already-fixed Migration 68 promote path.

---

BATCH 2 DURABILITY VERIFIED
