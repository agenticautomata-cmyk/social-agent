# Benson Calendar Actions + Things To Do This Weekend — 2026-08-12

**Scope:** Calendar UI/actions + curated weekend Things To Do shortlist. No Home/Today/Telegram redesign. No ingestion/research changes.

## Changes

1. **Calendar cards** — human status (`Suggested by Benson` / `Not on your calendar yet` / `Planned`), primary CTAs (Confirm plan / Add to calendar / Update Google), plus View source, Details, Add to weekend list, Add to Things To Do, Later, Dismiss. No dead-end “review and confirm or dismiss” without controls.
2. **Provenance** — public events without a valid source URL are not calendar-ready.
3. **Things To Do This Weekend in KC** — `GET /api/calendar/weekend-things-to-do` curates Fri–Sun America/Chicago durable inventory; selection persists via planner `plan_weekend` / Weekend board.
4. **Lane separation** — ordinary concerts may qualify Things To Do; do not auto-qualify Film This. Political banquets excluded from the general weekend roundup.

## Tests

`src/creator-calendar/weekend-things-to-do.test.ts` — CTA contract, Chicago weekend window, political banquet exclusion, concert≠Film This, stale exclusion, variety cap.

## Deploy

**Fingerprint:** `9beb7dac08cd1f73` (MATCH)  
API / dashboard / workers healthy.

Live weekend shortlist (Fri–Sun Aug 14–16): 8 curated picks; Democratic Banquet excluded; Bangor editorial excluded; 816 Day once.
