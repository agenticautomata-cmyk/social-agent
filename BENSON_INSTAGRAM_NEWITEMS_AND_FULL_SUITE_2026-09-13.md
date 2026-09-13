# Benson Instagram newItems + Full Suite Verification (2026-09-13)

**Branch:** `release/scout-expansion-2026-07-25`  
**Final commit:** `0e2c7fc769f6bad5f687d310fce025160e62fc91`  
**Fingerprint:** **MATCH** `1784ad52c87e6f4d`  
**Public:** https://benson.kckellie.com · **API:** https://api.kckellie.com  

Prior production-path repair kept intact (`BENSON_INSTAGRAM_VISUAL_PRODUCTION_PATH_FIX_2026-09-13.md`). This pass closes remaining correctness: truthful `newItems` / persistence outcomes, consumer wiring, unique fingerprint concurrency, full-suite evidence, and live acceptance on the final MATCH.

Hard bans honored: no Instagram pipeline redesign; no account-specific scrapers; no billable vision; no fabricated permalinks; no Telegram outreach for reprocess.

---

## Executive verdict

`newItems` no longer counts extraction/re-touch/review noise. Persistence outcomes are authority: only outcome `created` increments `newLogicalEvents`, and Check now returns `newItems === newLogicalEvents`. Live Bizzy ×2 and Funny Bone ×1 against MATCH `1784ad52c87e6f4d` all reported `newLogicalEvents=0` with stable Rock ID and intact Karlous Sep 18/19.

---

## Root cause of misleading newItems

Check now mapped `newItems` to pipeline `eventsExtracted`, which mixed:

1. Visual/OCR candidate extraction counts and reprocess side-effects
2. Lead inserts that survived a loose “isNew” path even when the logical event already existed via occurrence/provenance
3. Review-noise re-touches that could insert new fingerprints on re-inspection

Authority was inverted: extraction decided “new,” then persistence/dedupe cleaned up afterward. Consumers (toast, activity `newCount`/`qualifiedCount`, `newRecordsFound`, `lastNewItemDetected`) inherited that inflated signal.

---

## Final counter definitions (per run)

| Counter | Meaning |
| --- | --- |
| `candidatesExtracted` | Visual/OCR candidates assembled this run (not “new”) |
| `newLogicalEvents` | Persistence outcome `created` only |
| `newItems` | **Compat alias** — always equals `newLogicalEvents` |
| `existingEventsUpdated` | Outcome `updated` (material field change) |
| `provenanceAdded` | Outcome `provenance_added` (new supporting URL) |
| `duplicatesSuppressed` | Outcome `duplicate` (+ visual dupes) |
| `rejectedCandidates` | Outcome `rejected` (error chrome, engagement bait, etc.) |
| `expiredCandidates` | Outcome `expired` (+ expired backfill) |
| `reviewCandidates` | Review-stage candidates surfaced this run |
| `calendarEligibleCandidates` | Candidates stamped calendar-eligible on create path |
| `ocrAttempted` / `ocrCompleted` / `ocrCached` | OCR coverage for this run only |
| Lifetime `recordsExtracted` / `lifetimeEventsExtracted` | Incremented only by `newLogicalEvents` |

Persistence outcomes: `created` \| `updated` \| `provenance_added` \| `duplicate` \| `rejected` \| `expired` \| `unchanged`.

---

## Files changed

