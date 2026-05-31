# Phase 1 Step 3 Results — ENABLE_OPPORTUNITIES_UI

**Date:** 2026-05-31  
**Step:** [TRANSFORMATION_PHASE_1.md](./TRANSFORMATION_PHASE_1.md) Step 3 (Opportunities UI)  
**Flag implemented:** `ENABLE_OPPORTUNITIES_UI` only  
**Status:** **PASSED**

---

## Summary

Phase 1 Step 3 adds the **Benson-facing Opportunities experience** behind `ENABLE_OPPORTUNITIES_UI`. When `false` (default), navigation and routes are unchanged. When `true`, the dashboard exposes `/opportunities`, maps existing `/api/content` rows into opportunity views, hides campaign UI, and redirects legacy queue/campaign routes.

**No changes** to API routes, database schema, workers, queue/state machine behavior, or approval actions.

---

## Data Mapping (UI only)

Existing `content_items` API rows are mapped in the dashboard — no new endpoints:

| API field (`/api/content`) | Opportunity view (UI) |
|---|---|
| `topic` | title |
| `hook` | angle (subtitle line) |
| `industryName` (join) | category |
| `state` | state pill (Benson labels when flag on) |
| `type`, `language`, `updatedAt` | unchanged display |

---

## Flag Behavior

### `ENABLE_OPPORTUNITIES_UI=false` (default)

| Check | Result |
|---|---|
| Nav | `[overview]`, `[campaigns]`, `[queue]`, `[approvals]`, `[runs]` |
| `/opportunities` | HTTP **404** (page not registered) |
| `/queue` | HTTP **200** (unchanged) |
| `/campaigns`, `/campaigns/:id` | HTTP **200** (unchanged) |
| Overview campaigns table | Visible |
| API `/health` | `{"ok":true}` |
| API `/api/content` | Unchanged JSON shape (`topic`, `hook`, …) |
| Workers | Running (unchanged) |

### `ENABLE_OPPORTUNITIES_UI=true`

| Check | Result |
|---|---|
| Nav | `[overview]`, `[opportunities]`, `[approvals]`, `[runs]` — **no campaigns or queue** |
| `/opportunities` | HTTP **200** — opportunity table with title/category columns |
| `/queue` | **307 → `/opportunities`** (query params preserved, e.g. `?state=script_drafted`) |
| `/campaigns`, `/campaigns/:id` | **307 → `/`** |
| Overview | Campaigns section **hidden**; link **view opportunities →** on state distribution |
| State pills / filters | Benson labels (`discovered`, `pending_review`, …) via terminology helpers |
| API | Unchanged — still fetches `/api/content` |
| Approvals flow | Unchanged (`/approvals` still works) |

**Test command:**

```bash
ENABLE_OPPORTUNITIES_UI=true npx pnpm@10.30.3 dev:dashboard
```

Restart dashboard after changing the flag (reads env at process start).

---

## Files Changed

| File | Change |
|---|---|
| `dashboard/lib/opportunities-ui.ts` | **New** — flag export, nav builder, content→opportunity mapper, page copy |
| `dashboard/app/opportunities/page.tsx` | **New** — opportunities list (mirrors queue; uses `/api/content`) |
| `dashboard/app/layout.tsx` | Nav from `getNavItems()` |
| `dashboard/app/queue/page.tsx` | Redirect to `/opportunities` when flag on |
| `dashboard/app/campaigns/page.tsx` | Redirect to `/` when flag on |
| `dashboard/app/campaigns/[id]/page.tsx` | Redirect to `/` when flag on |
| `dashboard/app/page.tsx` | Hide campaigns section; overview link to opportunities |
| `dashboard/lib/terminology.ts` | `displayState` / `displayFilterLabel` also use Benson labels when UI flag on |

**Not changed:** `services/core/src/feature-flags.ts` (flag already defined Step 1), API, workers, DB, approval handlers, queue state machine.

---

## Verification Results

### Typecheck

```bash
npx pnpm@10.30.3 typecheck
```

**Result:** PASS — all packages (core, api, workers, dashboard)

### Runtime checks (2026-05-31)

| Check | Flag OFF | Flag ON |
|---|---|---|
| Typecheck | PASS | PASS |
| API `/health` | PASS | PASS |
| API `/api/content` | JSON with `topic`, `hook` | Same |
| API `/api/campaigns` | Unchanged | Unchanged |
| Nav campaigns/queue | Present | Absent |
| Nav opportunities | Absent | Present |
| `/opportunities` | 404 | 200 |
| `/queue` redirect | — | → `/opportunities` |
| `/campaigns` redirect | — | → `/` |
| Overview campaigns table | Shown | Hidden |

---

## Flag Interaction

| Combination | Effect |
|---|---|
| UI only (`ENABLE_OPPORTUNITIES_UI=true`) | Opportunities nav + page; Benson state/filter labels; campaigns hidden |
| UI + terminology | Terminology copy on approvals/sources labels; opportunities page uses dedicated copy |
| UI + branding | Benson header + opportunities experience (recommended Benson preset) |
| UI without API flag | **Expected** — uses legacy `/api/content`; `ENABLE_OPPORTUNITIES_API` is a future step |

---

## Rollback

Set in `.env`:

```bash
ENABLE_OPPORTUNITIES_UI=false
```

Restart dashboard. Legacy `/queue` and `/campaigns` routes work immediately. No code revert required.

---

## Known Notes

1. **`/opportunities` returns 404 when flag off** — intentional; route exists but is gated via `notFound()`.
2. **Campaign data still in DB/API** — only hidden from UI when flag on; workers and planner unchanged.
3. **No row-level detail page** — opportunities list is read-only table (same scope as queue page); detail views are a future step.
4. **Terminology overlap** — when UI flag is on, state pills use Benson labels even on overview/approvals without `ENABLE_BENSON_TERMINOLOGY`.

---

## Next Step (awaiting approval)

Per [TRANSFORMATION_PHASE_1.md](./TRANSFORMATION_PHASE_1.md): **`ENABLE_OPPORTUNITIES_API`** — parallel `/api/opportunities` routes and DTO mapping (Step 4).

Do not proceed until Step 3 is approved.

---

*End of Phase 1 Step 3 results.*
