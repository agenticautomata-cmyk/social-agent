# Handoff: Connect eligible event discoveries to Calendar (data only)

**Repo:** `/home/elliott/Projects/kellie-assistant/social-agent`  
**Date:** 2026-08-14  
**Operator timezone:** America/Chicago  
**Live deploy fingerprint:** `79c9cc9e8b190e9b` (API / dashboard / workers MATCH)  
**Git HEAD:** `aaad48f` plus a large uncommitted working tree. This Calendar work is uncommitted unless someone committed later.

## One-sentence outcome

Calendar is now Benson’s current **date-bearing event view**. It projects existing durable event intelligence onto `creator_calendar_items` as `planning_status='suggested'`. Kellie does not have to “add to Calendar” first. Weekend List is **not** auto-filled.

## Product rule (do not reinterpret)

- **Calendar** = current date-bearing KC event view from **all** Benson discovery pipelines.
- **Discovered/suggested** = Benson found it and put it on Calendar.
- **Selected** = Kellie explicitly chose it for planning / Weekend List.
- One logical event = one Calendar card.
- Do **not** create a second copy of each event.
- Do **not** auto-select. Do **not** auto-fill Weekend List.
- Partially verified / trusted-creator-secondary events are **useful provisional leads**. Never call them “confirmed.”
- Only date-bearing eligible **events** belong here. Not arbitrary Discover partnership/editorial cards.

## Hard non-goals (do not reopen)

Do not:

- Redesign Calendar UI
- Change Instagram Watchlist processing / capture / inspection
- Change discovery extraction, scoring, or verification
- Change Weekend List generation algorithm (`weekend-things-to-do.ts` scoring/selection)
- Trigger new research or scraping
- Create duplicate `content_items` on list
- Commit unless the operator asks

Weekend List already exists as `/weekend-list` backed by `planner_items.listName = 'Weekend'`. Calendar “Add to weekend list” must reuse that. See `docs/reports/benson-weekend-list-2026-08-13.md`.

Prior Watchlist zero-yield fix (fingerprint `130f345b68fcbefd`) is closed. Do not touch it.

---

## Architecture

### Authority

Canonical Calendar rows live in `creator_calendar_items`.

Projection sources:

1. **`content_items`** — discoveries@, Ask Benson / listing intake, scraped listings, newsletters, other durable inventory with `event_starts_at` in the list window.
2. **`curator_event_leads`** — Instagram Watchlist / trusted-creator event leads.

Watchlist leads project as `source_record_type='curator_event_lead'` until Kellie clicks **Add to weekend list**. Weekend List requires a `content_item` id, so `setCalendarItemWeekendMembership` **lazily materializes** a content item then upserts the Weekend planner board. That is the only time a Watchlist-only lead becomes a `content_item`. It does not create a second calendar row; it relinks the existing row.

### Read path

`GET /api/calendar/items` → `listCalendarItems()`:

1. `ensureCalendarInventoryProjections(from, to)` (15s single-flight per window)
2. Load `creator_calendar_items` in range, excluding dismissed/cancelled/expired/completed by default
3. Overlay `selected` from `planning_status==='confirmed'` **or** membership on planner Weekend board
4. Hide suggested rows that fail `calendarSuggestionIsDisplayable` (wrong city, national SEO, civic meeting, KC Sipps, past year in title)
5. `dedupeActiveCalendarViews` so leftover historical rows for the same logical event collapse to one card

### Write path (projection)

`ensureCalendarInventoryProjections` in `population/sync.ts`:

1. Collect inventory candidates + curator-lead candidates
2. `dedupePopulationCandidates` (merge evidence; prefer `content_item`; upgrade verification)
3. Skip dismissed fingerprints / dismissed existing identities
4. Upsert onto existing row if idempotency key, occurrence fingerprint, or `calendarIdentitiesMatch`
5. Protected rows (`confirmed` / `dismissed` / `cancelled` / `completed` / `missed`, `userEditedAt`, Kellie-created) are not overwritten
6. Suggested rows may get verification upgrade, notes/`whyIncluded` refresh, and `content_item` promotion when official inventory arrives

Idempotency key shape: `skip:{skipKey}`.

---

## Eligibility (Calendar-only; does not change extraction)

File: `services/core/src/creator-calendar/population/eligibility.ts`

### Inventory (`evaluateInventoryCalendarEligibility`)

Show when:

- Concrete `eventDate` / `event_starts_at`
- Not expired/archived/rejected
- Passes `isOperatorTemporallyCurrent` + `isAudienceFreshContent`
- Event day (Chicago) is today or future (or still ongoing via `eventEndDate`)
- Coherent event identity (venue ≥ 3 chars **or** event-ish title/category)
- KC-metro relevant
- Not quarantined via skip list (`loadSkippedContentIdsForItems`)
- Not employment, political/civic banquet, private/member-only, editorial article
- Not national SEO / civic meeting titles
- Not partnership cards without event identity
- Title with a past calendar year (`2015`, etc.) is treated as expired

**Wrong-city rule (important):** if the **title** matches `CALENDAR_OUT_OF_MARKET_RE` and the title itself is not KC, reject even when `locationName` is wrongly `Kansas City, MO`. This hid “Megan Moroney rolls into Orlando” with a polluted KC location.

Watchlist default: curator leads are KC unless out-of-market. Inventory does **not** get that default; it needs place/title/ingest pipeline evidence (`visitkc`, `discoveries`, `ask_benson`, `watchlist`, etc.).

### Curator leads (`evaluateCuratorLeadCalendarEligibility`)

- Not dismissed
- Not `EXPIRED` / `CONFLICTED`
- Future Chicago day
- Same title-out-of-market gate
- Watchlist default KC unless venue/neighborhood/title is out of market

### Display-time gate (`calendarSuggestionIsDisplayable`)

Safety net for already-projected rows: Orlando-in-title, national SEO, civic meetings, KC Sipps, past year in title.

### Verification mapping (display only)

`verificationRank`:

| Rank | States |
|---|---|
| 40 | `VERIFIED`, `verified`, `official_*` |
| 25 | `PARTIALLY_VERIFIED`, `trusted_secondary_source` |
| 10 | `SOCIAL_LEAD`, `unverified`, `newsletter_only` |
| 0 | `CONFLICTED`, `EXPIRED` |

`calendarVerificationDisplay`: rank ≥ 40 → **Verified**, else **Needs verification**.

UI copy:

- Unselected: `Benson suggestion · Verified` or `Benson suggestion · Needs verification`
- Selected: `Selected` (verification may appear as detail, never as “confirmed”)

CSS uppercases the headline on Calendar cards.

---

## Selection vs Weekend List

Keep these separate:

| Concept | Storage |
|---|---|
| On Calendar as suggestion | `creator_calendar_items.planning_status = 'suggested'` |
| Selected for planning | `planning_status = 'confirmed'` **or** `planner_items.listName = 'Weekend'` |
| Weekend List page | same Weekend board; `/api/calendar/weekend-list` |

`withSelection()` sets `selected` if confirmed **or** the linked `content_item` is on the Weekend board.

Watchlist-only rows have no `content_item` until Kellie adds them, so they cannot appear selected via the board overlay. That is correct.

**Add to weekend list** (Fri–Sun Chicago window, unselected suggestion):  
`POST /api/calendar/items/:id/weekend-list` → `setCalendarItemWeekendMembership` → maybe materialize content item → `setWeekendListMembership`.

**Select / Plan** (outside weekend): `POST /api/calendar/items/:id/confirm`.

Live check 2026-08-14: operator Weekend List `count = 0`. Calendar suggestions were not auto-selected. One older Weekend-board item (`Sherri's After Dark`) remained selected; that is prior operator/planner state, not this task.

---

## Calendar actions (reuse existing helpers; no redesign)

Unselected suggestion:

- In current Fri–Sun → primary **Add to weekend list**
- Else → primary **Select / Plan**
- Always keep View source, Details, Dismiss, Later
- Partial → **Review / verify**
- Verified → **Official tickets** / **Organizer** when URLs exist in metadata

Dashboard: `dashboard/app/calendar/calendar-panel.tsx`  
Contract: `services/core/src/creator-calendar/calendar-actions.ts`

### Bug fixed during live smoke

`busy={busyId === item.id || busyId === contentItemId(item)}`

For Watchlist rows `contentItemId` is `null`. `busyId` starts `null`, so `null === null` made **every curator-lead card look busy**. Primary CTA rendered as `…` and was disabled.

Fix: `busy={Boolean(busyId) && (busyId === item.id || busyId === contentItemId(item))}`

Do not regress this.

---

## Dismissal

`recordCalendarDismissal` writes `calendar_dismissal_feedback` fingerprints (occurrence fingerprint, idempotency key, skip key).

Projection skips those fingerprints and also skips existing dismissed rows that `calendarIdentitiesMatch` the incoming candidate.

List query excludes `planning_status='dismissed'`. Provenance/history stays in the row; it is not deleted.

---

