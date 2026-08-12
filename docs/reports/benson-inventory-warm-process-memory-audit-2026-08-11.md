# Benson Inventory Warm-Process Memory Audit — 2026-08-11

**Date:** 2026-08-11  
**Scope:** Read-only diagnostic — one-time vs repeatable inventory RSS  
**Constraints:** No production code changes, no deploy, workers OFF  
**Authoritative prior reports:**
- `docs/reports/benson-home-memory-split-audit-2026-08-11.md`
- `docs/reports/benson-inventory-projection-memory-fix-2026-08-11.md`

**Diagnostic script:** `services/core/src/scripts/inventory-warm-process-audit.ts`  
**Invocation:** `NODE_OPTIONS='--expose-gc' pnpm exec tsx src/scripts/inventory-warm-process-audit.ts [test1|test2|test3]`

---

## Question

The first `loadIngestedInventoryItems()` call adds ~470 MB RSS but only ~24 MB JS heap and ~1 MB retained `InventoryItem[]`. Is that **one-time warm-up** or **repeatable per-load allocation**?

**Answer:** **Mostly one-time warm-up that plateaus.** The first call adds ~471 MB RSS; the second adds ~32 MB from the elevated plateau; the third adds ~1.4 MB. RSS does **not** grow linearly at hundreds of MB per call. The first-call spike is dominated by **normalization/object-graph cost** while raw DB rows are still retained, not by DB stack initialization or raw query materialization alone.

---

## TEST 1 — Repeated inventory load, same process

Baseline after `global.gc()`:

| Field | Value |
|-------|------:|
| rss | 166,092,800 B (**162,200 KB**) |
| heapTotal | 55,336,960 B (54,040 KB) |
| heapUsed | 14,979,784 B (14,629 KB) |
| external | 2,802,065 B (2,736 KB) |
| arrayBuffers | 131,587 B (129 KB) |

### Call summaries

| Call | Elapsed (ms) | Items | Immediate RSS Δ baseline (KB) | Immediate RSS Δ prior plateau (KB) | heapUsed Δ prior (KB) | external Δ prior (KB) | arrayBuffers Δ prior (KB) | Settled RSS (KB) |
|------|-------------:|------:|--------------------------------:|-----------------------------------:|----------------------:|----------------------:|--------------------------:|-----------------:|
| **1** | 3,171 | 533 | **+470,644** | **+470,644** | +23,611 | −109 | +15 | 540,328 |
| **2** | 3,706 | 533 | +410,512 | **+32,384** | +14,328 | +109 | +110 | 572,840 |
| **3** | 2,244 | 533 | +412,048 | **+1,408** | +13,876 | −53 | +56 | 544,916 |

### Plateau behavior

- After call 1 + 30s + gc, RSS settles at **540,328 KB** (+378,128 KB above baseline).
- Call 2 immediate peak: **572,712 KB** (+32,384 KB above call-1 plateau).
- Call 3 immediate peak: **574,248 KB** (+1,408 KB above call-2 plateau).
- Call 3 settled: **544,916 KB** (−27,924 KB below call-2 plateau — RSS fluctuates but does **not** climb linearly).

**Interpretation:** First call is a large step function (~471 MB immediate). Subsequent calls add **tens of MB at most**, then near-zero. Process RSS **plateaus** around **540–573 MB** above the ~162 MB cold start.

---

## TEST 2 — DB query vs normalization (same projected query, fresh process)

Baseline: rss **162,880 KB**, heapUsed **14,632 KB**, external **2,572 KB**, arrayBuffers **25 KB**

| Phase | Rows | Elapsed (ms) | RSS Δ from baseline (KB) | RSS Δ from prior step (KB) | heapUsed Δ (KB) | external Δ (KB) | arrayBuffers Δ (KB) |
|-------|-----:|-------------:|-------------------------:|---------------------------:|----------------:|------------------:|--------------------:|
| **A. DB SELECT only** (hold raw rows) | 1,675 | 259 | **+13,816** | +13,816 | +10,721 | +100 | +34 |
| **C. Normalize** (same rows, no re-query) | 1,675 | 3,318 | +455,288 | **+441,472** | +14,818 | −130 | 0 |
| **+30s + gc settle** | — | — | +371,464 | — | — | — | — |

**Split conclusion:**

