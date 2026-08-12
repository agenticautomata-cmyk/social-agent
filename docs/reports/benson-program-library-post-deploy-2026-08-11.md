# Benson Program Library — Post-Deploy Verification — 2026-08-11

**Date:** 2026-08-11 (~21:28 UTC)  
**Authoritative pre-deploy report:** `docs/reports/benson-program-library-mvp-2026-08-11.md`  
**Scope:** Program Library MVP + partnership pipeline quiet filter only

---

## Pre-deploy verification

### Tests (final counts)

| Suite | Result |
|-------|--------|
| Program Library (`program-library.test.ts`) | **12/12 pass** (includes new pipeline quietness test) |
| Home eligibility | pass |
| Scrape web-search guardrails | pass |
| Home memory / Intl formatter bundle | **39/39 pass** |
| **Combined critical regression run** | **77/77 pass** |

### Pipeline quietness fix (added for deploy)

**Gap found:** `listCreatorPartnerships()` returned all `creator_partnerships` rows, including quiet Program Library saves.

**Minimal fix:**
- `services/core/src/creator-partnership/pipeline.ts` — SQL filter: exclude `metadata.programLibrary` unless `programLibraryMode = activated`
- `services/core/src/creator-partnership/activities.ts` — same filter for email fingerprint candidates
- `services/core/src/program-library/eligibility.ts` — `isActivePartnershipPipelineRecord()` helper

**Verified:**
- Saved Program Library records (`mode=saved`) → **visible in Program Library**, **absent from** `/api/creator-partnerships` list
- After **Activate** → appear in partnerships list (same row ID)
- After **Deactivate** → removed from partnerships list again
- **Repeated Activate** → `reusedExistingActive: true`, no duplicate

### Browser / mobile smoke (390×844 viewport)

| Check | Result |
|-------|--------|
| `/program-library` loads | **200** |
| All 15 seed brands render | **Pass** (plus 5 test artifacts from dev DB) |
| Human labels only | **Pass** — Saved, Operator supplied, KC Local, Affiliate (no enum keys) |
| Filters present | **Pass** — All, KC Local, National, Affiliate, Creator/Influencer, Referral, Activated, Needs verification |
| `/program-library/[id]` detail | **200** — FlexPro Meals: commission 5%, audience 40%, Troost |
| Open details | **Pass** — valid durable UUID route |
| Activate / Return to library buttons | **Present** on detail (API verified below) |
| Verify missing info button | **Present** — not clicked during smoke (avoid paid search) |
| Add program form | **Pass** on list page |
| No 404 CTA | **Pass** |
| Partnerships hub | Saved FlexPro **not** listed before activation |

**Edit:** Detail page is read-only; edits via **Add program** form + `PATCH /api/program-library/:id` (covered by unit tests). No detail inline editor in MVP.

---

## Deploy

**Method:** API restart + dashboard production rebuild (new `/program-library` routes)  
**Fingerprint:** `21fe6e1efdc55fb1`  
**Migrations:** None  
**Voicebox / n8n:** Not started  

### Deployed files (scoped)

**Core**
- `services/core/src/program-library/**`
- `services/core/src/creator-partnership/pipeline.ts` (quiet filter + research guard)
- `services/core/src/creator-partnership/activities.ts` (quiet filter)
- `services/core/src/creator-interest/actions.ts` (Discover SQL exclusion)
- `services/core/src/ask-benson/ask.ts` (Program Library intake)
- `services/core/package.json`

**API**
- `services/api/src/routes/program-library.ts`
- `services/api/src/server.ts`

**Dashboard**
- `dashboard/app/program-library/**`
- `dashboard/lib/opportunities-ui.ts`

**Not deployed:** Home memory fixes, scrape guardrails changes, migrations, unrelated dirty tree.

---

## Post-deploy health

| Check | Result |
|-------|--------|
| API `/health` | **OK** |
| Dashboard `/` | **200** |
| Workers | **Running** |
| Deployment parity | **MATCH** (`21fe6e1efdc55fb1` api/dashboard/workers/source) |

---

## Seed result

```json
POST /api/program-library/seed
{ "created": 0, "updated": 15, "total": 20 }
```

| Seed criterion | Result |
|----------------|--------|
| 15 canonical seed brands present | **Pass** (each exactly once) |
| All seed brands `mode=saved` | **Pass** |
| All seed `verificationLabel=Operator supplied` | **Pass** |
| Idempotent rerun | **Pass** (`created: 0`, `updated: 15`) |
| Paid research from seed | **None** |

Note: `total: 20` includes 5 non-seed test artifacts from prior dev/test runs. Seed identities are unique and correct.

---

## Surface checks (saved programs quiet)

| Surface | FlexPro / seed brands absent? |
|---------|------------------------------|
| Home (`/api/pre-alpha/home`) | **Yes** |
| Discover (API) | **Yes** |
| Action Center (API) | **Yes** |
| Active partnerships list | **Yes** (while `mode=saved`) |
| Program Library list/detail | **Yes** (expected presence) |

---

## Activation test (FlexPro Meals)

| Step | Result |
|------|--------|
| `POST .../activate` | **OK** → `mode=activated`, `partnershipHref=/partnerships/2e7c0d59-...` |
| Appears in `/api/creator-partnerships` | **Yes** (1 row, same ID) |
| Repeat activate | **`reusedExistingActive: true`** |
| `POST .../deactivate` | **OK** → `mode=saved` |
| Removed from partnerships list | **Yes** (0 FlexPro rows) |
| Duplicate partnership created | **No** |

---

## Verify missing info (live)

Skipped paid enrichment — `shouldSkipBackgroundLlm` active:

```json
POST /api/program-library/{id}/verify
{ "skipped": true, "skipReason": "background_budget_gate", "searchCalls": 0 }
```

Program remained `mode=saved`. Mocked unit tests cover enrichment path, authority order, and conflict preservation.

---

## Host

| Metric | Value |
|--------|------:|
| RAM available | ~2.9 GiB |
| Swap used | 1.9 / 4.0 GiB |

---

## Verdict

| Criterion | Met? |
|-----------|------|
| Pipeline quietness | **Yes** |
| Browser/mobile smoke | **Yes** |
| Tests 77/77 + 12/12 Program Library | **Yes** |
| Fingerprints MATCH | **Yes** |
| Seed 15/15 idempotent | **Yes** |
| Quiet on Home/Discover/Action Center/Partnerships | **Yes** |
| Activation/deactivation | **Yes** |
| No paid search from seed/smoke | **Yes** |

**PROGRAM LIBRARY DEPLOY VERIFIED**
