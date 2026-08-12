# Benson Evidence Orchestration Batch 1 — POST-DEPLOY VERIFICATION

**Date:** 2026-08-10  
**Scope:** Deploy + verify Batch 1 only (Evidence → durable state → safe internal action)  
**Authoritative implementation report:** [`docs/reports/benson-evidence-orchestration-batch1-2026-08-10.md`](./benson-evidence-orchestration-batch1-2026-08-10.md)  
**Deploy path:** `pnpm benson:deploy-local` (initial deploy + one fingerprint redeploy after delta email-redact)

Batches 2–7 were **not** implemented.

---

## Pre-deploy confirmation

| Check | Result |
|-------|--------|
| Working tree includes Batch 1 modules (`evidence-orchestration/*`, `ask.ts` gate, tests, smoke) | **Yes** |
| Migration required for Batch 1 | **No** — JSONB ledgers only; no new migration file; no `benson_evidence_*` tables |
| Batch 2+ correction batches present as new work | **No** (Home eligibility / freshness recompute / contact-authority ranking not shipped) |
| Unrelated dirty-tree history | Present from prior Workspace/partnership deploys; deploy path fingerprints **current source** (same operational pattern as Workspace post-deploy). Batch 1 runtime surface is the Ask Benson orchestration gate. |
| Preserve Workspace / fencing / email actionability / discovery-skip | **Preserved** — no redesign; Migration 85 not reapplied |

Pre-deploy status was **DRIFT** (`source 24e58746deab4f0e` vs runtime `590b35e98495293a`).

---

## Deployed fingerprint

| Role | Fingerprint |
|------|-------------|
| **Source / MATCH** | `b7ee9e839d231923` |
| API | `b7ee9e839d231923` (started `2026-08-10T15:26:13.457Z`) |
| Workers | `b7ee9e839d231923` (started `2026-08-10T15:26:22.626Z`) |
| Dashboard | `b7ee9e839d231923` (built `2026-08-10T15:26:22Z`) |

`benson:deployment-status` → **MATCH** (“Source and runtime fingerprints match.”)  
Checked at `2026-08-10T15:37:07.737Z`.

---

## Health

| Surface | Result |
|---------|--------|
| API `GET /health` | `{"ok":true,...}` |
| Dashboard `:3000/` | HTTP 200 |
| Workers process | `tsx src/benson.ts` running |
| Ask Benson Workspace list | `GET /api/ask-benson/conversations?limit=3` → `ok: true` |

**Database targeted (running API):** `postgres://social_agent@localhost:5433/social_agent`

---

## Migration status

| Check | Result |
|-------|--------|
| Batch 1 migration applied | **None** — not required, not applied |
| `benson_evidence_events` / ledger tables | **Absent** (confirmed `to_regclass` null) |
| `benson_conversations` (Migration 85) | Present (11 columns); **not reapplied** |

---

## Production canary — evidence orchestration

Script: `services/core/src/scripts/canary-evidence-orchestration-batch1.ts`  
Mode: `BENSON_EVIDENCE_DRAFT_MODE=template_only` (no paid research / no LLM draft spend)

### Identifiers

| Field | Value |
|-------|-------|
| creatorId | `58f72ca2-32b2-4a74-b3dc-25d0f66cc15f` |
| conversationId | `f6fd60e7-681e-4c2e-b368-8627739fc39b` |
| contentItemId | `20556166-c19f-43aa-8413-d679abe3eaa8` |
| topic | Plato's Closet Canary |
| draftId | `9dd3fdbe-b892-4cf3-8fe3-172cdc31fc96` |
| draftStatus | `needs_approval` (not sent) |
| first messageId | `7fef7eca-851b-4268-8c4b-691d112c1e15` |
| repeat messageId | `ea71cfdf-c944-490b-9af2-e25d7254e6f7` |

### First submission

