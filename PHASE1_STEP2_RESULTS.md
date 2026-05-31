# Phase 1 Step 2 Results — ENABLE_BENSON_TERMINOLOGY

**Date:** 2026-05-31  
**Step:** [TRANSFORMATION_PHASE_1.md](./TRANSFORMATION_PHASE_1.md) Step 2 (terminology layer)  
**Flag implemented:** `ENABLE_BENSON_TERMINOLOGY` only  
**Status:** **PASSED**

---

## Summary

Phase 1 Step 2 wires **user-facing terminology** across the dashboard to `ENABLE_BENSON_TERMINOLOGY`. When `false` (default), labels match inherited social-agent copy. When `true`, Benson domain language appears in nav, page headers, table columns, state pills, approval cards, and overview sections.

**No changes** to API routes, database schema, workers, queue/state machine behavior, or approval actions.

---

## Terminology Mapping (UI only)

| Legacy (inherited) | Benson (`ENABLE_BENSON_TERMINOLOGY=true`) |
|---|---|
| content / content item | opportunity |
| campaign | source |
| topic (column label) | title |
| hook | angle |
| script | summary |
| industry | category |
| queue (nav + page title) | opportunities |
| campaigns (nav + page title) | sources |
| `planned` state pill | discovered |
| `script_drafted` | pending_review |
| Video-era states | processing (display label) |
| `cancelled` | archived |

API JSON fields remain `topic`, `hook`, `script`, `campaignId`, etc.

---

## Files Changed

| File | Change |
|---|---|
| `dashboard/lib/terminology.ts` | **New** — legacy/Benson copy bundles, state/filter display helpers |
| `dashboard/components/state-pill.tsx` | Uses `displayState()` from terminology module |
| `dashboard/app/layout.tsx` | Nav labels: campaigns/queue → sources/opportunities when flag on |
| `dashboard/app/page.tsx` | Overview sections, tile subs, greeting (when branding off) |
| `dashboard/app/queue/page.tsx` | Page title, subtitle, column headers, filter labels |
| `dashboard/app/approvals/page.tsx` | Page subtitle, empty inbox copy |
| `dashboard/app/approvals/approval-card.tsx` | Field labels via props; Benson attribution line |
| `dashboard/app/campaigns/page.tsx` | Sources page copy |
| `dashboard/app/campaigns/[id]/page.tsx` | Source detail copy, categories section |
| `dashboard/app/runs/page.tsx` | Subtitle, empty state, display state transitions |

**Not changed:** `services/core/src/feature-flags.ts` (flag already defined Step 1), API, workers, DB, routes (`/campaigns`, `/queue` URLs unchanged).

---

## Flag Interaction

| Flag | Step 2 interaction |
|---|---|
| `ENABLE_BENSON_TERMINOLOGY=false` | Full legacy UI labels |
| `ENABLE_BENSON_TERMINOLOGY=true` | Benson terminology throughout dashboard |
| `ENABLE_BENSON_BRANDING=true` | Branding greeting/subline take precedence on overview; terminology still applies to nav, tables, states, approvals |
| Both flags `true` | Benson header + Benson terminology (recommended preset) |

---

## Verification Results

### Typecheck

```bash
npx pnpm@10.30.3 typecheck
```

**Result:** PASS — all packages

### `ENABLE_BENSON_TERMINOLOGY=false` (default)

| Check | Result |
|---|---|
| Nav | `[campaigns]`, `[queue]` |
| `/queue` title | `queue` |
| Queue column | `topic`, `industry` |
| `/approvals` field labels | `hook`, `script` |
| State pills | `awaiting_approval` (legacy) |
| API `/health` | `{"ok":true}` |
| API `/api/campaigns` | Unchanged JSON shape |
| Workers | 11 workers (unchanged) |
| All dashboard routes | HTTP 200 |

### `ENABLE_BENSON_TERMINOLOGY=true`

| Check | Result |
|---|---|
| Nav | `[sources]`, `[opportunities]` |
| `/queue` title | `opportunities` |
| Queue columns | `title`, `category` |
| `/campaigns` title | `sources` |
| `/approvals` field labels | `angle`, `summary` |
| Approvals attribution | `Benson drafted this summary` |
| State pills | `pending_review`, `discovered` |
| Routes unchanged | `/queue`, `/campaigns` still work (HTTP 200) |
| API | Unchanged |

**Test command:**

```bash
ENABLE_BENSON_TERMINOLOGY=true npx pnpm@10.30.3 dev:dashboard
```

---

## Rollback

Set in `.env`:

```bash
ENABLE_BENSON_TERMINOLOGY=false
```

Restart dashboard. No code revert required.

---

## Known Notes

1. **Routes unchanged** — nav says "opportunities" but href remains `/queue`; "sources" href remains `/campaigns` until `ENABLE_OPPORTUNITIES_UI` (Step 6).
2. **Data values unchanged** — campaign names (e.g. "Demo Brand"), topic text, and API field names display as stored; only **labels** and **state display names** change.
3. **Client components** — `ApprovalCard` receives labels via props from server page (no `NEXT_PUBLIC_` mirror needed).
4. **Worker names in `/runs`** — still show `script-writer`, `planner` until `ENABLE_WORKER_LABEL_ALIASES` (nice-to-have flag).

---

## Next Step (awaiting approval)

**Step 3** per [TRANSFORMATION_PHASE_1.md](./TRANSFORMATION_PHASE_1.md): `ENABLE_OPPORTUNITIES_API` — parallel `/api/opportunities` routes and DTO mapping.

Do not proceed until Step 2 is approved.

---

*End of Phase 1 Step 2 results.*
