# Benson VisitKC HTML Calendar Reader — 2026-09-15

**Branch:** `release/scout-expansion-2026-07-25`  
**Commits:** `b431d2e` → `35d3406` → `1d49fe9`  
**Builds on:** `BENSON_ADAPTIVE_WEBSITE_EXTRACTION_2026-09-13.md`, `BENSON_GENERAL_PUBLIC_WEBSITE_READER_2026-09-13.md`  
**Fingerprint:** **MATCH** `0c37da5fead8fa9d`  
**Public:** https://benson.kckellie.com · **API:** https://api.kckellie.com  

**Hard bans honored:** no VisitKC-only scraper / domain hard-coding / event-specific selectors in the generic path; no CAPTCHA bypass; no billable AI; no outreach; Calendar Admission remains downstream; configured collection URL preserved.

## Executive summary

VisitKC (`https://www.visitkc.com/events/`) was returning HTTP 200 / useful HTML with **platform unknown**, **0 groups / 0 occurrences**, and **`needs_adapter`**. Public SSR HTML actually contains thousands of listings under full-date headings (e.g. `Tuesday, September 15, 2026`) with short month/day chips, linked titles, venues, categories, images, and numbered pagination.

Root cause: the “generic” semantic path only reused **Wix** semantic-card parsing. Date-heading SSR calendars never had a real reader.

**After fix (live acceptance):**
- Platform: **`generic_semantic_html`**
- Method: **`semantic_html_blocks`**
- Status: **`healthy`** then **`no_change`**
- Occurrences: **199** (bounded page budget)
- Pagination: **4/4** additional pages attempted/completed (page 1 + pages 2–5)
- Second check: **0** new items / no dups
- Watcher: `6e43a4cd-90d4-4a70-a910-bec6c13ff773` (`visitkc.com`)

## Root cause

| Observation | Why extraction failed |
| --- | --- |
| HTTP 200 · useful_html | Page is SSR with real event cards |
| Platform unknown | Capability only saw `url_path_eventish` |
| 4 surfaces · 0 occurrences | JSON-LD is CollectionPage (no Event nodes); no TEC/Wix/Squarespace/RHP markers |
| `semantic_html_blocks:zero_cards` | `extractFromSemanticHtml` filtered Wix hydration cards only |
| `needs_adapter` | Adaptive correctly refused to invent an empty calendar |

VisitKC structure (generic, not selector-hardcoded):
- Date-only `h2` headings (`Tuesday, September 15, 2026`)
- Following article/card blocks with `h3 > a` detail links
- Short chips (`Sep 15`), category links, venue links or plain-text venues, lazy images
- Pagination via `/events/page/N/`, `rel=next`, and “Page X of Y” / result count

## Files changed

| File | Role |
| --- | --- |
| `services/core/src/benson-scout/html-calendar-extract.ts` | General SSR date-heading calendar reader + pagination discovery |
| `services/core/src/benson-scout/html-calendar-extract.test.ts` | Generalized regressions (example.org fixtures; no VisitKC domain checks) |
| `services/core/src/benson-scout/fixtures/ssr-date-heading-*.fixture.html` | Sanitized SSR calendar / page2 / empty fixtures |
| `services/core/src/benson-scout/event-listing-extract.ts` | Wire reader into semantic ladder; capability + platform matrix; occurrence-aware dedupe |
| `services/core/src/benson-scout/adaptive-extraction/orchestrator.ts` | Bounded `/page/N/` fetches + merge; preserve configured collection URL |
| `services/core/src/benson-scout/adaptive-extraction/platform-registry.ts` | Recognize `generic_semantic_html` from date-grouped calendars |
| `services/core/src/benson-scout/adaptive-extraction/rhp-events-extract.ts` | Capability field parity |

## Generic reader behavior

1. Detect full-date **date-only** headings (`h1–h4`) — rejects titles that merely embed dates (e.g. “May 29–Dec. 13, 2026”).
2. Within each heading section, find linked title headings / event-detail anchors.
3. Inherit heading date onto cards; short month/day chips are corroborating evidence.
4. Extract title, start date, start time **only if published**, venue (linked listing or plain trailing paragraph), canonical detail URL (tracking stripped), image (non-logo), category (evidence), source attribution, configured collection URL.
5. Recurring titles on different inherited dates stay separate occurrences; identical title+venue+start+URL dedupe.
6. Bounded pagination: numbered `/page/N/` + next; max **5** pages total; max **220** occurrences; stop on page failure → `partial`.

**Not done:** VisitKC-specific CSS classes (`day-of-week`, `card-event-date`, `js-post`, etc.), domain allowlists, or inventing unpublished times.

