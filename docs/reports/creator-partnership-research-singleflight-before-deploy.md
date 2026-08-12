# Creator Partnership Research Singleflight — BEFORE-DEPLOY REPORT (Evidence)

**Date:** 2026-08-09  
**Plan:** [`docs/plans/creator-partnership-research-singleflight-hotfix.md`](../plans/creator-partnership-research-singleflight-hotfix.md)  
**Author:** Implementation agent (pre-deploy evidence collection)  
**Deploy status:** NOT DEPLOYED — awaiting Elliott approval  
**Production SCHEELS canary:** NOT RUN (`cec7d31d-ab53-4828-aae6-2c170dd3b293`)

---

## 1. FILES CHANGED

Hotfix-specific files (this slice only; repo has broader unrelated dirty state):

| File | Lines | Description |
|------|------:|-------------|
| `services/core/src/creator-partnership/research-singleflight.ts` | 217 | **New** — atomic claim, lease recovery, fenced terminal writes, helpers |
| `services/core/src/creator-partnership/research-singleflight.test.ts` | 440+ | Postgres concurrency, fencing, lease, `pg_input_is_valid` cases, **e2e 20× submit search-count test** |
| `services/core/src/creator-partnership/pipeline.ts` | 865+ | Claim-first research, fenced writes, touch metadata preserve for active `researchRunId`, internal test hooks |
| `services/core/src/creator-partnership/research.ts` | 419 | Telemetry passthrough to `searchWeb`, injectable `searchWeb` for tests, `PARTNERSHIP_RESEARCH_SEARCH_TARGET_COUNT = 6` |
| `services/core/src/creator-partnership/index.ts` | (modified) | Re-exports claim/fence helpers and lease constants |
| `services/core/src/web-research/index.ts` | +18 / −1 | Extended `SearchWebOptions`; enriched `recordLlmUsage` metadata |
| `services/core/src/scripts/url-intelligence-sync-latency.ts` | 86 | **New** — latency script; all submit loops use internal `skipResearch` |
| `services/core/src/scripts/url-intelligence-smoke.ts` | 255 | **New** — staging smoke; dedupe loops use `skipResearch`; polls in-flight research |
| `docs/plans/creator-partnership-research-singleflight-hotfix.md` | 594 | Plan updated to implemented / before-deploy state |
| `reports/creator-partnership-research-singleflight-before-deploy-2026-08-09.md` | (draft) | Earlier checklist-oriented draft (superseded by this document) |

**Git summary (tracked diff for web-research only):**

```
 services/core/src/web-research/index.ts | 19 ++++++++++++++++++-
 1 file changed, 18 insertions(+), 1 deletion(-)
```

**Note:** Runtime `creator-partnership` module and hotfix paths are **staged in git** (`git add`, not yet committed). `services/core/package.json` export for `./creator-partnership` remains **modified but unstaged** — required at commit time for workspace resolution on any host that deploys from git.

---

## 2. SHIPPED ATOMIC CLAIM

**Implementation:** `claimPartnershipResearch()` in `services/core/src/creator-partnership/research-singleflight.ts`.

**PostgreSQL version (deploy target):** **PostgreSQL 16.14** (`docker-compose.yml`: `pgvector/pgvector:pg16`). Safe timestamp validation uses native **`pg_input_is_valid(text, 'timestamptz')`** (PG 14+; verified on PG 16).

**Exact WHERE predicate (as shipped after blocker fix):**

