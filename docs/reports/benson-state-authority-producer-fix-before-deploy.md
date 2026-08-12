# Benson State Authority Producer Fix — Before Deploy Report

**Date:** 2026-08-10  
**Status:** READY FOR DEPLOY APPROVAL (pending human review)  
**Scope:** Producer-authority fixes for email actionability + discovery skip durability. No Workspace UI changes. No deploy performed.

**Approved audit:** [`benson-state-authority-producer-audit.md`](./benson-state-authority-producer-audit.md)

---

## Summary

Implemented authoritative producer gates so upstream semantic decisions propagate to Home → Do now and discovery/Pulse surfaces. False-positive Reply tasks for MyyShop verification, REKLAIM account confirmation, ShopMy application receipt, and the SCHEELS pending creator application are eliminated at the producer layer without altering read/unread state or hiding symptoms in UI.

Don Felder-style skips are now enforced on `getLatestDiscovery()` / Benson Pulse via event-level skip matchers and durable `skip_identity_key` tombstones.

---

## Files / migration changed

### Migration
- [`db/migrations/84_benson_state_authority.sql`](../../db/migrations/84_benson_state_authority.sql)
- Runner: [`services/core/src/scripts/migrate-benson-state-authority.ts`](../../services/core/src/scripts/migrate-benson-state-authority.ts)

### Email action authority
- [`services/core/src/gmail-inbox/inbound-actionability.ts`](../../services/core/src/gmail-inbox/inbound-actionability.ts) — new
- [`services/core/src/gmail-inbox/inbound-actionability.test.ts`](../../services/core/src/gmail-inbox/inbound-actionability.test.ts) — new
- [`services/core/src/gmail-inbox/sponsor-inbox-pipeline.ts`](../../services/core/src/gmail-inbox/sponsor-inbox-pipeline.ts) — write-path gate
- [`services/core/src/gmail-inbox/sync-replies.ts`](../../services/core/src/gmail-inbox/sync-replies.ts) — write-path gate + actionable unread count
- [`services/core/src/gmail-inbox/digest-promote.ts`](../../services/core/src/gmail-inbox/digest-promote.ts) — write-path gate
- [`services/core/src/action-center/collect.ts`](../../services/core/src/action-center/collect.ts) — read-path defense in depth
- [`services/core/src/pre-alpha/studio-pulse.ts`](../../services/core/src/pre-alpha/studio-pulse.ts) — actionable unread count only
- [`services/core/src/schema.ts`](../../services/core/src/schema.ts) — `email_intent`, `actionability` columns

### Discovery skip authority
- [`services/core/src/creator-skip/fingerprint.ts`](../../services/core/src/creator-skip/fingerprint.ts) — venue-aware event identity
- [`services/core/src/creator-skip/index.ts`](../../services/core/src/creator-skip/index.ts) — durable `skip_identity_key`, event-level matchers (removed performer-wide default)
- [`services/core/src/benson-discovery/index.ts`](../../services/core/src/benson-discovery/index.ts) — skip filter on read
- [`services/core/src/benson-discovery/run.ts`](../../services/core/src/benson-discovery/run.ts) — skip filter before snapshot write
- [`services/core/src/benson-discovery/skip-filter.test.ts`](../../services/core/src/benson-discovery/skip-filter.test.ts) — new
- [`services/core/src/suppression-audit/index.ts`](../../services/core/src/suppression-audit/index.ts) — restore by identity when content item deleted

### Reconciliation / ops
- [`services/core/src/scripts/reconcile-state-authority.ts`](../../services/core/src/scripts/reconcile-state-authority.ts) — backfill without touching `is_read`
- [`services/core/package.json`](../../services/core/package.json) — `migrate:benson-state-authority`, `reconcile:state-authority`, test glob

---

## Final actionability model

| Value | Meaning | Creates Home → Do now Reply? |
|-------|---------|------------------------------|
| `reply_required` | An actual response is requested: direct question, requested dates/rates/assets/info/confirmation, terms requiring response, or a verified human sponsor-thread continuation | **Yes** (one task per inbound row) |
| `user_action_required` | Reserved for explicit user-required non-reply actions | No (not used in this slice) |
| `waiting_followup` | Application received/pending/reviewing, “we’ll contact you,” or explicit no-response-needed state | **No** — no immediate Reply; follow-up only when due policy exists |
| `none` | Transactional/security/newsletter/unknown or informational creator-business mail without response evidence | **No** |

