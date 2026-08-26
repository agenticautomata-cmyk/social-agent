# Creator-partnership opportunity fingerprint V2 (S1 durability)

Date: 2026-08-22 (operator timezone America/Chicago)

**CODE-ONLY. No live `creator_partnership` writes. No schema migration. No bounded rewrite of the three stored legacy fingerprints. SCHEELS research not rebuilt. Junk partnerships not cleaned. Sponsor/outreach, Calendar, and Discover not touched.**

---

## Executive verdict

S1 is closed in code.

1. New `opportunityFingerprint` values are **SHA-256 of a canonical entity/opportunity tuple**, stored as full **64 hex characters**, with `opportunityFingerprintVersion: 2`.
2. Fingerprints are generated and used for duplicate lookup **only after** the partnership identity gate passes, and **only when** domain + defensible brand exist. Instagram posts, editorial headlines, and empty/placeholder candidates get **no fingerprint**.
3. Fingerprint duplicate lookup is **V2-only**. Legacy truncated hex is **not** a fallback. A different URL cannot touch another partnership solely because the old 16-character prefix collided.
4. Exact same normalized URL still matches the existing row first (including the three live legacy rows).
5. `touchExistingPartnershipSource` will not overwrite a stored legacy fingerprint with V2 (so re-pasting the live WGACA URL cannot silently migrate that row).

Live data after this work: **unchanged**. `social_agent` still has **114** partnerships and **6031** content items. The three legacy fingerprint rows still store the truncated hex, still have no version field, and were not rewritten.

---

## Exact old fingerprint formula

**Not a hash.** UTF-8 of a joined string, hex-encoded, then truncated to 32 hex chars (the first 16 ASCII characters).

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

Submit previously passed `collectionSlug: brandSlug` (same value twice). For ordinary retailer hosts the stored value never included brand/product.

Worked SCHEELS collision:

| Step | Value |
| --- | --- |
| Joined string | `scheels.com\|scheels\|what goes around comes around\|…` |
| Stored hex (32 chars) | `73636865656c732e636f6d7c73636865` |
| Decoded prefix | `scheels.com\|sche` |

WGACA and Nike (and any other `scheels.com` URL) produced **the same** fingerprint. Same class of collision: `shopmy.us\|shopmy`, `loewshotels.com\|`, `instagram.com\|in`, `kcstudio.org\|kcs`.

This formula remains in-repo **only** as `buildLegacyOpportunityFingerprint` for collision proofs and for recognizing stored live values. **No production write path calls it.**

---

## Exact V2 canonical tuple

```
v2|{normalizedRegistrableDomain}|{normalizedRetailerOrHostLabel}|{normalizedDefensibleBrandSlug}|{optionalDistinctCollection}
```

Normalization: lowercase, NFKD, strip combining marks, non-alphanumerics → `-`, trim dashes.

**Production submit does not pass a collection component.** Collection is included only if a caller supplies a slug that is distinct from the brand. Equivalent ShopMy / Loews URLs that share the same defensible brand therefore share one tuple (trailing empty collection).

Examples:

| Entity | Canonical tuple |
| --- | --- |
| SCHEELS × What Goes Around Comes Around | `v2\|scheels.com\|scheels\|what-goes-around-comes-around\|` |
| SCHEELS × Nike | `v2\|scheels.com\|scheels\|nike\|` |
| ShopMy platform identity | `v2\|shopmy.us\|shopmy\|shopmy\|` |
| Loews brand identity | `v2\|loewshotels.com\|loewshotels\|loews\|` |

Domain is hostname minus a leading `www.` (same host rule as today; not a public-suffix parser). Different registrable hosts with the same brand remain different tuples (`scheels.com` Nike ≠ `nike.com` Nike).

---

## Hash algorithm

- Algorithm: **SHA-256** (`node:crypto` `createHash('sha256')`)
- Encoding: UTF-8 of the canonical tuple
- Stored digest: **full 64 lowercase hex characters** (256 bits). Not truncated.

Independent check:

```
sha256("v2|scheels.com|scheels|what-goes-around-comes-around|")
= 9bce2675f04f2b9ec83ad36fffee811ef963a25add9851c0f7f5358f5cac7265

sha256("v2|scheels.com|scheels|nike|")
= d5b1c93025a312ecabcd6a03cff78e899b2d0ee95a0f51d987e0fe74b2443c9d
```

WGACA ≠ Nike under V2.

---

## Versioning / storage behavior

No schema migration. Metadata-only:

| Field | New writes | Legacy live rows (untouched) |
| --- | --- | --- |
| `metadata.opportunityFingerprint` | 64-char SHA-256 hex | 32-char truncated hex |
| `metadata.opportunityFingerprintVersion` | `2` (JSON number) | **absent** |
| `metadata.opportunityFingerprintTuple` | canonical tuple string | absent |

Lookup:

```sql
WHERE metadata->>'opportunityFingerprint' = $fp
  AND coalesce(metadata->>'opportunityFingerprintVersion', '') = '2'
LIMIT 1
```

Legacy truncated fingerprints are **never** queried for duplicate identity. That is the compatibility choice that closes S1 without a live rewrite: exact URL still finds the three existing rows; a different same-host URL will not merge into them.

`touchExistingPartnershipSource` will **not** overwrite a row whose stored fingerprint is present and whose version is not 2. Re-pasting the live WGACA URL cannot silently migrate that fingerprint.

---

## Duplicate lookup order — before → after

### Before (S1)

1. Parse URL / infer names
2. **Always** build truncated fingerprint if a URL exists (including invalid identity)
3. Exact normalized URL lookup → `touchExistingPartnershipSource`
4. **Fingerprint lookup → touch** (including legacy collisions)
5. Identity gate throw **only if no duplicate hit**

A bad fingerprint hit bypassed the identity gate.

### After

1. Parse URL / candidate entity evidence
2. Evaluate partnership entity identity
3. Build V2 fingerprint **only if** identity passed **and** domain + defensible brand exist; otherwise fingerprint is null
4. Exact normalized URL lookup may still match and touch (research skipped when incoming identity is invalid)
5. **If identity is invalid → throw. No fingerprint lookup.**
6. V2 fingerprint lookup only
7. Second entity check: existing row must already be version 2, fingerprint must match, brand slugs must match
8. Only then touch; otherwise insert a new V2 row

Exact same normalized URL can still safely match the existing row before insert. A **different** URL cannot touch another partnership solely because a legacy fingerprint collides.

---

## Identity-gate ordering proof

`submitCreatorPartnership` now throws `PartnershipIdentityRejectedError` **after** URL-only duplicate handling and **before** `findPartnershipIdByFingerprint`.

Postgres proof on `social_agent_test`:

- Invalid `brand: Dbtacojzn1r` on a distinct `scheels.com` URL is rejected. The WGACA fixture is not touched (no new source URL, brand unchanged).
- A second Instagram post URL is rejected. An Instagram fixture with a stored **legacy** `instagram.com|in` fingerprint is unchanged (no source attach, marker intact).

Those are the collisions that previously would have `LIMIT 1` touched the wrong row **before** the gate.

---

## When fingerprint is intentionally null / not used

`tryBuildOpportunityFingerprint` returns null when:

- `identityOk` is false (gate rejected)
- registrable domain is missing (text-only submit)
- defensible brand name is missing

Explicit cases:

| Candidate | Fingerprint |
| --- | --- |
| Instagram post shortcode (`https://instagram.com/p/Dbtacojzn1r/`) | **null / not used** |
| KC Studio listicle / editorial headline | **null / not used** |
| Empty / placeholder / opaque candidate | **null / not used** |
| Valid SCHEELS × WGACA | V2 SHA-256 |
| Valid SCHEELS × Nike | different V2 SHA-256 |
| Valid ShopMy platform identity across equivalent ShopMy URLs | stable V2 |
| Valid Loews brand across equivalent Loews URLs | stable V2 |

Fingerprint is not a fallback substitute for missing identity.

---

## Files changed (this task)

