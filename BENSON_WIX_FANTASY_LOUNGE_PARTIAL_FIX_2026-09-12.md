# Benson Wix Fantasy Lounge — Partial Fix (2026-09-12)

**Watcher:** `a2f69814-f54b-4cbb-88c1-9501d65335f0`  
**Configured URL:** `https://www.thefantasylounge.com/event-list`  
**Addresses:** `BENSON_WIX_MULTI_VARIANT_FANTASY_LOUNGE_VERIFICATION_2026-09-12.md` PARTIAL misses  
**Prior MATCH:** `1ec1ac9d9c6206ed`  
**New MATCH:** `2669adeee01d3842`

## Verdict

**PASS** for the two remaining Fantasy Lounge blockers:

1. Companion `soldOut` merge no longer prefers the themed RSVP card’s `soldOut:true` over ticket inventory that is still available.
2. Watchlist UI no longer routes `wix_companion_nights` through theater production-group cards; Melting Pot `production_groups` / `theater_season` is unchanged.

## Fixes

### 1. `soldOut` merge (`wix-events-extract.ts`)

Added `mergeCompanionSoldOut`:

- Prefer **ticket-action** inventory when present → night is sold out iff every ticket companion is sold out.
- Otherwise sold out only if **ALL** companions with a known `soldOut` flag are sold out (either companion still available keeps the night open).

Replaces `primary.soldOut ?? secondary.soldOut` (themed RSVP primary wrongly won).

### 2. Watchlist display mode (`watchlist-listing-display.ts` + detail panel)

`shouldUseProductionGroupCards`:

- `listingDisplayMode === 'wix_companion_nights'` → rich per-night cards (theme, date/time, venue, members/vetted/21+/sold-out, Ticket + RSVP).
- `listingDisplayMode === 'production_groups'` or `extractionMethod === 'theater_season'` → production-group cards (Melting Pot).
- Removed the catch-all `productionGroups.length >= 1` that forced theater UI whenever companion nights set `productionGroupKey`.

## Tests

- Core: companion fixture nights assert `soldOut === false`; unit cases for ticket-prefer / all-known-sold-out rules (`wix-events-extract.test.ts`, 17 pass).
- Dashboard: display-mode distinction for companion vs Melting Pot (`watchlist-listing-display.test.ts`).

## Live re-check (post-deploy)

| Check | Result |
| --- | --- |
| Deploy parity | **MATCH** `2669adeee01d3842` |
| FL `runWatcherNow` | `ok`, `no_change`, raw 16 / nights 8 / companions 8, URL preserved |
| Persisted `soldOut` | **0 true / 8 false** (was 8 true) |
| Ticket + RSVP URLs | 8/8 nights |
| Members / vetted | 8/8 |
| `listingDisplayMode` | `wix_companion_nights` |
| UI (Playwright) | themed titles · `9:00 PM` · Fantasy Lounge · Members only · Vetted guests · 8 Ticket + 8 RSVP links · no Open-tickets path |
| Melting Pot UI | still Productions / Show dates / Open tickets |
| Vine config | still `wix_events`, healthy |

No purchase/RSVP/login/forms/Telegram/email/outreach/billable AI.

## Ready for verification?

**YES** — independent verifier can re-confirm soldOut truthfulness + rich companion UI against MATCH `2669adeee01d3842`.
