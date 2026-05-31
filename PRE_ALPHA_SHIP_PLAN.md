# Benson Pre-Alpha Ship Plan

**Date:** 2026-05-31  
**Audience:** Elliott (operator), Kellie (tester)  
**Scope:** Ship a **usable pre-alpha** behind **Cloudflare Access** for safe testing.  
**Constraints for this document:** planning only — no application code changes, no new sources, no live email enablement.

---

## Executive summary

Benson pre-alpha is a **read-heavy + workflow test** surface: editor, planner, sponsors, pipeline, outreach (simulated), revenue, and intelligence. Runtime is **Postgres + API + Dashboard** on a single host; **Cloudflare Access** is the authentication boundary (not app-level login). **Live email must remain off**; outreach sends stay simulated unless explicitly re-enabled after Kellie sign-off.

---

## 1. Required runtime services

### Must run (pre-alpha)

| Service | Role | Default port | Notes |
|---------|------|--------------|-------|
| **PostgreSQL** | All Benson state | `5433` (see `.env.example`) or `5432` (compose default) | `docker compose up -d postgres` |
| **API** (`@social-agent/api`) | REST for dashboard | `4000` | Registers Benson routes when `ENABLE_OPPORTUNITIES_API=true` |
| **Dashboard** (`@social-agent/dashboard`) | Next.js UI | `3000` | Proxies `/api/*` → API via `next.config.mjs` rewrites |

### Optional (pre-alpha)

| Service | When needed | Notes |
|---------|-------------|-------|
| **Workers** (`@social-agent/workers`) | KC auto-scan cron, legacy video pipeline | **Not required** if `DISABLE_VIDEO_PIPELINE=true` and ingest is manual via `POST /api/scanner/run` or pre-seeded DB |
| **n8n** | Legacy campaign/video automation | **Not required** for Benson pre-alpha |
| **Redis** | — | Not used in current stack |

### Database initialization

- **First boot:** `db/init/*.sql` applied automatically by Postgres Docker entrypoint (schema + seed sources).
- **Incremental:** `db/migrations/*.sql` applied via `pnpm migrate:*` scripts (one script per migration file). There is **no single `migrate:all`** today — startup script must run an ordered list (see §2).

### Migrations required for Benson (run once per environment, in order)

Apply after Postgres is healthy. Source types can be skipped for pre-alpha if inventory is already seeded; **Benson product migrations** are mandatory:

| Order | Script | Purpose |
|-------|--------|---------|
| 1 | `migrate:share-intake` | Share intake (optional if not testing intake) |
| 2 | `migrate:creator-analytics` | TikTok analytics tables |
| 3 | `migrate:editor-home` | Editor tracking |
| 4 | `migrate:content-planning` | Planner |
| 5 | `migrate:sponsor-outreach` | Outreach Phase A |
| 6 | `migrate:sponsor-outreach-phase-b` | Send attempts / live-send schema |
| 7 | `migrate:sponsor-pipeline` | Deal pipeline |
| 8 | `migrate:creator-platform-connections` | TikTok OAuth tables (optional credentials) |
| 9 | `migrate:action-center` | Due dates for action center |

KC source migrations (`migrate:kc`, `migrate:visitkc`, …) only if running live scanner ingest on a fresh DB.

### Environment variables (pre-alpha preset)

Copy `.env.example` → `.env` on the host. **Minimum for Kellie testing:**

```bash
# Core
DEMO_MODE=true
DATABASE_URL=postgres://social_agent:<password>@localhost:5433/social_agent
API_PORT=4000
NEXT_PUBLIC_API_URL=http://localhost:4000

# Benson surface (all required for nav pages)
ENABLE_BENSON_BRANDING=true
ENABLE_BENSON_TERMINOLOGY=true
ENABLE_OPPORTUNITIES_UI=true
ENABLE_OPPORTUNITIES_API=true
DISABLE_VIDEO_PIPELINE=true

# Optional: live KC ingest (manual scan still works via API if enabled)
ENABLE_KC_SCANNER=true

# Outreach — KEEP LIVE SEND OFF
OUTREACH_ENABLE_LIVE_SEND=false
# Do not set RESEND_API_KEY for pre-alpha unless testing live send in a sandbox

# TikTok OAuth — optional (CSV import / demo analytics work without)
# TIKTOK_CLIENT_KEY=
# TIKTOK_CLIENT_SECRET=
# TIKTOK_REDIRECT_URI=

# Postgres compose
POSTGRES_USER=social_agent
POSTGRES_PASSWORD=<strong>
POSTGRES_DB=social_agent
POSTGRES_PORT=5433
```

