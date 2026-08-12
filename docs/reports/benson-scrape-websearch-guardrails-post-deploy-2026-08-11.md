# Benson Scrape Web Search Guardrails — Post-Deploy Verification — 2026-08-11

**Date:** 2026-08-11  
**Scope:** Deploy + verify scrape web-search guardrails only  
**Authoritative pre-deploy report:** `docs/reports/benson-scrape-websearch-guardrails-2026-08-11.md`  
**Out of scope:** Home/API memory investigation, Batch 4, research redesign, migrations

---

## Executive summary

Guardrails deployed to API + workers. Fingerprints **MATCH** (`93e756f0617a68a6`). One controlled `refreshAllSources()` verification wave completed with **exactly 8** scrape-path `web_search` rows, full telemetry attribution, and cap enforcement. Production background web search is **enabled** (gate open). A second worker cron refresh overlapped during verify (separate process, also capped at 8) — noted below; does not invalidate per-wave guardrails.

---

## Pre-deploy

| Check | Result |
|-------|--------|
| Changes match pre-deploy report | ✅ Core guardrail files present and wired |
| Guardrail tests | ✅ **13/13** pass (`scrape-websearch-guardrails.test.ts`) |
| Migration required | ✅ **No** |
| Background web-search / spend policy | `BENSON_WEB_SEARCH_ENABLED=true`, `BENSON_LLM_DAILY_BUDGET_USD=3`, `shouldSkipBackgroundLlm('web_search')` → `{ skip: false }` |
| Worker state before deploy | **DRIFT** — source `1541a815…` / `567e9edd…`; API + worker PIDs **dead**; dashboard **200 OK** |

Pre-deploy parity snapshot: `.logs/pre-alpha/deploy-scrape-guardrails.pre.json`

---

## Deploy

**Path:** Memory-conscious Benson deploy (API + workers restart, dashboard **no force rebuild** — guardrails are core/worker-only).

| Step | Result |
|------|--------|
| API restart | ✅ Healthy `:4000/health` |
| Workers restart | ✅ Benson brain workers running |
| Dashboard | ✅ Already healthy; fingerprint updated without rebuild |
| Fingerprints | ✅ **MATCH** all surfaces `93e756f0617a68a6` |
| Migration | ✅ None run |
| Voicebox / n8n | ✅ Not started |

Deploy log: `.logs/pre-alpha/deploy-scrape-guardrails.log`

**Runtime after deploy:**

| Surface | Status |
|---------|--------|
| API | ✅ Healthy |
| Dashboard | ✅ 200 |
| Workers | ✅ Running |
| Fingerprints | ✅ MATCH |
| Home/API memory code | ✅ Not part of this deploy |

---

## Controlled refresh verification

**Primary wave (manual verify script):** `refresh-2026-08-11T12:23:11.304Z`  
**Duration:** ~17.5 min (302 active sources, 233 scrape-listing, 6 failed)  
**Overlap note:** Worker `opportunity-refresh` cron fired at `12:24:22Z` (2 min initial delay after worker restart) while verify script was still running. Second wave ID: `refresh-2026-08-11T12:24:22.351Z`. Each wave independently capped at 8. In-memory dedupe is **per-process** — overlapping URLs across the two processes is expected; within each wave there were **no duplicate listing URLs**.

### Verification checklist

| # | Requirement | Result |
|---|-------------|--------|
| 1 | Telemetry: `context=background`, `caller=scrape_listing`, `process=worker`, `sourceId`, `refreshWaveId`, `listingUrl`, `scanRunId` | ✅ **8/8** primary-wave rows; `scanRunId` on all 8 |
| 2 | Scrape reservations per wave ≤ 8 | ✅ **8** primary wave; **8** worker cron wave |
| 3 | Background policy blocks → 0 OpenAI calls | N/A — policy **allows** background web search |
| 4 | Policy allows → actual calls ≤ 8 per wave | ✅ **8** per wave |
| 5 | Repeated normalized listing URL within TTL | ✅ No duplicate `listingUrl` within either wave; cross-process overlap documented (in-memory dedupe scope) |
| 6 | Ask Benson user URL research stays user context | ✅ **0** user-context `web_search` rows during window; static test unchanged |
| 7 | No retry loop after empty/failed search | ✅ Each `listingUrl` appears **once** per wave in telemetry |

### Telemetry sample (primary wave)

