# Creator Partnership Research Singleflight / Concurrency Hotfix

**Status:** Implemented — before-deploy report ready; awaiting Elliott approval to deploy  
**Type:** Focused production-cost / reliability hotfix  
**Related ops:** [`docs/ops/control-tower-admin-and-ai-budget.md`](../ops/control-tower-admin-and-ai-budget.md)  
**Paused in parallel:** Benson Workspace UX implementation ([`docs/plans/benson-workspace-ux-plan.md`](benson-workspace-ux-plan.md))

**Principle:** Fix the concurrency storm that multiplied paid `web_search` calls. Do not redesign the Creator Partnership architecture. Do not raise the AI budget in this pass.

**Out of scope:**

- Benson Workspace architecture / MVP implementation
- Raising `BENSON_LLM_DAILY_BUDGET_USD` (remains **$3** for now)
- Changing background vs foreground throttle semantics
- Redis or any new infrastructure dependency
- Ask Benson link-fallback **result caching/dedupe** (deferred follow-up slice)
- In-process cache presented as cross-process protection
- Public HTTP/API exposure of `skipResearch`
- Broad production env kill-switch for research (unless architecture truly requires it — prefer internal skip)
- Partnership product redesign, auto-pitch, capability cache, lifecycle automation

**Stop condition after implementation:** unit + real Postgres concurrency tests + staging/dev acceptance → **before-deploy report** → Elliott approval → deploy → **post-deploy production SCHEELS canary**. No automatic deploy.

---

## LOCKED DECISIONS (APPROVED)

| # | Decision | Locked choice |
|---|----------|---------------|
| 1 | Hotfix vs budget | **Hotfix ships before any AI budget increase.** Budget remains effective **$3**. |
| 2 | `researchRunId` storage | **Metadata-only** on `creator_partnerships.metadata`. **No migration.** |
| 3 | Link-fallback caching/dedupe | **DEFERRED** to a separate follow-up slice. Telemetry instrumentation **stays** in this hotfix. Do **not** add an in-process cache as if it were cross-process protection. |
| 4 | Smoke research skip | **Internal** function/script-level `skipResearch` (or equivalent) only. **Not** exposed through public HTTP/API input. Avoid broad production env kill-switch. |
| 5 | Deploy | Implement/test first; **no deployment** until before-deploy report is reviewed and Elliott approves. |
| 6 | Researching crash recovery | **Research execution lease** via `metadata.researchStartedAt` + `researchRunId`. Fresh lease → claim fails. Expired (or missing startedAt) → one atomic recovery claim with **new** run id. Same Postgres claim mechanism; **no** second concurrency system. `RESEARCH_LEASE_MS = 30 minutes`. |

---

## OBSERVED INCIDENT (CONTEXT)

Today (America/Chicago accounting day):

- **320** `web_search` runs
- **All** `metadata.context = user`
- **~$3.84** web-search spend (`$0.012` flat estimate per call)
- SCHEELS / WGACA accounted for **~131–162** searches
- Approximately **27 overlapping research waves** inferred for **one** partnership (`cec7d31d-ab53-4828-aae6-2c170dd3b293`)
- Normal expectation: **one run × up to 6 searches** (~$0.072)

Secondary finding (same day): repeated Ask Benson link-fallback queries for the same URLs — tracked for a **follow-up** slice (caching deferred). This hotfix still improves attribution via telemetry.

Budget gate did **not** stop this storm because partnership research intentionally calls `searchWeb(..., { context: 'user' })`, which bypasses `shouldSkipBackgroundLlm`.

---

## ROOT CAUSE (CONFIRMED)

File: [`services/core/src/creator-partnership/pipeline.ts`](../../services/core/src/creator-partnership/pipeline.ts)

### Bug A — `queued` treated as stale / multi-launchable

In `touchExistingPartnershipSource`:

```ts
const inFlight = row.researchStatus === 'researching'; // queued ignored
const stale =
  !inFlight &&
  (!researchedAt ||
    Date.now() - new Date(researchedAt).getTime() > STALE_RESEARCH_MS ||
    row.researchStatus === 'failed' ||
    row.researchStatus === 'queued'); // BUG: each touch launches research

if (stale) {
  void runPartnershipResearch(input.partnershipId)...
}
```

