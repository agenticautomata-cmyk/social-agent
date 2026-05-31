# Bootstrap Results — Inherited social-agent Baseline

**Date:** 2026-05-31  
**Branch:** `kellie-local-agent`  
**Procedure:** [BOOTSTRAP_PLAN.md](./BOOTSTRAP_PLAN.md)  
**Constraint:** No Kellie transformations; no application code changes

---

## Executive Summary

**Baseline verification: PASSED (required criteria)**

The inherited social-agent stack runs locally in `DEMO_MODE=true`. Postgres initializes, dependencies install, seed data loads, API/workers/dashboard start, health checks pass, the HITL approval flow works, and workers advance items through the state machine. One approved item progressed from `script_drafted` → `script_approved` → `assets_ready` → `video_generating` → `video_ready` → `ready_to_publish` → `scheduled`.

**Recommended (non-blocking) check not completed:** full auto-mode pipeline to `published` via `pnpm demo` was not run. The HITL-approved item reached `scheduled` but not `published` (posting schedule is `0 9,17 * * *` Europe/Berlin, not immediate publish).

---

## Success Criteria Checklist

| # | Check | Result | Notes |
|---|---|---|---|
| 1 | Postgres healthy | **PASS** | Manual `docker run` container; `pg_isready` OK |
| 2 | `GET /health` → `{"ok":true}` | **PASS** | |
| 3 | `pnpm seed` completes | **PASS** | Demo Brand + 7 industries + 2 targets + 7 personas |
| 4 | Dashboard loads, Demo Brand visible | **PASS** | All nav routes HTTP 200 |
| 5 | 11 workers started | **PASS** | Confirmed in workers terminal at startup |
| 6 | Planner creates content items | **PASS** | 33 items created (planner cron on worker startup) |
| 7 | Items progress through states | **PASS** | 32 in `script_drafted`, 1 in `scheduled` |
| 8 | `/runs` audit log populated | **PASS** | script-writer, persona-picker, avatar-render, post-production, scheduler |
| 9 | HITL approval flow works | **PASS** | Approve via API → `script_approved`; item left inbox |
| 10 | (Recommended) item reaches `published` | **NOT RUN** | Requires `pnpm demo` or waiting for scheduled publish slot |

---

## What Worked

### 1. Environment file

- Created `.env` from `.env.example`
- Set `POSTGRES_PASSWORD=dev_password_change_me`
- Left `DEMO_MODE=true` (no external API keys needed)
- `POSTGRES_PORT=5433` matches `DATABASE_URL`

### 2. Dependencies

```bash
cd /home/elliott/Projects/kellie-assistant/social-agent
npx pnpm@10.30.3 install
```

- 152 packages installed successfully
- Warning: ignored build scripts for `esbuild`, `sharp` (pnpm security default)

### 3. Postgres + schema init

`pnpm dev:db` failed (see failures). Workaround container started successfully:

```bash
docker run -d --name social_agent_postgres_bootstrap \
  -e POSTGRES_USER=social_agent \
  -e POSTGRES_PASSWORD=dev_password_change_me \
  -e POSTGRES_DB=social_agent \
  -p 5433:5432 \
  -v social_agent_bootstrap_data:/var/lib/postgresql/data \
  -v "$(pwd)/db/init:/docker-entrypoint-initdb.d:ro" \
  pgvector/pgvector:pg16
```

- Init scripts in `db/init/` applied on first volume creation
- Postgres 16 + pgvector accepting connections on host port **5433**

### 4. Seed data

```bash
npx pnpm@10.30.3 seed
```

Output confirmed:

- Campaign: **Demo Brand** (`7c2e6d41-cd20-40bb-8645-e71087eb8cea`)
- `autonomy_mode=hitl`
- 7 industries wired
- 2 publishing targets (Instagram, TikTok)
- 7 personas

### 5. Application services

Started in separate background processes:

```bash
npx pnpm@10.30.3 dev:api       # Hono API
npx pnpm@10.30.3 dev:workers   # 11 workers
npx pnpm@10.30.3 dev:dashboard # Next.js
```

Alternative single command: `npx pnpm@10.30.3 dev:all`

### 6. Health checks

| Check | Command / URL | Result |
|---|---|---|
| API health | `curl http://localhost:4000/health` | `{"ok":true}` |
| Campaigns | `GET /api/campaigns` | Demo Brand, `autonomyMode: hitl` |
| Metrics | `GET /api/metrics/overview` | 32 `script_drafted`, 1 `scheduled` |
| Approvals | `GET /api/approvals` | 32 items in inbox |
| Runs | `GET /api/runs?limit=20` | Multiple `success` workflow runs |
| Dashboard `/` | http://localhost:3000 | HTTP 200 |
| Dashboard `/campaigns` | http://localhost:3000/campaigns | HTTP 200 |
| Dashboard `/queue` | http://localhost:3000/queue | HTTP 200 |
| Dashboard `/approvals` | http://localhost:3000/approvals | HTTP 200 |
| Dashboard `/runs` | http://localhost:3000/runs | HTTP 200 |

