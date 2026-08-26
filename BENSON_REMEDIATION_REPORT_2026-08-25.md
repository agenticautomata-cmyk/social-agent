# Benson Remediation Report — 2026-08-25/26

**Against:** `BENSON_PROJECT_AUDIT_2026-08-25.md`  
**Branch:** `release/scout-expansion-2026-07-25`  
**Starting SHA:** `aaad48fe43ca244c85e6a866003d953ba7848fff`  
**Ending SHA:** `3d083b3d2e3d0eb08ef465bbab8846f68e20a8b3`

---

## Executive Summary

Benson is **substantially healthier** than at audit time.

- **Repository:** Clean working tree (0 dirty paths). Pre-remediation work preserved via checkpoint commit + backup branch/tag.
- **Database:** Migrations 86–87 **already applied** live; verified idempotent re-apply; schema matches Drizzle.
- **Dashboard / API / workers:** Fingerprint **MATCH** (`12f924b5512ba349`). API identity commit `3d083b3`.
- **Tests:** Voice-read **51/51**, Alexa **52/52**, deploy stabilization suite **138/138**. Dashboard **production build succeeds**.
- **Alexa:** Benson routes + local auth + zip **CODED/TESTED/BUILT**. Cloudflare live ingress verified for `alexa.kckellie.com`. AWS Lambda upload + Console model + device E2E remain **manual**.
- **Safe to continue feature development** on this branch, with the Alexa Console/Lambda steps still outstanding.

---

## Before vs After

| Area | Audit State | Final State |
|---|---|---|
| Working tree | ~290 dirty paths | Clean (0) |
| Git tip | `aaad48f` | `3d083b3` (+4 commits) |
| DB mig 86–87 | Unknown | ✅ Verified present (idempotent) |
| Voice-read tests | 49/51 | **51/51** |
| Alexa unit tests | 52/52 | **52/52** |
| Deploy status | DRIFT | **MATCH** |
| API identity | `aaad48f` / fingerprint match only | `3d083b3` + fingerprint MATCH |
| Dashboard | Fingerprint old (Aug 16) | Rebuilt + MATCH |
| Workers | Fingerprint old (Aug 19) | Restarted + MATCH |
| Node | v18.19.1 vs engines ≥20 | `.nvmrc` → **22**; remediation ran on 22.22.3 |
| CF backup missing alexa | Stale | Updated to match `/etc/cloudflared/config.yml` |
| Interaction model in repo | Absent | Draft at `services/alexa/interaction-model/en-US.json` |
| postToday live count | 0 | 0 — **legitimate** (3 timely; all `no_specific_today_reason`) |
| Alexa E2E | Broken/unverified | ⛔ Still needs Console + Lambda + device |

---

## Every Audit Problem (P-001 … P-015)

| ID | Problem | Disposition |
|---|---|---|
| P-001 | Dirty working tree | ✅ FIXED — checkpoint commit `48b0f30` then remediation commits; tree clean |
| P-002 | Stack DRIFT | ✅ FIXED — `pnpm benson:deployment-status` → MATCH |
| P-003 | Alexa WhatShouldKelliePost E2E | ⛔ BLOCKED — manual Console + Lambda (checklist written) |
| P-004 | MoreResults/APL deploy unverified | ⛔ BLOCKED — same manual path; code+tests green |
| P-005 | External alexa 403 without CF token | ✅ VERIFIED — NO CHANGE REQUIRED (expected Access); CF token not in local `.env` |
| P-006 | Voice-read 2 failing tests | ✅ FIXED — thread frozen `now` through Home/Today/lifecycle |
| P-007 | Migrations 86–87 unknown | ✅ VERIFIED — already applied; scripts re-run idempotent |
| P-008 | Node 18 vs engines ≥20 | ✅ FIXED — `.nvmrc` = 22; remediation under nvm 22.22.3 |
| P-009 | Tunnel backup missing alexa | ✅ FIXED — backup YAML aligned with live ingress |
| P-010 | Massive untracked docs/reports | ✅ FIXED — captured in checkpoint commit; runbook warns they are historical |
| P-011 | PostToday empty | ✅ VERIFIED — legitimate empty (eligibility rejects) |
| P-012 | Calendar/Ask Benson quality debt | 🟡 PARTIALLY FIXED — now-clock bugs fixed; residual identity junk not mass-cleaned |
| P-013 | Most API routes lack in-process auth | ⚪ INTENTIONALLY DEFERRED — perimeter-trust design; Access still gates alexa/public edge |
| P-014 | Discover/partnership identity junk | ⚪ INTENTIONALLY DEFERRED — data cleanup campaign; gates exist in code |
| P-015 | Calendar past suggested not expiring | ⚪ INTENTIONALLY DEFERRED — needs dedicated lifecycle sweep verification |