Repeated submissions while `queued` each invoked `runPartnershipResearch()` and performed paid work.

### Bug B — no DB-level singleflight / fencing

`runPartnershipResearch` unconditionally `UPDATE … SET research_status = 'researching'` with **no claim predicate**, then runs up to six paid searches. Concurrent callers race.

Also missing: terminal writes are not fenced by `researchRunId`, so a slow/stale execution could overwrite a newer owner’s results.

### Amplifiers

- Latency smoke: 20× `submitCreatorPartnership` without disabling research
- Deploy/acceptance re-pastes while still queued
- Near-duplicate same-query pairs within 5s: **139** day-wide
- SCHEELS company-query starts: **19 in one 2-second bucket**

---

## RECOMMENDED HOTFIX SLICE

1. Refine queued/researching semantics (claimable vs owned + lease recovery)
2. DB atomic research claim before any expensive work (includes expired-lease recovery)
3. `researchRunId` as **fencing token** (metadata-only) on claim + terminal writes
4. Research execution lease (`RESEARCH_LEASE_MS = 30m`) for crash recovery of `researching`
5. Source attach without parallel multi-execution
6. Web search telemetry enrichment + non-paid `stale_research_lease_recovery` event
7. Internal `skipResearch` for scripts/tests (not public API)
8. Concurrency + lease-recovery tests: real Postgres claim race + mocked search count
9. Staging/dev acceptance with controlled fixture
10. Before-deploy report → approve → deploy → production SCHEELS canary

**Deferred:** Ask Benson link-fallback result caching/dedupe.  
**Budget remains $3.** No throttle semantic changes. **No migration.**

---

## REVISED QUEUED / RESEARCHING SEMANTICS

### Definitions

| Status | Meaning |
|--------|---------|
| **`queued`** | **PENDING RESEARCH, CLAIMABLE, BUT NO EXPENSIVE EXECUTION HAS BEEN CLAIMED YET.** Recoverable if the original async callback never starts. |
| **`researching`** | **AN EXECUTION CURRENTLY OWNS THIS RESEARCH CYCLE** (holds current `metadata.researchRunId`). |
| **`complete` / `needs_verification`** | Terminal (subject to ~7-day freshness / explicit force refresh). |
| **`failed`** | Eligible for retry via atomic claim per existing retry rules. |

### Invariants

```
QUEUED MAY BE CLAIM-ATTEMPTED.
QUEUED MUST NOT BE MULTI-EXECUTED.
RESEARCHING + FRESH LEASE → ACTIVE OWNER; CLAIM FAILS; ZERO PAID WORK.
RESEARCHING + EXPIRED LEASE → ELIGIBLE FOR ONE ATOMIC RECOVERY CLAIM.
```

Safe behavior on submit/touch:

1. Attach/touch source idempotently; reuse partnership.
2. If status is **`queued`**: **may** invoke/attempt `runPartnershipResearch`.
3. `runPartnershipResearch` performs **atomic claim FIRST**.
4. Exactly **one** caller transitions `queued → researching`, generates/stores `researchRunId`, performs paid work.
5. Other concurrent callers receive `claimed: false` and perform **ZERO** page/search/LLM work.
6. If status is **`researching` + lease fresh**: claim fails → reuse active execution → zero paid work.
7. If status is **`researching` + lease expired**: eligible for **one** atomic recovery claim (new `researchRunId` + new `researchStartedAt`); prior execution becomes stale.
8. If status is terminal + fresh: reuse; no claim (unless explicit force, which still collapses to one claim winner).
9. If status is terminal + stale, or `failed`: claim-attempt allowed; one winner only.

Therefore **20 callers may ATTEMPT the DB claim**. They must **never** create 20 research executions.

A partnership inserted as `queued` remains recoverable if the original request dies before its async research callback starts — a later touch/submit may claim-attempt and win.

