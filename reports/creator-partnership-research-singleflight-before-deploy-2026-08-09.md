# Creator Partnership Research Singleflight — BEFORE-DEPLOY REPORT

**Date:** 2026-08-09  
**Plan:** [`docs/plans/creator-partnership-research-singleflight-hotfix.md`](../docs/plans/creator-partnership-research-singleflight-hotfix.md)  
**Status:** Implementation complete — **awaiting Elliott approval before deploy**  
**Production SCHEELS canary:** post-deploy only (`cec7d31d-ab53-4828-aae6-2c170dd3b293`)

---

## Root cause (confirmed)

1. **`touchExistingPartnershipSource`** treated `queued` as stale and re-launched `runPartnershipResearch` on every touch → N overlapping paid research waves.
2. **`runPartnershipResearch`** unconditionally set `researching` with no atomic claim → concurrent callers all performed up to 6× `web_search` each.
3. **No fencing** on terminal writes → stale executions could overwrite newer runs (theoretical; fixed proactively).

---

## Files changed

| File | Change |
|------|--------|
| `services/core/src/creator-partnership/research-singleflight.ts` | **New** — atomic claim, lease recovery, fenced terminal writes, helpers |
| `services/core/src/creator-partnership/research-singleflight.test.ts` | **New** — Postgres concurrency, fencing, lease, malformed timestamp tests |
| `services/core/src/creator-partnership/pipeline.ts` | Claim-first research, fenced success/failure, touch semantics, internal `skipResearch` |
| `services/core/src/creator-partnership/research.ts` | Telemetry passthrough, injectable `searchWeb` for tests, `PARTNERSHIP_RESEARCH_SEARCH_TARGET_COUNT` |
| `services/core/src/web-research/index.ts` | Extended `SearchWebOptions` + enriched `recordLlmUsage` metadata |
| `services/core/src/scripts/url-intelligence-sync-latency.ts` | Internal `skipResearch` on all submit loops |
| `services/core/src/scripts/url-intelligence-smoke.ts` | `skipResearch` on dedupe loops; poll in-flight research instead of duplicate claim |

---

## `RESEARCH_LEASE_MS`

**Value:** `30 * 60 * 1000` (30 minutes) — named constant in `research-singleflight.ts`.

**Reasoning:** Partnership research runs up to 6 sequential `searchWeb` calls plus page fetch and synthesis LLM. No hard per-run timeout exists today. 7-day `STALE_RESEARCH_MS` is terminal freshness only. 30 minutes is conservative tens-of-minutes: slow legitimate runs are not stolen; crashed `researching` owners recover without manual DB surgery.

---

## Safe legacy timestamp handling

**Problem:** Raw `(metadata->>'researchStartedAt')::timestamptz` can throw on malformed metadata and abort the entire claim statement.

**Shipped approach:** Regex guard `ISO_TIMESTAMP_PREFIX_RE = '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'` — timestamptz cast runs **only** when the prefix matches. Missing or non-matching values are treated as **expired/recoverable** without reaching the cast.

Same guard applied to terminal-stale `research->>'researchedAt'` in the claim predicate.

App-layer helpers (`isResearchLeaseExpired`, `shouldAttemptPartnershipResearch`) mirror the same rules for touch/submit decisions only — authoritative ownership remains the atomic Postgres `UPDATE … RETURNING`.

---

## Exact shipped atomic claim predicate

Single `UPDATE creator_partnerships … FROM prior … WHERE id = $partnershipId AND (`:

| Branch | Condition |
|--------|-----------|
| Normal | `research_status IN ('queued', 'failed')` |
| Terminal refresh | `research_status IN ('complete', 'needs_verification')` AND (`force` OR missing/unparseable `researchedAt` OR `researchedAt` older than `STALE_RESEARCH_MS`) |
| Lease recovery | `research_status = 'researching'` AND (`researchStartedAt` IS NULL OR fails ISO prefix regex OR valid prefix AND `researchStartedAt < now() - RESEARCH_LEASE_MS`) |

**Winner sets:** `research_status = 'researching'`, `pipeline_status = 'researching'`, `research_error = NULL`, new `metadata.researchRunId`, new `metadata.researchStartedAt`.

**Recovery telemetry:** structured `stale_research_lease_recovery` log (not paid `web_search`).

---

## Exact shipped fenced terminal predicate

All success and failure terminal writes use:

```sql
WHERE id = $partnership_id
  AND research_status = 'researching'
  AND metadata->>'researchRunId' = $current_research_run_id
```

Zero rows → structured `stale_research_execution` warn log; no status/research/decisionBrief overwrite.

---

## Queued / researching / lease behavior

