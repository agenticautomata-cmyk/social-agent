# Pre-Alpha Readiness Phase A Results

**Date:** 2026-05-31  
**Scope:** Tester usability for Kellie — no new business features, sources, analytics, or sponsor capabilities.

---

## Summary

Pre-Alpha Readiness wires existing Benson systems into a **home dashboard**, **feedback/bug capture**, **accurate demo labeling**, **mobile-friendly nav**, **health monitoring**, and **startup scripts** for Cloudflare Access deployment.

---

## 1. Benson Home Dashboard (`/`)

- **`GET /api/pre-alpha/home`** — priorities from action center, quick links, pipeline/action stats
- **`HomeDashboardPanel`** — Kellie landing: “start here today”, stats, quick links
- Nav **`home`** → `/` (no longer redirects straight to `/editor`)

---

## 2. Feedback capture

- Migration `32_pre_alpha_feedback.sql` → table `tester_feedback`
- **`POST /api/pre-alpha/feedback`** — sentiment (up/down), reason codes, comments, expected behavior
- **`TesterFeedbackPanel`** in layout footer on all Benson pages

Reason codes: wrong_timing, wrong_sponsor_fit, already_covered, missing_context, low_confidence, other

---

## 3. Bug reporting

Same API with `kind: "bug"` — description required, optional email, viewport/user-agent captured.

---

## 4. Mobile / iPad audit (implemented)

| Change | Detail |
|--------|--------|
| Responsive padding | `px-4 md:px-8 lg:px-12` on layout |
| Mobile nav | Primary links + “more” drawer, 44px touch targets |
| Desktop nav | Hidden below `md`, full nav above |
| Overflow | `min-w-0 overflow-x-hidden` on main |
| Planner week | `sm:grid-cols-2 lg:grid-cols-7` instead of forced 7-col on phone |

---

## 5. Demo mode labeling

- **`PreAlphaStatusBanner`** — reads `/api/pre-alpha/status`: `demo_mode`, `outreach=simulate`, DB errors, live-send warning
- Header shows `demo=on|off` from server `getRuntimeStatus()`
- `NEXT_PUBLIC_DEMO_MODE` mirrored in `next.config.mjs`

---

## 6. Cloudflare Access readiness

- **`docs/cloudflare-access.md`** — ports, tunnel options, Access policy, protected routes

---

## 7. Startup / health monitoring

| Script | Purpose |
|--------|---------|
| `scripts/pre-alpha-start.sh` | Env checks, Postgres, migrations, start API+dashboard, health wait |
| `scripts/pre-alpha-stop.sh` | Stop API/dashboard PIDs |
| `scripts/pre-alpha-smoke.sh` | Curl health, pre-alpha, editor, revenue, outreach simulate, key pages |

| API | Purpose |
|-----|---------|
| `GET /api/pre-alpha/status` | DB ping, flags, outreach mode, `preAlphaReady` |
| `GET /health` | Simple liveness (unchanged) |

**pnpm scripts:** `pre-alpha:start`, `pre-alpha:stop`, `pre-alpha:smoke`, `migrate:pre-alpha-feedback`

---

## Verification

```bash
pnpm migrate:pre-alpha-feedback
pnpm pre-alpha:start
pnpm pre-alpha:smoke
```

---

## Files added

- `services/core/src/pre-alpha/*`
- `services/api/src/routes/pre-alpha.ts`
- `db/migrations/32_pre_alpha_feedback.sql`
- `dashboard/app/home-dashboard-panel.tsx`
- `dashboard/components/{pre-alpha-status-banner,mobile-nav,tester-feedback-panel,pre-alpha-shell}.tsx`
- `scripts/pre-alpha-{start,stop,smoke}.sh`
- `docs/cloudflare-access.md`

---

*Ready for Kellie daily testing behind Cloudflare Access.*