```sql
WHERE cp.id = p.id AND cp.id = $partnershipId
AND (
  cp.research_status IN ('queued', 'failed')

  OR (
    cp.research_status IN ('complete', 'needs_verification')
    AND (
      $force = true
      OR (p.research->>'researchedAt') IS NULL
      OR NOT pg_input_is_valid(p.research->>'researchedAt', 'timestamptz')
      OR (
        pg_input_is_valid(p.research->>'researchedAt', 'timestamptz')
        AND (p.research->>'researchedAt')::timestamptz
            < now() - make_interval(secs => $staleSecs)
      )
    )
  )

  OR (
    cp.research_status = 'researching'
    AND (
      cp.metadata->>'researchStartedAt' IS NULL
      OR NOT pg_input_is_valid(cp.metadata->>'researchStartedAt', 'timestamptz')
      OR (
        pg_input_is_valid(cp.metadata->>'researchStartedAt', 'timestamptz')
        AND (cp.metadata->>'researchStartedAt')::timestamptz
            < now() - make_interval(secs => $leaseSecs)
      )
    )
  )
)
```

**Safe malformed / ISO-shaped-invalid handling:**

- **`pg_input_is_valid(..., 'timestamptz')` returns `false`** for garbage, `2026-99-99T25:61:61`, `2026-02-31T12:00:00` — **without throwing** (verified in psql on PG 16).
- Invalid values are treated as **expired/recoverable** in the same atomic `UPDATE` (no app-layer read/check/write race).
- **`::timestamptz` cast runs only when `pg_input_is_valid` is true**, so invalid ISO-shaped strings never reach a throwing cast.

**App-layer helpers** (`isResearchLeaseExpired`, `shouldAttemptPartnershipResearch`) still use regex + `Date.parse` for touch/submit *attempt* decisions only; authoritative lease ownership remains the SQL claim above.

**Touch-path metadata preserve (discovered via e2e test):** `touchExistingPartnershipSource` metadata UPDATE now merges with:

```sql
metadata = $newMeta::jsonb || CASE WHEN research_status = 'researching' THEN
  jsonb_strip_nulls(jsonb_build_object(
    'researchRunId', metadata->'researchRunId',
    'researchStartedAt', metadata->'researchStartedAt'
  )) ELSE '{}'::jsonb END
```

This prevents parallel source touches from wiping active `researchRunId` / `researchStartedAt` during an in-flight research cycle (which had caused false lease-recovery storms in the e2e test).

---

## 3. SHIPPED TERMINAL FENCE

**Success path:** `completePartnershipResearchFenced()` — used for `complete` and `needs_verification` terminal writes from `runPartnershipResearch`.

**Failure path:** `failPartnershipResearchFenced()` → delegates to `completePartnershipResearchFenced` with `researchStatus: 'failed'`.

**Exact WHERE (both paths):**

```typescript
eq(creatorPartnerships.id, partnershipId)
AND eq(creatorPartnerships.researchStatus, 'researching')
AND sql`${creatorPartnerships.metadata}->>'researchRunId' = ${researchRunId}`
```

**All three terminal outcomes require the active `researchRunId`:**

| Terminal status | Function | Fenced |
|-----------------|----------|--------|
| `complete` | `completePartnershipResearchFenced` | Yes |
| `needs_verification` | `completePartnershipResearchFenced` | Yes |
| `failed` | `failPartnershipResearchFenced` → same fence | Yes |

**Stale execution (0 rows updated):**

- `applied: false` returned to caller
- Structured warn log: `stale_research_execution_terminal_write` with `staleResearchRunId`, `attemptedTerminalStatus`
- Caller exits without overwriting `research`, `decisionBrief`, or status (`runPartnershipResearch` returns early when `!terminal.applied`)

**Measured fencing tests (Postgres, 2026-08-09T18:08:01Z):**

| Test | Rows updated |
|------|-------------|
| Run A success write after Run B owns row | **0** (`applied: false`) |
| Run A failure write after Run B owns row | **0** (`applied: false`) |

Run B remained `research_status = 'researching'` with `metadata.researchRunId = runB` unchanged after both stale attempts.

---

## 4. LEASE

| Item | Value |
|------|-------|
| **`RESEARCH_LEASE_MS`** | `30 * 60 * 1000` = **1,800,000 ms = 30 minutes** |
| **Deployed code location** | `services/core/src/creator-partnership/research-singleflight.ts` line 11 |
| **SQL usage** | `$leaseSecs = RESEARCH_LEASE_MS / 1000` → `make_interval(secs => 1800)` |

