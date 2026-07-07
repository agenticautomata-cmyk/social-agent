# TikTok analytics runtime fix — results

Completed: 2026-06-01

## Root cause

**Stale / incompatible `.next` cache from mixing production build and dev server** — not a missing dependency or broken TikTok feature code.

1. **`pnpm build:pwa`** runs `next build`, which writes production artifacts under `dashboard/.next` (including `BUILD_ID`).
2. **Pre-alpha** runs **`next dev`**, which uses a different layout under `.next/server/vendor-chunks/`.
3. After branding work, a production build ran while **dev was still active** (or dev restarted without clearing `.next`). Dev-compiled server bundles (e.g. `app/analytics/tiktok/page.js`) listed webpack vendor chunks including **`zod@3.25.76`**, but the on-disk `vendor-chunks/` directory only contained `next` and `@swc/helpers` — **no `zod@3.25.76.js`** → runtime `ENOENT` on every RSC page that imports feature flags.

### Import chain (why zod appears)

| File | Imports |
|------|---------|
| `app/analytics/tiktok/page.tsx` | `isOpportunitiesUiEnabled` from `lib/opportunities-ui.ts` |
| `lib/opportunities-ui.ts` | `feature-flags.server.ts` |
| `lib/feature-flags.server.ts` | `@social-agent/core/feature-flags.schema` |
| `feature-flags.schema.ts` | `zod` |

Same pattern affects other gated pages (analytics hub, sponsor-intelligence, etc.).

### Contributing factors

- **Orphan `next dev` process** (from an earlier manual `npx pnpm dev:dashboard`) not stopped by `pre-alpha:stop` when its PID was not in `.logs/pre-alpha/dashboard.pid`.
- **No clean `.next` wipe** between `build:pwa` and `pre-alpha:start`.

## Fix applied

### Operational (primary)

1. Stopped API/dashboard (`scripts/pre-alpha-stop.sh`) and killed stray Next processes.
2. **`rm -rf dashboard/.next`**
3. Restarted stack with **`scripts/pre-alpha-start.sh`** (fresh `next dev` compile).
4. Dev then emitted **`dashboard/.next/server/vendor-chunks/zod@3.25.76.js`** (~443 KB) and all affected routes returned **HTTP 200**.

No application or API code changes were required for correctness.

### Preventive (script)

**`scripts/pre-alpha-start.sh`** — before starting `next dev`, if `dashboard/.next/BUILD_ID` exists (production build marker), remove `.next` and warn. This avoids restarting dev on top of a production cache after `pnpm build:pwa`.

## Commands executed

```bash
bash scripts/pre-alpha-stop.sh
pkill -f "next dev -p 3000"   # stray processes when needed
rm -rf dashboard/.next
bash scripts/pre-alpha-start.sh

# Verification
curl -sI http://127.0.0.1:3000/
curl -sI http://127.0.0.1:3000/analytics
curl -sI http://127.0.0.1:3000/analytics/tiktok
curl -sI http://127.0.0.1:3000/manifest.webmanifest
ls dashboard/.next/server/vendor-chunks/zod@3.25.76.js
```

(`npx pnpm@9 run build` in `dashboard/` was used once to confirm production build succeeds; **do not run `build:pwa` while `next dev` is serving** without `pre-alpha:stop` and clearing `.next` first.)

## Files changed

| File | Change |
|------|--------|
| `scripts/pre-alpha-start.sh` | Clear `.next` when `BUILD_ID` present before starting dev |
| `TIKTOK_ANALYTICS_RUNTIME_FIX_RESULTS.md` | This report |

No dashboard routes, backend, Cloudflare, or TikTok logic changed.

## Verification results

| Check | Result |
|-------|--------|
| `GET /` | **200** — title `Benson`, logo in header |
| `GET /analytics` | **200** |
| `GET /analytics/tiktok` | **200** — no ENOENT |
| `vendor-chunks/zod@3.25.76.js` | **Present** after clean dev compile |
| `/manifest.webmanifest` | **200** — `"name": "Benson"` |
| Dashboard log | No `ENOENT` / missing zod chunk after clean restart |

## Recommended workflow

After **`pnpm build:pwa`** (production PWA/asset check):

```bash
pnpm pre-alpha:stop
rm -rf dashboard/.next
pnpm pre-alpha:start
```

Or rely on the updated `pre-alpha:start` to clear `.next` when it detects a production `BUILD_ID` (dashboard must not already be running on a corrupt cache — stop first).

## Remaining issues

None for this incident. If ENOENT returns after a production build, stop dev, delete `.next`, and restart pre-alpha.
