# Handoff: KC Contact Intelligence — Data/Import Lane

**For:** primary integrator  
**From:** data/import lane  
**Workbook checked:** 2026-09-08  
**Date:** 2026-09-09

## What landed

### Docs / fixtures
- `docs/ops/kc-contact-intelligence-workbook-mapping-2026-09-08.md` — exact field mapping + DB match counts
- `docs/ops/fixtures/kc-pr-affiliate-directory-2026-09-08.json` — normalized workbook snapshot
- This handoff

### Import module
`services/core/src/contact-intelligence/import/`
- `types.ts` — workbook + provenance types
- `org-aliases.ts` — deterministic alias / domain merge rules
- `normalize.ts` — route→evidence mapping, import keys, fixture loader
- `provenance.ts` — `[[benson-contact-import:v1]]` notes block; `permanentVerification: false`
- `match.ts` — equivalent / incomplete / conflicting / new / stale
- `apply-import.ts` — idempotent dry-run/apply against `sponsor_contacts` + program library
- `import.test.ts` — normalize / dedupe / provenance unit tests
- `index.ts` — public exports

### Scripts
- `services/core/src/scripts/match-kc-pr-directory.ts` — read-only match report
- `services/core/src/scripts/import-kc-pr-directory.ts` — dry-run default; `--apply` to write

```bash
cd services/core
pnpm exec tsx src/scripts/match-kc-pr-directory.ts
pnpm exec tsx src/scripts/import-kc-pr-directory.ts          # dry run
pnpm exec tsx src/scripts/import-kc-pr-directory.ts --apply  # write
node --import tsx --test src/contact-intelligence/import/import.test.ts
```

## Live DB match counts (read-only, not invented)

### Pre-import baseline (first pass this lane)

DB: **154** `sponsor_contacts` (**112** active), **92** program-library rows.

| Outreach bucket | Count |
|-----------------|------:|
| equivalent | 0 |
| incomplete | 6 |
| conflicting | 0 |
| new | 42 |
| stale | 0 |

| Programs bucket | Count |
|-----------------|------:|
| incomplete | 1 (MRA) |
| new | 9 |

### Post-import rematch (idempotency check)

DB: **196** `sponsor_contacts` (**154** active), **102** program-library rows.  
**48** contacts carry `verification_method=workbook_import` / provenance block.

| Outreach bucket | Count |
|-----------------|------:|
| equivalent | 38 |
| incomplete | 9 |
| conflicting | 0 |
| new | 0 |
| stale | 1 (Crossroads `media@`) |

| Programs bucket | Count |
|-----------------|------:|
| incomplete | 10 |
| new | 0 |

**Match rule:** different published emails at the same org create **additional contact rows** (not conflicts). Conflicts only when the same named person already has another email.

Re-run match script after your schema merges to refresh.

## Schema fields needed from primary

Import currently uses existing columns + a **notes provenance block**. Prefer first-class fields when you cut the contact-intelligence schema:

| Field | Why |
|-------|-----|
| `import_key` (text, unique partial) | Idempotency without parsing notes |
| `import_provenance` (jsonb) | Replace notes scrape; store workbookId, checkedDate, confidence, sheetRow, routeType, bestUse, geoArea |
| `workbook_confidence` (text) | High/Medium/Low — **imported evidence**, not permanent verification |
| `geo_area` (text) | Workbook Area column |
| `best_use` (text) | Workbook Best Use |
| `program_kind` or programType enum extensions | `hosted_visit`, `media_access`, `consumer_rewards` (today forced to `other` + notes tag) |
| Optional: `evidence_authority` | Distinguish `workbook_import` from discovery-verified official pages |

## Send-gate coordination (do not auto-change)

Import may set `contact_evidence_state` to proposed emailable states (`verified_named_decision_maker`, `verified_role_inbox`, `official_general_inbox`) when upgrading from `unknown` / `inferred_unverified`, with `verificationMethod = workbook_import` and `permanentVerification: false` in provenance.

**Ask:** should send eligibility require either (a) discovery recheck after import, or (b) workbook High + age &lt; 90 days + `verificationMethod=workbook_import`? Please add the gate explicitly; this lane did not modify send gates.

## Same-org additional contacts (import as new rows)

These are intentional second contacts, not overwrites:

1. **Starlight** — workbook `rachel.bliss@kcstarlight.com` alongside DB `help@kcstarlight.com`
2. **21c** — workbook `pr@21chotels.com` alongside DB `kjessen@21chotels.com`

True email conflicts (same person, different address) record `evidenceConflictNote` and do **not** overwrite.

## Out of scope (this lane)

No deploy, push, email/Telegram/forms, dashboard UX, or discovery freshness implementation.
