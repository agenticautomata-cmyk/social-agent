# Benson Workspace — LOCAL SMOKE AUDIT

**Date:** 2026-08-10  
**Scope:** Persistent Workspace MVP acceptance against the real local Benson stack and connected DB  
**Deployed:** **No** (explicitly not run)  
**Stack action during smoke:** local pre-alpha stop/start with dashboard rebuild only (`pre-alpha-start-prod.sh --build`) — **not** `benson:deploy-local`  
**Database:** `postgres://social_agent@localhost:5433/social_agent`  
**Plan reference:** [`docs/plans/benson-workspace-ux-plan.md`](../plans/benson-workspace-ux-plan.md)

---

## Verdict

**PASS** — primary persistent async research, join/race, provider copy, and Workspace UX checks succeeded after two local code fixes found during the smoke.

API/DB automated checks: **29 / 29 pass**  
Browser UX checks: **pass** (see soft notes)

---

## Identifiers

| Item | Value |
|------|-------|
| **conversationId** | `ec1601a2-8219-49c0-bfc4-59d6e40daef2` |
| **assistantMessageId** | `72be27b5-05ae-4cad-a73c-17d62bac6637` |
| **partnershipId** | `341940fa-edca-4bdf-b44b-d06b2b63327d` |
| **researchRunId** | `9244bc61-9fe1-4003-9ef5-58f6adfd7331` |
| **operator creatorId** | `58f72ca2-32b2-4a74-b3dc-25d0f66cc15f` |
| **SCHEELS × WGACA URL** | `https://www.scheels.com/c/all/b/what%20goes%20around%20comes%20around?r=storeAvailability%3A88` |
| **Terminal status** | `complete` |
| **Terminal wait** | 48219 ms |
| **last_message_at (ask → after terminal)** | `2026-08-10T04:05:43.748Z` → `2026-08-10T04:05:43.748Z` (unchanged) |

Machine-readable check dump: `/tmp/workspace-smoke-report.json`

---

## Environment

| Component | Result |
|-----------|--------|
| API `:4000` | Healthy before/after local restart |
| Dashboard `:3000` | Healthy; production `next start` rebuilt during smoke |
| Workers | Restarted with pre-alpha stack |
| Postgres | Left running on `:5433` (not stopped) |
| Production data | Not modified beyond local SCHEELS research reset (`queued` → new run) for async exercise |

---

## PRIMARY — persistent async research

Procedure:

1. Reset local SCHEELS partnership `341940fa-…` to `research_status=queued` (clear run fencing) so a new paid cycle can start.
2. `POST /api/ask-benson` with SCHEELS URL into a fresh `conversationId`.
3. Verify provisional bind + single `researchRunId` while status is non-terminal.
4. Leave Workspace closed (no chat brief polling).
5. Wait for partnership terminal via DB only.
6. Reopen via `GET /api/ask-benson/conversations/:id/messages`.
7. Confirm terminal card/history without client poll repair.

| Check | Result | Detail |
|-------|--------|--------|
| Ask HTTP ok | **PASS** | status=200 |
| Fresh conversationId returned | **PASS** | `ec1601a2-…` |
| Provisional assistant messageId | **PASS** | `72be27b5-…` |
| Expected partnershipId | **PASS** | `341940fa-…` |
| Creator ownership matches operator | **PASS** | `58f72ca2-…` |
| User message persists | **PASS** | 1 user row |
| Exactly one assistant after ask | **PASS** | 1 assistant row |
| Assistant bound to `researchRunId` | **PASS** | `9244bc61-…` |
| Non-terminal after bind | **PASS** | `researching` |
| One research execution (partnership run == assistant run) | **PASS** | match |
| Conversation owned by operator | **PASS** | |
| Research reaches terminal while closed | **PASS** | `complete` in ~48s |
| Terminal `researchRunId` unchanged | **PASS** | |
| Reopen GET ok | **PASS** | status=200 |
| Same conversation resumes | **PASS** | 2 messages |
| No duplicate assistant completion | **PASS** | 1 assistant |
| Same assistant message id | **PASS** | `72be27b5-…` |
| Stored assistant terminal from history (no poll) | **PASS** | `complete` |
| `decisionBrief` from server history | **PASS** | What Goes Around Comes Around at Scheels |
| `uiCard` Tier-1 from history | **PASS** | `decision_brief` |
| `last_message_at` not bumped by background completion | **PASS** | identical timestamps |
| Conversation listed in Recent | **PASS** | idx=0 |
| Recent not reordered solely by terminal | **PASS** | top from ask-time insert |

---

## JOIN / RACE

Deterministic local DB exercise (no additional paid research):

| Check | Result | Detail |
|-------|--------|--------|
| Two assistants bind same `researchRunId` | **PASS** | `3c0c26fb-dfaf-45da-81f0-83be8ecbe89d` |
| One logical run | **PASS** | shared run id |
| Terminal races ahead of 2nd bind; 2nd catch-up | **PASS** | catch-up applied |
| No partnershipId-only historical patching | **PASS** | other-run message stayed `researching` |

---

## WORKSPACE UX (browser)

Target: `http://127.0.0.1:3000/ask-benson?conversation=ec1601a2-8219-49c0-bfc4-59d6e40daef2`

### Desktop

| Check | Result |
|-------|--------|
| Recent lists persisted conversations | **PASS** |
| Switching conversations reloads correct messages | **PASS** (SCHEELS → Clothes Mentor) |
| Tier-1 card compact (`Research complete`, Open partnership) | **PASS** |
| Show details expands (story angles / next actions) | **PASS** |