**Write path:** `resolveInboundActionability()` in `inbound-actionability.ts` classifies via existing `classifyEmailIntent()` plus generic waiting/response evidence and verified-thread context. Creator-business intent alone is not actionable. Strong blocked intent overrides thread linkage; waiting evidence overrides creator-business classification.

**Read path:** `collectActionCenterItems()` uses `isReplyActionable(actionability)` — never synthesizes Reply from unread alone, `sponsors@` routing, or `sponsors_inbox_pipeline` matchKind.

**Unread/read preserved:** actionability is independent of `is_read`. Cleanup backfill does not set `is_read=true`.

---

## Existing email cleanup results (connected DB)

Migration 84 applied successfully. Reconciliation run:

| Metric | Value |
|--------|-------|
| Inbound rows total | 6 |
| Rows backfilled (intent/actionability) | 6 (first partial run; idempotent re-run updated 0) |
| **Bad Reply tasks before the producer-authority fix** | **4** unread rows → all became Reply tasks |
| **Bad Reply tasks before this correction** | **1** remaining — SCHEELS pending application |
| **Bad Reply tasks after reconciliation** | **0** |
| Reconciliation result for this correction | 1 row updated; Reply tasks 1 → 0 |

### Per-row final state

| Subject | Intent | Actionability | isRead |
|---------|--------|---------------|--------|
| Email address verification (MyyShop) | `security_auth` | `none` | false (unchanged) |
| Customer account confirmation (REKLAIM) | `transactional_account` | `none` | false (unchanged) |
| Thank you for your ShopMy application | `platform_creator` | `waiting_followup` | false (unchanged) |
| Your application is pending! (SCHEELS) | `creator_business` | `waiting_followup` | false (unchanged) |
| You've been accepted! (ShopMy) | `unknown` | `none` | false (unchanged) |

**Action center verification:** `computeActionCenter().doNow` contains **zero** `Reply:` items. Specifically:
- MyyShop Reply: 0
- REKLAIM Reply: 0
- ShopMy application Reply: 0
- SCHEELS pending application Reply: 0

---

## Don Felder root-cause fix

**Root cause:** `getLatestDiscovery()` returned frozen `benson_discoveries.items_found` JSON without applying `creator_skipped_records` matchers. Benson Pulse only date-filtered client-side.

**Fix:**
1. `getLatestDiscovery()` filters items through `loadSkipMatchers()` + `isSkippedByMatchers()`
2. `runBensonLocalDiscovery()` excludes skipped canonical events before writing `itemsFound`
3. Default Skip is **event-level** (identity key: core title + event day + city + optional venue) — **not** performer-wide
4. Durable `skip_identity_key` on `creator_skipped_records` with `ON DELETE SET NULL` on `content_item_id` so tombstones survive content-item deletion/re-ingestion

**Connected DB canonical reconciliation and Pulse check:**
- One active permanent canonical skip remains: `skip_identity_key = 483bd5ea4c1cffb7c978209ab79b0e26`
- Canonical row contains durable `skipMatchIdentity` metadata
- One redundant legacy active skip was reconciled generically to the canonical row using `canonicalSkipRecordId` and `reconciliationReason = duplicate_canonical_skip_identity`; no row/evidence was deleted
- Latest raw `benson_discoveries.items_found` contains 1 matching skipped event
- `getLatestDiscovery()` returns 0 matching skipped events
- Benson Pulse fetches `/api/benson-discovery/latest`, whose route returns `getLatestDiscovery()` directly; therefore the Pulse data path also returns 0 matching skipped events

---

## Final canonical skip identity

**Primary key:** `skip_identity_key` = `computeSkipMatchIdentity()` hash when event date exists, else `fp:{occurrenceFingerprint}`.

**Identity fields (no source URL):**
- Normalized core event title / performer tokens
- Event day (America/Chicago bucket; midnight UTC date-only preserved)
- City
- Venue when distinct from city (disambiguation)

