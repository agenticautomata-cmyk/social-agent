# Creator partnership durable identity gate

Date: 2026-08-21 (operator timezone America/Chicago; work completed 2026-08-22)

**CODE-ONLY. Existing bad live `creator_partnerships` rows were NOT cleaned. No email sent. Sponsor/outreach persistence untouched. Calendar/Discover listing identity untouched. Partnership lifecycle/follow-up logic not redesigned.**

---

## Proven root cause

Non-library `creator_partnership` rows are created almost entirely by `submitCreatorPartnership` (`services/core/src/creator-partnership/pipeline.ts`). Ask Benson (fast path + link collection) and `POST /api/creator-partnerships/submit` both call that function.

Two independent identity failures were live:

1. **Instagram shortcode as brand.** `inferNamesFromSubmission` took the first pathname segment that was not `c|p|b|shop|…`. For `instagram.com/p/Dbtacojzn1r/`, `p` was skipped and **`Dbtacojzn1r` became `brandName`**. `isOpaqueContentId` already rejected that token in Discover/URL-entity helpers, and `inferBrandSlugFromIntel` already returned null for social posts, but **partnership persist did not apply either check**. Research then scored the fake entity (`fit_score=42`, `pipeline_status=qualified`).

2. **Editorial / page title as brand.** After page fetch, `runPartnershipResearch` did `brandName = names.brandName ?? brandName` and wrote `creator_partnerships.brand_name` from the trimmed page title. Listicle titles such as `Top Things To Do This Summer 2025` became the durable entity. The same overwrite could replace a valid brand if a later noisy page was fetched.

A third live fake name, `Unrelated Soft Context Hotel`, was **not** created by Ask Benson submit. It is a leftover from `evidence-orchestration.test.ts`, which inserts `creator_partnerships` directly and does not clean up.

Fit score, research, creator play, and pipeline status are meaningless when the durable entity is wrong. The gate is: **do not CREATE/UPSERT a partnership unless the candidate name is a defensible entity**, and **do not let a later bad candidate overwrite a valid existing brand**.

---

## Exact create/upsert entry points inspected

Production writers of `creator_partnerships`:

| Entry point | Creates row? | Updates brand/entity? | Previously vulnerable? | Now gated? |
| --- | --- | --- | --- | --- |
| `submitCreatorPartnership` insert | **YES** | YES on insert | **YES** — inferred shortcode / title / empty social retailer written as `brandName` | **YES** — throws `PartnershipIdentityRejectedError` before insert |
| Ask Benson fast path (`ask.ts` ~submitCreatorPartnership) | via submit | via submit | **YES** | **YES** (same function). Throw is caught; Ask Benson **falls through** (existing skipped outcome) |
| Ask Benson link collection (`ask.ts` second submit) | via submit | via submit | **YES** | **YES**. Same fall-through catch |
| `POST /api/creator-partnerships/submit` | via submit | via submit | **YES** | **YES**. Existing 400 handler returns `partnership_identity_rejected:<reason>` |
| `touchExistingPartnershipSource` (URL / fingerprint dup) | no | does **not** write `brand_name` column; can attach sources + launch research | Partial — junk re-paste could still launch research / put junk in `entityContext` | Incoming junk: `brandName=null`, **skip research**. Does not overwrite existing brand/pipeline/fit |
| `runPartnershipResearch` page-name update | no | **YES** — previously overwrote `brandName` / content topic from page title | **YES** | `selectPartnershipIdentityForWrite`: reject incoming junk; keep existing valid brand; do not write listicle title onto topic |
| `saveProgramToLibrary` / `updateProgramLibraryById` | YES (library row) | YES | Operator path; opaque/editorial/transactional names could still be saved | `requirePartnershipEntityIdentity` with `operatorSuppliedBrand: true` (still rejects shortcode / headline / transactional subject) |
| `activateProgramLibraryRecord` | no (updates same row) | brand already on row | N/A | Relies on save-time gate |
| `tryCreatePartnershipActivityFromEmail` | no | no | N/A | Not a create path |
| `evidence-orchestration/mutate.ts` | no | pipeline on **existing** rows | Lifecycle; out of scope | Untouched |
| Test `db.insert(creatorPartnerships)` (research-singleflight, evidence-orchestration) | YES | YES | Test-only; left live soft-context / Loews clones | **Not gated** (see remaining unguarded) |

