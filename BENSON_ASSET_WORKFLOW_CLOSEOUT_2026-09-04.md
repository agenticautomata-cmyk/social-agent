# Benson Asset Workflow Closeout — 2026-09-04

**Branch:** `release/scout-expansion-2026-07-25`  
**Public:** https://benson.kckellie.com → `:3000`  
**API:** https://api.kckellie.com / local `:4000`  
**Prior repair:** `BENSON_ASSET_ASSIGNMENT_AND_PHOTO_PDF_REPAIR_2026-09-03.md` (independent PASS)

---

## Independent review status

**PENDING** — independent reviewer has not started. Do not treat this report as acceptance.

---

## Plain-language summary

Resumed after the ~03:12 mappy reboot with ~500 lines of uncommitted closeout WIP still on disk. Finished the assign lockup polish (Hotel→Destination dual-kit rebuilds, soft/hard timeout + poll reconcile, no reload-as-recovery), version label/link consistency after Save, fixture cleanup verification, and a public-route bugfix so revoked fixture versions truly 404 instead of silently serving latest. Deployed to fingerprint **MATCH**. Kellie’s real photo (`37436.jpg` / `b5831e43`) was never reassigned, role-changed, or archived.

---

## Crash resume inventory

| Item | Status at resume (~03:36) | After this closeout |
|---|---|---|
| Committed HEAD | `45e627f` = origin | New commit(s) on branch + origin |
| Uncommitted WIP | ~500 lines on disk | Committed + pushed |
| Closeout report | Missing | This file |
| Fixture cleanup | Completed ~03:07 (manifest present) | Verified read-only; **not** re-run |
| Deploy | DRIFT (runtime = pre-WIP) | **MATCH** `77ed3ea3ce0384a7` |
| Telegram | Not sent | Still not sent (reviewer owns PASS Telegram) |

### What survived the crash (preserved and finished)

- Dashboard assign UX: soft/hard timeout, poll, long-running assign URL, phase labels
- `dashboard/lib/creator-assets-assign.ts` (+ tests)
- Parallel kit rebuilds + `reconcileAssignmentsWithRebuilds`
- `pending_build` / `generation_failed` assignment status
- Archive-hidden library listing
- Public-access revoke helpers + cleanup script
- Cleanup backups under `docs/ops/backups/asset-fixture-cleanup-2026-09-04T03-07-59-220Z`

### Gaps finished after resume

1. Assign busy clobber when approve/role ran on another photo mid-generation
2. Silent `load()` flicker during poll/reconcile
3. Hotel→Destination settle regression test
4. Public `?v=` fallthrough: revoked pins returned latest kit (200) — fixed to **404**
5. Isolated restaurant-only mutation (never Hotel/Destination)
6. Deploy + report + commit/push

---

## Lockup fix (review soft note #2)

| Mechanism | Behavior |
|---|---|
| Parallel rebuilds | Hotel+Destination no longer serial ~25–30s each |
| Soft timeout (8s) | UI moves to “generating” + polls; does **not** claim server failed |
| Hard timeout (120s) | Reconcile from saved server state; release busy; retry only if still wrong |
| Lost response | Reconcile before error; poll if assignment rows exist |
| Long-running URL | Assign POST uses `clientApiLongRunningUrl` |
| Busy scope | Other photos usable; assign hold restored after side actions |
| No reload-as-recovery | Status refresh is silent; page reload not required |

---

## Version label / link consistency (review soft note #1)

- Assignment details prefer immutable `media_kit_versions` row over denormalized kit text
- `generationStatus`: `ready` only when asset is in that version’s snapshot; else `pending_build`
- `reconcileAssignmentsWithRebuilds` overlays just-built `versionNumber` / `versionId` / web+PDF URLs so Save response agrees without a second reload
- UI labels: “Previous web kit / PDF” while `pending_build`

Post-deploy Kellie Hotel assignment (read-only): **v9** · `ready` · web/PDF both `?v=9`.

---

## Fixture cleanup verification (read-only)