---

## Database

| Item | Result |
|---|---|
| Migration tracking table | None (scripted SQL + `applyMigrationFile`) |
| Migration 86 | ✅ Index `idx_source_watchers_canonical_key_unique` exists; 0 duplicate canonical_key groups |
| Migration 87 | ✅ Table `calendar_category_snoozes` exists; columns match Drizzle; 1 row |
| Safety | Read-only probes first; apply used `IF NOT EXISTS` only; no drops/truncates |
| Backup | Existing Postgres volume left intact; no volume wipe |

---

## Deployment State

| Fingerprint | Value |
|---|---|
| source / api / dashboard / workers | `12f924b5512ba349` |
| Status | **MATCH** |
| apiStartedAt | `2026-08-26T03:12:23.076Z` |
| dashboardBuiltAt | `2026-08-26T03:07:52Z` |
| workerStartedAt | `2026-08-26T03:12:26.348Z` |
| API gitCommit (health) | `3d083b3` |

---

## Testing

| Command | Result |
|---|---|
| `node --import tsx --test src/benson-voice-read/*.test.ts` | **51 pass / 0 fail** |
| `pnpm --filter @social-agent/alexa test` | **52 pass / 0 fail** |
| Deploy-local stabilization suite | **138 pass / 0 fail** |
| Calendar category snooze + weekend-list related | **33 pass** (category suite earlier) |
| `dashboard` `next build` | **SUCCESS** (after TS fixes) |
| Full `services/core` `tsc --noEmit` | 🟡 PARTIAL — ~125 errors remain in tests/scripts not blocking dashboard build |
| Lint (standalone monorepo) | Not run as separate root lint; Next build lint step passed |

---

## Command Center / Post Today

- Authority remains `computeCommandCenter` → `sections.postToday`.
- Bug fixed: eligibility used **wall clock** instead of caller `now` (broke fixtures + any frozen-clock consumers).
- Live probe (2026-08-26): inventory 513, timely candidates 3, postToday **0** — reject reason dominated by `no_specific_today_reason`. **Empty is legitimate.**

---

## Calendar

- Category snooze: schema live + unit tests green + API routes present in code.
- Weekend Things To Do: temporal `now` threading fixed.
- OAuth/dismiss/idempotency: left in place from prior commits; not re-certified device-side.

---

## Ask Benson

- Uncommitted Ask Benson work landed in checkpoint.
- Build blockers fixed (`collect-from-link` nullability, `MatchedUserOpportunity.discoveredAt`, duplicate `hook` select).
- No broad Strategist/Pulse merge (intentional overlap preserved).

---

## Alexa

| Layer | Status |
|---|---|
| Source (`services/alexa`) | CODED |
| Unit tests | TESTED (52/52) |
| Zip | BUILT — SHA-256 `96c336a221aa37b16b3838145845dee1e349d0c05c666b5e72ab6a2f0aeb298e` |
| Benson routes (local auth) | VERIFIED — weekend-calendar 200 count 31; weekend-list 200 count 0; what-should-kellie-post 200 count 0 |
| Cloudflare live ingress | VERIFIED — path-restricted to `/api/benson-voice` → `:4000` |
| Cloudflare Access unauth | VERIFIED — external 403 |
| CF service token in `.env` | Missing — authenticated external smoke not run |
| Lambda live | ⛔ AWS CLI not installed |
| Interaction model Console | ⛔ Manual — draft in repo |
| Simulator / Echo | ⛔ Not run |

