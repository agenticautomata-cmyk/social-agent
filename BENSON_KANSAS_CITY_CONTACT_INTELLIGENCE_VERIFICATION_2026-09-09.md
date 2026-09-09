# Benson KC Contact Intelligence — Independent Verification

**Date:** 2026-09-09  
**Lane:** INDEPENDENT SAFETY / VERIFICATION (did not implement)  
**Primary report:** `BENSON_KANSAS_CITY_CONTACT_INTELLIGENCE_2026-09-09.md`  
**Commits reviewed:** `a370fa2`, `c8a25e6`, `6a61bee` (tree also includes later Eventbrite commits; fingerprint still matches)

---

## Verdict for Elliott

**CONDITIONAL PASS — not a critical send-safety FAIL; do not treat as full ship success.**

Import, send gates, discovery review-queue contract, live `stub:false` recommendations, and no real outreach artifacts check out. The mission success standard (“useful timely honest recommendations,” not just an address book) is **mostly met on the hub/API**.

**Blocked for full closeout:** live **recommendation → pitch / form approval path is broken in the deployed dashboard** (`/outreach/compose`, `/email/form-packets`, `/email/approvals` return prerendered `404` because `ENABLE_OPPORTUNITIES_UI` was false at build / static `notFound()`). Hub + brief work; “what to do next” into approval surfaces does not.

---

## Observed deploy fingerprint

Re-ran `scripts/benson-deployment-status.sh` at verification time:

| Field | Value |
|-------|-------|
| status | **MATCH** |
| source / api / dashboard / worker | **`705df6daa09fec51`** |
| apiStartedAt | `2026-09-09T01:02:29.305Z` |
| dashboardBuiltAt | `2026-09-09T01:02:39Z` |
| checkedAt | `2026-09-09T01:12:48.567Z` |

Primary’s MATCH claim **`705df6daa09fec51` is corroborated**. Public hub `https://benson.kckellie.com/contacts-programs` → HTTP 200; public API meta `stub:false`.

Note: runtime “build identity” commit label still showed an older tip (`b4fadc6`) in `runtime-status.sh`; **fingerprint MATCH is the authoritative parity signal**, not that git label.

---

## Check results

### 1. Import integrity — **PASS**

| Claim | Evidence |
|-------|----------|
| 48 workbook contacts | DB: `48` rows with `[[benson-contact-import:v1]]` and `merged_into_id IS NULL` |
| Evidence mix | 22 named / 12 role / 6 form / 5 general / 3 unknown — matches primary |
| Provenance retained | All 48 have `verification_method=workbook_import` and `permanentVerification:false` in notes |
| Multi-contact ≠ duplicate businesses | Same-name keys only for intentional multi-email orgs (Visit KC×2, Visit KCK×2, Chiefs×2, Zoo×2) with distinct emails |
| Programs distinct | **10** workbook programs in `creator_partnerships` programLibrary metadata; not merged into sponsor_contacts |
| Workbook confidence ≠ permanent send unlock | `WORKBOOK_IMPORT_RECHECK_DAYS=90`; test proves >90d workbook evidence → `emailSendAllowed=false` |

### 2. Send safety — **PASS** (with quality notes)

| Rule | Result | Evidence |
|------|--------|----------|
| Guessed/inferred emails never send-ready | **PASS** | `evaluateEmailFormatInference` hard-bans; discovery maps inferred → send `inferred_unverified`; import-safety + discovery tests |
| Wrong-purpose inboxes blocked | **PASS** | purpose-blocklist + recipient-safety; e.g. `legal@` / `privacy@` / `crisis@` blocked |
| Forms cannot reach Gmail send | **PASS** | `official_contact_form` → `emailSendAllowed=false`, delivery `official_form`; email-approval eligibility `eligible=false` / `formOnly=true` |
| Media-access not mislabeled paid | **PASS** | `normalizeCompensationForRoute('media_access','paid')→media_access_not_paid`; live programs Starlight / WWI / Worlds of Fun = `media_access_not_paid` + UI disclaimer |
| Unknown compensation stays unknown | **PASS** (policy) | `askType===unknown` demoted in ranking; unknown label/copy in UI; Starlight **contact** row is `marketing_named` with `compensationAccessType=unknown` (program row carries media-access honesty separately) |

