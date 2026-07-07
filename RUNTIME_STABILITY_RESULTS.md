# Runtime Stability Fixes — Results

**Date:** 2026-06-02  
**Scope:** Stop/start scripts, orphan cleanup, production mode, health endpoint, duplicate watcher detection.

---

## Memory: Before vs After

| Metric | Before (audit) | After (prod restart) | Delta |
|--------|----------------|----------------------|-------|
| **RAM used** | 6.1–6.5 GiB | 4.8–4.9 GiB | **~1.2–1.7 GiB freed** |
| **RAM available** | 1.1–1.5 GiB | 2.8–2.9 GiB | **+1.3–1.8 GiB** |
| **Swap used** | 1.9 GiB | 1.8 GiB | −0.1 GiB (swap releases slowly) |
| **`next-server` RSS** | **1,057 MB** (`next dev`) | **109 MB** (`next start`) | **−948 MB** |
| **API RSS** | ~969 MB (multiple `tsx watch` orphans) | **101 MB** (single `tsx`, no watch) | **−868 MB** |
| **`tsx watch` processes** | 7 | 0 | −7 |
| **`next dev` processes** | 5 | 0 | −5 |
| **Stale API orphans (Jun 1–2)** | 4 (`cli.mjs watch`) | 0 | eliminated |

### Expected RAM savings (production mode)

| Component | Dev mode | Production mode | Savings |
|-----------|----------|-----------------|---------|
| Dashboard (`next dev` → `next start`) | ~900–1,100 MB | ~100–200 MB | **~700–900 MB** |
| API (`tsx watch` → `tsx start`) | ~150–250 MB per watcher | ~80–120 MB (single) | **~100–200 MB** + no duplicate watchers |
| Orphan cleanup | N/A | N/A | **~250–400 MB** when stale watchers accumulate |

**Total typical savings after clean prod restart: ~1.0–1.5 GiB RAM.**

---

## What Was Implemented

### 1. `scripts/pre-alpha-stop.sh` (rewritten)

- Kills PID-file wrappers (API + dashboard)
- Kills all listeners on `:4000` and `:3000` via `ss` + `fuser`
- Kills orphaned Benson `tsx watch`, `next dev`, `pnpm` wrapper chains
- **Verifies ports are free** before returning success (exits 1 if not)
- Warns on duplicate watchers via `detect_duplicate_watchers`

### 2. `scripts/runtime-status.sh` (new)

Shows: RAM, swap, top 10 memory/CPU consumers, Benson listening ports, process counts, duplicate watcher warnings, orphaned dev processes.

```bash
pnpm runtime:status
# or: bash scripts/runtime-status.sh
```

### 3. `scripts/restart-clean.sh` (new)

Stop → verify ports free → start (dev or prod) → curl health endpoints → print runtime status.

```bash
pnpm restart:clean        # dev mode (next dev + tsx watch)
pnpm restart:clean:prod   # production mode (next start + tsx start)
```

### 4. Production mode — `pnpm start:prod`

Uses `scripts/pre-alpha-start-prod.sh`:

- API: `pnpm --filter @social-agent/api start` (tsx, **no watch**)
- Dashboard: `next build` then `next start -p 3000`
- Sets `BENSON_API_MODE=production`, `BENSON_DASHBOARD_MODE=production`, `NODE_ENV=production`

### 5. Duplicate watcher detection

`scripts/benson-runtime-lib.sh` → `detect_duplicate_watchers` warns when:

- Multiple `tsx watch` processes
- Multiple `next dev` processes
- Both `next dev` and `next start` running
- Multiple listeners on API or dashboard ports

Used by stop, status, and restart scripts.

### 6. `GET /api/health` (new)

```bash
curl -s http://127.0.0.1:4000/api/health | jq .
```

Example response (after prod restart):

```json
{
  "ok": true,
  "version": "0.1.0",
  "buildMode": "production",
  "dashboardMode": "production",
  "uptimeSeconds": 46,
  "memory": { "rssMb": 101, "heapUsedBytes": 24093192, ... },
  "system": { "loadAvg": [...], "freeMemBytes": 2968690688, "totalMemBytes": 8202260480 },
  "processCount": 7
}
```

`GET /health` unchanged (`{ "ok": true }`) for backward compatibility.

### 7. Shared library

`scripts/benson-runtime-lib.sh` — port kill/wait, orphan cleanup, env loading, duplicate detection.

---

## Verification (2026-06-02)

```bash
bash scripts/restart-clean.sh prod
# ✅ stop → ports free → migrations → build → start
# ✅ GET /health OK
# ✅ GET /api/health OK
# ✅ GET /api/pre-alpha/status OK
# ✅ Dashboard home OK
# ✅ No duplicate watchers
# ✅ No orphaned Benson dev processes
```

---

## Operator Commands

| Command | Purpose |
|---------|---------|
| `pnpm pre-alpha:stop` | Stop stack, kill orphans, verify ports |
| `pnpm pre-alpha:start` | Dev mode (next dev + tsx watch) |
| `pnpm start:prod` | Production mode (next build + next start) |
| `pnpm runtime:status` | Memory/CPU/ports/orphan report |
| `pnpm restart:clean` | Clean dev restart with health checks |
| `pnpm restart:clean:prod` | Clean production restart with health checks |

**Recommendation:** Use `pnpm start:prod` or `pnpm restart:clean:prod` for daily operation to avoid `next dev` memory bloat and duplicate `tsx watch` orphans after restarts.