**Server-only secrets (never in `NEXT_PUBLIC_*`):** `DATABASE_URL`, `RESEND_API_KEY`, `TIKTOK_CLIENT_SECRET`, `OPENAI_API_KEY`, etc. Dashboard only receives mirrored **feature flags** via `next.config.mjs` `env` block.

**Tunnel / public URL overrides (when behind Cloudflare):**

```bash
NEXT_PUBLIC_API_URL=https://api.<your-domain>   # or same-origin if only tunneling dashboard with server-side rewrite to localhost:4000
DASHBOARD_PUBLIC_URL=https://benson.<your-domain>
TIKTOK_REDIRECT_URI=https://api.<your-domain>/api/analytics/tiktok/oauth/callback
```

Restart **both** API and dashboard after any `.env` change (flags read at process start).

---

## 2. One-command startup (design)

**Goal:** `scripts/pre-alpha-start.sh` (to be added in a follow-up ops commit — spec only here).

### Behavior

```
pre-alpha-start.sh
├── 1. Preflight
│   ├── Node ≥20, pnpm 10.30.3, docker
│   ├── .env exists
│   └── Required vars: DATABASE_URL, ENABLE_OPPORTUNITIES_API, ENABLE_OPPORTUNITIES_UI
├── 2. Safety assertions (fail fast)
│   ├── OUTREACH_ENABLE_LIVE_SEND must be false or unset
│   └── Warn if RESEND_API_KEY set while live send false
├── 3. Database
│   ├── docker compose up -d postgres
│   ├── wait for pg_isready (POSTGRES_PORT)
│   └── psql SELECT 1 via DATABASE_URL
├── 4. Migrations (idempotent SQL only)
│   ├── Track applied migrations in table `schema_migrations` (recommended) OR
│   └── Run each migrate:* script; ignore "already exists" errors
├── 5. Start API (background, log to .logs/api.log)
│   └── poll GET http://127.0.0.1:4000/health until 200
├── 6. Start dashboard (background, log to .logs/dashboard.log)
│   └── poll GET http://127.0.0.1:3000 until 200 (or /editor if home redirects)
└── 7. Summary
    ├── Print URLs
    ├── Print demoMode + outreach send mode (GET /api/outreach/send-config)
    └── Exit 0 only if all health checks pass
```

### Health checks

| Check | URL | Expected |
|-------|-----|----------|
| API liveness | `GET /health` | `{ "ok": true }` |
| Benson API | `GET /api/editor?limit=1` | 200 when `ENABLE_OPPORTUNITIES_API=true` |
| Outreach mode | `GET /api/outreach/send-config` | `mode: "simulate"`, `liveEnabled: false` |
| Dashboard | `GET http://localhost:3000/editor` | 200 HTML |

### Stop script (companion)

`pre-alpha-stop.sh`: kill API/dashboard PIDs, optional `docker compose stop postgres`.

### Manual equivalent (today)

```bash
docker compose up -d postgres
# run migrations (see table §1)
npx pnpm@10.30.3 dev:api      # terminal 1
npx pnpm@10.30.3 dev:dashboard # terminal 2
curl http://localhost:4000/health
```

---

## 3. Cloudflare Access readiness

### Local ports (origin)

| Process | Port | Path |
|---------|------|------|
| Dashboard | `3000` | All UI |
| API | `4000` | `/api/*`, `/health` |
| Postgres | `5433` (or `5432`) | **Do not expose via tunnel** |

### Tunnel architecture (recommended)

**Option A — Single hostname (simplest for Kellie)**

- Tunnel `https://benson.<domain>` → `http://127.0.0.1:3000`
- API stays on localhost; Next.js **server-side rewrites** proxy `/api/*` to `http://127.0.0.1:4000`
- Set `NEXT_PUBLIC_API_URL=` empty or same origin so browser calls `/api/...` on the tunnel host
- TikTok OAuth callback must use public API URL if OAuth tested: separate hostname or path routing to `:4000`

**Option B — Split hostnames (clearer for OAuth)**

