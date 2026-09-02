# Benson Today Execution Repair — 2026-09-02

## Executive summary

Today is now Kellie’s daily execution workspace. It answers one question: **what does Kellie actually need to do today?**

The public Today page (`/editor`) no longer browses inventory, refreshes sources, filters 75 categories, queues pitches, or dumps newly discovered opportunities. Those surfaces stay where they belong (Sources / Discover / Pitches). Home, Calendar, Watchlist, and Pitches were not redesigned.

Live production Today now shows:

- **3 planned items** Kellie already placed on Today
- **3 requested-research items** ready for review (SantaCaliGon Days, Hummingbird Festival, plus one other requested research row)
- **0 Best move** — compact sentence only: `Nothing urgent right now.`
- **0 filler priorities**, **0 sponsor/outreach queue items**, **0 dirty Hyde Park titles**

## Root causes

1. `GET /api/editor` loaded all ingested inventory, computed command-center lanes, and attached `categoryOptions` from every category count (~75 filters).
2. `computeBriefingPriorities` (shared with Benson hub) manufactured up to four priorities from top sponsor, first discovered item, outreach approval counts, and inventory lanes. That is why Today showed “Start sponsor pitch: Savers” and “Approve outreach email (96 waiting).”
3. Discover “Add to Today” wrote `listName: 'today'` + `status: 'saved'`, so user commitments were treated as saved inventory instead of a plan.
4. Empty command-center lanes each rendered a large dashed card (“Nothing strong enough…”), so a quiet day looked broken.
5. Briefing labels used raw `discovered.title`, which is how `HERE ! Sep 6 Hyde Park Farmers Market` reached Today.

## Before-and-after Today structure

| Before | After |
|---|---|
| Inventory Data / last refresh / item count | Removed from Today |
| Refresh sources button | Removed; still on Sources |
| 74/75 category filters | Removed from Today data contract |
| Today / This week / Saved / Covered tabs | Removed |
| postToday / postWeekend / contactBusinesses / followUps / discoveredToday / trending lanes | Removed from Today payload and UI |
| Manufactured 4-item priority list | At most 3 priorities from real commitments |
| Multiple empty “nothing strong enough” cards | One compact empty state, or one Best move sentence |
| Newly discovered inventory | Stays in Discover |
| Sponsor / outreach queues | Hidden unless Kellie placed a specific item on Today |

**After (order):**

1. Today’s plan — explicit Today placements and due-today follow-ups
2. Best move — at most one strong recommendation, or `Nothing urgent right now.`
3. Ready for review — count + at most 3 requested-research / decision items
4. Coming up — selected or dated commitments in the next seven days
5. Completed today — optional collapsed count

## Production inventory / state audit

Planner sample (live `social_agent`, 2026-09-02):

| State | Count |
|---|---|
| Planner rows sampled | 13 |
| `listName` Today (any case) | 3 |
| `status: planned` (Weekend, past dates) | 2 |
| saved | 9 |
| covered | 0 |

Explicit Today placements (legacy `listName: 'today'` + `status: 'saved'`, now treated as planned):

| Title (display) | Notes |
|---|---|
| 18th & Vine Arts Festival 2026 | User-placed on Today |
| Reklaim Handbags at Jared | User-placed; also has `plan_visit` research |
| This Got Wild, Orange Parade | Still on Today list even though Discover later marked not-interested |

Requested research ready for review:

| Item | Job status | Completed |
|---|---|---|
| Hummingbird Festival | `needs_verification` | 2026-09-02T17:28:51Z |
| SantaCaliGon Days | `needs_verification` | 2026-09-02T17:31:45Z |
| Kansas City Events and Opportunities | `needs_verification` | earlier requested research |

Hyde Park: raw topic `HERE ! Sep 6 Hyde Park Farmers Market` still exists on `content_items` (`b5b56e92-…`). It is **not** on Today’s plan. Display-title now strips that scraper lead. Today never renders the dirty string.

Save-for-later / interested enrichments (Royal Showcase, neighborhood guide, etc.) stay out of Ready for review.

## Sections removed or relocated

Removed from the Today **data contract** (not CSS-hidden):

