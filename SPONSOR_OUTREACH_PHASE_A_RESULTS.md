# Sponsor Outreach Phase A — Results

**Date:** 2026-05-31  
**Status:** Complete  
**Scope:** Sponsor CRM, media kit library, compose/preview, demo simulated sends — no real email, no providers, no new sources

---

## Summary

Sponsor Outreach Phase A turns Benson's sponsor-friendly opportunities into a basic sponsor CRM and media kit workflow. Kellie can create leads from opportunities, manage contacts, compose templated outreach, preview before scheduling, approve, and simulate sends in demo mode — with a full send attempt audit log.

---

## What Was Built

### Routes (dashboard)

| Route | Purpose |
|---|---|
| `/sponsors` | Sponsor CRM list |
| `/sponsors/[id]` | Contact detail + edit |
| `/media-kits` | Media kit library (manual URL) |
| `/outreach/compose` | Draft email composer |
| `/outreach/scheduled` | Draft / approval / scheduled queue |
| `/outreach/history` | Simulated sends + cancellations |

Nav adds **sponsors** after **planner**.

### Database

**Migration:** `db/migrations/27_sponsor_outreach.sql`  
**Script:** `pnpm migrate:sponsor-outreach`

| Table | Purpose |
|---|---|
| `sponsor_contacts` | CRM records linked to opportunities |
| `media_kits` | Kit metadata + manual `file_url` |
| `email_templates` | 7 seeded templates with merge fields |
| `outreach_emails` | Draft → approval → scheduled → simulated send |
| `outreach_send_attempts` | Immutable demo send log |

### Sponsor contact statuses

`lead` · `ready_to_contact` · `scheduled` · `sent` · `replied` · `follow_up_needed` · `not_interested` · `converted`

### Outreach email statuses

`draft` · `needs_approval` · `scheduled` · `simulated_sent` · `failed` · `canceled`

### Seeded email templates

| Type | Name |
|---|---|
| `introduction` | Introduction |
| `media_kit_send` | Media Kit Send |
| `follow_up` | Follow Up |
| `world_cup` | World Cup Pitch |
| `luxury_date_night` | Luxury / Date Night Pitch |
| `restaurant_opening` | Restaurant Opening Pitch |
| `shopping_retail` | Shopping / Retail Pitch |

### Merge fields

`{{business_name}}`, `{{contact_name}}`, `{{category}}`, `{{kellie_name}}`, `{{benson_recommendation}}`, plus `{{media_kit_name}}`, `{{media_kit_url}}`, `{{event_name}}`, `{{event_date}}`, `{{location}}`

### Quick action: Create Sponsor Lead

Available on `/editor`, `/planner`, and `/review/inventory` detail drawer.  
Calls `POST /api/sponsors/from-opportunity/:contentItemId` — pre-fills business name, category, website, notes, fit score from inventory metadata. Idempotent per opportunity.

### Outreach workflow

1. **Compose** — select sponsor, optional media kit, template → generate merged subject/body
2. **Preview** — required before scheduling (`previewed_at` set on confirm)
3. **Schedule** — sets `scheduled_send_at`, status `needs_approval` (approval required by default)
4. **Approve** — status → `scheduled`
5. **Simulate Send** — demo mode only; status → `simulated_sent`, creates `outreach_send_attempts` row, updates contact `last_contacted_at` + status `sent`

### Safety rules (enforced)

- No real outbound email
- No Resend / Gmail / SendGrid / SMTP credentials
- `POST /simulate-send` returns 403 when `DEMO_MODE=false`
- No background send worker
- Approval required by default on all outreach emails

---

## API

Registered when `ENABLE_OPPORTUNITIES_API=true`:

| Base | Endpoints |
|---|---|
| `/api/sponsors` | GET list, GET/:id, POST, PUT/:id, POST/from-opportunity/:contentItemId |
| `/api/media-kits` | GET, GET/:id, POST, PUT/:id |
| `/api/outreach` | GET/templates, POST/preview, GET/POST/PUT emails, POST preview/schedule/approve/cancel/simulate-send |

**Core module:** `services/core/src/sponsor-outreach/`

---

## Verification

| Check | Result |
|---|---|
| `/sponsors` loads | ✅ HTTP 200 |
| `/media-kits` loads | ✅ HTTP 200 |
| `/outreach/compose` loads | ✅ HTTP 200 |
| `/outreach/scheduled` loads | ✅ HTTP 200 |
| `/outreach/history` loads | ✅ HTTP 200 |
| `/editor`, `/planner`, `/analytics/tiktok`, `/review/inventory` | ✅ HTTP 200 |
| Create sponsor from opportunity | ✅ |
| Template merge | ✅ Kellie name + business name in preview |
| Simulated send | ✅ status `simulated_sent` |
| Send attempt log | ✅ `outreach_send_attempts` row with provider `demo` |
| Contact updated | ✅ status `sent`, `last_contacted_at` set |
| TypeScript | ✅ `pnpm typecheck` passes |

### Sample verification

```bash
pnpm migrate:sponsor-outreach

ITEM=$(curl -s 'http://localhost:4000/api/inventory?limit=1' | python3 -c "import sys,json; print(json.load(sys.stdin)['items'][0]['id'])")
curl -X POST "http://localhost:4000/api/sponsors/from-opportunity/$ITEM"

# Compose flow: preview → schedule → approve → simulate-send
# See /outreach/compose UI or API docs above
```

---

## Not in scope (Phase A)

- Real email delivery (Phase B)
- File upload / object storage for media kits
- Public media kit links
- Background send worker / cron
- Gmail OAuth send-as
- New opportunity sources

---

## Next steps (Phase B)

- Email provider adapter (`EmailProvider` interface)
- Send worker for approved `scheduled` emails
- Attachment support for media kit PDFs
- Reply tracking and follow-up automation suggestions
