# Benson API Memory Audit — 2026-08-11

**Date:** 2026-08-11  
**Mode:** Read-only audit (no code changes, no deploy, no build, no migrations)  
**Workers:** OFF during primary memory tests  
**Problem:** API RSS grows from ~300 MB post-restart to 2–5 GB; Home requests 40–389 s; API exit 137 (OOM-kill class)

---

## Executive summary

A **single** `GET /api/pre-alpha/home` request raised API Node RSS from **~164 MB → ~1,125 MB** (+**~965 MB**) in ~28 s. Memory **remained elevated** (>1.1 GB) minutes later with no further requests — not a transient spike fully returned to OS.

The Home handler `computePreAlphaHome()` fans out **six parallel branches**, three of which each call `loadIngestedInventoryItems()` (full DB materialization of ~5k rows → ~538 eligible items) and **three** call `computeTopSponsorCandidates()` → `computeSponsorIntelligence()` on the full inventory. `softTimeout()` **does not cancel** underlying work when clients time out or cloudflared cancels — orphaned Home computations continue and overlap.

Overnight logs show **multiple concurrent** `/api/pre-alpha/home` requests (45 starts vs 35 completions in current `api.log`), durations **45–389 s**, and **Exit status 137** after long-running Home batches — consistent with **overlapping Home materialization** on a **7.6 GiB** host already under swap pressure.

---

## Step 1 — Clean baseline (workers OFF)

| Metric | T0 (post-restart) | T+2 min idle |
|--------|-------------------|--------------|
| API wrapper PID | 294497 | 294497 |
| API Node PID (`server.ts`) | 294644 | 294644 |
| Node RSS | 163,760 KB (~**160 MB**) | 163,760 KB (~**160 MB**) |
| VmData | 211,508 KB | stable |
| VmSwap | 0 KB | 0 KB |
| System available RAM | 3.5 GiB | 3.9 GiB |
| Swap used | 2.1 GiB / 4.0 GiB | 2.1 GiB |

**Idle drift:** None over 2 minutes. Baseline stable ~**160 MB**.

---

## Step 2 — Single request tests

Workers OFF throughout. Wait **30 s** after each request before sampling RSS.

| # | Request | HTTP | Wall time | Response size | RSS before | RSS +30 s | Δ RSS |
|---|---------|------|-----------|---------------|------------|-----------|-------|
| 1 | `GET /health` | 200 | 2 ms | 159 B | 160 MB | 160 MB | **~0** |
| 2 | `GET /api/ask-benson/conversations?limit=20` | 200 | 24 ms | 25 KB | 160 MB | 160 MB | **~0** |
| 3 | `GET /api/pre-alpha/home` **(once)** | 200 | **28.5 s** | 25 KB | 160 MB | **1,125 MB** | **+965 MB** |

**T+5 min after Home (no further requests):** RSS **1,154 MB** — memory **retained**, not released to baseline.

**Decision:** Stopped broad request testing after Home (per instructions).

---

## Step 3 — Home producer call tree

### Route entry

```
GET /api/pre-alpha/home
  services/api/src/routes/pre-alpha.ts
    computePreAlphaHome({ demoMode, excludeCategories })
      services/core/src/pre-alpha/home.ts
```

**No request cancellation:** Route awaits full `computePreAlphaHome()`; no `AbortSignal`, no Hono abort handling. Client/proxy cancel **does not stop** backend work.

**`softTimeout()` behavior:** On timeout, returns fallback to caller but **does not abort** the underlying promise — work continues in the background until completion.

### Top-level fan-out (`computePreAlphaHome`)

```
Promise.all([
  softTimeout(computePreAlphaStatus(),           8s,  'status'),
  softTimeout(computeActionCenter(...),         20s,  'action_center'),
  softTimeout(computePipelineDashboard(now),    12s,  'pipeline'),
  softTimeout(computeOperationalHomeData(...),  35s,  'operational'),
  softTimeout(computeStudioPulse(),             12s,  'studio_pulse'),
  softTimeout(buildSpendSummary(7),              8s,  'ai_spend'),
])
then: softTimeout(getOutreachSendConfig(), 6s)
then: optional resolveSponsorBriefingLink (1 DB/link resolve)
```

