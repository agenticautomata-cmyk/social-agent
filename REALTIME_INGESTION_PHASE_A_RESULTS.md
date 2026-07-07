# Real-Time Ingestion Phase A — Results

## Summary

Backend refresh pipeline for **existing** KC sources only: registry, on-demand refresh APIs, ingestion run logs, content freshness fields, operator `/sources` UI, and freshness banners on editor + inventory review.

No new opportunity sources. No Cloudflare changes. Live email unchanged. Demo mode preserved.

---

## Root cause addressed

Ingest existed via `scanAllActiveSources` / `POST /api/scanner/run`, but there was no operator-facing registry, ordered run audit (`source_ingestion_runs`), freshness timestamps on `content_items`, or safe refresh-all with concurrency/timeouts.

---

## Files changed

| Area | Files |
|------|--------|
| Migration | `db/migrations/33_source_ingestion_freshness.sql` |
| Schema | `services/core/src/schema.ts` — `source_ingestion_runs`, freshness columns on `content_items` |
| Ingest persist | `services/core/src/scanner/ingest-persist.ts` |
| Scanner | `services/core/src/scanner/index.ts` — dry-run support, `itemsUpdated`, idempotent re-seen touches |
| Source ingestion | `services/core/src/source-ingestion/*` (registry, refresh, runs, freshness, source-meta) |
| API | `services/api/src/routes/sources.ts`, `services/api/src/server.ts` |
| Scripts | `services/core/src/scripts/migrate-source-ingestion.ts`, `migration-runner.ts` (step 33) |
| Dashboard | `dashboard/app/sources/*`, `dashboard/components/ingestion-freshness-banner.tsx`, inventory + editor panels, nav |
| Package | `package.json`, `services/core/package.json` |

---

## Source count discovered

On verification host: **0** rows in `sources` table (run `pnpm seed` to wire existing provider configs from seed script).

Registry logic reads **all** `sources` rows; seed defines 50+ configured types (reddit, visitkc, retail, charity, etc.) when present.

---

## Endpoints added

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/sources` | Registry + freshness status per source |
| GET | `/api/sources/freshness` | Summary for inventory/editor banners |
| GET | `/api/sources/runs` | Recent `source_ingestion_runs` |
| POST | `/api/sources/:id/refresh` | Refresh one source (`?dry_run=true` optional) |
| POST | `/api/sources/refresh-all` | Refresh enabled sources (`?dry_run=true`, concurrency 3, 120s timeout/source) |

Requires `ENABLE_OPPORTUNITIES_API=true` for routes; refresh requires `ENABLE_KC_SCANNER=true`.

Legacy `POST /api/scanner/run` unchanged.

---

## Migration added

**33_source_ingestion_freshness.sql** (idempotent):

- `source_ingestion_runs` + `source_ingestion_status` enum
- `content_items`: `first_seen_at`, `last_seen_at`, `source_last_checked_at`, `stale`, `freshness_bucket`
- Backfill from `discovered_at` where missing

Run: `pnpm migrate:pre-alpha` (includes step 33) or `pnpm migrate:source-ingestion`

---

## Migration order (pre-alpha chain)

… → 32 pre-alpha feedback → **33 source ingestion freshness**

---

## Verification results

| Check | Result |
|-------|--------|
| `pnpm typecheck` | Pass |
| `pnpm migrate:pre-alpha` | Pass (33 applied) |
| `pnpm pre-alpha:start` | Pass |
| `curl http://127.0.0.1:4000/api/sources` | `{"ok":true,"count":0,...}` (no seeded sources on host) |
| `curl -X POST .../refresh-all?dry_run=true` | `{"ok":true,"dryRun":true,...}` |
| `http://127.0.0.1:3000/sources` | 200 |
| `http://127.0.0.1:3000/editor` | 200 |
| `http://127.0.0.1:3000/review/inventory` | 200 |
| `https://api.kckellie.com/health` | `{"ok":true}` |

**Note:** Restart API/dashboard after deploy so new routes load (`pre-alpha:stop` → `pre-alpha:start`).

---

## What is still fake/demo

- `DEMO_MODE=true` — seed/demo opportunities and Benson demo script names may still appear alongside ingested rows.
- Unseeded DB — empty `sources` until `pnpm seed`.
- No automatic cron — refresh is on-demand only (workers cron not required for this phase).
- Dry run still executes provider fetches; it skips DB writes but counts would-create/would-update.

---

## What is actually live

- Real HTTP/RSS/API fetches from existing provider modules when refresh runs.
- Dedup by `source_id` + `source_external_id` (and URL for some types).
- Re-seen items update `last_seen_at` / `source_last_checked_at` without overwriting topic, hook, script, or editorial metadata.
- Per-source and refresh-all failures stored in `source_ingestion_runs`; prior inventory remains.
- Operator UI at `/sources` with per-source and bulk refresh.

---

## Operator commands

```bash
pnpm seed                    # if sources table empty
pnpm migrate:pre-alpha
pnpm pre-alpha:start
curl http://127.0.0.1:4000/api/sources
curl -X POST "http://127.0.0.1:4000/api/sources/refresh-all?dry_run=true"
```

---

## Remaining blockers

None for code/migrations. **Data:** run `pnpm seed` on hosts with empty `sources` before expecting refresh to pull KC feeds.