### 3. Recommendations — **PASS** (gaps below)

Live `GET /api/contact-intelligence/hub?view=recommended_now`:

- `ok:true`, **`stub:false`**, **20** cards  
- `verified_contacts`: 46 · `programs_applications`: 102 · `needs_verification`: 77  

Ranking is **not** “has email alone”: requires route + ask heuristics, excludes `needsVerification` / `monitor_only`, demotes `askType=unknown`, score ≥ 25, and copy explicitly says not to act because an email exists.

Spot sample (no hotel↔men’s-fashion absurdity observed): Visit KC (hosted/destination kit), WWI (admission), Kauffman, Joe’s BBQ (restaurant kit), Summit, hotels with hotel kit, sports as media_access_not_paid, KC Dresses as affiliate/core.

**Gaps (not critical safety):**

1. **Dismiss silence incomplete vs claim.** Code silences dismissed contacts for **45 days** only. There is **no “new evidence lifts silence”** check (and conversely no “after 45 days still require new evidence”). Primary’s “without new evidence” wording is **overclaimed**.  
2. **Crossroads Hotel quality miss:** workbook best-use “Stay / dining / …” matches `/dining|product/` before hosted-stay patterns → ask becomes meal/product; empty `category` → media kit `core` instead of `hotel`. Honest enough not to invent pay; still a recommendation-quality defect.  
3. Recommendations still workbook-heuristic (primary already noted) — not full live opportunity-graph join.

### 4. UX — **PARTIAL FAIL**

| Item | Result |
|------|--------|
| `/contacts-programs` mobile hub | **PASS** — Playwright 390×844: live cards, why-fit/why-now, filters, related links |
| More menu entry | **PASS** — `HAS_CONTACTS_MENU true`; also in `MOBILE_DRAWER_PINNED` + opportunities More nav |
| Recommendation → brief | **PASS** — Visit KC opens `/contacts-programs/{id}` with honest “no draft / approval required” |
| Brief → pitch / form path | **FAIL in live deploy** — `/outreach/compose`, `/email/form-packets`, `/email/approvals` (and related CRM/media-kit pages gated the same way) return **HTTP 404** with `x-nextjs-prerender: 1` / `NEXT_HTTP_ERROR_FALLBACK;404` because pages call `notFound()` when `isOpportunitiesUiEnabled` is false **at prerender**. Runtime process env has `ENABLE_OPPORTUNITIES_UI=true`, but the static 404 is cached. Public tunnel same 404. |
| `stub:false` with real data | **PASS** on meta + hub |

Proof screenshots (verification lane):  
`docs/ops/proofs/kc-contact-intelligence-verification-2026-09-09/`

### 5. Discovery contract — **PASS**

Discovery modules are pure policy; review-queue tests require `pending_review` before actionable; `autoCreatePitch: false`; inferred/blocked cannot admit as actionable. No auto-pitch from discovery code path found.

### 6. Deploy truth — **PASS**

Fingerprint MATCH `705df6daa09fec51` re-confirmed. Hub reachable locally and on `benson.kckellie.com`.

### 7. Live official-page spot-checks — **MIXED (honest)**

| Route type | Target | Re-verify vs workbook-only |
|------------|--------|----------------------------|
| Direct email | Visit KC media contact | **Re-verified:** HTTP 200, `daaron@visitkc.com` in static HTML |
| Direct email + named | WWI press room | **Re-verified:** `media@theworldwar.org` + Karis Erwin on `theworldwar.org/press-room` |
| Named marketing email | Starlight newsroom | **Re-verified:** `rachel.bliss@kcstarlight.com` in static HTML |
| Official form | MRA influencers, KC Restaurant Week contact | **Pages live (200)** with form/contact markers; did **not** submit |
| Program / media-access | Starlight, WWI, Worlds of Fun program URLs | Pages live; programs labeled `media_access_not_paid` + `operator_supplied` / needs verification — **workbook authority, not claimed verified_official** |
| Affiliate | KC Cattle / Awin merchant profile URL | Retained as form/application route; no enrollment attempted |

