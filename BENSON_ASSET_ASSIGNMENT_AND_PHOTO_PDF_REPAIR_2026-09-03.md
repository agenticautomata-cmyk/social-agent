# Benson Asset Assignment + Photo PDF Repair — 2026-09-03

**Branch:** `release/scout-expansion-2026-07-25`  
**Public:** https://benson.kckellie.com → `:3000`  
**API:** https://api.kckellie.com / local `:4000`

---

## Independent review status

**Awaiting independent review.** This report is written after primary-agent Phase 1–2 + own verification, deploy, and (once pushed) remote agreement. Telegram delivery of this `.md` is **deferred** until the independent reviewer confirms (or the coordinator authorizes closeout).

Reviewer should re-verify acceptance items 1–13 with the isolated test asset and confirm Kellie’s live `37436.jpg` was not deleted, re-uploaded, or newly assigned beyond the pre-existing hotel row.

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
| Commit (report meta) / HEAD | `e59431e37eed49eeb4592283a14ae3911e5eb35d` |
| Push | `origin/release/scout-expansion-2026-07-25` (up to date) |
| Fingerprint | **MATCH** `f585404a444136cb` |
| HEAD vs origin | Agree (pushed) |
| Independent review | **Pending** |
| Telegram of this report | **Not sent** (await reviewer / coordinator) |

---

## Outreach confirmation

**No outreach:** no real email send, no pitch approval of Kellie’s items, no contact-form submit, no Telegram.
