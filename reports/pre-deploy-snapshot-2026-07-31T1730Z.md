# Pre-deploy safety snapshot — 2026-07-31T17:30Z

## Git

| Item | Value |
|------|-------|
| Branch | `release/scout-expansion-2026-07-25` |
| HEAD | `5ae9801` Ship Newsletter Intelligence with pinned live backfill controls. |
| Working tree | 161+ modified files, untracked dashboard API routes, newsletter modules, reports |
| Source patch | `reports/pre-deploy-patch-20260731T173003Z.patch` (excludes `.env`, reports, caches) |

## Health (before restart)

| Target | Status |
|--------|--------|
| Local API `:4000/health` | 200 |
| Local dashboard `:3000/` | 200 |
| Public `api.kckellie.com/health` | 200 |
| Public `benson.kckellie.com/` | 200 |

## Environment names present (no values)

`API_PORT`, `BENSON_ADMIN_EMAILS`, `BENSON_CONTROL_TOWER_KEY`, `BENSON_LEARNING_UI_ENABLED`, `CREATOR_EMAIL_*`, `CREATOR_GMAIL_SEND_AS`, `CREATOR_TIMEZONE`, `DATABASE_URL`, `DEMO_MODE`, `ENABLE_*`, `GMAIL_*`, `GOOGLE_*`, `IG_*`, `META_*`, `NEXT_PUBLIC_API_URL`, `OPENAI_API_KEY`, `OUTREACH_*`, `POSTGRES_*`, `SCOUT_INSTAGRAM_PROFILE_DIR`, `TELEGRAM_*`, `TIKTOK_*`, `WORKER_*`, …

## Deploy actions taken

1. Removed stale deploy lock
2. `BENSON_FORCE_DASHBOARD_BUILD=1 ./scripts/pre-alpha-start-prod.sh --build`
3. Forced API restart to load structured-error + skip fixes
4. Added `BENSON_ADMIN_EMAILS` to runtime `.env` (not committed)

## Post-deploy build identity

- API `buildTime`: 2026-07-31T17:31:37Z
- API restarted: 2026-07-31T17:36:52Z
- Dashboard: fresh `next build` via forced prod boot
