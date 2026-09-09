# Benson KC Contact Intelligence — CTA / Opportunities UI gate fix

**Date:** 2026-09-09  
**Unblocks:** `BENSON_KANSAS_CITY_CONTACT_INTELLIGENCE_VERIFICATION_2026-09-09.md` item 1 (brief → pitch / form path)  
**Fingerprint before:** `705df6daa09fec51` (MATCH, but CTA routes prerendered 404)  
**Fingerprint after:** `ef4447b294c321dd` (MATCH)

---

## Root cause

`/outreach/compose`, `/email/form-packets`, and `/email/approvals` call `notFound()` when `isOpportunitiesUiEnabled` is false.

That flag comes from `parseFeatureFlagsFromEnv(process.env)` (`dashboard/lib/feature-flags.server.ts` → `opportunities-ui.ts`). Next only auto-loads `dashboard/.env*`. The monorepo `ENABLE_OPPORTUNITIES_UI=true` lives in the **repo-root** `.env`.

At the last MATCH deploy:

| Layer | `ENABLE_OPPORTUNITIES_UI` | Effect |
|-------|---------------------------|--------|
| Runtime process (`next start`) | `true` | Would render pages if re-executed |
| `next build` / static prerender | effectively unset → false | Pages baked as `404` with `x-nextjs-prerender: 1` |
| `next.config.mjs` `env` mirrors | `?? 'false'` | Client `NEXT_PUBLIC_*` also `"false"` |

So contact briefs correctly linked to compose / form-packets, but production/mobile hit **cached static 404 HTML** despite runtime env being true. Hub + brief were ungated and stayed 200.

Send-safety / Eventbrite watchlist code paths were not involved.

---

## Fix (smallest safe)

1. **`dashboard/next.config.mjs`** — load repo-root `.env` / `.env.local` (then dashboard overrides) before mirroring `NEXT_PUBLIC_ENABLE_OPPORTUNITIES_UI`, so builds see the real flag.
2. **`scripts/benson-runtime-lib.sh`** — before dashboard production build, re-load env if needed and **fail the build** if `ENABLE_OPPORTUNITIES_UI` is not `true`/`1` (prevents silent prerender-404 regressions).
3. **`export const dynamic = 'force-dynamic'`** on:
   - `dashboard/app/outreach/compose/page.tsx`
   - `dashboard/app/email/form-packets/page.tsx`
   - `dashboard/app/email/approvals/page.tsx`  
   so these CTA surfaces cannot bake a permanent `notFound()` even if a future build misses the flag.
4. **Dismiss claim** — documented only (cheap): primary closeout now says dismiss is **45-day silence only** (no “new evidence lifts silence” yet). No behavior change.

No send/Telegram/form-submit widening. Contact-intelligence CTAs still point at the existing approval surfaces.

---

## Before / after

| URL | Before (MATCH `705df6daa09fec51`) | After (MATCH `ef4447b294c321dd`) |
|-----|-----------------------------------|----------------------------------|
| `/outreach/compose` | HTTP **404**, `x-nextjs-prerender: 1` | HTTP **200**, “compose outreach” |
| `/email/form-packets` | HTTP **404**, prerender | HTTP **200**, “form packets” |
| `/email/approvals` | HTTP **404**, prerender | HTTP **200**, “approvals” |
| `/contacts-programs` | HTTP 200 | HTTP 200 (unchanged) |
| Brief CTA → compose (`?contactId=…`) | 404 | **200** local + public |
| Brief CTA → form-packets (`?contactId=…`) | 404 | **200** local + public |
| Baked bundle flag | `ENABLE_OPPORTUNITIES_UI:"false"` | `ENABLE_OPPORTUNITIES_UI:"true"` |

Also spot-checked after rebuild: `/sponsors`, `/media-kits`, `/opportunities`, `/email`, `/outreach/queue` → **200** (same gate, fixed by build-time env load).

### Live checks (2026-09-09)

- Local: `http://127.0.0.1:3000/...` → 200 for compose / form-packets / approvals  
- Public: `https://benson.kckellie.com/...` → HTTP/2 200 for the same  
- Playwright mobile 390×844: compose / form-packets / approvals / Visit KC brief load with `notFound:false`; brief exposes **Open pitch approval** → `/outreach/compose?contactId=36aa4cf6-…`  
- Hard bans respected: no real email, Telegram, form submit, or enrollment

---

## Deploy / commits

| Step | Result |
|------|--------|
| `pnpm benson:deploy-local` | ✅ fingerprints **MATCH** `ef4447b294c321dd` |
| `dashboardBuiltAt` | `2026-09-09T01:22:30Z` |

Commit hashes: recorded after push in git log for this fix.

---

## Residual notes

- Dismiss remains **45-day time silence only** (verification gap #2 documented in primary report; not implemented here).  
- Crossroads Hotel kit/ask mapping remains a non-blocking recommendation-quality note from verification.  
- Mobile sticky bottom CTA can sit under the tab bar (pointer intercept) — separate UX polish; direct CTA URLs are live.
