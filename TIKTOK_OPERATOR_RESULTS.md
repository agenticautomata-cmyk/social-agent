# TikTok Operator Execution Layer — Implementation Summary

## What shipped

Benson now has a **TikTok Command Center / Operator Layer** that closes the loop:

**analyze → decide → prepare → hand off to TikTok → track → next move**

Manual handoff first (copy caption, open TikTok, mark posted). No permanent video warehouse. Architecture ready for future inbox/direct post.

## New page

- **`/analytics/tiktok/operator`** — TikTok Command Center
- Linked from TikTok analytics page, nav (**TikTok operator**), and Action Center

## Database (migration 48)

```bash
pnpm --filter @social-agent/core migrate:tiktok-operator
```

Tables:

| Table | Purpose |
|-------|---------|
| `tiktok_operator_recommendations` | Actionable operator recs from analytics |
| `tiktok_post_packages` | Editable TikTok post packages + handoff fields |
| `tiktok_comment_insights` | Comment opportunity foundation |
| `sponsor_proof_assets` | Sponsor-facing proof from strong TikToks |
| `creator_format_templates` | Repeatable format templates |
| `tiktok_operator_briefings` | Daily operator briefing history |
| `tiktok_handoff_events` | Handoff audit trail |

All records are **`creator_id`-scoped** (FK → `creator_accounts`).

## API routes (`/api/tiktok-operator`)

| Method | Path | Action |
|--------|------|--------|
| GET | `/command-center` | Full operator hub |
| POST | `/briefing/refresh` | Regenerate daily briefing |
| PATCH | `/recommendations/:id` | Update status |
| POST | `/recommendations/:id/accept` | Accept |
| POST | `/recommendations/:id/dismiss` | Dismiss |
| POST | `/recommendations/:id/prepare` | Prepare for TikTok package |
| POST | `/packages/prepare` | Create package |
| GET/PATCH | `/packages/:id` | Read/update package |
| POST | `/packages/:id/handoff` | Mark handed off |
| POST | `/packages/:id/posted` | Mark posted manually |
| POST | `/packages/:id/schedule` | Schedule reminder |
| POST | `/sequel` | Sequel package |
| POST | `/repeat-format` | Format template |
| POST | `/sponsor-proof` | Build sponsor proof |
| PATCH | `/sponsor-proof/:id` | Edit proof |
| POST | `/comment-insights/:id/reply-package` | Reply video package |

## Core module

`services/core/src/tiktok-operator/`

- `command-center.ts` — hub aggregator
- `recommendations.ts` — heuristic auto-recs from outperformers, comments, momentum
- `packages.ts` — Prepare for TikTok + manual handoff
- `sponsor-proof.ts`, `formats.ts`, `comments.ts`, `briefing.ts`, `capabilities.ts`

## Action Center integration

New section **`tiktok_operator_moves`** — top recommendations with **Prepare for TikTok** CTA → Command Center.

## Test workflow

1. Open `/analytics/tiktok/operator` (creator with TikTok analytics data)
2. Confirm briefing + performance signals + recommendations
3. Accept a recommendation → **Prepare for TikTok**
4. Edit caption/hashtags → Copy caption → Open TikTok
5. Mark handed off → Mark posted manually
6. On a strong video: **Build sponsor proof**, **Make a sequel**, **Repeat this format**
7. Check Action Center → TikTok operator moves
8. Verify statuses update in Command Center after refresh

## Future API readiness

- `capabilities` block shows analytics connection, missing scopes, inbox/direct post flags
- Post packages include `media_source_type`, `handoff_method`, `temporary_asset_id` for future pass-through upload
- `ENABLE_TIKTOK_PUBLISH` feature flag gates inbox/direct post UI states

## Key files changed

- `db/migrations/48_tiktok_operator.sql`, `db/init/48_tiktok_operator.sql`
- `services/core/src/schema.ts`
- `services/core/src/tiktok-operator/*`
- `services/api/src/routes/tiktok-operator.ts`
- `services/api/src/server.ts`
- `services/core/src/action-center/collect.ts`, `types.ts`
- `dashboard/app/analytics/tiktok/operator/*`
- `dashboard/lib/tiktok-operator-types.ts`
- `dashboard/lib/opportunities-ui.ts`
