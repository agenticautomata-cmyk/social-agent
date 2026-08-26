# Partnership opportunity fingerprint collision and test/live-database safety audit

Date: 2026-08-22 (operator timezone America/Chicago)

**AUDIT ONLY. Code unchanged. Data unchanged. Partnership research not run. Test fixtures not deleted. Junk partnerships not cleaned. Email not sent.**

Destructive postgres test suites were **not** executed for this audit. Fingerprint examples were computed in-process from the production helpers (`parsePartnershipUrl` → `inferBrandSlugFromIntel` → `retailerNameFromDomain` → `buildOpportunityFingerprint`). Live inspection was `SELECT` only on `creator_partnerships` plus the linked `content_items` row, `llm_usage_events` counts, and `creator_partnership_activities` count for restored id `341940fa-edca-4bdf-b44b-d06b2b63327d`.

Audit connection (redacted): `postgres://social_agent@localhost:5433/social_agent`. Server: database `social_agent`, user `social_agent`, in-container port 5432 (Docker `social_agent_postgres`, volume `postgres_data`). `NODE_ENV` unset. `TEST_DATABASE_URL` absent.

---

## Executive verdict

Two separate blockers, both real.

**1. Opportunity fingerprints are not hashes.** They are UTF-8 of `domain|retailer|brand|collection` encoded as hex, then **cut to 32 hex chars (16 ASCII characters)**. Brand/product path almost never enters the value for ordinary retailer hosts. Any two `scheels.com` (also `shopmy.us`, `loewshotels.com`, `instagram.com`, `example.com`, …) URLs produce the **same** fingerprint. Submit looks up that fingerprint **before** create, `LIMIT 1`, and **touches the wrong partnership**.

This is a **durability blocker**. One legitimate partnership submission on the same host can resolve to another legitimate (or junk) partnership.

Live table currently has **only 3 rows with a stored fingerprint**, so there are **zero multi-row stored-fingerprint groups**. Collision is **latent and operational**: the next new URL on `scheels.com`, `instagram.com`, or `kcstudio.org` will attach to those three sinks. Lookup happens **before** the new identity gate, so a different Instagram post would **touch** `Dbtacojzn1r` instead of being rejected as a new fake brand.

**2. Postgres-backed tests use the same `DATABASE_URL` as live Benson.** `NODE_ENV` is unset. There is no `TEST_DATABASE_URL`, no test schema, no transaction rollback. `after()` hooks `DELETE` durable rows by id. If a test captures a live id via fingerprint/URL duplicate, cleanup **deletes live Benson state**. That already happened to `341940fa-edca-4bdf-b44b-d06b2b63327d`.

Treat test/live sharing as **S0 development-safety**. Do not run more partnership persist tests against this database until isolation exists.

**3. The restored SCHEELS/WGACA row is an identity stub.** Brand/retailer/URL/fit 42/`qualified`/`complete` are present. **Research JSON, creator play, verification ledger, email-match fingerprints, monetization paths, decision brief, and source-url history are empty.** Chat and 18 `llm_usage_events` still exist as historical evidence only.

**Do not “just replace the fingerprint with SHA-256.”** Three live rows store the truncated hex; a hard cutover would miss them on fingerprint lookup (URL lookup would still hit exact same URL). Need a compatibility plan (below). Do not implement it in this audit.

---

## Severity

| Issue | Severity | Why |
| --- | --- | --- |
| 1. Fingerprint collision | **S1 durability blocker** | Same-host distinct products/programs collapse; submit fingerprint lookup can touch the wrong partnership; identity gate cannot save you if dup lookup wins first. Not S0: no calendar overwrite / unsafe send observed in this pass. |
| 2. Tests touching live durable data | **S0 development-safety** | Normal `pnpm --filter @social-agent/core test` uses live `DATABASE_URL` (`localhost:5433/social_agent`, same Docker volume as Benson). Tests INSERT/UPDATE/DELETE partnerships, content, program library, sponsor/outreach, chat. Cleanup already deleted a live partnership. |
| 3. Incomplete SCHEELS restore | **S2** | Control id exists and is findable; research/play/verification/source graph not restored. Operator cannot trust research/play on that row until it is rebuilt **after** fingerprint+test isolation (out of scope here). |

