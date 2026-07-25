# Benson Scout Expansion — Release Report

**Deployed:** 2026-07-25 (America/Chicago)  
**Branch:** `release/scout-expansion-2026-07-25`  
**Previous release:** `release/studio-voice-voicebox-2026-07-25` @ `3a94394`  
**Migration:** `72_benson_scout_expansion.sql`  
**Backup:** `data/backups/pre-scout-expansion-20260725-154533.dump`

## Rollback

```bash
git checkout release/studio-voice-voicebox-2026-07-25
./scripts/pre-alpha-start-prod.sh
# Migration 72 is additive; optional manual DROP in migration file rollback section
```

## Upstream decisions (see docs/scout-expansion-adr.md)

| Project | Pin | Deployed |
|---------|-----|----------|
| Crawlee | v3.17.0 | Library path (workers) |
| Playwright | v1.61.1 | Conditional, max 1 browser |
| agent-browser | v0.33.0 | Fallback CLI |
| promptfoo | 0.121.19 | **9/9 passed** |
| changedetection.io | — | Rejected — native hash diff |
| PaddleOCR | — | Rejected co-located — OpenAI vision queue |
| Docling-serve | — | Rejected co-located — off-host queue |
| Langfuse self-host | — | Rejected — SDK path only |
| RSSHub, Crawl4AI, Typesense, Trigger.dev | — | Rejected per ADR |

## Services

- Scout watchlist API: **running** (`/api/watchlist`, `/api/scout/admin/health`)
- Early Signals pipeline: **extended** with optional `watcherIds` filter + scout_items bridge
- OCR: OpenAI vision queue stub (`SCOUT_OCR_REMOTE_URL` for PaddleOCR)
- Docling: queue stub (`SCOUT_DOCLING_URL`)
- Crawlee/Playwright worker: **not co-located** on 7.6 GB host (ADR)

## Pilot sources

- Researched catalog: 14 active KC sources (permits, RSS, HTML watches)
- Seeded: 14 updated with Scout metadata, 2 disabled (rejected URLs)
- Social Instagram monitoring: **LOGIN_REQUIRED** until user reauthorizes session

## KC sidewalk-sale scenario

- Instagram post URL inspect: **pass** (offers SINGLE_ITEM vs WATCH_ACCOUNT)
- Live Instagram account monitoring: **not validated** — login required
- Fallback: public HTML/RSS pilot sources validated via Early Signals adapters

## Routes validated (localhost)

| Route | Status |
|-------|--------|
| `/api/watchlist` | 200 |
| `/api/scout/admin/health` | 200 |
| `/watchlist` | 200 |
| `/watchlist/add` | 200 |
| `/admin/scout/health` | 200 |
| `/api/early-signals` | 200 |

## Restart

- First restart: dashboard build + prod boot
- Second restart: `./scripts/restart-api.sh` — watchlist recovered (200)

## Known limitations

- Instagram/Facebook/TikTok account watching requires authorized session
- Docling and PaddleOCR not co-located on this server
- Crawlee browser worker deferred to off-peak / future worker slot
- Calendar suggestions feature-flagged until Calendar API stable
