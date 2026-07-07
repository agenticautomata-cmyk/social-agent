# Phase B: Connect live data — results

Completed: 2026-06-01

## Summary

End-to-end ingestion is working: **57 sources** seeded, **56 scannable sources** refreshed successfully, **415 content items** persisted, and data is visible in opportunities, planner, and sponsor intelligence APIs and dashboard routes.

---

## 1. Seed configured sources

### Commands

```bash
# Before seed
docker compose exec -T postgres psql -U social_agent -d social_agent -t -c "SELECT COUNT(*) FROM sources;"
# → 0

pnpm --filter @social-agent/core seed
# (equivalent: cd services/core && npx pnpm@9 run seed)
```

### Results

| Metric | Count |
|--------|------:|
| Sources in DB before seed | **0** |
| Sources inserted this run | **57** |
| Sources in DB after seed | **57** |
| Active sources | **57** |

Every source line in the seed log was a new insert (`wired … source`); none were skipped as “already exists.” Campaign `Demo Brand`, industries, and publishing targets were also ensured (idempotent).

**Note:** Share Intake is type `manual` — it is seeded for intake workflow but is not scannable by the KC scanner.

---

## 2. Dry-run refresh

### Command

```bash
curl -s -X POST "http://127.0.0.1:4000/api/sources/refresh-all?dry_run=true" \
  -o /tmp/phase-b-dry-run.json --max-time 7200
```

(`ENABLE_KC_SCANNER=true` required; no rows written to `content_items`.)

### Results

| Category | Count |
|----------|------:|
| Sources processed | 57 |
| **Successful** | **56** |
| **Failed** | **1** |
| **Timeout** | **0** |
| **Items discovered** (`itemsFound` sum) | **422** |
| Would-create (dry-run tally) | 422 created, 0 updated |

### Failed source

| Source | Error |
|--------|--------|
| Share Intake | `unsupported source type: manual` |

### Successful sources (56)

All active KC/registry sources completed with `status: success`, including: r/kansascity, Visit KC RSS, Crossroads RSS, Union Station, Kauffman, Sporting KC, KC Parks, KC Library, restaurant/dining, estate sales, openings/closings, charity, revenue-alignment, and shopping-retail sources. (Full per-source table in §4.)

---

## 3. Live refresh

### Command

```bash
curl -s -X POST "http://127.0.0.1:4000/api/sources/refresh-all" \
  -o /tmp/phase-b-live.json --max-time 7200
```

### Results

| Category | Count |
|----------|------:|
| Sources processed | 57 |
| **Successful** | **56** |
| **Failed** | **1** |
| **Timeout** | **0** |
| **Items discovered** | **423** |
| **Persisted created** | **389** |
| **Persisted updated** (freshness touch only) | **34** |
| Skipped | 0 |

### Editorial safety

`persistIngestedContentItem` only **inserts** new rows or **updates** `lastSeenAt`, `sourceLastCheckedAt`, `stale`, and `freshnessBucket` on existing matches — **no editorial fields overwritten**.

### Failed source

Same as dry-run: **Share Intake** (`manual` type).

### Database after live run

| Table | Count |
|-------|------:|
| `content_items` | **415** |
| `source_ingestion_runs` (live) | **57** |
| Live run statuses | 56 `success`, 1 `failed` |

---

## 4. Source health dashboard

From `GET /api/sources` (registry + last ingestion run). Status uses `freshnessStatus`; failed manual source shows `error`.

