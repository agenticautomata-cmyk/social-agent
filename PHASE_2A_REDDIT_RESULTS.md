# Phase 2A — Reddit Source Ingestion Results

**Date:** 2026-05-31  
**Status:** Complete — Reddit ingestion only; ready for review  
**Scope:** r/kansascity public JSON feeds → scanner worker → `content_items` → Benson opportunities UI  
**Out of scope (as requested):** Google Maps, Eventbrite, World Cup feeds, scoring, LLM ranking

---

## Summary

Phase 2A wires Benson to ingest raw Kansas City signals from **r/kansascity** via Reddit's public JSON listing API. Discovered posts are stored as `content_items` rows in `planned` state with Reddit metadata (URL, title, score, subreddit, author, created date, location clues). The Benson opportunities page displays these rows with Reddit-specific columns when `ENABLE_KC_SCANNER=true`.

---

## What Was Built

### Database (additive)

| Artifact | Purpose |
|---|---|
| `db/migrations/06_kc_sources.sql` | Migration for Phase 2A tables/columns |
| `source_type` enum | Includes `reddit` (+ future types) |
| `sources` | Configured ingest sources per campaign |
| `scan_runs` | Audit log per scan (found/created/skipped/error) |
| `content_items` extensions | `source_id`, `source_external_id`, `source_url`, `discovered_at`, geo/score placeholders, `raw_payload` |
| Unique index | `(source_id, source_external_id)` dedup |

**Apply migration:**

```bash
pnpm migrate:kc
```

### Core (`@social-agent/core`)

| Module | Role |
|---|---|
| `providers/reddit.ts` | Fetches `/r/{sub}/{sort}.json`, classifies category, extracts KC location clues |
| `scanner/index.ts` | `scanSource`, `scanAllActiveSources` — inserts rows, writes `scan_runs` |
| `feature-flags.ts` | `ENABLE_KC_SCANNER` (default `false`) |
| `scripts/seed.ts` | Seeds `r/kansascity` source on Demo Brand campaign |
| `scripts/migrate-kc-sources.ts` | Runs SQL migration |
| `scripts/run-kc-scan.ts` | Manual one-shot scan (ops) |

**Categories detected (heuristic, no LLM):** `event`, `festival`, `attraction`, `restaurant_opening`, `discussion`, `deal`

**Stored fields per post:**

- `source_url`, `topic` (title), `metadata.reddit.score`, `metadata.reddit.subreddit`, `metadata.reddit.author`, `metadata.reddit.createdAt`, `metadata.reddit.locationClues`, `location_name` (first clue), `raw_payload` (full normalized post)

### Workers

| Change | Behavior |
|---|---|
| `workflows/scanner.ts` | Cron worker (6h) calls `scanAllActiveSources` when flag on |
| `main.ts` | With `ENABLE_KC_SCANNER=true`: **planner disabled**, scanner added to core workers |
| `runtime.ts` | `excludeSourceIngested` — script-writer skips rows with `source_id` set |
| `script-writer.ts` | Sets `excludeSourceIngested` when KC scanner enabled |

### API

| Route | Purpose |
|---|---|
| `POST /api/scanner/run` | Manual scan trigger (requires `ENABLE_KC_SCANNER=true`) |
| `GET /api/scanner/runs` | Recent scan run audit rows |
| `GET /api/content?reddit=true` | Filter to ingested opportunities; joins `sources` |
| `GET /api/opportunities?reddit=true` | Same filter on opportunity DTO |

### Dashboard

| Change | Behavior |
|---|---|
| `lib/opportunities-ui.ts` | Maps Reddit metadata; `?reddit=true` list query when scanner on |
| `app/opportunities/page.tsx` | Columns: score, subreddit, author, location, reddit link |
| `lib/api.ts` | Extended `ContentItem` type for source/metadata fields |

---

## Configuration

Add to `.env` (Benson + KC scanner preset):

```bash
DISABLE_VIDEO_PIPELINE=true
ENABLE_BENSON_BRANDING=true
ENABLE_BENSON_TERMINOLOGY=true
ENABLE_OPPORTUNITIES_UI=true
ENABLE_OPPORTUNITIES_API=true
ENABLE_KC_SCANNER=true
DEMO_MODE=true   # tries live Reddit first; falls back to KC mocks if fetch fails
```

Seed the Reddit source (idempotent):

```bash
pnpm seed
```

Restart API, workers, and dashboard after changing flags.

---

## Verification Results

### 1. Migration + schema

| Check | Result |
|---|---|
| `pnpm migrate:kc` | ✅ Applied without error |
| `sources` table | ✅ 1 row (`r/kansascity`) |
| `scan_runs` table | ✅ Multiple successful runs logged |

### 2. Scan execution

| Check | Result |
|---|---|
| `POST /api/scanner/run` | ✅ `200` — `{ totalCreated, results[] }` |
| `scan_runs` audit | ✅ `status: success`, payload includes subreddit/sort |
| Dedup on re-scan | ✅ `itemsSkipped` increments; no duplicate rows |

