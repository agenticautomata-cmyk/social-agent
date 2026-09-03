# Benson Asset Assignment + Photo PDF Repair — 2026-09-03

**Branch:** `release/scout-expansion-2026-07-25`  
**Public:** https://benson.kckellie.com → `:3000`  
**API:** https://api.kckellie.com / local `:4000`

---

## Independent review status

**PASSED by independent reviewer (2026-09-03).** Playwright adversarial pass on production (`https://benson.kckellie.com`), fingerprint **MATCH** `f585404a444136cb`, review commit `c2d2be5`. See “Independent review” section below. Telegram DOCUMENT delivery confirmed (`message_id` 331).

---

## Plain-language summary

Approve no longer feels like a dead-end or a silent kit publish. Creator Assets uses a draft kit selection + **Save assignment** flow; role for next upload is clearly separate from each photo’s role. Web kits show assigned photos near About (not only buried later). PDFs now **embed the JPEG** for that exact kit version instead of being text-only. Kellie’s real headshot (`37436.jpg`) was inspected read-only, left on Hotel as she already had it, and Hotel **v6** was rebuilt only so the existing assignment’s PDF includes the image.

---

## Phase 1 — Observed production state (read-only)

### Real asset `37436.jpg`

| Field | Value |
|---|---|
| `id` | `b5831e43-2012-4bbb-953f-8fcfa01a8076` |
| `role` | `other` (Ask Benson upload; upload-role control is for *next* uploads only) |
| `public_use_state` | `approved_public_use` |
| `public_use_approved_at` | `2026-09-03T22:58:01.453Z` by `kellie` |
| `source` | `ask_benson` |
| `created_at` | `2026-09-03T19:26:16.967Z` |
| Assignment row | **1 real row** → Hotel kit `a9f37fd4-08db-4a53-a142-effa50396936` (`kellie-hotel`), placement `gallery`, `assigned_at` `2026-09-03T22:58:34.328Z` |
| Kit versions from assignment rebuilds | Hotel **v4** (`22:59:01`), **v5** (`23:01:07`) — both `kellie_asset_assignment` |
| Post-repair rebuild (PDF embed only) | Hotel **v6** (`23:14:38`) — `asset_pdf_repair`; **did not invent a new assignment** |

### Answers to diagnostic questions

| Question | Finding |
|---|---|
| Did approval alone create an assignment? | **No.** `approvePublicUse` only flips state. Assignment row appeared **33s later**. |
| Did “Approved but unassigned” create an assignment? | **No** (that path clears). Hotel assignment means a **Hotel** (or All) target was submitted. |
| Unexpected click / immediate mutation? | **Yes — UX root cause.** After Approve, the UI auto-opened targets and **each button immediately POSTed** `assign-target` (no Save). Easy mis-tap on Hotel. |
| “Assigned to 1 kit” real? | **Yes** — real `media_kit_asset_assignments` row + version snapshots listing the asset id. |
| Why controls “locked”? | `busyId` disabled role + assign controls for the **entire** `persistVersionedMediaKit` rebuild (~25–30s). Felt frozen; second rebuild ~2 min later matches a retry while confused. |
| Library latest vs pinned? | Latest Hotel became v5 (then v6 after PDF repair). Older pinned pitch versions (v2/v3) unchanged and asset-free. |
| Rendering ignore role `other`? | **No** — web snapshot included it under Photos; screenshot likely missed below-fold Photos. PDF omitted images for *all* roles (generator was text-only). |
| Image URL permissions? | Public asset URL returned **200** JPEG (832×1248) while assigned. |
| Web and PDF same versioned data? | Same `content_snapshot`, but PDF renderer ignored `assignedAssets` images until this repair. |

---

## Root causes

1. **Immediate-click assignment + long sync rebuild** → accidental Hotel assign + UI locked on `busyId`.
2. **Approve opened assign menu with mutating buttons** → approval felt coupled to assignment.
3. **PDF path was text-only** (`renderMediaKitPdf` never embedded JPEGs) → “not in the kit” for PDF downloads even when web snapshot had the asset.
4. **Web Photos section below the fold** + role label `other` → easy to miss in a top-of-page screenshot even when present.
5. **Two role controls were unclear** → “Role for next upload” vs per-photo role.

---

## Phase 2 — Fixes shipped

### Approval ≠ assignment
- Approve still only sets `approved_public_use`.
- Draft checkboxes + **Save assignment**; Cancel does not mutate.
- Empty selection / Save → `targets: ['unassigned']` → **zero** current assignments + rebuild removed kits.
- Loading scoped to the action; errors surface; draft stays open on failure for retry.

