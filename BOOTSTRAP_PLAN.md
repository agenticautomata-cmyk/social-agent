# Bootstrap Plan — Inherited social-agent Baseline

**Date:** 2026-05-31  
**Branch:** `kellie-local-agent`  
**Remote:** `upstream` → `https://github.com/anthonyonazure/social-agent.git`  
**Purpose:** Establish a working baseline of the **inherited application as-is** before any Kellie transformation work begins  
**Constraint:** No application code changes — documentation and verification only

**Planning context:** [PROJECT_AUDIT.md](./PROJECT_AUDIT.md) · [DEPENDENCY_MAP.md](./DEPENDENCY_MAP.md) · [KELLIE_TRANSFORMATION_PLAN.md](./KELLIE_TRANSFORMATION_PLAN.md) · [KELLIE_PRODUCT_SPEC.md](./KELLIE_PRODUCT_SPEC.md) · [MVP_SIMPLIFICATION.md](./MVP_SIMPLIFICATION.md)

---

## Goal

Verify the inherited **social-agent** stack runs locally end-to-end in `DEMO_MODE` so we know what we are transforming. Kellie-specific renames, schema changes, and feature cuts come **after** this baseline passes.

---

## Prerequisites

| Requirement | Version / notes |
|---|---|
| **Node.js** | ≥ 20 (`package.json` engines) |
| **pnpm** | 10.30.3 (`packageManager` field — use Corepack or install matching version) |
| **Docker** | Engine + Compose plugin |
| **Git** | Repo cloned; currently on `kellie-local-agent` |
| **OS ports free** | `5433` (Postgres), `4000` (API), `3000` (dashboard) — see port notes below |

### Enable pnpm (if needed)

```bash
corepack enable
corepack prepare pnpm@10.30.3 --activate
```

### Optional (not required for baseline)

| Service | When needed |
|---|---|
| **n8n** | Cron/Slack orchestration only — TS workers are the production path |
| **ffmpeg** | Real post-production only — `DEMO_MODE=true` passthroughs raw HeyGen URLs |
| **OpenAI / HeyGen / etc.** | Real API mode only — mocks used when `DEMO_MODE=true` |

---

## 1. Exact Steps — Local Bootstrap

Execute from the repository root (`social-agent/`).

### Step 1 — Environment file

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```bash
POSTGRES_PASSWORD=dev_password_change_me   # must be non-empty for docker compose
```

If you plan to start the full Docker stack (including n8n), also set:

```bash
N8N_PASSWORD=change_me_strong_password
```

Leave `DEMO_MODE=true` (default). No API keys required for baseline.

### Step 2 — Install dependencies

```bash
pnpm install
```

### Step 3 — Start Postgres

```bash
pnpm dev:db
# equivalent: docker compose up -d postgres
```

Wait until the container is healthy:

```bash
docker compose ps
# social_agent_postgres should show "healthy"
```

**First boot only:** Postgres runs all SQL in `db/init/` via `docker-entrypoint-initdb.d`. This creates extensions, the `n8n` database, application schema, token rotation tables, multi-account columns, and analytics tables.

### Step 4 — Seed demo data

```bash
pnpm seed
```

Expected output includes:

```
seeding demo campaign...
  campaign created: <uuid>   (or "campaign already exists")
  wired 7 industries
  wired publishing targets (instagram, tiktok)
  wired 7 personas
seed complete.
```

Industries (dentists, coffee shops, etc.) are inserted by `db/init/02_schema.sql`. The seed script adds the **Demo Brand** campaign, wires industries, publishing targets, and personas.

### Step 5 — Start application services

**Option A — three terminals (recommended for first bootstrap):**

```bash
# Terminal 1 — API
pnpm dev:api

# Terminal 2 — Workers (11 workers in one process)
pnpm dev:workers

# Terminal 3 — Dashboard
pnpm dev:dashboard
```

**Option B — single command:**

```bash
pnpm dev:all
```

Confirm workers log:

```
[main] starting 11 workers
[worker] planner cron every 3600000ms
[worker] script-writer listening on state=planned
...
```

### Step 6 — Baseline verification (see §6)

Run health checks and at least one pipeline path before marking baseline complete.

### Step 7 — (Optional) Full pipeline demo

```bash
pnpm demo
```

Requires API + workers already running (or start workers after demo). This:

- Sets **Demo Brand** to `autonomy_mode=auto`
- Sets `posting_schedule=* * * * *` (publish immediately)
- Creates ~33 planned content items for the current week

Watch the dashboard at `http://localhost:3000` — items should progress through states over ~30–60 seconds.

**Note:** `pnpm demo` **bypasses the approval inbox**. For approval-flow baseline verification, use Step 6B instead (do not run `pnpm demo`, or reset autonomy to `hitl` afterward).

---

## 2. Required Environment Variables

### Required for baseline (Postgres + app)

| Variable | Example | Required | Purpose |
|---|---|---|---|
| `POSTGRES_PASSWORD` | `dev_password_change_me` | **Yes** | Docker Compose fails without it (`:?` syntax) |
| `DATABASE_URL` | `postgres://social_agent:dev_password_change_me@localhost:5433/social_agent` | **Yes** | API, workers, seed script |
| `POSTGRES_USER` | `social_agent` | Default ok | Postgres container |
| `POSTGRES_DB` | `social_agent` | Default ok | Application database |
| `POSTGRES_PORT` | `5433` | **Yes — match `.env`** | Host port mapped to container 5432 |
| `DEMO_MODE` | `true` | **Yes for baseline** | All external providers use mocks |
| `API_PORT` | `4000` | Default ok | Hono API |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | **Yes** | Dashboard server + client fetches |

### Tuning (optional, defaults work)

| Variable | Default | Purpose |
|---|---|---|
| `WORKER_POLL_INTERVAL_MS` | `2000` | Worker idle poll interval |
| `WORKER_BATCH_SIZE` | `5` | Items claimed per worker tick |

### Not required for baseline

| Variable | Notes |
|---|---|
| `OPENAI_API_KEY` | Ignored when `DEMO_MODE=true` |
| `HEYGEN_API_KEY` | Mock avatar provider used |
| `GOOGLE_AI_API_KEY` | Mock image provider used |
| `IG_*`, `TIKTOK_*` | Mock publishing |
| `SLACK_WEBHOOK_URL` | n8n only |
| `S3_*` | Local passthrough in demo mode |

### Required only if starting n8n (`pnpm dev:stack`)

| Variable | Purpose |
|---|---|
| `N8N_PASSWORD` | Required by docker-compose for n8n service |
| `N8N_USER` | Default `admin` |
| `N8N_PORT` | Default `5678` |
| `N8N_HOST`, `N8N_PROTOCOL`, `N8N_WEBHOOK_URL`, `TZ` | n8n config |

---

## 3. Required Services

### Minimum baseline stack

| Service | How it runs | Port | Required? |
|---|---|---|---|
| **PostgreSQL 16 + pgvector** | Docker (`pgvector/pgvector:pg16`) | Host `5433` → container `5432` | **Yes** |
| **Hono API** | `pnpm dev:api` (Node/tsx) | `4000` | **Yes** |
| **Workers** | `pnpm dev:workers` (Node/tsx) | — (polls DB) | **Yes** |
| **Next.js dashboard** | `pnpm dev:dashboard` (Node) | `3000` | **Yes** |

### Not required for baseline

| Service | Port | Notes |
|---|---|---|
| **n8n** | `5678` | Optional orchestration layer; workers handle all pipeline steps |
| **ffmpeg** | — | Passthrough when `DEMO_MODE=true` |
| **External APIs** | — | Mocked in demo mode |

### Docker Compose services

```yaml
# Minimum
docker compose up -d postgres

# Full stack (baseline does NOT require this)
docker compose up -d    # postgres + n8n
```

### Database initialization (automatic on first Postgres volume)

| Script | Creates |
|---|---|
| `db/init/00_extensions.sql` | uuid-ossp, vector, citext, pg_trgm |
| `db/init/01_create_n8n_db.sql` | Separate `n8n` database |
| `db/init/02_schema.sql` | Core schema + 7 seeded industries |
| `db/init/03_token_rotation.sql` | `platform_credentials` |
| `db/init/04_multi_account.sql` | `route_strategy`, target weights |
| `db/init/05_analytics.sql` | `post_metrics`, `topic_performance` |

**Important:** Init scripts run **only on first container volume creation**. If schema init failed or you need a clean slate:

```bash
docker compose down -v    # destroys postgres_data volume
docker compose up -d postgres
pnpm seed
```

