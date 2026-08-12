# Benson Workspace — POST-DEPLOY VERIFICATION

**Date:** 2026-08-10  
**Scope:** Deploy + verify Persistent Workspace MVP only  
**Authoritative local smoke:** [`docs/reports/benson-workspace-local-smoke-2026-08-10.md`](./benson-workspace-local-smoke-2026-08-10.md)  
**Deploy path:** `pnpm benson:deploy-local` (dashboard build completed after an initial `.next` race; fingerprints finalized)

---

## Deployed fingerprint

| Role | Fingerprint | Timestamp |
|------|-------------|-----------|
| **Source / MATCH** | `590b35e98495293a` | checked `2026-08-10T05:57:01Z` |
| API | `590b35e98495293a` | started `2026-08-10T05:37:49Z` |
| Workers | `590b35e98495293a` | started `2026-08-10T05:37:59Z` |
| Dashboard | `590b35e98495293a` | built `2026-08-10T05:51:58Z` |
| Deployed marker | `590b35e98495293a` | `2026-08-10T05:52:04Z` |

`benson:deployment-status` → **MATCH** (“Source and runtime fingerprints match.”)

---

## Database targeted

Resolved from the **running** API + worker process environments (not assumed from docs):

| Process | DATABASE_URL (redacted) |
|---------|-------------------------|
| API (`tsx src/server.ts`) | `postgres://social_agent@localhost:5433/social_agent` |
| Workers (`tsx src/benson.ts`) | `postgres://social_agent@localhost:5433/social_agent` |
| Repo `.env` | same host/db |

**Target:** `localhost:5433` / database `social_agent`

---

## Migration 85 status

| Phase | Result |
|-------|--------|
| **Before deploy** | **Already applied** — `benson_conversations` present with all expected columns + indexes; **297** conversation rows; **0** backfill gaps vs distinct `benson_chat_messages.conversation_id` |
| **Action taken** | **Did not reapply** `85_benson_conversations.sql` / `migrate:benson-conversations` |
| **After deploy** | Unchanged — table/indexes intact; conversations=297; missing_backfill=0 |
| Migration 84 | **Not modified / not reapplied** |

### Conversation backfill result

**PASS** — backfill complete before deploy; still complete after deploy (`missing_backfill=0`).

---

## Build-unblocker verification

Reviewed before deploy:

| File | Change nature | Runtime semantics |
|------|---------------|-------------------|
| `services/core/src/ask-benson/instagram-intake.ts` | `blockReasonForFailure` return type → `UrlAccessBlockReason`; Instagram-only codes map to `forbidden`/`null`; `description ?? null` → `?? undefined` | Diagnostics enum / type alignment only; Instagram fetch/OCR path unchanged; `accessBlocked` still derived from failure-code list |
| `services/core/src/ask-benson/url-intake-pipeline.ts` | Add `video_transcript` to `UrlFetchTier` | Label union widening for diagnostics; no new fetch tier behavior |

**Verdict:** minimal typing/schema compatibility only — **safe to deploy**. (Instagram session early-return + `instagram_session` tier remain part of the approved Workspace working tree, not introduced solely as unblockers.)

---

## API / dashboard / worker health

| Check | Result |
|-------|--------|
| API `:4000/health` | **200** |
| Dashboard `:3000/` | **200** |
| Listeners | `:4000` API node; `:3000` next-server |
| Worker host | One Benson workers process tree (`tsx` → `src/benson.ts`) |
| Gmail workers | **healthy**: `gmail-inbox-sync`, `gmail-inbox-digest`, `gmail-discovery-sync` |
| Benson Pulse worker | **healthy** (`benson-pulse`) |
| `/api/benson-pulse/latest` | **200** |
| `/actions` dashboard | **200** |
| Fingerprints MATCH | **PASS** |
| Migration/schema/import/runtime blockers | **None** observed on healthy paths |

---

## Workspace persistence

Conversation under test (existing, no paid re-research):

| ID | Value |
|----|-------|
| conversationId | `ec1601a2-8219-49c0-bfc4-59d6e40daef2` |
| assistantMessageId | `72be27b5-05ae-4cad-a73c-17d62bac6637` |