---

## PART A — Exact fingerprint formula

### Generator (the one involved in the incident)

`services/core/src/creator-partnership/url-intelligence.ts` → `buildOpportunityFingerprint` (lines 154–169)

```ts
const parts = [
  input.registrableDomain.toLowerCase(),
  (input.retailerSlug ?? input.registrableDomain.split('.')[0] ?? '').toLowerCase(),
  (input.brandSlug ?? '').toLowerCase(),
  (input.collectionSlug ?? '').toLowerCase(),
]
  .map((p) => p.trim())
  .filter(Boolean);
return Buffer.from(parts.join('|')).toString('hex').slice(0, 32);
```

Submit call site (`pipeline.ts`): `retailerSlug` is `retailerNameFromDomain(intel).toLowerCase()` (hostname first label). `collectionSlug` is **the same value as `brandSlug`**, not a distinct collection identity.

**Classification: raw UTF-8 string → hex encoding of that string → truncate. Not a cryptographic hash. Not SHA-256. Not MD5.**

32 hex characters = **16 bytes** = **the first 16 ASCII characters** of `domain|retailer|brand|collection`.

Worked example (SCHEELS × WGACA):

| Step | Value |
| --- | --- |
| Identity tuple | `scheels.com` \| `scheels` \| `what goes around comes around` \| `what goes around comes around` |
| Joined string | `scheels.com\|scheels\|what goes around comes around\|what goes around comes around` (79 chars) |
| Hex of full string | long |
| `.slice(0, 32)` | `73636865656c732e636f6d7c73636865` |
| Decoded prefix | `scheels.com\|sche` |

Brand and collection **never appear** in the stored value for this host. `nike` vs WGACA vs `/pages/creator-program` all yield the same fingerprint.

`registrableDomain` here is **hostname minus `www.`**, not a true eTLD+1 parser.

### How submit uses it (production duplicate path)

`submitCreatorPartnership` in `pipeline.ts`:

1. `parsePartnershipUrl` → `inferBrandSlugFromIntel` → `retailerNameFromDomain`
2. `fingerprint = buildOpportunityFingerprint({ registrableDomain, brandSlug, retailerSlug, collectionSlug: brandSlug })`
3. **First** `findPartnershipIdByNormalizedSource(submittedUrl)` — exact normalized URL (safe for identity)
4. **Second** `findPartnershipIdByFingerprint(fingerprint)` — `WHERE metadata->>'opportunityFingerprint' = $fp LIMIT 1`
5. On hit: `touchExistingPartnershipSource` (attach source, may launch research, **does not create a new row**)
6. **Then** identity gate throw (only if no dup hit)

`touchExistingPartnershipSource` writes `metadata.opportunityFingerprint = input.fingerprint` again.

On **create**, fingerprint is stored at `creator_partnerships.metadata.opportunityFingerprint`.

Social posts: `inferBrandSlugFromIntel` returns **null**, so parts are `[instagram.com, instagram]` → prefix `instagram.com|in`. **Every Instagram URL shares one fingerprint.**

### Other fingerprint system (not this incident)

`buildPartnershipFingerprints` / `creator_partnerships.fingerprints` jsonb is a **separate** email-matching structure (brandName, domains, keywordPhrases). It is **not** `opportunityFingerprint` and was not the collision mechanism.

---

## All production callers of opportunity fingerprint

