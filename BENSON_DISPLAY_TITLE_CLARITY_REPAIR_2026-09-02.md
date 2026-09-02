# Benson Display Title Clarity Repair — 2026-09-02

## Executive summary

This pass is a bounded display-title repair. It does **not** redesign cards, change pitches, expand sources, or rebuild the Watchlist / information pipeline.

Benson was showing raw webpage headlines, Markdown fragments, calls to action, descriptive sentences, and publisher names as the event title. Calendar, Discover, Details, Watchlist findings, and research results were hard to read at a glance.

Every opportunity now has a display contract computed at read time from the raw headline plus structured evidence:

- **displayTitle** — what this is
- **displaySubtitle** — optional notable context
- **sourceName** — who published or supplied it
- **venueName** — when applicable
- **rawTitle** — preserved internally
- **sourceUrl** — canonical public source when available

Canonical identity stays on the raw fields (`content_items.topic`, `early_signals.title`, `curator_event_leads.eventName`, calendar `metadata.rawTitle`). Cleaned titles are not used as skip keys, opportunity keys, or dedupe keys.

Visible titles repaired (display title differs from the stored raw headline): **646**.

Records were not deleted or merged.

## Root causes

1. Surfaces rendered the ingested headline (`topic` / calendar `title` / signal `title`) with no display contract.
2. Publisher names were left in the title after `|`, `—`, or `•`.
3. Newsletter and scrape extractors kept Markdown, broken `](` fragments, HTML, and ALL CAPS SEO titles.
4. Descriptive sentence tails (`takes over … for its 54th year`) and marketing headlines (`50 Seasons of Huzzah & Cheers!`) were treated as the event name.
5. A first repair pass trusted polluted listing/schema names and previously stored display identities, which could overwrite a real event with an unrelated page title. That was tightened before the final write.

## Production audit counts

Visible inventory scanned (not archived / not rejected / recent or undated):

| Surface | Count |
|---|---|
| content_items | 3349 |
| creator_calendar_items | 801 |
| early_signals | 289 |
| curator_event_leads | 220 |

Defects observed on the raw visible titles (a record can have more than one):

| Class | Count |
|---|---|
| source_suffix | 264 |
| all_caps | 155 |
| seo_headline | 13 |
| sentence_title | 10 |
| markdown | 4 |
| html | 2 |
| cta | 1 |
| generic_heading | 1 |
| venue_as_title | 0 |
| better_title_in_metadata | 1040 |
| cross_surface_disagreement | 54 |

`repaired: 646` / `unchanged: 4013`.

`better_title_in_metadata` counts records whose computed display title already differed from the raw topic (including long-headline clips). `cross_surface_disagreement` is the in-memory calendar-vs-inventory check during the repair script; read-time resolution now uses the same contract on both surfaces.

## Title / display contract

The primary title answers **what is this?**  
The source line answers **who published or supplied it?**  
The subtitle may answer **what makes this occurrence notable?**

Never force all three answers into the title.

## General normalization rules

Implemented in `services/core/src/display-title/resolve-display-title.ts`. No one-off replacement table for the four production examples.

- Strip Markdown (including broken `](`), HTML, and SEO residue (`Official Website`, `Read more`).
- Split publisher suffixes at `| • · — –` only when the last segment is the known source, a discovery method, or a known publisher. Do not blindly split every dash or colon.
- If the left side is a generic heading (`Events`, `Shows`) and the right side is a real name, keep the name.
- Extract sentence tails (`takes over` / `returns to` / …) into the subtitle.
- Move anniversary / edition language from the raw headline into the subtitle.
- Title-case ALL CAPS; keep acronyms (`KC`, `VIP`, `DJ`) and internal-caps stylization (`SantaCaliGon`); stylize `KPop` → `K-Pop`.
- Do not replace a news sentence or a specific matchup/tour with an unrelated official or business name.
- Do not keep a prior-repair schedule fragment (`PM Sat …`) or a Ticketmaster SEO heading.
- Identity keys use raw title + URL / date / venue, never the cleaned title.
- Similar cleaned titles do not merge records.

Page headings / schema / Open Graph are used when a defective raw title has an official URL. Official research can improve display fields; a weaker SEO headline cannot overwrite a verified event name.

