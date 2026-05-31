# Project Audit: social-agent → Kellie Assistant

**Audit date:** 2026-05-31  
**Branch:** `kellie-local-agent`  
**Source:** Fork of [anthonyonazure/social-agent](https://github.com/anthonyonazure/social-agent)  
**Target vision:** Kansas City content opportunity assistant (Kellie Assistant)

This document describes what the repository does today and assesses how it could be transformed into Kellie Assistant. No code was modified during this audit.

---

## 1. What the Application Currently Does

**social-agent** is a self-running AI content pipeline for short-form social video. An operator configures one or more **campaigns** (brand voice, weekly content quotas, posting schedule, autonomy mode). The system then:

1. **Plans** a weekly content calendar — rotating industries, respecting per-type quotas, spreading slots across the week.
2. **Writes scripts** via LLM — topic, hook, body, CTA — with pgvector-based topic deduplication.
3. **Gates approval** — human-in-the-loop (HITL) by default; auto mode skips script review.
4. **Assigns personas** — picks or generates AI personas with portraits for testimonial-style content; founder avatar for explainer content.
5. **Renders video** — HeyGen avatar lip-sync from script.
6. **Post-produces** — platform captions/hashtags via LLM; optional ffmpeg subtitle burn and CTA overlay.
7. **Schedules and publishes** — cron-based slot assignment, fan-out to Instagram and TikTok publishing targets.
8. **Ingests analytics** — pulls post metrics, rolls up into planner weight modifiers.

A **Next.js dashboard** exposes campaign config, a content queue, an approval inbox, workflow run audit log, and pipeline health metrics. The system ships with `DEMO_MODE=true` so the full pipeline runs end-to-end without paid API keys, using mock providers with realistic delays.

**Primary user flow:**

```
Campaign config → Planner creates content_items (planned)
  → Script writer (LLM + dedup) → script_drafted
  → Approval (HITL or auto) → script_approved
  → Persona picker → assets_ready
  → HeyGen render → video_generating → video_ready
  → Post-production (captions + ffmpeg) → ready_to_publish
  → Scheduler → scheduled → Publisher → published
```

---

## 2. Technologies Used

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 20+, TypeScript, pnpm workspaces (monorepo) |
| **Database** | PostgreSQL 16 with pgvector, citext, uuid-ossp |
| **ORM** | Drizzle ORM |
| **API** | Hono on `@hono/node-server`, Zod validation |
| **Frontend** | Next.js 15 App Router, React 19, Tailwind CSS 3 |
| **Orchestration** | TypeScript polling workers (primary); n8n (optional cron/Slack) |
| **AI / Media** | OpenAI (GPT-4o mini, text-embedding-3-small), Google Imagen/Gemini, HeyGen, ffmpeg |
| **Publishing** | Instagram Graph API, TikTok Content Posting API |
| **Infrastructure** | Docker Compose (Postgres + n8n), local asset cache |
| **Dev tooling** | tsx, Playwright (scripts), VHS (demo GIF recording) |

**Monorepo packages:**

| Package | Path | Role |
|---|---|---|
| `@social-agent/core` | `services/core/` | Schema, DB, env, providers, planner, post-production, analytics |
| `@social-agent/api` | `services/api/` | REST API (Hono) |
| `@social-agent/workers` | `services/workers/` | State-machine workers |
| `@social-agent/dashboard` | `dashboard/` | Operator UI |

---

## 3. How the Frontend Is Structured

The dashboard is a **Next.js 15 App Router** application with server components that fetch from the Hono API via `dashboard/lib/api.ts`. No client-side state library; interactivity is limited to small client components (toggles, buttons).

```
dashboard/
├── app/
│   ├── layout.tsx          # Global nav, JetBrains Mono + cream paper theme
│   ├── page.tsx            # Overview — pipeline stats, campaign table, state bars
│   ├── globals.css         # Design tokens (paper, accent, signal colors)
│   ├── campaigns/
│   │   ├── page.tsx        # Campaign list
│   │   └── [id]/
│   │       ├── page.tsx    # Campaign detail, state counts, industry weights
│   │       ├── autonomy-toggle.tsx   # Client: PATCH autonomy_mode
│   │       └── planner-button.tsx    # Client: POST trigger planner
│   ├── queue/
│   │   └── page.tsx        # Filterable content item table (by state)
│   ├── approvals/
│   │   ├── page.tsx        # HITL script approval inbox
│   │   └── approval-card.tsx       # Client: approve/reject actions
│   └── runs/
│       └── page.tsx        # Workflow run audit log
├── components/
│   ├── state-pill.tsx      # Content state badge
│   └── icons.tsx           # Platform icons (Instagram, TikTok)
└── lib/
    └── api.ts              # Typed fetch helpers + shared interfaces
```

**Design characteristics:**

- Server-rendered pages with `cache: 'no-store'` fetches
- Minimal dependencies (no UI component library)
- Bracketed navigation aesthetic, monospace typography
- API base URL from `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`)

