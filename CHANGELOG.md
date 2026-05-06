# Changelog

All notable changes to this project are documented here.

## [0.3.0] — 2026-05-06

Full UI redesign — dropped the "shadcn-template / sky-500 / lucide-everywhere"
look that read as AI-generated. New aesthetic: cream paper + JetBrains Mono +
deep emerald accent + bracketed status labels + ASCII section markers. All
portfolio media regenerated to match.

### Changed — Dashboard

- **Typography**: JetBrains Mono throughout (sans, mono, headings, numbers).
  Geist removed.
- **Palette**: cream paper `#f5f1e8` background, near-black `#0a0a0a` text,
  deep emerald `#166534` accent, mustard `#a16207` for awaiting/warn, oxblood
  `#991b1b` for failed. Light mode by default — no more dark.
- **Borders**: 2px hard ink rules between sections instead of bordered cards.
  Tight column rules with `#d6cdb8` for sub-divisions. No rounded corners.
- **Status pills**: bracketed text `[published]` `[awaiting_approval]` —
  shape and fill removed; color and brackets do the work.
- **Section markers**: `─────  // §1 overview` style throughout the app.
- **Lucide-react removed.** Only simple-icons retained for IG/TikTok logos.
- **Cursor block**: subtle blinking `▌` after page headings as terminal nod.
- **No shadows, no gradients, no backdrop-blur, no tile-glow** — restraint
  signals craft.

### Added — Architecture diagram

- `docs/architecture.svg` rebuilt with bracketed component labels, ASCII
  separators, hard 2px borders, accent on hot paths (state machine, audit log).

### Regenerated — Portfolio media

All assets in `portfolio-media/` rebuilt in the new aesthetic:

- `hero-1920x1080.png` — cream paper, mono headline with emerald accent,
  column-ruled stat strip
- `square-1080x1080.png` — IG/portfolio thumbnail
- `linkedin-1584x396.png` — profile banner (avatar zone respected)
- `twitter-1500x500.png` — profile header
- `stats-1200x630.png` — 4 stat tiles + stack/capabilities cards
- `architecture-2400x1350.png` — 4K-ready
- `dashboard-tour-1280x800.mp4` — re-recorded against new dashboard
- `demo-pipeline-1100x620.mp4` + `demo.gif` — re-recorded with custom VHS
  paper-and-ink theme matching the dashboard
- `case-study.pdf` — 2-page case study redesigned end-to-end

### Added — GH Pages site

- `docs/index.html` rebuilt as single-file landing in the cream/mono aesthetic
  with sticky nav, sectioned thesis / dashboard / architecture / features /
  pipeline / quickstart, terminal-styled code block.

### Verified

- All 4 packages typecheck clean (`pnpm -r typecheck`)
- Dashboard renders cleanly across all 5 routes
- End-to-end pipeline reaches `published` state in ~30s during demo

## [0.2.0] — 2026-05-05

UI polish + roadmap delivery + GitHub Pages site.

### Added — Dashboard

- Lucide icons throughout (nav, state pills, tiles, buttons, headers)
- Geist Sans + Geist Mono fonts (system-style ligatures, tight hierarchy)
- New design tokens: refined dark palette, ring-bordered pills, gradient accent
- `tile-glow` cards with subtle border highlight
- Brand icons via simple-icons for Instagram and TikTok in tables/detail
- Sparkles logo, sticky header with backdrop blur, animated demo-mode pulse
- Improved approval-card UX (colored chip metadata, rejection textarea with icon)
- Status badges in run log with icons; better visual hierarchy in queue table

### Added — Marketing

- `docs/og-image.png` (1200×630) social card with gradient hero + mini diagram
- `site/index.html` — single-file modern landing site for GitHub Pages
  - Hero with gradient text, stat strip, dashboard preview, feature grid,
    architecture, pipeline cards, quickstart code block

### Added — ffmpeg post-production

- `services/core/src/post-production/index.ts` — real ffmpeg pipeline gated by
  DEMO_MODE: scale + pad to 720×1280, burn SRT subtitles via libass styling,
  hook overlay (top, 0–3s), CTA pill (bottom, last 5s), TikTok-spec transcode
  (H.264 high / yuv420p / 30fps / AAC 128k / +faststart)
- Naive script-to-SRT timing distributes the script over the clip duration
  with a 4-words-per-cue chunking
- Post-production worker now stores both `final_video` (mp4) and `subtitle_srt`
  asset rows

### Added — Token rotation

- New `platform_credentials` table with explicit `expires_at`, refresh_token,
  app credentials for refresh
- `services/core/src/token-rotation/index.ts` — Instagram long-lived page-token
  refresh + TikTok refresh-token rotation, both with safety margins (IG: 7d,
  TikTok: 2h)
- Cron-style `token-rotation` worker runs hourly

### Added — B-roll sourcing

- `services/core/src/providers/broll.ts` — Pexels Videos API integration with
  vertical-orientation preference, duration filter, attribution capture
- Mock falls back to public sample MP4s for demo

### Added — Multi-account-per-platform

- `publishing_targets` gains `weight`, `posts_count`, `last_used_at`
- Campaigns gain `route_strategy` enum: `all` (fan-out), `round_robin`,
  `weighted`
- Scheduler applies the strategy per platform group, increments usage counters

### Added — Analytics ingestion + planner feedback

- New `post_metrics` table — periodic snapshots (1h, 6h, 24h, 72h, 168h) per
  publication with views/likes/comments/shares/saves/reach/watch-time
- New `topic_performance` table — rolled-up per (campaign, industry, type,
  language) with `planner_weight_modifier` in [0.5, 2.0]
- `services/core/src/analytics/index.ts` — IG Insights + TikTok Display API
  fetchers (mocked in DEMO_MODE), atomic SQL roll-up
- Cron-style `analytics-ingest` worker runs every 30 min
- Planner consumes `topic_performance.planner_weight_modifier` to bias industry
  rotation toward high-performing content

### Added — Tooling

- `scripts/screenshot.mjs` — Playwright headless capture for all dashboard pages
- `scripts/demo-watch.sh` — pretty terminal pipeline visualizer for VHS recording
- `services/core/src/env.ts` — auto-loads `.env` via dotenv

### Changed

- Worker runtime now uses Drizzle's typed `select().for('update', { skipLocked })`
  inside a transaction (camelCase columns reach handlers correctly)
- HeyGen mock render delay reduced to 3s to fit in screencast window
- Scheduler treats `* * * * *` as "post immediately" for demo-mode pipelines

### Verified

- `pnpm -r typecheck` clean across all 4 packages
- End-to-end pipeline reaches `published` state in ~30s during demo
- Playwright screenshots captured for all 5 dashboard pages
- VHS GIF recorded and embedded in README + landing site

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
