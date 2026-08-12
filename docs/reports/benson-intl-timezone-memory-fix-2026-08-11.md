# Benson Intl Timezone Formatter Cache Memory Fix — 2026-08-11

**Date:** 2026-08-11  
**Scope:** Cache `Intl.DateTimeFormat` in `getLocalCalendarDay()` and related helpers  
**Status:** Verified locally — **DO NOT DEPLOY YET**  
**Authoritative audit:** `docs/reports/benson-normalization-hotspot-audit-2026-08-11.md`

---

## Root cause (confirmed)

`getLocalCalendarDay()` constructed a new `Intl.DateTimeFormat` on every call. Temporal normalization (`evaluateTemporalState` → binary-search day boundaries → `sanitizeStaleTemporalProse`) invoked this **~10× per row**, producing **~16,247 formatter constructions** for ~1,659 rows and **~427 MB RSS** with only **~20 MB heap** growth.

---

## Implementation

### File changed (this fix)

| File | Change |
|------|--------|
| `services/core/src/datetime.ts` | Module-level formatter cache + reuse in `getLocalCalendarDay`, `localHourInTimezone`, `timezoneShortLabel`, `getCreatorNowClock` |
| `services/core/src/datetime-formatter-cache.test.ts` | **New** — 11 focused tests |

### Cache design

```typescript
const FORMATTER_CACHE_MAX = 64;
const formatterCache = new Map<FormatterCacheKey, Intl.DateTimeFormat>();
```

**Cache key:** `locale + NUL + timeZone + NUL + stableOptionsKey(options)`  
- `stableOptionsKey` = sorted `JSON.stringify` of option entries  
- Distinguishes `en-CA` calendar-day vs `en-US` hour vs `timeZoneName: short` formatters

**Eviction:** When size ≥ 64, delete oldest Map entry (FIFO). Benson uses a tiny timezone set in practice (`America/Chicago`, metadata timezones, `UTC`).

**Test helpers (not used in production):** `clearDateTimeFormatCacheForTests()`, `getDateTimeFormatCacheSizeForTests()`

**Not changed:** `formatIsoDateTime` / `formatIsoDate` (`toLocaleString` paths), lifecycle/freshness rules, forced GC, migrations, datetime API shapes.

---

## Tests

| Suite | Result |
|-------|--------|
| `datetime-formatter-cache.test.ts` | **11/11 pass** (new) |
| `datetime.test.ts` | pass |
| `temporal-state.test.ts` | pass |
| `load-ingested-projection.test.ts` | **7/7 pass** |
| `home-memory-stabilization.test.ts` | **10/10 pass** |
| **Combined run** | **39/39 pass** |

Coverage includes: cache reuse, America/Chicago, UTC, America/New_York, DST spring/fall, invalid timezone throws, `evaluateTemporalState` unchanged, `sanitizeStaleTemporalProse` unchanged.

---

## Temporal diagnostic (after fix)

Workers OFF, `normalization-hotspot-audit.ts`, fresh process per phase.

| Phase | Before fix peak RSS Δ | After fix peak RSS Δ | Change |
|-------|----------------------:|---------------------:|--------|
| **D** `evaluateTemporalState` | +426,880 KB | **+19,968 KB** | **−95.3%** |
| **G** full `normalizeInventoryItem` | +433,152 KB | **+26,112 KB** | **−94.0%** |

| Metric | Before | After |
|--------|-------:|------:|
| `Intl.DateTimeFormat` constructions (full sanitize pass) | 16,247 | **0** |
| Phase D elapsed | 4,013 ms | **185 ms** |
| Phase G elapsed | 4,444 ms | **387 ms** |

Peak is now in the **cached-control range** (~640 KB–20 MB), not ~441 MB.

---

## Full Home API verification (workers OFF, clean API restart)

### Single Home request

| Metric | Original audit | Pre-Intl fix (latest) | **Post-Intl fix** |
|--------|---------------:|----------------------:|------------------:|
| Baseline API RSS | ~160 MB | ~199 MB (149,188 KB ps / 148,776 KB telemetry) | **~146 MB** (149,188 KB ps) |
| Post-Home RSS | ~1,125 MB | ~1,197 MB (+998 MB) | **~262 MB (+119 MB)** |
| Post-Home +30s RSS | ~1,125 MB retained | ~919 MB | **~193 MB (+49 MB)** |
| Post-Home +5m RSS | — | — | **~201 MB (+57 MB)** |
| Home wall time | ~28.5 s | ~21.3 s | **6.2 s** |
| Response size | ~25 KB | ~26 KB | **26,679 B** |
| inventoryLoadCount | ≥3 (pre-stabilization) | 1 | **1** |
| sponsorIntelComputeCount | ≥3 | 1 | **1** |