### Richer assignment truth
- API returns kit name, variant, version, web/PDF links, `generationStatus`.
- UI lists each assigned kit with links (not only “Assigned to 1 kit”).
- Rebuild statuses: ready / generation_failed (retryable message).

### Roles
- Upload control labeled **Role for next upload** (future only).
- Per-photo **Role for this photo** persists via PATCH and confirms.

### Web + PDF images
- Web: featured photo beside About (first assigned / headshot preference); additional gallery section.
- PDF: embeds print/web JPEG as `/DCTDecode` XObject, fit-inside (no stretch).
- Versioned PDFs self-contained at generate time; public asset route also serves snapshot-referenced assets after later unassign.
- New immutable versions on content/assignment rebuilds; pitch-pinned older versions untouched.

### Kellie protection
- Did **not** delete/re-upload `37436.jpg`.
- Did **not** invent a new assignment choice for her; left Hotel assignment as found.
- Rebuilt Hotel **v6** only to embed the already-assigned photo in PDF.
- Mutation testing used isolated test asset `7f259542-b134-4889-841c-9dd15add4c81` (destination v2 evidence, then unassigned; latest destination v3 clean).

---

## Elliott decision still needed

Kellie’s live photo remains **Approved/assigned → Hotel (v6)**, role still **`other`** unless changed in UI.

Please confirm via fixed Creator Assets controls:

1. Keep on Hotel, or Save as Approved/unassigned, or change kits.
2. Change per-photo role to **Headshot** if desired (recommended for placement label).

Primary agent will not guess that intent.

---

## Isolated test asset evidence

| Step | Result |
|---|---|
| Upload `test-asset-assignment-2026-09-03.jpg` as headshot | `7f259542-…` pending |
| Approve only | `Approved/unassigned`, **0** assignments |
| Role → lifestyle → (UI) headshot | Persisted |
| Save unassigned | Still 0 assignments |
| Assign destination → web+PDF v2 | Featured image + PDF DCTDecode |
| Unassign → destination v3 | Latest clean; historical v2 retained |
| Cancel after checking Hotel in draft | **No** hotel mutation |
| Kellie real asset after tests | Still Hotel only |

Same-version TEST evidence: destination **v2** web + PDF both reference `7f259542-…`.

---

## Files changed

- `dashboard/app/creator-assets/creator-assets-panel.tsx`
- `services/api/src/routes/creator-assets.ts`
- `services/api/src/routes/public-media-kit.ts`
- `services/core/src/creator-assets/assets.ts`
- `services/core/src/creator-assets/creator-assets.test.ts`
- `services/core/src/media-kit/{build,render,pdf,versions,media-kit-version.test}.ts`

---

## Tests

| Suite | Pass | Fail |
|---|---|---|
| Focused core (creator-assets, media-kit, partnership-contracts, benson-navigation, creator-asset-intake) | **84** | **0** |
| Dashboard | **42** | **0** |
| PDF JPEG embed regression | included above | 0 |
| Approve≠assign structural guard | included above | 0 |
| `pnpm benson:deploy-local` Tier A | green | 0 |

No live email, pitch approval of Kellie’s items, contact-form submit, or Telegram in this pass.

---

## Build / deploy / fingerprint

| Step | Result |
|---|---|
| `pnpm benson:deploy-local` | ✅ |
| Fingerprint | **MATCH** `f585404a444136cb` |
| apiStartedAt | `2026-09-03T23:12:50.789Z` |
| dashboardBuiltAt | `2026-09-03T23:12:58Z` |

Public checks: `/creator-assets` 200; `/media-kit/kellie-hotel?v=6` 200; Hotel PDF v6 ~100264 bytes with `/Filter /DCTDecode` (was ~2628 text-only).

---

## Screenshot / artifact paths

```
docs/ops/screenshots/asset-repair-2026-09-03-creator-assets-{mobile,desktop}.png
docs/ops/screenshots/asset-repair-2026-09-03-assign-draft-open-mobile.png
docs/ops/screenshots/asset-repair-2026-09-03-role-changed-mobile.png
docs/ops/screenshots/asset-repair-2026-09-03-after-save-unassigned-mobile.png
docs/ops/screenshots/asset-repair-2026-09-03-hotel-web-v6-{mobile,desktop}.png
docs/ops/screenshots/asset-repair-2026-09-03-destination-web-v2-test-photo-mobile.png
docs/ops/screenshots/asset-repair-2026-09-03-hotel-v6.pdf
docs/ops/screenshots/asset-repair-2026-09-03-test-destination-v2.pdf
docs/ops/screenshots/test-asset-assignment-2026-09-03.jpg
docs/ops/screenshots/asset-repair-2026-09-03-browser-log.json
```

