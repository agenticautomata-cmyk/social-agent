# Architecture

## Goals

1. **Self-running** — operator sets campaign config; system produces and publishes content without daily intervention.
2. **Multi-campaign** — run several brands/industries in parallel with isolated config and quotas.
3. **Recoverable** — if HeyGen fails mid-render, if TikTok rate-limits, if Imagen returns garbage — the system retries from the last good state without losing work.
4. **Quality-gated** — start with human approval on scripts, flip to autonomous once trust is earned.

## High-level diagram

```
┌──────────────────┐
│  Dashboard       │  Next.js — campaign config, queue, approvals
│  (Phase 6)       │
└────────┬─────────┘
         │ Drizzle/SQL
         ▼
┌─────────────────────────────────────────────┐
│  Postgres + pgvector                        │
│  ─────────────────                          │
│  campaigns                  publishing_     │
│  industries                 targets         │
│  campaign_industries        publications    │
│  personas                   workflow_runs   │
│  content_items (state machine + embedding)  │
│  assets                                     │
└────────┬────────────────────────────────────┘
         │ polled by n8n cron triggers
         ▼
┌─────────────────────────────────────────────┐
│  n8n — orchestrator                         │
│  ────────────────                           │
│  1. planner          (cron: daily)          │
│  2. script_writer    (state: planned)       │
│  3. approval_gate    (state: script_drafted)│
│  4. persona_picker   (state: script_approved)│
│  5. avatar_render    (state: assets_ready)  │
│  6. post_production  (state: video_ready)   │
│  7. publisher        (state: scheduled)     │
└────────┬────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│  External APIs                              │
│  OpenAI · Imagen · HeyGen · IG Graph · TikTok│
└─────────────────────────────────────────────┘
```

## State machine

`content_items.state` advances strictly forward. Each state has exactly one worker that picks it up.

```
                                 ┌──→ script_rejected (loops back to planned)
                                 │
planned ──→ script_drafted ──────┴──→ script_approved ──→ assets_ready
                                                              │
                                                              ▼
                          published ←── scheduled ←── ready_to_publish ←── video_ready ←── video_generating
                                                              ▲                                ▲
                                                              │                                │
                                                       post_production ─────────────────────────┘
```

Failure terminal: `failed`. Operator-cancelled: `cancelled`.

Detailed transitions in [docs/state-machine.md](docs/state-machine.md).

## Why Postgres-as-state, n8n-as-worker

The job spec says "n8n already available" so we use it — but n8n's own workflow state is not a great place to store business state. Workflow JSON gets unwieldy, branching is hard to read, and recovery after a crash is messy.

Splitting it:

- **Postgres** owns the truth: which items exist, what state they're in, what assets they have.
- **n8n** is a set of small workflows that each do one transition: "find items in state X, do work, advance to state Y or mark failed".
- Workers can be retried. Items can be re-queued by setting state back. New worker types can be added without touching old ones.

This pattern scales to multi-campaign trivially: workers just `WHERE state = 'planned'` across all campaigns.

## Autonomy modes

`campaigns.autonomy_mode`:

- `manual` — every state transition requires dashboard approval. Used during initial brand training.
- `hitl` (default) — script approval required, everything else autonomous. Approval surface is dashboard + Slack webhook.
- `auto` — no approvals; system runs end-to-end. Operator monitors via dashboard analytics.

The approval gate is a no-op n8n node: when mode is `auto`, items move from `script_drafted → script_approved` automatically. Same code path, switch is config.

## Dedup strategy

Naive title matching is not enough — "5 ways dentists grow" and "How dentists 10x revenue" are duplicate angles with different words.

On script draft:
1. Generate `topic_embedding` for the item's topic via OpenAI `text-embedding-3-small`.
2. Query last 90 days of items in same `(campaign_id, industry_id, language)` via pgvector cosine distance.
3. If max similarity > 0.85, reject the topic and regenerate (up to 3 attempts).
4. Otherwise accept and proceed.

## Cost expectations (per 28 videos/week)

| Service | Estimate |
|---|---|
| OpenAI (scripts + embeddings) | ~$15/mo |
| Imagen / Gemini (persona portraits) | ~$10/mo |
| HeyGen (avatar video, ~30s × 112/mo) | ~$150–400/mo (tier-dependent) |
| Storage (S3 or Supabase) | ~$5/mo |
| Postgres + n8n (self-hosted on VPS) | ~$20/mo |
| **Total** | **~$200–450/mo** |

This excludes operator time and dashboard hosting (Vercel free tier covers Phase 6).

## Open questions for later phases

- **Brand voice fine-tuning** — current plan is system prompt + few-shot examples. May need a real fine-tune if voice drift is a problem.
- **B-roll sourcing** — Pexels/Pixabay API for free stock, or generate via Veo/Sora when budget allows.
- **Analytics loop** — pull post performance from IG Insights + TikTok Display API, feed back into planner to bias toward high-performing topics.
- **Multi-account per platform** — the schema supports it (`publishing_targets`) but the planner currently picks one account per platform per campaign.