## Dedupe

File: `population/merge.ts`

`calendarSkipIdentity` uses `computeSkipMatchIdentity` tokens/city/venue but **overwrites `day` with America/Chicago calendar day**. UTC date-only midnight (`2026-08-17T00:00:00.000Z` = 7pm Aug 16 Chicago) must not split the same event from `2026-08-16T05:00:00.000Z`.

`calendarIdentitiesMatch`:

1. Same skip key → match
2. Out-of-market token conflict (Orlando vs KC) → **do not** match
3. Else `skipIdentitiesMatch` (same day/city, 2-token subset, venue conflict fails)
4. Else same Chicago day + same city + no venue conflict + **≥ 3 shared title tokens**

That last rule merges “Megan Moroney Concert” / “Cloud 9 Tour at T-Mobile” / “Cloud 9 Tour with JP Saxe” without merging Megan Moroney into an Orlando headline.

`mergeCandidates` prefers `content_item`, takes stronger verification, concatenates pipeline `whyIncluded`, keeps ticket/organizer URLs and curatorLeadId.

List-time `dedupeActiveCalendarViews` prefers selected/confirmed, then `content_item`, then higher verification, then longer title. Historical duplicate rows remain in DB but are not shown.

**Do not** change global `creator-skip/fingerprint.ts` skip matching. Calendar-only identity lives in `merge.ts`.

---

## File map

| Path | Role |
|---|---|
| `services/core/src/creator-calendar/population/eligibility.ts` | Gates, verification display, candidate builders, `whyIncludedForInventory` |
| `services/core/src/creator-calendar/population/eligibility.test.ts` | Eligibility + Orlando/KC-location + past-year tests |
| `services/core/src/creator-calendar/population/merge.ts` | Identity, merge, list-time dedupe |
| `services/core/src/creator-calendar/population/sync.ts` | Idempotent projection |
| `services/core/src/creator-calendar/population/sync.test.ts` | IG+website merge; Orlando non-merge; Cloud 9 UTC midnight merge |
| `services/core/src/creator-calendar/population/weekend-source.ts` | Lazy content_item on explicit weekend add |
| `services/core/src/creator-calendar/items.ts` | List/map/selection; displayable filter; whyIncluded sanitization |
| `services/core/src/creator-calendar/dismiss.ts` | Durable dismissal fingerprints |
| `services/core/src/creator-calendar/calendar-actions.ts` | Status + CTA contract |
| `services/core/src/creator-calendar/types.ts` | `selected`, `fallsInWeekend`, `ticketUrl`, `organizerUrl` |
| `services/api/src/routes/calendar.ts` | `POST /items/:id/weekend-list` |
| `dashboard/app/calendar/calendar-panel.tsx` | Labels/CTAs only; busy-null fix |
| `dashboard/lib/calendar-types.ts` | Optional view fields |
| `scripts/benson-deploy-local.sh` | Targeted tests: eligibility, sync, weekend-things-to-do, dismiss, worker-heartbeat |

Do **not** treat `weekend-things-to-do.ts` changes as in-scope unless you only **reuse** `eventFallsInChicagoWeekend` / `getChicagoWeekendDayKeys`.

---

## Live regression (2026-08-14, window Aug 16)

`GET /api/calendar/items?from=2026-08-16T00:00:00.000Z&to=2026-08-17T12:00:00.000Z`

All six `@jasfoodjourney` leads present, `planningStatus=suggested`, `selected=false`:

- Wine Down Sundays — Juke House — `PARTIALLY_VERIFIED` — Watchlist
- R&B Shynin’ in the Sky — Rock Island Bridge — `PARTIALLY_VERIFIED`
- Art in the Loop: Celebrates 816 Day — City Market — `VERIFIED`
- BPCofKC Pickleball Meet-up — KC Pickle Club — `PARTIALLY_VERIFIED`
- No Request: Trust Your DJ — Monarch Cocktail Bar — `PARTIALLY_VERIFIED`
- 2 Steppin’ Matinee — Culture X Lounge — `VERIFIED`

Also verified:

- Instagram Watchlist events appear (`whyIncluded` like `Instagram Watchlist · @jasfoodjourney`)
- Inventory/listing/`[Benson]` Ask Benson events appear as `content_item` cards (e.g. `816 Day | Kansas City`)
- Orlando gone; Rock the Garden 2015 gone
- Dismissed not in active list
- Megan Moroney Cloud 9 Tour → **one** card
- Weekend List API `count=0` (not auto-filled)
- Mobile 390×844: no horizontal overflow; Wine Down primary **Add to weekend list** + Review / verify; 2 Steppin’ **Add to weekend list** + Official tickets / Organizer

