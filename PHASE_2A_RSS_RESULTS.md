# Phase 2A — RSS Mode Results

**Date:** 2026-05-31  
**Status:** Complete — production ingest via r/kansascity RSS  
**Scope:** Replace blocked JSON + mock fallback with live Atom/RSS feed  
**Out of scope (as requested):** OAuth, scoring, LLM ranking

---

## Summary

Phase 2A now ingests **live r/kansascity posts via RSS** (`/r/kansascity/hot.rss`). Mock KC data and JSON fetch paths are removed. Fifty real posts were ingested and appear on the Benson opportunities page with title, subreddit, publication date, location clues, and source URL.

---

## What Changed

### Provider (`services/core/src/providers/reddit.ts`)

| Before | After |
|---|---|
| `…/hot.json` (403 blocked) | `…/hot.rss` (200 live) |
| `fetchMockRedditPosts()` fallback in `DEMO_MODE` | **Removed** — no mocks |
| Score/flair/comment filters | Title blocklist only (RSS has no score/flair) |

**RSS URL pattern:**

```
https://www.reddit.com/r/kansascity/hot.rss?limit=50
```

**Stored per post (`content_items` + `metadata.reddit`):**

| Field | Storage |
|---|---|
| URL | `source_url`, `metadata.reddit.url` |
| Title | `topic` |
| Publication date | `metadata.reddit.publishedAt` |
| Subreddit | `hook` (`r/kansascity`), `metadata.reddit.subreddit` |
| Location clues | `location_name`, `metadata.reddit.locationClues` |

`metadata.ingest` is now `reddit_rss` (was `reddit` for JSON/mock).

### Scanner (`services/core/src/scanner/index.ts`)

- Calls `loadRedditPosts()` with no `DEMO_MODE` branch
- `scan_runs.payload` includes `{ format: 'rss', subreddit, sort }`

### Seed (`services/core/src/scripts/seed.ts`)

- Source config updated to `{ format: 'rss', subreddit: 'kansascity', sort: 'hot', limit: 50 }`
- Existing source row upserted to RSS config on re-seed

### Dashboard

- Opportunities subtitle: `// live r/kansascity rss — no scoring yet`
- Removed score and author columns (not available from RSS)
- Posted date uses `metadata.reddit.publishedAt`

### Ops scripts

| Script | Purpose |
|---|---|
| `pnpm --filter @social-agent/core purge:mock-reddit` | Delete mock + legacy JSON ingest rows |
| `pnpm --filter @social-agent/core seed` | Upsert RSS source config |
| `npx tsx src/scripts/run-kc-scan.ts` | Manual scan trigger |

---

## Verification Results

### 1. Mock data removed

```bash
pnpm --filter @social-agent/core purge:mock-reddit
```

Removed 3 legacy mock rows:

- First Fridays is back in the Crossroads this week
- New coffee shop soft opening on Main St in Brookside
- What are you doing in KC this weekend?

**Post-purge API check:** `legacy reddit json/mock ingest: 0`

### 2. Live RSS scan

```bash
npx tsx src/scripts/run-kc-scan.ts
```

| Metric | Result |
|---|---|
| `itemsFound` | 50 |
| `itemsCreated` | 50 (first scan after purge; subsequent scans dedup) |
| `scan_runs.status` | `success` |
| `scan_runs.payload.format` | `rss` |

### 3. Database / API

```bash
curl 'http://localhost:4000/api/content?reddit=true&limit=200'
```

| Check | Result |
|---|---|
| Total ingested rows | **50** |
| `metadata.ingest = reddit_rss` | **50** |
| Mock `source_external_id` (`mock_*`) | **0** |
| Sample live titles | Sunroom skylight replacement; Missouri governor income tax plan; Red Lobster closes 2 KC locations |

Sample row (abbreviated):

```json
{
  "topic": "Red Lobster permanently closes 2 Kansas City area locations",
  "sourceUrl": "https://www.reddit.com/r/kansascity/comments/1tsebuc/...",
  "metadata": {
    "ingest": "reddit_rss",
    "opportunityCategory": "discussion",
    "reddit": {
      "subreddit": "kansascity",
      "publishedAt": "2026-05-30T23:04:35.000Z",
      "locationClues": ["kansas city"],
      "url": "https://www.reddit.com/r/kansascity/comments/1tsebuc/..."
    }
  }
}
```

### 4. Opportunities UI

`http://localhost:3000/opportunities`

| Check | Result |
|---|---|
| Live KC post titles visible | ✅ (e.g. red lobster, liberty memorial) |
| Subreddit column | ✅ `r/kansascity` |
| Mock titles absent | ✅ no "first fridays" mock, no `/comments/mock` URLs |
| RSS subtitle | ✅ `live r/kansascity rss` |

### 5. Benson unchanged

| Check | Result |
|---|---|
| `GET /health` | ✅ 200 |
| `GET /api/metrics/overview` | ✅ 200 |
| Overview page | ✅ loads |
| Video pipeline | ✅ still disabled |
| Typecheck | ✅ all packages pass |

---

## Why RSS

Per [REDDIT_403_ANALYSIS.md](./REDDIT_403_ANALYSIS.md), anonymous JSON endpoints return **403 Blocked** from this host. RSS/Atom feeds return **200** with live post data and require no OAuth — lowest-complexity production path for Phase 2A.

---

## Manual Retest

```bash
pnpm --filter @social-agent/core purge:mock-reddit   # optional cleanup
pnpm seed
curl -X POST http://localhost:4000/api/scanner/run
curl 'http://localhost:4000/api/content?reddit=true&limit=10'
open http://localhost:3000/opportunities
```

---

## Known Limitations

| Limitation | Notes |
|---|---|
| No score / comment count | RSS does not expose these fields |
| No link flair | Category inferred from title/body keywords only |
| Feed size cap | Reddit RSS `limit` max ~100 per request |
| Feed availability | Reddit could restrict RSS in future; OAuth remains fallback path |

---

## Files Changed

```
services/core/src/providers/reddit.ts          — RSS parser; mocks removed
services/core/src/scanner/index.ts             — RSS metadata; no DEMO_MODE
services/core/src/scripts/seed.ts              — RSS source config
services/core/src/scripts/purge-mock-reddit.ts — mock cleanup (new)
services/core/package.json                     — purge:mock-reddit script
dashboard/lib/opportunities-ui.ts              — RSS fields; no score/author
dashboard/app/opportunities/page.tsx           — RSS columns
```

---

**Phase 2A RSS mode complete.** Live Kansas City posts ingest via RSS and display in Benson. No commit created — awaiting approval.
