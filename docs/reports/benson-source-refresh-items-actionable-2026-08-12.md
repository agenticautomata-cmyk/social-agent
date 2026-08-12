# Benson Source Refresh Items Actionable — 2026-08-12

**Scope:** Source admin (`/sources` Source Refresh) only. No Discover/Today redesign. No scoring, ingestion, scrape, email, or research behavior changes.

**Fingerprint:** `3e12ddca945764ba` (MATCH — includes durable-count authority fix)

---

## Problem

Source Refresh showed live sources and item counts (including discoveries@ / Discovery Email inventory) but only offered **refresh** and **mute source**. Operators could not open the durable items a source produced or take lane actions on them.

---

## Fix

1. **API** `GET /api/sources/:id/items`  
   Returns durable `content_items` with **strict `sourceId` provenance**. Reuses `buildTodayClarityFields` for lane + primary CTA. Does not invent a second planner/action model.

2. **Registry** adds `durableItemCount` (batch count by `content_items.sourceId`).

3. **UI** on Source Refresh rows with items:
   - **View 1 item** / **View N items** (44px tap target)
   - ITEMS count tappable when actionable
   - Compact drawer: title, when/where, why, lane, source, freshness, View source, Details, lane primary CTA, Later, Dismiss via existing `OpportunityActionBar` / `DiscoverySkipButton`
   - Source actions remain Refresh / Mute — item dismiss does not mute the source

4. **0 items** → no View action.

---

## Verification

| Check | Result |
|-------|--------|
| CommUNITY Fest (last=1, durable=1) | Items API returns 1; provenance OK; Details CTA |
| Discovery Email (durable=75) | Individual extracted items listed; provenance OK |
| Zero-item source | No View action |
| Mobile drawer smoke (CommUNITY Fest) | Opens with title, when/where, why, lane, View source, Details, Later, Dismiss |

### Count authority follow-up (same day)

**Bug:** View used last-run extract count when `durableItemCount === 0` (e.g. 420 Munchie last=1, durable=0 → empty drawer).

**Fix:** View + ITEMS column authority is **`durableItemCount` only**. Last-run extract count stays under Last run as non-actionable diagnostic (`last extract N`).

| Check | Expected |
|-------|----------|
| last=1, durable=0 | ITEMS 0, no View |
| durable=1 | View 1 item |
| durable=75 | View 75 items |

Unit tests: `services/core/src/source-ingestion/source-items.test.ts` (labels, provenance filter, card fields).

---

## Explicit non-goals (unchanged)

- Discover / Today UX
- Discovery scoring
- Ingestion / scrape / email processing / research budgets
- New competing inventory or planner models
