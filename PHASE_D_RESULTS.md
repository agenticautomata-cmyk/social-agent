# Phase D: Business Intelligence Layer — Results

**Date:** 2026-05-31  
**Constraints honored:** No UI redesign, no new public data sources, no scoring tuning.

## Summary

Phase D connects Benson to Kellie's real business operations: sponsor CRM, promote-to-CRM from intelligence, outreach queue (drafts only), analytics connector registry, and home dashboard business metrics.

## 1. Sponsor CRM

**Already in place (extended):**

| Field | Storage | UI |
|-------|---------|-----|
| Company | `sponsor_contacts.business_name` | List + detail edit |
| Contact name | `contact_name` | List + detail edit |
| Email / phone | `email`, `phone` | Detail edit |
| Status | `status` enum | List + detail select |
| Notes | `notes` | Detail textarea |
| Last contact date | `last_contacted_at` | List + detail date input |

**Added:**

- `CreateSponsorForm` on `/sponsors` — manual `POST /api/sponsors` without going through inventory.
- `PUT /api/sponsors/:id` accepts `lastContactedAt` for manual CRM updates.

## 2. Sponsor opportunities (promote to CRM)

**Unchanged flow (verified):**

- `POST /api/sponsors/from-opportunity/:contentItemId` creates a contact with `source_opportunity_id` set to the ingested item.
- `CreateSponsorLeadButton` on editor / inventory / sponsor intel.
- Sponsor detail links back to source inventory item.

## 3. Outreach queue

**Unchanged (queue-only):**

- Drafts via `POST /api/outreach/emails` with status `draft`.
- Queue view: `GET /api/outreach/emails?view=queue` (draft, needs_approval, scheduled, sending).
- Demo mode blocks live send; simulate only.

## 4. Analytics connectors framework

**New:**

- Migration `34_analytics_connectors.sql` — table `analytics_connectors` with `provider`, `connected`, `account_id`, `last_sync_at`, `updated_at`.
- Seeded providers: TikTok, Facebook, Instagram, YouTube.
- Module `@social-agent/core/analytics-connectors` — ensures rows, syncs TikTok/Instagram/YouTube from `creator_platform_connections` (no credentials stored in connector table).
- `GET /api/analytics/connectors` — public connection state only.
- Analytics hub shows a **platform connections** list (no redesign of existing cards).

**Run migration:**

```bash
source .env
cd services/core && pnpm migrate:analytics-connectors
```

## 5. Dashboard (home business metrics)

**Extended `GET /api/pre-alpha/home` metrics:**

| Metric | Source |
|--------|--------|
| `sponsorLeads` | Count of `sponsor_contacts` |
| `activeDeals` | Open pipeline deals (`OPEN_PIPELINE_STATUSES`) |
| `pendingOutreach` | Outreach emails in queue statuses |
| `connectedAccounts` | Analytics connectors with `connected=true` |

Home panel adds a top row of four linked stat cards (sponsors, pipeline, outreach queue, analytics). Existing ingest metrics row kept.

## Verification (local)

```bash
curl -s http://127.0.0.1:4000/api/analytics/connectors | jq '.connectors | length'   # 4
curl -s http://127.0.0.1:4000/api/pre-alpha/home | jq '.metrics | {sponsorLeads, activeDeals, pendingOutreach, connectedAccounts}'
```

Sample run: `sponsorLeads: 1`, `activeDeals: 0`, `pendingOutreach: 0`, `connectedAccounts: 0`.

## Files touched (high level)

- `db/migrations/34_analytics_connectors.sql`, `db/init/34_analytics_connectors.sql`
- `services/core/src/analytics-connectors/*`
- `services/core/src/schema.ts` — `analyticsConnectors` table
- `services/core/src/pre-alpha/operational-home.ts` — business metrics
- `services/core/src/sponsor-outreach/contacts.ts` — `lastContactedAt` update
- `services/api/src/routes/creator-analytics.ts` — `/connectors`
- `services/api/src/routes/sponsors.ts` — `lastContactedAt` in PUT schema
- `dashboard/components/create-sponsor-form.tsx`
- `dashboard/app/sponsors/*`, `dashboard/app/home-dashboard-panel.tsx`, `dashboard/app/analytics/analytics-hub-panel.tsx`
- `dashboard/lib/pre-alpha-types.ts`

## Not in scope (by design)

- Facebook/Instagram/YouTube OAuth or credential storage
- Email send pipeline changes
- New KC ingest sources or sponsor scoring changes