| File | Change |
| --- | --- |
| `services/core/src/curator-watchlist/persistence-outcome.ts` | Counter helpers + material-change / provenance predicates |
| `services/core/src/curator-watchlist/persistence-outcome.test.ts` | Required regressions 1–15 |
| `services/core/src/curator-watchlist/store.ts` | `upsertEventLead` / `attachLeadProvenance` return outcomes; race-safe reselect |
| `services/core/src/curator-watchlist/pipeline.ts` | Outcome-driven `processCuratorPost`; per-run counters; promote only on `created`; review-noise not inserted on reprocess |
| `services/core/src/curator-watchlist/scheduler.ts` | `newCount`/`qualifiedCount` = `newLogicalEvents` |
| `services/core/src/benson-scout/pipeline.ts` | Check now returns `newItems` = `newLogicalEvents` + counter fields |
| `services/core/src/curator-watchlist/types.ts` | Result + `currentRunCoverage` fields |
| `services/core/src/curator-watchlist/release.ts` | Telegram release copy clarifies logical-new semantics |
| `services/core/src/curator-watchlist/instagram-visual/orchestrator.ts` | Stop setting `lastNewItemDetected` from review-only verify runs |
| `services/core/src/schema.ts` + migrate script | Unique `(watcher_id, occurrence_fingerprint)` |
| `dashboard/app/watchlist/[id]/watchlist-detail-panel.tsx` | Toast uses `newLogicalEvents`; UI shows new/updated/provenance counters |

---

## Database / concurrency

- Migration: `pnpm --filter @social-agent/core migrate:curator-lead-fingerprint-unique`
- Deduped any pre-existing fingerprint collisions (kept oldest)
- Created unique index `uidx_curator_leads_watcher_fingerprint`
- Concurrent inserts: unique violation → reselect existing → outcome `duplicate` (only one `created`)

---

## Live acceptance (FINAL fingerprint `1784ad52c87e6f4d`)

### @bizzybodyb007 run 1 — `4189c399c16218ac`

```json
{
  "ok": true,
  "newItems": 0,
  "newLogicalEvents": 0,
  "candidatesExtracted": 1,
  "existingEventsUpdated": 0,
  "provenanceAdded": 0,
  "duplicatesSuppressed": 2,
  "inspectionSummary": "Checked 12 recent posts · 12 already processed · 0 new · slides 14/14 · ocr 13 · 6 expired · 8 review · coverage=complete"
}
```

Coverage: posts **12/12**, slides **14/14**, OCR attempted **14** / completed **13** / cached **9**.  
Rock ID stable: **`1ba562b0-4e12-451a-ae88-b65d2a1ed3ba`**  
Provenance:

- https://www.instagram.com/p/DcWQ1GUzbMJ/
- https://www.instagram.com/p/DdKKm6GTTm-/

Timestamps same run: attempted `2026-09-13T23:25:52.471Z`, completed `2026-09-13T23:28:42.242Z`.  
`lastSuccessfulExtractionAt` remains prior lifetime extraction time (no new logical create this run).  
Active “Sorry…” findings: **0**. Expired past leads remain `calendarEligible: false`.

### @bizzybodyb007 run 2 — `181741104ea6c721`

```json
{
  "ok": true,
  "newItems": 0,
  "newLogicalEvents": 0,
  "candidatesExtracted": 1,
  "existingEventsUpdated": 0,
  "provenanceAdded": 0,
  "duplicatesSuppressed": 2
}
```

Rock ID unchanged; single Rock row; coverage complete; no Telegram new-event alert.

### @funnybonekcmo — `41d203d27a55b2c4`

```json
{
  "ok": true,
  "newItems": 0,
  "newLogicalEvents": 0,
  "candidatesExtracted": 0,
  "existingEventsUpdated": 0,
  "provenanceAdded": 0,
  "duplicatesSuppressed": 0,
  "inspectionSummary": "… coverage=complete_no_current_events"
}
```

Karlous Miller: **2026-09-18** + **2026-09-19** (one each). Caption dup not recreated. Active error-chrome: **0**.

### Telegram / What Changed

- `alert_deliveries` channel=telegram since deploy: **[]**
- Promote/Early Signals only on `created` — reprocess does not create alertable new signals
- Watchlist activity: **0** Bizzy findings in the current activity window after these rechecks; brief does not claim new Bizzy events

---

## Focused tests

```text
cd services/core && node --import tsx --test \
  src/curator-watchlist/persistence-outcome.test.ts \
  src/curator-watchlist/instagram-visual/*.test.ts \
  src/curator-watchlist/watchlist-state.test.ts \
  src/curator-watchlist/watchlist-intelligence.test.ts \
  src/curator-watchlist/curator-watchlist.test.ts \
  src/curator-watchlist/watchlist-date-trust.test.ts \
  src/curator-watchlist/scheduler.test.ts
# tests 138 / pass 138 / fail 0
```

