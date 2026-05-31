# Editor Home Phase A — Results

**Date:** 2026-05-31  
**Status:** Complete  
**Scope:** Daily operating dashboard — no new sources, no analytics changes, no sponsor email

---

## Summary

Editor Home Phase A turns Benson into Kellie's **daily operating dashboard**. Opening the app (`/` or `/editor`) lands on a personalized briefing with eight editorial sections, status tabs, and quick actions — usable within ~30 seconds.

---

## What Was Built

### Default landing page

- `/` redirects to `/editor` when `ENABLE_OPPORTUNITIES_UI=true`
- Nav first item renamed from **overview** to **today** → `/editor`
- Legacy pipeline overview preserved at `legacy-overview.tsx` when Benson UI is off

### Daily briefing — 8 sections

| # | Question | Section ID |
|---|---|---|
| 1 | What should Kellie post today? | `postToday` |
| 2 | What should Kellie post this weekend? | `postWeekend` |
| 3 | Which sponsors should Kellie contact? | `contactBusinesses` |
| 4 | What follow-ups are due? | `followUpsDue` |
| 5 | What new opportunities were discovered today? | `discoveredToday` |
| 6 | Which opportunities are highest confidence? | `highestConfidence` |
| 7 | Which opportunities are trending? | `trending` |
| 8 | Which opportunities target World Cup visitors? | `worldCupVisitors` |

Covered opportunities are **excluded** from briefing sections but visible on the **Covered** tab.

### Card fields

Each opportunity card shows:

- Title
- Source + category
- Confidence, audience fit, sponsor potential
- Why it matters
- Note (when set)
- Quick actions

### Quick actions

| Action | Behavior |
|---|---|
| **Save to shortlist** | `PUT /api/editor/tracking/:id` `{ saved: true }` |
| **Mark covered** | `{ covered: true }` — removes from briefing |
| **Open details** | Links to `/review/inventory?id={contentItemId}` |
| **Add note** | Modal — saves `note` + optional `followUpAt` |

### Status tabs

| Tab | Content |
|---|---|
| **Today** | Full 8-section daily briefing |
| **This Week** | Consolidated week picks (next 7 days) |
| **Saved** | Shortlisted opportunities |
| **Covered** | Marked-as-handled opportunities |

Header KPI strip: new today, follow-ups due, saved count, covered count.

---

## Database

**Migration:** `25_editor_home.sql`

**Table:** `editor_opportunity_tracking`

| Column | Purpose |
|---|---|
| `content_item_id` | FK → `content_items` (unique) |
| `saved` / `saved_at` | Shortlist |
| `covered` / `covered_at` | Handled |
| `note` | Freeform note |
| `follow_up_at` | Due date for follow-ups section |

---

## API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/editor` | Full editor home payload (briefing + tabs + counts) |
| `PUT` | `/api/editor/tracking/:contentItemId` | Update saved/covered/note/followUpAt |

### Response extensions

`GET /api/editor` now includes:

- `counts`: `{ saved, covered, followUpsDue, discoveredToday }`
- `weekItems`, `savedItems`, `coveredItems`
- `tracking` on each card when present
- Sections `followUpsDue`, `discoveredToday`

---

## Core modules

| Path | Role |
|---|---|
| `services/core/src/editor/tracking.ts` | CRUD for opportunity tracking |
| `services/core/src/editor/home.ts` | `computeEditorHome()` — briefing + tabs |
| `services/core/src/inventory/command-center.ts` | Extended sections, week picks, exclude covered |

---

## Dashboard

| File | Change |
|---|---|
| `dashboard/app/editor/command-center-panel.tsx` | Full editor home UI — tabs, actions, note modal |
| `dashboard/lib/command-center-types.ts` | Extended types |
| `dashboard/app/page.tsx` | Redirect to `/editor` |
| `dashboard/app/review/inventory/` | `?id=` deep link support |

---

## Verification

| Check | Result |
|---|---|
| Migration | ✅ `pnpm migrate:editor-home` |
| TypeScript | ✅ `pnpm typecheck` |
| `GET /api/editor` | ✅ 8 sections + counts |
| `PUT /api/editor/tracking/:id` | ✅ Save + follow-up due |
| `/editor` | ✅ HTTP 200 |
| `/` redirect | ✅ HTTP 200 → `/editor` |
| Inventory deep link | ✅ `/review/inventory?id=...` |

### Sample tracking test

```
PUT /api/editor/tracking/{id} { saved: true, note: "...", followUpAt: "..." }
→ counts.saved: 1, counts.followUpsDue: 1
```

---

## Commands

```bash
pnpm migrate:editor-home
pnpm dev:api
pnpm dev:dashboard
# Open http://localhost:3000/ → redirects to /editor
```

---

## Not in scope (by design)

- No new scanner sources
- No analytics module changes
- No sponsor email / outreach sending
- No production scoring changes from editorial picks

---

## Files added / modified

**New:**
- `db/migrations/25_editor_home.sql`
- `services/core/src/editor/*`
- `services/core/src/scripts/migrate-editor-home.ts`
- `dashboard/app/legacy-overview.tsx`

**Modified:**
- `services/core/src/schema.ts`
- `services/core/src/inventory/command-center.ts`
- `services/core/src/inventory/index.ts`
- `services/api/src/routes/editor.ts`
- `dashboard/app/editor/command-center-panel.tsx`
- `dashboard/lib/command-center-types.ts`
- `dashboard/lib/opportunities-ui.ts`
- `dashboard/app/page.tsx`
- `dashboard/app/review/inventory/*`

---

*Phase A complete. Kellie's default Benson experience is now the daily briefing.*