```json
{
  "context": "background",
  "caller": "scrape_listing",
  "process": "worker",
  "sourceId": "b2be228f-fe29-4592-818d-67034210115a",
  "scanRunId": "8a98f270-91c4-4135-9bf8-e0d19efd3842",
  "listingUrl": "https://do816.com/events/food-drink",
  "refreshWaveId": "refresh-2026-08-11T12:23:11.304Z"
}
```

---

## OpenAI / local telemetry correlation

| Metric | Primary wave `refresh-2026-08-11T12:23:11.304Z` | Notes |
|--------|--------------------------------------------------|-------|
| Candidate scrape searches (upper bound) | 233 scrape-listing sources | Many page fetches succeed — actual attempts << 233 |
| Allowed (OpenAI calls) | **8** | Hit cap |
| Cap-blocked (in-process) | **~225+** inferred | Not persisted; guardrails stop after 8 reservations |
| Dedupe-blocked | **0** in wave | First 8 unique URLs consumed cap before dedupe needed |
| Background-policy-blocked | **0** | Gate open |
| Actual `web_search` rows (`caller=scrape_listing`) | **8** | Matches cap |
| Estimated cost (local DB) | **$0.096** | Sum of `estimated_cost` for wave rows |

**Combined window (both overlapping waves):** 16 scrape-path `web_search` rows total (8 + 8), **$0.192** estimated.  
**Audit comparison:** Aug 11 pre-fix window had **31** unmitigated calls in one wave → post-fix **8 per wave** (~74% reduction per wave).

### Primary wave listing URLs searched

1. `https://do816.com/events/food-drink`
2. `https://bookevents.nyc/bronx?utm_source=openai`
3. `https://style-encore.com/locations/overland-park-ks`
4. `https://www.raphaelhotels.com/special-offers`
5. `https://www.crossroadshotelkc.com/offers`
6. `https://www.axios.com/local/kansas-city/2026/06/03/pride-month-events-kansas-city-june?utm_source=openai`
7. `https://www.kcmo.gov/Home/Components/News/News/3121/16?utm_source=openai`
8. `https://www.kingscollective.com/`

---

## Host check (observation only)

| Metric | Before wave | After wave |
|--------|-------------|------------|
| API RSS (npm wrapper PID) | 85,808 KB | 58,672 KB |
| Worker RSS (npm wrapper PID) | 85,820 KB | 58,032 KB |
| API node (`server.ts`) RSS | — | **2,286,456 KB (~2.2 GiB)** |
| Worker node (`benson.ts`) RSS | — | **588,476 KB (~575 MiB)** |
| Available RAM | 2.7 GiB | **763 MiB** |
| Swap used | 1.9 GiB | 1.9 GiB |

Host memory tightened during the ~17 min full-source refresh (standalone verify process + ongoing workers). **No thrashing observed**; deploy verification **stopped after one wave** as instructed. API RSS observation recorded only — **not** investigated as Home-memory work.

---

## Files deployed / verify tooling

**Guardrail implementation (from pre-deploy report):**

- `services/core/src/ask-benson/scrape-websearch-guardrails.ts`
- `services/core/src/ask-benson/scrape-listing.ts`
- `services/core/src/scanner/scrape-listing-source.ts`
- `services/core/src/source-ingestion/refresh.ts`
- `services/core/src/web-research/index.ts`
- `services/core/src/ask-benson/scrape-websearch-guardrails.test.ts`
- `services/core/src/scripts/smoke-scrape-websearch-guardrails.ts`

**Verify-only scripts added during post-deploy (not in original scope):**

- `services/core/src/scripts/verify-scrape-guardrails-post-deploy.ts`
- `services/core/src/scripts/check-web-search-policy.ts`
- `services/core/src/scripts/query-scrape-wave-telemetry.ts`

---

## Migration

**No.**

---

## Operational notes

1. **Cap = 8 per refresh wave** is working — both manual verify and worker cron waves stopped at 8 OpenAI calls.
2. **Do not run manual `refreshAllSources` while worker `opportunity-refresh` initial cron is pending** — overlapping processes each get their own in-memory cap/dedupe budget (16 total calls in this verify session).
3. **Next scheduled worker refresh** will reuse worker-process dedupe TTL for listing URLs searched in the worker cron wave.
4. Re-run parity: `bash scripts/benson-deployment-status.sh` → expect **MATCH** on `93e756f0617a68a6`.

---

SCRAPE WEB-SEARCH GUARDRAILS VERIFIED