| File | Change |
| --- | --- |
| `services/core/src/creator-partnership/url-intelligence.ts` | V2 tuple + SHA-256; `tryBuildOpportunityFingerprint`; legacy helper isolated; touch gate |
| `services/core/src/creator-partnership/partnership-sources.ts` | version metadata; V2-only fingerprint lookup |
| `services/core/src/creator-partnership/pipeline.ts` | lookup order; identity throw before fingerprint; touch safety |
| `services/core/src/creator-partnership/index.ts` | export V2 helpers + legacy helper |
| `services/core/src/creator-partnership/url-intelligence.test.ts` | stable fingerprint test now asserts 64-char SHA-256 |
| `services/core/src/creator-partnership/opportunity-fingerprint-v2.test.ts` | **new** unit + postgres regression suite |
| `services/core/package.json` | `test:postgres` includes `opportunity-fingerprint-v2.test.ts` |
| `services/core/src/scripts/url-intelligence-smoke.ts` | stop DELETE-by-fingerprint (legacy keys collide); do **not** run live |
| `services/core/src/scripts/production-scheels-canary.ts` | count by URL or **version=2** fingerprint only; do **not** run live |
| `docs/reports/benson-partnership-fingerprint-v2-fix-2026-08-22.md` | this report |

No Calendar / Discover / sponsor files. No `db/migrations/*` for this fingerprint.

---

## Every production caller updated

Repo search for `buildOpportunityFingerprint` / `tryBuildOpportunityFingerprint` / `findPartnershipIdByFingerprint` / `opportunityFingerprint`:

| Caller | Role after this fix |
| --- | --- |
| `tryBuildOpportunityFingerprint` | **Sole production generator** used by submit |
| `buildOpportunityFingerprint` | V2 SHA-256 helper (tuple already assumed valid). Tests / shared helper. Submit uses `tryBuild*` |
| `buildLegacyOpportunityFingerprint` | **Tests only** (plus definition). Not called from pipeline or scripts |
| `submitCreatorPartnership` | URL first → identity throw → V2 lookup → insert with version 2 |
| `touchExistingPartnershipSource` | Writes V2 only when existing row is not a legacy fingerprint |
| `findPartnershipIdByFingerprint` | V2 version filter; returns brand + metadata for second check |
| `creator-partnership/index.ts` | Re-exports |
| `url-intelligence.test.ts` | Unit stability / uniqueness via V2 |
| `opportunity-fingerprint-v2.test.ts` | Collision + lookup-order proofs |
| `scripts/url-intelligence-smoke.ts` | Uses `submitCreatorPartnership` (V2 path). DELETE is URL-only. **Not executed** |
| `scripts/production-scheels-canary.ts` | Uses submit (V2 path). Dup count no longer matches unversioned legacy hex. **Not executed** |

Not used by: program-library save, evidence-orchestration associate (URL-only), Calendar, Discover, sponsor persist, email-match `buildPartnershipFingerprints` (different jsonb).

---

## Unit tests + pass/fail

File: `services/core/src/creator-partnership/opportunity-fingerprint-v2.test.ts` (unit describe) and updated `url-intelligence.test.ts`.

| # | Case | Result |
| --- | --- | --- |
| 1 | Legacy Scheels formula: WGACA == Nike (`scheels.com\|sche`) | **PASS** |
| 2 | V2: WGACA ≠ Nike; SHA-256 of canonical tuple; 64 hex | **PASS** |
| 3 | ShopMy equivalent identity → stable V2 | **PASS** |
| 4 | Loews equivalent identity → stable V2 | **PASS** |
| 5 | Instagram shortcode → no V2 fingerprint | **PASS** |
| 6 | Editorial headline → no V2 fingerprint | **PASS** |
| — | Different domains, same brand → different V2 | **PASS** |
| — | `identityOk: false` → null fingerprint | **PASS** |
| — | Legacy metadata cannot pass fingerprint touch gate; Nike brand cannot touch WGACA V2 row | **PASS** |
| — | `url-intelligence.test.ts` stable V2 length 64 | **PASS** |

Command (unit + postgres file together): **34/34 pass**, fail 0.

---

## Postgres tests + pass/fail

File: `services/core/src/creator-partnership/opportunity-fingerprint-v2.test.ts` postgres describe. All writes used `skipResearch: true`. Cleanup deleted only captured test ids (plus leftover `sourceScreen=test_fingerprint_v2` rows in the **test** database).