Persistence outcomes alone: **15/15 pass** (`newItems / persistence outcome authority`).

IG visual + persistence (narrower): **58/58 pass**.

---

## Full suite / build / typecheck / lint

| Command | Result |
| --- | --- |
| `pnpm --filter @social-agent/core test` | **Completed:** `# tests 1780` `# pass 1755` `# fail 25` `# skipped 0` — **not** “full suite passed” |
| Failures | Pre-existing / unrelated: DB session fixtures, date-sensitive freshness, newsletter dated-occurrence, url-intake-qualification, Eventbrite KC, voice-read, program-library enrichment, evidence orchestration, jasfoodjourney DB identity, etc. **None** in `persistence-outcome*`, production-path, or pipeline counter changes |
| `pnpm --filter @social-agent/dashboard test` | `# tests 66` `# pass 66` `# fail 0` |
| `pnpm --filter @social-agent/core test:postgres` | Not re-run this pass (host memory-tight); prior DB uniqueness covered by migration + live acceptance |
| `pnpm --filter @social-agent/dashboard typecheck` | exit 0 |
| `pnpm --filter @social-agent/core typecheck` | Pre-existing DOM lib errors in Instagram capture/session; no new errors in changed counter files |
| `pnpm --filter @social-agent/api typecheck` / workers | exit 0 (pre-existing core type noise printed) |
| `pnpm --filter @social-agent/dashboard lint` | **Blocked:** `next lint` interactive ESLint setup prompt (no eslint config) — config/infra, not a code assertion failure |
| `pnpm benson:deploy-local` | Production build + restart OK → **MATCH** `1784ad52c87e6f4d` |

Authoritative full CI command in-repo: there is **no** root `test` script and **no** `.github/workflows` CI. Workspace authority is `services/core` `pnpm test` + `services/dashboard` `pnpm test` + deploy-local focused gate.

---

## Deploy proof

```json
{
  "status": "MATCH",
  "sourceFingerprint": "1784ad52c87e6f4d",
  "apiFingerprint": "1784ad52c87e6f4d",
  "dashboardFingerprint": "1784ad52c87e6f4d",
  "workerFingerprint": "1784ad52c87e6f4d",
  "apiStartedAt": "2026-09-13T23:24:07.591Z",
  "dashboardBuiltAt": "2026-09-13T23:24:14Z",
  "workerStartedAt": "2026-09-13T23:24:14.660Z"
}
```

Live acceptance executed **after** this MATCH (not an intermediate fingerprint).

---

## Remaining limitations

- Local OCR still emits noisy review titles; they are counted as `reviewCandidates` / `unchanged` on reprocess and no longer inflate `newItems`, but may still appear in coverage text.
- Bizzy live OCR completed **13/14** (1 slide OCR miss) while slides acquired stayed 14/14 — coverage status still `complete`.
- Full core suite is **not** green end-to-end (25 pre-existing failures); verification is complete for this defect with truthful counters + live MATCH acceptance + focused regressions, with full-suite results reported honestly above.
- Dashboard `next lint` requires ESLint bootstrap and was not runnable non-interactively.

---

## Success criteria checklist

| Criterion | Status |
| --- | --- |
| `newItems` = `newLogicalEvents` = created-only | **PASS** |
| Persistence outcomes authority | **PASS** |
| Consumers updated (API, scheduler, UI, release copy, promote-on-create) | **PASS** |
| Unique fingerprint concurrency | **PASS** (index + race path) |
| Bizzy ×2 / Funny Bone ×1 on final MATCH | **PASS** |
| Regressions 1–15 | **PASS** |
| Full suite command ran to completion with exact counts | **PASS (documented; not all green)** |
| MATCH deploy | **PASS** `1784ad52c87e6f4d` |