A partnership stuck in `researching` after crash/kill (claimed but never terminal-written) remains recoverable only after the research execution lease expires — via the **same** atomic claim mechanism, not a second concurrency system.

### What changed vs earlier plan wording

Earlier draft said `touchExistingPartnershipSource` must **never** call `runPartnershipResearch` for `queued`.  
**Corrected:** touch/submit **may** call `runPartnershipResearch` for `queued`, but that function **must** claim atomically first so only one execution does paid work. Do **not** return to unlimited multi-launch from queued.

Preserve `STALE_RESEARCH_MS = 7 * 24 * 60 * 60 * 1000` for terminal freshness.

---

## RESEARCH EXECUTION LEASE (CRASH RECOVERY)

### Problem covered

Without lease recovery, this path wedges forever:

```
queued → win atomic claim → researching → crash/kill before terminal write
```

Future claim attempts correctly refuse to steal a fresh active run, so the partnership stays `researching` indefinitely.

### Lease fields (existing metadata; no migration)

- `metadata.researchStartedAt` — lease start
- `metadata.researchRunId` — fencing token / owner id

### Named constant

```ts
/** Max wall-clock ownership for one researching cycle before recovery claim is allowed. */
export const RESEARCH_LEASE_MS = 30 * 60 * 1000; // 30 minutes
```

### Lease duration reasoning (evidence-based)

Inspected partnership research path:

- Up to **6 sequential** `searchWeb` calls (`context: 'user'`) in [`research.ts`](../../services/core/src/creator-partnership/research.ts)
- Plus page fetch / synthesis LLM (`max_tokens: 2600`) and downstream pipeline steps
- **No hard per-run runtime timeout** or abort deadline found on partnership research or `searchWeb`
- Existing `STALE_RESEARCH_MS = 7 days` is **terminal freshness only** — far too long as a crash lease

**Choice: 30 minutes (`RESEARCH_LEASE_MS`).** Conservative tens-of-minutes default: long enough that legitimately slow research (rate limits, slow web, multi-step LLM) is not stolen mid-flight; short enough that a crashed owner recovers same day without manual DB surgery. Named constant in TS — **not** a magic SQL interval.

### Lease semantics

| Condition | Behavior |
|-----------|----------|
| `researching` + lease **fresh** (`researchStartedAt >= now - RESEARCH_LEASE_MS`) | Active owner → `claimed:false` → **zero** paid work |
| `researching` + lease **expired** (`researchStartedAt < now - RESEARCH_LEASE_MS`) | Eligible for **one** atomic recovery claim |
| Recovery claim winner | Generate **NEW** `researchRunId`, set **NEW** `researchStartedAt`, remain/set `researching`, continue research |
| Prior execution | Becomes **stale**; fenced terminal writes update **0 rows** |

Do **not** create a second concurrency system. Recovery uses the **same** Postgres atomic `UPDATE … RETURNING` claim helper.

### Legacy `researching` without `researchStartedAt`

Explicit recovery behavior (do **not** leave permanently wedged):

- If `research_status = 'researching'` AND (`researchStartedAt` **missing** OR unparseable) → treat lease as **expired** → eligible for recovery claim.
- Rationale: pre-hotfix / partial rows have no trustworthy lease clock; refusing recovery would wedge them forever. Prefer one recovery claim over permanent stuck state.

### Lease-recovery telemetry (not paid usage)

On successful recovery claim, emit a **structured event** (log / ops event — **not** a `web_search` / paid LLM usage row):

| Field | Value |
|-------|--------|
| `partnershipId` | id |
| `priorResearchRunId` | previous `metadata.researchRunId` when available |
| `newResearchRunId` | newly generated id |
| `priorResearchStartedAt` | previous startedAt when available (null if legacy missing) |
| `trigger` / `reason` | `stale_research_lease_recovery` |

Do **not** record this event as paid `web_search` usage by itself.

---

## EXACT ATOMIC CLAIM PREDICATE

Helper: `claimPartnershipResearch(partnershipId, options?: { force?: boolean; trigger?: string })`

