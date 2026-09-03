# Benson Creator Assets & Media Kit Completion — 2026-09-03

**Branch:** `release/scout-expansion-2026-07-25`  
**Baseline (Beast Pass tip):** `5a7cbcc`  
**Implementation commit:** `a2f7b1a`  
**Prior fingerprint (MATCH, reconfirmed before edits):** `13ffe7425d9336cc`  
**Post-deploy fingerprint (MATCH):** `52b7829ebe7d2942`  
**Public:** https://benson.kckellie.com  
**API:** https://api.kckellie.com  

---

## Executive summary

This pass closes the Creator Assets + media-kit integrity gaps left after Beast Pass, without rewriting Beast Pass work.

**For Kellie:** Photos uploaded via Ask Benson or `/creator-assets` are stored durably, EXIF-stripped for public derivatives, and stay private until she explicitly approves public use. Media kits are now **versioned** (web + one-page PDF). Approving a pitch pins kit **version id + content hash** — regenerating a kit cannot silently change what a recipient sees after approval. Legacy approvals without a content hash can no longer bypass live send.

**Hospitality follow-through:** Crossroads pitch improved (prior draft preserved); Loews form-only packet queued with rights warning (Benson will not submit); partnership source checks now scheduled daily and extractors cover Loews form/press/offers (+ Origin deals URL).

---

## Acceptance checklist

| Requirement | Status |
|---|---|
| Ask Benson creator-asset intake with roles/states; never silent publish | ✅ Durable save as `pending_public_use`; public kit assign refused until approved |
| MIME sniff + EXIF strip + responsive crops; no AI face mods | ✅ Magic-byte sniff; sharp `rotate()` re-encode for public/web/thumb/print |
| Simple Creator Assets mobile surface | ✅ `/creator-assets` |
| Three kit layers (profile / category / business) | ✅ `layer` on versions: `profile` (core) / `business_specific` (hotel/restaurant/destination) |
| Kit version + content hash in approval; mutations require reapproval | ✅ `approved_media_kit_version_id` + `approved_media_kit_content_hash` in hash payload |
| Web + PDF for approved versions; PDF visually inspected | ✅ `/api/public/media-kit/:slug/{view,pdf}?v=`; PDF 1.4 one-pager verified |
| Source health + scheduled checks | ✅ Worker `partnership-sources-check` (24h); extractors expanded; 6 healthy |
| Loews form-only slice; rights warning; do not submit | ✅ Packet in queue; UI banner; `bensonMustNotSubmit` |
| Crossroads improved if unapproved; prior draft preserved | ✅ Improved; `benson_draft_context.priorDraft` kept |
| TikTok-only analytics; no invented IG/FB/YT | ✅ Pitch + PDF disclosure; Crossroads body explicit |
| Telegram urgency classifier preserved | ✅ Urgency tests green; operator MD sent non-Urgent |
| Today ≤5; Pitches honest form-only; Home/Discover/Watchlist intact | ✅ Verified screenshots / HTTP 200 |
| Quarantine preserved; legacy hashless cannot bypass | ✅ Live send freezes null-hash approvals |
| Deploy MATCH; commit; push; report; Telegram | ✅ See below |

---

## Architecture

```
Ask Benson image / Creator Assets upload
  → MIME sniff → durable original + EXIF-stripped derivatives
  → public_use_state: draft | pending_public_use | approved_public_use | …
  → assign to kit ONLY when approved_public_use

buildMediaKit / persistVersionedMediaKit
  → immutable media_kit_versions row (content_hash + snapshot + PDF)
  → media_kits.current_version_id pointer

approveOutreachEmail
  → hash(subject|body|recipient|mediaKitId|versionId|contentHash)
  → pin approved_media_kit_version_id + content_hash

sendOutreachEmail (live)
  → refuse legacy approved_at without hash
  → match hash including kit version; mismatch → needs_approval
```

**Migration:** `89_creator_assets_media_kit_versions.sql` (additive).

---

## What shipped (code)

- `services/core/src/creator-assets/*` — types, sniff, storage, CRUD, assign gates
- `services/core/src/media-kit/{versions,content-hash,pdf}.ts` — versioning + PDF
- `services/core/src/sponsor-outreach/{content-hash,outreach,send}.ts` — kit pin + legacy freeze
- `services/api/src/routes/{creator-assets,public-media-kit,ask-benson}.ts`
- `dashboard/app/creator-assets/*` + Pitches form-only banner
- `services/workers/.../partnership-sources-check.ts` cron
- Loews extractors + `loews-form-packet.ts` + `prepare-loews-packet` script
- Crossroads improve script (prior draft preserved)

---

## Live data actions (2026-09-03)

