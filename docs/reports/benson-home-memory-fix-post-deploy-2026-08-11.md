# Benson Home Memory Fix — Post-Deploy Verification — 2026-08-11

**Date:** 2026-08-11 (deploy ~19:49 UTC)  
**Authoritative pre-deploy report:** `docs/reports/benson-intl-timezone-memory-fix-2026-08-11.md`  
**Scope:** Intl formatter cache + Home singleflight/shared work + inventory column projection only

---

## Pre-deploy

### Git status / scope gate

**Approved production bundle (deployed via API restart — files on disk):**

| # | Path | Bundle |
|---|------|--------|
| 1 | `services/core/src/datetime.ts` | Intl formatter cache |
| 2 | `services/core/src/pre-alpha/home.ts` | Home singleflight |
| 3 | `services/core/src/pre-alpha/home-computation-metrics.ts` | Observability |
| 4 | `services/core/src/pre-alpha/operational-home.ts` | Shared snapshot |
| 5 | `services/core/src/pre-alpha/studio-pulse.ts` | Shared snapshot |
| 6 | `services/core/src/action-center/hub.ts` | Shared snapshot |
| 7 | `services/core/src/action-center/collect.ts` | Shared snapshot |
| 8 | `services/core/src/sponsor-intelligence/top-candidates.ts` | Reuse precomputed intel |
| 9 | `services/core/src/inventory/inventory-load-projection.ts` | Column projection |
| 10 | `services/core/src/inventory/load-ingested.ts` | Uses projection |
| 11 | `services/core/src/inventory/normalize.ts` | `InventoryNormalizeSource` |

**Regression tests run (not deployed to runtime):**

- `services/core/src/datetime-formatter-cache.test.ts`
- `services/core/src/datetime.test.ts`
- `services/core/src/creator-agent/temporal-state.test.ts`
- `services/core/src/inventory/load-ingested-projection.test.ts`
- `services/core/src/pre-alpha/home-memory-stabilization.test.ts`

**Result: 39/39 pass**

### Explicitly excluded (not part of this deploy)

- Diagnostic scripts: `services/core/src/scripts/*memory*`, `*hotspot*`, `*normalization*`, `smoke-home-memory-stabilization.ts`
- Dashboard / Home redesign files (`dashboard/**`, `home-dashboard-panel.tsx`, etc.)
- Migrations (`db/migrations/**`)
- Worker/research changes beyond already-deployed scrape guardrails
- Unrelated dirty-tree modifications across `services/api`, `ask-benson`, `creator-partnership`, etc.

No commit was made; deploy applied the scoped bundle already present on disk via **API-only restart** (no dashboard rebuild, no worker restart, no Voicebox/n8n, no migrations).

---

## Deploy

| Step | Result |
|------|--------|
| Path | Memory-conscious API-only restart via `benson_stop_api_processes` + `benson_start_api` |
| Dashboard rebuild | **Skipped** (core/API-only change) |
| Workers | **Not restarted** (not running at verify time; no manual source refresh triggered) |
| Voicebox / n8n | **Not started** |
| Migrations | **None** |
| Source fingerprint | `d0c3d68ba4d46a74` |
| API fingerprint (post) | `d0c3d68ba4d46a74` — **MATCHES source** |
| API started at | `2026-08-11T19:49:05.460Z` |

**Parity note:** Dashboard (`93e756f0617a68a6`) and worker (`93e756f0617a68a6`) fingerprints predate this core-only deploy and still differ from current source fingerprint. This is **expected** for a scoped API-only deploy with no dashboard rebuild. API runtime matches current source.

---

## Post-deploy health

| Check | Result |
|-------|--------|
| API `/health` | **OK** (`200`) |
| Dashboard `/` | **OK** (`200`) |
| Workers | **Not running** (0 instances; pre-existing at verify time) |
| Migration | **None** |

---

## Single Home request

API node PID: `603310`

| Metric | Value |
|--------|------:|
| API RSS baseline | 185,540 KB (~181 MB) |
| API RSS immediately after Home | 237,500 KB |
| **RSS delta (peak)** | **51,960 KB (~51 MB)** |
| API RSS +30 s | 186,356 KB (+816 KB vs baseline) |
| Home wall time | **7,439 ms** |
| Response bytes | **26,679** |
| HTTP status | **200** |

API telemetry (`api.log`):

```json
{"event":"home_computation_started","joinedExisting":false,"inventoryLoadCount":0,"sponsorIntelComputeCount":0,"rssBeforeKb":184800,"rssAfterKb":184800}
{"event":"home_computation_finished","inventoryLoadCount":1,"sponsorIntelComputeCount":1,"elapsedMs":7421,"rssBeforeKb":184800,"rssAfterKb":236520}
```

| Count | Expected | Actual |
|-------|----------|--------|
| `inventoryLoadCount` | 1 | **1** |
| `sponsorIntelComputeCount` | 1 | **1** |

**Comparison to pre-fix audit:** ~+998 MB → **~+52 MB** (~95% reduction). Within/better than local verification ballpark (~100–150 MB). Well under 500 MB stop threshold.

---

## Two concurrent Home requests (once)

| Check | Result |
|-------|--------|
| HTTP | Both **200**, **26,679 B**, identical JSON |
| Singleflight | **1 `home_computation_started` + 1 `home_computation_joined`** |
| Underlying work | `inventoryLoadCount: 1`, `sponsorIntelComputeCount: 1` |
| Concurrent wall time | **4,966 ms** |
| Memory multiplication | **No** — concurrent peak +~69 MB vs baseline, not ~2× inventory spike |

API telemetry (concurrent):

```json
{"event":"home_computation_started","joinedExisting":false,...}
{"event":"home_computation_joined","joinedExisting":true,...}
{"event":"home_computation_finished","inventoryLoadCount":1,"sponsorIntelComputeCount":1,"elapsedMs":4923,"rssBeforeKb":185484,"rssAfterKb":254280}
```

---

## Host check

| Metric | Value |
|--------|------:|
| Total RAM | 7.6 GiB |
| Available RAM | ~3.0 GiB |
| Swap used | 2.1 GiB / 4.0 GiB |
| API RSS (final) | 255,032 KB (~249 MB) |
| Worker RSS | ~1.6 MB (workers not running) |

No host thrashing observed during verify. Home RSS delta **51 MB** — far below 500 MB abort threshold.

---

## Verdict

| Criterion | Met? |
|-----------|------|
| Scoped bundle only | **Yes** |
| Pre-deploy tests 39/39 | **Yes** |
| API healthy + fingerprint matches source | **Yes** |
| No migration | **Yes** |
| Home RSS ~100–150 MB ballpark (not ~1 GB) | **Yes** (~52 MB) |
| Home latency ~5–8 s | **Yes** (~7.4 s) |
| inventoryLoadCount = 1 | **Yes** |
| sponsorIntelComputeCount = 1 | **Yes** |
| Concurrent singleflight | **Yes** |

HOME MEMORY FIX VERIFIED