- `sections`, `categoryOptions`, `weekItems`, `savedItems`, `coveredItems`, `counts`, `briefingPriorities` from `computeBriefingPriorities`
- Inventory Data, source freshness, refresh-all, last-refresh, total inventory
- Category filter bar
- Newly discovered opportunity feed
- General sponsor recommendations and outreach approval counts
- Watchlist health / source-check chrome
- Repeated empty-state cards and score dashboards

Relocated / left in place:

- Source refresh → existing **Sources** (`/sources`)
- Category filters → Discover / inventory review
- New opportunities → Discover
- Pitch and outreach queues → Pitches
- Benson hub still uses `computeBriefingPriorities` unchanged

## Priority-generation rules

Implemented in `computeTodayExecution` (Today-only; hub briefing untouched):

- User-planned work outranks Benson suggestions
- Due-today work outranks other planned work
- Current verified information outranks unverified inventory
- Completed research Kellie requested may appear for review
- Pitches / outreach appear only when explicitly placed on Today
- Maximum three priorities; no filler
- Never use raw inventory counts
- Never use a dirty or unverified display title
- Same opportunity cannot appear in plan, review, best move, and coming up

## Research-review behavior

- Pending (`queued` / `researching`): compact “Researching {title} — Benson will add this when it finishes.” Not a permanent “Research started” card.
- Complete / `needs_verification` **and** requested via `research` / `tell_me_more` / `plan_visit` / `generate_content_plan`: Ready for review.
- Card uses the display-title contract (SantaCaliGon Days, not the raw newsletter markdown).
- Shows a short verified summary, official source when it is a real public URL, and Review / Add to Today / Add to Calendar / Dismiss.
- Decide writes `metadata.todayReview` and removes the item from the queue. Does not require opening the originating newsletter.
- `POST /api/editor/review` handles dismiss / add_to_today / add_to_calendar / reviewed.

## Empty-state behavior

When the plan is empty:

- One sentence: `Nothing planned for today.`
- Two actions: Browse Discover, View Calendar
- Optional compact Best move if one exists
- No separate empty boxes for posting today, weekend, sponsors, or follow-ups

## Existing records corrected

- Discover `plan_visit` / `addToToday` now calls planner `plan_today` (`listName: 'Today'`, `status: 'planned'`, `plannedDate` today).
- Legacy lowercase `today` + `saved` rows still count as planned so Kellie’s current three Today items appear immediately.
- Display-title strips `HERE !` and leading date crumbs (`Sep 6 …`).
- Research review titles always run through `resolveDisplayTitle` / `resolveDisplayTitleFromRecord`. No one-off Hyde Park rewrite table.

No inventory rows were deleted.

## Files and migrations changed

No database migrations.

| File | Change |
|---|---|
| `services/core/src/inventory/today-execution.ts` | New Today execution contract, loader, review decisions |
| `services/core/src/inventory/today-execution.test.ts` | Required regression coverage |
| `services/core/src/inventory/index.ts` | Exports |
| `services/core/src/inventory/load-ingested.ts` | `loadInventoryItemsByIds` (no freshness gate) |
| `services/api/src/routes/editor.ts` | Slim `GET /api/editor` + `POST /api/editor/review` |
| `dashboard/app/editor/command-center-panel.tsx` | Execution UI |
| `dashboard/lib/command-center-types.ts` | Execution types |
| `dashboard/lib/section-help-text.ts` | Today help copy |
| `services/core/src/creator-interest/actions.ts` | `addToToday` / `plan_visit` → `plan_today` |
| `services/core/src/display-title/resolve-display-title.ts` | Scraper-lead strip |
| `services/core/src/display-title/index.ts` | Exports |
| `services/core/src/display-title/resolve-display-title.test.ts` | Hyde Park lead case |
| `services/core/package.json` | Include today-execution tests |

Unchanged by design: Home pages, Discover list UI, Calendar pages, Watchlist pages, Pitches pages, `computeBriefingPriorities`, Watchlist intelligence.

## Tests and exact results

Today execution (`src/inventory/today-execution.test.ts`): **22 pass / 0 fail**.

Covered: planned appears; saved-only excluded; discovery-only excluded; pitch hidden unless placed; outreach hidden unless placed; due-today ordering; user commitment outranks Benson; max one Best move; max three priorities; no filler; completed research in review; pending honest state; reviewed research leaves; seven-day look-ahead; expired suppression; cross-section dedupe; clean titles; compact empty state; compact mobile actions; Home/Discover/Watchlist data not required; SantaCaliGon display-title; save-for-later enrichment excluded.