**Matching:** `skipIdentitiesMatch()` for title variants on same day/city; performer-wide suppression removed from default Skip (reserved for future explicit "Never show this performer").

**Metadata:** `skipMatchIdentity` + `title` stored in `creator_skipped_records.metadata` for matcher reload when `content_item_id` is null.

---

## Migration / backfill behavior

1. `pnpm migrate:benson-state-authority` — adds columns, relaxes skip FK to `SET NULL`, adds unique active identity index
2. `pnpm reconcile:state-authority` — backfills `email_intent` / `actionability`, `skip_identity_key`, and durable `skipMatchIdentity` metadata **without changing `is_read`**
3. Duplicate active skip rows sharing one identity are reconciled to one canonical active tombstone; the duplicate is retained for audit with its canonical row id

---

## Test results

Targeted suites (40 tests): **40 passed, 0 failed**.

```
src/gmail-inbox/inbound-actionability.test.ts     12/12 pass
src/creator-skip/load-skipped.test.ts             3/3 pass
src/creator-skip/match-key.test.ts                7/7 pass
src/benson-discovery/skip-filter.test.ts          2/2 pass
src/creator-skip/state-authority.acceptance.test.ts 4/4 pass
src/action-center/*.test.ts                       8/8 pass
other creator-skip query/fingerprint tests        4/4 pass
```

**Email coverage:**
- MyyShop verification → 0 Reply tasks ✓
- REKLAIM account confirmation → 0 Reply tasks ✓
- ShopMy application → `waiting_followup`, 0 Reply ✓
- SCHEELS-style pending creator application → `waiting_followup`, 0 Reply ✓
- Generic creator application pending → `waiting_followup` ✓
- Creator-business direct question/request → `reply_required` ✓
- Creator-business informational FYI/no-response-needed, including on a known thread → `none` ✓
- Genuine sponsor thread reply → `reply_required` ✓
- Vague short thread reply → `reply_required` ✓
- Blocked transactional on known thread → blocked ✓
- Duplicate Gmail insert prevented by existing `gmail_message_id` unique constraint ✓
- Cleanup preserves all four affected rows’ `is_read = false` ✓

**Discovery coverage:**
- Same event, same source → suppressed ✓
- Same event, different source URL → suppressed ✓
- Same canonical event, different discovery query → suppressed ✓
- Same performer, different date/event → eligible ✓
- Later/snooze → suppressed before `snooze_until`, eligible after due ✓
- Restore/unskip → eligible ✓
- Delete underlying `content_item`, then re-ingest same event → permanent skip survives ✓
- `getLatestDiscovery()` → skipped event absent; eligible control remains ✓
- Benson Pulse data path (`/api/benson-discovery/latest` → `getLatestDiscovery()`) → skipped event absent ✓

---

## Unexpected findings

1. A redundant legacy skip row shared the same canonical identity. Reconciliation now retains it as an audited, restored duplicate pointing to the active canonical tombstone.
2. The raw latest discovery snapshot still contains one skipped legacy event, proving the server read-path filter is necessary; `getLatestDiscovery()` and Pulse correctly return zero.
3. ShopMy “You've been accepted!” remains `unknown` / `none`; it does not create Reply in this slice.
4. Full repository typecheck still has unrelated pre-existing errors; changed files have no IDE lint diagnostics and all 40 targeted tests pass.

---

## Deploy checklist (not executed)

- [ ] Deploy API/workers with updated core package
- [ ] Run `pnpm migrate:benson-state-authority` on production DB
- [ ] Run `pnpm reconcile:state-authority` on production DB
- [ ] Verify Home → Do now has no MyyShop/REKLAIM/ShopMy/SCHEELS-pending Reply tasks
- [ ] Verify Benson Pulse does not show skipped Don Felder after skip

---

## Verdict

Producer semantics are corrected at write and read paths. False-positive email Reply tasks are eliminated without UI patches or read-state manipulation. Discovery skip authority is enforced on Pulse/discovery snapshot paths with durable event-level tombstones and complete acceptance evidence.

READY FOR DEPLOY APPROVAL
