# Benson Home Eligibility — Batch 2 Post-Deploy

**Date:** 2026-08-10  
**Mode:** Deploy + verify only (Batch 2)  
**Authoritative impl report:** `docs/reports/benson-home-eligibility-batch2-2026-08-10.md`  
**Scope:** Batch 2 only — no Batch 3+ implementation, no Home redesign, no blind reconciliation re-run  

---

## Deployed fingerprint

| Field | Value |
|-------|-------|
| Status | **MATCH** |
| sourceFingerprint | `8814cf7ca44be165` |
| apiFingerprint | `8814cf7ca44be165` |
| dashboardFingerprint | `8814cf7ca44be165` |
| workerFingerprint | `8814cf7ca44be165` |
| apiStartedAt | `2026-08-10T20:38:59.709Z` |
| workerStartedAt | `2026-08-10T20:39:10.604Z` |
| dashboardBuiltAt | `2026-08-10T20:49:50Z` |
| dashboard BUILD_ID | `vhvdCnwhoeFt4UfQjsNaF` |
| checkedAt | `2026-08-10T20:57:44.341Z` |

### Runtime health

| Check | Result |
|-------|--------|
| API `/health` | OK (`benson-api`, development) |
| Dashboard `/home` | HTTP 200 |
| Workers | Benson worker process running |
| Fingerprints | MATCH |
| Batch 2 migration | **None applied** (`to_regclass('public.home_eligibility')` = null) |
| M85 preserved | `benson_conversations` present |

---

## Resolved DB

| Source | DATABASE_URL |
|--------|----------------|
| Running API (`services/api` pid) | `postgres://social_agent@localhost:5433/social_agent` |
| Running workers | `postgres://social_agent@localhost:5433/social_agent` |
| Batch 2 impl reconciliation target | `localhost:5433/social_agent` |

**Same live DB as the Batch 2 impl report.** Reconciliation was **not** re-run.

---

## Reconciliation inspection result

Provenance tag: `reconcile:employment_home_ineligible_batch2`  
Tagged rows found: **8** (none deleted)

| id | topic | status now | employment intent | tag | notes |
|----|-------|------------|-------------------|-----|-------|
| `2188d040-12de-45dc-a640-4f9b65811954` | Job Opportunities | `hidden_raw_signal` | yes | yes | Production fixture — still demoted |
| `bf62d7c2-adbc-4d8f-b4d2-28a89f57e81a` | Career Opportunities | `hidden_raw_signal` | yes | yes | Still demoted |
| `b4b391d6-c62f-4d50-b581-17e80b23bde1` | Career Opportunities with the City of Kansas City | **`creator_candidate`** | yes | yes | Re-promoted `2026-08-10T20:30:58Z` |
| `e16c6319-5c40-4b8a-aa99-01d9a8b7fdee` | Kansas City Job Opportunities | **`creator_candidate`** | yes | yes | Re-promoted `2026-08-10T20:30:58Z` |
| `c1291117-01df-4ae2-a235-e822e40c7d57` | KCMO Career Center | **`creator_candidate`** | yes | yes | Re-promoted; still in creator load pool |
| `907472c8-47ff-42f2-a784-da615621e8b8` | LOFT - Sales Associate - Zona Rosa | **`creator_candidate`** | yes (`employment` tag) | yes | Re-promoted `2026-08-10T20:30:58Z` |
| `5703b932-d367-48b4-8ac7-77fad649dfd4` | Part-time Sales Lead at Build-a-Bear | **`creator_candidate`** | yes (`employment` tag) | yes | Re-promoted `2026-08-10T20:30:58Z` |
| `079b1328-8a6d-4c37-89c9-b8d3faaedaa2` | Spencer's Sales Associate - Zona Rosa | **`creator_candidate`** | yes (`employment` tag) | yes | Re-promoted `2026-08-10T20:30:58Z` |

### Safety checklist

| Check | Result |
|-------|--------|
| All 8 genuinely employment/hiring intent | **Yes** (category/tags/title/URL) |
| Legitimate creator/sponsor opp incorrectly demoted | **No** |
| Rows deleted | **No** |
| Provenance tag present | **Yes** on all 8 |
| Durable demotion still holds | **No — 6/8 re-elevated to `creator_candidate`** |