### 7. HITL approval flow (§6F)

1. Campaign confirmed in `hitl` mode
2. Planner created 33 content items (auto on worker startup)
3. Script-writer advanced items to `script_drafted`
4. Approval via API succeeded:

```bash
curl -s -X POST "http://localhost:4000/api/approvals/<content-item-id>/approve" \
  -H "Content-Type: application/json" \
  -d '{"approvedBy":"bootstrap-test"}'
```

5. Approved item (`53c5eb5f-64a8-4dfd-8be1-70c2cee6d09a`) progressed:
   - `script_approved` → `assets_ready` (persona-picker)
   - → `video_generating` → `video_ready` (avatar-render mock)
   - → `ready_to_publish` (post-production passthrough)
   - → `scheduled` (scheduler, slot `2026-05-31T07:00:00.000Z`)

---

## What Failed or Required Workarounds

| Issue | Severity | Workaround / Fix |
|---|---|---|
| **`docker compose` not available** | High | Docker CLI present (29.1.3) but Compose plugin missing. Used manual `docker run` instead of `pnpm dev:db`. **Fix:** Install Docker Compose plugin (`docker-compose-plugin` package on Ubuntu) or use standalone `docker-compose`. |
| **`pnpm` not in PATH** | Medium | Used `npx pnpm@10.30.3` for all commands. **Fix:** `corepack enable && corepack prepare pnpm@10.30.3 --activate` (corepack also not installed on this host). |
| **`corepack` not installed** | Medium | Same as above — use `npx pnpm@10.30.3` or install Node with corepack. |
| **`psql` / `pg_isready` not on host** | Low | Used `docker exec social_agent_postgres_bootstrap pg_isready -U social_agent`. **Fix:** Install `postgresql-client` if host-side DB tools are desired. |
| **Port 5432 already in use** | Info | Unrelated `postgres:15` container on 5432. `.env.example` already uses **5433** — no change needed. |
| **Container name differs from compose** | Info | Manual container: `social_agent_postgres_bootstrap` (compose would use `social_agent_postgres`). |

---

## Warnings (Non-blocking)

| Warning | Details |
|---|---|
| **pnpm ignored build scripts** | `esbuild`, `sharp` — may affect production builds; dev mode worked |
| **Next.js lockfile warning** | Multiple lockfiles detected (parent `kellie-assistant/pnpm-lock.yaml` vs `social-agent/pnpm-lock.yaml`) |
| **n8n not started** | Not required for baseline; workers are the primary pipeline path |
| **ffmpeg not verified** | Not needed — `DEMO_MODE=true` post-production uses passthrough |
| **`published` state not reached** | HITL path schedules future slot; auto demo path not run |

---

## URLs and Ports

| Service | URL / Port | Status |
|---|---|---|
| **Dashboard** | http://localhost:3000 | Running |
| **API** | http://localhost:4000 | Running |
| **API health** | http://localhost:4000/health | `{"ok":true}` |
| **Postgres** | `localhost:5433` → container `5432` | Running |
| **n8n** | http://localhost:5678 | Not started (optional) |

---

## Credentials

From `.env` (copied from `.env.example`):

| Setting | Value |
|---|---|
| **Postgres user** | `social_agent` |
| **Postgres password** | `dev_password_change_me` |
| **Postgres database** | `social_agent` |
| **Postgres host port** | `5433` |
| **DATABASE_URL** | `postgres://social_agent:dev_password_change_me@localhost:5433/social_agent` |
| **DEMO_MODE** | `true` |
| **n8n user** | `admin` (not used — n8n not started) |
| **n8n password** | `change_me_strong_password` (placeholder in `.env`) |

No authentication on dashboard or API (expected for inherited app).

---

## Startup Commands (This Environment)

Use `npx pnpm@10.30.3` instead of bare `pnpm` until pnpm is installed globally.

### Full bootstrap from scratch

```bash
cd /home/elliott/Projects/kellie-assistant/social-agent

# 1. Environment
cp .env.example .env
# Ensure POSTGRES_PASSWORD is set (non-empty)

# 2. Dependencies
npx pnpm@10.30.3 install

# 3. Postgres (preferred — if compose works)
npx pnpm@10.30.3 dev:db

# 3b. Postgres (this host — manual fallback)
docker run -d --name social_agent_postgres_bootstrap \
  -e POSTGRES_USER=social_agent \
  -e POSTGRES_PASSWORD=dev_password_change_me \
  -e POSTGRES_DB=social_agent \
  -p 5433:5432 \
  -v social_agent_bootstrap_data:/var/lib/postgresql/data \
  -v "$(pwd)/db/init:/docker-entrypoint-initdb.d:ro" \
  pgvector/pgvector:pg16

# 4. Seed
npx pnpm@10.30.3 seed

# 5. Start app (one terminal)
npx pnpm@10.30.3 dev:all

# Or three terminals:
npx pnpm@10.30.3 dev:api
npx pnpm@10.30.3 dev:workers
npx pnpm@10.30.3 dev:dashboard
```

