# Benson Program Library MVP — 2026-08-11

**Date:** 2026-08-11  
**Scope:** Quiet Program Library + safe enrichment + activation linkage  
**Status:** Implementation complete — **DO NOT DEPLOY** (awaiting deploy review)

---

## Goal

Durable Program Library for affiliate/creator/influencer/referral/ambassador programs that **does not create urgency** until explicitly activated.

**Core distinction preserved:**
- **Program Library** = program exists; could make money someday
- **Active opportunity** = reason to act now (via existing creator-partnership workflow after **Activate**)

---

## Data model used

**No new migration.**

Reused existing durable stores:

| Store | Role |
|-------|------|
| `creator_partnerships` | Primary program record + lifecycle linkage |
| `content_items` (1:1) | Inventory projection + Home/Discover eligibility hooks |
| `creator_partnerships.metadata.programLibrary` | Structured program fields, claims, conflicts, provenance |
| `creator_partnerships.metadata.programLibraryMode` | `saved` \| `activated` \| `inactive` |
| `content_items.metadata.programLibraryQuiet` | Shared quiet-library authority (existing Home hook) |

**Why no migration:** Batch 7 audit + Home eligibility already defined quiet-library metadata conventions. `creator_partnerships` + JSONB metadata supports canonical dedupe, provenance, activation linkage, and evidence without a parallel table.

---

## Canonical identity / dedupe

**Key:** normalized brand + normalized program name + optional official URL host + optional network (network alone never collapses brands).

Implementation: `services/core/src/program-library/canonical.ts` → `buildCanonicalProgramIdentity()`

Lookup: `metadata.programLibrary.canonicalIdentity` via SQL in `findProgramLibraryIdByCanonical()`.

**Ask Benson / repeat intake:** `saveProgramToLibrary()` upserts by canonical identity — updates fields, appends evidence URLs, records conflicts; never duplicates.

---

## Library lifecycle

| Mode | Behavior |
|------|----------|
| **saved** (default) | Quiet — no Home/Discover/Action Center surfacing; no auto research |
| **activated** | Clears quiet flags; links to same partnership row; enters creator-partnership workflow; optional research on explicit activate |
| **inactive** | Treated as quiet (same exclusion rules as saved) |

Saved records:
- `content_items.creatorValueStatus = hidden_raw_signal`
- `research_status = complete` with `programLibrarySkipAutoResearch: true`
- No `runPartnershipResearch` on save/list/read

---

## Activation linkage

**Endpoint:** `POST /api/program-library/:id/activate`

1. Preserves Program Library payload + history
2. Sets `programLibraryMode = activated`, clears quiet flags on content item
3. **Same row** is the linked creator partnership (`linkedPartnershipId = id`)
4. Repeated Activate → `reusedExistingActive: true` (no duplicate opportunity)
5. **Deactivate** → returns to quiet saved state; history/evidence retained

Partnership href surfaced in UI when activated: `/partnerships/:id`

---

## Evidence / provenance behavior

Field-level claims (`FieldClaim`) with authority:
- `operator_supplied` (never silently overwritten)
- `official_brand`, `affiliate_network`, `official_help`, `verified_contact`, `secondary_source`

Conflicts stored in `programLibrary.conflictingClaims[]` when official evidence differs from operator-supplied values.

Human-facing verification states (UI labels only):
- Operator supplied, Verified official, Verified network, Secondary source, Needs verification, Conflicting information, Possibly inactive

Seed records use `operatorSuppliedMasterList: true` → **Operator supplied**, not independently verified.

---

## Enrichment authority order

1. Official brand creator/affiliate/partnership page  
2. Official affiliate-network listing  
3. Official help/terms/FAQ  
4. Verified brand contact material  
5. Reputable secondary source  
6. Operator-supplied (preserved; conflicts surfaced)

**Verify missing info:** `POST /api/program-library/:id/verify`  
- Uses `searchWeb` with `context: 'background'`, `caller: 'program_library.verify_missing_info'`
- Respects `shouldSkipBackgroundLlm('web_search')`
- Skips if verified within 7 days (unless `force`)
- Does **not** activate program

**Deferred:** automatic gradual background enrichment worker (scope expansion) — manual Verify only in MVP.

---

## Research gating / safety