**No production create path was left unguarded** except test inserts and already-existing rows (this task does not clean them).

Creator-interest promotion, Discover listing identity, and sponsor/outreach persist were inspected and **do not insert `creator_partnerships`**. They were not modified.

---

## Existing validators reused

No second validation system. The gate composes:

| Helper | Module | Use |
| --- | --- | --- |
| `isOpaqueContentId` | `ask-benson/url-type.ts` | Instagram shortcodes / compact alphanumeric tokens / UUIDs / tracking ids |
| `instagramPostShortcode` + `classifyStandaloneUrlType` | `ask-benson/url-type.ts` | Do not treat post path as display name; do not treat platform name `Instagram` as brand |
| `isEditorialRoundupTitle` / `looksLikeEditorialSlug` | `ask-benson/editorial-roundup.ts` | Roundup / “things to do this summer” titles and slugs |
| `looksLikeEditorialContainerTitle` | `ask-benson/editorial-container.ts` | Guide / hub / container titles |
| `isEditorialHeadlineTitle` | `inventory/today-clarity.ts` | Headline-shaped titles |
| `classifyEmailIntent` | `creator-partnership/email-intent.ts` | Transactional / verification / “Thank you for your ShopMy application” |

Detect-path inference was also tightened (`inferNamesFromSubmission` skips opaque path segments and editorial page titles) so the persist gate is not the only layer.

---

## Exact identity gate semantics

Shared module: `services/core/src/creator-partnership/entity-identity.ts`

**Candidate resolution (first match):**

1. Proposed `brandName` (including a shortcode, so it can be rejected as opaque rather than falling back to “Instagram”)
2. Explicit `brand:` field in operator text
3. Short operator text (≤48 chars, no URL, not editorial)
4. `retailerName` only when the URL is **not** social/link-hub and the retailer is not opaque

**Reject before evidence (do not persist / do not promote):**

| Reason | Examples |
| --- | --- |
| `placeholder_or_empty` | empty, `Creator partnership candidate`, `Unrelated Soft Context Hotel` |
| `opaque_content_id` | `Dbtacojzn1r`, IG shortcode matching the URL |
| `transactional_subject` | `Thank you for your ShopMy application`, `Email address verification` |
| `editorial_headline` | `Top Things To Do This Summer 2025`, `Best Places To Eat In Kansas City` |
| `listing_container_title` | generic guide/hub title via `looksLikeEditorialContainerTitle` when it is not also a listicle |
| `no_entity_evidence` | leftover name with no operator/URL/JSON-LD/social-display/known-program signal |

**Allow when at least one defensible evidence signal exists** (entity need not be famous or in a brand library):

- `operator_brand` / `operator_text` / `program_library`
- `url_host` / `url_brand_slug` (host or path tokens matching the candidate; **social posts do not count path shortcodes as display names**)
- `jsonld_organization`
- `social_display_name` (profile/link-hub handle or explicit display name, not opaque)
- `known_program_entity` (`ShopMy`, `Etsy`, `LTK`, `SCHEELS`, `Loews`, `REKLAIM`)

**Upsert safety (`selectPartnershipIdentityForWrite`):**

- Incoming valid → may write
- Incoming rejected + existing valid → **`writeBrand=false`**, keep existing brand; do not overwrite pipeline/fit/play via junk `entityContext`; skip research on junk re-paste
- Do not convert a headline/shortcode into a brand

**Failure behavior:**