**Storage (metadata-only, no migration):**

| Field | Location |
|-------|----------|
| `researchRunId` | `creator_partnerships.metadata.researchRunId` (JSON string) |
| `researchStartedAt` | `creator_partnerships.metadata.researchStartedAt` (JSON ISO string) |

Set atomically on every successful claim (including recovery).

---

## 5. REAL POSTGRES CONCURRENCY RESULTS

**Test file:** `services/core/src/creator-partnership/research-singleflight.test.ts`  
**Command:** `node --import tsx --test src/creator-partnership/research-singleflight.test.ts`  
**Latest run:** 2026-08-09T18:38:53Z — **17/17 PASS**, duration **44.4s**  
**Postgres environment:** Local dev **PostgreSQL 16.14** (`pgvector/pgvector:pg16`); connection `postgres://social_agent@localhost:5433/social_agent` (`.env`; **not production**).

| Scenario | Attempts | `claimed: true` | `claimed: false` | Query throws |
|----------|----------|-----------------|------------------|--------------|
| **`queued`** | 20 | **1** | **19** | **0** |
| **Fresh `researching` lease** (valid ISO `now()`) | 20 | **0** | **20** | **0** |
| **Expired `researching` lease** (valid ISO `now−31m`) | 20 | **1** | **19** | **0** |
| **Random garbage** (`definitely-not-a-timestamp`) | 20 | **1** | **19** | **0** |
| **ISO invalid month/day/time** (`2026-99-99T25:61:61`) | 20 | **1** | **19** | **0** |
| **Impossible calendar date** (`2026-02-31T12:00:00`) | 20 | **1** | **19** | **0** |
| **Missing `researchStartedAt`** | 20 | **1** | **19** | **0** |

**`pg_input_is_valid` spot-check on PG 16 (psql):**

| Value | `pg_input_is_valid(..., 'timestamptz')` | Raw `::timestamptz` |
|-------|----------------------------------------|---------------------|
| `definitely-not-a-timestamp` | `f` | would throw if cast |
| `2026-99-99T25:61:61` | `f` | would throw if cast |
| `2026-02-31T12:00:00` | `f` | **throws** (`date/time field value out of range`) |
| `2026-08-09T16:00:00.000Z` | `t` | OK |

---

## 6. FENCING RESULTS

**Setup:** Insert `researching` row with Run A metadata; manually update row to Run B (simulates recovery/supersession).

| Stale Run A attempt | Measured `applied` | Rows updated |
|---------------------|-------------------|--------------|
| Success terminal (`complete`) with token A | `false` | **0** |
| Failure terminal (`failed`) with token A | `false` | **0** |

**Run B state after both attempts:**

- `research_status` remained **`researching`**
- `metadata.researchRunId` remained **Run B**
- No overwrite of research payload or decisionBrief from Run A (stale write rejected at fence)

Structured logs observed in test output:

```json
{"level":"warn","event":"stale_research_execution","staleResearchRunId":"00000000-0000-0000-0000-0000000000d1","attemptedTerminalStatus":"complete"}
{"level":"warn","event":"stale_research_execution","staleResearchRunId":"00000000-0000-0000-0000-0000000000e1","attemptedTerminalStatus":"failed"}
```

---

## 7. SEARCH COUNT RESULTS

**Per-cycle mock (`researchCreatorPartnership` with injected `searchWeb`):** **6 calls** (= `PARTNERSHIP_RESEARCH_SEARCH_TARGET_COUNT`).

**20 parallel `runPartnershipResearch` (mock `testResearchFn`):** **1** research execution.

**E2E: 20 parallel `submitCreatorPartnership` (queued partnership, real Postgres claim path + mocked `searchWeb`):**