## Platform / template fingerprint

| Signal | Value |
| --- | --- |
| Adaptive platform | `generic_semantic_html` |
| Profile key | `generic:semantic:v1` |
| Method | `semantic_html_blocks` |
| Template shape | SSR date-heading list + WP-like event CPT cards + numbered pagination |
| JSON-LD | CollectionPage only (insufficient alone) |

Existing adapters (Wix, TEC, Squarespace, Eventbrite, DoStuff, RHP, theater season, adaptive orchestrator) preserved; VisitKC did not require a site-specific adapter after the generic reader repair.

## Fixtures / regressions

- `ssr-date-heading-calendar.fixture.html` — date headings, short chips, linked + plain venues, tracking params, recurring indicator, pagination chrome
- `ssr-date-heading-calendar-page2.fixture.html` — later dates / same recurring title
- `ssr-date-heading-empty.fixture.html` — no date headings
- Tests assert: inherited dates, cross-date recurring preservation, tracking strip, pagination plan, adaptive merge, no VisitKC domain checks

**Suite notes:** focused calendar + scout adapter tests pass. Broader `benson-scout` run: 130/131 (pre-existing flaky Instagram canonical DB test unrelated). Core `tsc --noEmit` still has longstanding unrelated script/type debt; production dashboard build + deploy succeeded.

## Live acceptance

Configured URL: `https://www.visitkc.com/events/`  
Watcher: `6e43a4cd-90d4-4a70-a910-bec6c13ff773`

| Check | Status | New | Occurrences | Pages |
| --- | --- | --- | --- | --- |
| Final A | healthy | 100 (incremental vs prior partial imports) | **199** | **4/4** |
| Final B | no_change | **0** | **199** | **4/4** |

Prior incorrect status (`needs_adapter` / 0 groups / 0 occurrences) corrected to **healthy → no_change** with real groups/occurrences.

### Sample events (≥5) with evidence URLs

| Title | Start | Venue | Detail URL |
| --- | --- | --- | --- |
| Alchemy of Knowledge: Science and Mystery from Shakespeare to AI (March 13-Oct 9) | 2026-09-15 | The Linda Hall: Science Library & Arboretum | https://www.visitkc.com/events/alchemy-of-knowledge-science-and-mystery-from-shakespeare-to-ai-march-13-oct-9/ |
| Andretti Overland Park Holiday Showcase | 2026-09-15 | Andretti Indoor Karting & Games | https://www.visitkc.com/events/andretti-overland-park-holiday-showcase/ |
| Beer Kitchen Music Bingo | 2026-09-15 | Beer Kitchen | https://www.visitkc.com/events/beer-kitchen-music-bingo/ |
| Big Mike's Classic Piano Bar | 2026-09-15 | Uptown Lounge | https://www.visitkc.com/events/big-mikes-classic-piano-bar/ |
| Blues Traveler & Gin Blossoms at Starlight | 2026-09-15 | Starlight Theatre | https://www.visitkc.com/events/blues-traveler-gin-blossoms-at-starlight/ |

Additional verified detail-page spot checks (titles present on detail HTML): Half Off Tuesdays at Atlas9 (2026-09-22), Berlin Wall exhibition (2026-09-21), West Bottoms Urban Hike (2026-09-20), Women's Empowerment Day (2026-09-19), Rhythm and Blues Night (2026-09-16).

All rows carry `collection_url:https://www.visitkc.com/events/` (configured URL unchanged).

## Limitations

- Public listing cards often omit clock times → `start_time:unpublished` (correct; no invention).
- Bounded import: 5 pages / 220 occurrence cap — VisitKC advertises ~2,368 results / 60 pages; later pages remain for subsequent checks / higher budgets.
- Sibling category URLs (e.g. `/events/type/free-events/`) may be discovered but are **not** merged into the configured collection yield.
- Featured carousel above the date-grouped list is not treated as a date heading section.
- Calendar Admission / Discover publishing remain downstream of extraction.

## Deploy

```
status: MATCH
source/api/dashboard/worker: 0c37da5fead8fa9d
apiStartedAt: 2026-09-15T12:46:18.568Z
dashboardBuiltAt: 2026-09-15T12:46:25Z
workerStartedAt: 2026-09-15T12:46:25.303Z
```

## Return

| Field | Value |
| --- | --- |
| MATCH | `0c37da5fead8fa9d` |
| Watchlist source status | `healthy` → `no_change` |
| Occurrence counts | 199 / 199 groups |
| Sample events | see table above |
| Report path | `BENSON_VISITKC_HTML_CALENDAR_READER_2026-09-15.md` |