- New submit: **no** `content_items` insert, **no** `creator_partnerships` insert, **no** fit score, **no** pipeline advance
- Ask Benson: existing catch → fall through (skipped)
- HTTP submit: existing 400
- No new quarantine subsystem

---

## Valid controls (must still persist)

| Candidate | Why allowed |
| --- | --- |
| Loews | `known_program_entity` + `loewshotels.com` host |
| ShopMy | `known_program_entity` + shopmy host/path when URL present; operator text `ShopMy` |
| SCHEELS | `known_program_entity` + scheels host |
| Northfield Supply Co | operator `brand:` field |
| JSON-LD org matching candidate | `jsonld_organization` |
| Program library seed brands (FlexPro Meals, LTK, …) | `operatorSuppliedBrand` + `program_library` |

---

## Files changed

| File | Change |
| --- | --- |
| `services/core/src/creator-partnership/entity-identity.ts` | Shared evaluate / require / select-for-write + `PartnershipIdentityRejectedError` |
| `services/core/src/creator-partnership/entity-identity.test.ts` | Unit + persist regressions (including no-create and no-overwrite) |
| `services/core/src/creator-partnership/pipeline.ts` | Gate create; junk re-paste skip research; research page-name overwrite uses select-for-write |
| `services/core/src/creator-partnership/detect.ts` | Skip opaque path tokens and editorial page titles in name inference |
| `services/core/src/creator-partnership/detect.test.ts` | Shortcode + listicle inference regressions |
| `services/core/src/creator-partnership/index.ts` | Export identity helpers |
| `services/core/src/program-library/save.ts` | Gate library create/brand update |
| `docs/reports/benson-creator-partnership-identity-gate-fix-2026-08-21.md` | This report |

Sponsor/outreach, Calendar, Discover ranking, email send, and partnership follow-up state machines were **not** edited.

---

## Tests run + pass/fail counts

Focused identity + related suites (`services/core`):

```
node --import tsx --test \
  src/creator-partnership/entity-identity.test.ts \
  src/creator-partnership/url-intelligence.test.ts \
  src/ask-benson/editorial-roundup.test.ts
```

**46 pass / 0 fail**

Breakdown of identity regressions in `entity-identity.test.ts`:

| Suite | Tests | Result |
| --- | --- | --- |
| `evaluatePartnershipEntityIdentity` | 13 | pass |
| `selectPartnershipIdentityForWrite` | 2 | pass |
| `submitCreatorPartnership identity gate — postgres` | 10 | pass |

Also run in the same session (valid-entity / existing identity tests):

| Suite | Result |
| --- | --- |
| `detect.test.ts` (intake + inferNames, including IG/editorial) | pass |
| `ask-benson/url-type.test.ts` (opaque ID + IG post not a business name) | pass |
| `email-intent.test.ts` | pass |
| `research-singleflight.test.ts` postgres atomic claims (14) including `submitCreatorPartnership` e2e | pass |
| `creator-play-consistency.test.ts` (REKLAIM/valid play) | pass |
| `field-verification.test.ts` (REKLAIM) | pass |
| program-library seed + activation + Ask Benson intake | pass |

**Out of scope failure (not identity gate):** `program-library.test.ts` “respects background budget gate with zero paid search calls” asserted `result.skipped === true` while live `shouldSkipBackgroundLlm` did not skip (`force: true`, daily budget env not actually zero at process start). Identity save of `Budget Gate Brand` succeeded. Not fixed here.

### Proof invalid identity cannot create a partnership

Postgres persist tests (count of existing live rows with that `brand_name` unchanged; `PartnershipIdentityRejectedError` thrown):

1. `brand: Dbtacojzn1r` → `opaque_content_id`, no insert
2. `brand: Top Things To Do This Summer 2025` → `editorial_headline`, no insert
3. `brand: Thank you for your ShopMy application` → `transactional_subject`, no insert
4. `Unrelated Soft Context Hotel` (no entity evidence) → `placeholder_or_empty`, no insert