| State | Behavior |
|-------|----------|
| `queued` | Claim-attempt allowed; exactly one winner executes paid work |
| `researching` + fresh lease | Claim fails; zero paid work |
| `researching` + expired/missing/malformed `researchStartedAt` | One atomic recovery claim; new run id; prior run fenced out |
| `complete` / `needs_verification` + fresh | No claim unless `force` |
| Touch/submit | May invoke `runPartnershipResearch`; claim-first prevents multi-execute |

---

## Real Postgres test results

Command: `node --import tsx --test src/creator-partnership/research-singleflight.test.ts`

| Scenario | 20 concurrent claims | Result |
|----------|---------------------|--------|
| `queued` | 20 | **1 winner, 19 losers** ✓ |
| Fresh `researching` lease | 20 | **0 winners** ✓ |
| Expired `researching` lease | 20 | **1 winner, new run id, recovery event** ✓ |
| Malformed `researchStartedAt` | 20 | **No throw; 1 winner** ✓ |

Additional:

- Stale Run A success terminal write after Run B owner → **0 rows** ✓
- Stale Run A failure terminal write after Run B owner → **0 rows** ✓
- 20 parallel `runPartnershipResearch` (mocked research fn) → **1 execution** ✓

---

## Mocked search totals

- `PARTNERSHIP_RESEARCH_SEARCH_TARGET_COUNT = 6`
- Mocked `searchWeb` in unit test: **exactly 6 calls** per cycle (≤6) ✓
- Recovery winner path uses same research function → same 6-search maximum

---

## Internal `skipResearch` verification

- `submitCreatorPartnership(..., { skipResearch: true })` — no `runPartnershipResearch` launch; row stays `queued` ✓
- `runPartnershipResearch(..., { skipResearch: true })` — immediate return; zero research calls ✓
- Latency script: all 20 submit loops use `skipResearch: true` ✓
- Smoke dedupe section: all repaste submits use `skipResearch: true` ✓
- **Not exposed** on public HTTP/API

---

## Telemetry fields added (live `web_search`)

Passed through `searchWeb` → `recordLlmUsage.metadata`:

- `caller` / `module` — `creator_partnership.research`
- `context` — `user`
- `partnershipId`, `researchRunId`, `trigger`, `process`

**Non-paid:** `stale_research_lease_recovery` structured log on recovery claim win.

**Deferred:** `cached` indicator (link-fallback caching follow-up).

---

## Staging/dev fixture acceptance

**Smoke script:** `pnpm exec tsx src/scripts/url-intelligence-smoke.ts` (dev DB)

- Plain URL routing + partnership create: pass
- 20× sync submit with `skipResearch`: pass (dedupe latency section)
- DB dedupe / source attach on SCHEELS fixture: pass (`sameIdOnRepaste`, tracking attach)
- Live research: first `askBenson` claims research; smoke **polls** in-flight owner to terminal (updated to avoid duplicate claim no-op)
- Feature-flag-off legacy routing: pass

**Note:** Smoke script updated post-implementation to poll in-flight research instead of calling `runPartnershipResearch` when already `researching` (correct singleflight behavior).

---

## Regression suite

```
node --import tsx --test src/creator-partnership/*.test.ts
# 78 tests, 0 failures
```

Includes new `research-singleflight.test.ts` (13 tests) plus existing creator-partnership suite.

---

## Unexpected findings

1. **Smoke script behavior change:** Pre-hotfix smoke called `await runPartnershipResearch()` after `askBenson` had already claimed research → with singleflight that call correctly no-ops (`claimed:false`). Smoke updated to poll for in-flight completion.
2. **Mocked search unit test** takes ~7s (OpenAI synthesis fallback path when API key present may still run LLM in some envs) — test passes; consider env without key for faster CI later.
3. No schema migration required; metadata-only `researchRunId` / `researchStartedAt`.

---

## Confirmations

| Item | Status |
|------|--------|
| Migration | **None** |
| Link-fallback caching | **Deferred** (not implemented) |
| AI budget (`BENSON_LLM_DAILY_BUDGET_USD`) | **Remains $3** — unchanged |
| Throttle semantics (`shouldSkipBackgroundLlm`, user vs background) | **Unchanged** |
| Deployment | **Not performed** — stop for Elliott approval |
| Production SCHEELS canary | **Post-deploy only** |

---

## Recommended next step

1. Elliott reviews this report.
2. On approval: deploy via normal Benson deploy path.
3. Post-deploy: one controlled production SCHEELS canary on `cec7d31d-ab53-4828-aae6-2c170dd3b293` — verify single `researchRunId`, no N×6 burst on rapid re-submit.