### Mobile-responsive (390×844)

| Check | Result |
|-------|--------|
| `benson-workspace-active` on body | **PASS** |
| StudioMobileNav / `.studio-mobile-tabs` hidden | **PASS** (`display:none`, height 0) |
| FAB launcher hidden inside Workspace | **PASS** |
| One primary conversation scroller | **PASS** |
| Composer near bottom of viewport | **PASS** (after dismissing booth banner) |
| No floating mini-chat | **PASS** |

---

## PROVIDER STATUS

| Check | Result | Detail |
|-------|--------|--------|
| SCHEELS normalized provider never Instagram/TikTok-specific | **PASS** | `provider=generic` |
| Clothes Mentor normalized provider never Instagram/TikTok-specific | **PASS** | `provider=generic` |
| Browser page has no Instagram-carousel copy | **PASS** | |

---

## Fixes applied during smoke (local only)

These were required for reopen/Tier-1 acceptance and are **not** a deploy:

1. **Creator ownership (ask fast path)** — URL opportunity fast path previously used `creatorAccounts.limit(1)`, writing chat under a non-operator creator (`b5799240-…`). Conversation APIs use `resolveOperatorCreatorId()` (`58f72ca2-…`), so reopen returned 404. Fast path now resolves the operator creator.
2. **History message mapping** — `BensonWorkspace.messageFrom` only read `outputJson` / `output_json`, but conversation APIs return `output`. Mapper now accepts `output`, restoring Tier-1 `decisionBrief` / `uiCard` on reload.

First smoke attempt (pre-fixes) failed reopen/Recent listing (10 fails). Second run after fixes: **29/29 API/DB pass** + browser UX pass.

---

## Soft notes / follow-ups (non-blocking)

1. ~~Completed SCHEELS assistant still showed generic processing copy~~ — **fixed** in PRE-DEPLOY CLEANUP (terminal providerStatus + display finalize via shared resolver).
2. ~~Booth announcement banner pushed mobile composer below the fold~~ — **fixed** in PRE-DEPLOY CLEANUP (Workspace suppresses `.studio-update-announcement` + fills remaining viewport height).
3. Orphan conversation from the first (wrong-creator) attempt may remain under creator `b5799240-…` and is intentionally invisible to the operator Recent list.

---

## PRE-DEPLOY CLEANUP

**Date:** 2026-08-10 (post-smoke)  
**Deployed:** **No**

### Files changed

| Area | Files |
|------|-------|
| Terminal provider status | `services/core/src/ask-benson/provider-status.ts`, `conversations.ts`, `index.ts`, `provider-status.test.ts`, `conversations-terminal.test.ts` |
| Shared export | `services/core/package.json` (`./ask-benson/provider-status`) |
| Display finalize (same resolver) | `dashboard/lib/ask-benson-types.ts`, `dashboard/lib/ask-benson-types.test.ts`, `dashboard/components/benson-chat-panel.tsx` |
| Mobile Workspace banner | `dashboard/app/globals.css`, `dashboard/components/studio-update-announcement.tsx` |
| Build unblockers (unrelated type fixes needed for local `next build`) | `services/core/src/ask-benson/instagram-intake.ts`, `url-intake-pipeline.ts` (`video_transcript` tier) |
| This report | `docs/reports/benson-workspace-local-smoke-2026-08-10.md` |

### Provider terminal-status result

**PASS**

- Terminal chat SQL patch now flips `providerStatus.status` (top-level + `collection`) via `providerStatusValueForTerminalResearch` from the shared resolver: `complete` → `complete`; `needs_verification` / `failed` → `terminal_failure`.
- Original URL / provider / diagnostics provenance preserved (merge-only status field).
- UI `askBensonProviderStatusCopy(state, researchStatus)` finalizes stale processing rows through the same resolver so completed research never renders “still reading…” / fallback-active copy.
- Browser reopen of SCHEELS conversation `ec1601a2-…`: **Research complete**, **no** “still reading that link”.

### Mobile banner / composer result

**PASS** @ 390×844

| Check | Result |
|-------|--------|
| Banner present on normal route (`/home`) with dismiss unset | **PASS** (`display:block`, height ~319) |
| Workspace suppresses announcement chrome | **PASS** (`display:none`, height 0; dismiss still unset) |
| One active conversation scroller | **PASS** |
| Composer visible at bottom without dismissing banner | **PASS** (`composerBottom === 844`) |
| No bottom tabs | **PASS** |
| No FAB (`Open Ask Benson workspace`) | **PASS** |
| No floating mini-chat | **PASS** (workspace panel aria-label only) |

### Targeted test results

| Suite | Result |
|-------|--------|
| `services/core` `provider-status.test.ts` | **PASS** (incl. terminal finalize + provenance) |
| `services/core` `conversations-terminal.test.ts` | **PASS** (incl. DB patch finalizes processing → complete/failed) |
| `dashboard` `ask-benson-types.test.ts` | **PASS** (incl. terminal researchStatus suppresses processing copy) |

### Verdict

**READY FOR DEPLOY**

### Explicit non-actions (cleanup)

- No `benson:deploy-local` / production deploy
- No paid SCHEELS research re-run
- Producer-authority systems untouched
- Workspace scope not expanded beyond these two gaps (+ minimal type fixes required to rebuild dashboard locally)

---

## Explicit non-actions

- No `benson:deploy-local` / production deploy
- No production remote data changes
- AI budget / throttle systems untouched
- Producer-authority (Migration 84) systems not revisited
