# Benson Scout Expansion — Architecture Decision Record

**Date:** 2026-07-25  
**Production baseline:** `3a94394` / `release/studio-voice-voicebox-2026-07-25`  
**Host:** 8 CPU, 7.6 GB RAM, ~1.2 GB available (Voicebox + Postgres + API + workers + dashboard)

## Decision summary

Extend the existing **Early Signals** pipeline (`source_watchers`, `source_snapshots`, `early_signals`) rather than creating a parallel opportunity system. Add Scout-specific tables for items, runs, media, documents, sessions, and evidence. Route qualified output through creator relevance, suppression, Skip/Dismiss, Early Signals, Ask Benson, and creator-interest actions.

## Upstream pins

| Project | Pin | Deploy | Reason |
|---------|-----|--------|--------|
| Crawlee | `v3.17.0` / `@crawlee/core@3.17.0` | **Library in workers** | Apache-2.0; HTTP-first crawling |
| Playwright | `v1.61.1` | **Conditional** (max 1 browser) | Apache-2.0; JS pages only |
| agent-browser | `v0.33.0` | **Fallback CLI** | Bounded agent tasks |
| changedetection.io | `0.55.8` | **Rejected (sidecar)** | Native content-hash change detection in Early Signals suffices |
| PaddleOCR | `v3.7.0` | **Rejected co-located** | 4 GB+ RAM; use OpenAI vision OCR queue + optional remote worker |
| Docling-serve | `v1.27.0` | **Rejected co-located** | 4–8 GB/worker; queue jobs, process off-host when enabled |
| Langfuse | `v3.224.1` | **Rejected self-hosted** | SDK/OTEL instrumentation only |
| promptfoo | `0.121.19` | **CI/release gate** | MIT; on-demand eval |
| RSSHub | commit `c0825f01` | **Rejected** | AGPL; marginal vs native RSS adapters |
| Crawl4AI | `v0.9.2` | **Rejected** | Duplicates Crawlee + existing extraction |
| Typesense | `v30.2` | **Rejected** | PostgreSQL search passes acceptance |
| Trigger.dev | `v4.5.7` | **Rejected** | Existing Postgres queue + workers sufficient |

## Fetch ladder

1. Native RSS/Atom/ICS/JSON-LD/static HTML (existing adapters)
2. Native snapshot hash diff (existing)
3. Crawlee + Playwright (bounded concurrency)
4. agent-browser fallback (approved sources only)
5. Media: OpenAI vision OCR (primary on this host) / PaddleOCR when remote
6. Documents: Docling queue (feature-flagged, off-host processor)

## Security

Reuse `discovery-subscriptions/safe-fetch` SSRF protections for all Scout URL fetches. No credentials in DB. Browser sessions stored as encrypted filesystem refs outside git.

## Rollback

```bash
git checkout release/studio-voice-voicebox-2026-07-25
pnpm migrate:pre-alpha  # migration 72 is additive; optional DROP in 72 rollback section
./scripts/pre-alpha-start-prod.sh
```