Display-title: **27 pass / 0 fail** (includes `HERE ! Sep 6 Hyde Park Farmers Market` → `Hyde Park Farmers Market`).

Today-clarity: **pass** (existing).

Focused compatibility suite (today-execution, today-clarity, display-title, discover-eligibility, home-briefing-authority, home-showroom, discover-trust, watchlist-intelligence): **`# tests 199` `# pass 199` `# fail 0`**.

Deploy precheck suite (calendar / watchlist / home-showroom / playwright / heartbeat / newsletter dates): **`# tests 246` `# pass 246` `# fail 0`**.

Wider relevant run (501 tests) had **7 pre-existing failures** outside this pass:

- `inventory-temporal-evidence.test.ts` extra `title: null` field (calendar projection, already in tree)
- Instagram auth DB fixtures (`jasfoodjourney fixture source required`)

Core `tsc --noEmit`: no errors in files this pass edited. Remaining errors are pre-existing.

Dashboard `tsc --noEmit`: **pass**.

Production dashboard build: **pass** (Next.js 15, 88 pages).

Playwright precheck: **OK**.

## Public mobile and desktop verification

Public site `https://benson.kckellie.com/editor` against local API `:4000` / dashboard `:3000`.

| Check | Result |
|---|---|
| Inventory / debug / refresh / last-refresh / counts | Gone |
| Category filters | Gone |
| Sponsor / outreach priorities | Gone |
| Newly discovered inventory | Not on Today; Discover page still loads as Discover |
| Real commitments | 3 plan cards with Open / Mark done / Reschedule / Remove / Details |
| Hummingbird / SantaCaliGon | Ready for review; titles clean |
| Hyde Park dirty title | Not present |
| Empty Best move | One sentence, no large empty card |
| Mobile first screen (390-class width) | Greeting + priorities + first plan actions visible; bottom nav present |
| Home Today’s Brief | Unchanged: video-growth lines first; Watchlist checked 42 sources; `@blackfoodtruckfridays` next date Friday, September 4, 2026 |
| Duplicates | None across plan / review |
| Actions | Same planner PUT + new review POST; no CSS-only hide |

Action persistence was verified at the API contract (planner `mark_covered` / `save` / `plan_today` / review `metadata.todayReview`). Production items were not mutated during browser review.

## Screenshot paths

| Surface | File |
|---|---|
| Today mobile | `docs/ops/screenshots/today-execution-2026-09-02-mobile.png` |
| Today desktop | `docs/ops/screenshots/today-execution-2026-09-02-desktop.png` |
| Today review (desktop) | `docs/ops/screenshots/today-execution-2026-09-02-review-desktop.png` |

## Fingerprints

```
status: MATCH
source/api/dashboard/worker: f4bb93607163c6a8
apiStartedAt: 2026-09-02T23:49:48.302Z
dashboardBuiltAt: 2026-09-02T23:49:59Z
workerStartedAt: 2026-09-02T23:49:58.972Z
```

## Commit hash and branch

Branch: `release/scout-expansion-2026-07-25`  
Implementation commit: `bdb45aee098b28ba372ae5e05c54307a93f2fa66`

## Clean-tree and remote-match confirmation

*(filled after push)*

## Remaining limitations

- Legacy Today rows can still be noisy (`This Got Wild, Orange Parade` remains because it is still on the Today list). Kellie can Remove from Today; Benson does not infer dismissal from a later Discover not-interested vote.
- `18th & Vine Arts Festival 2026 \| 18th & Vine Arts Festival` is cleaner than the raw three-part SEO title but still carries a duplicated festival name. Display-title does not invent a shorter official name without structured evidence.
- Ready for review still includes an older requested-research row (`Kansas City Events and Opportunities`) because Kellie asked for research. Dismiss removes it.
- Research summaries can still be long after markup strip. Cards are compact compared with the old Today lanes, but a few review bodies remain wordy.
- The studio Ask Benson FAB is unchanged and can sit over the lower-right of cards on phone width.
- Coming up is empty today: no selected calendar items or saved dated commitments fall in the next seven days.
- `computeBriefingPriorities` still exists for Benson hub and can still mention sponsors there. Today no longer calls it.
