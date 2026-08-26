# Benson Alexa — what-should-kellie-post latency fix

**Date:** 2026-08-24  
**Scope:** Make `GET /api/benson-voice/what-should-kellie-post` fit the existing 2.5s Lambda→Benson budget while preserving exact `postToday` semantics.  
**Not done:** Today zero-yield, eligibility/scoring changes, sponsor leak, Alexa intents, AWS/Alexa/Cloudflare deploy.

---

## 1. Pre-fix timing breakdown (read-only profile)

Measured against current ~525-row ingested inventory (2121 raw retention rows before JS filters).

| Stage | Approx ms | Notes |
|---|---:|---|
| DB query (`inventoryLoadContentItemSelect`) | ~367 | 2121 raw rows; ~2.3MB meta+script+hook |
| Normalize only (2121 rows) | ~926 | |
| `loadIngestedInventoryItems()` end-to-end | ~1960–3025 | normalize + freshness + creator-facing + skip |
| `passesTodayEligibility` alone on ~523 items | ~2429 | Dominant CPU inside Command Center |
| Active filter (home + today OR things-to-do) | ~1617 | |
| `computeCommandCenter()` full | ~1973–4130 | All ranked sections |
| Voice shape (includes CC) | ~3333 | Pre-fix path |
| **End-to-end old voice path** | **~6.2–7.2 s** | Exceeds 2.5s Lambda budget |

### Root cause

1. **Full inventory load** (~2–3s) for every voice call.  
2. **`computeCommandCenter` on all ~523 items** (~2–4s), dominated by repeated `passesTodayEligibility` while ranking sections voice does not need.

Not a giant DB audit issue — payload size matters, but eligibility CPU on the full set was the larger share.

---

## 2. Existing reuse options inspected

| Option | Finding |
|---|---|
| **A. Existing Command Center / inventory snapshot + invalidation** | No trustworthy in-process Command Center snapshot / data-revision cache for inventory Today. Ask Benson chat cache is unrelated. **Not used.** |
| **B. Existing narrow loader for postToday fields** | Weekend voice has targeted calendar/list loaders; no existing postToday inventory narrow loader. Shared `inventoryLoadContentItemSelect` already omits raw payloads. |
| **C. Voice-specific READ-ONLY prefilter** | **Selected.** |

Caching was considered and **rejected** as the primary fix — a safe narrow read removes the 6s path without hiding it behind TTL.

---

## 3. Optimization selected

**C — voice READ-ONLY narrow path**, then the same authoritative Command Center:

1. **SQL prefilter (conservative / when uncertain keep)**  
   Same ingested retention + mock exclusions, plus:
   - discovered/created on server-local today, **or**
   - `event_starts_at` in server-local today..tomorrow (broader than JS timely; no audienceScore gate in SQL)
   - exclude `lifecycle_status IN ('expired','archived')`

2. **Shared finalize pipeline** (`finalizeIngestedInventoryRows`) — same normalize / audience-fresh / creator-facing / skip filters as `loadIngestedInventoryItems`.

3. **`filterPossiblePostTodayCandidates`** — exported from `command-center.ts`, uses the **exact same** `isToday` / `isWithinDays` / Sipps exclusion prerequisites as `isEligiblePostToday` (not a second score; not a second Today-eligibility interpreter).

4. **`computeCommandCenter(items, { sections: ['postToday'], limit: 4 })`** — ranking still runs through existing `rankSection(..., isEligiblePostToday, scorePostToday, ...)`. Other sections skipped for CPU only.

### Confirmations

- Authoritative source remains **`computeCommandCenter(...).sections.postToday`**.
- **`scorePostToday` was NOT duplicated.**
- Empty authoritative `postToday` remains empty (current live state).

---

## 4. Files changed