| Caller | Role |
| --- | --- |
| `buildOpportunityFingerprint` | Sole generator |
| `submitCreatorPartnership` | Compute, URL-miss then fingerprint lookup, persist on insert, pass into touch |
| `touchExistingPartnershipSource` | Overwrite `metadata.opportunityFingerprint` |
| `findPartnershipIdByFingerprint` | Lookup `LIMIT 1` |
| `creator-partnership/index.ts` | Re-export |
| `url-intelligence.test.ts` | Unit equality only (does not prove uniqueness across brands) |
| `scripts/url-intelligence-smoke.ts` | Counts stored fps; **also calls `submitCreatorPartnership`**, including a distinct `/pages/creator-program` URL that **collides** with WGACA. **Not run this audit.** |
| `scripts/production-scheels-canary.ts` | Counts stored fps; **also submits the WGACA URL and runs research**. **Not run this audit.** |

**Not used by:** program-library save, evidence-orchestration associate (URL-only `findPartnershipIdByNormalizedSource`), Calendar, Discover, sponsor persist.

**Storage locations that rely on this fingerprint today:**

- `creator_partnerships.metadata->>'opportunityFingerprint'` **only**
- Not a dedicated SQL column
- Not copied onto `content_items`
- Not in `creator_partnerships.fingerprints`
- Not in other tables found by repo search

Live: **3 / 114** partnerships have a non-empty opportunity fingerprint; **111** have none.

---

## PART B — Code-level collision examples

No live rows created. Same generator as production.

Production-equivalent computation (no live inserts). Fingerprint is always 32 hex chars.

| Pair | Identity tuples (`domain\|retailer\|brand\|collection`) | Fingerprint / decoded 16 chars | Collision |
| --- | --- | --- | --- |
| Two scheels.com product URLs (WGACA vs Nike) | `scheels.com\|scheels\|what goes around comes around\|…` vs `…\|nike\|nike` | `73636865656c732e636f6d7c73636865` = `scheels.com\|sche` | **YES** |
| scheels WGACA vs `/pages/creator-program` | brandSlug `what goes around comes around` vs `pages` | same | **YES** |
| Two shopmy.us URLs (`/home` vs `/programs/abc`) | `shopmy.us\|shopmy\|home\|home` vs `…\|programs\|programs` | `73686f706d792e75737c73686f706d79` = `shopmy.us\|shopmy` | **YES** |
| Two loewshotels.com URLs (KC vs influencer form) | `…\|kansas-city\|kansas-city` vs `…\|influencer-stay-request\|…` | `6c6f657773686f74656c732e636f6d7c` = `loewshotels.com\|` | **YES** |
| Two jared.com jewelry URLs | both infer brandSlug `jewelry` (first non-reserved path) | `6a617265642e636f6d7c6a617265647c` = `jared.com\|jared\|` | **YES** (identical tuple *and* truncated) |
| Two etsy.com shops (`AlphaBrand` vs `ZetaBrand`) | `etsy.com\|etsy\|alphabrand\|…` vs `…\|zetabrand\|…` | `etsy.com\|etsy\|al` vs `etsy.com\|etsy\|ze` | **NO** (host+retailer is 14 chars; 2 chars of brand survive) |
| Two `x.co` product URLs | `x.co\|x\|alpha-product\|…` vs `…\|zeta-product\|…` | `x.co\|x\|alpha-pro` vs `x.co\|x\|zeta-prod` | **NO** |
| Two paths on `theveryverylongbrandname.com` | distinct product slugs | `74686576657279766572796c6f6e6762` = `theveryverylongb` | **YES** (domain alone exceeds 16 chars) |
| Same long name `.com` vs `.net` | TLD differs after char 16 of the domain | same prefix `theveryverylongb` | **YES (cross-TLD)** |
| Two `example.com` test paths | `path-alpha` vs `path-zeta` | `6578616d706c652e636f6d7c6578616d` = `example.com\|exam` | **YES** (research-singleflight submit host) |
| Two Instagram posts | brandSlug **null** (social_post) → `instagram.com\|instagram` | `696e7374616772616d2e636f6d7c696e` = `instagram.com\|in` | **YES** |

