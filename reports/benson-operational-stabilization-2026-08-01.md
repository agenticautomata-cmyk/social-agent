# Benson Operational Stabilization — 2026-08-01

Stabilization pass only. No new creator features. No commit/push pending Elliott review.

## 1. Disk root causes

Root filesystem was ~96% full (~2.4 GiB free) from a mix of:

| Item | Classification | Notes |
|------|----------------|-------|
| Cursor `state.vscdb` (~4.3G) + backup (~1.3G) | cache / IDE state | Active DB kept; backup removed |
| Cursor / Playwright browser caches | cache | Old chromium-1148 removed |
| npm `_cacache` / `_npx` | package-manager cache | Cleared |
| Duplicate Cursor `.deb`s in Downloads | stale download | Removed |
| `dashboard/.next/cache`, `site/.next` | rebuildable output | Cleared |
| Old `.acceptance` screenshots | generated report / acceptance artifact | Removed |
| Old newsletter generated reports | generated report | Removed stale set |
| Docker build cache | unused Docker build cache | Pruned (~claimed 7.9GB; df barely moved — shared layers) |
| Dangling Docker images | unused Docker image | ~85MB unique reclaim |
| Gzipped `backups/pre-early-signals-*.sql` | required backup (compressed) | 254M → ~57M `.sql.gz` |
| `/var/log/journal` (~1.8–1.9G) | stale log | **Needs sudo vacuum** — not removed |
| Postgres + Voicebox volumes | required production data | **Not touched** |
| Instagram `storage-state.json` | required production data | **Not touched** |
| Private WAVs / Voicebox | required | **Not touched** |

## 2. Disk before / after

| Metric | Before | After |
|--------|--------|-------|
| Free | ~2.4 GiB | **~11 GiB** |
| Use% | ~96% | **81%** |
| Target | ≥15 GiB / &lt;85% | **&lt;85% met; ≥15 GiB not met** |

Remaining path to ≥15 GiB (Elliott sudo):

```bash
sudo journalctl --vacuum-size=200M
```

Expected reclaim ~1.6–1.7 GiB → ~12.5–13 GiB free. Additional headroom still requires careful review of Cursor `state.vscdb` (active) or Docker image consolidation **without** removing running Postgres/Voicebox images.

## 3. Deleted files / caches and sizes (exact safe set)

| Path / action | Approx size recovered |
|---------------|----------------------|
| Cursor `state.vscdb.backup` | ~1.3 GiB |
| Cursor logs + old Playwright chromium-1148 / headless_shell-1148 | ~0.5–1 GiB |
| npm `_cacache` + `_npx` | ~0.5–1 GiB |
| Duplicate Cursor `.deb` downloads | ~0.3–0.5 GiB |
| `.git/lost-found`, `site/.next`, `dashboard/.next/cache` | ~0.2–0.5 GiB |
| Old generated newsletter reports + `.acceptance` | ~0.1–0.3 GiB |
| pip / typescript / firefox snap / bun caches; old cursor-agent | ~0.2–0.4 GiB |
| Gzip SQL backup | ~197 MiB (kept `.sql.gz`) |
| Docker dangling images | ~85 MiB unique |
| Docker build-cache prune | claimed ~7.9 GiB; **df barely moved** |

**Not deleted:** Postgres volumes, running Postgres/Voicebox images, `.env`, source, Instagram session, private WAVs, active Cursor `state.vscdb`.

## 4. Deployment-parity implementation

Added:

- `services/core/src/deployment-parity/` — source fingerprint from relevant trees (API/core/workers/dashboard/migrations/lockfile/runtime lib), **not** git commit alone
- CLIs: `cli-fingerprint.ts`, `cli-status.ts`, `cli-write-fingerprint.ts`
- `pnpm benson:deployment-status` → `scripts/benson-deployment-status.sh`
- `pnpm benson:deploy-local` → `scripts/benson-deploy-local.sh`
  1. PID-file deploy lock (rejects concurrent deploys; **not flock** — flock FDs were inherited by API and stuck the lock)
  2. Pre-deploy parity JSON
  3. Targeted tests (heartbeat + scheduler)
  4. Force API restart
  5. Workers restart
  6. Dashboard build + restart
  7. Health waits + public checks (best-effort)
  8. Runtime fingerprint write + MATCH/DRIFT report
- `benson_api_should_skip_start` now requires **fingerprint match**, not commit hash
- Control Tower surfaces `deploymentParity` and **“Source changes are not deployed.”** on DRIFT