- `https://app.<domain>` → dashboard `:3000`
- `https://api.<domain>` → API `:4000`
- `NEXT_PUBLIC_API_URL=https://api.<domain>`
- CORS is `*` on API today — acceptable behind Access on both hosts

### Example tunnel config (cloudflared)

```yaml
# ~/.cloudflared/config.yml (illustrative)
ingress:
  - hostname: benson.example.com
    service: http://localhost:3000
  - hostname: api.benson.example.com
    service: http://localhost:4000
  - service: http_status:404
```

### Access policy (Elliott + Kellie only)

| Setting | Value |
|---------|-------|
| Application | Cloudflare Access → Self-hosted |
| Identity | Email OTP or Google Workspace |
| Policy | Allow emails: `elliott@…`, `kellie@…` |
| Default | Block all others |
| Session | 24h max; require re-auth for sensitive days |

**No bypass paths** for `/api/outreach/emails/*/send`, `/api/scanner/run`, or `/api/action-center/execute` — entire hostname(s) behind Access.

### Routes that must remain protected

Treat **100% of dashboard and API** as private. There is **no in-app auth** today. Specifically sensitive:

| Route | Risk |
|-------|------|
| `POST /api/outreach/emails/:id/send` | Live email if misconfigured |
| `POST /api/outreach/emails/:id/simulate-send` | Simulated send + DB mutation |
| `POST /api/action-center/execute` | send_email, mark_covered, stage updates |
| `POST /api/scanner/run` | External fetch / ingest load |
| `POST /api/intake/*` | Creates content |
| `PUT /api/content-planner/items/*` | Planner mutations |
| `POST /api/pipeline/opportunities/*` | CRM mutations |

Public-only exception: none for pre-alpha.

### TLS and cookies

- Access handles user login; origin can stay HTTP on localhost.
- Ensure Kellie bookmarks **HTTPS** tunnel URL only.

---

## 4. Pre-alpha safety

### Current safeguards (verify before invite)

| Control | Status | Action |
|---------|--------|--------|
| Live email gated | `OUTREACH_ENABLE_LIVE_SEND` default **false**; `getOutreachSendConfig()` returns `simulate` | Confirm in `.env`; smoke `GET /api/outreach/send-config` |
| Approval before send | Outreach flow: preview → schedule → **approve** → send | Kellie training: never skip approve on real keys |
| No API auth | **Mitigated by Cloudflare Access only** | Do not publish origin IP |
| CORS `*` on API | Acceptable if API not publicly reachable | Prefer Option B + Access on API host |
| Secrets in frontend | Only `NEXT_PUBLIC_*` flags; no API keys in client bundles | Audit `next.config.mjs` |
| Demo labeling | `demoMode: true` in API responses; layout shows `demo_mode=true` | Consider tying label to `DEMO_MODE` env in future |
| TikTok OAuth | Optional; connect UI shows missing credentials | Leave unset for pre-alpha |
| Destructive actions | Limited `confirm` in approvals/intake; outreach send **no** confirm dialog | Train Kellie; Access + simulate mode |

### Explicit pre-alpha prohibitions

- Do **not** set `OUTREACH_ENABLE_LIVE_SEND=true`
- Do **not** add `RESEND_API_KEY` on shared pre-alpha host
- Do **not** expose Postgres or n8n ports via tunnel
- Do **not** commit `.env` or tunnel credentials to git

### Send endpoints (audit)

| Endpoint | Auth | Live risk |
|----------|------|-----------|
| `POST /api/outreach/emails/:id/send` | None (Access only) | High if live enabled |
| `POST /api/outreach/emails/:id/simulate-send` | None | Low (labeled simulated) |
| `POST /api/action-center/execute` (`send_email`) | None | Calls same send path |

**Pre-alpha posture:** Cloudflare Access + `OUTREACH_ENABLE_LIVE_SEND=false` = simulate only.

---

## 5. Kellie feedback loop (design — not implemented)

Lightweight capture without new product features in code: use **one external channel** plus optional **in-app placeholders** later.

### Recommended v0 (no code)

| Mechanism | Tool | Fields |
|-----------|------|--------|
| Primary | Google Form or Notion | Page URL, thumbs up/down, “not useful” reason, free text, “what I expected”, screenshot |
| Bugs | GitHub Issues template `pre-alpha-feedback` | Steps, expected, actual, device (iPhone/iPad) |
| Quick ping | Shared Slack channel | #benson-pre-alpha |

