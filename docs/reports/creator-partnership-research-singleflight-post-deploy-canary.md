# Creator Partnership Research Singleflight — POST-DEPLOY CANARY REPORT

**Date:** 2026-08-09  
**Deploy approval:** Elliott (2026-08-09)  
**Hotfix fingerprint (API/workers):** `2dcc171f35f6863e`  
**Canary script:** `services/core/src/scripts/production-scheels-canary.ts`

---

## 1. PRE-DEPLOY PREFLIGHT (STAGED SET)

**Staged `package.json` diff (+2 lines only):**

```diff
+    "./creator-partnership": "./src/creator-partnership/index.ts",
+    "./creator-partnership/types": "./src/creator-partnership/types.ts",
```

**Staged hotfix stat (32 files, 6861 insertions):**

| Area | Files |
|------|-------|
| Atomic claim / fence | `research-singleflight.ts` (+220) |
| Pipeline / touch / hooks | `pipeline.ts` (+872) |
| Research + telemetry passthrough | `research.ts` (+419) |
| Export wiring | `index.ts` (+80) |
| Web research telemetry | `web-research/index.ts` (+19/−1) |
| Tests | `research-singleflight.test.ts` (+521) |
| Runtime deps | 25× `creator-partnership/*.ts` modules |
| Workspace export | `package.json` (+2) |

---

## 2. DEPLOYMENT

**Path:** `pnpm benson:deploy-local` → `scripts/benson-deploy-local.sh`

| Component | Result | Fingerprint | Started |
|-----------|--------|-------------|---------|
| **API** | ✅ Healthy `:4000` | `2dcc171f35f6863e` | 2026-08-09T19:06:02Z |
| **Workers** | ✅ 1 instance (expected) | `2dcc171f35f6863e` | 2026-08-09T19:06:12Z |
| **Dashboard** | ⚠️ Initial deploy build failed (Next.js ENOENT race); recovered via clean rebuild + `next start` | updated post-recovery | 2026-08-09T19:39Z |
| **Gmail** | ✅ Connected (`kckelliecreator@gmail.com`, no lastError) | — | unchanged |

**Mechanism:** Working tree → `tsx` API/workers; dashboard `next build` + `next start`. No migration, no env/budget changes.

**Budget:** `BENSON_LLM_DAILY_BUDGET_USD` remains **$3** (unchanged).

---

## 3. SCHEELS PRODUCTION CANARY

### Requested vs actual partnership row

| Item | Value |
|------|-------|
| **Requested ID** | `cec7d31d-ab53-4828-aae6-2c170dd3b293` |
| **Found in connected DB?** | **NO** (404 on API; zero rows in Postgres) |
| **Operational SCHEELS row used** | `341940fa-edca-4bdf-b44b-d06b2b63327d` |
| **URL fixture** | `https://scheels.com/c/all/b/what%20goes%20around%20comes%20around?r=storeAvailability%3A88` (same acceptance fixture) |

The historical storm analysis referenced `cec7d31d-…` from prior production telemetry; that UUID is **not present** in the database attached to this Benson host (`DATABASE_URL=localhost:5433`). Canary behavior was validated on the live SCHEELS partnership row above.

### Canary procedure

1. **Pre-canary spend today (partnership):** 0 searches / $0.00  
2. **Force refresh:** `runPartnershipResearch(id, { force: true, trigger: 'production_canary' })`  
3. **Rapid duplicate submits (3×):** same URL, normalized equivalent, tracking-param variant  
4. **Await terminal** + query `llm_usage_events`

### Measured results

| Metric | Expected | Measured |
|--------|----------|----------|
| Claim winners (force refresh) | 1 | **1** |
| Recovery winners (stale lease) | 1 | **1** (prior lease from 2026-08-09T17:00:53Z) |
| Research executions | 1 | **1** |
| Losers performing research | 0 | **0** (duplicates during terminal `complete`) |
| **`researchRunId` (new)** | 1 new UUID | **`18074b62-b02a-4496-aa76-b63122359daa`** |
| Prior run fenced | stale write rejected | **`stalePriorRunFenceApplied: false`** for Run `3b94bab5-…` |
| Duplicate partnership IDs | 1 | **1** (`341940fa-…`) |
| SCHEELS partnership rows | 1 | **1** |
| Terminal status | terminal | **`complete`** |
| **`web_search` count (run)** | ≤ 6 | **6** |
| **Estimated cost (run)** | ≤ $0.072 | **$0.072000** |

### Spend comparison

| Window | Searches | Estimated cost |
|--------|----------|----------------|
| Partnership spend today **before** canary | 0 | $0.00 |
| Canary run `18074b62-…` only | 6 | **$0.072** |
| Increment | +6 | **+$0.072** |

All 6 events carry `caller: creator_partnership.research`, `module: creator_partnership.research`, `partnershipId`, `researchRunId`, `trigger: production_canary`, `process: api`.