| Guard | Implementation |
|-------|----------------|
| No research on save | `skipResearch` equivalent via metadata + pipeline early return |
| No research on Home/list/detail read | Reads only — no enrichment hooks on render |
| Partnership research blocked for quiet library | `runPartnershipResearch()` returns early when `programLibraryMode` is `saved`/`inactive` or `programLibrarySkipAutoResearch` |
| Background budget | `verifyProgramMissingInfo` checks `shouldSkipBackgroundLlm` |
| Tests | Mock `testSearchWeb` only — **no paid searches in test suite** |
| Seed | No web search — idempotent DB upsert only |

---

## UI route / surface

| Route | Purpose |
|-------|---------|
| `/program-library` | Mobile-first list, filters, Add Program form |
| `/program-library/[id]` | Detail: links, terms, evidence, discrepancies, Activate / Verify / Return to library |

**Nav:** Sponsors group → **Program Library** (`dashboard/lib/opportunities-ui.ts`)

Cards show human labels only (no internal enum keys).

---

## Ask Benson integration

**Hook:** `tryProgramLibraryIntake()` in `ask.ts` — runs **before** partnership URL research storm.

Handles:
- “Save FlexPro Meals affiliate program”
- “This looks like an affiliate program” + URL
- Delta-first responses via `formatProgramLibraryDeltaAnswer()`

Does **not** auto-activate. Does **not** trigger paid research.

Image/screenshot path: **not added** (per scope — use existing evidence orchestration separately if needed later).

---

## 15-program seed results

**Script/API:** `POST /api/program-library/seed` → `seedProgramLibrary()`

| Check | Result |
|-------|--------|
| All 15 exist | **Pass** (after seed) |
| Rerun idempotent | **Pass** (`created: 0`, `updated: 15` on second run) |
| Operator provenance retained | **Pass** (`verificationLabel: Operator supplied`) |
| Not marked officially verified by seed | **Pass** |
| No active opportunities created | **Pass** (all `mode: saved`, quiet) |
| No paid research during seed | **Pass** |

Programs: FlexPro Meals, KC Wine Road, KC Chiefs Pro Shop, Dream KC Smoke Shop, BodymetRx KC, KC Cabinetry & Stone, Prestige Transportation KC, LEGOLAND Discovery Center KC, LM Connect KC, Missouri Restaurant Association, FASHIONPHILE, The RealReal, thredUP, Poshmark, LTK.

---

## Quiet-library proof (Home / Discover / Action Center)

| Surface | Authority | Test |
|---------|-----------|------|
| **Home** | `inventory/home-eligibility.ts` → `quiet_library_only` | **Pass** |
| **Discover** | SQL filter on `programLibraryQuiet` + `ingest != program_library` in `listOpenDiscoveries` | **Pass** (metadata gate) |
| **Action Center** | Uses `isHomeEligible()` on inventory items — saved programs ineligible | **Pass** (via shared Home eligibility) |
| **Auto research** | Pipeline early return for quiet library | **Pass** |
| **Paid search on list/read** | No enrichment on render | **Pass** |

---

## Tests

**File:** `services/core/src/program-library/program-library.test.ts`  
**Result:** **11/11 pass**

Coverage:
- Canonical dedupe
- Operator vs official conflict preservation
- Home quiet eligibility
- Discover exclusion metadata
- Enrichment with mock search + budget gate
- 15-seed idempotency + operator-supplied verification state
- Activation reuse + deactivation + research suppression
- Ask Benson text intake delta response

---

## Production files changed

### Core
- `services/core/src/program-library/*` (new module)
- `services/core/src/creator-partnership/pipeline.ts` (quiet-library research guard)
- `services/core/src/creator-interest/actions.ts` (Discover SQL exclusion)
- `services/core/src/ask-benson/ask.ts` (Program Library intake hook)
- `services/core/package.json` (export + test glob)

### API
- `services/api/src/routes/program-library.ts` (new)
- `services/api/src/server.ts` (mount `/api/program-library`)

### Dashboard
- `dashboard/app/program-library/**` (new)
- `dashboard/lib/opportunities-ui.ts` (nav link)

**Not changed:** Home memory fixes, scrape guardrails, migrations, creator-partnership lifecycle semantics, email actionability, discovery skip.

---

## Deployment readiness

| Item | Status |
|------|--------|
| Implementation | Complete |
| Tests | 11/11 green |
| Migration required | **No** |
| Seed on deploy | Run `POST /api/program-library/seed` once (idempotent) |
| Deploy | **Not executed** — awaiting review |

---

PROGRAM LIBRARY MVP READY FOR DEPLOY REVIEW
