# Benson Creator Assets + Approval Queue Trust Repair — 2026-09-03

**Branch:** `release/scout-expansion-2026-07-25`  
**Baseline HEAD (before edits):** `56bde2a` (clean, matched origin)  
**Pre-edit fingerprint (MATCH):** `52b7829ebe7d2942`  
**Post-deploy fingerprint (MATCH):** `fb9aa6a3c6980828`  
**Public:** https://benson.kckellie.com  
**API:** https://api.kckellie.com / local `:4000`

---

## Plain-language summary

Kellie can now find **Creator Assets** under More → My Info (and Quick Access), next to a clearly labeled **Media Kit Library**. Uploading a headshot through Ask Benson saves the photo privately and tells the truth: it is waiting for approval and is **not** on a kit. Generated kits no longer look like “missing files.” The junk pitch **“Selling Men’s Casual Styles”** is quarantined by invariant (category name + no email + no form URL + generic template), not by hiding a title. Email approvals show only evidenced email drafts (Crossroads). Loews lives on a separate **Form packets** workflow with no Approve & send.

---

## Exact root cause of each defect

| # | Defect | Root cause |
|---|---|---|
| 1–2 | Creator Assets missing / Media kits unlabeled | Dashboard More menu (`getNavGroups` / `MY_INFO_NAV_ITEMS`) listed only “Media kits”; `/creator-assets` existed but was not linked. Studio routes had Creator Assets but UI nav did not. |
| 3–5 | Ask Benson claimed kit updated + Scheels mix-in | Asset save ran **after** LLM vision/OCR. Empty image turns used `ASK_BENSON_IMAGE_INSPECT_INSTRUCTION`, so the model invented kit-success language and could mix prior URL context. |
| 6 | Assignment path unclear | Creator Assets UI stopped at approve; no kit-target chooser or rebuild. |
| 7 | Generated kits said “no file” / “send to Benson” | Library UI treated all `media_kits` rows as uploaded collateral (`kitFileLabel` → “no file”). |
| 8–10 | Junk pitch still in email queue | `classifyOutreachEmail` exempted `official_contact_form` from “no email = weak,” so contactless category-name drafts stayed `active`. List query only filtered quarantine + `needs_approval`, not email eligibility. Approve UI still showed Approve / Approve & send. |

---

## Files and schema changed

**Nav / UI:** `dashboard/lib/my-info-nav.ts`, `opportunities-ui.ts`, `nav-config.ts`, `creator-assets-panel.tsx`, `media-kits-panel.tsx`, `media-kits/page.tsx`, `email/approvals/*`, `email/form-packets/*`, `sponsor-outreach-types.ts`, `media-kit-library.ts`

**Ask Benson:** `services/api/src/routes/ask-benson.ts`, `services/core/src/ask-benson/creator-asset-intake.ts`

**Creator assets / kits:** `creator-assets/assets.ts`, `api/routes/creator-assets.ts`, `media-kit/build.ts`, `render.ts`, `sponsor-outreach/media-kits.ts`, `api/routes/public-media-kit.ts`

**Queue trust:** `partnership-contracts/{quarantine,generic-pitch,email-approval-eligibility}.ts`, `sponsor-outreach/{outreach,send}.ts`, `partnership-today/decisions.ts`, `api/routes/outreach.ts`, `scripts/repair-approval-queue-trust.ts`

**Schema:** no new migration. Backups: `outreach_emails_backup_20260903_queue_trust`, `sponsor_contacts_backup_20260903_queue_trust`.

---

## Ask Benson response before and after

**Before (false):** claimed headshot added to media kit / kit ready; could mix Scheels OCR/URL context; role often `other`.

**After (from persisted state):**  
“Your photo (…) was uploaded privately and is waiting for approval. It is not on any media kit yet… Review it in Creator Assets…” with deep link `→ /creator-assets`. Save failure returns an honest error and never claims success. Explicit OCR requests skip creator-asset short-circuit.

---

## Asset state-machine behavior

`draft` / `pending_public_use` → Approve public use → `approved_public_use` → assign Hotel / Restaurant / Destination / All / unassigned → rebuild selected kit variants as **new immutable versions** → unassign without deleting original. Display: Private/pending · Approved/unassigned · Approved/assigned · Rejected/archived. Roles: Headshot, Lifestyle, Brand/logo (`hero`), Work/sample (`proof_still`), Other.

**Note:** Kellie’s live pending headshot was **not** approved or published in this pass; assignment/rebuild verified with fixtures/tests.

---

## Generated-kit versus uploaded-collateral separation

Media Kit Library shows **Generated media kits** (name, version, status, timestamp, assigned assets, web/PDF, pin status, View web kit / Download PDF) separately from **Uploaded collateral** (file labels + send to Benson). Generated kits never show “file: no file” / “no file attached” / “send to Benson.”

---

## Exact provenance of “Selling Men’s Casual Styles”

| Field | Value |
|---|---|
| `outreach_emails.id` | `0d546d67-c2dc-4f72-95ff-6016c73cf553` |
| Subject | Your Casual Styles — Let's Collaborate! |
| Created | `2026-08-15T12:23:11.978Z` |
| Drafted by | `benson` |
| Status / readiness | `needs_approval` / `researching` |
| Contact | `706ff9cb-05bd-4382-86ca-8dbb7a71add9` — business_name “Selling Men's Casual Styles” |
| Email | `null` |
| Evidence | `official_contact_form`, **evidence_url null** |
| Media kit | none |
| Duplicate | `5f064f17-…` (older “Love Your Casual Styles…”, readiness `sent`) same contact |