| Expectation | Result |
|-------------|--------|
| Correct entity association | **PASS** — resolved to Plato's Closet Canary opportunity |
| Durable evidence mutation | **PASS** — ledger persisted + contact-path hook |
| One assistant response | **PASS** — messageId written; Workspace `outputJson` has `evidenceOrchestration` + `responseDelta` |
| Delta-first answer | **PASS** — starts with `WHAT I DID` |
| No paraphrase dump | **PASS** — no rewards/history dump; no raw canary email in answer |
| Internal draft created/reused | **PASS** — draft `needs_approval`; answer “Draft updated” / create path |
| No email sent | **PASS** |
| No external form submitted | **PASS** (N/A for Plato text) |

### Idempotency (repeat same evidence)

| Expectation | Result |
|-------------|--------|
| No duplicate draft | **PASS** — draftCount remained `1` |
| No duplicate of repeated email key | **PASS** — `emailLedgerCount` stable at `2` across repeat (second unique canary email coexists with prior smoke email on same entity; repeat did not add a third) |
| Truthful reuse delta | **PASS** — `WHAT I DID` → “Draft updated”; STILL NEEDED optional; NEXT → Review draft |

Workspace persistence: conversation retained **2 user + 2 assistant** messages with structured orchestration output.

---

## Loews check

| Field | Value |
|-------|-------|
| partnershipId | `d1a5bad3-ac5d-42bd-ab70-b8685a471fa0` |
| contentItemId | `10210f5f-3ed5-41be-b8e4-cf9d16e9f53c` |
| brandName | Loews |
| URL | `https://www.loewshotels.com/influencer-stay-request` |

| Expectation | Result |
|-------------|--------|
| Associate official influencer-stay URL to Loews | **PASS** |
| `contactPathEvidence` persists (`official_form`) | **PASS** (`contactPathCount: 1`) |
| Existing pitch/research intact | **PASS** — research JSON unchanged; `existingPitchPreserved` metadata retained |
| Form submission approval-required | **PASS** — `submit_form: requires_approval`; STILL NEEDED notes not auto-submitted |
| Batch 4 supersession **not** implemented | **PASS** — `preferredPathRanked: false` |

Note: this Loews content item had **0** existing `outreach_emails` rows to preserve in-place; historical research/pitch markers in partnership metadata/research were verified unchanged.

---

## Approval-boundary result

| Action | Result |
|--------|--------|
| Persist evidence / update verified facts / contact-path hook | Safe auto (observed) |
| Internal draft create/update | Safe auto (`needs_approval` draft only) |
| Send email | Approval-gated — not sent |
| Submit official form | Approval-gated — not executed |

---

## Regression status

| Suite | Result |
|-------|--------|
| `conversations-terminal` + `research-correlation` + orchestration fixtures | **21/21 pass** (pre-redeploy) |
| `evidence-orchestration.test.ts` after redeploy | **14/14 pass** |
| Workspace conversation API list | **PASS** |
| researchRunId terminal correlation | **PASS** (included in conversations-terminal / research-correlation) |

Preserved systems (spot-checked by non-touch + green suites): Workspace/M85, researchRunId fencing, provider terminal handling, email actionability, discovery skip, partnership lifecycle — **not redesigned**.

---

## Unexpected findings

1. **First canary failed** because mutation summaries embedded the raw contact email in `WHAT I DID` (`Added verified local contact (email…)`), which the canary treated as evidence echo. Fixed by redacting the address from the delta summary line, then **redeployed** to fingerprint `b7ee9e839d231923`.
2. Plato canary associated to an opportunity that already had a prior local-smoke contact email, so `emailLedgerCount` started at `2` (two distinct emails), not `1`. Repeat still did not duplicate the repeated key or the draft.
3. Loews production row had no prior outreach draft rows (`existingDraftsPreserved: 0`); pitch integrity was validated via partnership `research` / metadata markers instead.

---

## Verdict

**BATCH 1 DEPLOYMENT VERIFIED**
