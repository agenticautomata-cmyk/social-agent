# Phase 1 Step 1 Results — ENABLE_BENSON_BRANDING

**Date:** 2026-05-31  
**Step:** [TRANSFORMATION_PHASE_1.md](./TRANSFORMATION_PHASE_1.md) Step 1 + Step 5 (branding only)  
**Flag implemented:** `ENABLE_BENSON_BRANDING` only  
**Status:** **PASSED**

---

## Summary

Phase 1 Step 1 introduces the centralized feature-flag module and wires **only** `ENABLE_BENSON_BRANDING` to dashboard branding. All other Benson flags are defined (default `false`) but have no behavioral effect yet.

When `ENABLE_BENSON_BRANDING=false` (default), the application matches inherited social-agent branding. When `true`, users see Benson header, metadata, footer, and overview greeting copy.

---

## Files Changed

| File | Change |
|---|---|
| `services/core/src/feature-flags.ts` | **New** — parses all 8 Phase 1 flags; defaults `false` |
| `services/core/src/env.ts` | Re-exports `featureFlags` |
| `services/core/package.json` | Export `./feature-flags` subpath |
| `dashboard/lib/branding.ts` | **New** — legacy vs Benson copy bundles |
| `dashboard/app/layout.tsx` | Dynamic metadata, header, footer via flag |
| `dashboard/app/page.tsx` | Overview greeting/subline via flag |
| `dashboard/package.json` | Workspace dep `@social-agent/core` |
| `dashboard/next.config.mjs` | `transpilePackages: ['@social-agent/core']` |
| `.env.example` | Documented all Phase 1 flags (commented, default false) |

**Not changed:** API, workers, database, routing, queue, approvals terminology, nav structure.

---

## Feature Flag Architecture

Canonical parser: `services/core/src/feature-flags.ts`

| Flag | Default | Step 1 behavior |
|---|---|---|
| `ENABLE_BENSON_BRANDING` | `false` | **Active** — controls dashboard branding |
| `DISABLE_VIDEO_PIPELINE` | `false` | Parsed only; no effect |
| `ENABLE_OPPORTUNITIES_API` | `false` | Parsed only; no effect |
| `ENABLE_OPPORTUNITIES_UI` | `false` | Parsed only; no effect |
| `ENABLE_BENSON_TERMINOLOGY` | `false` | Parsed only; no effect |
| `ENABLE_WORKER_LABEL_ALIASES` | `false` | Parsed only; no effect |
| `ENABLE_BENSON_SEED_NAMES` | `false` | Parsed only; no effect |
| `ENABLE_BENSON_DEMO_SCRIPT` | `false` | Parsed only; no effect |

---

## Branding When `ENABLE_BENSON_BRANDING=true`

| Surface | Benson copy |
|---|---|
| Header link | `Benson` |
| Page title | `Benson · Kansas City content opportunity assistant` |
| Meta description | Benson watches KC; Kellie reviews |
| Footer left | `$ pnpm dev:all  ·  Benson  ·  127.0.0.1:3000` |
| Footer link | `Kellie Assistant` |
| Overview greeting | `// Good morning, Kellie.` |
| Overview subline | `Benson watches Kansas City — pipeline health at a glance.` |

Nav, campaigns table, queue, approvals, and API data unchanged.

---

## Verification Results

### Typecheck

```bash
npx pnpm@10.30.3 typecheck
```

**Result:** PASS — all packages (`core`, `api`, `workers`, `dashboard`)

### `ENABLE_BENSON_BRANDING=false` (default)

| Check | Result |
|---|---|
| Dashboard `/` HTTP 200 | PASS |
| Header text | `social-agent` |
| Overview greeting | `// pipeline health across all campaigns` |
| API `GET /health` | `{"ok":true}` |
| Workers | 11 workers (restarted after `env.ts` export; no gating) |
| Routes `/campaigns`, `/queue`, `/approvals`, `/runs` | All HTTP 200 |

### `ENABLE_BENSON_BRANDING=true`

| Check | Result |
|---|---|
| Dashboard `/` HTTP 200 | PASS |
| Header text | `Benson` |
| Page title | `Benson · Kansas City content opportunity assistant` |
| Overview greeting | `// Good morning, Kellie.` |
| Overview subline | Benson KC copy present |
| Footer | Benson + Kellie Assistant |
| API `GET /health` | `{"ok":true}` (unchanged) |
| Nav unchanged | `[overview] [campaigns] [queue] [approvals] [runs]` |

**Test command used:**

```bash
ENABLE_BENSON_BRANDING=true npx pnpm@10.30.3 dev:dashboard
```

---

## Rollback

Set in `.env`:

```bash
ENABLE_BENSON_BRANDING=false
```

Restart dashboard (`pnpm dev:dashboard`). No code revert required.

---

## Known Notes

1. **Dashboard restart required** after changing `ENABLE_BENSON_BRANDING` — flags read at process startup via `@social-agent/core/feature-flags`.
2. **Workers restarted** once when `env.ts` gained the re-export; behavior unchanged (still 11 workers).
3. **Next.js lockfile warning** persists (parent `kellie-assistant/pnpm-lock.yaml` vs `social-agent/pnpm-lock.yaml`) — pre-existing, unrelated to Step 1.
4. **Overview greeting** is gated by `ENABLE_BENSON_BRANDING` for Step 1 scope; future `ENABLE_BENSON_TERMINOLOGY` may absorb additional copy without changing this flag’s header/footer/metadata bundle.

---

## Next Step (awaiting approval)

**Step 2** per [TRANSFORMATION_PHASE_1.md](./TRANSFORMATION_PHASE_1.md): opportunities mapping module (`ENABLE_OPPORTUNITY_DTO` / `ENABLE_OPPORTUNITIES_API` in [FEATURE_FLAGS_SIMPLIFIED.md](./FEATURE_FLAGS_SIMPLIFIED.md)).

Do not proceed until Step 1 is approved.

---

*End of Phase 1 Step 1 results.*