**Breadth:** Not SCHEELS-specific. Any host whose `domain|retailer` is ≥16 characters **drops brand/product entirely**. That includes typical retailer hosts (`scheels.com|scheels` = 19). Short marketplaces (`etsy.com|etsy` = 14) keep a couple of brand characters — still not a real identity.

---

## PART C — Bounded live collision audit

Scope: `creator_partnerships` (and computed fingerprints from `submitted_url` only). No unrelated tables.

| Metric | Count |
| --- | --- |
| Total `creator_partnerships` | 114 |
| With stored `opportunityFingerprint` | **3** |
| Without stored fingerprint | 111 |
| Stored-fingerprint groups with `n > 1` | **0** |
| Distinct stored fingerprints | 3 |
| Computed same-fingerprint groups among rows that have a URL (`n > 1`) | **1** (Loews, 9 rows, **same URL**, stored fp **null**) |
| Hosts with >1 partnership | `loewshotels.com` only (9) |

No live **multi-row stored fingerprint** group exists yet. Collision risk is **forward**: fingerprint lookup against the three stored keys.

### Detailed groups inspected (≤10)

**Group 1 — stored sink `scheels.com|sche` (`73636865656c732e636f6d7c73636865`)**

| Field | Value |
| --- | --- |
| Partnership id | `341940fa-edca-4bdf-b44b-d06b2b63327d` |
| brandName | What Goes Around Comes Around |
| retailerName | Scheels |
| source URL | `https://scheels.com/c/all/b/what%20goes%20around%20comes%20around?r=storeAvailability%3A88` |
| pipeline | qualified |
| Same logical partnership as a Nike/program URL? | **No** |
| Wrong match / overwrite / deletion? | **Yes.** Any other `scheels.com` submit misses exact URL, hits this fingerprint, `touchExisting` (metadata/source attach; research unless skipped). Test cleanup can then **delete this live id**. |

**Group 2 — stored sink `instagram.com|in` (`696e7374616772616d2e636f6d7c696e`)**

| Field | Value |
| --- | --- |
| Partnership id | `19c5e471-a7f0-4bb5-8dde-5deab9a5b02d` |
| brandName | Dbtacojzn1r |
| retailerName | Instagram |
| source URL | `https://instagram.com/p/DbtacOJzN1R?igsh=…` |
| pipeline | qualified |
| researchStatus | needs_verification |
| Same logical entity as another IG post? | **No** |
| Wrong match? | **Yes.** Any other `instagram.com` URL shares this fingerprint. Dup lookup runs **before** identity reject, so a new post **touches this junk row** instead of failing closed. |

**Group 3 — stored sink `kcstudio.org|kcs` (`6b6373747564696f2e6f72677c6b6373`)**

| Field | Value |
| --- | --- |
| Partnership id | `dd83bc2a-b632-4201-8be3-21cd85bc5ad3` |
| brandName | Top Things To Do This Summer 2025 |
| retailerName | Kcstudio |
| source URL | `https://kcstudio.org/top-things-to-do-this-summer-2025` |
| pipeline | qualified |
| Same logical partnership as another KC Studio article? | **No** |
| Wrong match? | **Yes** for any other `kcstudio.org` URL. |

**Group 4 — computed `loewshotels.com|` (`6c6f657773686f74656c732e636f6d7c`, 9 rows, stored fp null)**

Same brand `Loews`, same URL `https://www.loewshotels.com/kansas-city`, stored fingerprint **null** on every row:

- `de8e4c11-ec7f-4a4f-bb1e-908ccc079e5b`
- `0a198ee8-1c6a-4a73-84c3-84b939deb40a`
- `d1a5bad3-ac5d-42bd-ab70-b8685a471fa0`
- `e9b32b59-9751-40dd-bbcd-c2ecc82eb7d6`
- `27462650-1670-4376-8092-0fc20f46692b`
- `07420aac-29f5-43bd-a925-3e5949bd066b`
- `c45790de-4ffe-4de4-bb92-fbe3af5ce99d`
- `a8e179ef-d1b1-4b59-8fe7-a93784b703ba`
- `9dde2870-3650-474d-801b-028780161fc3`