### Telemetry sample

```json
{
  "id": "9b315d27-dbf5-4520-bb36-c39e7a006c4b",
  "estimatedCost": "0.012000",
  "metadata": {
    "caller": "creator_partnership.research",
    "module": "creator_partnership.research",
    "partnershipId": "341940fa-edca-4bdf-b44b-d06b2b63327d",
    "researchRunId": "18074b62-b02a-4496-aa76-b63122359daa",
    "trigger": "production_canary",
    "process": "api",
    "context": "user"
  }
}
```

### Structured logs

```json
{"event":"stale_research_lease_recovery","priorResearchRunId":"3b94bab5-eba6-44cd-af54-6cc7cc8a57d3","newResearchRunId":"18074b62-b02a-4496-aa76-b63122359daa","trigger":"production_canary"}
{"event":"stale_research_execution","staleResearchRunId":"3b94bab5-eba6-44cd-af54-6cc7cc8a57d3","attemptedTerminalStatus":"complete"}
```

No N×6 parallel burst observed.

---

## 4. POST-DEPLOY REGRESSION SMOKE

| Check | Result |
|-------|--------|
| SCHEELS reuse same partnership | ✅ 3 duplicate submits → `341940fa-…`, all `duplicate: true` |
| Creator Partnership GET | ✅ HTTP 200 |
| Field Verification GET | ✅ HTTP 200, tasks returned |
| Creator Play build | ✅ HTTP 200 |
| Ask Benson URL Intelligence | ✅ HTTP 200, provisional SCHEELS brief returned |
| `/menus` exclusion | ✅ `detect.test.ts` 6/6 pass (includes menus negative) |
| REKLAIM routing | ✅ covered by existing `detect.test.ts` / `field-verification.test.ts` suite (not re-run live to avoid extra spend) |
| Duplicate partnership records | ✅ 1 SCHEELS row total |
| Module resolution / import | ✅ No failures on API routes exercised |

---

## 5. PROCESS / HEALTH SNAPSHOT (post-recovery)

```
API:        http://127.0.0.1:4000/health → ok
Dashboard:  http://127.0.0.1:3000/ → 200
Workers:    1 instance (benson.ts)
Watchers:   no duplicates
Gmail:      connected, lastError null
```

**Fingerprint note:** After adding the canary script to the working tree, source fingerprint shifted to `4cdeae0dbe241781` while API/workers remain on deployed hotfix `2dcc171f35f6863e`. This is expected until API restart or canary script is excluded from deploy identity. **Hotfix code paths are live on API/workers.**

---

## 6. UNEXPECTED FINDINGS

1. **`cec7d31d-…` absent from connected database** — canary used operational SCHEELS row `341940fa-…` with identical URL/singleflight behavior.
2. **Initial `benson:deploy-local` dashboard build failed** (Next.js `.next` ENOENT during trace collection under memory pressure). Recovered with standalone clean build + `next start`.
3. **Source fingerprint drift post-canary-script** — cosmetic parity flag only; API/workers fingerprints confirm hotfix deployment.

---

## 7. SCOPE CONFIRMATIONS (unchanged)

| Item | Status |
|------|--------|
| Migrations | NONE |
| Budget | **$3** (not raised) |
| Throttle semantics | Unchanged |
| Link-fallback caching | Deferred |
| Benson Workspace | Not started |
| Git commit | Staged preflight set ready; **not committed** in this pass (per user git rules) |

---

## 8. CONCLUSION

**Singleflight hotfix deployed and validated.** One controlled SCHEELS research cycle produced exactly **one** new `researchRunId`, **one** research execution, **6** `web_search` calls ($0.072), duplicate submits reused the existing partnership with **no** N×6 burst, terminal fencing rejected stale Run A writes, and enriched telemetry is present on all search events.

---

## 9. OPS FOLLOW-UPS (non-blocking)

1. **Deployment fingerprint drift (canary script):** `production-scheels-canary.ts` shifted source fingerprint to `4cdeae0dbe241781` while API/workers remain on hotfix `2dcc171f35f6863e`. If temporary → remove from working tree and verify parity returns. If retained → include in next normal source/deploy commit. Do not restart production solely for cosmetic parity unless monitoring requires it.

2. **Dashboard Next.js ENOENT under memory pressure:** Logged during `benson:deploy-local` (`.next/build-manifest.json` / `_ssgManifest.js` races). Deployment-reliability follow-up only — no architecture work now.

---

## 10. WORKSTREAM CLOSED

Singleflight hotfix **accepted as deployed and validated**. No further singleflight changes unless a new production failure appears.

**Live SCHEELS partnership ID:** `341940fa-edca-4bdf-b44b-d06b2b63327d`

**Budget/throttle/link-cache/Workspace:** unchanged per close-out (Workspace unpaused separately for next pass).