| Metric | Measured (2026-08-09T18:38:53Z) |
|--------|----------------------------------|
| Partnership IDs returned | **1** (all 20 `duplicate: true`) |
| Claim / research executions | **1** |
| `searchWeb` calls | **6** |
| Final `researchRunId` | **1** |

**E2E: 20 parallel `submitCreatorPartnership` touch on expired `researching` lease (see §B):**

| Metric | Measured (2026-08-09T18:55Z) |
|--------|--------------------------------|
| Recovery winners | **1** |
| Research executions | **1** |
| `searchWeb` calls | **6** |
| Final `researchRunId` | **new** (≠ Run A) |
| Run A stale terminal write | **`applied: false`** |

Test name: `e2e: 20 parallel submitCreatorPartnership → one partnership, one researchRun, ≤6 searchWeb`.

**Normal maximum:** **≤ 6** paid searches per legitimate research cycle (unchanged).

---

## 8. STAGING / DEV ACCEPTANCE

**Fixture:** SCHEELS/WGACA URL used in `url-intelligence-smoke.ts`:

`https://www.scheels.com/c/all/b/what%20goes%20around%20comes%20around?r=storeAvailability%3A88`

**Environment:** Local dev Postgres (`localhost:5432/social_agent`). **Production database was not used.**

**Smoke run (prior acceptance, 2026-08-09T17:00:54Z — not re-run for this report to avoid live paid research):**

| Item | Result |
|------|--------|
| Rapid equivalent sync submissions | **20×** `submitCreatorPartnership` with `{ skipResearch: true }` |
| Dedupe repastes | **4×** additional submits (first/second/tracking/program) with `skipResearch: true` |
| Resulting partnership ID | `341940fa-edca-4bdf-b44b-d06b2b63327d` (all dedupe paths same ID) |
| `researchRunId` at report time | Not captured in smoke JSON (in-flight research owned by prior `askBenson` claim) |
| Claim winners from 20 skipResearch submits | **0 paid research launches** (skipResearch bypasses `runPartnershipResearch`) |
| Research executions from dedupe section | **0** (skipResearch) |
| Search count from dedupe section | **0** |
| `askBenson` plain URL (one call, no skip) | Created/linked partnership; triggered async research (expected single claim path) |
| Async research poll section | After update: polls in-flight owner; at snapshot time status was still `researching` (12 ms into poll — owner from `askBenson`, not a duplicate claim) |
| Final status at smoke completion | `researching` (in-flight; full terminal completion not awaited in that short snapshot) |

**Dedupe assertions (pass):** `sameIdOnRepaste: true`, `trackingSameAsFirst: true`, `trackingDuplicate: true`.

---

## 9. SMOKE COST PROTECTION

**`skipResearch` added in:**

| Location | Usage |
|----------|--------|
| `submitCreatorPartnership(input, { skipResearch?: boolean })` | Internal second arg only |
| `runPartnershipResearch(partnershipId, { skipResearch?: boolean })` | Early return before claim |
| `url-intelligence-sync-latency.ts` | Initial submit + all 20 loop iterations |
| `url-intelligence-smoke.ts` | 20× latency loop + 4× dedupe submits |

**Confirmed:**

| Check | Result |
|-------|--------|
| Latency smoke triggers paid research | **No** — all submits pass `skipResearch: true` |
| Routing/dedupe smoke triggers paid research | **No** — dedupe submits pass `skipResearch: true` |
| `skipResearch` on public HTTP/API | **No** — grep across repo shows usage only in core pipeline + internal scripts/tests (not in `services/api` routes or dashboard request bodies) |

---

## 10. TELEMETRY

**Live `web_search` metadata** (from `services/core/src/web-research/index.ts` → `recordLlmUsage`):

Fields written when provided by partnership research:

- `context` (always)
- `query` (truncated 200 chars)
- `caller` — `'creator_partnership.research'`
- `module` — `'creator_partnership.research'`
- `partnershipId`
- `researchRunId`
- `trigger` — e.g. `'user_submit'`, `'smoke'`
- `process` — `'api'`