| Branch | File | DB / network | Data size / count | Cache | Concurrency | Timeout | Cancel-safe | Retained after response |
|--------|------|--------------|-------------------|-------|-------------|---------|-------------|-------------------------|
| **status** | `pre-alpha/status.ts` | DB `SELECT 1`; `getOutreachSendConfig()` | tiny | none | parallel | 8s soft | **No** — continues if timed out | fallback only; work may continue |
| **action_center** | `action-center/hub.ts` → `collect.ts` | **See below** | large | none | parallel | 20s soft | **No** | full arrays until GC |
| **pipeline** | `sponsor-pipeline/opportunities.ts` | open opportunities + aggregates | moderate | none | parallel | 12s soft | **No** | yes until GC |
| **operational** | `pre-alpha/operational-home.ts` | **See below** | **largest** | none | parallel | 35s soft | **No** | yes until GC |
| **studio_pulse** | `pre-alpha/studio-pulse.ts` | **See below** | large | none | parallel | 12s soft | **No** | yes until GC |
| **ai_spend** | `llm-spend/index.ts` | `llm_usage_events` aggregate 7d | small | none | parallel | 8s soft | **No** | yes until GC |

### `computeOperationalHomeData()` tree

```
computeOperationalHomeData()
├── loadIngestedInventoryItems()                    [DB: ~4991 rows → ~538 eligible]
├── loadExcludedPlannerContentIds()                 [DB]
├── loadSkippedContentIdsForItems(items)            [DB]
├── filterHomeEligibleItems + excludedIds Set
├── computeCommandCenter(items, limit 5)            [in-memory: 8 sections × rank scans over ~538 items]
└── Promise.all([
      listSourceRegistry(),                         [DB: ~302 active sources]
      getLastLiveRefreshSummary(),                  [DB]
      computeTopSponsorCandidates(homePool, 8),     [CPU+RAM: full sponsor intel on pool]
      listSponsorOpportunities({ openOnly: true }), [DB]
      listSponsorContacts(),                        [DB: 140 rows]
      listOutreachEmails('queue'),                  [DB]
      countConnectedAnalyticsConnectors(),          [DB]
    ])
├── countNewItemsSince(refreshBatch.lastRefreshAt) [DB]
└── rank/merge helpers (topEvents, openings, askBensonToday, mergePriorityCards)
```

### `loadIngestedInventoryItems()` (shared hot path)

| Property | Value |
|----------|-------|
| File | `inventory/load-ingested.ts` |
| Query | Full `content_items` LEFT JOIN `sources` WHERE ingested + retention window; **all columns** including `metadata`, `rawPayload`, `script` |
| DB rows scanned | **4,991** ingested (`content_items` with `source_id`) |
| After in-memory filters | **538** (`metrics.contentItems` in live Home response) |
| Caching | **None** |
| Module/global cache | **None** (only static category Sets in normalize/scoring) |
| Called per Home request | **≥3 times in parallel** (operational + action_center + studio_pulse) |

### `computeTopSponsorCandidates()` → `computeSponsorIntelligence()`

| Property | Value |
|----------|-------|
| Files | `sponsor-intelligence/top-candidates.ts`, `recommendations.ts` |
| Input | Full `InventoryItem[]` passed from caller |
| Work | `loadContactLookup()` (all sponsor_contacts); optional `computePlatformDashboard('tiktok')`; map **every active eligible item** to `SponsorRecommendation`; **5 section rankings** with repeated `activeItems.find()` (O(n²) churn) |
| Called per Home request | **3×** (operational limit 8, action_center in collect, studio_pulse limit 3) |
| Caching | **None** |
| Network | TikTok dashboard path may hit analytics DB only (no OpenAI in this path) |

### `computeActionCenter()` → `collectActionCenterItems()`