**Manifest:** `docs/ops/backups/asset-fixture-cleanup-2026-09-04T03-07-59-220Z/` (`dryRun: false`)  
**Script (committed for audit):** `services/core/src/scripts/cleanup-asset-repair-fixtures-2026-09-04.ts`  
**Re-cleanup:** **not** re-run (already complete).

| Check | Result |
|---|---|
| Fixture assets archived | `7f259542…`, `a2743ce6…`, `0dfb372e…` → `archived` |
| Contaminated versions revoked in DB | hotel v7/v8, destination v2/v4 — notes contain `[public_access_revoked]` |
| Default library | Only Kellie `37436.jpg` |
| Public pins after fix | hotel `?v=7`/`?v=8`, dest `?v=2`/`?v=4` → **404**; hotel v6/v9, dest v5 → **200** |
| PDF revoked pin | hotel PDF `?v=7` → **404** |
| Kellie assignment | Still Hotel only; `assigned_at` `2026-09-03T22:58:34.328Z` unchanged |

---

## Isolated mutation (restaurant only)

| Step | Result |
|---|---|
| Upload + approve fixture | Approve → **0** assignments |
| Save unassigned | Cleared |
| Assign **restaurant** only | Ready **v2**; web/PDF `?v=2` match (~6s) |
| Hotel / Destination versions | **Unchanged** (v9 / v5) |
| Kellie role/state/assignment | **Unchanged** |
| Unassign + archive fixture | `23c2fc6e-…` archived; library clean |
| Revoke restaurant v2 | Public `?v=2` → 404; current restaurant **v3** clean |

**Never** assigned fixtures to Kellie’s live Hotel or Destination during this closeout.

---

## Tests

| Suite | Pass | Fail |
|---|---|---|
| Dashboard (`pnpm --filter dashboard test`) | **47** | **0** |
| Core focused (`creator-assets.test.ts`, `media-kit-version.test.ts`) | **17+** | **0** |
| Deploy Tier A stabilization | **246** | **0** |
| Dashboard typecheck | clean | 0 |
| WIP core/api paths typecheck | no new errors in touched files | — |

---

## Build / deploy / fingerprint

| Step | Result |
|---|---|
| `pnpm benson:deploy-local` | ✅ |
| Fingerprint | **MATCH** `77ed3ea3ce0384a7` |
| apiStartedAt | `2026-09-04T03:49:30.720Z` |
| dashboardBuiltAt | `2026-09-04T03:49:38Z` |

Public checks: `/creator-assets` 200; hotel current/v9 200; revoked contaminated pins 404.

---

## Kellie asset `b5831e43` / `37436.jpg` (untouched)

| Field | Value |
|---|---|
| Role | `other` (unchanged) |
| State | `approved_public_use` |
| Assignments | **1 row** → Hotel only |
| `assigned_at` | `2026-09-03T22:58:34.328Z` (unchanged since original assign) |
| Closeout mutations | **None** on this asset |

Elliott still decides whether to keep Hotel, change kits, or set role to Headshot.

---

## Files changed

- `dashboard/app/creator-assets/creator-assets-panel.tsx`
- `dashboard/lib/creator-assets-assign.ts` (+ test)
- `dashboard/package.json`
- `services/api/src/routes/creator-assets.ts`
- `services/api/src/routes/public-media-kit.ts`
- `services/core/src/creator-assets/assets.ts` (+ test)
- `services/core/src/media-kit/versions.ts` (+ test)
- `services/core/src/scripts/cleanup-asset-repair-fixtures-2026-09-04.ts`
- `BENSON_ASSET_WORKFLOW_CLOSEOUT_2026-09-04.md` (this file)

---

## Commit / push / remote agreement

| Item | Value |
|---|---|
| Commit (closeout) | `f16fc2b98145f5725a66b566595132b6c255c8c3` |
| Push | `origin/release/scout-expansion-2026-07-25` |
| Fingerprint | **MATCH** `77ed3ea3ce0384a7` |
| HEAD vs origin after push | Agree (clean tree) |
| Independent review | **PENDING** |
| Telegram of this report | **Not sent** (reviewer after PASS) |

---

## Outreach confirmation

**No partnership outreach:** no real email send, no pitch approval of Kellie’s items, no contact-form submit, no Telegram from implementer.
