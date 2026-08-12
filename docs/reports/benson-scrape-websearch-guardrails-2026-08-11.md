# Benson Scrape Web Search Guardrails — 2026-08-11

**Date:** 2026-08-11  
**Scope:** OpenAI scrape-storm fix only (per `docs/reports/benson-openai-call-storm-audit-2026-08-11.md`)  
**Out of scope:** Home/API memory, partnership research redesign, deploy  
**Status:** Tests pass locally; deploy not performed

---

## Summary

Worker scrape/opportunity-refresh paths now pass explicit `context: 'background'`, `caller: 'scrape_listing'`, and `process: 'worker'` into `searchWeb` / `researchOpportunity`, so existing `shouldSkipBackgroundLlm('web_search')` budget gating applies. A per-refresh-wave cap, listing-URL dedupe TTL, and richer `llm_usage_events.metadata` reduce unbounded fan-out from failed page fetches.

---

## Files changed

| File | Change |
|------|--------|
| `services/core/src/ask-benson/scrape-websearch-guardrails.ts` | **New** — cap, dedupe, wave budget, `buildScrapeListingSearchOptions()` |
| `services/core/src/ask-benson/scrape-listing.ts` | `runGuardedScrapeSearch()` wraps fallback + enrich; passes background options |
| `services/core/src/scanner/scrape-listing-source.ts` | Opens/closes per-source wave when not nested; passes `scanRunId` |
| `services/core/src/source-ingestion/refresh.ts` | `refreshAllSources()` wraps batch in one shared refresh wave |
| `services/core/src/web-research/index.ts` | Extended `SearchWebOptions` + `recordLlmUsage` metadata fields |
| `services/core/src/ask-benson/scrape-websearch-guardrails.test.ts` | **New** — regression tests (13 cases) |
| `services/core/src/scripts/smoke-scrape-websearch-guardrails.ts` | **New** — controlled ~30-URL fixture (no OpenAI) |

**Not touched:** Home/API memory, Ask Benson user intake paths, partnership singleflight, migrations.

---

## Cap chosen and why

| Setting | Value | Rationale |
|---------|-------|-----------|
| `SCRAPE_WEB_SEARCH_PER_REFRESH_CAP` | **8** | Audit window: **31** unmitigated `web_search` calls across one post-reboot refresh wave (~30 sources). Cap **8** cuts worst-case spend ~74% while still allowing enrichment for the first sources that genuinely need fallback. Conservative enough for overnight refresh; tunable via constant without migration. |

Reservation happens **before** OpenAI; slots roll back only when `searchWeb` returns `skipped: true` (background gate / concierge cap).

---

## Dedupe / TTL rule

| Setting | Value | Behavior |
|---------|-------|----------|
| `SCRAPE_LISTING_URL_DEDUPE_MS` | **6 hours** | Same normalized listing URL is not web-searched again within window |

**Normalization:** lowercase host, strip hash, trim trailing slash on path. Query string preserved (exact path+query identity).

**Keys:**
- `page_fallback` — one key per normalized listing URL (covers failed-fetch fallback prompt)
- `opportunity_enrich` — separate key per listing URL + `slugify(title)` suffix (discount_watch enrich)

**Attempt semantics:** Dedupe recorded on **attempt** after `searchWeb` returns (success or failure). Empty/failed search does **not** retry within TTL. Background-gate skip releases cap slot and does **not** record dedupe.

**Wave scope:** `refreshAllSources()` shares one wave ID (`refresh-<ISO timestamp>`). Standalone `scanScrapeListingSource` opens a wave per scan run when not already nested.

---

## Telemetry (`llm_usage_events.metadata`)

No new migration — existing JSON `metadata` column extended at write time:

| Field | Source |
|-------|--------|
| `caller` | `'scrape_listing'` |
| `process` | `'worker'` |
| `sourceId` | scrape source UUID |
| `listingUrl` | normalized + truncated (240 chars) |
| `scanRunId` | scan run when available |
| `refreshWaveId` | refresh wave correlation ID |
| `context` | `'background'` (existing field) |

