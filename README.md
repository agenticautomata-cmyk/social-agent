# Social Agent

Self-running AI content agent for short-form social video. Generates testimonial / case-study / explainer / educational videos from a campaign config and publishes them to Instagram and TikTok.

## Status

**Phase 0 — scaffold complete.** No workflows yet. Database schema and orchestration plumbing in place.

| Phase | Status | Description |
|---|---|---|
| 0 — Scaffold | done | repo, docker-compose, Postgres schema, docs |
| 1 — Planner | next | content calendar generation, industry rotation, dedup |
| 2 — Script gen | | OpenAI-driven scripts per content type |
| 3 — Persona + avatar | | Imagen + HeyGen pipeline |
| 4 — Post-production | | subtitles, captions, CTA overlays |
| 5 — Publishing | | Instagram Graph API + TikTok Content Posting API |
| 6 — Dashboard | | Next.js campaign config + queue monitoring |

## Quickstart (local dev)

```bash
cp .env.example .env
# edit .env — set POSTGRES_PASSWORD, OPENAI_API_KEY, HEYGEN_API_KEY, etc.

docker compose up -d
# postgres on :5432, n8n on :5678 (login: admin / value of N8N_PASSWORD)

# verify schema loaded:
docker compose exec postgres psql -U social_agent -d social_agent -c '\dt'
```

## Structure

```
.
├── docker-compose.yml      # Postgres (pgvector) + n8n
├── db/init/                # Auto-loaded on first Postgres boot
│   ├── 00_extensions.sql
│   ├── 01_create_n8n_db.sql
│   └── 02_schema.sql       # Application schema
├── n8n/workflows/          # Exported n8n workflow JSON (Phase 1+)
├── services/               # Long-running helper services (Phase 3+)
├── dashboard/              # Next.js app (Phase 6)
└── docs/
    ├── state-machine.md
    ├── publishing-setup.md
    └── heygen-setup.md
```

## Key design decisions

See [ARCHITECTURE.md](ARCHITECTURE.md) for full reasoning. The short version:

- **State machine in Postgres**, n8n as stateless workers. Every `content_item` advances through fixed states. Workers are idempotent and recoverable.
- **HITL by default** — `campaigns.autonomy_mode = 'hitl'` requires script approval before video generation. Flip to `'auto'` per-campaign once quality stabilizes.
- **Direct API publishing** — Instagram Graph API + TikTok Content Posting API. No third-party publisher tax, but TikTok requires app audit (see [docs/publishing-setup.md](docs/publishing-setup.md)).
- **pgvector for dedup** — topic embeddings stored on `content_items.topic_embedding`. Dedup is cosine-distance against last N items in same campaign+industry+language.