Browser log: **0** console errors; **0** failed API requests during UI pass.

---

## Commit / push / remote agreement

| Item | Value |
|---|---|
| Commit (repair) | `817824bb9be4c54cf723659f86f94c8b5ec5fbcb` |
| Pre-review HEAD (implementer claim) | `2b17a98218c71b9e0318d20114366458adefc9e4` |
| Push | `origin/release/scout-expansion-2026-07-25` |
| Fingerprint at review start | **MATCH** `f585404a444136cb` |
| HEAD vs origin at review start | Agree (clean tree) |
| Independent review | **PASS** (this section) |
| Telegram of this report | See Independent review closeout |

---

## Independent review

**Reviewer:** independent adversarial pass (did not implement the repair)  
**When:** 2026-09-03 ~23:20–23:31 UTC  
**Public:** https://benson.kckellie.com  
**Method:** Playwright against live UI + API; PDF rendered with `pdftoppm` and visually inspected via Read on page PNGs  
**Isolated mutation asset:** `a2743ce6-36fe-4036-9b28-60c11e32ae1d` (`asset-repair-review-2026-09-03-fixture.jpg`) — left **Approved/unassigned** after cleanup  
**Pending probe:** `0dfb372e-…` (`…-pending.jpg`) — rejected after deny-assign check  

### Preconditions

| Check | Result |
|---|---|
| `git status` | Clean at review start |
| HEAD | `2b17a98` (matches implementer claim) |
| HEAD vs origin | Agree |
| `pnpm benson:deployment-status` | **MATCH** `f585404a444136cb` |

### Acceptance matrix

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Approve without assignment → still unassigned after reload | **PASS** | Draft opened after Approve; Cancel; reload showed `Approved but unassigned`, 0 assignment rows |
| 2 | Role editor after approval (Other ↔ Headshot) persists | **PASS** | PATCH other → reload → headshot → reload |
| 3 | Assignment opens + Saves after navigate away/return | **PASS** | Open draft → `/media-kits` → back → Save unassigned |
| 4 | Unassigned can later become assigned (Hotel) | **PASS** | Saved Hotel; assignment row + kit rebuild |
| 5 | Change/remove targets; Cancel without Save mutates nothing | **PASS** | Cancel with Hotel checked left 0 rows; later Hotel→Destination→unassigned |
| 6 | Failure shows + controls recover | **PASS** (API) / **UNTESTED** (UI rebuild fail) | Invalid `targets` → HTTP 400; Assign control still enabled. Did not safely force kit generation failure in UI |
| 7 | Rapid clicks → no duplicate assignments/versions | **PASS** | Still 1 Hotel row; version bump ≤1 under rapid Save |
| 8 | Named kit/version links open correct document | **PASS** | Links to `kellie-hotel?v=N` / PDF `?v=N` matched settled version |
| 9 | Assigned photo visible in web for same version | **PASS** | Hotel web showed fixture + Kellie asset URLs; full-page screenshot |
| 10 | PDF embeds JPEG; visual inspect page images | **PASS** | `/DCTDecode` + JPEG markers; `pdftoppm` page PNGs show photos (not text-only) |
| 11 | Pitch-pinned historical unchanged (read-only) | **PASS** | Hotel `pinnedByPitchCount=0`; immutable v2/v3 checked — no review asset; v2 PDF still ~2628 text-era bytes |
| 12 | Pending/unapproved cannot publish via this workflow | **PASS** | No Assign UI; API 400 “Only photos Kellie has approved…” |
| 13 | Email approvals Crossroads-only / form packets form-only | **PASS** | Pitches: Crossroads email draft only. Form packets: Loews contact-form queue, “No Approve & send”, Open form / I submitted |

### Kellie asset `b5831e43` / `37436.jpg` (read-only)

| Field | Observed |
|---|---|
| Role | `other` (unchanged) |
| State | `approved_public_use` |
| Assignments | **1 row** → Hotel only; `assigned_at` still `2026-09-03T22:58:34.328Z` |
| Reviewer mutations | **None** (never unassigned/reassigned/deleted/re-uploaded) |
| Web | Hotel current version shows pink-blazer photo labeled `other` (full scroll screenshots) |
| PDF | v6 repair PDF and current Hotel PDF both embed JPEG; page images show the same portrait |

