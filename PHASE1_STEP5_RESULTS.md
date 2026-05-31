# Phase 1 Step 5 Results — DISABLE_VIDEO_PIPELINE

**Date:** 2026-05-31  
**Step:** [TRANSFORMATION_PHASE_1.md](./TRANSFORMATION_PHASE_1.md) Step 5 (Disable video pipeline)  
**Flag implemented:** `DISABLE_VIDEO_PIPELINE` only  
**Status:** **PASSED**

---

## Summary

Phase 1 Step 5 gates **video/post-production/publishing workers** behind `DISABLE_VIDEO_PIPELINE`. When `false` (default), all 11 inherited workers register and the full pipeline runs. When `true`, only the core discovery → draft → approval workers run; items stop at `script_approved` and do not advance into video rendering or publishing.

**No code deleted.** No database schema, API route, dashboard, or approval handler changes.

---

## Worker Registration

| Worker | Flag OFF | Flag ON |
|---|---|---|
| `planner` | ✓ | ✓ |
| `script-writer` | ✓ | ✓ |
| `approval-gate` | ✓ | ✓ |
| `persona-picker` | ✓ | — |
| `avatar-render-start` | ✓ | — |
| `avatar-render-poll` | ✓ | — |
| `post-production` | ✓ | — |
| `scheduler` | ✓ | — |
| `publisher` | ✓ | — |
| `token-rotation` | ✓ | — |
| `analytics-ingest` | ✓ | — |
| **Total started** | **11** | **3** |

Video worker **source files are unchanged** — they are skipped at registration time in `main.ts` when the flag is on.

---

## Pipeline Behavior

### `DISABLE_VIDEO_PIPELINE=false` (default)

- Full inherited pipeline: `planned` → … → `script_approved` → `assets_ready` → … → `published`
- All 11 workers process items as before

### `DISABLE_VIDEO_PIPELINE=true`

- Core path: `planned` → `script_drafted` → `script_approved` (**terminal**)
- Human approval (`POST /api/approvals/:id/approve`) still sets `script_approved`
- Auto-approval (`approval-gate` for `autonomy_mode=auto`) still sets `script_approved`
- **No worker** claims `script_approved` or later video/publishing states
- Items already in video states before flag enable are not processed further until flag is off and workers restart

**Restart workers** after changing the flag:

```bash
DISABLE_VIDEO_PIPELINE=true npx pnpm@10.30.3 dev:workers
```

---

## Files Changed

| File | Change |
|---|---|
| `services/workers/src/main.ts` | Conditional worker registration via `featureFlags.disableVideoPipeline` |

**Not changed:** worker workflow implementations, API routes, dashboard, DB schema, approval routes, queue/state enum, audit logging (`workflow_runs` still written by active workers).

---

## Verification Results

### Typecheck

```bash
npx pnpm@10.30.3 typecheck
```

**Result:** PASS — all packages

### Runtime checks (2026-05-31)

| Check | Flag OFF | Flag ON |
|---|---|---|
| Worker startup log | `[main] starting 11 workers` | `[main] starting 3 workers` + skip message |
| Video workers register | persona-picker, avatar-render, etc. | Not registered |
| Approve item → stays terminal | Pipeline can advance (legacy) | **`script_approved` after 15s** ✓ |
| `GET /health` | `{"ok":true}` | `{"ok":true}` |
| Dashboard | HTTP **200** | HTTP **200** |
| API `/api/content`, `/api/approvals` | Unchanged | Unchanged |

**Terminal-state test (flag ON):**

1. Started workers with `DISABLE_VIDEO_PIPELINE=true` (3 workers)
2. `POST /api/approvals/:id/approve` → `script_approved`
3. Waited 15s — state remained `script_approved` (persona-picker not running)

---

## Rollback

Set in `.env`:

```bash
DISABLE_VIDEO_PIPELINE=false
```

Restart workers. All 11 workers register; items at `script_approved` resume through the video chain.

---

## Known Notes

1. **Registration-time gating only** — standard entry point is `pnpm dev:workers` → `main.ts`. Running individual worker files directly would bypass the gate (unchanged from inherited architecture).
2. **In-flight video items stall** when flag is enabled mid-run — expected; re-enable flag to resume processing.
3. **`ENABLE_APPROVALS_ONLY_MODE` UI bundle** (metrics/state-pill treatment of `script_approved` as success) is **not** implemented in Step 5 — dashboard/API display unchanged.
4. **Audit logging preserved** — `script-writer` and `approval-gate` still write `workflow_runs` rows.

---

## Next Step (awaiting approval)

Per [TRANSFORMATION_PHASE_1.md](./TRANSFORMATION_PHASE_1.md) and [FEATURE_FLAGS_SIMPLIFIED.md](./FEATURE_FLAGS_SIMPLIFIED.md): remaining Phase 1 flags (`ENABLE_WORKER_LABEL_ALIASES`, `ENABLE_BENSON_SEED_NAMES`, wire dashboard to `/api/opportunities`, etc.).

Do not proceed until Step 5 is approved.

---

*End of Phase 1 Step 5 results.*
