# Benson Freshness Lifecycle — Batch 3 Post-Deploy Verification

**Date:** 2026-08-10 / verified 2026-08-11T01:38Z–01:50Z  
**Implementation report:** `docs/reports/benson-freshness-lifecycle-batch3-2026-08-10.md`  
**Scope:** Batch 3 deploy + verify only  
**Not started:** Batch 4+  

---

## Deployed fingerprint

| Field | Value |
|-------|-------|
| Source / API / dashboard / worker | **`cb217d359a8e4240`** |
| Parity | **MATCH** |
| API started | `2026-08-11T00:39:30.426Z` |
| Workers started | `2026-08-11T00:39:40.635Z` |
| Dashboard built | `2026-08-11T00:39:40Z` |
| Deploy path | `pnpm benson:deploy-local` |

Health after deploy:

- API `/health` → `ok: true`
- Dashboard `/` and `/home` → 200
- Workers process up (`tsx src/benson.ts`, 18 workers)
- `/api/pre-alpha/home` → 200

---

## Resolved DB

Running API + workers:

`postgres://social_agent:***@localhost:5433/social_agent`

Same DB used for reconcile/verify scripts.

---

## Migration

**None applied.** `benson:deploy-local` does not run `migrate:pre-alpha`. Batch 3 uses existing `lifecycle_status` columns only.

---

## Worker / sweep status + cadence

| Field | Value |
|-------|-------|
| Worker | `expired-event-sweep` |
| Cadence | **every 24h** (`BENSON_EXPIRED_SWEEP_MS` default `86400000`) |
| Initial delay | **3 minutes** after worker start |
| Heartbeat | `healthy` |
| First post-deploy success | `2026-08-11T00:42:59.727Z` (`lastDurationMs` ≈ 10933) |

Live worker log (new Batch 3 format):

```
[expired-event-sweep] lifecycle_updated=15 lifecycle_scanned=853 retention_scanned=193 deleted=193 sample="Dragons and Fantastic Beasts"
```

Confirms:

1. Lifecycle recompute runs **before** retention deletion  
2. `lifecycle_updated` logged **separately** from retention `deleted`  
3. Worker is scheduled and running (not papered over by scripts alone)

---

## One-shot reconcile

**Not required after deploy.**

Deployed worker already executed the new recompute path (`lifecycle_updated=15`). Per instructions, no immediate redundant `reconcile-lifecycle-freshness.ts` run.

Pre-deploy note: implementation-time reconcile had already demoted many rows; worker cleaned remaining deltas (15) plus retention deletes (193 ancient rows).

### Controlled worker-path exercise (same `runExpiredEventSweep` entry the cron calls)

| Step | Result |
|------|--------|
| Insert past-dated KC event stamped `lifecycle=active` | created |
| Sweep pass 1 | `active` → **`expired`**; row still exists |
| Sweep pass 2 | **`lifecycleUpdated=0`**, `retentionDeleted=0` |
| Dry recompute pending | **0** |
| Fixture cleanup | deleted (verify-only row) |

---

## Style Encore production fixture

| id | topic | lifecycle | Home eligible | Notes |
|----|-------|-----------|---------------|-------|
| `51738b24-5a79-4448-ae92-73f1217faaab` | Style Encore Overland Park | **expired** | **false** | Raw script still has “next event…”; operator summary sanitized |
| `d1101683-c88b-4221-a1e3-ccfebb0063fd` | Store Happenings \| Style Encore… | **expired** | **false** | Date-only start 2026-08-08 |
| `44396f4c-0768-4aab-8768-6e8271c443d3` | Buy & Sell Women’s Clothes… \| Style Encore | **active** | **true** | Undated business listing, **no** stale next-event claim — intentional |

| Check | Result |
|-------|--------|
| Rows/evidence still stored | PASS |
| Not Top / Second Move opportunity | PASS (expired IDs absent from Home opportunity cards) |
| No “next event … August 8” in Home / normalized summary / discovery detail | PASS |
| Historical / worth-watching language allowed | PASS (`worth watching` injected; negative “no verified current event” may remain) |
| Undated entity listing may stay active | PASS |

Home also shows a generic action `Start sponsor pitch: Style Encore` → `/sponsor-intelligence` (sponsor CRM CTA, not the expired event opportunity card).

---

## Current / future control results

| Control | Result |
|---------|--------|
| Today KC date-only → `current` | PASS |
| Tomorrow → `upcoming` | PASS |
| Yesterday-ended → `expired` | PASS |
| No-date → `unknown` / lifecycle `active` (not false-expired) | PASS |
| Explicit end timestamp wins | PASS (`endWins: expired`) |
| Future legitimate event Home-eligible when otherwise valid | PASS (sample: Kemper Gala `upcoming`, eligible) |

Timezone: America/Chicago day boundaries used by `evaluateTemporalState`.

---

## Operator prose

| Surface | Stale “next event Aug 8–9” |
|---------|----------------------------|
| Home payload | Absent |
| `normalizeInventoryItem` summary | Absent (`assertsNext=false`) |
| Discovery detail summary (`getDiscoveryRecord`) | Absent |
| Raw DB `script` (evidence/debug) | May still contain frozen ingest text — intentional |

---

## Ingest-writer limitation

Some writers may still stamp `active` at insert. Verified correction path:

- **Bounded by worker cadence:** first run ~3 minutes after worker start, then every **24h**
- Incorrectly-active dated rows are corrected by `runLifecycleRecompute` inside `expired-event-sweep`
- Controlled fixture proved same path: `active` → `expired` without relying on 10-day retention delete

Worker is scheduled and healthy — **no STOP**.

---

## Batch 1 / 2 regressions

| Check | Result |
|-------|--------|
| Batch 1 evidence orchestration (`runEvidenceOrchestration`, template_only) | PASS — handled, delta-like, mutations executed; `send_email:requires_approval` |
| No external send/submit executed | PASS |
| Batch 2 Job Opportunities `2188d040-…` | `hidden_raw_signal`, Home ineligible |
| Employment title not in Home priorities | PASS |
| researchRunId / terminal chat fencing tests | PASS (7/7) |
| Discovery skip / email actionability | Untouched (no Batch 3 changes) |
| No paid research in verify path | PASS |
| No 500s on health / Home | PASS |

---

## Unexpected findings

1. **Home `dailyBriefing.topEvents` still includes “Open Interviews for Multiple Positions”** — categorized `luxury_resale`, `isEmployment=false`, so it is outside the Batch 2 Job Opportunities fixture gate. Not a Batch 3 temporal failure; candidate for a later employment-intent hardening batch.
2. Style Encore sanitized summary can retain the **negative** phrase “No verified current event…” after removing the stale “next event” sentence — consistent with non-current state, not an upcoming assertion.
3. Worker retention delete (`deleted=193` on first post-deploy tick) removed ancient rows past the 10-day window; this is **not** used as currentness proof. Lifecycle expiry remains independent.

---

## Verdict

**BATCH 3 DEPLOYMENT VERIFIED**
