# Benson OpenAI Call Storm Audit — 2026-08-11

**Date:** 2026-08-11  
**Mode:** Read-only audit (no code changes, no deploy, no migrations, no worker restarts for reproduction)  
**Focus window:** 2026-08-11 **01:00–01:20 America/Chicago** (= 06:00–06:20 UTC)  
**Observed symptom:** OpenAI Logs show repeated Responses API entries every ~30–90s with inputs like “Find events and opportunities from this p…” and “Find official information, dates, location, …”, many marked `<no output>`.  
**Host context:** Workers were stopped later due to memory pressure; API exhibited exit 137 (SIGKILL-class) and RSS ballooning overnight.

---

## Executive summary

The burst was a **confirmed call storm** driven by **worker scrape/opportunity-refresh**, not Ask Benson, Home, or partnership research. After a host reboot (~00:55 CDT), the stack came up and workers began a sequential scrape wave. When listing page fetches failed, each source triggered one OpenAI Responses `web_search_preview` call with the exact “Find events…” fallback prompt; discount_watch sources additionally triggered “Find official information…” via `researchOpportunity`. **31 web_search calls** in 20 minutes (~30 unique queries, 1 duplicate). This is **expected fan-out per source**, not a tight retry loop, but it **bypasses background spend gates** because scrape paths omit `context: 'background'`. API memory ballooning is **possibly related at the host level** (collateral OOM/thrashing) but **not directly caused** by these OpenAI calls (they run in the worker process).

---

## Exact matching prompt producers

### Sole Responses API emitter

All OpenAI Responses + `web_search_preview` calls flow through:

| Layer | Location |
|-------|----------|
| Function | `searchWeb()` |
| File | `services/core/src/web-research/index.ts` |
| API call | `client.responses.create({ model, tools: [{ type: 'web_search_preview' }], instructions, input: query })` |
| Telemetry | `recordLlmUsage({ source: 'web_search', metadata: { context, query, … } })` |

`researchOpportunity()` in the same file wraps `searchWeb` with the “Find official information…” template.

### Fragment A — “Find events and opportunities”

| Field | Value |
|-------|-------|
| **Exact string (scrape)** | `Find events and opportunities from this page or organization: ${listingUrl}. ${userMessage}` |
| **File / function** | `services/core/src/ask-benson/scrape-listing.ts` → `scrapeListingUrl` |
| **Trigger** | `fetchPageContent` fails or returns empty → fallback `searchWeb` |
| **Process (this window)** | **Worker** via `scanScrapeListingSource` → `scanner/index.ts` (type `scrape`) → `opportunity-refresh` worker |
| **Expected calls per source** | **1** when page fetch fails |
| **Retry policy** | **None** on `searchWeb` failure (returns empty, continues) |
| **Concurrency** | Sequential per source within refresh wave |
| **Singleflight / dedupe** | **None** for scrape web_search |
| **web_search tool** | Yes (`web_search_preview`) |
| **Caching** | **None** for Responses output |
| **Failed / no-output behavior** | Early return empty scrape result; no retry |

Alternate producer (not dominant in this window):

| Field | Value |
|-------|-------|
| **String** | `Find events and opportunities from ${researchSubject}. ${userMessage}` |
| **File** | `services/core/src/ask-benson/collect-from-link.ts` → `collectOpportunitiesFromLink` |
| **Process** | **API** (Ask Benson URL intake) |
| **Window evidence** | No Ask Benson research POSTs; only `GET /api/ask-benson/conversations` |

### Fragment B — “Find official information, dates, location, and ticket/event links”

| Field | Value |
|-------|-------|
| **Exact string** | `Find official information, dates, location, and ticket/event links for: ${title — business — location — year}` |
| **File / function** | `services/core/src/web-research/index.ts` → `researchOpportunity` |
| **Scrape caller** | `scrape-listing.ts` when `webResearchAttempted < webResearchLimit` |
| **webResearchLimit** | `1` for `discountWatch` sources; `0` for normal scrape (`scrape-listing-source.ts`) |
| **Process (this window)** | **Worker** |
| **Expected calls per extracted item** | Up to **1** per item when limit allows |
| **Singleflight** | **None** (partnership path has singleflight; scrape does not) |

### Other producers (capable but not window drivers)

| Producer | Process | Why excluded from window |
|----------|---------|--------------------------|
| Ask Benson link/image/lookup enrich | API | No research POSTs in window |
| Creator partnership research (6×) | API | 0 partnership rows/activities; no `researchRunId` in telemetry |
| Benson Discovery cron | Worker | Different query shape; background-gated |
| Curator / early-signals verification | Worker/API | Different prompt text |
| Concierge / source-health / sponsor contact | API/Worker | Different prompts; not matching counts |