### Claim transition (winner)

```
queued
| failed
| (complete|needs_verification + stale|force)
| (researching + lease expired OR researchStartedAt missing/unparseable)
  → researching
  + metadata.researchRunId = <newUuid>
  + metadata.researchStartedAt = <now>
```

### Illustrative SQL

```sql
UPDATE creator_partnerships
SET
  research_status = 'researching',
  pipeline_status = 'researching',
  research_error = NULL,
  metadata = jsonb_set(
    jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{researchRunId}',
      to_jsonb($new_run_id::text),
      true
    ),
    '{researchStartedAt}',
    to_jsonb($started_at::text),
    true
  ),
  updated_at = now()
WHERE id = $partnership_id
  AND (
    -- Normal claimable statuses (not actively researching with fresh lease)
    (
      research_status IN ('queued', 'failed')
      OR (
        research_status IN ('complete', 'needs_verification')
        AND (
          $force = true
          OR /* researchedAt missing OR researchedAt older than STALE_RESEARCH_MS */
        )
      )
    )
    OR (
      -- Lease recovery: researching + expired / missing startedAt
      research_status = 'researching'
      AND (
        metadata->>'researchStartedAt' IS NULL
        OR (metadata->>'researchStartedAt')::timestamptz
             < (now() - make_interval(secs => $research_lease_secs))
        -- OR equivalent: unparseable treated as expired in app-layer predicate
      )
    )
  )
  -- Fresh researching must NOT match (active owner)
RETURNING id, research_status, metadata, research;
```

Pass `$research_lease_secs = RESEARCH_LEASE_MS / 1000` from the named constant (no magic SQL).

| Prior status | Claim result |
|--------------|--------------|
| `queued` | Winner: `claimed:true` + new `researchRunId`. Losers: `claimed:false`, zero paid work. |
| `researching` + **fresh** lease | **All** attempts: `claimed:false` — reuse active execution. |
| `researching` + **expired** lease (or missing/unparseable `researchStartedAt`) | Exactly **one** recovery winner: new `researchRunId` + new `researchStartedAt`; emit `stale_research_lease_recovery`. Losers: `claimed:false`. |
| `complete` / `needs_verification` + fresh | `claimed:false` unless `$force` |
| `complete` / `needs_verification` + stale | One winner |
| `failed` | One winner (retry) |

**Create path:** insert as `queued` → `void runPartnershipResearch(...)` → claim-first inside. Concurrent touches may also attempt claim; only one wins.

**Loser behavior:** return immediately; **no** page fetch, **no** `searchWeb`, **no** synthesis LLM.

Cross-process safe: Postgres row update with status/lease predicate (no Redis, no in-memory mutex as the authority).

---

## EXACT FENCED TERMINAL-WRITE PREDICATE

`researchRunId` is a **fencing token**, not only telemetry/correlation.

Every terminal research write (`complete`, `needs_verification`, `failed`) must prove the execution still owns the partnership’s current research cycle:

```sql
UPDATE creator_partnerships
SET
  research_status = $terminal_status,  -- complete | needs_verification | failed
  research = $research_json,           -- only if still owner
  metadata = /* merge decisionBrief / clear error as appropriate */,
  research_error = $error_or_null,
  updated_at = now()
WHERE id = $partnership_id
  AND research_status = 'researching'
  AND metadata->>'researchRunId' = $current_research_run_id
RETURNING id;
```

### If zero rows update

- This execution is **stale / superseded**
- **Do not** overwrite partnership `research`
- **Do not** overwrite `decisionBrief`
- **Do not** alter current research status
- Log a structured stale-execution event (include partnership id, stale `researchRunId`, attempted terminal status) and **exit safely**

Apply the same fence to success paths **and** error/failure handlers so a late Run A cannot mark Run B failed.

Use `researchRunId` as the fencing token throughout the execution (claim → searches → synthesis → terminal write).

A refresh after research becomes stale / forced refresh gets a **new** `researchRunId` on the new successful claim.

---

## SOURCE ATTACHMENT DURING ACTIVE RESEARCH

