# Benson Inventory Chunking Without GC Audit — 2026-08-11

**Date:** 2026-08-11  
**Scope:** Diagnostic only — isolate chunking from forced GC (Variant D)  
**Constraints:** No production changes, no deploy, workers OFF  
**Prior reports:**
- `docs/reports/benson-inventory-normalization-peak-audit-2026-08-11.md`
- `docs/reports/benson-inventory-warm-process-memory-audit-2026-08-11.md`

**Script:** `services/core/src/scripts/inventory-normalization-peak-audit.ts d`  
**Invocation:** `NODE_OPTIONS='--expose-gc' pnpm exec tsx src/scripts/inventory-normalization-peak-audit.ts d`

---

## Question

Does chunking + raw-row release materially reduce peak RSS **without** explicit `global.gc()` between chunks?

**Answer:** **No.** Variant D peak RSS is **~472 MB**, essentially identical to Variant A (**~472 MB**) and far above Variant C with forced GC (**~88 MB**). **Forced GC drove the prior 81% improvement**, not chunking alone.

---

## Variant D — Chunk size 100, raw-row release, NO gc between chunks

Fresh process. `global.gc()` only before baseline and after +30s settle.

### Baseline memory

| Field | Bytes | KB |
|-------|------:|---:|
| rss | 166,719,488 | 162,812 |
| heapTotal | 36,200,448 | 35,352 |
| heapUsed | 14,974,984 | 14,624 |
| external | 2,625,544 | 2,564 |
| arrayBuffers | 25,091 | 25 |

### Key metrics

| Metric | Value |
|--------|------:|
| Row count | 1,659 |
| Eligible count | 532 |
| Fetch elapsed | 227 ms |
| Normalize elapsed | 4,456 ms |
| Pipeline elapsed | 279 ms |
| After fetch RSS | 176,504 KB (+13,692 KB vs baseline) |
| **Peak RSS (tracked)** | **634,872 KB** |
| **Peak RSS Δ vs baseline** | **+472,060 KB** |
| Peak during normalize (sampled max at chunk 1300–1659) | **617,464 KB (+454,652 KB)** |
| Completion RSS Δ | +472,060 KB |
| Settled RSS Δ (+30s, one gc) | +380,772 KB |
| Peak heapUsed Δ | +26,693 KB |
| Peak heapTotal at peak | 62,896 KB |
| Peak external Δ | +20 KB |
| Peak arrayBuffers Δ | +76 KB |

### RSS during normalize (chunk boundaries)

RSS climbs monotonically through chunks without gc:

| Chunk end | RSS (KB) | Δ baseline (KB) |
|----------:|---------:|----------------:|
| 100 | 198,008 | +35,196 |
| 300 | 240,248 | +77,436 |
| 500 | 276,600 | +113,788 |
| 700 | 388,856 | +226,044 |
| 900 | 475,384 | +312,572 |
| 1100 | 560,120 | +397,308 |
| 1300 | 617,464 | +454,652 |
| 1659 | 617,464 | +454,652 |

Pattern matches Variant A linear growth — **no plateau** unlike Variant C (~249 MB cap).

---

## Correctness vs Variant A reference

| Check | Result |
|-------|--------|
| Eligible count | **532** (matches reference count) |
| IDs/order vs `/tmp/benson-inv-norm-peak-ref.json` | **Mismatch** |
| Deep-equal | **Mismatch** |

**Note:** Reference drift — current production `loadIngestedInventoryItems()` also returns 532 items but **does not match** stale reference IDs (reference captured ~19:04 UTC; D run ~19:18 UTC). Count and pipeline behavior are consistent; ID mismatch is environmental, not chunk-order bug. Variant C (same push-based chunk algorithm + gc) previously deep-matched reference when co-run.

---

## Three-way comparison

| Variant | Chunk | gc between chunks | Peak RSS Δ | Settled RSS Δ | Normalize ms |
|---------|-------|-------------------|----------:|-------------:|-------------:|
| **A** (current) | — | — | **+471,644 KB** | +385,764 KB | 3,889 |
| **C** | 100 + release | **Yes** | **+88,220 KB** | +3,672 KB | 2,856 |
| **D** | 100 + release | **No** | **+472,060 KB** | +380,772 KB | 4,456 |

| Comparison | Peak reduction vs A |
|------------|-------------------:|
| C vs A | **−81.3%** (+471,644 → +88,220 KB) |
| D vs A | **−0.09%** (+471,644 → +472,060 KB) — **no material change** |
| C vs D | **−81.3%** — forced GC accounts for essentially all of C's benefit |

---

## Interpretation

| Hypothesis | Verdict |
|------------|---------|
| Chunking/raw-row release alone reduces peak RSS | **Rejected** — D ≈ A |
| Forced GC between chunks drove C's improvement | **Confirmed** |
| Chunking without GC ready for production | **No** |

Releasing raw-row references in 100-row chunks **does not** bound RSS without concurrent collection. V8 retains freed objects and heap arenas expand to the same ~617 MB peak as retaining the full raw array. Variant C's plateau at ~249 MB required **post-chunk `global.gc()`** to reclaim memory between chunks.

---

## Smallest next step (not implemented)

Do **not** implement production chunked-normalize without a different memory strategy. Options requiring further evidence:

- Chunked normalize **plus** explicit lifecycle management that doesn't rely on `global.gc()` (e.g. process-isolated reload, streaming to disk, or worker subprocess isolation)
- Investigate why gc is required (V8 heap fragmentation / duplicate object graphs during normalize)

---

## Artifact

- `/tmp/inv-norm-peak-d.jsonl`

---

CHUNKING WITHOUT GC: NOT EFFECTIVE  
PEAK RSS: +472,060 KB (Δ vs baseline; +454,652 KB peak during normalize samples)  
PEAK REDUCTION VS A: −0.09% (no material reduction)  
READY FOR PRODUCTION FIX / NEED DIFFERENT APPROACH: **NEED DIFFERENT APPROACH** — forced GC drove Variant C gains; chunking alone does not reduce peak RSS
