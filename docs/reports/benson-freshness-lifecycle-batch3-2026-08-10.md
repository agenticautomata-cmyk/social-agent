# Benson Freshness → Opportunity-State — Batch 3

**Date:** 2026-08-10 (local smoke 2026-08-11T00:16Z)  
**Mode:** Implementation only — **do not deploy in this pass**  
**Authoritative audit:** `docs/reports/benson-decision-quality-audit-2026-08-10.md`  
**Scope:** Batch 3 only — temporal currentness / lifecycle authority  
**Preserved:** Workspace/M85, Batch 1 evidence orchestration, Batch 2 Home eligibility contract, researchRunId fencing, email actionability, discovery skip, Creator Partnership lifecycle (except content_item lifecycle stamp edge), Gmail matching  

---

## Exact current freshness producer chain (before → after)

### Before (failure mode)

```
date extract (LLM/OCR/providers)
  → persist eventStartsAt/eventEndsAt + lifecycleStatus ≈ 'active' (hardcoded on many writes)
  → computeLifecycleStatus existed but was rarely persisted after ingest
  → soft filters differed by surface
  → expired-event-sweep hard-deleted only after COALESCE(end,start) < NOW()-10 days
  → operator summary/script frozen at ingest (“next event is Aug 8–9”)
```

### After (Batch 3)

```
evaluateTemporalState({ startsAt, endsAt, timezone, now })
  → current | upcoming | expired | unknown
       ↓
computeLifecycleStatus (dated path defers to temporal authority)
       ↓
persist on write (Ask Benson link / user opportunity update)
       ↓
runLifecycleRecompute (idempotent) inside expired-event-sweep cron
       ↓
Home eligibility: persisted expired/archived OR soft temporal / stale “next event” prose
       ↓
Operator surfaces: sanitizeStaleTemporalProse at normalize / discovery detail
```

Retention delete (10-day window) remains a **separate** late cleanup step and is **not** currentness.

---

## Temporal authority contract

```ts
evaluateTemporalState({ startsAt, endsAt, timezone, now })
  → { state: 'current' | 'upcoming' | 'expired' | 'unknown', effectiveStart, effectiveEnd, ... }
```

| Rule | Behavior |
|------|----------|
| Effective end | Prefer `endsAt`; fallback `startsAt` |
| End reached | Non-current **immediately** for operator/action surfaces |
| Date-only stamps | UTC midnight → expand to America/Chicago start/end of that calendar day |
| No dates | `unknown` — **not** false-expired |
| Retention | Irrelevant to currentness |
| Historical signal | Reuse `lifecycleStatus: expired` (no new enum) |

`isTemporallyCurrent` = `current | upcoming`.  
`isOperatorTemporallyCurrent` also rejects stale next/current/upcoming prose with past explicit dates.

---

## Timezone policy

- Default: **America/Chicago** (`DEFAULT_CREATOR_TIMEZONE`) unless item metadata has authoritative `timezone` / `timeZone`.
- Date-only event markers use Chicago day boundaries (binary search on `Intl` local calendar day).
- Avoids server-local midnight and raw UTC date-only “already past at 00:00Z” false expires for KC evening.

---

## Lifecycle mutation path

| Path | Behavior |
|------|----------|
| `creator-agent/temporal-state.ts` | Single currentness authority |
| `creator-agent/lifecycle.ts` | `computeLifecycleStatus` wired to temporal state; removed start-only +7-day grace |
| `inventory/lifecycle-recompute.ts` | Deterministic recompute; tags `reconcile:lifecycle_recompute_batch3` |
| `inventory/expire-sweep.ts` | **Recompute first**, then optional retention hard-delete |
| Worker `expired-event-sweep` | Logs `lifecycle_updated` + retention delete counts |
| Script `reconcile-lifecycle-freshness.ts` | One-shot safe recompute (no delete) |
| Ask Benson writes | `collect-from-link` / `user-opportunity-save` use `computeLifecycleStatus` |
| Evidence mutate | **Stops** forcing `lifecycleStatus: 'active'` on evidence persist |

---

## Files changed

| Path | Change |
|------|--------|
| `services/core/src/creator-agent/temporal-state.ts` | **New** `evaluateTemporalState` |
| `services/core/src/creator-agent/temporal-state.test.ts` | **New** fixtures (incl. Style Encore) |
| `services/core/src/creator-agent/stale-temporal-prose.ts` | **New** operator prose sanitizer |
| `services/core/src/creator-agent/lifecycle.ts` | Temporal authority integration |
| `services/core/src/creator-agent/index.ts` | Exports |
| `services/core/src/inventory/lifecycle-recompute.ts` | **New** recompute engine |
| `services/core/src/inventory/expire-sweep.ts` | Recompute before retention delete |
| `services/core/src/inventory/normalize.ts` | Sanitize summary; keep `summaryRaw` |
| `services/core/src/inventory/home-eligibility.ts` | Soft temporal + raw stale-prose gate |
| `services/core/src/inventory/home-eligibility.test.ts` | Batch 3 Home fixtures |
| `services/core/src/inventory/index.ts` | Exports |
| `services/workers/src/workflows/expired-event-sweep.ts` | Log lifecycle recompute |
| `services/core/src/ask-benson/collect-from-link.ts` | Lifecycle from dates |
| `services/core/src/ask-benson/user-opportunity-save.ts` | Lifecycle from merged dates |
| `services/core/src/ask-benson/evidence-orchestration/mutate.ts` | No lifecycle re-activate |
| `services/core/src/creator-interest/actions.ts` | Operator-facing summary sanitize |
| `services/core/src/scripts/reconcile-lifecycle-freshness.ts` | **New** one-shot reconcile |
| `services/core/src/scripts/smoke-lifecycle-batch3.ts` | **New** local smoke helper |
| `docs/reports/benson-freshness-lifecycle-batch3-2026-08-10.md` | This report |