| Cost bucket | RSS contribution |
|-------------|-----------------:|
| DB/driver materialization (fetch 1,675 projected rows) | **~14 MB** |
| Normalization (map `normalizeInventoryItem` while raw rows still held) | **~431 MB** |
| Combined fetch + normalize | **~455 MB** (consistent with TEST 1 first call ~471 MB; difference = filtering pipeline + 533 vs 1,675 row counts) |

Normalization adds ~15 MB heapUsed but ~431 MB RSS — same RSS-vs-heap divergence seen in prior audits. Raw rows and normalized objects coexist during the map; V8/RSS retains arenas that heapUsed alone does not reflect.

---

## TEST 3 — Tiny DB query control (fresh process)

| Step | Immediate RSS Δ (KB) | Settled RSS Δ @ +30s (KB) |
|------|---------------------:|--------------------------:|
| `SELECT 1` via Drizzle | **+1,240** | −69,384 (heap shrinks; RSS not returned to OS) |
| One-row `content_items.id` LIMIT 1 | **+512** | +640 |

**Conclusion:** Initializing and using the DB/Drizzle stack does **not** cause a large one-time RSS increase. `SELECT 1` adds ~1.2 MB; a tiny row fetch adds ~0.5 MB. The ~470 MB spike is **not** explained by DB pool / driver warm-up alone.

---

## Classification

| Hypothesis | Verdict |
|------------|---------|
| **A. One-time Node/DB/ORM/runtime warm-up** | **Partially confirmed** — first call step-function; calls 2–3 add little; DB stack warm-up is ~1 MB |
| **B. Repeatable hundreds-of-MB per inventory load** | **Rejected** — call 2 +32 MB, call 3 +1.4 MB from plateau |
| DB fetch materialization | **Minor** (~14 MB for 1,675 projected rows) |
| Normalization while raw rows retained | **Dominant first-call cost** (~431 MB incremental in TEST 2) |

**Overall:** **MIXED** — one-time runtime/heap expansion on first load, with normalization/object-graph as the primary RSS driver; repeatable per-call cost is small once plateaued.

---

## Smallest next step

**Do not recommend streaming/chunking yet** — second and third loads add little memory; the problem is first-call peak while raw rows + normalized objects coexist, plus RSS not returning to OS after gc.

Smallest evidence-backed next investigation (no fix in this pass):

1. Diagnostic only: measure RSS if raw `rows` array is dropped (`rows.length = 0` / reassign) **before** normalization vs current pattern — confirms simultaneous retention hypothesis.
2. If confirmed: targeted production change would be **normalize in chunks and release each chunk's raw rows before allocating the next** (or map with explicit row release), **not** column projection or streaming the full query.

---

## Raw memory snapshots (TEST 1, bytes)

| Label | rss | heapTotal | heapUsed | external | arrayBuffers |
|-------|----:|----------:|---------:|---------:|-------------:|
| test1_baseline | 166,092,800 | 55,336,960 | 14,979,784 | 2,802,065 | 131,587 |
| test1_call1_after_load | 648,032,256 | 66,240,512 | 39,157,608 | 2,689,904 | 147,417 |
| test1_call1_after_30s_gc | 553,295,872 | 21,151,744 | 17,800,608 | 2,577,613 | 33,283 |
| test1_call2_after_load | 586,457,088 | 47,628,288 | 32,472,328 | 2,689,165 | 146,391 |
| test1_call2_after_30s_gc | 586,588,160 | 29,540,352 | 18,032,824 | 2,688,878 | 33,283 |
| test1_call3_after_load | 588,029,952 | 65,191,936 | 32,241,840 | 2,634,571 | 91,450 |
| test1_call3_after_30s_gc | 557,993,984 | 19,578,880 | 16,989,000 | 2,572,024 | 33,283 |

---

MEMORY BEHAVIOR: MIXED  
FIRST CALL DELTA: +470,644 KB RSS (immediate vs baseline)  
SECOND CALL DELTA: +32,384 KB RSS (immediate vs call-1 plateau)  
THIRD CALL DELTA: +1,408 KB RSS (immediate vs call-2 plateau)  
READY FOR NEXT TARGET / NEED MORE EVIDENCE: **READY FOR NEXT TARGET** — investigate row-release-before-normalize / chunked normalize (not streaming/chunking the DB query yet)