**API surface consumed by the dashboard:**

| Route | Purpose |
|---|---|
| `GET /api/campaigns` | List campaigns |
| `GET/PATCH /api/campaigns/:id` | Detail + config updates |
| `GET /api/content` | Queue with optional state filter |
| `GET/POST /api/approvals` | Approval inbox, approve/reject |
| `GET /api/runs` | Workflow run history |
| `GET /api/metrics/overview` | Dashboard aggregates |
| `POST /api/planner/run` | Manual planner trigger |

---

## 4. How the Backend Is Structured

The backend splits into three cooperating services plus optional n8n.

### 4.1 Core library (`services/core/`)

Shared domain logic imported by API and workers:

- **`schema.ts`** — Drizzle table definitions mirroring SQL init scripts
- **`db.ts`** — Postgres connection via `postgres` driver
- **`env.ts`** — Environment config (`DEMO_MODE`, API keys, worker tuning)
- **`planner/`** — Weekly content calendar generation
- **`providers/`** — Pluggable external services (LLM, image, HeyGen, IG, TikTok, B-roll) with mock/real selector pattern
- **`post-production/`** — ffmpeg pipeline or passthrough
- **`analytics/`** — Metrics ingestion and topic performance rollup
- **`token-rotation/`** — OAuth token refresh for publishing targets
- **`scripts/seed.ts`** — Idempotent demo data bootstrap

### 4.2 REST API (`services/api/`)

Hono app on port 4000 with route modules:

```
services/api/src/
├── server.ts
└── routes/
    ├── campaigns.ts    # CRUD-lite for campaigns
    ├── content.ts      # Queue listing
    ├── approvals.ts    # HITL approve/reject
    ├── runs.ts         # Audit log
    ├── metrics.ts      # Dashboard aggregates
    └── planner.ts      # Manual planner trigger
```

CORS is open (`*`). No authentication layer — intended as a local/portfolio deployment.

### 4.3 Workers (`services/workers/`)

All workers boot from `main.ts` in a single process (dev-friendly; horizontally scalable by running workers individually).

**Worker runtime** (`runtime.ts`):

- `createWorker` — polls items in a given `content_state`, claims with `FOR UPDATE SKIP LOCKED`, processes, advances state, writes `workflow_runs` audit row, retries up to 5 times before `failed`
- `createCronWorker` — interval-based jobs (planner, publisher, approval gate, avatar poll, analytics, token rotation)

**Workflow workers:**

