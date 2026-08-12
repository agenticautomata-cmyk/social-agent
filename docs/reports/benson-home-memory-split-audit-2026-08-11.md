# Benson Home Memory Split Audit — 2026-08-11

**Date:** 2026-08-11  
**Scope:** Read-only memory attribution — inventory vs sponsor intel vs remaining Home branches  
**Constraints:** No production behavior changes, no deploy, no build, no migrations, workers OFF  
**Method:** Isolated `tsx` processes with `NODE_OPTIONS='--expose-gc'`, diagnostic script `services/core/src/scripts/home-memory-split-audit.ts`

---

## Executive summary

A single `loadIngestedInventoryItems()` call in a clean Node process adds **~473 MB RSS** (~22 MB heap). A subsequent `computeSponsorIntelligence()` pass adds only **~13 MB RSS** (~4 MB heap). Sponsor intelligence is **not** the dominant memory source.

The prior full-Home API measurement (~**+1,039 MB RSS** per request after stabilization) exceeds inventory+sponsor intel in isolation (~**486 MB**) by **~550 MB**, pointing to **remaining Home branches** (Action Center collect, operational parallel DB fan-out, Studio Pulse, pipeline, etc.) as a secondary contributor. TEST 3 was not run — it would require new instrumentation.

**Smallest safe fix:** Narrow the `loadIngestedInventoryItems()` SELECT to columns Home actually consumes; drop `raw_payload` and other unused wide columns first.

---

## Clean baseline

| Process | Mode | RSS (KB) | heapUsed (KB) | Notes |
|---------|------|----------|---------------|-------|
| Fresh Node | test1 baseline | **170,592** (~167 MB) | 15,469 | After `global.gc()` |
| Fresh Node | test2 baseline | **161,896** (~158 MB) | 15,470 | Separate process |
| API server (prior smoke, idle) | Home stabilization report | **161,272** (~157 MB) | — | Long-running process |

Workers confirmed OFF before tests.

---

## TEST 1 — Inventory only

**Invocation:** `NODE_OPTIONS='--expose-gc' pnpm exec tsx src/scripts/home-memory-split-audit.ts test1`

| Metric | Value |
|--------|------:|
| DB rows matching load query (retention window) | **1,699** |
| Eligible `InventoryItem` count returned | **534** |
| Elapsed time | **3,220 ms** |
| RSS immediately after load | **643,788 KB** (~629 MB) |
| **RSS delta from baseline** | **+473,196 KB** (~**462 MB**) |
| heapUsed delta (immediate) | **+22,039 KB** (~22 MB) |
| RSS +30s (after gc) | **547,100 KB** |
| **RSS delta +30s from baseline** | **+376,508 KB** (~**368 MB**) |
| heapUsed delta +30s | **+2,775 KB** (~3 MB) |

**Interpretation:** Inventory materialization dominates heap modestly but RSS massively. The ~440 MB gap between RSS delta and heap delta indicates native / V8 external / PostgreSQL client buffering and object-graph overhead, not just retained JS objects on the heap.

### In-memory shape of retained inventory (534 items)

| Field (JSON.stringify / string lengths) | Approx bytes |
|----------------------------------------|-------------:|
| `metadata` (serialized) | 403,501 |
| `summary` + `summaryRaw` | 549,040 |
| `title` | 20,460 |
| `whyItMatters` | 34,803 |
| **Tracked total** | **~1.0 MB** |

Retained `InventoryItem` objects are ~1 MB of string/json payload; the **~462 MB RSS spike** is therefore **not** explained by the final 534-item array alone — it includes the full 1,699-row query result (all columns), intermediate filter arrays, and driver/parser overhead held until GC.

---

## TEST 2 — Sponsor intelligence incremental

**Invocation:** Fresh process — `NODE_OPTIONS='--expose-gc' pnpm exec tsx src/scripts/home-memory-split-audit.ts test2`

### After inventory (same as TEST 1)

| Metric | Value |
|--------|------:|
| Eligible inventory count | **534** |
| Load elapsed | **2,606 ms** |
| RSS delta from baseline | **+473,180 KB** (~462 MB) |
| heapUsed delta | **+22,317 KB** |

### After `computeSponsorIntelligence(inventory, { limit: 50 })`

| Metric | Value |
|--------|------:|
| Intel elapsed | **1,418 ms** |
| `totalEligible` | **43** |
| Recommendation count (all sections) | **119** |
| Section count | **4** |
| **Incremental RSS (inventory → after intel)** | **+12,640 KB** (~**12 MB**) |
| Incremental heapUsed | **+3,720 KB** (~4 MB) |
| Combined RSS delta from baseline | **+485,820 KB** (~474 MB) |

### +30s after intel

| Metric | Value |
|--------|------:|
| Combined RSS delta from baseline | **+386,096 KB** (~377 MB) |
| Incremental intel RSS vs post-inventory | **−87,084 KB** (GC reclaimed; not retained) |

**Interpretation:** Sponsor intelligence is cheap relative to inventory load. It is **not** responsible for the ~1 GB Home RSS spike.

---

## TEST 3 — Home without sponsor intel

**Status:** **Not executed.**

Remaining Home branches (`computeActionCenter`, `computeOperationalHomeData`, `computeStudioPulse`, `computePipelineDashboard`, `computePreAlphaStatus`, `buildSpendSummary`) are only reachable through `computePreAlphaHomeInternal()` or individual exports that still assume sponsor intel for briefing cards. Skipping sponsor intel while running the rest would require either:

