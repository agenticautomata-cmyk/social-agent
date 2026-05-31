# Benson Mode Verification

**Date:** 2026-05-31  
**Purpose:** Verify all completed Phase 1 Benson flags enabled simultaneously  
**Status:** **PASSED**

---

## Benson Mode Preset

All five Phase 1 flags set to `true` in `.env`:

```bash
ENABLE_BENSON_BRANDING=true
ENABLE_BENSON_TERMINOLOGY=true
ENABLE_OPPORTUNITIES_UI=true
ENABLE_OPPORTUNITIES_API=true
DISABLE_VIDEO_PIPELINE=true
```

**Services restarted** after updating `.env` (flags read at process start):

```bash
npx pnpm@10.30.3 dev:api
npx pnpm@10.30.3 dev:dashboard
npx pnpm@10.30.3 dev:workers
```

**URLs:** Dashboard http://localhost:3000 · API http://localhost:4000

---

## Phase 1 Flag Summary

| Flag | Step | Effect when `true` |
|---|---|---|
| `ENABLE_BENSON_BRANDING` | 1 | Header/footer/metadata → Benson |
| `ENABLE_BENSON_TERMINOLOGY` | 2 | title/angle/summary labels; Benson state pills |
| `ENABLE_OPPORTUNITIES_UI` | 3 | `/opportunities` nav; hide campaigns/queue |
| `ENABLE_OPPORTUNITIES_API` | 4 | `GET /api/opportunities` with mapped DTO |
| `DISABLE_VIDEO_PIPELINE` | 5 | 3 workers only; pipeline ends at `script_approved` |

No new features implemented — configuration and restart only.

---

## Verification Results

### Service startup

| Service | Log evidence | Result |
|---|---|---|
| API | `[api] ENABLE_OPPORTUNITIES_API=true — /api/opportunities registered` | PASS |
| API | `[api] listening on http://localhost:4000` | PASS |
| Dashboard | `✓ Ready` on port 3000 | PASS |
| Workers | `[main] DISABLE_VIDEO_PIPELINE=true — skipping video/...` | PASS |
| Workers | `[main] starting 3 workers` | PASS |

### API health

| Check | Result |
|---|---|
| `GET /health` | `{"ok":true}` |
| `GET /api/content?limit=1` | HTTP **200** — legacy `topic`/`hook`/`script` fields present |
| `GET /api/opportunities?limit=1` | HTTP **200** — mapped `title`/`angle`/`summary` fields |

### Benson branding visible

| Check | Expected | Result |
|---|---|---|
| Page `<title>` | Benson metadata | `Benson · Kansas City content opportunity assistant` |
| Header logo text | `Benson` | PASS |
| Overview greeting | Kellie / Benson copy | `Good morning, Kellie.` + Benson subline present |
| Legacy header | `social-agent` not in logo | PASS (only in footer GitHub link) |

### Opportunities navigation visible

| Nav link | Visible in Benson mode |
|---|---|
| `[overview]` | ✓ |
| `[opportunities]` | ✓ |
| `[approvals]` | ✓ |
| `[runs]` | ✓ |
| `[campaigns]` | **Hidden** |
| `[queue]` | **Hidden** |

### Campaigns hidden

| Check | Result |
|---|---|
| Overview campaigns table (`Demo Brand`) | **Not rendered** (0 matches) |
| `GET /campaigns` | HTTP **307** → `/` |
| `GET /campaigns/:id` | HTTP **307** → `/` |

### Queue hidden

| Check | Result |
|---|---|
| Queue absent from nav | PASS |
| `GET /queue` | HTTP **307** → `/opportunities` |

### Opportunities page accessible

| Check | Result |
|---|---|
| `GET /opportunities` | HTTP **200** |
| Page title | `opportunities` |
| Column headers | `title`, `category` (terminology) |
| State pills | Benson labels (`discovered`, `pending_review`) |

### Terminology (combined with UI flag)

| Surface | Legacy | Benson mode |
|---|---|---|
| Approvals fields | hook/script | **angle/summary** |
| State pills | awaiting_approval | **pending_review** |

### Workers (video pipeline disabled)

| Check | Result |
|---|---|
| Workers started | **3** (planner, script-writer, approval-gate) |
| Video workers | Not registered |
| Legacy API/workers code | Unchanged on disk |

---

## Combined Behavior Notes

1. **Branding + terminology together** — Overview shows Benson greeting (`Good morning, Kellie.`) and Benson subline; nav uses `[opportunities]` not terminology-only rename on `/queue`.
2. **Opportunities UI + API** — Dashboard opportunities page fetches `/api/content` (Step 3 design); `/api/opportunities` is available for API clients and returns mapped DTOs.
3. **State labels** — Both `ENABLE_BENSON_TERMINOLOGY` and `ENABLE_OPPORTUNITIES_UI` contribute Benson state/filter labels on opportunities views.
4. **Approval flow** — `/approvals` unchanged functionally; Benson field labels visible.

---

## Rollback to Legacy Mode

Set all flags `false` in `.env`:

```bash
DISABLE_VIDEO_PIPELINE=false
ENABLE_OPPORTUNITIES_API=false
ENABLE_BENSON_BRANDING=false
ENABLE_OPPORTUNITIES_UI=false
ENABLE_BENSON_TERMINOLOGY=false
```

Restart API, dashboard, and workers. Expect: 11 workers, `[campaigns]`/`[queue]` nav, `social-agent` branding, `/api/opportunities` → 404.

---

## Known Limitations (expected, not failures)

| Item | Note |
|---|---|
| Dashboard still calls `/api/content` | Step 3 UI mapping; wiring to `/api/opportunities` is optional follow-up |
| `/api/scanner/run` alias | Not part of Phase 1 five-flag preset |
| Worker label aliases | `ENABLE_WORKER_LABEL_ALIASES` not enabled — runs page shows `planner`/`script-writer` |
| KC real sources | Phase 2 — planner still creates quota items in Benson mode |

---

## Checklist (all passed)

- [x] Benson branding visible
- [x] Opportunities navigation visible
- [x] Campaigns hidden (nav + overview + redirect)
- [x] Queue hidden (nav + redirect)
- [x] Opportunities page accessible
- [x] `/api/opportunities` functional with mapped fields
- [x] Legacy `/api/content` unchanged
- [x] API health OK
- [x] Dashboard loads
- [x] Workers healthy (3 workers, video pipeline gated)

---

**Stopping for approval.** Benson mode is active locally with the preset above.

---

*End of Benson mode verification.*