| Check | Result |
|-------|--------|
| `/ask-benson` loads | **PASS** |
| Recent conversations load | **PASS** (30 listed; SCHEELS idx=0) |
| Opening persisted conversation restores messages | **PASS** (2 messages) |
| Persisted Tier-1 decision card | **PASS** — “What Goes Around Comes Around at Scheels” / `uiCard.type=decision_brief` |
| Show details expands | **PASS** (Story angles + Next actions visible) |
| No duplicate assistant completion | **PASS** (1 assistant) |
| Terminal remains terminal after reload | **PASS** (`researchStatus=complete`) |
| `last_message_at` unchanged by load/re-render | **PASS** (`2026-08-10T04:05:43.748Z` → same) |

---

## Mobile full-screen (~390×844)

| Check | Result |
|-------|--------|
| Workspace fills practical viewport | **PASS** |
| StudioMobileNav / tabs hidden | **PASS** (`display:none`, height 0) |
| FAB hidden | **PASS** |
| Booth announcement hidden inside Workspace | **PASS** (`display:none`, height 0; dismiss unset) |
| Booth announcement still on `/home` | **PASS** (visible + Dismiss) |
| One primary conversation scroller | **PASS** |
| Composer visible at bottom without dismissing banner | **PASS** (`composerBottom === 844`) |
| No floating mini-chat | **PASS** |

---

## Provider terminal-status

| Check | Result |
|-------|--------|
| Research complete shown | **PASS** |
| No “Benson is still reading that link” | **PASS** |
| No Instagram/TikTok-specific copy on SCHEELS | **PASS** |
| Original URL/provider provenance present | **PASS** (`provider=generic`, SCHEELS `originalUrl`) |
| Clothes Mentor / generic cannot render Instagram-specific copy | **PASS** (dashboard `ask-benson-types.test.ts`) |

**Note:** Pre-cleanup persisted SCHEELS assistant still had `providerStatus.status=processing` from before the terminal-status fix. For verification (no paid re-research), that single row’s status was aligned to `complete` while preserving provider/URL/diagnostics. New terminal patches finalize via the shared resolver in deployed code.

---

## Correlation / fencing code verification

Deployed tests + code review (no paid research):

| Invariant | Evidence | Result |
|-----------|----------|--------|
| Terminal chat patch requires `terminal.applied === true` | `pipeline.ts` early `return` when `!terminal.applied` | **PASS** |
| Match requires partnershipId + researchRunId | `nonTerminalOutputCondition` + `patchBensonAssistantMessagesTerminal` | **PASS** |
| No partnershipId-only historical sweep | Terminal tests + clarify path only | **PASS** |
| Stale run patches zero messages | `conversations-terminal.test.ts` | **PASS** |
| Race-safe join/catch-up present | `joinActivePartnershipResearchForChat` / `catchUpAssistantToTerminalPartnership` | **PASS** |
| In-place terminal persistence does not bump `last_message_at` | Terminal tests + live reload check | **PASS** |

Targeted suites: `conversations-terminal.test.ts`, `provider-status.test.ts`, `research-correlation.test.ts` — **11/11 pass**.

---

## Producer-authority regression status

| Check | Result |
|-------|--------|
| Migration 84 not reapplied/modified | **PASS** |
| Durable discovery skip table present (`creator_skipped_records`) | **PASS** (9 rows; `skip_identity_key` present) |
| `/menus` remains non-partnership | **PASS** (`detect.test.ts` + `url-intelligence.test.ts` menus cases) |
| Action Center loads | **PASS** |
| Benson Pulse loads | **PASS** (`/api/benson-pulse/latest` 200; worker healthy) |
| AI budget/throttling | Untouched |
| Email/actionability producer-authority logic | Untouched in this deploy |

---

## Unexpected findings

1. **`benson:deploy-local` dashboard build race** — first attempt failed during `next build` with `ENOENT` on `.next/build-manifest.json` (concurrent rebuild contention). A subsequent build completed; dashboard was started from that build and fingerprints written to restore **MATCH**. API/workers had already restarted successfully in the first pass.
2. **Stale pre-cleanup `providerStatus=processing`** on the smoke SCHEELS assistant — expected historical residue; status aligned for verification without re-running research. Deployed code + UI finalize prevent recurrence for new terminals.
3. Transient historical log line `production-start-no-build-id` during the failed intermediate start; current dashboard is healthy on the new build.

---

## Final verdict

**DEPLOYMENT VERIFIED**

STOP — no later-phase Workspace work started.
