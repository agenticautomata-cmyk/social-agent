# Calendar GET latency: serve durable rows first

**Repo:** `/home/elliott/Projects/kellie-assistant/social-agent`  
**Date:** 2026-08-14  
**Operator timezone:** America/Chicago  
**Live fingerprint:** `6a0efe28623d4bf3` (API / dashboard / workers **MATCH**)  
**Window measured:** dashboard-equivalent `now−1d` → `now+60d`, `includeCompleted=false`  
**Populated size:** 425–427 active Calendar views (~480 `creator_calendar_items` rows in window)

## One-sentence outcome

Normal Calendar reads now return durable `creator_calendar_items` immediately. Window projection still runs, but at most once per ~90s, in the background, behind a single-flight, instead of blocking every `GET /api/calendar/items`.

## What was not changed

Eligibility, projection upsert semantics, candidate dedupe, verification, Calendar actions, Weekend List, Watchlist, Discover, and Calendar UI were left alone. No Redis, no worker, no response-body cache.

---

## 1. Profile (before behavior change)

Measured in-process against the live local DB (same queries the API uses), then confirmed with HTTP to `:4000`.

### HTTP (old path: await full projection on every GET)

| Request | Items | Server+network latency | API RSS |
|---|---:|---:|---:|
| Representative GET | 425 | **24 077 ms** | 2 702 816 KB (~2.58 GiB) |

### In-process span breakdown (one full `listCalendarItems`)

Wall **21 027 ms**. Projection **18 538 ms** (88%). Durable row read after that is not the problem.

| Span | ms | Notes |
|---|---:|---|
| **ensureCalendarInventoryProjections (total)** | **18 538** | Dominant |
| content_items SQL load | 334 | |
| content_items normalize | 514 | |
| skip-id load | 1 055 | |
| inventory eligibility | 1 132 | 420 candidates |
| curator_event_leads SQL load | 859 | |
| curator eligibility | 291 | 74 candidates |
| existing window row load (inside projection) | 1 194 | |
| eligibility/dedupe merge | 1 285 | |
| dismissed fingerprint lookup | 160 | |
| **DB upserts** | **13 899** | **Dominant cost** — 415 create/update/preserve |
| creator_calendar_items read (list query) | 81 | |
| sync map | 74 | |
| selection overlay (Weekend board + map) | 1 095 | Unchanged by this fix |
| category enrich | 45 | |
| display/dedupe shaping | 1 160 | Unchanged by this fix |
| snooze filter | 29 | |
| returned views | 425 | |

**Conclusion (not a guess):** the 15s single-flight only collapsed *concurrent* duplicate projection. Every isolated GET still waited on ~14s of upserts. Serving durable rows first is the correct fix. Caching the HTTP JSON was not necessary.

---

## 2. Behavior after

```
GET /api/calendar/items
→ load creator_calendar_items for the window
→ if window never projected AND zero durable rows: await one projection, reload
→ else if window freshness cache is stale: return rows now; schedule one background reconcile
→ else: skip projection
→ selection overlay → display gate → dedupe → snooze filter → return
```

### Freshness cache

| Setting | Value | Why |
|---|---|---|
| Key | Chicago calendar days `from\|to` via `getLocalCalendarDay` | Tiny ISO differences from the dashboard (`now-1d` / `now+60d`) collapse to one entry |
| TTL | **90 seconds** | Projection itself is ~18s. 60s would re-enter while a slow reconcile can still be running; 120s delays new discoveries more than needed. 90s is ~5× the measured reconcile with margin. |
| Background start delay | **750 ms** | Lets the serving GET (and an immediate reload) finish before upserts contend for the same Postgres pool. |
| Bound | **48 windows** | LRU eviction; restart may drop the map (acceptable). |
| Storage | In-process `Map` only | Not a response cache. `creator_calendar_items` remains authority. |

Single-flight is the in-flight `Promise` per window key. Concurrent stale readers join it; they do not start a second reconcile.

Mutations (select / dismiss / weekend list / category sleep-wake) write durable rows or list-time filters. The next GET reads those rows, so no response cache can hide them. `markCalendarProjectionStale()` exists if an ingestion path later wants a cheap invalidate; nothing else was wired.

New date-bearing discoveries may take up to TTL + delay (~91s) to appear through an ordinary read. That is the accepted trade.

---

## 3. After timings

### HTTP to local API (production-like, populated window)

| Case | Items | Latency | Projection on that request? |
|---|---:|---:|---|
| **Before** representative GET | 425 | **24 077 ms** | Yes, blocking |
| After **cold** (API just restarted, rows already in DB) | 426 | **3 811 ms** | No (background scheduled) |
| After **warm** (immediate second) | 426 | **3 533 ms** | No |
| After **x10** | 426 each | 1 963–5 968 ms, **median ~2 605 ms** | **0 extra reconciles** during the 10 |
| After **two concurrent** | 427 / 427 | **4 684 ms** wall | Join existing single-flight |

Cold GET is ~**6.3×** faster than the old blocking path. Repeated loads do not rerun full projection. Item counts stayed in 426–427 (same populated Calendar, plus at most one newly projected row appearing after refresh).

### In-process (same process, cache reset = restart)

| Case | ms | `projectionRan` |
|---|---:|---|
| Cold populated window | 3 124 | false |
| Executions 20ms later | 1 background start | — |
| x10 | median ~2 598 | **0 executions** |
| Stale + 2 concurrent | 3 496 wall | still **1** total execution |

Dismiss of a suggested row was visible on the next list in the same process (`dismissImmediate: true`). Restored afterward.

### Remaining latency (not faked, not in scope)

After projection is off the read path, the leftover ~2–3s is **selection overlay + display/dedupe shaping** over ~480 rows (`selectionOverlayMs` ~1.1s, `displayDedupeMs` ~1.2–1.5s). The durable SQL read is ~80–300ms. This task did not change those steps.

Sub-second interactive GET would require a later pass on overlay/dedupe, not more projection caching.

---

## 4. Regression checklist

1. First/cold request (populated DB, empty cache) returns existing suggestions — **pass** (426 items, 3.8s HTTP).
2. Immediate second request is materially faster than 24s — **pass** (3.5s HTTP).
3. Repeated page loads do not rerun full projection — **pass** (x10 executions = 0).
4. Stale window triggers exactly one refresh behind concurrent readers — **pass** (single-flight; concurrent HTTP both 427).
5. Existing suggestions remain visible while refresh runs — **pass**.
6. Newly projected event appears after refresh — **pass** (425 → 426/427 without deleting rows).
7. Dismiss/select remain immediately visible — **pass** (durable row update; list omits dismissed).
8. No duplicate projection rows from the read-path change — **pass** (same idempotency upserts, just deferred).
9. Calendar contents match pre-fix populated set — **pass** (425 vs 426–427, overlap 423+; no eligibility/UI change).

---

## 5. Resource / cache

| Metric | Before | After |
|---|---:|---:|
| Peak API RSS observed | 2 702 816 KB (~2.58 GiB) on the blocking GET | **875 536 KB (~855 MiB)** after cold+x10+concurrent |
| Cache size during test | n/a | **1** window (max 48) |
| TTL | n/a (15s single-flight only) | **90s** |

---

## 6. Deploy

- API + workers restarted onto this source (tsx). Dashboard UI unchanged; process remained healthy on `:3000`.
- Health: API `ok`, dashboard HTTP 200.
- Fingerprints **MATCH** `6a0efe28623d4bf3`.

STOP.