**STOP condition hit for reconciliation durability:** demotion did not stick for 6 rows. No further data was modified. Reconciliation was not re-run.

Home eligibility gate still returns `eligible: false` / `employment_jobs_careers` for all 8 even when status was re-elevated.

---

## Exact Job Opportunities result

Fixture: `2188d040-12de-45dc-a640-4f9b65811954` / topic **Job Opportunities**

| Expectation | Result |
|-------------|--------|
| Durable record still exists | **Yes** |
| `creator_value_status` = `hidden_raw_signal` | **Yes** |
| Home eligibility false | **Yes** |
| Rejection includes `employment_jobs_careers` | **Yes** (also `raw_unqualified_intake`, `not_creator_facing_status`) |
| Not in loaded creator inventory pool | **Yes** |
| Not Top Move / Second Move / Sponsor Follow-up / other polished briefing priority cards | **Yes** (absent from live `/api/pre-alpha/home` payload) |

---

## Legitimate-card result

Live Home API (`http://127.0.0.1:3000/api/pre-alpha/home`):

- `topOpportunities[0]` = **Plato Closet Gate Check**
- Also present: Plato's Closet Canary, Plato's Closet Smoke, Style Encore Overland Park, sponsor candidates
- Job Opportunities / employment tagged ids **absent**

---

## Home UI smoke (mobile 390×844)

| Check | Result |
|-------|--------|
| No Job Opportunities card | **Pass** |
| Top Move / Second Move legitimate | **Pass** (Plato Closet Gate Check / Plato creator items) |
| No misleading `Confidence: High` | **Pass** |
| Home renders normally | **Pass** |
| No 500s | **Pass** |
| No paid research triggered | **Pass** |

---

## Batch 1 + workspace protections

| Check | Result |
|-------|--------|
| Evidence orchestration canary | **Pass** — delta `WHAT I DID` (`B1_STILL_WORKS`) |
| Workspace / researchRunId terminal tests | **Pass** (conversations-terminal + research-correlation) |
| Home eligibility unit regressions | **Pass** |

---

## Eligibility regression status (deployed runtime)

| Rule | Status |
|------|--------|
| `creator_candidate` alone insufficient | Pass (unit + gate) |
| Employment/jobs/careers excluded | Pass (fixture + all 8 tagged rows ineligible) |
| Skipped/suppressed excluded | Pass (unit) |
| Raw/unqualified intake excluded | Pass |
| Malformed entities excluded | Pass |
| Quiet-library hook does not admit rows | Pass (`quiet_library_only`) |
| Confidence score does not bypass eligibility | Pass (not an input; UI label removed) |

---

## Boundaries respected

| Boundary | Status |
|----------|--------|
| CTA | Cheap target validation only — **not** claiming full CTA correctness |
| Sponsor Follow-up business-route 404 | Remains Batch 5 (no Batch 2 regression observed) |
| Style Encore stale-event freshness | Untouched — Batch 3 |
| Batch 3+ code/data work | **Untouched** |

---

## Unexpected findings

1. **Reconciliation durability failure:** 6/8 tagged rows were rewritten back to `creator_candidate` at `2026-08-10T20:30:58.678Z` while retaining the provenance tag. Original Job Opportunities + Clothes Mentor Career Opportunities remain `hidden_raw_signal` (demoted `18:07Z`). Likely a producer/status overwrite path; not investigated or patched in this deploy pass per STOP rule.
2. **Initial `pnpm benson:deploy-local` dashboard build race:** first attempt hit `.next`/static generation failures; API/workers advanced first; dashboard recovered via rebuild/start. Final fingerprints **MATCH** `8814cf7ca44be165`.
3. Some synthetic live regression variants can inherit Employment category when naively spreading the Job fixture — unit suite covers clean cases.

---

## Confirmation Batch 3+ untouched

No freshness recompute, no Style Encore stale-event fix, no full CTA orchestration, no additional migrations, no Home redesign, no reconciliation re-run, no silent status rewrites after inspection.

---

DEPLOYMENT NOT VERIFIED — 6/8 employment reconciliation-tagged rows were re-promoted to `creator_candidate` after demotion; durable demotion did not hold (Home gate still excludes them; Job Opportunities fixture itself remains correctly demoted). No further data modified.