---

## Producer documentation (checklist)

For each scrape-path producer in this window:

| Check | Result |
|-------|--------|
| Duplicate research jobs | **No** — one refresh wave, distinct URLs |
| Overlapping research waves | **No** — single post-reboot wave |
| Retry loops | **No** — `searchWeb` has no retry; 1 FIFA URL duplicate across wave |
| Home request fan-out | **No OpenAI** — Home does not call `searchWeb`; separate API load |
| Discovery refresh fan-out | **Not primary** — prompts match scrape-listing only |
| Expired/stale lease recovery | **N/A** — partnership singleflight unused |
| One opportunity → multiple identical searches | **Rare** — FIFA URL ×2 only |
| Retries after timeout without cancel | **No evidence** |
| Browser/PWA Home re-request loop | **Yes for Home HTTP** (cancels/timeouts) — **not** these OpenAI prompts |
| One API request → many OpenAI searches | **No** for these prompts |
| Missing singleflight on non-partnership paths | **Yes** — scrape fallback unguarded |
| `<no output>` in OpenAI Logs | **Explained below** — tool-heavy Responses; local usage still recorded |

---

## Time window correlation

### Timezone

| Source | Format |
|--------|--------|
| Host / Postgres `llm_usage_events.created_at` | UTC stored; converted to CDT for timeline |
| `watchdog.log` / `boot.log` | ISO with `-05:00` (America/Chicago) |
| Window | **01:00–01:20 CDT = 06:00–06:20 UTC** |

### Pre-window context

| Time (CDT) | Event |
|------------|-------|
| ~00:55:50 | Host reboot |
| ~00:57:52 | Benson boot (migrations, start API + workers + dashboard) |
| ~00:58:15 | API listening |
| ~00:58:17 | Stack healthy |

Workers **were running** throughout the window (watchdog, heartbeats, continuous `llm_usage_events`).

---

## Timeline 01:00–01:20 CDT

Format: **CDT time** → caller → prompt type → entity (from query) → web_search → status/notes

| CDT | Caller | Prompt | Entity / URL (truncated) | Tool | Notes |
|-----|--------|--------|--------------------------|------|-------|
| 01:01:00 | worker/scrape_listing | Find events… | kingscollective.com | web_search_preview | First post-window search |
| 01:01:43 | worker/scrape_listing | Find events… | kcmo.gov | web_search_preview | |
| 01:02:25 | worker/scrape_listing | Find events… | axios.com/local/kansas-city | web_search_preview | |
| 01:03:44 | worker/scrape_listing | Find official… | Advance Purchase Offer — Crossroads Hotel | web_search_preview | discount_watch enrich |
| 01:03:57 | worker (contact) | Other | Marché Days — Do Good Co contact | web_search_preview | Non-template row |
| 01:03:57 | worker/scrape_listing | Find official… | Open Interviews for Hiring | web_search_preview | |
| 01:04:01 | worker/scrape_listing | Find events… | raphaelhotels.com | web_search_preview | Peak minute (6 calls) |
| 01:04:11 | worker/scrape_listing | Find events… | do816.com/events/food-drink | web_search_preview | |
| 01:04:39 | worker/scrape_listing | Find official… | AAA Members Save Up To 10% | web_search_preview | |
| 01:04:53 | worker/scrape_listing | Find events… | fifa.com (world cup) | web_search_preview | |
| 01:04:57 | worker/scrape_listing | Find events… | unation.com/fifa-fan | web_search_preview | |
| 01:04:59 | worker/scrape_listing | Find events… | axios.com (repeat source) | web_search_preview | Different path than 01:02 |
| 01:05:28 | worker/scrape_listing | Find events… | thefarmhousekc.com | web_search_preview | |
| 01:05:35 | worker/scrape_listing | Find official… | The Pigeon Comes to Kansas City | web_search_preview | |
| 01:05:45 | worker/scrape_listing | Find events… | savers.com/weekly-specials | web_search_preview | |
| 01:05:51 | worker/scrape_listing | Find official… | Weekly Meal Deals — Price Chopper | web_search_preview | |
| 01:06:40 | worker/scrape_listing | Find events… | do816.com/events | web_search_preview | |
| 01:08:00 | worker/scrape_listing | Find official… | Marché Days Pop-Up | web_search_preview | |
| 01:08:39 | worker/scrape_listing | Find events… | do816.com/venues/ameristar | web_search_preview | source-health heartbeat ~01:11 |
| 01:08:56 | worker/scrape_listing | Find events… | axs.com (event) | web_search_preview | |
| 01:09:26 | worker/scrape_listing | Find events… | do816.com/venues/hollywood-cas | web_search_preview | |
| 01:10:27 | worker/scrape_listing | Find events… | axs.com/hadestown | web_search_preview | |
| 01:10:55 | worker/scrape_listing | Find events… | axs.com/kaleo | web_search_preview | |
| 01:10:58 | worker/scrape_listing | Find events… | nordstromrack.com | web_search_preview | Last search before API kill gap |
| 01:11:24 | watchdog | — | — | — | **api=false workers=true** |
| 01:11:xx | api | — | — | — | **API exit 137**; LLM gap |
| 01:11:58 | api | — | — | — | API restarted pid 13457 |
| 01:12–01:14 | — | — | — | — | **0 LLM rows**; content updates continue |
| 01:15:03 | worker/scrape_listing | Find events… | axios.com | web_search_preview | Wave resumes |
| 01:15:43 | worker/scrape_listing | Find events… | ubereats.com/toastique | web_search_preview | |
| 01:16:17 | worker/scrape_listing | Find events… | anthropologie.com | web_search_preview | |
| 01:16:43 | worker/scrape_listing | Find events… | storage.googleapis.com | web_search_preview | |
| 01:17:01 | worker/scrape_listing | Find events… | fifa.com | web_search_preview | **Duplicate query** (2nd in window) |
| 01:18:07 | worker/scrape_listing | Find events… | corner.inc | web_search_preview | |
| 01:18:23 | worker/scrape_listing | Find events… | wanderlog.com | web_search_preview | |
| 01:19:56 | worker/scoring | opportunity_scoring | batchSize 12 | chat/completion | Not web_search |
| ~01:20:03 | worker | opportunity-refresh | — | — | last_success_at (just after window) |
| ~01:22 | api | — | — | — | Second API exit 137 (after window) |