### Verification commands

```bash
curl -s http://localhost:4000/health
curl -s http://localhost:4000/api/campaigns
curl -s http://localhost:4000/api/metrics/overview
curl -s http://localhost:4000/api/approvals
curl -s "http://localhost:4000/api/runs?limit=10"

# Trigger planner manually
curl -s -X POST "http://localhost:4000/api/planner/run?campaignId=7c2e6d41-cd20-40bb-8645-e71087eb8cea"

# Approve one item (HITL)
curl -s -X POST "http://localhost:4000/api/approvals/<content-item-id>/approve" \
  -H "Content-Type: application/json" \
  -d '{"approvedBy":"bootstrap-test"}'
```

### Optional: full auto pipeline to `published`

```bash
# Requires API + workers running; bypasses HITL
npx pnpm@10.30.3 demo
# Wait 30–60s; check /queue and /api/metrics/overview for published count
```

### Stop / cleanup

```bash
# Stop app services: Ctrl+C in dev terminals

# Stop Postgres (manual container)
docker stop social_agent_postgres_bootstrap
docker rm social_agent_postgres_bootstrap

# Destroy data volume (clean slate — re-runs db/init scripts)
docker volume rm social_agent_bootstrap_data

# If using compose:
npx pnpm@10.30.3 dev:stack:down
docker compose down -v   # destroys postgres_data volume
```

---

## Prerequisites Found on This Host

| Requirement | Expected | Found |
|---|---|---|
| Node.js ≥ 20 | Yes | **v22.22.0** ✓ |
| pnpm 10.30.3 | Yes | **Not installed** — use `npx pnpm@10.30.3` |
| Docker Engine | Yes | **v29.1.3** ✓ |
| Docker Compose plugin | Yes | **Missing** — `docker compose` unknown command |
| Git | Yes | Repo on `kellie-local-agent` ✓ |
| Port 5433 free | Yes | ✓ (5432 occupied by unrelated container) |
| Port 4000 free | Yes | ✓ |
| Port 3000 free | Yes | ✓ |

---

## Required Fixes for Smoother Future Bootstraps

1. **Install Docker Compose plugin** so `pnpm dev:db` works as documented:
   ```bash
   sudo apt install docker-compose-plugin
   ```

2. **Enable pnpm via corepack** (or install pnpm globally):
   ```bash
   # If corepack is available with your Node install:
   corepack enable
   corepack prepare pnpm@10.30.3 --activate
   ```

3. **Optional:** Install `postgresql-client` for host-side `psql` / `pg_isready`.

4. **Optional:** Run `pnpm demo` once to verify full pipeline to `published` (recommended, not blocking).

5. **Optional:** Resolve Next.js multiple-lockfile warning by ensuring dashboard runs from `social-agent/` root only, or removing parent lockfile if unintended.

---

## Manual Steps Required on This Host

1. Use `npx pnpm@10.30.3` prefix for all package scripts
2. Start Postgres with manual `docker run` (or install compose plugin first)
3. Use `docker exec` for Postgres readiness checks (no host `psql`)
4. For HITL baseline: do **not** run `pnpm demo` before testing approvals (demo sets `autonomy_mode=auto`)

---

## Demo Data State After Bootstrap

| Entity | Count / Value |
|---|---|
| Campaigns | 1 — Demo Brand |
| Campaign ID | `7c2e6d41-cd20-40bb-8645-e71087eb8cea` |
| Autonomy mode | `hitl` |
| Industries | 7 (from SQL init) |
| Personas | 7 |
| Publishing targets | 2 (Instagram, TikTok mocks) |
| Content items | 33 total |
| State breakdown | 32 `script_drafted`, 1 `scheduled` |
| Published | 0 |

---

## Features Verified (Inherited App)

| Feature | Verified |
|---|---|
| Application boots (API + workers + dashboard) | ✓ |
| Database initializes (all `db/init/*.sql`) | ✓ |
| Dashboard loads without API error | ✓ |
| 11 workers run without crash loop | ✓ |
| Queue / state machine advances | ✓ |
| Audit logging (`/runs`, `workflow_runs`) | ✓ |
| HITL approval inbox + approve action | ✓ |
| Mock providers (`DEMO_MODE=true`, no API keys) | ✓ |
| Full pipeline to `published` | Not verified |

---

## Next Step

**Stop here.** Baseline is established for required criteria. Do not begin Kellie-specific code changes until explicitly approved.

To complete the optional recommended check:

```bash
npx pnpm@10.30.3 demo
# wait ~60s
curl -s http://localhost:4000/api/metrics/overview
```

Then proceed to [KELLIE_TRANSFORMATION_PLAN.md](./KELLIE_TRANSFORMATION_PLAN.md) and [MVP_SIMPLIFICATION.md](./MVP_SIMPLIFICATION.md) when ready.

---

*End of bootstrap results.*