### Proof a later bad source cannot overwrite a valid partnership

5. Create Loews on a unique host → set `qualified` / `fitScore=55` / `researchStatus=complete` → re-submit **same URL** with `brand: Dbtacojzn1r` → duplicate touch, **brand still Loews**, pipeline/fit/research unchanged
6. Create Loews → poison `submittedText` with editorial `brand:` + `testPage` listicle title → `runPartnershipResearch` → **brand still Loews**, content topic is not the listicle

Valid creates still succeed: Loews, ShopMy, SCHEELS, operator `brand: Northfield Supply Co`.

---

## Bounded live read-only classification

`SELECT` only. Limit: required examples (junk + Loews + SCHEELS/WGACA control). No `DELETE`/`UPDATE` of junk rows.

No live non-library **ShopMy** partnership exists in this database. SCHEELS control is the WGACA × Scheels row.

| # | partnership id | brandName | source/origin | source evidence used to derive identity | pipeline | fit | NEW gate | rejection reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `19c5e471-a7f0-4bb5-8dde-5deab9a5b02d` | `Dbtacojzn1r` | Ask Benson (`sourceScreen=ask_benson`, `initialIntakeRoute=local_discovery`) | Instagram post URL path after skipping `p` | qualified | 42 | **reject** | `opaque_content_id` |
| 2 | `dd83bc2a-b632-4201-8be3-21cd85bc5ad3` | `Top Things To Do This Summer 2025` | Ask Benson | `kcstudio.org/top-things-to-do-this-summer-2025` path/title treated as brand; retailer `Kcstudio` | qualified | 42 | **reject** | `editorial_headline` |
| 3 | `f694fcc9-884a-4d31-836d-9738dbca3c20` | `Unrelated Soft Context Hotel` | test insert (no URL, no sourceScreen) | none — fixture name only | discovered | null | **reject** | `placeholder_or_empty` |
| 4 | `e9b32b59-9751-40dd-bbcd-c2ecc82eb7d6` | `Loews` | Loews KC hotel URL (orchestration fixture clone; URL is real) | `loewshotels.com` + known entity | qualified | null | **allow** | — |
| 5 | `341940fa-edca-4bdf-b44b-d06b2b63327d` | `What Goes Around Comes Around` | Ask Benson / SCHEELS product URL | path brand slug on `scheels.com`; retailer Scheels | qualified | 42 | **allow** | — |

Additional recent non-library junk/control rows exist (more `Unrelated Soft Context Hotel` + Loews clones from the same evidence-orchestration fixture). They classify the same way. They were **not** deleted.

### Exact vulnerable write path for each bad live example

| Live example | Write path that originally allowed it |
| --- | --- |
| `Dbtacojzn1r` | Ask Benson URL intake → `submitCreatorPartnership` → `inferNamesFromSubmission` path segment after `p` → `creator_partnerships` **INSERT** `brand_name=Dbtacojzn1r` → `runPartnershipResearch` scored/qualified the fake entity. **Now blocked at submit** (`opaque_content_id`); social post URL with no real brand also fails `placeholder_or_empty` (Instagram retailer is not used). |
| `Top Things To Do This Summer 2025` | Ask Benson → `submitCreatorPartnership` on `https://kcstudio.org/top-things-to-do-this-summer-2025` → name inference and/or **research page-title overwrite** (`brandName = names.brandName ?? brandName`). **Now blocked** at detect (editorial slug/title) and persist/research gate (`editorial_headline`). |
| `Unrelated Soft Context Hotel` | **Not Ask Benson.** `evidence-orchestration.test.ts` `db.insert(creatorPartnerships)` with that `brandName`, no cleanup. Direct test insert remains unguarded (see below). Production submit of that string now throws `placeholder_or_empty`. |

---

## Confirmations

