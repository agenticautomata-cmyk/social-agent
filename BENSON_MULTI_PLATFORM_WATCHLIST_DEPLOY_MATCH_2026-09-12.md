# Benson multi-platform Watchlist — Deploy MATCH closeout (2026-09-12)

**Lane:** deploy parity repair after independent verification DRIFT  
**Branch:** `release/scout-expansion-2026-07-25`  
**Safety:** no email, Telegram, pitches, forms, or billable AI

## Root cause

Independent verification (`BENSON_MULTI_PLATFORM_WATCHLIST_EXTRACTION_VERIFICATION_2026-09-11.md`) correctly observed **DRIFT**: runtime still on last acceptance deploy while the local source fingerprint had moved ahead.

| | Fingerprint |
|---|---|
| **Before (DRIFT)** | runtime `66f64b497ca70647` ← source `5174ba8ff732af66` |
| **After (MATCH)** | source = api = dashboard = workers **`5174ba8ff732af66`** |

- Fingerprint paths are code/runtime trees only (`services/*/src`, `dashboard/{app,components,lib}`, lockfiles, migrations, etc.). Root `BENSON_*.md` reports and `tsconfig.tsbuildinfo` are **not** in the fingerprint set.
- Uncommitted verification docs were therefore **not** the DRIFT cause; they were committed separately for record-keeping.
- Extraction repair commit `74a846c` (plus report tips `2edd922`, `f653d9a`) was already on the branch after the prior MATCH stamp at `66f64b497ca70647` (~2026-09-11T23:59Z). Runtime had not been redeployed to the post-acceptance source identity `5174ba8ff732af66`.

## Actions

1. Committed pending independent verification reports (`9af9cef`) — fingerprint unchanged (`5174ba8ff732af66`).
2. Ran `pnpm benson:deploy-local` → **MATCH** `5174ba8ff732af66` (api started `2026-09-12T00:14:35.530Z`).
3. Re-checked `pnpm benson:deployment-status` → exit 0, **MATCH**.

## Spot-checks (post-deploy)

| Source | Watcher | Result |
|--------|---------|--------|
| Do816 | `77484aa9-cef8-44c3-8279-0f2f2894d530` | **BLOCKED** — `displayHealth=blocked`, `reachability=blocked`, paused; explanation HTTP 403; **not** `no_yield` |
| Music Theater Heritage | `1a737b42-064d-4c6c-b566-fbeea86d7449` | **PASS / healthy** — `wordpress_tec`, verifiedYield **18**, `no_change`, effective `/events/` |

Extraction verdicts from independent verification are preserved (no code changes in this closeout).

## Commits

| Commit | Role |
|--------|------|
| `74a846c` | Multi-platform extraction repair (already on branch) |
| `2edd922` / `f653d9a` | Repair report hash tips |
| `9af9cef` | Independent verification reports (incl. multi-platform PARTIAL/DRIFT note) |
| `9c4b8ec` | Deploy MATCH closeout |

## Verdict

**MATCH `5174ba8ff732af66`.** Deploy parity restored; Do816 remains honestly blocked; MTH remains healthy at 18.
