# Benson Normalization Hotspot Audit — 2026-08-11

**Date:** 2026-08-11  
**Scope:** Read-only — identify operations inside `normalizeInventoryItem()` causing ~430–455 MB RSS spike  
**Constraints:** No production changes, no deploy, workers OFF  
**Prior report:** `docs/reports/benson-inventory-chunking-no-gc-audit-2026-08-11.md`

**Diagnostic script:** `services/core/src/scripts/normalization-hotspot-audit.ts`

---

## Executive summary

The RSS cliff occurs at **temporal/timezone evaluation** (`evaluateTemporalState` → `getLocalCalendarDay`). Phases A–C add **<9 MB** peak RSS across ~1,659 rows. Phase D alone adds **~427 MB**. **`getLocalCalendarDay()` constructs a new `Intl.DateTimeFormat` on every call**; binary-search day-boundary helpers call it **~17 times per search**, and `sanitizeStaleTemporalProse` invokes this path **~10× per row** (~16,247 formatter constructions per full sanitize pass).

**Diagnostic reuse of one cached formatter per timezone reduces peak RSS by ~99.9%** (441 MB → 0.6 MB for temporal-only workload).

**Dominant cause:** `INTL_TIMEZONE` — not metadata JSON, not RegExp classification, not URL/location fields.

---

## Step 1 — `normalizeInventoryItem()` call tree

```
normalizeInventoryItem(item, sourceName, sourceType)
├── metadata = item.metadata (by reference)
├── flattenMetadata(metadata)                    [shallow copy + nested key merge]
├── categoryFromItem(item, flat)                 [reads flat.opportunityCategory]
├── textBlob = join(topic, hook, script, JSON.stringify(metadata))  ⚠ large string per row
├── stringField(flat, …) ×4                      [venue, businessName, neighborhood, address]
├── detectFlags(item, sourceType, flat, category, textBlob)
│   ├── ingestFromMetadata
│   ├── boolFlag × many
│   ├── Set lookups (module-level, hoisted) ✓
│   └── WORLD_CUP_RE.test(textBlob)              [module-level RegExp ✓]
├── buildBadges(flags, category)
├── ingestFromMetadata(metadata)
├── sanitizeStaleTemporalProse({ text, startsAt, endsAt, timezone })  ⚠ HOT PATH
│   ├── evaluateTemporalState(...)             ⚠ HOT PATH
│   │   ├── resolveEffectiveEnd
│   │   │   └── endOfLocalCalendarDay → endOfLocalDayKey
│   │   │       └── getLocalCalendarDay × ~17   ⚠ new Intl.DateTimeFormat EACH call
│   │   └── startOfLocalCalendarDay
│   │       └── startOfLocalDayKey
│   │           └── getLocalCalendarDay × ~17   ⚠ new Intl.DateTimeFormat EACH call
│   ├── hasStaleCurrentnessClaim → evaluateTemporalState again
│   ├── parseLatestExplicitDateInText (if prose checks)
│   │   ├── new RegExp(MONTH_DAY_RE.source, 'gi')  ⚠ per call (2 RegExp)
│   │   └── new RegExp(NUMERIC_DATE_RE.source, 'g')
│   └── String.replace with module-level RegExp ✓
├── whyItMatters(flags, category, sourceName, ingest, title)
│   ├── inferContentFraming → isShoppingRetailContent
│   │   └── RETAIL_CHAIN_RE.test(title)          [module-level ✓]
│   ├── whyItMattersForFraming
│   └── isWorldCupSeasonActive()                 [Date compare, no Intl]
├── audienceScore(flags) → isWorldCupSeasonActive()
└── return InventoryItem { … toISOString() ×6, metadata by ref, flags object, … }
```

### Per-row construction flags

| Operation | Per-row? | Notes |
|-----------|----------|-------|
| `JSON.stringify(metadata)` | **Yes** | In `textBlob`; ~1 MB total retained, not RSS driver |
| `Intl.DateTimeFormat` | **Yes** | Via `getLocalCalendarDay()` — **dominant** |
| `new RegExp(...)` | **Yes** | 2× in `parseLatestExplicitDateInText` when prose path runs |
| `new URL()` | **No** | Not in normalize path |
| `structuredClone` | **No** | |
| Module-level RegExp/Set | Hoisted ✓ | `WORLD_CUP_RE`, category Sets |

**Employment intent:** Not called during normalization (runs at Home eligibility, not in `normalizeInventoryItem`).

---

## Step 2 — Phased microprofile (~1,659 projected rows, fresh process per phase)