| Worker | Trigger | Input state / interval | Output |
|---|---|---|---|
| `planner` | Cron (1h) | — | Creates `planned` items |
| `script-writer` | Poll | `planned` | `script_drafted` |
| `approval-gate` | Cron (5s) | Auto-approves in `auto` mode | `script_approved` |
| `persona-picker` | Poll | `script_approved` | `assets_ready` |
| `avatar-render-start` | Poll | `assets_ready` | `video_generating` |
| `avatar-render-poll` | Cron (5s) | Polls HeyGen jobs | `video_ready` |
| `post-production` | Poll | `video_ready` | `ready_to_publish` |
| `scheduler` | Poll | `ready_to_publish` | `scheduled` |
| `publisher` | Cron (5s) | Due `publications` | `published` |
| `token-rotation` | Cron | Expiring credentials | Refreshed tokens |
| `analytics-ingest` | Cron | Published posts | `post_metrics` rollup |

### 4.4 n8n (optional)

Docker Compose includes n8n wired to the same Postgres host. Three importable workflows handle:

- Daily planner cron → `POST /api/planner/run`
- Slack approval notifications (every 30 min)
- Failed publication monitoring (hourly)

The TypeScript workers are the **production path**; n8n is a portfolio/visual orchestration layer. Both can coexist.

---

## 5. Database Schema

Schema is defined in `db/init/02_schema.sql` with incremental migrations in `03_`–`05_`. Drizzle mirrors it in `services/core/src/schema.ts`.

### Core entities

```
industries              Reference verticals (dentists, coffee shops, etc.)
campaigns               Brand config, quotas, schedule, autonomy, founder avatar
campaign_industries     M:N with rotation weights
personas                Recurring characters (portrait, HeyGen IDs, usage stats)
content_items           State machine row — topic, script, captions, video URLs
assets                  Files (portraits, raw/final video, SRT, B-roll)
publishing_targets      Per-campaign platform accounts
publications            Per-target publish jobs with status
workflow_runs           Orchestration audit log
```

### Extended entities (migrations)

```
platform_credentials    OAuth tokens per publishing target (03_token_rotation.sql)
post_metrics            Time-series engagement snapshots (05_analytics.sql)
topic_performance       Aggregated performance → planner weight modifier
```

### Enums

| Enum | Values |
|---|---|
| `content_type` | testimonial, case_study, success_story, explainer, educational, transformation, founder_message, industry_insight |
| `content_state` | planned → script_drafted → script_approved → assets_ready → video_generating → video_ready → post_production → ready_to_publish → scheduled → published (+ failed, cancelled, script_rejected) |
| `platform` | instagram, tiktok, youtube_shorts, linkedin |
| `autonomy_mode` | manual, hitl, auto |
| `route_strategy` | all, round_robin, weighted |
| `publication_status` | queued, publishing, published, failed, cancelled |

### Notable design patterns

- **State machine in Postgres** — business truth lives in `content_items.state`
- **pgvector dedup** — `topic_embedding vector(1536)` with IVFFlat cosine index
- **Idempotent planner** — checks existing week items before creating new slots
- **Audit trail** — every worker transition logged in `workflow_runs`

---

## 6. Existing AI Functionality

| Capability | Location | Real provider | Mock behavior |
|---|---|---|---|
| **Script generation** | `providers/llm.ts` | OpenAI GPT-4o mini (JSON output) | Template-based scripts with deterministic variation |
| **Caption/hashtag generation** | `providers/llm.ts` | OpenAI GPT-4o mini | Platform-specific caption templates |
| **Topic embedding / dedup** | `providers/llm.ts`, `script-writer.ts` | text-embedding-3-small | Deterministic pseudo-embedding (1536-dim) |
| **Persona portrait** | `providers/image.ts` | Google Imagen/Gemini | Placeholder portrait URLs |
| **Avatar video render** | `providers/heygen.ts` | HeyGen API (start + poll) | Simulated render with delay |
| **B-roll sourcing** | `providers/broll.ts` | Pexels API | Mock stock clips (not wired into main pipeline) |
| **Post-production** | `post-production/index.ts` | ffmpeg (subtitle burn, CTA overlay) | Passthrough of raw HeyGen URL |
| **Analytics interpretation** | `analytics/index.ts` | IG Insights + TikTok Display API | Deterministic mock growth curves |