A newly attached supporting URL must not spawn a parallel multi-executed research wave.

1. Attach/touch source idempotently.
2. If `queued`: may **claim-attempt** via `runPartnershipResearch` (singleflight).
3. If `researching` + **fresh** lease: claim fails → reuse active execution; **zero** paid work from the attach path.
4. If `researching` + **expired** lease: same atomic recovery claim path (one winner only).
5. Do not launch N× six-search waves.
6. Optional tiny flag `metadata.pendingResearchEnrichment = true` for later enrichment — keep small; not required to parallelize research.

---

## LINK-FALLBACK CACHING — DEFERRED

**Confirmed deferred** to a separate follow-up slice.

- Do **not** implement Ask Benson link-fallback result caching/dedupe in this hotfix.
- Do **not** introduce an in-process cache framed as cross-process protection.
- Keep **telemetry** in this hotfix so future waste is attributable by caller/module.
- When caching is later implemented: a cache hit must **NOT** be recorded as a paid `$0.012` `web_search` usage event unless accounting explicitly records **zero cost**. Do not let cache telemetry inflate spend totals. (`cached` indicator may land with that follow-up.)

---

## TELEMETRY ADDITIONS (THIS HOTFIX)

For each **live** web search, record when available (no sensitive email/body):

| Field | Notes |
|-------|--------|
| `caller` / `module` | e.g. `creator_partnership.research` |
| `context` | existing: `user` \| `background` \| `concierge` |
| `partnershipId` / `contentItemId` | when applicable |
| `researchRunId` | fencing/correlation id for the cycle |
| `trigger` | `user_submit` \| `refresh` \| `smoke` \| `replay` \| `background` |
| `process` | `api` \| `worker` |

**Also (non-paid):** structured `stale_research_lease_recovery` event on recovery claim win — see lease section. Not a `web_search` usage row.

**Deferred with caching follow-up:** `cached` / reused indicators and any zero-cost cache accounting rules.

Wire through `searchWeb` options → `recordLlmUsage` metadata. Partnership research passes `partnershipId` + `researchRunId` into all searches in the cycle.

---

## TEST / SMOKE COST CONTROLS

- Use an **INTERNAL** function/script-level `skipResearch` (or equivalent option on core `submitCreatorPartnership` / test helpers).
- **Do not** expose `skipResearch` through public HTTP/API request bodies or query params.
- Avoid a broad production env kill-switch; script-local internal skip is preferred.
- Latency / dedupe / routing / UI smokes: **no** paid research storms.
- One explicit live-research acceptance path remains (staging/dev fixture; production canary post-deploy only).

Scripts of concern:

- [`url-intelligence-sync-latency.ts`](../../services/core/src/scripts/url-intelligence-sync-latency.ts)
- [`url-intelligence-smoke.ts`](../../services/core/src/scripts/url-intelligence-smoke.ts)
- Similar submit loops

---

## REVISED TEST MATRIX

### A. Unit / logic tests

- Queued semantics: claim-attempt allowed; multi-execute prevented
- Researching + **fresh** lease: claim fails; zero paid work
- Fresh complete / needs_verification: no re-run unless force
- Stale terminal: exactly one new claim
- Failed: retry claimable
- Source attach during researching (fresh lease): attached, no parallel paid wave
- Tracking-param variant: same partnership / same active run
- Internal `skipResearch`: no claim/paid work from script helpers

### B. Fencing / stale-execution tests (required)

1. Run A claims partnership (`researchRunId = A`).
2. Simulate later Run B becoming legitimate owner (`researchRunId = B`, status `researching`) — including via **lease recovery**.
3. Run A attempts **success** terminal write with token A → **0 rows**; cannot overwrite B’s research / decisionBrief / status.
4. Run A **failure** handler attempts to mark failed with token A → **0 rows**; cannot mark B failed.
5. Structured stale-execution log emitted.

### B2. Research lease recovery tests (required)