## Existing records repaired

Repair script: `services/core/src/scripts/repair-display-title-clarity.ts`.

- Writes `metadata.displayIdentity` (and calendar `title` as the display field only).
- Preserves `rawTitle` and every source URL.
- Does not delete or merge rows.
- Recomputes from raw evidence and ignores a stale stored identity so an earlier bad official name cannot stick.
- Bounded public fetch (48 unique defective URLs) stores `listingScrape.heading` / `ogTitle` / `schemaName` when the official page heading is a better event name.

## Before-and-after examples

| Raw | Display title | Subtitle | Source / venue |
|---|---|---|---|
| `FIRST FRIDAYS VENDORS \| JuneteenthKC` | Strengthen the Vine First Fridays | Vendor market at 18th & Vine | JuneteenthKC / 18th & Vine |
| `KPop Demon Hunters Night \| Kansas City Royals` | K-Pop Demon Hunters Night | — | Kansas City Royals / Kauffman Stadium |
| `_[SantaCaliGon Days]( takes over Historic Independence Square for its 54th year` | SantaCaliGon Days | 54th annual festival at Historic Independence Square | — |
| `50 Seasons of Huzzah & Cheers!` (when official/evidence names the festival) | Kansas City Renaissance Festival | 50th season | — |
| `Shows — The Bowline Brothers` | The Bowline Brothers | — | — |

The stored Kansas City Renaissance Festival row was already the official name. The Huzzah marketing headline is covered by the general official-name + anniversary rules and tests. Public Calendar shows **Kansas City Renaissance Festival** without the SEO headline.

## Research-enrichment behavior

`applyResearchDisplayTitle` in Discover **Research this**:

- May improve display title, subtitle, primary source, venue, official URL, and verification.
- Promotes a public organizer (for example City of Independence) while keeping Newsletter Intelligence as `discoveredThrough`.
- Will not let a marketing / generic / CTA research heading overwrite a verified event name.
- Does not rewrite `content_items.topic`.

## Cross-surface consistency results

The same resolver is used by Calendar items, Discover cards, Discover details, Today / weekend list, Watchlist activity, and Early Signals.

Public Calendar API after deploy:

- Strengthen the Vine First Fridays / Vendor market at 18th & Vine
- K-Pop Demon Hunters Night / Kansas City Royals / Kauffman Stadium
- SantaCaliGon Days / 54th annual festival at Historic Independence Square
- Kansas City Renaissance Festival

Public Discover details `https://benson.kckellie.com/discoveries/121e9651-980c-489e-82be-7313adfc5926` shows the same First Fridays title and subtitle.

## Files and migrations changed

No database migration. Display identity is metadata-only.

- `services/core/src/display-title/*` — contract, resolver, page-hint extract, tests
- `services/core/src/scripts/repair-display-title-clarity.ts` — audit + safe repair
- Discover: `discover-card.ts`, `actions.ts`, `discover-identity.ts`, `types.ts`
- Calendar: `items.ts`, `eligibility.ts`, `types.ts`, weekend list / things-to-do
- Today: `today-clarity.ts`
- Watchlist: `watchlist-activity.ts`
- Early Signals: `store.ts`, `types.ts`
- Dashboard title wrapping + optional subtitle on existing cards (no card redesign)
- `services/core/package.json` — include display-title / today-clarity / home-briefing tests

## Tests and exact results

Focused display-title tests: **`# tests 26` `# pass 26` `# fail 0`**.

Required cases covered: publisher pipe; legitimate punctuation; Markdown / broken Markdown; HTML; ALL CAPS / acronyms / SantaCaliGon; CTA; sentence tail; anniversary; source retained; newsletter provenance; official source after research; weak research cannot overwrite; cross-surface sameness; identity unchanged; no false dedupe; missing-evidence fallback; mobile length; page heading vs SEO title; Ticketmaster SEO reject; news sentence / org collapse / schedule-fragment / specific matchup.

Full relevant suite (display-title, today-clarity, discover-trust, home-briefing-authority, home-showroom, watchlist, early-signals, calendar items/eligibility/sync/weekend, newsletter date-normalize, Gmail newsletter route, Playwright runtime, worker-heartbeat): **`# tests 400` `# pass 400` `# fail 0`**.