---

## Tests

```bash
cd services/core
pnpm exec tsx --test src/ask-benson/scrape-websearch-guardrails.test.ts
```

**Result:** 13/13 pass

| Test | Asserts |
|------|---------|
| Background options | `context`, `caller`, `process`, `sourceId`, `scanRunId`, `refreshWaveId`, `listingUrl` |
| URL normalization | Host case + trailing slash equivalence |
| Per-refresh cap | Blocks after 8 reservations |
| Listing dedupe | Same FIFA URL (slash variant) skipped |
| Failed search no retry | Confirm-on-attempt blocks second reservation |
| Telemetry fields | Full attribution on `buildScrapeListingSearchOptions` |
| Ask Benson user context | `collect-from-link.ts` has no scrape background options |
| Distinct listings | Multiple URLs allowed within cap |
| Fallback vs enrich keys | Independent dedupe buckets |
| Gate skip release | Cap slot restored on background skip |
| Nested waves | Inner `beginScrapeRefreshWave` reuses outer ID |
| Background gate | `searchWeb` with `context: 'background'` hits gate when disabled |
| User default context | Default `searchWeb` not blocked as background-only |

---

## Controlled fixture (no paid web search)

```bash
cd services/core
pnpm exec tsx src/scripts/smoke-scrape-websearch-guardrails.ts
```

**Output (2026-08-11):**

```json
{
  "fixtureSources": 30,
  "cap": 8,
  "allowed": 8,
  "dedupeBlocked": 0,
  "capBlocked": 22,
  "waveSearchCount": 8,
  "auditWindowUnmitigated": 31,
  "expectedAfterFix": 8,
  "paidOpenAiCalls": 0
}
```

Fixture uses representative audit URLs including duplicate FIFA entry. Dedupe for FIFA does not appear in this simulation because the duplicate URL is source #16 — cap blocks it before dedupe is evaluated. In a live sequential wave where FIFA is scraped twice within 6h, the second call would hit `listing_url_dedupe` instead of OpenAI.

---

## Migration

**No.** All guardrail state is in-process (wave counter + in-memory dedupe map). Telemetry uses existing `llm_usage_events.metadata` JSON.

---

## Expected calls — same ~30-source wave after fix

| Scenario | Before (audit) | After fix |
|----------|----------------|-----------|
| Full refresh wave, page-fetch failures | **~31** `web_search` (24 fallback + 6 enrich + 1 other) | **≤ 8** total scrape-path reservations per wave |
| FIFA duplicate URL (same wave + within 6h) | **2** | **1** (dedupe) |
| Background gate off (`shouldSkipBackgroundLlm`) | 0 skipped (used `context: 'user'`) | **0** OpenAI calls; reservations released |
| Ask Benson URL intake | User context (unchanged) | User context (unchanged) |
| discount_watch enrich | Counted per item, unbounded | Shares same **8** wave cap with fallbacks |

**Net expectation for Aug 11–style wave:** **8** paid `web_search` calls maximum (down from 31), plus **0** when background web search is disabled by spend policy.

---

## Deployment readiness

| Check | Status |
|-------|--------|
| Regression tests | ✅ 13/13 pass |
| Smoke fixture | ✅ 0 OpenAI calls |
| Migration required | ✅ None |
| Home/API memory | ✅ Not modified |
| Deploy performed | ❌ Intentionally not deployed |

**Pre-deploy checklist for operator:**
1. Merge + deploy worker + core (scrape paths run in worker)
2. Confirm `BENSON_WEB_SEARCH_ENABLED` / background spend policy as intended for production
3. After next refresh wave, verify `llm_usage_events` rows show `metadata.caller = scrape_listing`, `metadata.process = worker`, `metadata.refreshWaveId` populated
4. Confirm web_search row count per wave ≤ 8

---

READY FOR DEPLOY REVIEW