These are duplicate clones of one URL (evidence-orchestration fixtures), not two products. Fingerprint lookup **does not bind them today** because stored fp is null. A **new** distinct Loews path would **create** a 10th row **with** fingerprint; later Loews URLs would then attach to that 10th row, not these nine.

Groups 5–10: no further stored multi-identity fingerprint groups in this database. Remaining partnerships (including many `Unrelated Soft Context Hotel` rows) have **no URL** and **no fingerprint**.

### Critical question

**Can the current fingerprint cause one legitimate partnership submission to resolve to ANOTHER legitimate partnership on the same host?**

**Yes.** Mechanism: URL lookup miss + fingerprint hit + `LIMIT 1` + `touchExistingPartnershipSource`. Proven in code and in the SCHEELS test incident (identity-gate test URL → live WGACA row). Classify as **durability blocker (S1)**.

Additionally, a legitimate future Instagram profile/post can resolve to the **junk** `Dbtacojzn1r` partnership for the same reason.

---

## PART D — Compatibility if the formula is replaced

**If new code switched to a proper hash immediately, with no fallback:**

| Existing row | Effect |
| --- | --- |
| Exact same normalized URL submitted again | Still matches via `findPartnershipIdByNormalizedSource` (first lookup). **No duplicate** for that URL. |
| **Different URL, same host** (Nike vs WGACA on scheels.com) | New hash **misses** the old truncated fp → **creates a new partnership** (stops wrong-merge; may be desired) |
| The 3 rows that store truncated hex | Fingerprint lookup no longer finds them unless URL matches exactly |
| 111 rows with null fingerprint | Unchanged (already URL-only) |

**Would existing rows stop matching?** Fingerprint matching: **yes** for those 3 keys. URL matching: **no**.

**Would duplicate rows get created?** For **new paths on the same host as a fingerprinted row**: **yes**, relative to today’s (incorrect) merge. For **identical URLs**: **no**.

**Is legacy lookup required?** **Yes**, if the goal is “do not fork the three existing fingerprinted partnerships on re-paste of *other* same-host URLs.” **No**, if the goal is “stop merging distinct products” (then missing the legacy key is the fix, plus URL-only dup).

**Persisted elsewhere?** Only `metadata.opportunityFingerprint`. Email `fingerprints` jsonb is a different document.

**Do not choose a strategy until isolation exists.** Evaluated, not implemented:

| Strategy | Fit |
| --- | --- |
| **A. New SHA-256/canonical fp on write + legacy truncated-hex fallback on lookup** | Safest against accidental duplicate-create of the 3 sinks; **preserves wrong same-host merge** until fallback removed |
| **B. Dual fields** (`opportunityFingerprint` + `opportunityFingerprintV2`) | Clear; more metadata shape change; still need lookup order documented |
| **C. Bounded migration of the 3 stored fps** to a real hash after URL+v2 lookup works | Small data rewrite; should wait until tests cannot delete those rows |
| **D. Stop using fingerprint for dup; URL-only** | Smallest behavioral fix for wrong-merge; research-singleflight same-URL tests still pass; same-host distinct products would create separate rows |

Smallest **compatible** path is likely **URL-first (already true) + stop treating truncated hex as identity**, with an explicit legacy fallback only if product insists same-host merge must continue during rollout. This audit does **not** pick A–D.

---

## PART E — Test database safety

### How tests choose Postgres

```
services/core/src/env.ts
  dotenv: repo `../../../.env` (override) then parent `.env`
  DATABASE_URL: required-with-default
    default = postgres://social_agent:dev_password@localhost:5432/social_agent

services/core/src/db.ts
  postgres(env.DATABASE_URL)  // shared pool, no test override
```

This machine:

| Knob | Observed |
| --- | --- |
| `DATABASE_URL` (redacted) | `postgres://social_agent@localhost:5433/social_agent` |
| Postgres inside Docker | db `social_agent`, server port **5432** in-container; host publish **5433** (`POSTGRES_PORT` in `.env.example`) |
| `NODE_ENV` during audit node process | **unset** (`null`) |
| `TEST_DATABASE_URL` | **absent** |
| Dedicated test database/schema | **none** |
| `NODE_ENV=test` changes database | **No** — env.ts does not branch on `NODE_ENV` |
| Transactions / rollback | **No** in the inspected postgres tests |
| Benson runtime | `scripts/benson-runtime-lib.sh` `source .env` — **same `DATABASE_URL` / same Docker volume `postgres_data`** |

`.env.example` documents this as **the** app database, not a disposable test DB.

Root `package.json` has **no** `test` script. Normal local invocation is:

```
pnpm --filter @social-agent/core test
# or from services/core:
pnpm test
```

That runs `node --import tsx --test` over many `*.test.ts` files, including postgres-backed ones, **with no DB isolation env**.

### Postgres-backed tests capable of writes/deletes

Inspected as requested (destructive suites **not re-run**):

| Suite | Writes live DB? | Cleanup |
| --- | --- | --- |
| `creator-partnership/entity-identity.test.ts` | INSERT partnerships/content via `submitCreatorPartnership`; UPDATE status/fit | `after()` **DELETE** `creator_partnerships` + `content_items` by captured ids. If submit returns a **live duplicate id**, cleanup deletes **live** row. This is the incident. Persist tests currently use text-only ShopMy/SCHEELS (no `scheels.com` URL); that does **not** close S0. |
| `creator-partnership/research-singleflight.test.ts` | INSERT fixtures + `submitCreatorPartnership` on unique `example.com/…` URLs | `after()` **DELETE** by id lists. Distinct example.com paths still share fingerprint `example.com\|exam`; a leftover stored fp on that host would recapture a live/fixture id. |
| `ask-benson/evidence-orchestration/evidence-orchestration.test.ts` | INSERT content + **partnerships** + can create **sponsor contacts / outreach drafts / chat** | **No `after()`** — fixtures remain (Loews clones, Unrelated Soft Context Hotel) |
| `program-library/program-library.test.ts` and `auto-enrichment.test.ts` | `saveProgramToLibrary`, seed, activate | **No delete** — “Mock Enrich”, “Budget Gate Brand”, “AutoEnrich Activated Exclude Unit …” remain in live library |

Other postgres tests (not partnership-primary; listed because they share the same live `DATABASE_URL`; **not run** this audit) also DELETE live-adjacent rows: `scanner/ingest-persist.container-child.test.ts` (content/sources), `creator-interest/discover-quality.test.ts` and `actions.test.ts` (content), `benson-scout/watchlist-canonical.test.ts` and `curator-watchlist/instagram-session.test.ts` (source_watchers), `creator-skip/state-authority.acceptance.test.ts` (discoveries/content/skips), `worker-heartbeat/worker-heartbeat.test.ts` (heartbeats/job runs), `creator-partnership/platform-email-match.test.ts` (platform activities), `ask-benson/conversations-terminal.test.ts` (chat messages/conversations).

**Non-test write scripts on the same DB (not run):** `url-intelligence-smoke.ts` submits the colliding Scheels program URL; `production-scheels-canary.ts` submits WGACA and runs research. Either can mutate the restored control row.

### Critical test-safety question

**Can a normal local test invocation write/update/delete real Benson durable state?**

**Yes.** Same database Benson API/workers use. Partnerships, content items, program library, and (orchestration) sponsor/outreach/chat are reachable. Fingerprint collision makes **DELETE of a live partnership** a realistic cleanup outcome.

Classify as **S0 development-safety blocker**. Do not treat “it was restored” as closing the hole.

---

## PART F — Restored SCHEELS/WGACA row (read-only)

`341940fa-edca-4bdf-b44b-d06b2b63327d`