---

## Bugs found after first projection (already fixed)

1. **Orlando leak** — location field said Kansas City; title said Orlando. Title-first out-of-market gate + display filter.
2. **Over-merge** — 2-token skip subset collapsed unrelated same-day KC cards; `whyIncluded` became KALEO/Red Rocks concatenated onto Megan Moroney. Fixed with market-token conflict + Chicago day + ≥3 shared tokens; list-time dedupe hides leftover rows.
3. **UTC date-only vs Chicago evening** split Cloud 9 Tour into 3 cards. Calendar identity uses Chicago day.
4. **`whyIncluded` using listing titles as source names** (KALEO / Red Rocks). `whyIncludedForInventory` no longer uses long/`with`/amphitheatre `sourceName`s; map-time only shows pipeline-looking why strings.
5. **Busy CTA `…`** on all Watchlist cards (`null === null`). Fixed in calendar-panel.
6. **Deploy crash** — `export type CalendarVerificationDisplay` was accidentally replaced when adding `calendarMarketTokensConflict`. `pnpm benson:deploy-local` wipes `dashboard/.next` before typecheck, so a type error takes the dashboard down. Prefer: typecheck/build dashboard **in place**, then restart dashboard; do not wipe `.next` until the build is known good.

---

## Known remaining caveats (do not “clean up” unless asked)

- Some inventory cards still have weak/empty `whyIncluded` (`Benson inventory`, `KC Library Events`, or null). Events still appear. Do not reopen extraction to chase labels.
- Distinct 816 Day / Artwalk / Brunch-ish cards can coexist when venues differ (`City Market` vs `Power & Light` vs `KC LIVE BLOCK`). That is intentional.
- Projection does not delete orphan suggested rows; list-time dedupe hides them.
- `populationSource` is stored on insert/update but is **not** on `CalendarItemView`; API clients will not see it.
- Curator leads are not `content_items` until weekend-add. Discover/inventory surfaces will not show them until then. Calendar will.
- Things To Do weekend shortlist at the top of Calendar is a **curated roundup**, not the operator Weekend List. “N selected for the roundup” is planner-board overlay on that shortlist, not auto-fill of all suggestions.
- Fingerprint hash skips `*.test.ts`. Test-only edits will not drift parity.

---

## How to verify (no new scrape)

```bash
# tests
pnpm --filter @social-agent/core exec tsx --test \
  src/creator-calendar/population/eligibility.test.ts \
  src/creator-calendar/population/sync.test.ts \
  src/creator-calendar/weekend-things-to-do.test.ts \
  src/creator-calendar/dismiss.test.ts

# live
curl -sf http://127.0.0.1:4000/health
curl -sf -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/calendar
curl -sf "http://127.0.0.1:4000/api/calendar/items?from=2026-08-16T00:00:00.000Z&to=2026-08-17T12:00:00.000Z"
bash scripts/benson-deployment-status.sh
```

Expect the six `@jasfoodjourney` titles, truthful verification, `selected: false`, no Orlando, one Moroney card, Weekend List not populated from suggestions.

Mobile: 390×844 `/calendar`. Primary CTA must not be `…` on unselected Watchlist events.

---

## Deploy caution

`pnpm benson:deploy-local` force-rebuilds dashboard and `rm -rf dashboard/.next`. If typecheck fails, dashboard stays down.

Safer for Calendar-only core changes:

1. Run the targeted tests
2. `pnpm --filter @social-agent/dashboard build` **without** wiping `.next` if only core changed and UI is unchanged; if UI changed, still build in place
3. Restart API/workers (tsx loads core source)
4. Restart dashboard from existing `BUILD_ID` if the build already succeeded
5. Write fingerprints via `cli-fingerprint.ts` / `cli-write-fingerprint.ts`

Local API `:4000`, dashboard `:3000`.

---

## Instructions for the next LLM

If the next task is Calendar quality, stay in **projection / list / display / CTA** only.

If the next task is Watchlist yield, Discover scoring, or Weekend List curation: **stop** and treat this Calendar connection as done.

Do not:

- Auto-confirm suggestions
- Materialize `content_items` on list
- Change `skipIdentitiesMatch` globally
- Call partials “confirmed”
- Redesign Calendar
- Commit unless asked

Working tree already contains many unrelated uncommitted files (Watchlist, Ask Benson listing category, weekend-list page, etc.). Scope git operations to Calendar population files if a commit is requested.