1. **Fresh researching lease** → 20 claim attempts → **0** winners (`claimed:false` all); zero paid work.
2. **Expired researching lease** → 20 simultaneous claim attempts → exactly **1** winner → **new** `researchRunId` (and new `researchStartedAt`); emit `stale_research_lease_recovery`.
3. **Old run success after lease recovery** → fenced terminal write with prior `researchRunId` affects **0** rows.
4. **Old run failure after lease recovery** → fenced failure write affects **0** rows.
5. **Recovery winner search max** → recovery winner performs at most normal search maximum (**≤ 6** mocked `searchWeb`).
6. **Legacy researching without `researchStartedAt`** → explicitly treated as expired → recovery claimable (not permanently wedged); one winner among concurrent attempts.

### C. Real Postgres atomic concurrency (required)

Not only mocked repository behavior:

- **20 concurrent atomic claim attempts** against one partnership in real Postgres (`queued`)  
  → exactly **1** `claimed:true`  
  → **19** `claimed:false`
- Same for **expired researching lease** recovery (test B2.2)

### D. Search-count proof (mocked `searchWeb`)

Separately:

- One claim winner → **≤ 6** research searches (not N×6)
- 20 parallel submits → still **≤ 6** searches total for that cycle
- Recovery claim winner → **≤ 6** (test B2.5)

### E. Staging/dev acceptance (pre-deploy)

- Controlled partnership fixture on staging/dev DB (not production)
- Rapid equivalent URL submissions
- Assert: one `researchRunId`, one claim winner, ≤ normal search maximum

---

## REVISED PRE-DEPLOY / POST-DEPLOY ACCEPTANCE BOUNDARY

### Do NOT

- Point local un-deployed code at the **production** database merely to exercise the existing SCHEELS row.

### Before deploy (required)

1. Unit tests  
2. Real Postgres integration concurrency test (20 claims → 1 winner)  
3. Mocked searchWeb count tests (≤6 per cycle)  
4. Fencing/stale-write tests  
5. Staging/dev DB acceptance with a **controlled partnership fixture**  
6. Rapid equivalent URL submissions on that fixture  
7. Before-deploy report for Elliott  

### After Elliott explicitly approves deployment (post-deploy canary)

1. Deploy hotfix  
2. **One controlled production SCHEELS canary** using:  
   `cec7d31d-ab53-4828-aae6-2c170dd3b293`  
3. Verify production telemetry shows **one** research cycle for that canary (one `researchRunId`, no N×6 burst on rapid re-submit)

Production SCHEELS acceptance is listed as **POST-DEPLOY CANARY**, not a pre-deploy requirement that runs local code against production data.

---

## RISKS / TRADEOFFS

| Risk | Mitigation |
|------|------------|
| Orphaned `queued` if claim never attempted | Touch/submit may claim-attempt; queued remains claimable |
| Crash after claim leaves `researching` forever | `RESEARCH_LEASE_MS` recovery via same atomic claim; fencing protects old run |
| Lease too short steals slow research | 30m conservative; no hard runtime today; named constant |
| Legacy researching missing startedAt wedged | Missing/unparseable → treat expired |
| Unlimited multi-execute from queued returns | Atomic claim; losers zero paid work; Postgres concurrency test |
| Stale execution overwrites newer run | Fenced terminal writes by `researchRunId` |
| Force refresh races | Same claim predicate; one winner |
| Public API skipResearch abuse | Internal-only skip; not on HTTP surface |
| Link-fallback waste continues short-term | Deferred follow-up; telemetry improves visibility |
| In-process cache mistaken for safety | Not implemented in this slice |

---

## EXACT IMPLEMENTATION ORDER