| Field | Current |
| --- | --- |
| brandName | What Goes Around Comes Around |
| retailerName | Scheels |
| productName | Handbags |
| contentItemId | `fe205f06-8365-437b-bc99-e5fc148b7611` (content row **survived** the partnership delete) |
| submittedUrl / submittedText | scheels.com WGACA collection URL (normalized / original-style) |
| pipelineStatus | qualified |
| fitScore | 42 |
| fitScoreBreakdown | `{}` |
| researchStatus | complete |
| research | `{}` |
| creatorPlay | `{}` |
| needsVerification | `[]` |
| fingerprints (email-match jsonb) | `{}` |
| monetizationPaths | `[]` |
| followUpAt / calendarReminderAt | null |
| researchError | null |
| metadata | stub: `sourceScreen=ask_benson`, truncated `opportunityFingerprint`, restore flags/note/`restoredAt=2026-08-22T03:22:36.384Z` |
| created_at / updated_at | copied from content item (`2026-08-09 12:56` / `13:14`) — **not** proof of original partnership timestamps after reinsert |

Linked content item still has topic `What Goes Around Comes Around Handbags at Scheels`, `partnershipFitScore: 42`, `partnershipResearchComplete: true`.

**Historical evidence still present (not copied back onto the partnership):**

- 18 `llm_usage_events` with `metadata.partnershipId = 341940fa-…` (2026-08-09 19:21Z – 2026-08-10 04:06Z)
- 6 `benson_chat_messages` that mention this partnership id (2026-08-09/10 canary narratives; not copied onto the partnership row)

### Lost / unknown because of delete/reinsert

Known **missing vs a completed research row**:

- Full `research` document (companySummary, citations, localLocations, storyAngleCandidates, nextActionInputs, researchedAt, …)
- `creator_play`
- `fit_score_breakdown`
- `needs_verification` contents
- `fingerprints` used for email matching
- `monetization_paths`
- `metadata.sourceUrls`, `urlIntelligence`, `decisionBrief`, `opportunityFingerprint` history other than the truncated hex
- Original `created_at`/`updated_at` of the partnership (reinsert used content-item clocks)
- Any `creator_partnership_activities` that cascaded on delete (FK `creator_partnership_id` `ON DELETE CASCADE`) — live count for this id is **0**

**Not reconstructed in this audit.**

---

## Recommended next fix order

Do **not** start with junk-partnership cleanup or SCHEELS research rebuild.

1. **Test/live isolation (S0)** — tests must not use Benson `DATABASE_URL`; no `after()` DELETE of ids that can be live duplicates. Until then, do not run partnership persist/e2e postgres tests on this host.
2. **Opportunity fingerprint durability (S1)** — treat truncated hex as non-identity; keep URL-first lookup; add compatibility only after call sites above; migrate at most the 3 stored fps once tests cannot delete them.
3. **SCHEELS stub (S2)** — after (1) and (2), decide whether to re-research that id or leave as historical control. Do not invent research JSON.
4. Later: evidence-orchestration / program-library test fixture hygiene (leftover Loews/soft-context/library mocks). Out of this audit’s stop line.

---

## Confirmations

| Check | Status |
| --- | --- |
| Code changed | **no** |
| Data changed | **no** |
| Partnership research run | **no** |
| Tests with destructive cleanup run | **explicitly NOT run** for this audit |
| Existing junk partnerships cleaned | **no** |
| Email sent | **no** |
| Calendar / Discover / sponsor identity / partnership lifecycle redesigned | **no** (out of scope) |

---

## Unrelated findings (out of scope)

- Creator-partnership **identity gate** (already shipped; lookup-before-gate interaction noted only as fingerprint impact)
- Sponsor identity junk
- Calendar / Discover
- Research lifecycle / singleflight design (except that `example.com` fixtures share the truncated fingerprint)
- General database cleanup of Loews clones / soft-context hotels / AutoEnrich library rows
- `buildPartnershipFingerprints` email-matching jsonb
- Unit test `builds stable opportunity fingerprints` only checks **stability**, not **uniqueness**