**Sanitized example event** (representative shape; IDs fictional):

```json
{
  "source": "web_search",
  "model": "<BENSON_WEB_SEARCH_MODEL>",
  "estimatedCost": "0.012",
  "metadata": {
    "context": "user",
    "query": "What is Fixture Brand (Fixture Product)? Relationship between Fixture Brand and Fixture Retailer...",
    "caller": "creator_partnership.research",
    "module": "creator_partnership.research",
    "partnershipId": "935bcdba-6a06-4a53-b420-05fdab2da8a3",
    "researchRunId": "17363ee4-de14-4b9a-9bd8-b6e36b7bca0c",
    "trigger": "user_submit",
    "process": "api"
  }
}
```

**`stale_research_lease_recovery`:** Recorded via `logStructured()` only — **not** inserted into `llm_usage_events` / not counted as `web_search` spend.

**Actual log from expired-lease concurrency test:**

```json
{
  "level": "info",
  "service": "creator-partnership",
  "message": "stale_research_lease_recovery",
  "event": "stale_research_lease_recovery",
  "partnershipId": "f606d6a1-45d4-41d7-a91b-9733fc9b48e0",
  "priorResearchRunId": "00000000-0000-0000-0000-0000000000bb",
  "newResearchRunId": "17363ee4-de14-4b9a-9bd8-b6e36b7bca0c",
  "priorResearchStartedAt": "2026-08-09T17:37:01.114Z",
  "trigger": "test",
  "reason": "stale_research_lease_recovery"
}
```

---

## 11. REGRESSION SUITES

All executed 2026-08-09 for this report. No expensive live web research was run beyond what was already captured in the prior smoke snapshot.

| Suite | Command scope | Result | Tests | Duration |
|-------|---------------|--------|------:|----------|
| **Research singleflight** | `research-singleflight.test.ts` | **PASS** | **18** | **54.9s** |
| **Creator Partnership (full)** | `src/creator-partnership/*.test.ts` | **PASS** | **83** | **58.2s** |

**Coverage mapping:**

| Area | Test file(s) | Result |
|------|--------------|--------|
| SCHEELS reuse / routing | `url-intelligence.test.ts` | PASS |
| REKLAIM | `detect.test.ts`, `field-verification.test.ts` | PASS |
| Tracking URL normalization/dedupe | `url-intelligence.test.ts` (`normalizes host, strips tracking…`) | PASS |
| `/menus` exclusion | `detect.test.ts`, `url-intelligence.test.ts` | PASS |
| Field verification | `field-verification.test.ts` | PASS |
| Creator Play consistency | `creator-play-consistency.test.ts` | PASS |
| URL Intelligence behavior | `url-intelligence.test.ts`, ask-benson URL tests | PASS |

---

## 12. UNEXPECTED FINDINGS

1. **Regex-only timestamp guard was insufficient:** ISO-shaped invalid values (e.g. `2026-02-31T12:00:00`) pass a prefix regex but **throw on `::timestamptz`**. Fixed using **`pg_input_is_valid`** on PostgreSQL 16 before any cast.
2. **Parallel touch metadata clobber:** 20 simultaneous `submitCreatorPartnership` touches could overwrite `metadata` during `researching`, stripping `researchRunId`/`researchStartedAt` and triggering false lease-recovery storms (18 `searchWeb` calls observed before fix). Fixed with SQL metadata merge that preserves fencing tokens when `research_status = 'researching'`.
3. **Smoke script:** must poll in-flight research after singleflight (duplicate `runPartnershipResearch` correctly no-ops).
4. **Git index lag (corrected pre-approval):** Hotfix runtime files were initially untracked (`??`). Normal Benson deploy reads the **working tree**, so they were already live on this host — but untracked state is **not acceptable for approval**. All runtime `creator-partnership/*.ts` (excluding unrelated repo dirt) plus `web-research/index.ts` and `research-singleflight.test.ts` are now **staged**; commit must still include `services/core/package.json` `./creator-partnership` export.

