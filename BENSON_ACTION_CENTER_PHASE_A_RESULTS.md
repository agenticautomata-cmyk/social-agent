# Benson Action Center Phase A Results

**Date:** 2026-05-31  
**Scope:** Turn Benson recommendations into one-click actions across planner, outreach, pipeline, and intake — no new sources or analytics.

---

## Summary

Action Center Phase A aggregates work from existing systems into `/actions`, assigns **Critical / Important / Suggested** priorities, surfaces a **notification center** (overdue, due today, due this week), and executes actions through `POST /api/action-center/execute`.

---

## 1. Action Center (`/actions`)

Five sections:

| Section | Source |
|---------|--------|
| **Pending follow ups** | Planner `follow_up_at` / `due_date`, sponsor `next_follow_up_at`, outreach `follow_up_due_at` |
| **Pending sponsor emails** | Outreach queue (draft, needs_approval, scheduled, sending) |
| **Content waiting for approval** | Share intake `needs_review`, outreach `needs_approval` |
| **Upcoming planned content** | Planner planned/considering with dates this week |
| **Sponsor opportunities needing updates** | Open pipeline deals (stale, active stage, or past due) |

API: `GET /api/action-center`

---

## 2. One-click actions

`POST /api/action-center/execute` supports:

| Action | Entities |
|--------|----------|
| **Send email** | Outreach (live Resend or simulated) |
| **Approve email** | Outreach `needs_approval` → approved |
| **Schedule follow up** | Planner, pipeline, outreach, sponsor contact (defaults +3 days if no date) |
| **Assign due date** | Same as above with explicit date |
| **Mark covered** | Planner |
| **Move opportunity stage** | Pipeline |
| **Create planner item** | Planner quick action; pipeline links via sponsor source opportunity |

---

## 3. Due dates

Migration `31_action_center_due_dates.sql`:

- `planner_items.due_date` (DATE)
- `sponsor_opportunities.due_date` (TIMESTAMPTZ)
- `outreach_emails.follow_up_due_at` (TIMESTAMPTZ)

Run: `pnpm migrate:action-center`

Planner API accepts `dueDate` on `PUT /api/content-planner/items/:id`. Pipeline create/update accepts `dueDate`.

---

## 4. Notification center

On `/actions`:

- **Overdue** — due before today
- **Due today** — calendar day match
- **Due this week** — within 7 days

`GET /api/action-center/notifications` returns the same buckets.

---

## 5. Benson priorities

| Level | Rules |
|-------|--------|
| **Critical** | Overdue items |
| **Important** | Due today, outreach approval, negotiating/proposal_sent deals |
| **Suggested** | Everything else in the queue |

Grouped in `priorities.critical | .important | .suggested`.

---

## 6. Dashboard — do now

Top banner **things kellie should do now** — up to 8 items from critical + important priorities.

Nav link: **actions** (when opportunities UI enabled).

---

## 7. Verification

| Check | Result |
|-------|--------|
| Core / API / dashboard typecheck | PASS |
| Migration applied | PASS |
| New sources / analytics | None |
| Outreach approval/send logic | Reuses existing `approveOutreachEmail` / `sendOutreachEmail` |

### Smoke

```bash
curl -s http://localhost:4000/api/action-center | jq '.counts, .doNow[0].title'
curl -s http://localhost:4000/api/action-center/notifications | jq '.notifications.overdue | length'
```

---

## Files

**New:** `services/core/src/action-center/*`, `services/api/src/routes/action-center.ts`, `dashboard/app/actions/*`, `dashboard/components/action-center-buttons.tsx`, `dashboard/lib/action-center-types.ts`, `db/migrations/31_action_center_due_dates.sql`

**Updated:** schema, planner items, pipeline opportunities, outreach records, server routes, nav

---

*Phase A complete — recommendations are now actionable in one place.*
