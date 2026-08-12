# Benson Inventory Normalization Peak Memory Audit — 2026-08-11

**Date:** 2026-08-11  
**Scope:** Diagnostic only — does raw-row retention during normalization cause the ~470 MB RSS peak?  
**Constraints:** No production code changes, no deploy, workers OFF  
**Prior report:** `docs/reports/benson-inventory-warm-process-memory-audit-2026-08-11.md`  
**Script:** `services/core/src/scripts/inventory-normalization-peak-audit.ts`  
**Invocation:** `NODE_OPTIONS='--expose-gc' pnpm exec tsx src/scripts/inventory-normalization-peak-audit.ts [a|b|c]` (fresh process per variant)

---

## Question

Does keeping the full raw `rows` array alive while `normalizeInventoryItem()` runs cause the large first-call RSS peak?

**Answer:** **Partially yes, but simple per-index release is insufficient.** Peak RSS grows **linearly with row index** in variants A/B while both the raw array and the growing normalized array are fully retained (~615 MB RSS at end of normalize). Setting `rows[i] = undefined` without GC (**variant B**) does **not** reduce peak meaningfully. **Chunked processing with raw-row release and post-chunk GC (variant C)** caps peak RSS at ~**249 MB** (~**81% lower** than A/B) with identical output.

---

## Correctness (all variants)

| Check | A | B | C |
|-------|---|---|---|
| Row count | 1,659 | 1,659 | 1,659 |
| Eligible count | 532 | 532 | 532 |
| IDs/order vs A reference | reference | ✓ match | ✓ match |
| Deep-equal eligible items | reference | ✓ | ✓ |

---

## Variant A — Current behavior (retain all raw rows)

**Baseline** (rss / heapTotal / heapUsed / external / arrayBuffers):

| Field | Bytes | KB |
|-------|------:|---:|
| rss | 163,749,888 | 159,912 |
| heapTotal | 54,288,384 | 53,016 |
| heapUsed | 14,971,616 | 14,621 |
| external | 2,769,297 | 2,704 |
| arrayBuffers | 25,091 | 25 |

| Metric | Value |
|--------|------:|
| Fetch elapsed | 156 ms |
| Normalize elapsed | 3,889 ms |
| Pipeline elapsed | 355 ms |
| After fetch RSS Δ | +15,832 KB |
| **Peak RSS Δ (baseline → peak)** | **+471,644 KB** |
| Peak RSS Δ (fetch → peak) | +455,812 KB |
| **Peak during normalize (sampled max)** | **615,168 KB RSS (+455,256 KB)** at row 1650 |
| Completion RSS Δ | +471,644 KB |
| Settled RSS Δ (+30s gc) | +385,764 KB |
| Peak heapUsed Δ | +23,558 KB |
| Peak external Δ | −131 KB |
| Peak arrayBuffers Δ | +65 KB |

RSS climbs steadily during normalize (row 50: 186 MB → row 1200: 613 MB → normalize complete: 615 MB), consistent with **simultaneous retention of all raw rows + entire normalized array**.

---

## Variant B — Destructive row release (no per-row gc)

| Metric | Value |
|--------|------:|
| Normalize elapsed | 2,702 ms |
| **Peak RSS Δ** | **+471,192 KB** |
| Peak during normalize (sampled max) | **619,984 KB RSS** |
| Completion RSS Δ | +471,192 KB |
| Settled RSS Δ (+30s gc) | +386,376 KB |
| Peak heapUsed Δ | +23,052 KB |

**vs A:** Peak RSS **−452 KB (−0.10%)** — **no meaningful difference.**

Nulling `rows[i]` after each normalize does not shrink RSS without GC; V8 retains freed objects until collection while the normalized array still grows to full size.

---

## Variant C — Chunked release (chunk size 100, gc after each chunk)

| Metric | Value |
|--------|------:|
| Normalize elapsed | 2,856 ms |
| **Peak RSS Δ** | **+88,220 KB** |
| Peak during normalize (sampled max) | **248,900 KB RSS (+88,220 KB)** at chunk 900 |
| Peak plateau | ~247–249 MB RSS from chunk 500 through 1659 |
| Completion RSS Δ | +86,636 KB |
| Settled RSS Δ (+30s gc) | **+3,672 KB** |
| Peak heapUsed Δ | +10,158 KB |

**vs A peak:** **−383,424 KB (−81.3%)**

Chunked release prevents raw+normalized full-scale coexistence; post-chunk `global.gc()` (diagnostic only) also returns settled RSS near baseline.

---

## Summary comparison

| Variant | Peak RSS Δ | Settled RSS Δ | Normalize ms | Peak vs A |
|---------|----------:|-------------:|-------------:|----------:|
| **A** (current) | **471,644 KB** | 385,764 KB | 3,889 | — |
| **B** (row null) | **471,192 KB** | 386,376 KB | 2,702 | −0.1% |
| **C** (chunk+gc) | **88,220 KB** | 3,672 KB | 2,856 | **−81.3%** |

### External / arrayBuffers

- A/B: external drops after fetch (~9 MB → ~2.5 MB) during normalize; peak RSS still explodes — **not driven by arrayBuffers** (+65 KB peak Δ in A).
- C: external stable ~2.6 MB; peak RSS bounded without large external growth.

---

## Interpretation

| Hypothesis | Result |
|------------|--------|
| Raw rows retained **with** full normalized array → peak | **Confirmed** (A/B linear RSS growth to ~615 MB during normalize) |
| Per-index `rows[i] = undefined` alone fixes peak | **Rejected** (B ≈ A) |
| Chunked raw release bounds peak | **Confirmed** (C −81% peak RSS) |
| DB fetch alone | ~16–22 MB (consistent with prior audit) |

**Classification:** **CHUNKING_HELPS** — with **RAW_ROW_RETENTION_NOT_CAUSE** for naive index-null release (variant B = **NO_MEANINGFUL_DIFFERENCE** vs A).

Root mechanism: peak is from **holding the entire fetched row set and the entire normalized array at once**, plus V8 heap arena expansion reflected in RSS. Releasing individual row references without bounding working set or collecting does not help.

---

## Smallest production fix (if pursued — not implemented here)

In `loadIngestedInventoryItems()` only:

1. Fetch projected rows (unchanged query).
2. Normalize in **chunks of ~100**, clearing processed raw-row references after each chunk.
3. **Do not** retain a second copy of the full raw array.
4. Evaluate whether post-chunk GC is needed in production or if bounded chunk size alone suffices (diagnostic C used both; peak was already capped mid-run before all chunks finished).

Do **not** stream/chunk the SQL query yet. Do **not** touch Home branch C.

---

## Diagnostic artifacts

- `/tmp/inv-norm-peak-a.jsonl`
- `/tmp/inv-norm-peak-b.jsonl`
- `/tmp/inv-norm-peak-c.jsonl`
- `/tmp/benson-inv-norm-peak-ref.json` (variant A eligible output reference)

---

NORMALIZATION PEAK CAUSE: CHUNKING_HELPS  
BEST VARIANT: C  
PEAK REDUCTION: 81.3% vs variant A (+471,644 KB → +88,220 KB)  
READY FOR TARGETED FIX / NEED MORE EVIDENCE: **READY FOR TARGETED FIX** — chunked normalize with raw-row release in `loadIngestedInventoryItems()`; optional follow-up diagnostic without post-chunk gc to isolate chunk-size vs gc contribution
