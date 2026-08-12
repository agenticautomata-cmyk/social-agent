# Benson Home Memory Stabilization — 2026-08-11

**Date:** 2026-08-11  
**Scope:** Small Home memory fix only (per `docs/reports/benson-api-memory-audit-2026-08-11.md`)  
**Out of scope:** Home redesign, workers/research, migrations, AbortSignal plumbing  
**Workers during smoke:** OFF

---

## Summary

Implemented three targeted changes: **one shared inventory snapshot** per Home request, **one shared sponsor-intelligence pass** reused by operational/Action Center/Studio Pulse, and **in-flight singleflight** so concurrent `/api/pre-alpha/home` requests join one computation.

Structural goals are **verified** (inventory load count = 1, sponsor-intel count = 1 per request; concurrent join works; 10/10 tests pass). **Peak RSS after a single Home request remains ~+1.0 GB**, similar to the pre-fix audit — not materially lower. Further optimization was **not** attempted per instructions.

---

## Files changed

| File | Change |
|------|--------|
| `services/core/src/pre-alpha/home.ts` | Shared snapshot, singleflight, observability, passes inventory + sponsor intel to branches |
| `services/core/src/pre-alpha/home-computation-metrics.ts` | **New** — per-request counters, RSS read, structured logs |
| `services/core/src/pre-alpha/operational-home.ts` | Optional `inventory`, `sharedSponsorIntel`, `sharedSponsorRanked` |
| `services/core/src/pre-alpha/studio-pulse.ts` | Optional shared snapshot injection |
| `services/core/src/action-center/hub.ts` | Pass-through shared snapshot options |
| `services/core/src/action-center/collect.ts` | Optional shared snapshot injection |
| `services/core/src/sponsor-intelligence/top-candidates.ts` | `rankedSponsorRecommendationsFromIntel`, `topSponsorCandidatesFromIntel` |
| `services/core/src/pre-alpha/home-memory-stabilization.test.ts` | **New** — regression tests (10) |
| `services/core/src/scripts/smoke-home-memory-stabilization.ts` | **New** — optional smoke helper |

**Migration:** No

---

## Before / after (audit vs fix)

| Metric | Pre-fix audit | Post-fix smoke |
|--------|---------------|----------------|
| Inventory loads per Home | **≥3** | **1** |
| Sponsor-intel computes per Home | **3** | **1** |
| Concurrent Home underlying runs | N (overlapping) | **1** (second joins) |
| API RSS baseline (idle ~2 min) | ~160 MB | ~**157 MB** (161,272 KB) |
| RSS after **one** Home | ~1,125 MB (+965 MB) | ~**1,173 MB** (+1,039 MB per Node `rssAfterKb`) |
| RSS +30s after Home | ~1,125 MB retained | ~**1,120 MB** (API node ps RSS 1,146,596 KB) |
| Home wall time (one request) | ~28.5 s (audit test) | ~**26.4 s** |
| Response size | ~25 KB | ~**26 KB** (unchanged contract) |

**Concurrent (2) requests:**

| Check | Result |
|-------|--------|
| Underlying computation | **1** started + **1** joined (`home_computation_joined`) |
| Both HTTP 200 | ✅ `/tmp/home-a.json` and `/tmp/home-b.json` identical 26,370 B |
| Per-request metrics (concurrent wave) | `inventoryLoadCount: 1`, `sponsorIntelComputeCount: 1` in finished log |
| RSS after concurrent | ~**1,159 MB** (1,187,800 KB telemetry) — did **not** double vs second full computation |

---

## Observability (API log)

Example single Home:

```json
{"event":"home_computation_started","joinedExisting":false,"inventoryLoadCount":0,"sponsorIntelComputeCount":0,"rssBeforeKb":161272}
{"event":"home_computation_finished","inventoryLoadCount":1,"sponsorIntelComputeCount":1,"elapsedMs":26356,"rssBeforeKb":161272,"rssAfterKb":1201380}
```

Example concurrent:

```json
{"event":"home_computation_started","joinedExisting":false,...}
{"event":"home_computation_joined","joinedExisting":true,...}
{"event":"home_computation_finished","inventoryLoadCount":1,"sponsorIntelComputeCount":1,"elapsedMs":18364,...}
```

---

## Tests

```bash
cd services/core
pnpm exec tsx --test src/pre-alpha/home-memory-stabilization.test.ts
```

**Result:** **10/10 pass**

Covers: shared intel ranking, metrics, injected snapshot for studio/action center, one load + one intel per Home, concurrent singleflight join, singleflight clear on success/failure, standalone studio path, response contract fields.

---

## Remaining memory concern

Peak RSS after one Home is **still ~1.0+ GB** because:

- One `loadIngestedInventoryItems()` still materializes ~5k DB rows → ~538 eligible items with full metadata
- One `computeSponsorIntelligence()` still builds large in-memory recommendation graphs
- Six parallel Home branches (status, action center, pipeline, operational, studio pulse, ai spend) still run concurrently; `softTimeout` still does not cancel abandoned work
- V8 retains heap after large allocation (RSS not returned to OS)

**Stopped here** per scope — no further optimization in this task.

---

## Deploy readiness

| Check | Status |
|-------|--------|
| Triple inventory eliminated | ✅ |
| Triple sponsor-intel eliminated | ✅ |
| Concurrent singleflight | ✅ |
| Response shape unchanged | ✅ |
| Tests | ✅ 10/10 |
| Migration | ✅ None |
| Peak RSS materially reduced | ❌ Still ~+1 GB / Home |

Deploy improves **concurrency safety** and removes redundant work; it does **not** yet make Home safe on a memory-constrained host by itself.

---

NOT READY — single Home RSS delta remains ~+1.0 GB (similar to audit); structural dedupe verified but peak memory not materially lower.