**Why it survived Beast Pass:** quarantine treated form-tagged rows without email as OK for the active workflow; the email approvals list did not enforce evidenced-email eligibility. Category-style business names were not classified invalid until this pass.

**Action:** quarantined `quarantined_invalid_entity` (selling… styles invariant). Remains in DB for audit.

---

## Active queue counts before / after

### Before (needs_approval)

| quarantine_state | n |
|---|---|
| quarantined_stale | 66 |
| quarantined_invalid_entity | 18 |
| quarantined_synthetic | 6 |
| quarantined_weak | 5 |
| **active** | **3** (Crossroads, Loews, Selling Men’s Casual Styles) |

### After repair + eligibility filters

| Surface | Count | Rows |
|---|---|---|
| Active `needs_approval` in DB | 2 | Crossroads, Loews |
| **Email approvals API** | **1** | Crossroads Hotel only |
| **Form packets API** | **1** | Loews Kansas City Hotel |
| Junk in email queue | 0 | quarantined |

---

## Quarantined this run

| id | Reason |
|---|---|
| `0d546d67-c2dc-4f72-95ff-6016c73cf553` | Invalid entity: product-category / “selling … styles” name — not a business |

---

## Contact-form workflow evidence

- Route: `/email/form-packets` (nav: Daily + Email)
- Loews packet present; banner: human submits; Benson will not submit/email
- UGC rights warning preserved on packet context
- Confirm action: `mark-contact-form-sent` only after Kellie confirms
- Direct API approve of Loews rejected with form-packet eligibility error

---

## Tests (exact counts)

| Suite | Pass | Fail |
|---|---|---|
| Focused core (assets, eligibility, quarantine, hospitality, urgency, Today, Discover, Watchlist, recipient safety, content-hash, media-kit) | **266** | **0** |
| Dashboard (incl. nav + generated-kit copy) | **42** | **0** |
| Deploy-local Tier A (in `benson:deploy-local`) | green | 0 |
| Typecheck core / api / dashboard | pass | — |

No live email or Telegram in tests (mocked / pure).

**Pre-existing failures:** none observed in this focused set; full monorepo suite not re-run end-to-end beyond deploy gate + focused packs.

---

## Build and deploy

| Step | Result |
|---|---|
| `pnpm benson:deploy-local` | ✅ complete |
| Fingerprint | **MATCH** `fb9aa6a3c6980828` |
| apiStartedAt | 2026-09-03T20:08:08.450Z |
| dashboardBuiltAt | 2026-09-03T20:08:15Z |

---

## Public URLs checked

| URL | HTTP |
|---|---|
| https://benson.kckellie.com/creator-assets | 200 |
| https://benson.kckellie.com/media-kits | 200 |
| https://benson.kckellie.com/email/approvals | 200 |
| https://benson.kckellie.com/email/form-packets | 200 |
| https://benson.kckellie.com/media-kit/kellie-hotel?v=2 | 200 |
| https://benson.kckellie.com/api/public/media-kit/kellie-hotel/pdf?v=2 | 200 |
| https://benson.kckellie.com/home | 200 |

Local API: approvals = Crossroads only; form-packets = Loews only.

Adversarial POST approve junk → quarantined error. Approve Loews → email eligibility error.

---

## PDF inspection

| File | Size | Pages | Render |
|---|---|---|---|
| `docs/ops/screenshots/queue-trust-2026-09-03-kellie-hotel.pdf` | 2628 bytes | 1 (PDF 1.4) | Valid `%PDF-` one-pager; nonempty human-readable kit (not blank/corrupt) |
| sha256 prefix | `ef99a64d823a2318…` | | |

---

## Screenshot paths

```
docs/ops/screenshots/queue-trust-2026-09-03-more-my-info-mobile.png
docs/ops/screenshots/queue-trust-2026-09-03-creator-assets-{mobile,desktop}.png
docs/ops/screenshots/queue-trust-2026-09-03-media-kits-{mobile,desktop}.png
docs/ops/screenshots/queue-trust-2026-09-03-approvals-{mobile,desktop}.png
docs/ops/screenshots/queue-trust-2026-09-03-form-packets-{mobile,desktop}.png
docs/ops/screenshots/queue-trust-2026-09-03-media-kit-hotel-{mobile,desktop}.png
docs/ops/screenshots/queue-trust-2026-09-03-home-{mobile,desktop}.png
docs/ops/screenshots/queue-trust-2026-09-03-kellie-hotel.pdf
```

390px More menu shows Creator Assets + Media Kit Library under My Info (and Creator Assets in Quick Access).

---

## Commit / push / fingerprint

| | |
|---|---|
| Implementation commit | `bf184dc` |
| Fingerprint | `fb9aa6a3c6980828` MATCH |
| Local/remote | local ahead then pushed — see push confirmation |
| Push | *(filled after push)* |

---

## Honest remaining limitations

1. Kellie still must approve Crossroads and decide Loews form submit.
2. Live pending headshot left for Kellie — not assigned in production during this pass.
3. Generated PDF remains text one-pager; assigned photos appear on the **web** kit after assignment (public asset route gated on approved+assigned).
4. Cursor browser MCP was unavailable; public UI verified via Playwright screenshots + HTTP.
5. Host memory remains tight for cold `.next` builds.

---

## Explicit confirmation — no real outreach

**No real email was sent. No Telegram was sent during implementation/testing. No contact-form was submitted. No pitch of Kellie’s real items was approved. No unapproved headshot was published.**

Authorized Telegram delivery of **this report** occurs only after commit + push + deploy + verify (status below).

---

## Telegram delivery

*(filled after authorized send)*

---

*End of report.*