### Future in-app shape (post pre-alpha — do not build now)

Store in `feedback_events` table: `user_email`, `route`, `entity_id`, `sentiment`, `reason_code`, `comment`, `expected_behavior`, `created_at`.

### Where to ask for feedback on each page

| Page | Prompt |
|------|--------|
| `/editor` | “Was this daily briefing useful?” |
| `/benson` | “Is this executive summary accurate?” |
| `/sponsor-intelligence` | “Would you contact this sponsor?” |
| `/actions` | “Was this action correct?” |
| `/revenue` | “Do these numbers match your expectations?” |

### “Not useful” reason codes (standardize in form)

- Wrong timing
- Wrong sponsor fit
- Already covered
- Missing context
- Too low confidence
- Other

---

## 6. Mobile / iPad review (audit)

Based on current layout patterns (`max-w-[1400px]`, `px-12`, horizontal nav, multi-column grids).

### Global risks

| Issue | Severity | Pages affected |
|-------|----------|----------------|
| **Horizontal nav** — many `[label]` links in one row | High on iPhone | All pages (header) |
| **Wide padding** `px-12` | Medium on iPhone | All |
| **Tables** (revenue top 10, pipeline reporting) | Horizontal scroll likely | `/revenue`, `/pipeline` |
| **7-column weekly planner grid** | High on phone | `/planner/week` |
| **Modals** (planner notes, compose) | OK if centered; verify keyboard overlap | `/editor`, `/planner`, `/outreach/compose` |
| **Touch targets** — many `text-2xs` buttons | Below 44px | `/actions`, cards site-wide |
| **Hardcoded `demo_mode=true` in header** | Misleading if `DEMO_MODE=false` | Layout |

### Per-device checklist

**iPhone (375–430px)**

- [ ] Nav: usable or needs hamburger (currently **gap**)
- [ ] Editor cards: single column stacks OK (`md:grid-cols-2`)
- [ ] Action center: one column OK
- [ ] Outreach compose: textarea + keyboard
- [ ] Forms: date inputs on planner/intake
- [ ] No unintended horizontal page scroll

**iPad (768–1024px)**

- [ ] Nav fits or wraps cleanly
- [ ] Planner week: 7-column grid may be tight — scroll acceptable
- [ ] Revenue charts: readable
- [ ] Sponsor detail: two-column grids OK

### Priority fixes (ops, not code in this task)

1. Ask Kellie to test in **Safari iOS** first; Elliott validates **Chrome iPad**.
2. Document “rotate to landscape” for `/planner/week` during pre-alpha.
3. Zoom-friendly: avoid relying on hover-only affordances (most links are explicit).

---

## 7. Pre-alpha checklist (pass/fail)

**Tester:** Kellie (primary), Elliott (sign-off)  
**Environment:** Tunnel URL behind Access, `DEMO_MODE=true`, live send **off**

| # | Route | Load | Core action | Pass criteria |
|---|-------|------|-------------|---------------|
| 1 | `/benson` | ☐ | View priorities + sections | All 5 sections load; links work |
| 2 | `/editor` | ☐ | View briefing + one card | Scores + “why Benson” visible; planner quick action works |
| 3 | `/actions` | ☐ | View do-now + one safe action | Schedule follow-up or mark covered; no live send |
| 4 | `/planner` | ☐ | View boards + shortlist | Recent items load |
| 5 | `/planner/week` | ☐ | View week columns | Items show; scroll OK on mobile |
| 6 | `/sponsor-intelligence` | ☐ | View recommendations | Lanes populated or empty state clear |
| 7 | `/sponsors` | ☐ | Open sponsor detail | CRM fields load |
| 8 | `/outreach/queue` | ☐ | Open queue | Shows simulate mode; approve/send blocked or simulated |
| 9 | `/outreach/compose` | ☐ | Preview draft | Preview works; no accidental live send |
| 10 | `/pipeline` | ☐ | View KPIs + open deals | Values sane vs revenue page |
| 11 | `/revenue` | ☐ | View forecast + charts | KPIs + at-risk section load |
| 12 | `/analytics/tiktok` | ☐ | View dashboard or import CTA | Works without OAuth OR clear “connect optional” |
| 13 | `/review/inventory` | ☐ | Filter + open item | Inventory review loads |
| 14 | `/intake` | ☐ | (Optional) Review share intake | Only if testing intake |
| 15 | API health | ☐ | `GET /health` | 200 |
| 16 | Send config | ☐ | `GET /api/outreach/send-config` | `mode: simulate` |