## 5. Source / runtime fingerprint results

Final verified state:

```
status: MATCH
sourceFingerprint: f1f294cc4f6bb56d
apiFingerprint:    f1f294cc4f6bb56d
workerFingerprint: f1f294cc4f6bb56d
dashboardFingerprint: f1f294cc4f6bb56d
```

Commands: `pnpm benson:deployment-status` (exit 0 on MATCH).

## 6. Early-signals FK root cause

- **Table / constraint:** `worker_job_runs` → `worker_job_runs_worker_id_fkey` referencing `worker_heartbeats(worker_id)`
- **Missing identity:** `early-signals` was **not** in `PRODUCTION_WORKERS`, so `ensureWorkerRegistry()` never inserted it
- **Failure mode:** cron `recordWorkerRunStart('early-signals')` inserted into `worker_job_runs` → FK violation
- **Processing vs logging:** pipeline could succeed in some paths, but run logging failed; retries re-ran work and spammed errors
- **Startup order:** job-run write before canonical registration

## 7. Early-signals fix and three-cycle proof

**Fix:**

- Added `early-signals` + `curator-watchlist-check` to `PRODUCTION_WORKERS`
- Idempotent `ensureWorkerRegistered(workerId)`
- `recordWorkerRunStart` always registers the specific worker **before** insert

**Tests:** `services/core/src/worker-heartbeat/worker-heartbeat.test.ts` — 4/4 pass

**Live proof (3 consecutive successful runs, no FK):**

| Cycle | runId | status | durationMs |
|-------|-------|--------|------------|
| 1 | `89771593-5e11-448e-82e5-2d8bf98e7365` | success | ~11004 |
| 2 | `1b3ebb18-34a8-48c4-a261-02a90e674599` | success | ~8633 |
| 3 | `42d2077b-8434-42b1-9d5d-b0284605b41d` | success | ~8643 |

Plus a subsequent natural cron success (`30650c8a-…`, ~18s). Recent FK error count (2h window): **0**. Heartbeat rows for `early-signals`: **1** (no duplicates).

## 8. Watchlist scheduler implementation

- Worker identity: **`curator-watchlist-check`** (registered in definitions + `services/workers/src/benson.ts`)
- Interval: **4 hours** + 0–10 min jitter; initial delay ~3 min + jitter
- Exclusive lock shared with manual Check now (`acquireCuratorWatchlistLock`)
- Max **3** sources / cycle; paused/disabled skipped; auth backoff; no historical crawl
- Live marker: `.logs/pre-alpha/curator-watchlist-scheduler.live` under **`BENSON_REPO_ROOT`** (fixed cwd bug where workers wrote under `services/workers/.logs`)
- UI label: **“Next scheduled check”** when live; else **“Next check when scheduler is enabled”**

## 9. Scheduler persistence / reboot result

- `benson-pre-alpha.service` (user systemd): **active (exited)** — one-shot boot starter
- `benson-pre-alpha-health.timer`: **active**
- Worker + API restarted with `BENSON_REPO_ROOT` set; live marker rewritten and readable by API
- **Full host reboot not performed** (avoidable risk during disk pressure). Persistence validated via service unit active + worker restart reclaiming marker/lock paths.
- Postgres / Voicebox **not** restarted

## 10. JasFoodJourney next real scheduled run

| Field | Value |
|-------|-------|
| Canonical source | `instagram:account:jasfoodjourney` (exactly **one** row) |
| Watcher id | `6cd867ad-9bdf-441b-b30f-d51bed11376b` |
| checkFrequencyMs | **14400000** (4h; aligned to policy) |
| lastSuccessfulCheck | `2026-08-02T03:12:04.232Z` |
| **nextCheckEstimate** | **`2026-08-02T07:12:04.232Z`** |
| nextCheckLabel | `Next scheduled check` |
| schedulerLive | `true` |
| sessionStatus | `ready` |
| authenticationRequired | `true` (stale flag; session ready — monitor next cycle) |

## 11. Gmail disconnected UX

Truthfully shown:

- Status: **error / disconnected** (revoked)
- Setup copy: newsletters / inbox sync / live pitch sending paused; simulate mode active
- Email settings panel: paused bullets + **Reconnect Gmail**
- Control Tower: Gmail reconnect link + oauth warnings
- Pre-alpha: `liveSendBlocked: true`, outreach `mode: simulate`, `liveReady: false`