---

## 4. Startup Commands Reference

| Command | What it starts |
|---|---|
| `pnpm dev:db` | Postgres container only |
| `pnpm dev:stack` | Postgres + n8n |
| `pnpm dev:stack:down` | Stop all compose services |
| `pnpm dev:api` | Hono API with hot reload |
| `pnpm dev:workers` | All 11 workers, hot reload |
| `pnpm dev:dashboard` | Next.js on port 3000 |
| `pnpm dev:all` | API + workers + dashboard in parallel |
| `pnpm seed` | Idempotent demo campaign seed |
| `pnpm demo` | Auto mode + planner trigger (full pipeline, skips HITL) |
| `pnpm typecheck` | TypeScript check all packages |
| `pnpm build` | Build all packages |

### Recommended bootstrap sequence (copy-paste)

```bash
cd /path/to/social-agent
cp .env.example .env
# edit .env — set POSTGRES_PASSWORD

pnpm install
pnpm dev:db
sleep 5
docker compose ps          # verify healthy

pnpm seed
pnpm dev:all               # or split across 3 terminals
```

---

## 5. Seed / Demo Data Requirements

### What `pnpm seed` creates

| Entity | Details |
|---|---|
| **Campaign** | Name: `Demo Brand`; `autonomy_mode=hitl`; weekly quotas totaling ~33 items/week |
| **Industries** | 7 industries from SQL init (already in DB); all wired to campaign with weight=1 |
| **Publishing targets** | Mock Instagram + TikTok accounts (`@demobrand`) |
| **Personas** | 7 personas (one per industry) with mock HeyGen avatar/voice IDs |

### What seed does NOT create

- No `content_items` — pipeline starts empty until planner runs
- No `workflow_runs` — created when workers process items
- No `publications` — created by scheduler worker

### What `pnpm demo` adds/changes

| Action | Effect |
|---|---|
| Updates campaign | `autonomy_mode=auto`, `posting_schedule=* * * * *` |
| Runs planner | Inserts `content_items` in `planned` state for current week |
| Does NOT start workers | You must have `pnpm dev:workers` running separately |

### Baseline data requirements summary

| Check | Expected |
|---|---|
| Industries count | 7 rows (from SQL init) |
| Campaigns count | ≥ 1 (`Demo Brand`) |
| Personas count | 7 (after seed) |
| Publishing targets | 2 (IG + TikTok) |
| Content items | 0 before planner; 33 after demo/planner |

---

## 6. Health Checks

Run these after Step 5 (services running).

### 6A — Infrastructure

```bash
# Postgres container healthy
docker compose ps

# Postgres accepting connections (adjust port if not 5433)
docker compose exec postgres pg_isready -U social_agent

# API health
curl -s http://localhost:4000/health
# expected: {"ok":true}
```

### 6B — API endpoints

```bash
# Campaigns list (seeded Demo Brand)
curl -s http://localhost:4000/api/campaigns | head -c 500

# Metrics overview (may show zeros before planner)
curl -s http://localhost:4000/api/metrics/overview

# Workflow runs (empty until workers process)
curl -s http://localhost:4000/api/runs?limit=5
```

### 6C — Dashboard

Open `http://localhost:3000`:

| Check | Pass criteria |
|---|---|
| Overview loads | No red "api unreachable" error box |
| Campaigns section | Shows **Demo Brand** row |
| Nav links work | `/campaigns`, `/queue`, `/approvals`, `/runs` all load |

If Overview shows an error, confirm `pnpm dev:api` is running and `NEXT_PUBLIC_API_URL=http://localhost:4000` in `.env`.

### 6D — Workers running

In the workers terminal, confirm no repeated crash loops. After triggering the planner, you should see logs like:

```
[script-writer] ...
[approval-gate] auto-approved N items   (only in auto mode)
[persona-picker] ...
[avatar-render-start] ...
[avatar-poll] ... → video_ready
[publisher] content_item ... → published   (auto demo path)
```

### 6E — Queue / state machine (full pipeline path)

**Use when verifying end-to-end automation (auto mode):**

```bash
pnpm demo          # with workers + API running
# wait 30–60 seconds, refresh dashboard
```

| Check | Pass criteria |
|---|---|
| `/queue` | Items appear across multiple states |
| Overview state bars | Non-zero counts for in-flight and published |
| `/runs` | Multiple `workflow_runs` rows with success status |
| Terminal state | At least one item reaches `published` |