---

## A. DEPLOY ARTIFACT VERIFICATION

**Inspected paths:** `scripts/benson-deploy-local.sh`, `scripts/pre-alpha-start-prod.sh`, `scripts/benson-runtime-lib.sh`, `scripts/benson-deployment-status.sh`, `services/core/src/deployment-parity/index.ts`, `services/api/package.json`.

### Exact deployment mechanism

| Step | Script / command | What enters runtime |
|------|------------------|---------------------|
| **Primary local deploy** | `pnpm benson:deploy-local` → `scripts/benson-deploy-local.sh` | Restarts API, workers, dashboard from **`$ROOT` working tree** |
| **Production-mode boot** | `pnpm start:prod` → `scripts/pre-alpha-start-prod.sh` → `benson_boot_prod` | Same working tree; dashboard gets `next build` + `next start` |
| **API process** | `pnpm --filter @social-agent/api start` → **`tsx src/server.ts`** | TypeScript source loaded directly via tsx + pnpm workspace |
| **Core hotfix code** | `@social-agent/core/creator-partnership` export → `./src/creator-partnership/index.ts` | **Filesystem paths under `services/core/src/`** — not a compiled dist bundle |
| **Parity / identity** | `computeSourceFingerprint()` hashes `services/core/src` recursively | **All files on disk** in that tree (tracked or untracked); `.test.ts` excluded from hash |
| **NOT used for app code** | — | No Docker image build, no rsync/scp deploy script, no git-checkout-only artifact, no packaged tarball |

**Comment in `benson-runtime-lib.sh` (line 309):** *“Git commit alone is NOT a valid deployment identity — the working tree often carries significant uncommitted source.”* Deploy identity is **content fingerprint**, not git HEAD.

### Do untracked files enter the build?

**On this Benson host: YES.** tsx resolves modules from the working tree; untracked files on disk are loaded identically to tracked files. Fingerprint computation walks the filesystem under `services/core/src`, not `git ls-files`.

**On a fresh `git clone` without those files: NO.** A clone that lacks committed/staged sources would fail at import time even after restart.

### Runtime hotfix files verified on disk (dry-run, no deploy)

**Command:** `pnpm exec tsx src/deployment-parity/cli-fingerprint.ts $ROOT` + `import()` of hotfix entrypoints.

| File | On disk | In fingerprint scan (`services/core/src`) | Import resolves |
|------|---------|-------------------------------------------|-----------------|
| `services/core/src/creator-partnership/research-singleflight.ts` | ✅ 7,280 B | ✅ | ✅ |
| `services/core/src/creator-partnership/pipeline.ts` | ✅ 28,557 B | ✅ | ✅ |
| `services/core/src/creator-partnership/research.ts` | ✅ | ✅ | ✅ |
| `services/core/src/creator-partnership/index.ts` | ✅ | ✅ | ✅ |
| `services/core/src/web-research/index.ts` | ✅ 5,997 B | ✅ | ✅ |

**Source fingerprint (2026-08-09T18:56Z dry-run):** `2dcc171f35f6863e`

**Additional runtime imports required by those modules (also on disk, now staged):**

`detect.ts`, `url-intelligence.ts`, `partnership-sources.ts`, `decision-brief.ts`, `types.ts`, `creator-play.ts`, `fit-score.ts`, `fingerprints.ts`, `activities.ts`, `field-verification.ts`, `story-angles.ts`, `next-actions.ts`, `../db.ts`, `../schema.ts`, `../structured-log.ts`, `../ask-benson/url-intake-pipeline.ts`, `../data-revision/index.ts`, plus other `creator-partnership/*.ts` runtime helpers (28 staged `.ts` files total).

**Workspace export required at commit:** `services/core/package.json` → `"./creator-partnership": "./src/creator-partnership/index.ts"` (modified, **not yet staged** — must be included in the deploy commit).

