# Inventory Review UI — Runtime Fix Results

**Date:** 2026-05-31  
**Issue:** `/review/inventory` crashed in browser with `(0, url.fileURLToPath) is not a function`

## Root Cause

Client component import chain pulled Node-only code into the browser bundle:

```
inventory-review-panel.tsx (client)
  → StatePill
    → terminology.ts
      → @social-agent/core/feature-flags.ts
        → fileURLToPath, path, dotenv
```

## Fix

Separated server-side flag loading from browser-safe flag access.

### Core (`@social-agent/core`)

| File | Change |
|------|--------|
| `services/core/src/feature-flags.schema.ts` | **New** — Zod schema + `parseFeatureFlagsFromEnv()` with no Node imports |
| `services/core/src/feature-flags.ts` | Refactored to use schema + dotenv (server-only, unchanged behavior for API/workers) |
| `services/core/package.json` | Added `"./feature-flags.schema"` export |

### Dashboard

| File | Change |
|------|--------|
| `dashboard/lib/feature-flags.server.ts` | **New** — `server-only`; parses flags from `process.env` via schema (no core/feature-flags.ts import) |
| `dashboard/lib/feature-flags.browser.ts` | **New** — client-safe flags from `NEXT_PUBLIC_*` env vars |
| `dashboard/lib/terminology.shared.ts` | **New** — shared terminology data/helpers, no flag imports |
| `dashboard/lib/terminology.ts` | Server-only wrapper using `feature-flags.server` |
| `dashboard/lib/terminology.browser.ts` | **New** — client-safe `displayState` / `displayFilterLabel` |
| `dashboard/components/state-pill.tsx` | Imports from `terminology.browser` instead of `terminology` |
| `dashboard/lib/branding.ts` | Uses `feature-flags.server` + `server-only` |
| `dashboard/lib/opportunities-ui.ts` | Uses `feature-flags.server` + `server-only` |
| `dashboard/next.config.mjs` | Mirrors `ENABLE_*` → `NEXT_PUBLIC_*` for client bundles |

### Unchanged

- Ingestion providers, DB schema, scoring, ranking
- `/review/inventory` page and inventory API
- Share Intake
- Server-side flag behavior for API/workers (still uses dotenv via core `feature-flags.ts`)

## Architecture

```
Server components (layout, pages)
  → feature-flags.server.ts → feature-flags.schema.ts
  → terminology.ts → terminology.shared.ts

Client components (StatePill, inventory panel)
  → feature-flags.browser.ts → feature-flags.schema.ts
  → terminology.browser.ts → terminology.shared.ts

API / workers
  → feature-flags.ts (dotenv + schema) — unchanged
```

## Verification

| Check | Result |
|-------|--------|
| `/review/inventory` loads (HTTP 200) | ✅ |
| `/opportunities` loads (HTTP 200) | ✅ |
| `/intake` loads (HTTP 200) | ✅ |
| `GET /health` API | ✅ `{"ok":true}` |
| `pnpm typecheck` (core, api, dashboard, workers) | ✅ |
| `fileURLToPath` in dashboard `.next` client chunks | ✅ Not found |
| Node-only `feature-flags.ts` in client bundle | ✅ Not imported by client path |

## Notes

- Client flags read `NEXT_PUBLIC_*` values mirrored from `ENABLE_*` in `next.config.mjs` at build/dev start — restart dashboard after flag changes.
- `server-only` guards on `feature-flags.server.ts`, `terminology.ts`, `branding.ts`, and `opportunities-ui.ts` prevent accidental client imports of server modules.
