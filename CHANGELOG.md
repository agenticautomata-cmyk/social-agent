# Changelog

All notable changes to this project are documented here.

## [0.1.0] — 2026-05-05

First public release. Complete portfolio build of a self-running AI content agent for short-form social video.

### Added — Database

- Postgres 16 schema with `pgvector`, `citext`, `uuid-ossp`, `pg_trgm` extensions
- 11 tables: `industries`, `campaigns`, `campaign_industries`, `personas`, `content_items`, `assets`, `publishing_targets`, `publications`, `workflow_runs`
- Strict-forward state machine on `content_items.state` with 13 states
- `content_items.topic_embedding` (1536-dim) with ivfflat ANN index for cosine-similarity dedup
- 7 industries seeded out of the box (dentists, coffee shops, insurance agencies, restaurants, real estate, fitness studios, marketing agencies)

### Added — Core (`@social-agent/core`)

- Drizzle ORM schema mirroring the SQL definitions
- Provider interfaces with mock + real implementations gated by `DEMO_MODE`:
  - **LLM**: OpenAI (gpt-4o-mini for scripts/captions, text-embedding-3-small for dedup) + deterministic mock
  - **Image**: Google Imagen 3 + picsum.photos mock
  - **Avatar**: HeyGen v2 (Avatar IV start + poll) + mock with sample MP4 URLs
  - **Instagram**: Graph API Reels publishing + mock
  - **TikTok**: Content Posting API Direct Post + mock (audit path documented)
- Planner with industry weighted-rotation, weekly quota distribution, idempotency
- Seed script for the demo campaign with all 7 industries + persona seeds

### Added — Workers (`@social-agent/workers`)

- Generic state-machine runtime with `FOR UPDATE SKIP LOCKED` claim semantics, retry-with-backoff, audit log writes
- Cron-style runtime for periodic tasks
- Eight workflow workers covering the entire pipeline:
  1. `planner` — hourly; turns campaign config into next-week `content_items`
  2. `script-writer` — `planned → script_drafted` with embedding-based dedup and regeneration on similarity > 0.85
  3. `approval-gate` — auto-approves `script_drafted` items in `autonomy_mode='auto'` campaigns
  4. `persona-picker` — picks/creates persona for testimonial-style content; uses founder avatar for explainers
  5. `avatar-render-start` + `avatar-render-poll` — async HeyGen render orchestration
  6. `post-production` — generates per-platform captions and hashtags
  7. `scheduler` — cron-based slot assignment, creates `publications` rows per target
  8. `publisher` — publishes to IG/TikTok with exponential backoff on transient failures

### Added — API (`@social-agent/api`)

- Hono-based REST API on Node 20+
- Routes: `/campaigns`, `/content`, `/approvals`, `/runs`, `/metrics`, `/planner`
- Zod request validation, typed JSON responses
- Manual planner trigger via `POST /api/planner/run?campaignId=...`

### Added — Dashboard (`@social-agent/dashboard`)

- Next.js 15 App Router with Tailwind 3
- Pages:
  - **Overview** — pipeline stats, state distribution bars, campaign list
  - **Campaigns** — list with quota summaries
  - **Campaign detail** — autonomy toggle (manual/hitl/auto), planner button, pipeline state grid, industries
  - **Queue** — all content items, filterable by state
  - **Approvals** — HITL inbox with approve / reject-with-reason flow
  - **Runs** — workflow run audit log with duration + status

### Added — n8n Workflows

- `01-planner-cron.json` — daily 06:00 UTC planner trigger with Slack notification
- `02-approval-slack.json` — every 30 min, posts pending approvals to Slack
- `03-publishing-monitor.json` — hourly health check with alert thresholds

### Added — Documentation

- `ARCHITECTURE.md` — full design rationale
- `docs/state-machine.md` — every state transition documented
- `docs/publishing-setup.md` — IG Graph API setup + TikTok audit path
- `docs/heygen-setup.md` — founder avatar + persona pipeline
- `docs/architecture.svg` — visual architecture diagram
- `docs/screenshots/` — UI mockups (overview, queue, approvals)
- `docs/demo.tape` — VHS recipe for screencast GIF

### Verified

- All 4 TypeScript packages typecheck clean (`pnpm -r typecheck`)
- `pnpm install` resolves cleanly across the workspace
- Demo flow runs end-to-end without external API keys

### Known limitations (roadmap)

- Post-production is currently a passthrough — real ffmpeg subtitle / CTA overlay / TikTok-spec normalization is wired but not implemented
- No token rotation service yet for IG / TikTok long-lived tokens
- B-roll sourcing not implemented (Pexels/Pixabay API integration planned)
- Multi-account-per-platform per campaign is supported by the schema but the planner currently picks one account per platform per campaign
- Analytics ingestion (post performance → planner bias) not implemented

[0.1.0]: https://github.com/anthonyonazure/social-agent/releases/tag/v0.1.0
