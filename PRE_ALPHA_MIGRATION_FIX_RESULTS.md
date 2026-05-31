# Pre-Alpha Migration Fix — Results

## Root cause

`scripts/pre-alpha-start.sh` ran migrations in **reverse dependency order** and swallowed failures with `|| true`:

1. `migrate:action-center` (31) ran **before** `migrate:content-planning` (26).
2. `31_action_center_due_dates.sql` does `ALTER TABLE planner_items`, but `planner_items` is created in `26_content_planning.sql`.
3. Similar failures for `migrate:sponsor-pipeline` (30) before `migrate:sponsor-outreach` (27), and `migrate:sponsor-outreach-phase-b` (29) before outreach tables existed.

On a partially migrated DB, non-idempotent SQL (`CREATE TYPE`, `CREATE TABLE` without `IF NOT EXISTS`) caused repeat-run failures (e.g. `creator_platform_connection_status already exists`).

## Files changed

| File | Change |
|------|--------|
| `services/core/src/scripts/migration-runner.ts` | **New** — ordered steps, `requireTables`, `applyMigrationFile` |
| `services/core/src/scripts/migrate-pre-alpha.ts` | **New** — runs chain 24 → 32 |
| `scripts/pre-alpha-start.sh` | TCP wait on `POSTGRES_PORT`; single `pnpm migrate:pre-alpha`; fail on error |
| `package.json` | `migrate:pre-alpha` script |
| `services/core/package.json` | `migrate:pre-alpha` script |
| `services/core/src/scripts/migrate-action-center.ts` | Uses runner step 31 + dependency checks |
| `services/core/src/scripts/migrate-content-planning.ts` | Uses runner step 26 + dependency checks |
| `db/migrations/24_creator_analytics.sql` | Idempotent tables/indexes |
| `db/migrations/25_editor_home.sql` | `IF NOT EXISTS` |
| `db/migrations/26_content_planning.sql` | Idempotent enum/table; conditional editor backfill |
| `db/migrations/27_sponsor_outreach.sql` | Idempotent enums/tables; `ON CONFLICT` on templates |
| `db/migrations/28_creator_platform_connections.sql` | Idempotent enum/table |
| `db/migrations/30_sponsor_pipeline.sql` | Idempotent enum/table |
| `db/init/28_creator_platform_connections.sql` | Synced with migration |
| `db/init/30_sponsor_pipeline.sql` | Synced with migration |

**Unchanged (already idempotent):** `29_sponsor_outreach_phase_b.sql`, `31_action_center_due_dates.sql`, `32_pre_alpha_feedback.sql`

## Migration order used

`pnpm migrate:pre-alpha` applies:

| # | SQL | Creates / alters |
|---|-----|------------------|
| 24 | `24_creator_analytics.sql` | `creator_accounts`, videos, metrics |
| 25 | `25_editor_home.sql` | `editor_opportunity_tracking` |
| 26 | `26_content_planning.sql` | **`planner_items`** |
| 27 | `27_sponsor_outreach.sql` | `sponsor_contacts`, outreach tables |
| 28 | `28_creator_platform_connections.sql` | TikTok connection table |
| 29 | `29_sponsor_outreach_phase_b.sql` | Live-send enum labels, attempt columns |
| 30 | `30_sponsor_pipeline.sql` | `sponsor_opportunities` |
| 31 | `31_action_center_due_dates.sql` | `due_date` on planner/pipeline/outreach |
| 32 | `32_pre_alpha_feedback.sql` | `tester_feedback` |

**Prerequisite:** `content_items` from base schema (`db/init/02_schema.sql` or `pnpm seed`). Step 24 fails with a clear message if `content_items` is missing.

## Verification results

| Check | Result |
|-------|--------|
| `pnpm typecheck` | **Pass** |
| `pnpm migrate:pre-alpha` | **Pass** (idempotent re-run, including action-center) |
| `pnpm pre-alpha:start` | **Pass** — migrations then health checks |
| `curl http://127.0.0.1:4000/health` | `{"ok":true}` |
| `curl http://127.0.0.1:3000/` | **200** |
| `curl https://api.kckellie.com/health` | `{"ok":true}` |

## Remaining blockers

None for migration/boot on this host.

- **Fresh DB with no `content_items`:** run `pnpm seed` or ensure `db/init` ran on first Postgres volume creation before `migrate:pre-alpha`.
- **KC source-type migrations (06–23):** not part of pre-alpha chain; run separately if scanner source enums are needed.
- **Live email:** still disabled by design (`OUTREACH_ENABLE_LIVE_SEND` not set).

## Operator commands

```bash
cd /home/elliott/Projects/kellie-assistant/social-agent
pnpm migrate:pre-alpha    # migrations only
pnpm pre-alpha:start      # postgres + migrations + API + dashboard
```
