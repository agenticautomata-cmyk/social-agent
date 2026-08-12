# Benson Evidence Orchestration — Batch 1

**Date:** 2026-08-10  
**Mode:** Implementation only (no deploy, no production migration applied)  
**Authoritative audit:** `docs/reports/benson-decision-quality-audit-2026-08-10.md`  
**Scope:** Batch 1 only — Evidence → durable state → safe internal action  

---

## Implementation summary

Ask Benson now has a reusable **evidence orchestration** path that runs before partnership URL research and before the freeform LLM parrot path:

1. Classify operator-supplied evidence (contact, official form URL, rewards/program history, pitch context)
2. Associate to a durable entity/opportunity (high-confidence mutate; ambiguous → chooser; unrelated soft context → no wrong-entity attach)
3. Persist evidence once into JSONB ledgers with provenance + idempotency keys
4. Update verified contact facts / sponsor contact when email is present
5. Record a **contact-path evidence hook** for Batch 4 (no ranking/supersession yet)
6. Execute safe internal next step: create/update internal pitch draft (never send/submit)
7. Respond with a delta-first WHAT I DID / STILL NEEDED / NEXT answer (does not echo full user evidence)

Decorative “Draft a pitch” is no longer the success path for actionable sponsor evidence — orchestration creates/reuses a draft and suggests **Review draft**. External send/submit remain `requires_approval`.

---

## Files changed

| Area | Path |
|------|------|
| Orchestration modules | `services/core/src/ask-benson/evidence-orchestration/*` |
| Ask Benson gate | `services/core/src/ask-benson/ask.ts` |
| Exports | `services/core/src/ask-benson/index.ts` |
| Tests | `services/core/src/ask-benson/evidence-orchestration/evidence-orchestration.test.ts` |
| Smoke | `services/core/src/scripts/smoke-evidence-orchestration-batch1.ts` |
| Test glob | `services/core/package.json` (`src/ask-benson/**/*.test.ts`) |

---

## Schema / migration decision

**Migration: NO**

Existing JSONB structures cleanly support Batch 1 needs:

- `content_items.metadata.bensonEvidenceLedger[]` — provenance, idempotency (`normalizedKey`), association, `supersededBy` hook
- `creator_partnerships.metadata.bensonEvidenceLedger[]` — same
- `*.metadata.contactPathEvidence[]` — Batch 4 authority hook (`preferredCandidate`, `supersededBy`) without implementing ranking now
- Sponsor contact email / `contactVerificationStatus` / outreach drafts use existing tables

No new tables, no giant event system, no production migration applied.

---

## Orchestration contract

```
evidence interpretation
  → association result
  → mutations[]
  → safeActionsExecuted[]
  → blockers[]
  → responseDelta
```

Stored on assistant `outputJson` as:

- `responseDelta`
- `evidenceOrchestration` `{ version: 1, association, mutations, safeActionsExecuted, blockers, responseDelta }`
- optional `entityContext` for Workspace correlation

Entry points:

- `tryEvidenceOrchestration` — Ask Benson gate + Workspace persistence
- `runEvidenceOrchestration` — pure orchestration (tests/smoke)

Draft mode env (local/smoke): `BENSON_EVIDENCE_DRAFT_MODE=template_only|auto|none`  
Default `auto` tries existing `draftSponsorOutreachFromOpportunity`, falls back to template `createBensonOutreachDraft` (still `needs_approval`, never sent).

---

## Plato fixture result

Synthetic Plato evidence (rewards + parent campaign history + local email + pitch context):

- Opportunity resolved/created correctly
- Evidence ledger persisted with provenance
- Contact email written to sponsor contact (`verified_direct_email`)
- Internal pitch draft created (`needs_approval`)
- Assistant answer was delta-first (WHAT I DID…), not a paraphrase dump
- No send occurred

Covered by durable fixture test `1/2` and local smoke.

---

## Loews fixture result

Existing Loews partnership + historical pitch + operator paste of  
`https://www.loewshotels.com/influencer-stay-request`:

- Associated to the Loews partnership (soft context corroborated by host; same-brand variants merged)
- Official-form evidence + `contactPathEvidence` hook persisted
- Existing pitch subject/body preserved
- Historical research/decisionBrief retained
- Form submit recorded as `requires_approval` (not executed)
- Full contact-authority supersession **not** implemented (Batch 4)

Covered by durable fixture test `3`.

---

## Idempotency result

Repeated identical Plato evidence:

- Ledger contact_email entries remain count `1`
- Draft count remains `1` (`skipped_idempotent` / reuse)
- Answer reports no new durable changes / draft updated rather than duplicating artifacts

Covered by test `1/2` repeat + smoke second pass (`idempotent: true`).

---

## Approval boundary result

| Action | Batch 1 behavior |
|--------|------------------|
| Persist evidence / update verified facts | Safe auto |
| Contact-path hook | Safe auto (no Batch 4 ranking) |
| Internal pitch draft create/update | Safe auto |
| Send email | `requires_approval` — not executed |
| Submit official form | `requires_approval` — not executed |
| Publish | Approval-gated by contract |

Suggested-action contract prefers **Review draft** after execution; bare “Draft a pitch” is not emitted as an executable success action.

---

## Tests

```
node --import tsx --test \
  src/ask-benson/evidence-orchestration/evidence-orchestration.test.ts \
  src/ask-benson/conversations-terminal.test.ts \
  src/ask-benson/research-correlation.test.ts \
  src/ask-benson/provider-status.test.ts \
  src/ask-benson/user-opportunity-add.test.ts \
  src/sponsor-outreach/*.test.ts \
  src/creator-partnership/*.test.ts
```

**Result: 113 passed / 0 failed** (includes Batch 1 fixture suite: Plato, idempotent, Loews, ambiguous, unrelated, draft auto-exec, approval gate, failed/no-draft path, Workspace persistence, researchRunId terminal patch safety).

---

## Local smoke

```
BENSON_EVIDENCE_DRAFT_MODE=template_only \
  pnpm exec tsx src/scripts/smoke-evidence-orchestration-batch1.ts
```

**Result: SMOKE PASS**

Verified:

- one user input → one assistant result with delta
- durable ledger + sponsor contact mutated
- draft exists (`needs_approval`, not sent)
- reload shows `evidenceOrchestration` / `responseDelta`
- repeated input does not duplicate evidence/draft
- no paid partnership research launched

---

## Known limitations intentionally deferred to Batch 4

- Preferred contact-path ranking / supersession with history UI
- Replacing stale “no verified contact / Mark Champa unverified” narrative from stronger official-form evidence
- Cross-system CRM vs partnership contact authority unification
- Form-field blocker extraction for influencer stay request completion

Batch 1 provides the `contactPathEvidence` / ledger hook Batch 4 will consume.

Also deferred (other batches): Home eligibility, freshness lifecycle, executable Home CTAs, operator summary shaping, program library quiet mode.

---

## Deployment readiness

- No production migration required
- No deploy performed this pass
- Preserved: Workspace / Migration 85, researchRunId fencing, provider terminal handling, email actionability, discovery skip, partnership lifecycle / FV / Creator Play, Gmail matching
- Local tests + smoke green

**READY FOR DEPLOY REVIEW**