**Do not claim Gmail is fixed** until Elliott completes OAuth.

## 12. Exact Gmail reconnect route

**Dashboard route:** [`/email/settings`](https://benson.kckellie.com/email/settings)

Local: `http://127.0.0.1:3000/email/settings`

OAuth callback (already configured): `https://api.kckellie.com/api/outreach/gmail/oauth/callback`

After reconnect (Elliott): verify tokens saved → one minimal health check → process **new** messages only (no history backfill) → restore live-send only after health passes → resolve disconnected incident → confirm single sync worker.

## 13. Health results

| Check | Result |
|-------|--------|
| Local dashboard `:3000` | **200** |
| Local API `:4000/health` | **200** |
| Public API `https://api.kckellie.com/health` | **200** |
| Public dashboard `https://benson.kckellie.com/` | **200** |
| Postgres (`social_agent_postgres`) | healthy (8h+) |
| Voicebox | healthy (8h+) — not restarted |
| Workers | running (`src/benson.ts`) |
| Deployment fingerprints | **MATCH** |
| early-signals | 3+ clean success runs; no recent FK |
| Watchlist scheduler | live; label real |
| @jasfoodjourney | one source |
| Don Felder suppression | verified (`verify-don-felder-suppression.ts`) |
| Gmail | disconnected (accurate) |
| Calendar | connected (`/api/calendar/status` ok) |
| TikTok | connected |
| Instagram session | `sessionStatus: ready` |
| 500/502/504 | none observed on checked endpoints |
| Crash loop | none |

## 14. CPU / RAM / swap / load

Snapshot during acceptance (~22:17 local):

| Metric | Value |
|--------|-------|
| Load avg | ~9.5 / 10.7 / 11.7 (elevated; Cursor IDE + kellie-cam `tsc` + workers) |
| Mem | 7.6 Gi total; ~6.2 Gi used; ~0.5 Gi free; ~1.4 Gi available |
| Swap | 4.0 Gi; ~3.2 Gi used |

Not a Benson crash loop — dominant CPU was Cursor zygotes + concurrent TypeScript builds. Monitor after Cursor idle.

## 15. Tests

| Suite | Result |
|-------|--------|
| `worker-heartbeat/worker-heartbeat.test.ts` | pass (4) |
| `curator-watchlist/scheduler.test.ts` | pass (3) |
| `verify-early-signals-cycles.ts` (3 live cycles) | pass |
| `verify-don-felder-suppression.ts` | pass |

## 16. Files changed (stabilization-focused)

- `services/core/src/deployment-parity/**`
- `services/core/src/worker-heartbeat/{definitions,index}.ts` + `worker-heartbeat.test.ts`
- `services/core/src/curator-watchlist/{scheduler,scheduler.test,store,types}.ts`
- `services/workers/src/workflows/curator-watchlist-check.ts` + `benson.ts`
- `services/core/src/creator-interest/actions.ts` (no auto Telegram research-complete)
- `services/core/src/control-tower/index.ts` + dashboard Control Tower + Gmail panel
- `scripts/benson-deploy-local.sh`, `scripts/benson-deployment-status.sh`, `scripts/benson-runtime-lib.sh`
- `package.json` scripts: `benson:deployment-status`, `benson:deploy-local`
- Verification helpers under `services/core/src/scripts/verify-early-signals-cycles.ts`, `stabilization-db-snapshot.ts`, `set-jas-check-frequency.ts`

Working tree also contains the prior connected-workflow changes (large uncommitted set).

## 17. Git status

- Branch: `release/scout-expansion-2026-07-25`
- Large dirty tree (~340 porcelain entries) — connected workflow + this stabilization
- **No commit created**
- **No push**

## 18. Remaining blockers

1. **Disk still ~11 GiB free** — run `sudo journalctl --vacuum-size=200M` for more; target 15–20 GiB still open
2. **Gmail OAuth** — Elliott must open `/email/settings` and reconnect; do not bypass
3. **Instagram `authenticationRequired: true`** while `sessionStatus: ready` — clear/reconcile on next healthy scheduled check if it blocks due logic
4. **Host load / swap pressure** — Cursor + builds; not Benson crash, but reduces headroom
5. **Full reboot proof** optional — systemd units active; full reboot deferred
6. **Do not resume feature development** until Elliott accepts this report and approves any commit

---

**Operator commands**

```bash
pnpm benson:deployment-status
pnpm benson:deploy-local   # after source changes; does not restart Postgres/Voicebox
```