**researchRunId / partnershipId / contentItemId:** Not present in `llm_usage_events.metadata` for any row in this window.  
**OpenAI request IDs:** **Not persisted** on successful Responses calls (see below).

### Parallel API / Home activity (same window)

| Signal | Count / behavior |
|--------|------------------|
| `/api/pre-alpha/home` (api.log) | Multiple overlapping requests; completions 45–389s |
| Cloudflared cancels on home | 9 canceled in 01:00–01:20 |
| Ask Benson research POST | **None** |

---

## Cost / volume

Source: `llm_usage_events` (local DB), window 06:00–06:20 UTC.

| Metric | Value |
|--------|-------|
| Total `web_search` rows | **31** |
| “Find events and opportunities…” | **24** |
| “Find official information…” | **6** |
| Other web_search | **1** |
| Unique queries | **30** |
| True duplicate queries | **1** (fifa.com tournament URL ×2) |
| `opportunity_scoring` | **1** |
| Stored estimated cost (window) | **~$0.37** (sum of `estimated_cost` in DB; not re-priced from OpenAI dashboard) |
| Logical jobs | **~1** opportunity-refresh scrape wave across ~30 sources/items |
| Approx calls per logical job | **~31 calls / 1 wave ≈ 31 per refresh cycle** (sequential, not parallel burst) |

Pricing beyond stored estimates was **not** recomputed from OpenAI billing.

---

## Process ownership (proof)

| Evidence | Finding |
|----------|---------|
| Prompt text “from this page or organization” | **Unique to** `scrape-listing.ts` (not Ask Benson link intake) |
| Watchdog 01:11:24 CDT | `workers=true`, `api=false` during API death |
| `llm_usage_events.metadata.process` | **Absent** (all rows `(none)`) — telemetry gap |
| `metadata.context` | **All `user`** — scrape omitted `context: 'background'` |
| Ask Benson API traffic | List conversations only |
| Partnership tables | 0 updates in window |
| Heartbeats | discovery, expired-event-sweep, curator-watchlist, gmail-inbox, source-health active |

**Conclusion:** OpenAI call storm **owned by worker scrape/opportunity-refresh**, concurrent with but **not caused by** Home OpenAI usage (Home does not emit these prompts).

---

## Singleflight / dedupe coverage

| Path | Singleflight | URL dedupe | Background gate |
|------|--------------|------------|-----------------|
| Creator partnership research | Yes (`research-singleflight.ts`) | Terminal reuse 7d | N/A (user context) |
| Scrape listing `searchWeb` fallback | **No** | **No** | **Bypassed** (default `context: 'user'`) |
| Scrape `researchOpportunity` | **No** | Per-item limit only | **Bypassed** |
| Ask Benson link intake | **No** | URL extract dedupe | User context (intentional) |

Background gate (`shouldSkipBackgroundLlm('web_search')`) applies only when `options.context === 'background'`. Scrape paths pass **no options**, so worker refresh searches run as **`user`** context and skip the gate.

---

## `<no output>` explanation

OpenAI dashboard `<no output>` on Responses rows commonly means:

1. **Tool-first turn** — `web_search_preview` runs before/instead of visible assistant text.
2. **Empty `output_text`** — Local code reads `response.output_text` and message parts; if empty, `summary` is null but **`recordLlmUsage` still runs** on successful `responses.create`.
3. **No retry** — Failed or empty enrich does not re-call OpenAI from `searchWeb`.

Local code does **not** persist OpenAI `response.id` or `req_*` on success. Error paths may capture `req_*` in structured logs only.

---

## OpenAI request ID persistence

| Location | Persists OpenAI request ID? |
|----------|----------------------------|
| `llm_usage_events` | **No** (query, context, optional caller fields only) |
| Successful `web_search` metadata | **No** `researchRunId` / `partnershipId` / `contentItemId` in this window |
| Error classifiers | May extract `req_*` from error text only |
| Day-wide sample (00:00–12:00 UTC) | **0 / 155** rows contain `req_*` |

**Cannot correlate** OpenAI Log request IDs to local rows for successful calls in this audit.

---

## Memory-pressure relationship

### Question

Do repeated OpenAI calls plausibly explain API RSS growing from ~300 MB after restart to ~4–5 GB?

### Evidence reviewed

| Factor | Assessment |
|--------|------------|
| Process running `searchWeb` | **Worker** (`tsx src/benson.ts`), not API |
| `searchWeb` retention | Returns parsed summary + citations; no global response cache in module |
| No retry loop | Calls complete and release; usage row inserted |
| API concurrent load | Multiple overlapping `/api/pre-alpha/home` (45–389s); 9 cloudflared cancels |
| API deaths | Exit **137** at ~01:11 and ~01:22 CDT (SIGKILL-class; often OOM/cgroup) |
| Host | Swap pressure reported overnight; workers + API + Cursor on 8 GB |

### Classification

| Link | Verdict |
|------|---------|
| Direct cause of API heap balloon | **UNRELATED** — OpenAI calls not in API process |
| Host-level thrashing → API SIGKILL | **POSSIBLE** — worker OpenAI + heavy Home + reboot spike |
| Retained OpenAI response bodies in API | **No evidence** in code path |

**MEMORY LINK: POSSIBLE** (collateral host pressure); not a direct API memory leak from these Responses calls.

---

## Smallest recommended correction

| # | Type | Change |
|---|------|--------|
| 1 | **Code** | Pass `{ context: 'background', caller: 'scrape_listing', process: 'worker' }` from `scrape-listing.ts` into `searchWeb` / `researchOpportunity` so `shouldSkipBackgroundLlm('web_search')` and daily caps apply. |
| 2 | **Code** | Cap scrape web_search fallbacks per refresh run (e.g. max N per cycle) and skip repeat listing URL within TTL. |
| 3 | **Code** (telemetry) | Persist `caller`, `process`, `sourceId`, `listingUrl` (truncated) in `recordLlmUsage.metadata` for attribution. |
| 4 | **Ops** | Keep workers **off** on 8 GB host overnight until (1)+(2), or disable background web search via env if other workers needed. |

**Correction type:** Primarily **code** + **ops**; no migration required for gating.

---

## Workers off pending fix?

| Recommendation | Rationale |
|----------------|-----------|
| **Yes for overnight / unattended** | Post-reboot refresh will re-fire ~30+ web_search calls per wave; cost + host thrash |
| **Daytime live testing OK** | If web_search gated/capped or workers limited to non-scrape tasks |

---

## Risks (if unfixed)

- Repeat **call storms** after every reboot or 6h opportunity-refresh
- OpenAI Logs appear as a **loop** though behavior is sequential fan-out
- Continued **host memory pressure** on 8 GB box
- **Telemetry blind spot** — cannot attribute spend to source without metadata fixes

---

## Artifacts consulted

| Artifact | Path / table |
|----------|----------------|
| Web research emitter | `services/core/src/web-research/index.ts` |
| Scrape fallback | `services/core/src/ask-benson/scrape-listing.ts` |
| Scanner wiring | `services/core/src/scanner/scrape-listing-source.ts` |
| LLM telemetry | Postgres `llm_usage_events` |
| API log | `.logs/pre-alpha/api.log` |
| Watchdog | `.logs/pre-alpha/watchdog.log` |
| Boot | `.logs/pre-alpha/boot.log` |

---

ROOT CAUSE: Post-reboot worker opportunity-refresh scrape wave issued sequential OpenAI Responses web_search_preview calls for failed listing page fetches (and a few researchOpportunity enrichments), using default context=user which bypasses background spend gates—not an Ask Benson/Home retry loop.
CALL STORM: CONFIRMED
MEMORY LINK: POSSIBLE
READY FOR FIX PLAN