Playwright precheck: OK (`.benson/playwright` Chromium).

Core `tsc --noEmit`: no errors in files this pass edited. Remaining errors are pre-existing and outside this pass.

Production dashboard build: succeeded (`next build`, 88 pages).

Known suites **not** treated as this pass: `newsletter-intelligence/quality-corrections.test.ts` and `dated-occurrence-extract.test.ts` (pre-existing date/location fixtures; they do not import display-title).

## Public mobile and desktop verification

Public site `https://benson.kckellie.com` against local API `:4000` / dashboard `:3000`.

| Surface | Result |
|---|---|
| Home Today’s Brief | Video-growth first (3 lines); Watchlist checked 42 sources; BFTF next date Friday, September 4, 2026; follower line once (+4 / 6,679). No polls or bait. No hard-coded 2026-09-03 floor. |
| Calendar | K-Pop Demon Hunters Night; Kansas City Renaissance Festival; Strengthen the Vine / SantaCaliGon present in page text. `FIRST FRIDAYS VENDORS` raw count = 0. |
| Discover | Clean event names on the first page (Collect-A-Con, Wu-Tang Clan Concert). No broken Markdown. |
| Details | Strengthen the Vine First Fridays + Vendor market at 18th & Vine. |
| Watchlist | Loaded; source list intact. |
| Early Signals | Loaded; Sapphic Con Festival cleaned; unresolved CTA `Sign up and secure your spot now!` remains `needs_verification`. |

The public browser session was a narrow (phone-width) viewport with the bottom nav. The same pages were confirmed via local Calendar API at desktop data width.

## Screenshot paths

| Surface | File |
|---|---|
| Calendar | `docs/ops/screenshots/display-title-clarity-2026-09-02-calendar-desktop.png` |
| Calendar (narrow) | `docs/ops/screenshots/display-title-clarity-2026-09-02-calendar-mobile.png` |
| Home Brief | `docs/ops/screenshots/display-title-clarity-2026-09-02-home-desktop.png` |
| Home Brief (narrow) | `docs/ops/screenshots/display-title-clarity-2026-09-02-home-mobile.png` |
| Discover | `docs/ops/screenshots/display-title-clarity-2026-09-02-discover-desktop.png` |
| First Fridays details | `docs/ops/screenshots/display-title-clarity-2026-09-02-details-desktop.png` |
| Watchlist | `docs/ops/screenshots/display-title-clarity-2026-09-02-watchlist-desktop.png` |
| Early Signals | `docs/ops/screenshots/display-title-clarity-2026-09-02-signals-desktop.png` |

## Fingerprints

```
status: MATCH
source/api/dashboard/worker: c07bcc69b53d7218
apiStartedAt: 2026-09-02T19:20:51.726Z
dashboardBuiltAt: 2026-09-02T19:10:41Z
workerStartedAt: 2026-09-02T19:21:01.675Z
```

## Commit hash and branch

Branch: `release/scout-expansion-2026-07-25`  
Implementation commit: `2dbbd341eb8ae03be0d0c2ded0dd9c92db692fd9`  
Report commit: *this docs commit*

## Clean-tree and remote-match confirmation

*Filled after push.*

## Remaining limitations

- Some Discover / Home rows still use a generic page heading when the official event name is not in structured metadata (`Events Archive - Kansas City Convention Center`). Conservative cleanup does not invent a barbecue-competition name from body copy alone.
- A few Benson feed names still appear as the source line (`[Benson] FIRST FRIDAYS VENDORS | JuneteenthKC`) even when the title is clean. The public source is not always the feed label.
- Early Signals can still show a CTA or a URL fragment when there is no verified official name (`Sign up and secure your spot now!`, `Art Gallery Closing Reception Https://www`). Those stay `needs_verification`.
- Page-heading fetch is bounded (48 URLs) and best-effort. Not every defective URL is scraped.
- Long news headlines are clipped to 72 characters rather than rewritten as event names.
- Hyde Park “Events — …” rows can pick a farmers-market heading from the official page when that heading shares “Hyde Park.” That is more specific than `Events`, but it may not be the only program on that page.