**Fail criteria:** 500 errors, blank screens, live email sent, data loss, or Access bypass.

---

## 8. Recommended ship sequence

Exact order for Elliott:

### Phase 0 — Local cleanup (1–2 hours)

1. Review `.env` against §1 preset; confirm `OUTREACH_ENABLE_LIVE_SEND=false`.
2. Run full typecheck: `npx pnpm@10.30.3 typecheck`.
3. Apply migrations §1 on local Postgres; verify `GET /api/editor`, `/api/revenue`, `/api/action-center`.
4. Walk checklist §7 locally; note failures in GitHub Issues.
5. **Do not** enable live email or new sources.

### Phase 1 — Commit (30 min)

1. `git status` — exclude `*.md` phase results from commit if desired, or commit docs separately.
2. Single commit message focus: “Benson pre-alpha: intelligence, actions, revenue dashboards”.
3. Push to remote; no force-push to main.

### Phase 2 — Origin host prep (1 hour)

1. Provision host (VM or home server) with Docker, Node 20, pnpm, cloudflared.
2. Clone repo; copy `.env` via secure channel (not git).
3. Implement/run startup script per §2 (or manual §2 equivalent).
4. Bind services to **localhost only** (not `0.0.0.0` on public interface).

### Phase 3 — Cloudflare tunnel (30 min)

1. Create tunnel; configure ingress per §3 Option A or B.
2. DNS: `benson.<domain>` (and `api.<domain>` if split).
3. Verify HTTPS loads only after Access login (use incognito).

### Phase 4 — Access policy (15 min)

1. Create Access application for hostname(s).
2. Policy: Allow **only** Elliott + Kellie emails.
3. Test block: unauthorized email must not reach dashboard.

### Phase 5 — Smoke test (30 min)

1. Run §7 checklist on tunnel URL (Elliott).
2. Confirm `GET https://api.<domain>/api/outreach/send-config` → simulate.
3. Trigger simulate send once; confirm no real email received.
4. Screenshot demo banners for Kellie.

### Phase 6 — Invite Kellie (15 min)

1. Send: tunnel URL, Access login instructions, “simulate only” outreach note.
2. Share feedback form link (§5).
3. Agree session window (e.g. 60–90 min guided walkthrough).
4. Optional: pair on `/editor` → `/actions` → `/sponsors` → `/pipeline` → `/revenue`.

### Phase 7 — Collect feedback (ongoing)

1. Triage form responses within 24h.
2. Tag: `bug` | `ux` | `data` | `won’t fix pre-alpha`.
3. No feature work until Kellie sign-off on stability.

---

## Appendix A — API routes registered in Benson mode

When `ENABLE_OPPORTUNITIES_API=true`:

`/api/opportunities`, `/api/intake`, `/api/inventory`, `/api/editor`, `/api/content-planner`, `/api/analytics`, `/api/sponsors`, `/api/media-kits`, `/api/outreach`, `/api/sponsor-intelligence`, `/api/pipeline`, `/api/benson`, `/api/action-center`, `/api/revenue`

Legacy (may still be reachable): `/api/campaigns`, `/api/approvals`, `/api/runs`, `/api/planner`, `/api/scanner` (if `ENABLE_KC_SCANNER`)

---

## Appendix B — Files to add later (ops, not in this task)

| File | Purpose |
|------|---------|
| `scripts/pre-alpha-start.sh` | §2 startup |
| `scripts/pre-alpha-stop.sh` | Clean shutdown |
| `scripts/pre-alpha-smoke.sh` | Curl health + send-config |
| `.env.pre-alpha.example` | Documented preset |
| `docs/cloudflare-access.md` | Tunnel + policy screenshots |

---

## Appendix C — Kellie one-pager (copy for invite)

> **Benson pre-alpha** is a test environment behind a private login.  
> - Outreach emails are **simulated only** — nothing goes to real inboxes.  
> - You may see **demo mode** labels; some data is sample or scanner-sourced.  
> - Use **thumbs up/down** via our feedback form when something feels wrong.  
> - Best on **desktop**; iPhone works but planner week view may need landscape.  
> - Do not share the URL; access is limited to you and Elliott.

---

*End of pre-alpha ship plan. No application code was modified in producing this document.*
