# Benson Runtime Runbook

**Last updated:** 2026-08-26  
**Authority:** Prefer live probes + this runbook over session reports under `docs/reports/`.

## Status vocabulary

| Status | Meaning |
|---|---|
| CODED | Source exists in git |
| TESTED | Automated tests pass for the feature |
| BUILT | Artifact/build produced (dashboard `.next`, Alexa zip, etc.) |
| DEPLOYED | Running process / fingerprint / edge matches intended source |
| VERIFIED E2E | End-to-end proof on the real client path (Echo, browser, etc.) |

Session reports in `docs/reports/benson-*` are **historical**. Many say “not deployed.” They are not runtime truth.

## Stack ports (this host)

| Service | Port |
|---|---:|
| Dashboard | 3000 |
| API | 4000 |
| Postgres (`social_agent`) | 5433 |
| Voicebox | 17493 |
| n8n | 5678 |
| Redis | 6379 |

## Parity

```bash
pnpm benson:deployment-status   # expect MATCH
pnpm benson:deploy-local        # rebuild dashboard + restart API/workers/dashboard
```

Use **Node ≥20** (repo `.nvmrc`). Node 18 pollutes fingerprint CLI with engine warnings.

## Database migrations 86–87

```bash
pnpm migrate:watch-source-canonical-key-unique
pnpm migrate:calendar-category-snoozes
```

Both are idempotent (`IF NOT EXISTS`). Live DB already had them as of 2026-08-26.

## Alexa path

```
Echo → AWS Lambda (benson-alexa-voice) → https://alexa.kckellie.com/api/benson-voice/*
  → Cloudflare Access (service token) → cloudflared → API :4000
```

Live tunnel ingress (also mirrored in `deploy/cloudflared.config.yml.working-benson`):

- `alexa.kckellie.com` path `^/api/benson-voice(/.*)?$` → `http://localhost:4000`
- other alexa paths → 404
- `benson.kckellie.com` → `:3000`
- `api.kckellie.com` → `:4000`

**Active config file:** `/etc/cloudflared/config.yml` (not the repo backup).

Repo interaction-model draft: `services/alexa/interaction-model/en-US.json` (**CODED**, not Console-verified).

Lambda zip build:

```bash
cd services/alexa && pnpm build && (cd dist && zip -r benson-alexa-voice.zip index.js package.json)
```

## Voice-read local smoke

Requires `BENSON_VOICE_API_KEY` (never print the value).

```bash
curl -sS -H "Authorization: Bearer $BENSON_VOICE_API_KEY" \
  -H "x-benson-request-id: smoke-1" \
  http://127.0.0.1:4000/api/benson-voice/weekend-calendar
```

## Command Center authority

`computeCommandCenter(...).sections.postToday` is the ranking authority.  
Alexa `WhatShouldKelliePostIntent` is a consumer — do not invent a second scorer.

Empty `postToday` can be legitimate when timely candidates fail Today eligibility (e.g. `no_specific_today_reason`).

## Duplicate systems (intentional)

| Pair | Classification |
|---|---|
| Studio Voice `/api/voice` vs Alexa `/api/benson-voice` | intentional separation |
| Ask Benson vs Strategist vs Pulse vs Learning | intentional overlapping advice surfaces |
| n8n vs in-process workers | legacy but still used |
| Multiple rankers | intentional layering; CC owns postToday |