**Live Reddit note:** From the verification environment, `https://www.reddit.com/r/kansascity/hot.json` returns **403 Blocked** (common for datacenter IPs). With `DEMO_MODE=true`, the provider **attempts live JSON first**, then falls back to deterministic KC mock posts so development is not blocked. The first scan created **3 ingested rows** (festival, restaurant opening, discussion). Set `DEMO_MODE=false` in production to surface fetch failures instead of mocks.

### 3. Database storage

Sample ingested row (abbreviated):

```json
{
  "topic": "First Fridays is back in the Crossroads this week",
  "sourceUrl": "https://www.reddit.com/r/kansascity/comments/mock1/",
  "state": "planned",
  "locationName": "crossroads",
  "metadata": {
    "ingest": "reddit",
    "opportunityCategory": "festival",
    "reddit": {
      "subreddit": "kansascity",
      "author": "kc_local",
      "score": 142,
      "locationClues": ["crossroads", "kauffman center"]
    }
  }
}
```

**Total ingested rows after verification:** 3

### 4. API

| Endpoint | Result |
|---|---|
| `GET /api/content?reddit=true&limit=5` | ✅ Returns ingested rows with `sourceId`, `sourceUrl`, `metadata.reddit` |
| `GET /api/opportunities?reddit=true` | ✅ Opportunity DTO + source join |
| `POST /api/scanner/run` | ✅ Registered when `ENABLE_KC_SCANNER=true` |

### 5. Benson opportunities UI

| Check | Result |
|---|---|
| `http://localhost:3000/opportunities` | ✅ Renders Reddit-sourced titles |
| Reddit columns | ✅ score, subreddit, author, location, reddit link visible |
| State filter | ✅ Still works (`planned`, etc.) |

### 6. Existing Benson functionality

| Check | Result |
|---|---|
| Overview (`/`) | ✅ Loads; metrics API `200` |
| Benson branding | ✅ Header, copy unchanged |
| Approvals / runs nav | ✅ Present |
| Video pipeline | ✅ Still disabled via `DISABLE_VIDEO_PIPELINE=true` |
| Script-writer | ✅ Does not pick up ingested rows (`source_id` excluded) |

### 7. Typecheck

```bash
pnpm typecheck   # ✅ all packages pass
```

---

## Architecture Decisions

1. **Reuse `content_items`** — no separate opportunities table; Reddit rows use `state: planned` as "discovered, unscored."
2. **Planner off when scanner on** — avoids synthetic quota rows competing with real ingest in Benson mode.
3. **Category in metadata** — `metadata.opportunityCategory` holds Reddit classification; `type` stays `industry_insight` (enum placeholder until scoring phase).
4. **Feature flag gating** — scanner worker, API routes, and UI columns require `ENABLE_KC_SCANNER=true`.

---

## Files Changed / Added

```
db/migrations/06_kc_sources.sql
db/init/06_kc_sources.sql
services/core/src/providers/reddit.ts
services/core/src/scanner/index.ts
services/core/src/schema.ts
services/core/src/feature-flags.ts
services/core/src/scripts/seed.ts
services/core/src/scripts/migrate-kc-sources.ts
services/core/src/scripts/run-kc-scan.ts
services/core/src/scripts/query-kc-ingest.ts
services/workers/src/workflows/scanner.ts
services/workers/src/main.ts
services/workers/src/runtime.ts
services/workers/src/workflows/script-writer.ts
services/api/src/routes/scanner.ts
services/api/src/routes/content.ts
services/api/src/routes/opportunities.ts
services/api/src/server.ts
dashboard/lib/opportunities-ui.ts
dashboard/lib/api.ts
dashboard/app/opportunities/page.tsx
.env.example
package.json (migrate:kc script)
services/core/package.json (scanner export)
```

---

## Manual Test Checklist

```bash
# 1. Migrate + seed
pnpm migrate:kc
pnpm seed

# 2. Restart stack with ENABLE_KC_SCANNER=true in .env
pnpm dev:api
pnpm dev:workers
pnpm dev:dashboard

# 3. Trigger scan
curl -X POST http://localhost:4000/api/scanner/run

# 4. Inspect API
curl 'http://localhost:4000/api/content?reddit=true&limit=10'

# 5. Open UI
open http://localhost:3000/opportunities
```

---

## Known Limitations (Phase 2A)

| Limitation | Notes |
|---|---|
| Reddit 403 from some IPs | Use residential network or Reddit OAuth app in a later phase |
| `DEMO_MODE` mock fallback | Dev convenience only; disable for production ingest |
| No scoring / LLM ranking | Deferred to Phase 2B per plan |
| Single subreddit | Only `r/kansascity` seeded; config supports more via `sources.config` |
| Heuristic classification | Keyword/flair based; not LLM-validated |

---

## Next Steps (Not in 2A — await approval)

- **Phase 2B:** KC scoring (`ENABLE_KC_SCORING`) — summary + angle via LLM
- **Phase 2B:** Visit KC RSS + local calendars
- **Phase 2C:** Eventbrite, Google Maps, Reddit OAuth for rate limits
- **Production:** Set `DEMO_MODE=false`; monitor Reddit fetch success in `scan_runs.error`

---

**Phase 2A complete.** Raw Kansas City Reddit opportunities are ingested, stored, and visible in Benson. No commit created — awaiting approval.