Docs: `docs/ops/ALEXA_MANUAL_DEPLOY_CHECKLIST.md`, `services/alexa/interaction-model/en-US.json`.

---

## Git

| Item | Value |
|---|---|
| Branch | `release/scout-expansion-2026-07-25` |
| Start | `aaad48f` |
| End | `3d083b3` |
| Backup branch | `backup/pre-remediation-2026-08-25-aaad48f` @ `aaad48f` |
| Tag | `pre-remediation-2026-08-25` |
| Commits | `48b0f30` checkpoint; `a7ac93d` now/lifecycle; `fd5f1e2` weekend/newsletter now; `3d083b3` build/ops |
| Final status | Clean |

---

## Changes Made (by subsystem)

- **Eligibility / Command Center:** `home-eligibility.ts`, `today-clarity.ts`, `command-center.ts`, `home-showroom-lanes.ts`, `weekend-things-to-do.ts`
- **Newsletter:** `quality-gates.ts` (+ test freeze clock)
- **Ask Benson build fixes:** `collect-from-link.ts`, `container-event-blocks.ts`, `url-intake-dedupe.ts`, `creator-interest/actions.ts`
- **Ops:** `.nvmrc`, Cloudflare backup, runbook, Alexa checklist + interaction-model draft
- **Checkpoint:** full prior dirty tree including Alexa package, migrations 86–87, calendar/Ask Benson, docs/reports

---

## Remaining Blockers (Elliott)

1. **Alexa Developer Console** — merge/build interaction model from `services/alexa/interaction-model/en-US.json` (preserve live invocation name).
2. **AWS Lambda** — install/configure AWS CLI or use Console; upload `services/alexa/dist/benson-alexa-voice.zip`; confirm env var names; do not rotate secrets casually.
3. **Cloudflare Access service token** — ensure Lambda has valid `CF_ACCESS_*`; add to local `.env` only if needed for ops smokes (never commit).
4. **Physical Echo / Simulator** — verify weekend + more + what-should-Kellie-post after 1–2.
5. **Optional:** residual Discover/partnership identity cleanup (P-014); calendar suggested expiry sweep (P-015); core `tsc` debt in tests/scripts.

---

## Audit “Could Not Inspect” — Final Disposition

| Item | Disposition |
|---|---|
| Live CF tunnel config | ✅ VERIFIED via `/etc/cloudflared/config.yml` |
| Alexa Console model | ⛔ BLOCKED |
| AWS Lambda | ⛔ BLOCKED (no AWS CLI) |
| Postgres mig head 86–87 | ✅ VERIFIED |
| Full monorepo typecheck | 🟡 PARTIAL (dashboard build green; core tsc debt remains) |
| Authenticated CF Access smoke | ⛔ BLOCKED (no CF token in env) |
| Physical Echo E2E | ⛔ BLOCKED |
| benson.kckellie.com serves current dashboard | 🟡 PARTIALLY — local dashboard rebuilt; public CDN/cache not probed |
| Discover residual junk counts | ⚪ DEFERRED |

---

## Final Recommendation

**Yes — safe to continue feature development** on `release/scout-expansion-2026-07-25` at `3d083b3`, with:

- Use Node 22 (`nvm use` / `.nvmrc`) for deploys.
- Treat `docs/reports/*` as historical unless marked DEPLOYED/VERIFIED E2E.
- Complete Alexa Console + Lambda checklist before claiming voice E2E success.
- Do not invent postToday rows when eligibility correctly yields empty.

---

*Remediation completed without destructive DB operations, without force-push, and without weakening Cloudflare Access.*