Primary’s caveat that some hotels/CRM pages hide addresses in JS remains valid for non-static cases; this lane did not rubber-stamp those.

### 8. Tests — **PASS** (no new failures observed)

| Suite | Result |
|-------|--------|
| `services/core` `src/contact-intelligence/**/*.test.ts` (incl. import-safety, discovery, import, ux-contracts) | **60 pass / 0 fail** |
| `partnership-contracts.test.ts` | **64 pass / 0 fail** |
| `email-approval-eligibility.test.ts` | **8 pass / 0 fail** |
| `dashboard/lib/contact-intelligence-nav.test.ts` | **3 pass / 0 fail** |

Primary said 59 CI tests; this lane counted **60** in the contact-intelligence tree. **No new failures** attributed to this work in the suites run. Full monorepo suite not re-run.

### 9. No real outreach artifacts — **PASS**

| Check | Result |
|-------|--------|
| `outreach_emails` created ≥ 2026-09-08 | **0** |
| Sent-status rows in that window | **0** |
| Telegram tables / send artifacts from this mission | none found in DB; no mission send lines in pre-alpha logs beyond test suite text |
| Contact-intelligence recommendation events | 1 × `viewed` from this verification’s Playwright brief open — **not** a send |

Hard ban respected by this lane: no emails, Telegram, forms, or enrollments.

---

## Critical safety?

**No critical send-safety FAIL.** Guessed emails, form→Gmail, wrong-purpose, media-access-as-paid, and workbook-as-permanent-verification controls hold in code + live samples.

## Required fixes before calling the mission fully shipped

1. **Repair live pitch/form path:** rebuild/restart dashboard with `ENABLE_OPPORTUNITIES_UI=true` present at **build** (or stop statically prerendering `notFound()` for those routes) so `/outreach/compose` and `/email/form-packets` are reachable from contact briefs. Until then, “what to do next” stops at a 404.  
2. **Dismiss / new-evidence contract:** either implement “silence until new evidence or 45 days” as claimed, or correct the closeout report to “45-day silence only.”  
3. **Recommendation quality (non-blocking):** Crossroads Hotel category/ask/kit mapping; optional hotel-kit when business name is hotel but category null.

---

## Success standard assessment

| Standard | Met? |
|----------|------|
| Useful / timely / honest recommendations (not lifeless address book) | **Mostly yes** — live ranked cards with why-fit, why-now, route, ask, kit, weaknesses |
| Import-only ship | **No** — recommendations + briefs are live |
| End-to-end contact assistance into approval surfaces | **No** — approval/form pages 404 in current MATCH deploy |
| Send-safety / no real outreach | **Yes** |

**Bottom line:** Primary’s safety and import claims largely stand; fingerprint MATCH stands; recommendations are real. **Do not rubber-stamp full success** until the pitch/form UI gate is fixed in production.

---

## Follow-up fix (same day) — CTA path restored

See **`BENSON_KANSAS_CITY_CONTACT_INTELLIGENCE_CTA_FIX_2026-09-09.md`**.

- Root cause confirmed: build-time miss of repo-root `ENABLE_OPPORTUNITIES_UI` → static `notFound()` 404s despite runtime true.  
- Fix: load root `.env` in `next.config.mjs`, fail dashboard build if flag off, `force-dynamic` on compose / form-packets / approvals.  
- Post-deploy fingerprint **MATCH `ef4447b294c321dd`**; public `/outreach/compose`, `/email/form-packets`, `/email/approvals` → HTTP 200.  
- Dismiss “new evidence” claim corrected in primary report to **45-day silence only**.