- A new diagnostic entry point / env flag (code change), or
- Partial manual orchestration that does not mirror production ordering and shared-snapshot wiring.

**More instrumentation is required** to isolate branch C precisely.

---

## Data shape inspection — `loadIngestedInventoryItems()`

### PostgreSQL on-disk column sizes

**All ingested rows (4,991 — no retention filter):**

| Column | Sum (bytes) | Avg (bytes) | Max (bytes) |
|--------|------------:|------------:|------------:|
| `metadata` | 4,031,966 (~3.8 MB) | 808 | 14,877 |
| `raw_payload` | 3,343,398 (~3.2 MB) | 827 | 9,914 |
| `script` | 2,031,873 (~2.0 MB) | 436 | — |
| `hook` | 168,476 | — | — |
| `topic` | 208,302 | — | — |
| `location_candidates` | 828,159 (~808 KB) | — | — |

**Retention-window rows only (1,699 — matches live load query):**

| Column | Sum (bytes) |
|--------|------------:|
| `metadata` | 1,383,063 (~1.3 MB) |
| `raw_payload` | 1,218,106 (~1.2 MB) |
| `script` | 701,030 (~685 KB) |
| `hook` | 74,613 |
| `location_candidates` | 186,750 (~182 KB) |
| **Large text/json total** | **~3.6 MB on disk** |

### What the loader actually fetches

```45:65:services/core/src/inventory/load-ingested.ts
  const rows = await db
    .select({
      item: contentItems,
      sourceName: sources.name,
      sourceType: sources.type,
    })
```

This pulls **every** `content_items` column, including `raw_payload`, captions, HeyGen URLs, `creator_relevance_explanation`, embeddings, etc. — even though `normalizeInventoryItem()` never copies `rawPayload` onto `InventoryItem`.

### What Home downstream actually consumes

| Field | Loaded? | Kept on `InventoryItem`? | Home / branches use? |
|-------|---------|--------------------------|----------------------|
| **`metadata`** | Yes | Yes (by reference) | **Yes** — eligibility, employment intent, category rules, timezone, luxury presets, quiet-library flags |
| **`script` / `hook`** | Yes | Copied into `summary` / `summaryRaw` | **Yes** — summaries, temporal soft-gate (`summaryRaw`) |
| **`raw_payload`** | Yes (full row) | **No** | **No** — not referenced in Home, command-center, sponsor-intel, or eligibility paths |
| **`location_candidates`** | Yes (full row) | No (map loader uses separately) | **No** on Home path (`loadIngestedInventoryItems` only) |
| **`topic`** | Yes | As `title` | **Yes** |
| Captions / HeyGen / video URLs | Yes | No | **No** on Home path |
| `creator_relevance_explanation` | Yes | No | **No** on Home path |

During normalization, `JSON.stringify(metadata)` is also called once per row for flag detection (`textBlob`), adding transient allocation on top of stored metadata.

---

## Reconciliation with full Home API (~+1 GB)

| Component | Isolated RSS delta | Share of ~1 GB Home spike |
|-----------|-------------------:|--------------------------:|
| Inventory load (A) | **~462 MB** | **~44%** |
| Sponsor intel (B) | **~13 MB** | **~1%** |
| Remaining Home branches (C) + long-lived API overhead | **~550 MB** (estimated gap) | **~53%** |
| **Inventory + sponsor (A+B)** | **~475 MB** | **~46%** |

Prior stabilized Home smoke (same day): RSS **161,272 → 1,201,380 KB** (+1,039 MB) with inventory load count = 1 and sponsor intel count = 1.

The stabilization fix removed **duplicate** inventory/intel work but did not reduce peak RSS because **one** inventory materialization is still ~462 MB in a fresh process, and parallel Home branches still allocate large in-memory structures (Action Center maps, command-center sections, registry rows, pipeline lists, inbound message batches) while `softTimeout()` does not cancel underlying promises.

---

## Smallest safe fix recommendation

1. **Primary (inventory):** Replace `item: contentItems` with an explicit column projection in `load-ingested.ts` containing only fields used by `normalizeInventoryItem()` and freshness filters. **Drop `raw_payload` first** (~1.2 MB on-disk × parse/ORM amplification across 1,699 rows). Also omit captions, HeyGen/video columns, `creator_relevance_explanation`, `topic_embedding`, and other non-Home fields.
2. **Secondary (verify after column trim):** Re-run this split audit; if RSS still >> retained item bytes, add branch-level RSS probes (TEST 3 instrumentation) before touching sponsor-intel or Home orchestration.
3. **Do not** change SQL retention/window logic in this pass (per instructions).

---

## Classification

| Question | Answer |
|----------|--------|
| Dominant per-request memory source (A vs B vs C) | **INVENTORY MATERIALIZATION** dominates A vs B; full Home also needs **OTHER** (branch C) to reach ~1 GB |
| Sponsor intel vs inventory | Inventory **~36×** larger RSS increment than sponsor intel in TEST 2 |
| raw_payload | Loaded but **not consumed** by Home — safe trim candidate |
| TEST 3 | **Needs more instrumentation** |

---

DOMINANT MEMORY SOURCE: INVENTORY MATERIALIZATION  
CONFIDENCE: HIGH (inventory vs sponsor intel); MEDIUM (exact branch-C split vs API baseline)  
READY FOR TARGETED FIX / NEED MORE EVIDENCE: **READY FOR TARGETED FIX** on inventory column projection; branch-level attribution needs more evidence before broader Home refactors