| Check | Status |
| --- | --- |
| Live junk partnership rows cleaned | **NO** — Dbtacojzn1r, summer listicle, soft-context hotel rows still present |
| Email sent | **NO** |
| Sponsor/outreach persistence touched | **NO** |
| Calendar / Discover listing identity touched | **NO** |
| Partnership lifecycle/follow-up redesigned | **NO** |

### Live data changed = no (with one accidental test incident, restored)

This task did **not** quarantine or rewrite junk identities.

**Incident:** the first persist test used `https://www.scheels.com/identity-gate-<ts>` and `after()` cleanup. Opportunity fingerprints are `hex(domain\|retailer\|…).slice(0, 32)`, which is only the first 16 ASCII characters — for every `scheels.com` URL that is `scheels.com|sche`. That collided with the live WGACA partnership, the suite `after()` **deleted** `341940fa-edca-4bdf-b44b-d06b2b63327d`, and the content item `fe205f06-8365-437b-bc99-e5fc148b7611` was left orphaned.

**Restore (not junk cleanup):** the historical SCHEELS/WGACA control was re-inserted at the same partnership id, same content item, `brand_name=What Goes Around Comes Around`, `retailer_name=Scheels`, `pipeline_status=qualified`, `fit_score=42`. Full original research JSON was not in an audit table and was **not** reconstructed. Persist tests were changed to text-only ShopMy/SCHEELS and unique non-`scheels.com` hosts, and only `duplicate===false` ids are deleted in `after()`.

Fingerprint truncation is **out of scope** (see below).

---

## Remaining unguarded partnership entry point

**Production create/upsert paths that operators and Ask Benson use are gated.**

Still unguarded, by design of this bounded task:

1. **Test-only `db.insert(creatorPartnerships)`** — `evidence-orchestration.test.ts`, `research-singleflight.test.ts`. This is how `Unrelated Soft Context Hotel` and extra Loews clones landed in the live DB. Gating those fixtures would break tests that need a pre-existing row. They should grow `after()` cleanup in a later hygiene task, not this identity gate.

2. **Existing junk rows** — already persisted; the gate does not rewrite them. Next task (not this one): bounded cleanup/quarantine of fake brands.

3. **`runPartnershipResearch` on an already-queued junk row** — will still research the **existing** fake brand if something else triggers research. It will **not** replace a valid brand with a listicle. Lifecycle scoring of already-wrong rows is out of scope.

If a new production writer of `creator_partnerships` appears outside `submitCreatorPartnership` / `saveProgramToLibrary`, **stop and share the gate** rather than inventing a second model.

---

## Unrelated findings (out of scope)

- **Opportunity fingerprint hex truncation** (`slice(0, 32)` of hex = 16 ASCII chars) collapses all `scheels.com` URLs to one fingerprint. Do not “fix” fingerprinting in this identity task; it is a separate durability bug.
- **Sponsor/outreach junk** (email subjects as sponsor names) — explicitly deferred.
- **Program-library budget-gate unit test** vs live spend env — not identity.
- **Duplicate Loews / soft-context fixture rows** left by evidence-orchestration tests — hygiene, not this gate.
- Calendar clocks, Discover listing identity, editorial container children — frozen / other reports.

---

## Output summary for ChatGPT

- Inspected every production `creator_partnerships` insert/upsert: **submit** (Ask Benson + HTTP), **research name overwrite**, **program library save**.
- Previously vulnerable: submit create, research page-title overwrite, detect path-brand for IG posts.
- Those paths now share `evaluatePartnershipEntityIdentity` / `selectPartnershipIdentityForWrite`.
- Production create path remaining unguarded: **none**. Test inserts remain unguarded.
- Invalid identity cannot create a partnership (postgres proof). Later bad identity cannot overwrite a valid partnership (postgres proof).
- Live junk rows **not** cleaned. Email **not** sent. Sponsor/Calendar/Discover **not** touched.
