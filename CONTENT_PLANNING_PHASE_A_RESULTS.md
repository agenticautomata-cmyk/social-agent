# Content Planning Phase A — Results

**Date:** 2026-05-31  
**Status:** Complete  
**Scope:** Shortlist, planning boards, weekly plan, status tracking — no new sources, no analytics changes

---

## Summary

Content Planning Phase A turns Benson's editor recommendations into a real planning workflow. Opportunities from `/editor` and `/review/inventory` can be saved, scheduled, tracked by status, and organized on planning boards with a Monday–Sunday weekly view.

---

## What Was Built

### Routes (dashboard)

| Route | Purpose |
|---|---|
| `/planner` | Hub — dashboard counts, board grid, recent shortlist |
| `/planner/shortlist` | Full shortlist with board filters |
| `/planner/week` | Weekly planner — Mon–Sun columns |

Nav adds **planner** between **today** and **opportunities**.

### Shortlist fields

Stored in `planner_items` (keyed by `content_item_id`):

| Field | Column |
|---|---|
| opportunity_id | `content_item_id` |
| list name | `list_name` |
| notes | `notes` |
| priority | `priority` (1–3, default 2) |
| planned date | `planned_date` |
| content angle | `content_angle` |
| status | `status` |

**Statuses:** `saved`, `considering`, `planned`, `covered`, `skipped`

### Default planning boards

Today · This Week · Weekend · Sponsors · Date Night · Shopping · World Cup · Saved For Later

Items land on a board via quick actions (`list_name`) or manual update.

### Quick actions (editor + inventory detail)

| Action | API | Effect |
|---|---|---|
| **Save** | `{ action: "save" }` | status `saved`, board Saved For Later |
| **Plan today** | `{ action: "plan_today" }` | status `planned`, board Today, `planned_date` = today |
| **Plan this weekend** | `{ action: "plan_weekend" }` | status `planned`, board Weekend, `planned_date` = next Saturday |
| **Mark covered** | `{ action: "mark_covered" }` | status `covered` |
| **Skip** | `{ action: "skip" }` | status `skipped` |
| **Add note** | `{ notes, followUpAt }` | Updates notes + optional follow-up |

Shared component: `dashboard/components/planner-quick-actions.tsx`

### Weekly planner

- Seven columns (Mon–Sun) for the current week
- Items with `planned_date` appear in the matching day column
- Unscheduled planned/considering items shown below
- No drag/drop (Phase B)

### Dashboard counts (`/planner` + editor header)

| Count | Definition |
|---|---|
| saved | status `saved` or `considering` |
| planned this week | status `planned` with `planned_date` in current Mon–Sun window |
| covered | status `covered` |
| skipped | status `skipped` |

---

## Database

**Migration:** `db/migrations/26_content_planning.sql`  
**Script:** `pnpm migrate:content-planning`

**Table:** `planner_items`

**Enum:** `planner_item_status`

Existing `editor_opportunity_tracking` rows are migrated into `planner_items` on first migration run. Editor tracking API (`PUT /api/editor/tracking/:id`) delegates to the planner module for backward compatibility.

---

## API

**Base:** `/api/content-planner` (registered when `ENABLE_OPPORTUNITIES_API=true`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Hub — counts, boards, recent items |
| GET | `/items` | Shortlist (`?board=`, `?status=`) |
| GET | `/items/:contentItemId` | Single item + tracking snapshot |
| GET | `/week` | Weekly plan columns |
| PUT | `/items/:contentItemId` | Upsert / quick action |

**Core module:** `services/core/src/content-planner/`

---

## Files Added / Changed

### New

- `db/migrations/26_content_planning.sql`
- `services/core/src/content-planner/` (constants, dates, items, hub, week, index)
- `services/core/src/scripts/migrate-content-planning.ts`
- `services/api/src/routes/content-planner.ts`
- `dashboard/app/planner/` (page, hub, shortlist, week panels)
- `dashboard/lib/planner-types.ts`
- `dashboard/components/planner-quick-actions.tsx`

### Updated

- `services/core/src/schema.ts` — `planner_items` table + enum
- `services/core/src/editor/tracking.ts` — delegates to planner
- `services/core/src/editor/home.ts` — planner counts, exclude covered/skipped
- `services/api/src/server.ts` — register `/api/content-planner`
- `dashboard/app/editor/command-center-panel.tsx` — expanded quick actions + counts
- `dashboard/app/review/inventory/inventory-review-panel.tsx` — planner actions in drawer
- `dashboard/lib/opportunities-ui.ts` — nav link
- `dashboard/lib/command-center-types.ts` — extended counts type

---

## Verification

| Check | Result |
|---|---|
| `/editor` loads | ✅ HTTP 200 |
| `/review/inventory` loads | ✅ HTTP 200 |
| `/planner` loads | ✅ HTTP 200 |
| Save action | ✅ `PUT /api/content-planner/items/:id` `{ action: "save" }` → status `saved` |
| Status update | ✅ `{ action: "plan_today" }` → status `planned`, board Today |
| TypeScript | ✅ `pnpm typecheck` passes all packages |

### Sample verification commands

```bash
pnpm migrate:content-planning

# Save first inventory item
ITEM=$(curl -s 'http://localhost:4000/api/inventory?limit=1' | python3 -c "import sys,json; print(json.load(sys.stdin)['items'][0]['id'])")
curl -X PUT "http://localhost:4000/api/content-planner/items/$ITEM" \
  -H 'Content-Type: application/json' -d '{"action":"save"}'

# Plan for today
curl -X PUT "http://localhost:4000/api/content-planner/items/$ITEM" \
  -H 'Content-Type: application/json' -d '{"action":"plan_today"}'

curl -s http://localhost:4000/api/content-planner | python3 -m json.tool
```

---

## Not in scope (Phase A)

- Drag/drop weekly rescheduling
- New opportunity sources
- Analytics integration
- Sponsor outreach
- Board auto-assignment from category (manual + quick actions only)

---

## Next steps (optional Phase B)

- Drag/drop on weekly planner
- Content angle editor on shortlist cards
- Auto-suggest board from category (sponsors, World Cup, etc.)
- Sync `considering` workflow from editor follow-ups