| Action | Detail |
|---|---|
| Migration 89 | Applied via `pnpm migrate:creator-assets` |
| Media kits | Regenerated; hotel at **version 2** with PDF |
| Crossroads | Improved subject/body; prior draft in context; still `needs_approval` |
| Loews packet | Created `12f40413-…` — `review_ready_form_only` |
| Source checks | `--all`: 6 healthy (was 3); Loews form/press/offers extracting |

**Not done:** No real email send. No Loews form submit. No noisy Telegram urgency tests. No publish of unapproved photos.

---

## Test results

```bash
# Focused creator-assets + beast-pass suite
cd services/core && node --import tsx --test \
  src/creator-assets/creator-assets.test.ts \
  src/media-kit/media-kit-version.test.ts \
  src/sponsor-outreach/content-hash.test.ts \
  src/hospitality-pitch/*.test.ts \
  src/partnership-sources/extract-loews.test.ts \
  src/partnership-urgency/urgency.test.ts \
  # … + prior beast-pass files
# Result: 285 pass / 0 fail

# Deploy Tier A
# Result: 246 pass / 0 fail

# partnership-db-integrity.ts — all checks ran
```

Adversarial fixes before ship:
- Legacy null-hash live send path closed
- Unapproved assets cannot assign to kits
- Form-only Loews packet cannot pretend to be email-sendable
- Origin deals extractor URL corrected to seeded URL

---

## Deployment

| | |
|---|---|
| Command | `pnpm benson:deploy-local` |
| Status | **MATCH** |
| Fingerprint | `52b7829ebe7d2942` |
| apiStartedAt | 2026-09-03T18:16:36Z |
| dashboardBuiltAt | 2026-09-03T18:16:43Z |
| Commit | `a2f7b1a` (pushed; local == origin) |

First deploy attempt hit cold `.next` ENOENT; cleaned `dashboard/.next` and redeployed successfully.

---

## Public verification

| Surface | Result |
|---|---|
| Creator Assets `/creator-assets` | 200 local |
| Pitches `/email/approvals` | 200; form-only banner for Loews |
| Today `/editor` | 200 (screenshot via `domcontentloaded`) |
| Home `/home` | 200 |
| Media kit `?v=2` | 200 local + public |
| PDF `.../pdf?v=2` | 200; valid PDF 1.4, 1 page, 2628 bytes |

Screenshots / PDF artifacts:

```
docs/ops/screenshots/creator-assets-media-kit-2026-09-03-creator-assets-{mobile,desktop}.png
docs/ops/screenshots/creator-assets-media-kit-2026-09-03-pitches-{mobile,desktop}.png
docs/ops/screenshots/creator-assets-media-kit-2026-09-03-today-{mobile,desktop}.png
docs/ops/screenshots/creator-assets-media-kit-2026-09-03-home-{mobile,desktop}.png
docs/ops/screenshots/creator-assets-media-kit-2026-09-03-media-kit-hotel-{mobile,desktop}.png
docs/ops/screenshots/creator-assets-media-kit-2026-09-03-kellie-hotel-v2.pdf
```

---

## Fingerprints

| When | Fingerprint | Status |
|---|---|---|
| Beast Pass close-out (pre this pass) | `13ffe7425d9336cc` | MATCH (reconfirmed) |
| After this pass deploy | `b22072cc0ec190c8` | MATCH |

---

## Honest blockers / limits

1. **Kellie must still approve** Crossroads (and decide Loews form submit) — Benson does not auto-send or auto-submit.
2. **Crossroads event is Sept 5** — time-sensitive; delay may miss the window.
3. **9 sources remain unchecked** (no extractor yet) — honest skip, not fake healthy.
4. **HLAKC directory** still needs Playwright.
5. **IG/FB/YT** still disconnected — pitches correctly TikTok-only.
6. **Host memory** still tight; first dashboard build failed until `.next` cleaned.
7. Category-template layer is represented as business variant kits (hotel/restaurant/destination); a separate generic “category template” row was not required beyond that.

---

## Product summary (Kellie / Elliott)

Kellie can now upload photos, preview them, and approve which ones may appear publicly. Media kits for hotels (and other variants) come as a web page **and** a one-page PDF, with version numbers so an approved pitch cannot quietly change. Crossroads is ready for her review with clearer TikTok-only numbers and a dated Sept 5 ask. Loews is prepared as a **form packet** she (or Elliott) can submit by hand — Benson will not click submit. Source monitoring runs on a schedule for the pages Benson actually knows how to read.

---

## Telegram delivery

Operator delivery of this report summary uses `sendTelegramMessage(..., { requireOutreachEnabled: false })` — **not** the Urgent partnership classifier path.

---

*End of report.*