1. Locked decisions already recorded in this plan.  
2. Implement `claimPartnershipResearch` with exact claim predicate **including lease recovery** (`RESEARCH_LEASE_MS`).  
3. Refactor `runPartnershipResearch`: claim-first; losers exit with zero paid work; recovery winners get new run id.  
4. Emit non-paid `stale_research_lease_recovery` structured event on recovery win.  
5. Implement **fenced terminal writes** (success + failure) with `researchRunId` predicate.  
6. Update submit/touch paths: queued may claim-attempt; fresh researching does not multi-execute; expired researching uses recovery claim; remove queued-as-stale unlimited launch.  
7. Thread `researchRunId` + telemetry fields through research → `searchWeb` → `recordLlmUsage`.  
8. Internal `skipResearch` for scripts/tests (not public API).  
9. Tests: fencing + lease recovery (B2) + real Postgres 20-way claim + mocked ≤6 searches.  
10. Staging/dev fixture acceptance.  
11. Before-deploy report; **stop for Elliott approval**.  
12. On approval: deploy; then production SCHEELS canary.  
13. **Do not** change budget (remains **$3**) or throttle semantics.  
14. **Do not** migrate. **Do not** implement link-fallback caching in this slice.

---

## FILES LIKELY TOUCHED

- [`services/core/src/creator-partnership/pipeline.ts`](../../services/core/src/creator-partnership/pipeline.ts) — claim, fence, touch/create
- [`services/core/src/creator-partnership/research.ts`](../../services/core/src/creator-partnership/research.ts) — pass run id / trigger into searches
- [`services/core/src/web-research/index.ts`](../../services/core/src/web-research/index.ts) — telemetry options (no cache in this slice)
- New: `research-singleflight.test.ts` (+ Postgres integration test harness as used elsewhere in core)
- Scripts: latency/smoke — internal `skipResearch`
- Ops note: budget still paused at $3

**Migration:** **none**.

---

## BEFORE-DEPLOY REPORT CHECKLIST

- Exact root cause confirmed  
- Files changed  
- Atomic claim predicate (as shipped), including lease recovery  
- `RESEARCH_LEASE_MS` value and reasoning  
- Fenced terminal-write predicate (as shipped)  
- Queued/researching/lease semantics  
- Postgres concurrency: queued 20→1; fresh lease 20→0; expired lease 20→1  
- Lease recovery fencing: old run success/failure → 0 rows  
- Legacy missing `researchStartedAt` recovery behavior  
- Mocked search count: one winner / recovery winner → ≤6 searches  
- Fencing tests: stale Run A cannot overwrite Run B (success or failure)  
- Staging/dev fixture acceptance  
- Telemetry fields + `stale_research_lease_recovery` (non-paid)  
- Link-fallback caching: **deferred** (confirmed)  
- Smoke/internal skipResearch protections (not public API)  
- Migration: **none**  
- Budget: **still $3 / unchanged**  
- Throttle semantics: **unchanged**  
- Production SCHEELS: listed as **post-deploy canary only**  

---

## BUDGET POLICY

- **Do NOT** raise `BENSON_LLM_DAILY_BUDGET_USD` (effective **$3** remains).  
- **Do NOT** change throttle semantics in this hotfix.  
- After hotfix is deployed and spend normalizes, reconsider budget raise and/or separate foreground/background budgets in the ops track.

---

## RELATIONSHIP TO OTHER WORK

| Workstream | Action |
|------------|--------|
| Benson Workspace UX | Remains paused until this hotfix is approved/deployed or explicitly unpaused |
| Link-fallback search caching | Separate follow-up slice |
| Control Tower admin email | Separate ops item |
| AI budget raise to $10 | Paused until singleflight ships and spend normalizes |

---

## IMPLEMENTATION TODOS (TRACKING)

- [x] Lock decisions (hotfix before budget; metadata run id; defer link cache; internal skipResearch; no deploy until report)
- [x] Plan corrections: fencing token, queued claim-attempt semantics, Postgres claim tests, pre/post deploy boundary
- [x] Implement atomic claim + fenced terminal writes + lease recovery
- [x] Update touch/create paths for revised queued semantics
- [x] Telemetry for live web_search (no cache fields required)
- [x] Internal skipResearch for smokes/latency
- [x] Fencing tests + real Postgres 20-way claim + mocked ≤6 searches
- [x] Staging/dev fixture acceptance + before-deploy report
- [ ] Deploy only after approval; then production SCHEELS canary
- [x] Budget remains $3; no migration; link-fallback caching deferred