| # | Case | Result |
| --- | --- | --- |
| Proof | `TEST_DATABASE_URL` path is `/social_agent_test`; not `/social_agent` | **PASS** |
| A / 7 / 8 / 9 | Create WGACA; exact URL duplicate; equivalent WGACA path may V2-merge; Nike Scheels URL is **not** WGACA (new distinct partnership) | **PASS** |
| 10 / 11 | Invalid colliding Scheels URL (`brand: Dbtacojzn1r`) rejected **before** fingerprint lookup; WGACA not touched | **PASS** |
| B | Instagram fixture unchanged; second IG post identity-rejected | **PASS** |
| C | Two Loews URLs with `brand: Loews` → same partnership, version 2, two source URLs | **PASS** |
| — | Two ShopMy URLs with `brand: ShopMy` → same V2 partnership | **PASS** |
| 12 | Legacy fingerprint fixture + exact same URL → still resolves by URL; legacy hex **not** rewritten | **PASS** |
| 13 | Legacy fingerprint fixture + different same-host Patagonia URL → **not** merged via legacy fp | **PASS** |

Identity-gate postgres suite (`entity-identity.test.ts`) re-run on `social_agent_test` after the submit-order change: **PASS**.

Full `test:postgres` (program-library / auto-enrichment / evidence-orchestration / research-singleflight) was **not** re-run as a bundle. Those suites are out of this fingerprint scope. A previously noted program-library budget-gate leftover on empty `llm_usage_events` remains out of scope.

---

## Proof postgres tests used `social_agent_test`

- Tests import `assertSafeTestDatabase` / `db` from `services/core/src/test-db.ts`.
- `before()` requires `TEST_DATABASE_URL` and asserts it matches `/social_agent_test`.
- Guard still refuses if the test URL is the live Benson identity (`social_agent`).
- Invocation set `TEST_DATABASE_URL` to the same host/port as live (`localhost:5433`) with database **`social_agent_test` only**.
- After tests, a **separate** read-only connection to `DATABASE_URL` reported `current_database() = social_agent` with partnership count **114** (unchanged).

---

## SCHEELS WGACA vs Nike regression

**Legacy:** both → `73636865656c732e636f6d7c73636865` / `scheels.com|sche`. Collision proven in unit test 1.

**V2:** different 64-char SHA-256 values (tuples above). Postgres A: submitting a Nike Scheels URL after creating WGACA returns a **new** partnership id; WGACA sources do not gain `/b/nike`; WGACA brand stays What Goes Around Comes Around.

If Nike identity itself qualifies (path slug + `brand: Nike`): new distinct partnership. It must never return/touch WGACA. Proven.

---

## Instagram collision-bypass regression

**Legacy:** every Instagram URL → `instagram.com|in`. Lookup ran before the identity gate, so a new post would touch `Dbtacojzn1r`.

**V2:** Instagram shortcode identity fails; fingerprint is null; fingerprint lookup is not reached. Postgres B: second post rejected; fixture fingerprint/version/marker/URL unchanged.

---

## Loews stable-entity regression

**Legacy:** `loewshotels.com|` prefix consumed identity; distinct Loews paths collided.

**V2:** tuple `v2|loewshotels.com|loewshotels|loews|` is stable across equivalent Loews URLs when the defensible brand is Loews. Postgres C: `/kansas-city` then `/influencer-stay-request` with `brand: Loews` → `duplicate: true`, same partnership id.

---

## Read-only classification of the 3 legacy live rows

Inspected on `current_database() = social_agent` with **SELECT only**. IDs requested by the operator. `updated_at` still pre-dates this task. Stored fingerprints still 32-char truncated hex. `opportunityFingerprintVersion` is null on all three.

### 1. `341940fa-edca-4bdf-b44b-d06b2b63327d` — SCHEELS / WGACA