---

## Migration

**No.** Reuses existing `lifecycle_status` values (`expired` / `archived`). No runner redesign.

---

## Reconciliation counts (local prod-like DB)

Command: `pnpm exec tsx src/scripts/reconcile-lifecycle-freshness.ts`

| Metric | Before | After |
|--------|--------|-------|
| Past-dated rows still operator-current (`active`/`upcoming`/`expiring_soon` and `COALESCE(end,start) < NOW()`) | **336** | **5** |
| Future-dated rows still operator-current | **764** | **764** |
| Recompute scanned (pass 1) | — | **1200** |
| Recompute updated (pass 1) | — | **1122** |
| Second pass updated (idempotent) | — | **0** |
| Rows deleted | — | **0** |
| Expired rows still queryable | — | **635** |

The remaining 5 “past-dated” by raw UTC SQL are **still temporally current under America/Chicago day/end rules** (e.g. date-only Aug 10 still current evening Aug 10 CDT; short windows ending `2026-08-11T00:00:00Z`). They are correctly `expiring_soon` / `upcoming` / `current` under the authority — not a residual stamp bug.

Style Encore fixtures after reconcile:

| id | topic | lifecycle |
|----|-------|-----------|
| `51738b24-5a79-4448-ae92-73f1217faaab` | Style Encore Overland Park | **expired** (undated + stale next-event prose) |
| `d1101683-c88b-4221-a1e3-ccfebb0063fd` | Store Happenings \| Style Encore… | **expired** (date-only start 2026-08-08) |
| `ed02f5a7-f9b9-42c0-ad52-fb2bde45888c` | Style Encore — luxury resale… | **expired** |
| `44396f4c-0768-4aab-8768-6e8271c443d3` | Buy & Sell Women’s Clothes… \| Style Encore | **active** (undated business listing, **no** next-event claim — historical entity watch OK) |

---

## Style Encore fixture result

Fixture intent: event Aug 8–9, 2026; now Aug 10, 2026 America/Chicago.

| Expectation | Result |
|-------------|--------|
| Event non-current | **PASS** — dated Store Happenings + prose entity → `expired` |
| Remains stored as evidence/history | **PASS** — rows not deleted; scripts retained |
| Not Top/Second Move | **PASS** — Home eligibility false; Home JSON has no “next event … August 8” |
| Ask Benson / detail do not call it “next event” | **PASS** — `sanitizeStaleTemporalProse` removes claim; injects worth-watching language |
| Allowed historical wording | **PASS** — “has run local promotions recently — worth watching…” |

---

## Tests

| Suite | Result |
|-------|--------|
| `temporal-state.test.ts` (today/tomorrow/yesterday/end-wins/Chicago/unknown/Style Encore) | pass |
| `home-eligibility.test.ts` (Batch 2 + Batch 3 soft gate) | pass |
| `expire-sweep.test.ts` | pass |
| `evidence-orchestration.test.ts` (Batch 1) | pass |
| `creator-facing-eligibility.test.ts` (Batch 2 durability) | pass |
| Combined regression (41 tests) | **pass 41 / fail 0** |

Covered checklist from the Batch 3 brief: 1–12 via unit + reconcile + smoke (idempotent sweep, Home consumes lifecycle, Batch 1/2 no regression, expired evidence queryable).

---

## Local smoke

| Check | Result |
|-------|--------|
| Stale Style Encore event → non-current | PASS (`expired`, Home ineligible) |
| Historical evidence remains | PASS (rows + scripts retained; 635 expired queryable) |
| Future/current legitimate events remain current | PASS (764 future-dated operator-current) |
| Home still renders | PASS (`/home` 200; `/api/pre-alpha/home` 200; `computeOperationalHomeData` ok) |
| No paid research | PASS (deterministic recompute only) |
| No 500s | PASS (API `/health` ok; dashboard Home 200) |
| Stale “next event Aug 8” absent from Home payload | PASS |

---

## Known limitations

1. **Frozen DB script text** is not rewritten in place — operator surfaces sanitize at read/normalize time; historical raw script remains for evidence.
2. **Some ingest writers** outside Ask Benson (newsletter, scanner, partnerships) may still stamp `active` at insert; the sweep/recompute corrects dated rows on the cron / one-shot path.
3. **Naive SQL `timestamp < NOW()`** can disagree with Chicago day-boundary currentness for same-day date-only rows (see residual count of 5) — authority is `evaluateTemporalState`, not that SQL heuristic.
4. **Undated business entity pages** without next-event claims can remain `active` (e.g. Style Encore Buy & Sell listing) — correct: not an expired occurrence.
5. **Deploy not performed** — running API/workers still on prior commit until deploy review.

---

## Deployment readiness

- No migration.
- Recompute is idempotent and non-destructive.
- Extend existing `expired-event-sweep` worker (already scheduled).
- After deploy: run `pnpm exec tsx src/scripts/reconcile-lifecycle-freshness.ts` once on the target DB if the worker has not yet fired; confirm Style Encore fixtures + Home.

**READY FOR DEPLOY REVIEW**