API telemetry (single Home):

```json
{"event":"home_computation_finished","inventoryLoadCount":1,"sponsorIntelComputeCount":1,"elapsedMs":6200,"rssBeforeKb":148776,"rssAfterKb":266892}
```

**RSS improvement vs pre-Intl fix:** +998 MB → **+118 MB** (~**88% reduction**)  
**Latency improvement vs pre-Intl fix:** 21.3 s → **6.2 s** (~**71% faster**)  
**Latency improvement vs original audit:** 28.5 s → **6.2 s** (~**78% faster**)

### Two concurrent Home requests

| Check | Result |
|-------|--------|
| HTTP | Both **200**, **26,679 B**, identical JSON |
| Singleflight | **1 started + 1 joined** (`home_computation_joined`) |
| Underlying inventory/intel | `inventoryLoadCount: 1`, `sponsorIntelComputeCount: 1` |
| Concurrent wall time | **4.4 s** (both completed together) |
| RSS delta from ~206 MB baseline | **+43 MB** (248,260 KB telemetry peak) |

---

## Dirty tree — what to include in deployment (not deploying yet)

### Include — Intl formatter cache (**this fix**)

| Path | Why |
|------|-----|
| `services/core/src/datetime.ts` | Root-cause fix; **material RSS + latency win** |
| `services/core/src/datetime-formatter-cache.test.ts` | Regression coverage |

### Include — Home singleflight / shared work (prior investigation, independently useful)

| Path | Why |
|------|-----|
| `services/core/src/pre-alpha/home.ts` | Singleflight + shared inventory/sponsor snapshot |
| `services/core/src/pre-alpha/home-computation-metrics.ts` | Observability |
| `services/core/src/pre-alpha/operational-home.ts` | Accept shared snapshot |
| `services/core/src/pre-alpha/studio-pulse.ts` | Accept shared snapshot |
| `services/core/src/action-center/hub.ts`, `collect.ts` | Accept shared snapshot |
| `services/core/src/sponsor-intelligence/top-candidates.ts` | Reuse precomputed intel |
| `services/core/src/pre-alpha/home-memory-stabilization.test.ts` | Regression tests |

Prevents overlapping Home requests from multiplying inventory/normalize work (OOM multiplication under concurrency).

### Include — inventory column projection (harmless query cleanup)

| Path | Why |
|------|-----|
| `services/core/src/inventory/inventory-load-projection.ts` | Explicit SELECT columns |
| `services/core/src/inventory/load-ingested.ts` | Uses projection |
| `services/core/src/inventory/normalize.ts` | `InventoryNormalizeSource` type |
| `services/core/src/inventory/load-ingested-projection.test.ts` | Regression tests |

**Classification:** **Retain** — correct contract, drops unused `raw_payload`/video columns from query; measured **~0.6% RSS improvement alone** but reduces DB payload and documents load contract. Harmless alongside Intl fix.

### Exclude from runtime deployment

| Path | Why |
|------|-----|
| `services/core/src/scripts/*memory*`, `*hotspot*`, `*normalization*` | Diagnostic only |
| `docs/reports/benson-*-2026-08-11.md` | Audit artifacts |

**Do not blindly deploy entire dirty tree** — review unrelated modified files in `git status` outside the lists above before any release.

---

## Smallest targeted production fix (delivered)

Cache `Intl.DateTimeFormat` by `(locale, options)` in `datetime.ts`. No forced GC, no chunking, no Home redesign.

---

## Verdict

| Criterion | Met? |
|-----------|------|
| Material RSS reduction | **Yes** (~+1 GB → ~+119 MB single Home) |
| Material latency reduction | **Yes** (~21–28 s → ~6 s) |
| Semantics preserved | **Yes** (tests + unchanged temporal/prose outputs) |
| Concurrent singleflight | **Yes** |
| Ready for deploy review | **Yes** (scoped subset of dirty tree) |

**DO NOT DEPLOY YET** — awaiting explicit deploy approval with scoped file list above.

---

NORMALIZATION HOTSPOT: INTL_TIMEZONE (addressed)  
PEAK CONTRIBUTION FIXED: ~427 MB → ~20 MB temporal phase RSS  
CONFIDENCE: HIGH  
READY FOR TARGETED FIX / NEED MORE EVIDENCE: **READY FOR DEPLOY REVIEW** (Intl cache + recommended companion changes listed above)