### 6F — Approval flow (HITL path) — **required for baseline**

This verifies the inherited approval inbox **without** auto mode.

**Do not run `pnpm demo`** (it sets auto mode). Use fresh seed defaults (`hitl`).

1. Confirm campaign is in HITL mode:

```bash
curl -s http://localhost:4000/api/campaigns | grep -o '"autonomyMode":"[^"]*"'
# expected: "autonomyMode":"hitl"
```

If you previously ran `pnpm demo`, reset via dashboard: **Campaigns → Demo Brand → autonomy toggle → `[hitl]`**, or PATCH the API.

2. Trigger planner (replace `<campaign-id>` from campaigns response):

```bash
curl -s -X POST "http://localhost:4000/api/planner/run?campaignId=<campaign-id>"
# expected: {"result":{"itemsCreated":33,...}}  (number varies by week/idempotency)
```

3. Wait 10–20 seconds for script-writer workers.

4. Check approvals inbox:

```bash
curl -s http://localhost:4000/api/approvals
# expected: items array with state script_drafted entries
```

5. Open `http://localhost:3000/approvals` — approval cards with hook, script, CTA.

6. Click **[ approve ]** on one card (or via API):

```bash
curl -s -X POST "http://localhost:4000/api/approvals/<content-item-id>/approve" \
  -H "Content-Type: application/json" \
  -d '{"approvedBy":"bootstrap-test"}'
```

7. Verify state transition in runs:

```bash
curl -s "http://localhost:4000/api/runs?limit=10"
```

| Check | Pass criteria |
|---|---|
| Items in `script_drafted` | Visible in `/approvals` |
| Approve action | Item leaves inbox; state → `script_approved` |
| Reject action | Item returns to pipeline with rejection reason (optional second test) |
| Audit log | `/runs` shows worker transitions + timestamps |

---

## 7. Known Risks and Blockers

Discovered during audit and bootstrap planning:

| Risk | Severity | Mitigation |
|---|---|---|
| **Init scripts run once per volume** | High | If tables missing, `docker compose down -v` and recreate |
| **Port mismatch** | Medium | `.env.example` uses `POSTGRES_PORT=5433`; `DATABASE_URL` must match. README says 5432 if `.env` not used |
| **`POSTGRES_PASSWORD` unset** | High | Compose fails with `set POSTGRES_PASSWORD in .env` |
| **No authentication** | Info | Dashboard/API are open on localhost — expected for inherited app |
| **`pnpm demo` disables HITL test** | Medium | Use §6F path for approval baseline; demo is for full pipeline only |
| **Planner idempotency** | Low | Re-running planner in same week creates fewer new items; use fresh volume or new week for repeat tests |
| **Worker dependency on DB** | Medium | Start Postgres before workers; workers retry on connection errors |
| **11 workers in one process** | Low | CPU spike on first pipeline run — normal for dev |
| **Mock delays** | Info | Mock LLM/HeyGen add 150–500ms delays; full pipeline takes ~30–60s not instant |
| **ffmpeg absent** | None in demo | Post-production passthroughs HeyGen URL when `DEMO_MODE=true` |
| **n8n `host.docker.internal`** | Low | n8n planner workflow targets `host.docker.internal:4000` — only matters if using n8n, not baseline |
| **Git remote renamed** | Info | Remote is `upstream`, branch `kellie-local-agent` — does not affect local bootstrap |
| **Package names still `@social-agent/*`** | Info | Expected pre-transformation; commands use these names |
| **Kellie planning docs describe future state** | Info | Do not confuse [KELLIE_PRODUCT_SPEC.md](./KELLIE_PRODUCT_SPEC.md) routes (`/clients`) with current routes (`/campaigns`) |

---

## 8. Features That Must Work Before Kellie Changes

Do **not** begin transformation (rename, schema pivot, worker cuts) until all baseline checks pass on the **inherited** application.

### Must function