**Provider selection pattern:** Each provider factory checks `DEMO_MODE` and the relevant API key. Providers can be mixed — e.g., real OpenAI + mock HeyGen.

**Prompt engineering:** Scripts use system prompts with brand voice, industry seeds, recent topic avoidance, and rejection feedback. Captions are platform-optimized (Instagram vs TikTok length/hashtag rules).

---

## 7. Existing Workflow / Orchestration Functionality

### Primary: Postgres state machine + TypeScript workers

The core orchestration model is **database-driven**:

1. Each pipeline stage is a worker bound to one input state.
2. Workers claim work atomically (`FOR UPDATE SKIP LOCKED`).
3. Success advances state; failure retries in-place or marks `failed`.
4. Cron workers handle time-based tasks (planning, publishing, polling, analytics).

This provides crash recovery, horizontal scaling, and a clear audit trail without an external orchestrator.

### Secondary: n8n workflows

Three JSON workflows in `n8n/workflows/` provide:

- Scheduled planner invocation
- Slack-based HITL routing
- Publishing failure alerts

n8n stores its own state in a separate `n8n` database (created in `db/init/01_create_n8n_db.sql`).

### Human-in-the-loop

Three autonomy modes control approval depth:

| Mode | Behavior |
|---|---|
| `manual` | All transitions require dashboard approval (only script gate implemented) |
| `hitl` (default) | Script approval required; rest autonomous |
| `auto` | Full end-to-end; approval-gate worker auto-advances |

Dashboard approve/reject sets state directly; reject loops back to `planned` with `script_rejection_reason` fed into the LLM prompt.

### Feedback loop

Analytics ingestion → `topic_performance.planner_weight_modifier` → planner industry rotation weights. High-performing industry/type combos get scheduled more often.

---

## 8. Components Reusable for a Kansas City Content Opportunity Assistant

Assuming Kellie Assistant helps discover, score, and act on **local content opportunities** (events, news, trends, seasonal hooks in Kansas City), the following existing components map well:

### High reuse (keep with adaptation)

| Component | Reuse for Kellie |
|---|---|
| **Postgres state machine pattern** | Track opportunities through stages: discovered → scored → drafted → approved → published/archived |
| **Worker runtime** (`runtime.ts`) | Poll-and-advance pattern for opportunity processing pipelines |
| **`workflow_runs` audit log** | Trace every AI decision and state transition |
| **Drizzle schema + SQL init pattern** | Extend with KC-specific tables (sources, venues, events, neighborhoods) |
| **LLM provider abstraction** | Draft posts, summarize events, score relevance, generate hooks for local angles |
| **Embedding + dedup** | Avoid recommending duplicate or near-duplicate opportunities |
| **Planner logic** | Adapt from "weekly quota calendar" to "daily/weekly opportunity digest" with rotation across categories (sports, food, arts, business, neighborhoods) |
| **HITL approval inbox** | Review AI-drafted content before publishing or sharing with clients |
| **Hono API structure** | REST endpoints for opportunities, sources, approvals, metrics |
| **Next.js dashboard shell** | Queue, approvals, runs, overview — rename and re-skin for opportunities |
| **`StatePill` + queue filtering** | Visual pipeline status for opportunity items |
| **Analytics feedback loop** | Bias future opportunity scoring toward high-engagement topics |
| **Mock/real provider pattern** | Demo mode for portfolio and local dev without API keys |
| **Docker Compose + Postgres** | Same infra foundation |
| **Campaign config model** | Adapt to "client" or "brand" profiles with voice, categories, posting preferences |

### Medium reuse (refactor significantly)