### Repository-state correction made

```bash
git add services/core/src/creator-partnership/*.ts   # runtime only (*.test.ts left unstaged except research-singleflight.test.ts)
git add services/core/src/creator-partnership/research-singleflight.test.ts
git add services/core/src/web-research/index.ts
```

**Not staged (intentionally):** unrelated dashboard/API dirty files, smoke/latency scripts, `services/core/package.json` (pending explicit commit bundling).

**Leaving runtime source untracked was not intentional** — corrected by staging before approval. Commit (when Elliott requests) must include staged files + `package.json` export line.

---

## B. EXPIRED-LEASE E2E

**Test:** `e2e expired lease: 20 parallel submit touch → one recovery, one researchRun, ≤6 searchWeb`  
**File:** `services/core/src/creator-partnership/research-singleflight.test.ts`  
**Run:** 2026-08-09T18:55Z — **PASS** (~10.4s)

**Setup:**

| Field | Value |
|-------|-------|
| Initial `research_status` | `researching` |
| `researchRunId` | Run A = `00000000-0000-0000-0000-0000000000aa` |
| `researchStartedAt` | `now − RESEARCH_LEASE_MS − 60s` (valid ISO, expired) |
| Trigger | 20× `submitCreatorPartnership` duplicate touch (same URL), **no `skipResearch`**, mocked `searchWeb`, `testSkipPageFetch: true` |

**Measured results:**

| Metric | Expected | Measured |
|--------|----------|----------|
| Parallel attempts | 20 | **20** |
| Claim winners (`testOnClaim`) | 1 | **1** |
| Recovery winners | 1 | **1** |
| Research executions | 1 | **1** |
| Losers performing research | 19 @ 0 | **19 @ 0** |
| `searchWeb` calls | ≤ 6 | **6** |
| Final `researchRunId` | new ≠ Run A | **`c850b537-8ae9-49b6-bf85-2c33aea34d2d`** |
| Final status | terminal | **`complete`** |
| Run A terminal fence | `applied: false` | **`applied: false`** |

**Structured log observed:**

```json
{
  "event": "stale_research_lease_recovery",
  "priorResearchRunId": "00000000-0000-0000-0000-0000000000aa",
  "newResearchRunId": "c850b537-8ae9-49b6-bf85-2c33aea34d2d",
  "trigger": "user_submit"
}
```

---

## 13. SCOPE CONFIRMATIONS

| Item | Status |
|------|--------|
| Migrations | **NONE** |
| `BENSON_LLM_DAILY_BUDGET_USD` | **Still effective $3** (code default `'3'` in `env.ts`; unchanged by this hotfix) |
| Throttle semantics | **Unchanged** (`shouldSkipBackgroundLlm`, user vs background paths untouched) |
| Ask Benson link-fallback caching | **Deferred** (not implemented) |
| Benson Workspace implementation | **Still paused** (`docs/plans/benson-workspace-ux-plan.md`) |
| Production SCHEELS canary | **NOT RUN YET** |

---

## 14. DEPLOYMENT READINESS

**READY FOR DEPLOY APPROVAL**

All required singleflight tests pass on real local Postgres (18/18 singleflight, 83/83 creator-partnership). Deploy artifact verification confirms the normal Benson path loads hotfix source from the **working tree via tsx** (untracked-on-disk files included on this host); git index corrected by staging runtime module + hotfix test. Expired-lease E2E proves one recovery winner, one research execution, ≤6 mocked searches, new run fencing, Run A rejected. No migration, no env changes, no budget change, no production canary executed.

**Before deploy commit:** include staged files + `services/core/package.json` `./creator-partnership` export (not yet staged).

**After approval:** deploy via normal Benson path (`pnpm benson:deploy-local` or `pnpm start:prod`) → then one controlled production SCHEELS canary on `cec7d31d-ab53-4828-aae6-2c170dd3b293`.