| Source | Status | Last run (UTC) | Items last run | Error |
|--------|--------|----------------|---------------:|-------|
| Big Slick KC | fresh | 2026-06-01T00:37:05 | 2 | |
| Brown Button Estate Sales | fresh | 2026-06-01T00:36:57 | 11 | |
| CardShows.io KC | fresh | 2026-06-01T00:37:08 | 2 | |
| Casino Hotel Packages | fresh | 2026-06-01T00:37:00 | 3 | |
| Chef Tasting Menus | fresh | 2026-06-01T00:37:01 | 6 | |
| Chiefs Charity Events | fresh | 2026-06-01T00:37:04 | 3 | |
| Children's Mercy Events | fresh | 2026-06-01T00:37:03 | 3 | |
| Collect-A-Con Kansas City | fresh | 2026-06-01T00:37:08 | 1 | |
| Corbin Park Retail | fresh | 2026-06-01T00:37:06 | 2 | |
| Country Club Plaza Retail | fresh | 2026-06-01T00:37:06 | 3 | |
| Crossroads First Fridays | fresh | 2026-06-01T00:36:53 | 4 | |
| Crossroads RSS | fresh | 2026-06-01T00:36:52 | 0 | |
| Crown Center Retail | fresh | 2026-06-01T00:37:06 | 3 | |
| EstateSales.net Kansas City | fresh | 2026-06-01T00:37:01 | 23 | |
| EstateSales.org Kansas City | fresh | 2026-06-01T00:36:58 | 6 | |
| In Kansas City Closings | fresh | 2026-06-01T00:36:58 | 0 | |
| In Kansas City Openings | fresh | 2026-06-01T00:36:57 | 0 | |
| KC Consignment Shops | fresh | 2026-06-01T00:36:59 | 10 | |
| KC Current Charity Events | fresh | 2026-06-01T00:37:04 | 3 | |
| KC Entertainment Charity Events | fresh | 2026-06-01T00:37:06 | 4 | |
| KC Hotel Packages | fresh | 2026-06-01T00:37:00 | 6 | |
| KC Library Events | fresh | 2026-06-01T00:36:53 | 29 | |
| KC Nonprofit Galas | fresh | 2026-06-01T00:37:05 | 5 | |
| KC Parks Events | fresh | 2026-06-01T00:36:53 | 50 | |
| KC Restaurant Week | fresh | 2026-06-01T00:36:52 | 10 | |
| KC Rooftop Bars | fresh | 2026-06-01T00:37:00 | 6 | |
| KC Spa Packages | fresh | 2026-06-01T00:37:00 | 5 | |
| KC Wine Tastings | fresh | 2026-06-01T00:37:00 | 5 | |
| Kauffman Center Events | fresh | 2026-06-01T00:36:52 | 16 | |
| Kauffman Charity Galas | fresh | 2026-06-01T00:37:05 | 2 | |
| Kauffman Date Nights | fresh | 2026-06-01T00:37:02 | 12 | |
| Legends Outlets KC | fresh | 2026-06-01T00:37:07 | 2 | |
| Liquidation Sales KC | fresh | 2026-06-01T00:37:01 | 0 | |
| Made in KC Events | fresh | 2026-06-01T00:37:07 | 2 | |
| Planet Comicon KC | fresh | 2026-06-01T00:37:08 | 2 | |
| Prairiefire Retail | fresh | 2026-06-01T00:37:06 | 2 | |
| River Market Vendors | fresh | 2026-06-01T00:37:07 | 2 | |
| Romantic Restaurant Events | fresh | 2026-06-01T00:37:02 | 2 | |
| Royals Charity Events | fresh | 2026-06-01T00:37:04 | 3 | |
| **Share Intake** | **error** | 2026-06-01T00:37:08 | 0 | unsupported source type: manual |
| Sporting KC Charity Events | fresh | 2026-06-01T00:37:04 | 3 | |
| Sporting KC Schedule | fresh | 2026-06-01T00:37:01 | 20 | |
| Strawberry Swing Markets | fresh | 2026-06-01T00:37:07 | 2 | |
| The Pitch KC Closings | fresh | 2026-06-01T00:36:57 | 8 | |
| The Pitch KC Openings | fresh | 2026-06-01T00:36:55 | 36 | |
| The Pitch KC Sipps | fresh | 2026-06-01T00:36:52 | 10 | |
| Town Center Plaza Retail | fresh | 2026-06-01T00:37:06 | 2 | |
| Union Station Events | fresh | 2026-06-01T00:36:54 | 4 | |
| Visit KC Charity Events | fresh | 2026-06-01T00:37:04 | 5 | |
| Visit KC Luxury Deals | fresh | 2026-06-01T00:36:59 | 1 | |
| Visit KC Luxury Experiences | fresh | 2026-06-01T00:36:59 | 2 | |
| Visit KC Openings | fresh | 2026-06-01T00:36:57 | 4 | |
| Visit KC RSS | fresh | 2026-06-01T00:37:01 | 20 | |
| Visit KC Romantic Weekends | fresh | 2026-06-01T00:36:59 | 1 | |
| West Bottoms Vintage | fresh | 2026-06-01T00:37:07 | 3 | |
| Zona Rosa Retail | fresh | 2026-06-01T00:37:07 | 2 | |
| r/kansascity | fresh | 2026-06-01T00:36:52 | 50 | |