| Component | Adaptation needed |
|---|---|
| **`campaigns` table** | Repurpose as client/brand profiles; replace video quotas with opportunity preferences |
| **`industries` table** | Replace with KC content categories, neighborhoods, or verticals (restaurants, events, civic, sports) |
| **`content_items` table** | Rename/restructure to `opportunities` — drop video-specific columns, add source URL, event date, location, relevance score |
| **`content_type` enum** | Replace with opportunity types (event, news, trend, seasonal, partnership, user-submitted) |
| **Script writer worker** | Become "content drafter" — shorter-form copy for social posts, newsletters, or client briefs |
| **Scheduler + publisher** | Optional — only if Kellie auto-publishes; may become "export" or "notify" instead |
| **Metrics routes + overview page** | Adapt to opportunity engagement rather than video pipeline stats |
| **n8n cron workflows** | Reuse for daily opportunity scans, Slack digests, source polling triggers |

### Conceptual reuse (patterns, not code)

- Autonomy modes for trust-building (start HITL, graduate to auto)
- Idempotent planning (don't re-create opportunities already in the pipeline)
- Retry and failure handling for flaky external data sources
- Multi-tenant campaign/client isolation

---

## 9. Components That Should Be Removed

These are tightly coupled to the **autonomous short-form video** use case and add complexity without serving a KC content opportunity assistant:

| Component | Path | Reason to remove |
|---|---|---|
| **HeyGen avatar pipeline** | `providers/heygen.ts`, `workflows/avatar-render.ts` | Video avatar rendering is not core to opportunity discovery |
| **Persona system** | `personas` table, `workflows/persona-picker.ts`, `providers/image.ts` | AI character portraits for testimonial videos |
| **Video post-production** | `post-production/`, ffmpeg pipeline in `workflows/post-production.ts` | Subtitle burn, CTA overlays, 9:16 transcoding |
| **Instagram/TikTok publishing** | `providers/instagram.ts`, `providers/tiktok.ts`, `workflows/publisher.ts`, `token-rotation/` | Direct platform publishing unless Kellie explicitly auto-posts |
| **B-roll provider** | `providers/broll.ts` | Stock video clips for post-production |
| **Founder avatar fields** | `campaigns.founder_heygen_*` | HeyGen-specific config |
| **Video-specific content states** | `assets_ready`, `video_generating`, `video_ready`, `post_production` | Replace with opportunity-appropriate states |
| **Publishing targets / publications** | Tables + scheduler fan-out logic | Unless auto-publish is a Kellie requirement |
| **Seeded industry verticals** | Dentists, coffee shops, etc. in `02_schema.sql` | Replace with KC-specific seed data |
| **Portfolio / demo artifacts** | `portfolio-media/`, `docs/demo.tape`, `scripts/render-*.mjs`, `scripts/record-dashboard-tour.mjs`, `docs/index.html` | Portfolio presentation assets, not product code |
| **VHS demo tooling** | `docs/demo.tape`, demo GIF workflow | Screencast generation for portfolio |
| **Dual n8n orchestration** | n8n container + workflows (optional) | TS workers already handle orchestration; n8n adds ops overhead unless Slack/cron integration is desired |
| **Platform-specific enums** | `youtube_shorts`, `linkedin` in platform enum | Remove if not publishing to these |
| **Multi-account routing** | `route_strategy`, weighted target selection | Over-engineered for a local content assistant |

**Keep but gut:** `assets` table (may store scraped images or attachments, not video), `content_type` enum (replace values, keep pattern).

---

## 10. Estimated Effort to Transform into Kellie Assistant

Estimates assume one experienced full-stack developer familiar with the codebase, building an MVP Kellie Assistant focused on **KC opportunity discovery, AI scoring/drafting, and HITL review** — not autonomous video production or multi-platform publishing.

### Phase 1: Foundation rebrand and schema pivot (1–2 weeks)

- Rename packages, env vars, dashboard branding (`social-agent` → `kellie-assistant`)
- Redesign schema: `opportunities` replacing `content_items`, KC categories replacing `industries`, drop video/persona/publishing tables
- New state machine: e.g. `discovered → scored → drafted → approved → scheduled → published → archived`
- Update seed data with KC categories, sample sources, demo opportunities
- Strip unused workers and providers

### Phase 2: Opportunity ingestion (2–3 weeks)

- Build source connectors (RSS, event APIs, manual URL submit, Google Alerts-style feeds)
- New workers: `source-scanner`, `opportunity-scorer` (LLM relevance + embedding dedup against recent items)
- KC-specific prompt templates (neighborhoods, venues, local voice)
- API routes: sources CRUD, opportunity list/detail, manual trigger

### Phase 3: Content drafting and HITL (1–2 weeks)

- Adapt script writer → opportunity content drafter (social post, brief, headline variants)
- Retain approval inbox pattern; update UI for opportunity context (source link, event date, location map pin optional)
- Autonomy modes per client/brand

### Phase 4: Dashboard rebuild (1–2 weeks)

- Reskin UI (move away from portfolio monospace aesthetic if desired)
- New pages: Sources, Opportunities (replace Queue), Calendar/digest view, Client profiles (replace Campaigns)
- Overview metrics: opportunities by score, category breakdown, pipeline health

### Phase 5: Optional publishing and notifications (1–2 weeks)

- If needed: Slack/email digest, export to Buffer/Later, or lightweight publish adapter
- n8n or cron for daily KC scan + morning digest
- Skip entirely for MVP if Kellie is review-and-export only

### Phase 6: Polish and production hardening (1–2 weeks)

- Authentication (currently none)
- Real source reliability, rate limiting, error monitoring
- Tests for scoring dedup and state transitions
- Deployment (VPS or cloud — existing Docker Compose is a starting point)

### Summary

| Scope | Duration | Notes |
|---|---|---|
| **MVP** (discover, score, draft, approve — no auto-publish) | **6–9 weeks** | Reuses ~40% of backend patterns, ~30% of frontend shell |
| **Full product** (+ publishing, analytics loop, multi-client) | **10–14 weeks** | Closer to current feature parity adapted to local content |
| **Minimal fork** (keep video pipeline, add KC topic sources) | **2–3 weeks** | Not recommended — wrong product shape, high ongoing cost |

### Risk factors that could extend timeline

- **No Kellie product spec in repo** — requirements for data sources, output formats, and client workflow need definition (+1–2 weeks discovery)
- **KC data source availability** — reliable event/news APIs for Kansas City may require scraping or manual curation (+1–3 weeks)
- **HeyGen/video removal cascade** — state machine simplification touches most workers and dashboard views (+3–5 days integration testing)
- **Authentication and multi-tenancy** — absent today; required for any client-facing deployment (+1 week)

### Recommended transformation strategy

1. **Fork mentally, not incrementally** — treat video production as dead code; preserve the state-machine + worker + provider patterns.
2. **Rename early** — avoid `@social-agent/*` leaking into Kellie branding.
3. **Define Kellie's state machine first** — it drives schema, workers, and UI.
4. **Keep DEMO_MODE** — essential for development and demos without paid APIs.
5. **Defer n8n** — TS workers are sufficient; add n8n only if non-developers need to edit cron/Slack flows.

---

## Appendix: Quick Reference

### Start the current system

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install && pnpm seed
pnpm dev:all
# Dashboard → http://localhost:3000
# API       → http://localhost:4000
```

### Key files for transformation planning

| File | Why it matters |
|---|---|
| `db/init/02_schema.sql` | Canonical schema — first file to redesign |
| `services/workers/src/runtime.ts` | Reusable worker framework |
| `services/core/src/providers/llm.ts` | AI integration template |
| `services/core/src/planner/index.ts` | Scheduling/digest logic to adapt |
| `dashboard/lib/api.ts` | Frontend ↔ backend contract |
| `services/workers/src/main.ts` | Worker registry — shows full pipeline surface area |

---

*End of audit.*