| Property | Value |
|----------|-------|
| File | `action-center/collect.ts` |
| First line | `loadIngestedInventoryItems()` — **2nd full inventory load** |
| Parallel batch | planner map, contacts, outreach queue, intake rows, draft rows, pipeline opps, **listOutreachInboundMessages(20)** (DB only, not live Gmail) |
| Also | `computeTopSponsorCandidates(ingestedForSponsors)` for sponsor cards |
| Maps built | `ingestedById`, `categoryByContentId`, title map — all in-memory per request |

### `computeStudioPulse()`

| Property | Value |
|----------|-------|
| File | `pre-alpha/studio-pulse.ts` |
| Parallel | awaiting approval, **listOutreachInboundMessages(50)** (DB), TikTok context, milestone, **`loadIngestedInventoryItems()` + computeTopSponsorCandidates(3)** — **3rd inventory load**, outreach config, pitch_ready/researching counts |
| Gmail | **DB read only** in this path (`listOutreachInboundMessages`); live Gmail sync is worker cron, not awaited here |
| Degraded logs | `[pre-alpha/home] studio_pulse degraded: studio_pulse_timeout_12000ms` — timeout returns empty pulse but **pulse work may continue** |

### DB scale reference (live DB)

| Table | Count |
|-------|------:|
| `content_items` (ingested) | 4,991 |
| `content_items` (total) | 5,006 |
| JSON column bytes (metadata+raw_payload+script, sum) | ~7.6 MB |
| `sponsor_contacts` | 140 |
| Active sources (registry) | ~302 |

---

## Step 4 — Overnight correlation (2026-08-11 ~01:00–01:25 America/Chicago)

**Log source:** `.logs/pre-alpha/api.log`, `.logs/pre-alpha/watchdog.log`, `.logs/pre-alpha/dashboard.log`

### Concurrent Home traffic

From `api.log` around post-reboot load (timestamps ~05:58–06:20 UTC ≈ 00:58–01:20 CDT):

| Evidence | Detail |
|----------|--------|
| Overlapping starts | Lines 624, 650, 665, 689: **four** `<-- GET /api/pre-alpha/home` before completions |
| Long completions | `337s`, `389s`, `198s`, `209s` within same window (lines 785–805) |
| Session totals | **45** Home request starts vs **35** completions in current log → up to **~10 in-flight** |
| Exit 137 | Lines 248, 947, 1260 — API process killed (SIGKILL/OOM class) |
| Watchdog | `api=false dashboard=true workers=true` during 06:01–06:17 CDT window; boot retries |

### Canceled requests / continued execution

| Finding | Evidence |
|---------|----------|
| Proxy failures | `dashboard.log`: `ECONNRESET`, `socket hang up` proxying `/api/pre-alpha/home` |
| API-side cancel | **None** — no abort handling in `preAlphaRoute.get('/home')` |
| softTimeout orphans | Log lines: `action_center degraded`, `studio_pulse degraded`, `ai_spend degraded`, `status degraded` — caller got fallback but **underlying branches not cancelled** |
| Conclusion | **Yes** — canceled/slow client Home requests likely **continued executing** concurrently with new Home requests, multiplying memory |

---

## Step 5 — Process sanity

| Check | Result |
|-------|--------|
| Duplicate API `server.ts` Node | **1** instance (PID 294644 during test) |
| Workers during test | **OFF** (confirmed) |
| Orphan worker `benson.ts` | **None** during test |
| Dashboard `next start` | 1 chain (legacy npm/pnpm wrappers from earlier session) |
| Stale duplicate API | **None killed** — single API listener on :4000 |

**Note:** Earlier production state showed API RSS **~2.2 GiB** with workers + verify script running — consistent with this audit's Home-triggered growth, not a duplicate-process artifact.

---

## Classification