UI: existing **Sources** page (`/sources`) reads this API — no new UI added.

---

## 5. Downstream verification

| Surface | Endpoint / route | Result |
|---------|------------------|--------|
| **Opportunities** | `GET /api/opportunities?limit=200&ingested=true` | **200** — 200 items returned (415 total in DB) |
| **Opportunities UI** | `http://127.0.0.1:3000/opportunities` | **200** |
| **Planner** | `GET /api/content-planner` | **200** — hub loads; boards empty until items are planned (expected) |
| **Planner UI** | `http://127.0.0.1:3000/planner` | **200** |
| **Sponsor intel** | `GET /api/sponsor-intelligence?limit=6` | **200** — `totalEligible: 193`, 5 sections with ranked items |
| **Sponsor intel UI** | `http://127.0.0.1:3000/sponsor-intelligence` | **200** |

---

## 6. Aggregate report

| Metric | Value |
|--------|------:|
| **Total sources** | 57 |
| **Healthy (scannable + last run success)** | 56 |
| **Unhealthy** | 1 (Share Intake — manual, not a feed) |
| **Total content items** | 415 |
| **Sources with ≥1 item** | 52 (5 sources returned 0 items on last run: Crossroads RSS, In KC Closings, In KC Openings, Liquidation Sales KC — runs still succeeded) |

### Top 10 newest content items

| Topic | Source | Discovered (UTC) |
|-------|--------|------------------|
| Planet Comicon Artist Alley — indie vendor retail | Planet Comicon KC | 2026-06-01 00:37:08 |
| Planet Comicon — vendor and exhibitor retail | Planet Comicon KC | 2026-06-01 00:37:08 |
| KC Comic & Card Show — collector retail event | CardShows.io KC | 2026-06-01 00:37:08 |
| Collect-A-Con Kansas City — pop culture collector show | Collect-A-Con Kansas City | 2026-06-01 00:37:08 |
| KC Sports Collectibles Show — CardShows.io listing | CardShows.io KC | 2026-06-01 00:37:08 |
| Made in KC Crossroads — local retail shop | Made in KC Events | 2026-06-01 00:37:07 |
| Made in KC Market — local maker retail event | Made in KC Events | 2026-06-01 00:37:07 |
| Bottoms Up Antiques — West Bottoms warehouse retail | West Bottoms Vintage | 2026-06-01 00:37:07 |
| River Market weekend vendor market | River Market Vendors | 2026-06-01 00:37:07 |
| Good Ju Ju — West Bottoms vintage and antique retail | West Bottoms Vintage | 2026-06-01 00:37:07 |

---

## Commands executed (full list)

```bash
docker compose exec -T postgres psql ... -c "SELECT COUNT(*) FROM sources;"
pnpm --filter @social-agent/core seed
curl -sf http://127.0.0.1:4000/api/sources
curl -X POST "http://127.0.0.1:4000/api/sources/refresh-all?dry_run=true" -o /tmp/phase-b-dry-run.json
curl -X POST "http://127.0.0.1:4000/api/sources/refresh-all" -o /tmp/phase-b-live.json
curl -sf "http://127.0.0.1:4000/api/opportunities?limit=200&ingested=true"
curl -sf "http://127.0.0.1:4000/api/content-planner"
curl -sf "http://127.0.0.1:4000/api/sponsor-intelligence?limit=6"
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/opportunities
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/planner
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/sponsor-intelligence
```

## Files changed

**None** — Phase B used existing seed, ingestion APIs, and UI only.

## Remaining notes

- **Share Intake** will always fail scanner refresh until a dedicated manual-ingest path is used (intake promote flow); this does not block KC feed ingestion.
- **Zero-item sources** on a run are not failures — feeds were reachable but returned no new matches (e.g. Crossroads RSS, some closings feeds).
- Re-run live refresh: `POST /api/sources/refresh-all` — expect mostly `updated` counts, not new `created`, unless external feeds publish new items.
