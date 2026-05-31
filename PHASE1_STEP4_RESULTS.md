# Phase 1 Step 4 Results — ENABLE_OPPORTUNITIES_API

**Date:** 2026-05-31  
**Step:** [TRANSFORMATION_PHASE_1.md](./TRANSFORMATION_PHASE_1.md) Step 4 (Opportunities API)  
**Flag implemented:** `ENABLE_OPPORTUNITIES_API` only  
**Status:** **PASSED**

---

## Summary

Phase 1 Step 4 adds **Benson opportunity API aliases** behind `ENABLE_OPPORTUNITIES_API`. When `false` (default), `/api/opportunities` is not registered. When `true`, list and detail routes return the same underlying `content_items` data with renamed DTO fields.

**No changes** to database schema, workers, approval flow, queue/state machine, or existing endpoints.

---

## Field Mapping (DTO only)

| Legacy (`content_items` / `/api/content`) | Benson (`/api/opportunities`) |
|---|---|
| `topic` | `title` |
| `hook` | `angle` |
| `script` | `summary` |

All other fields (`id`, `campaignId`, `state`, `type`, `language`, timestamps, etc.) pass through unchanged. DB column names unchanged.

---

## API Surface

### `ENABLE_OPPORTUNITIES_API=false` (default)

| Endpoint | Result |
|---|---|
| `GET /api/content` | Unchanged — `{ items: [{ item, industryName, personaName }] }` |
| `GET /api/content/:id` | Unchanged |
| `GET /api/opportunities` | **404** (route not registered) |
| `GET /api/campaigns`, `/api/approvals`, etc. | Unchanged |

### `ENABLE_OPPORTUNITIES_API=true`

| Endpoint | Result |
|---|---|
| `GET /api/opportunities?limit=N&state=&campaignId=` | `{ items: [{ opportunity, industryName, personaName }] }` |
| `GET /api/opportunities/:id` | `{ opportunity, publications }` |
| `GET /api/content` | **Unchanged** — still returns `topic`, `hook`, `script` |

**Restart API** after changing the flag (route registration is at process start).

```bash
ENABLE_OPPORTUNITIES_API=true npx pnpm@10.30.3 dev:api
```

---

## Files Changed

| File | Change |
|---|---|
| `services/core/src/opportunities/types.ts` | **New** — `Opportunity` DTO type |
| `services/core/src/opportunities/mapping.ts` | **New** — `contentItemToOpportunity()` |
| `services/core/src/opportunities/index.ts` | **New** — re-exports |
| `services/core/package.json` | Export `./opportunities` |
| `services/api/src/routes/opportunities.ts` | **New** — list + detail routes |
| `services/api/src/server.ts` | Conditional route registration when flag on |

**Not changed:** workers, DB schema/migrations, approvals handlers, content route, dashboard (still uses `/api/content` until wired in a future step).

---

## Verification Results

### Typecheck

```bash
npx pnpm@10.30.3 typecheck
```

**Result:** PASS — all packages (core, api, workers, dashboard)

### Runtime checks (2026-05-31)

| Check | Flag OFF | Flag ON |
|---|---|---|
| `GET /health` | `{"ok":true}` | `{"ok":true}` |
| `GET /api/content?limit=1` | `topic`, `hook`, `script` present | Same (unchanged) |
| `GET /api/opportunities` | HTTP **404** | HTTP **200** |
| Mapped fields | — | `title`, `angle`, `summary`; no legacy keys |
| Same record ID | — | Matches `/api/content` row |
| `GET /api/opportunities/:id` | — | Returns `opportunity` + `publications` |
| `GET /api/campaigns` | Unchanged | Unchanged |
| `GET /api/approvals` | Unchanged | Unchanged |
| Dashboard `http://localhost:3000` | HTTP **200** | HTTP **200** |
| Workers | Running | Running |

**Mapping equality verified:** `title === topic`, `angle === hook`, `summary === script` for same record.

---

## Flag Interaction

| Combination | Effect |
|---|---|
| API only | `/api/opportunities` available; dashboard still fetches `/api/content` (Step 3 UI mapping) |
| API + UI | Both paths work; future step may wire dashboard to `/api/opportunities` |
| API without scanner alias | `/api/planner/run` unchanged (scanner alias is a separate bundled flag — not implemented in Step 4) |

---

## Rollback

Set in `.env`:

```bash
ENABLE_OPPORTUNITIES_API=false
```

Restart API. `/api/opportunities` returns 404; legacy routes unaffected.

---

## Known Notes

1. **Route registration is conditional** — flag must be set before API process starts.
2. **List wrapper uses `opportunity` key** (not `item`) to distinguish from legacy content responses.
3. **No write endpoints** on `/api/opportunities` — transitions and approvals remain on legacy routes.
4. **Dashboard unchanged in Step 4** — opportunities page still maps `/api/content` client-side; wiring to new endpoint is optional follow-up.

---

## Next Step (awaiting approval)

Per [TRANSFORMATION_PHASE_1.md](./TRANSFORMATION_PHASE_1.md): next flags per simplified rollout (e.g. `DISABLE_VIDEO_PIPELINE`, wire dashboard to `/api/opportunities`, or scanner alias).

Do not proceed until Step 4 is approved.

---

*End of Phase 1 Step 4 results.*