| Code | Assessment | Evidence strength |
|------|------------|-------------------|
| **A** Single Home sub-operation blowup | **Partial** — no single function alone explains +965 MB; triple inventory + triple sponsor intel fan-out is the unit | HIGH |
| **B** Overlapping Home requests multiply memory | **Primary overnight killer** | HIGH |
| **C** Module/global cache leak | **Unlikely** — no unbounded module Maps found; static category Sets only | LOW |
| **D** Orphan/duplicate processes | **Not primary** — single API node | LOW |
| **E** Large DB/result materialization | **Primary per-request driver** — 3× full inventory load + sponsor intel on ~538-item pool from ~5k row fetch | HIGH |
| **F** Unresolved async after cancel/timeout | **Confirmed** — `softTimeout` does not abort; orphaned branches | HIGH |
| **G** Other | Host swap pressure (2.4 GiB used) amplifies 137 | MEDIUM |
| **H** Insufficient evidence | Not applicable for main thesis | — |

**Strongest suspects (ordered):**

1. **`computePreAlphaHome()` parallel fan-out** with **3× `loadIngestedInventoryItems()`** on ~5k-row fetch
2. **3× `computeSponsorIntelligence()`** on the same inventory per request
3. **`softTimeout` without cancellation** → overlapping Home requests keep all branches alive after client/proxy timeout
4. **PWA/dashboard concurrent Home polling** during slow responses (45 starts / 35 ends)

---

## Retained memory vs temporary peak

| Observation | Interpretation |
|-------------|----------------|
| +965 MB after one Home; **1.1 GB+** minutes later | V8 heap retained after large allocations; not returned to OS (typical) + possibly orphaned in-flight work from softTimeout branches |
| Response JSON only **25 KB** | Memory blowup is **server-side materialization**, not response payload |
| `/health` and Ask Benson list flat | Problem is **Home-specific**, not general API |

---

## Smallest next diagnostic (fix phase — not done here)

1. **One-request profiling:** add temporary timing + heap delta logs around each `computePreAlphaHome` branch (or run Node `--inspect` heap snapshot before/after single Home).
2. **Concurrency probe:** log active Home handler count; confirm overlap count during PWA session.
3. **Abortion test:** verify whether `studio_pulse` / `action_center` promises still complete after softTimeout (timestamp log at start/end of each branch).

**Smallest fix direction (for later):**

- Single shared `loadIngestedInventoryItems()` per Home request (pass into branches)
- Single sponsor-intel pass reused by operational / action_center / studio_pulse
- Replace `softTimeout` with **`AbortSignal`**-aware cancellation or request-scoped dedupe/mutex on Home
- Cap concurrent Home executions to **1**

---

## Can Benson run safely tonight?

| Configuration | Assessment |
|-----------------|------------|
| **Workers ON** | Scrape guardrails help OpenAI; **does not fix API Home memory**. Risky on 7.6 GiB host with swap already hot. |
| **Workers OFF** | Removes worker RSS (~500 MB–1 GB) but **PWA Home alone can still push API to 1–2+ GB** per overlapping requests → **137 risk remains**. |
| **Pragmatic tonight** | Workers **OFF** + **avoid mobile Home refresh loops** + **restart API** before demo/sleep + monitor RSS. **Not safe** for unattended overnight with current Home traffic patterns. |

---

## Files referenced (read-only)

- `services/core/src/pre-alpha/home.ts` — `computePreAlphaHome`, `softTimeout`
- `services/core/src/pre-alpha/operational-home.ts` — `computeOperationalHomeData`
- `services/core/src/inventory/load-ingested.ts` — full inventory load
- `services/core/src/action-center/collect.ts` — second inventory load
- `services/core/src/pre-alpha/studio-pulse.ts` — third inventory load
- `services/core/src/sponsor-intelligence/recommendations.ts` — sponsor intel materialization
- `services/api/src/routes/pre-alpha.ts` — Home route (no abort)

---

ROOT CAUSE: `GET /api/pre-alpha/home` (`computePreAlphaHome`) materializes the full ingested inventory and sponsor-intelligence graph multiple times per request in parallel, and overlapping/canceled requests continue orphaned work via non-cancelling `softTimeout`, multiplying RSS until OOM (exit 137).

MEMORY TRIGGER: `GET /api/pre-alpha/home` → `computePreAlphaHome()` → triple `loadIngestedInventoryItems()` + triple `computeSponsorIntelligence()`

CONFIDENCE: **HIGH**

READY FOR FIX