| Field | Live value |
| --- | --- |
| brand / retailer | What Goes Around Comes Around / Scheels |
| URL | `https://scheels.com/c/all/b/what%20goes%20around%20comes%20around?r=storeAvailability%3A88` |
| Legacy fingerprint | `73636865656c732e636f6d7c73636865` = `scheels.com\|sche` |
| Identity under new gate | **valid** |
| Computed V2 (not stored) | `9bce2675f04f2b9ec83ad36fffee811ef963a25add9851c0f7f5358f5cac7265` |
| V2 tuple (not stored) | `v2\|scheels.com\|scheels\|what-goes-around-comes-around\|` |
| research JSON | still `{}` (stub; **not rebuilt**) |
| Later migration | **rewrite to V2** (version 2 + SHA-256 + tuple). Do not clear identity. |

### 2. `19c5e471-a7f0-4bb5-8dde-5deab9a5b02d` — Dbtacojzn1r Instagram junk

| Field | Live value |
| --- | --- |
| brand / retailer | Dbtacojzn1r / Instagram |
| URL | Instagram `/p/DbtacOJzN1R` (tracking query present) |
| Legacy fingerprint | `696e7374616772616d2e636f6d7c696e` = `instagram.com\|in` |
| Identity under new gate | **invalid** (`opaque_content_id`) |
| Computed V2 | **null — do not give it V2 identity** |
| Later migration | **clear legacy fingerprint**; quarantine/delete separately. Do not hash this into V2. |

### 3. `dd83bc2a-b632-4201-8be3-21cd85bc5ad3` — KC Studio listicle junk

| Field | Live value |
| --- | --- |
| brand / retailer | Top Things To Do This Summer 2025 / Kcstudio |
| URL | `https://kcstudio.org/top-things-to-do-this-summer-2025` |
| Legacy fingerprint | `6b6373747564696f2e6f72677c6b6373` = `kcstudio.org\|kcs` |
| Identity under new gate | **invalid** (`editorial_headline`) |
| Computed V2 | **null — do not give it V2 identity** |
| Later migration | **clear legacy fingerprint**; quarantine/delete separately. Do not hash this into V2. |

Exact same URL against any of these three still resolves via URL lookup. A **different** same-host URL no longer merges via the stored truncated key.

---

## S1 closed in code

| Requirement | Proof |
| --- | --- |
| Distinct same-host legitimate entities no longer collide | V2 WGACA ≠ Nike; postgres A creates a distinct Nike row |
| Invalid entity cannot bypass the gate through fingerprint lookup | Identity throw before V2 lookup; postgres 10/11 and B |
| Exact URL duplicate behavior remains | postgres 7 and 12 |
| No legacy truncated fingerprint is used to merge a different URL | V2-only SQL filter; postgres 13; touch refuses legacy metadata |
| V2 uses cryptographic hashing | SHA-256, 64 hex, matches `sha256sum` of the tuple |
| No production path still calls legacy generation for new writes | `pipeline.ts` calls `tryBuildOpportunityFingerprint` only. `buildLegacyOpportunityFingerprint` appears in tests + definition. Grep: `toString('hex').slice(0, 32)` remains only inside the legacy helper (plus an unrelated Ask Benson event-id test) |

---

## Confirmations

| Check | Status |
| --- | --- |
| Live data changed | **no** (114 partnerships, 6031 content items; three legacy rows still truncated hex; `updated_at` unchanged) |
| Legacy live fingerprints migrated | **no** |
| SCHEELS research rebuilt | **no** (`research` still `{}` on `341940fa-…`) |
| Junk partnerships cleaned | **no** (Instagram + KC Studio rows still present) |
| Schema migration added | **no** |
| Mutation canaries / smoke run against live | **no** |
| Calendar / Discover / sponsor / outreach touched | **no** |

---

## Unrelated findings (out of scope)

- SCHEELS/WGACA live row remains an **identity stub** (qualified / complete / fit 42, empty research/play). Rebuild is a later operator decision, not this task.
- Nine Loews clone rows with **null** stored fingerprints (same URL) still exist from earlier evidence-orchestration fixtures. V2 does not rewrite them.
- Program-library budget-gate leftover on empty `llm_usage_events` in `social_agent_test` was not investigated.
- Email-match `creator_partnerships.fingerprints` jsonb is a **different** system and was not changed.
- `TEST_DATABASE_URL` is documented in `.env.example` but is not set in this machine's `.env`; tests were invoked with an explicit `social_agent_test` URL. Runtime Benson still uses `DATABASE_URL` / `social_agent`.