| # | Feature | How to verify | Inherited components |
|---|---|---|---|
| 1 | **Application boots** | `pnpm dev:all` — no fatal errors in 3 services | api, workers, dashboard |
| 2 | **Database initializes** | All `db/init/*.sql` applied; `\dt` shows campaigns, content_items, workflow_runs, etc. | Docker Postgres + init scripts |
| 3 | **Dashboard loads** | `http://localhost:3000` — Overview without API error | Next.js 15, `lib/api.ts` |
| 4 | **Workers run** | 11 workers log startup; no crash loop | `services/workers/src/main.ts` |
| 5 | **Queue / state machine** | Planner creates items; workers advance states (§6E or §6F) | `content_items.state`, `runtime.ts` |
| 6 | **Audit logging** | `/runs` populates after worker activity | `workflow_runs` table, `/api/runs` |
| 7 | **Approval flow (HITL)** | `/approvals` inbox; approve/reject works (§6F) | `routes/approvals.ts`, approval-card UI |

### Should function (recommended, not blocking)

| Feature | Verify | Notes |
|---|---|---|
| Full pipeline to `published` | §6E with `pnpm demo` | Validates video chain — will be **removed** in Kellie transform |
| Campaign detail + planner button | `/campaigns/[id]` → **[ plan now ]** | Same as curl planner trigger |
| Autonomy toggle | Switch hitl ↔ auto on campaign detail | Needed to understand inherited pattern |
| Metrics overview | Overview stat tiles update after pipeline run | |
| Mock providers | Pipeline completes with no API keys | Confirms `DEMO_MODE=true` |

### Explicitly NOT required before Kellie work

| Feature | Reason |
|---|---|
| n8n workflows | Optional layer; workers are primary |
| Real OpenAI / HeyGen / IG / TikTok | Demo mode sufficient |
| ffmpeg post-production | Passthrough in demo |
| Authentication | Not implemented in inherited app |
| Portfolio scripts / VHS demo GIF | Not part of runtime |

---

## Success Criteria Checklist

Mark baseline complete when all are true:

- [ ] `docker compose ps` — Postgres **healthy**
- [ ] `curl http://localhost:4000/health` → `{"ok":true}`
- [ ] `pnpm seed` completes without error
- [ ] `http://localhost:3000` — Overview loads, **Demo Brand** visible
- [ ] Workers terminal — **11 workers** started
- [ ] Planner creates content items (`POST /api/planner/run` or dashboard button)
- [ ] Items progress through states (workers advancing queue)
- [ ] `/runs` shows audit entries with `success` status
- [ ] `/approvals` shows items in HITL mode; **approve** transitions item out of inbox
- [ ] (Recommended) `pnpm demo` path — at least one item reaches **`published`**

**When all required checks pass:** baseline is established. Kellie transformation (per [KELLIE_TRANSFORMATION_PLAN.md](./KELLIE_TRANSFORMATION_PLAN.md) and [MVP_SIMPLIFICATION.md](./MVP_SIMPLIFICATION.md)) may begin.

---

## Current vs Future (do not confuse during bootstrap)

| Inherited (bootstrap now) | Kellie (after transform) |
|---|---|
| Package `@social-agent/*` | `@kellie/*` |
| Route `/campaigns` | `/clients` or removed (single creator) |
| Route `/queue` | `/opportunities` |
| `content_items` + video states | `opportunities` + review states |
| `POST /api/planner/run` | `POST /api/scanner/run` |
| 11 workers | 2–4 workers |

Bootstrap validates the **left column only**.

---

## Troubleshooting Quick Reference

| Symptom | Likely cause | Fix |
|---|---|---|
| Compose error: `POSTGRES_PASSWORD` | Missing from `.env` | Set in `.env`, retry |
| `connection refused` on 5433 | Postgres not running / wrong port | `pnpm dev:db`; check `DATABASE_URL` |
| Dashboard "api unreachable" | API not running | `pnpm dev:api` |
| Overview empty campaigns | Seed not run | `pnpm seed` |
| `[demo] no demo campaign` | Seed not run | `pnpm seed` |
| Approvals inbox empty after planner | Campaign in `auto` mode | Reset to `hitl`; or items auto-approved |
| No state progression | Workers not running | `pnpm dev:workers` |
| Tables missing | Init scripts didn't run | `docker compose down -v`; recreate |
| Port 5433 in use | Local Postgres conflict | Change `POSTGRES_PORT` in `.env` + `DATABASE_URL` |

---

## Next Step

**Stop here.** Run the bootstrap checklist above. Do not begin Kellie-specific code changes until baseline success criteria are confirmed and approved.

---

*End of bootstrap plan.*