| Path | Change |
|---|---|
| `services/core/src/inventory/command-center.ts` | `filterPossiblePostTodayCandidates`; optional `sections` on `computeCommandCenter` |
| `services/core/src/inventory/load-ingested.ts` | Extract `finalizeIngestedInventoryRows` for shared post-query pipeline |
| `services/core/src/inventory/index.ts` | Export `filterPossiblePostTodayCandidates` |
| `services/core/src/benson-voice-read/load-post-today-voice-candidates.ts` | **New** narrow SQL + finalize + timely prefilter |
| `services/core/src/benson-voice-read/what-should-kellie-post.ts` | Use narrow loader; CC `sections: ['postToday']` |
| `services/core/src/benson-voice-read/index.ts` | Exports |
| `services/core/src/benson-voice-read/what-should-kellie-post-parity.test.ts` | **New** parity test vs full path |

Alexa adapter / interaction model: **untouched**.

---

## 5. Parity methodology

**Old authoritative path**

```
loadIngestedInventoryItems()
→ computeCommandCenter(full, { limit: 4 })
→ sections.postToday
```

**Optimized path**

```
loadPostTodayVoiceInventoryCandidates(now)
→ computeCommandCenter(candidates, { limit: 4, sections: ['postToday'] })
→ sections.postToday
```

Assert identical for live durable inventory:

- candidate count  
- candidate IDs + order  
- titles / reasons / when / area / homeFilmable  

Also assert voice shaping over full vs optimized candidates matches (existing voice housekeeping gate unchanged).

If authoritative count is 0, optimized must remain 0.

---

## 6. Parity results

| Check | Result |
|---|---|
| Live durable postToday IDs/order | **Exact match** (`[]` = `[]`) |
| Structured fields | **Exact match** |
| Voice-shaped output | **Exact match** |
| Zero-result preserved | **Yes** |

Automated: `what-should-kellie-post-parity.test.ts` — pass.

---

## 7. Live performance proof (read-only)

Connection warmed with `select 1`. Then:

| Call | Elapsed |
|---|---:|
| **Old full path** (load + full CC) | **7155 ms** |
| Optimized **first** | **124 ms** |
| Optimized repeat 1 | 110 ms |
| Optimized repeat 2 | 117 ms |
| Optimized repeat 3 | 121 ms |
| Optimized repeat 4 | 144 ms |
| Optimized repeat 5 | 124 ms |

| Metric (5 repeats) | ms |
|---|---:|
| min | 110 |
| max | 144 |
| average | 123 |

| Output | Value |
|---|---|
| Returned count | **0** |
| Old path IDs | `[]` |
| Optimized IDs | `[]` |
| Parity exact | **true** |
| Speech | `I don't have a strong content post for Kellie right now.` |

**Acceptance:** all optimized calls ≪ 1.5s preferred and ≪ 2.5s hard Lambda budget. No timeout increase.

---

## 8. Tests

| Suite | Result |
|---|---|
| `services/core` `src/benson-voice-read/*.test.ts` | **38 passed / 0 failed** (includes prior what-should-kellie-post + new parity) |

Alexa suite: not required (response contract unchanged).

---

## 9. Safety confirmations

| Requirement | Status |
|---|---|
| No eligibility / scoring / content-quality changes | Confirmed |
| No LLM / web / search / scrape / research | Confirmed |
| No Calendar projection / Gmail / Instagram sync | Confirmed |
| No durable writes | Confirmed |
| No AWS / Alexa / Cloudflare deployment | Confirmed |
| Current zero-result not artificially changed | Confirmed |
| Voice-only housekeeping phrase filter unchanged | Confirmed (still applied after CC) |

---

## 10. OUT OF SCOPE findings (documented only)

1. **`passesTodayEligibility` → `no_specific_today_reason` zero-yield** — still true on durable inventory; not fixed here.  
2. **Sponsor/email housekeeping can still enter core `postToday`** — not fixed; voice phrase gate unchanged.  
3. Full `loadIngestedInventoryItems` + full Command Center remain expensive for Home/Today UI — separate from this voice path.

---

## 11. Next architectural option (if needed later)

Not required now. If inventory timely-SQL ever returns thousands of rows on a busy day, consider a tighter SQL bound still using Command Center day helpers, or a revision-keyed short TTL cache with existing invalidation — only if profiling shows regression. Do **not** raise the Lambda timeout as the primary fix.