**Note:** Isolated Hotel assign/unassign during review rebuilt Hotel **v6 → v9**. Kellie’s assignment row was preserved; latest Hotel web+PDF still show her photo and no review fixture after cleanup.

### Soft observations (not acceptance failures)

1. **Version metadata race:** Immediately after Save, assignment payload briefly showed `versionNumber`/`versionId` for the prior version while UI links already pointed at the new version; after reload both agree. Links themselves were correct.
2. **Busy UI after long dual-kit rebuild:** One Playwright click on “Assign to kits” timed out after Hotel→Destination Save (likely still settling). API path remained healthy; reloading recovered. Related to the original “locked” pain but scoped to assign action.
3. Library still contains prior implementer test asset `7f259542-…` (Approved/unassigned) and rejected review pending probe — clearly named, not published.

### Screenshot / artifact paths (reviewer)

```
docs/ops/screenshots/asset-repair-review-2026-09-03-creator-assets-initial.png
docs/ops/screenshots/asset-repair-review-2026-09-03-1-after-approve-reload-unassigned.png
docs/ops/screenshots/asset-repair-review-2026-09-03-2-role-{other,headshot}.png
docs/ops/screenshots/asset-repair-review-2026-09-03-3-assign-open.png
docs/ops/screenshots/asset-repair-review-2026-09-03-4-assigned-hotel.png
docs/ops/screenshots/asset-repair-review-2026-09-03-5-{draft-hotel-checked,retarget-destination,unassigned}.png
docs/ops/screenshots/asset-repair-review-2026-09-03-7-after-rapid.png
docs/ops/screenshots/asset-repair-review-2026-09-03-8-web-kit-v-settled.png
docs/ops/screenshots/asset-repair-review-2026-09-03-9-hotel-web-with-test-full.png
docs/ops/screenshots/asset-repair-review-2026-09-03-hotel-v7-with-test.pdf
docs/ops/screenshots/asset-repair-review-2026-09-03-hotel-v7-with-test-page-1.png
docs/ops/screenshots/asset-repair-review-2026-09-03-kellie-hotel-web-current-{top,bottom}.png
docs/ops/screenshots/asset-repair-review-2026-09-03-kellie-hotel-v6-repair.pdf
docs/ops/screenshots/asset-repair-review-2026-09-03-kellie-hotel-v6-repair-page-1.png
docs/ops/screenshots/asset-repair-review-2026-09-03-kellie-hotel-v9.pdf
docs/ops/screenshots/asset-repair-review-2026-09-03-kellie-hotel-v9-page-1.png
docs/ops/screenshots/asset-repair-review-2026-09-03-11-hotel-v2.png
docs/ops/screenshots/asset-repair-review-2026-09-03-13-email-approvals-cleared.png
docs/ops/screenshots/asset-repair-review-2026-09-03-13-form-packets-cleared.png
docs/ops/screenshots/asset-repair-review-2026-09-03-final-creator-assets.png
docs/ops/screenshots/asset-repair-review-2026-09-03-fixture.jpg
```

### Verdict

**ACCEPTANCE PASS.** Approve≠assign, draft+Save, role persistence, assignment lifecycle, PDF JPEG embed (visual), Kellie Hotel photo present, email/form separation preserved. No large defects requiring primary rework. Soft notes above are optional polish.

### Closeout

| Item | Value |
|---|---|
| Docs commit | `c2d2be59355a3a0ee98566e989d9493af2e783fc` (+ follow-up for Telegram receipt) |
| Fingerprint at close | **MATCH** `f585404a444136cb` |
| Telegram | **Sent** as DOCUMENT |

### Telegram delivery

**Sent:** yes (operator path, `sendDocument`, not Urgent / not partnership outreach)  
**HTTP:** 200  
**Result:** `{ "ok": true, "result": { "message_id": 331, "document": { "file_name": "BENSON_ASSET_ASSIGNMENT_AND_PHOTO_PDF_REPAIR_2026-09-03.md", "file_size": 16104 } } }`  
**Caption:** Independent PASS · fingerprint `f585404a444136cb` · HEAD `c2d2be5`

---

## Outreach confirmation

**No partnership outreach during review:** no real email send, no pitch approval of Kellie’s items, no contact-form submit.  
**Authorized Telegram:** this report markdown delivered as a DOCUMENT (`message_id` 331).