| Phase | Description | Elapsed (ms) | Peak RSS Δ (KB) | heapUsed Δ (KB) | Cliff? |
|-------|-------------|-------------:|----------------:|----------------:|--------|
| **A** | Scalar mapping only | 63 | **+512** | +6,800 | — |
| **B** | + metadata + `JSON.stringify` textBlob | 107 | **+512** | +2,157 | — |
| **C** | + category + flag regex (`WORLD_CUP_RE`) | 99 | **+8,448** | +7,633 | — |
| **D** | + `evaluateTemporalState` only | 4,013 | **+426,880** | +8,542 | **YES** |
| **E** | + `sanitizeStaleTemporalProse` | 4,020 | **+430,208** | +8,883 | (same band) |
| **F** | + location/string fields | 4,096 | **+433,408** | +11,565 | (same band) |
| **G** | Full `normalizeInventoryItem` | 4,444 | **+433,152** | +11,946 | (same band) |

**Interpretation:** RSS jumps **~420 MB between phase C and phase D**. Phases E–G add no meaningful additional peak beyond temporal/summary work. Metadata, textBlob, and hoisted RegExp flags are **not** the hundreds-of-MB driver.

### Phase D sample trajectory
Peak reached at completion: **605,828 KB RSS** (+426,880 KB from ~179 MB baseline).

---

## Step 3 — Intl/timezone control

### Construction count (sanitize pass only, full row set)

| Metric | Value |
|--------|------:|
| Rows | 1,659 |
| `Intl.DateTimeFormat` constructions | **16,247** |
| Per-row average | **~9.8** |

Each construction allocates native formatter state; V8 RSS tracks these even when `heapUsed` grows only ~20–30 MB.

### Reuse control — `evaluateTemporalState` path only

| Variant | Peak RSS Δ | Elapsed (ms) |
|---------|----------:|-------------:|
| **Current** (`getLocalCalendarDay` → new formatter every call) | **+441,216 KB** | 6,221 |
| **Cached** (one `Intl.DateTimeFormat` per timezone, reused) | **+640 KB** | 117 |
| **Reduction** | **99.85%** | 50× faster |

**Conclusion:** Per-row `Intl.DateTimeFormat` construction in `getLocalCalendarDay()` is the measurable native/RSS hotspot. Caching formatters by timezone collapses peak RSS to baseline noise for the temporal workload.

---

## Step 4 — Other construction controls

### RegExp (`parseLatestExplicitDateInText`)

`sanitizeStaleTemporalProse` creates **2 new `RegExp` objects per call** to `parseLatestExplicitDateInText` when date parsing runs. Phase E peak (+430 MB) ≈ Phase D (+427 MB), so RegExp allocation is **not** the cliff. Module-level hoisting would be a micro-optimization only.

### URL / location

Phase F adds location field reads on top of phase E — **no additional RSS cliff** (+433 MB vs +430 MB). URL parsing is absent from normalize.

---

## Ranked hotspots by measured RSS contribution

| Rank | Hotspot | Peak RSS contribution | Confidence |
|------|---------|------------------------:|------------|
| **1** | `getLocalCalendarDay()` → new `Intl.DateTimeFormat` per call (via `evaluateTemporalState` / `sanitizeStaleTemporalProse`) | **~427–433 MB (~98%+ of normalize peak)** | **HIGH** |
| 2 | `JSON.stringify(metadata)` in textBlob | <1 MB retained; negligible RSS | HIGH |
| 3 | Per-call RegExp in `parseLatestExplicitDateInText` | Not measurable vs temporal cliff | MEDIUM |
| 4 | Flag/category RegExp (`WORLD_CUP_RE`, etc.) | ~8 MB incremental (phase C) | HIGH |
| 5 | Location/URL fields | ~0 incremental beyond E | HIGH |

---

## Smallest targeted production fix (not implemented)

**Cache `Intl.DateTimeFormat` instances in `getLocalCalendarDay()` (and optionally `localHourInTimezone` / `timezoneShortLabel`) keyed by timezone string** — module-level `Map<string, Intl.DateTimeFormat>`.

- Touches: `services/core/src/datetime.ts` (primary), benefits all callers of temporal-state and stale-temporal-prose
- Does **not** require forced GC, chunking, or column projection
- Expected: normalize peak RSS drops from ~430 MB toward single-digit MB (per diagnostic control)
- Secondary optional: hoist `monthRe`/`numRe` in `parseLatestExplicitDateInText` (minor)

---

## Classification

**INTL_TIMEZONE**

Not PRIMARY: TEXT_METADATA, REGEX_CLASSIFICATION, URL_LOCATION, TEMPORAL_OTHER (non-Intl), MULTIPLE

---

NORMALIZATION HOTSPOT: INTL_TIMEZONE  
PEAK CONTRIBUTION: ~427–433 MB RSS (~98% of normalize peak; +426,880 KB at phase D)  
CONFIDENCE: HIGH  
READY FOR TARGETED FIX / NEED MORE EVIDENCE: **READY FOR TARGETED FIX** — cache `Intl.DateTimeFormat` in `getLocalCalendarDay()`
