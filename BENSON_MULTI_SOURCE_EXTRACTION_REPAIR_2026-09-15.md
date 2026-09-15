# Benson Multi-Source Extraction Repair — 2026-09-15

**Branch:** `release/scout-expansion-2026-07-25`  
**Commits:** `dfb1741` → `8258fec`  
**Builds on:** `BENSON_VISITKC_HTML_CALENDAR_READER_2026-09-15.md` (MATCH `0c37da5fead8fa9d`)  
**Fingerprint:** **MATCH** `ea180d69102e4db1`  
**Public:** https://benson.kckellie.com · **API:** https://api.kckellie.com  

**Hard bans honored:** no VisitKC-/Raphael-/PnL-/VYE-only scrapers; no domain/event hard-coding in production logic; fixtures use `example.org`; no CAPTCHA bypass; no billable AI; no outreach; Calendar Admission remains downstream.

## Executive summary

Repaired generalized website + Instagram extraction so five live acceptance sources stop lying about empty/past calendars, duplicate VisitKC feed health, pagination depth, HTML entities, and Instagram title/venue quality.

| Watcher | ID | Disposition |
| --- | --- | --- |
| Raphael Hotel | `3a65e7b7-1308-4b93-a489-cb12e04923a3` | **healthy → no_change** · TEC REST · 50 Chaz occurrences |
| Power & Light | `231e8458-6046-4edb-b01f-ae45a9dcd383` | **healthy → no_change** · embedded JSON · 35 occurrences |
| VYE Lounge IG | `8927fb6b-d906-4cc5-8f81-931adb3f9ec0` | **healthy** · coverage complete · **review=3** exposed · OnWax title repaired |
| VisitKC `/events/` | `6e43a4cd-90d4-4a70-a910-bec6c13ff773` | **healthy** · semantic HTML · **cursor 5 → 9** (pages 6–9 newly traversed) |
| VisitKC `/events/feed/` | `f6e49a80-6221-477d-a549-a4418b9646e6` | **`duplicate_source`** of `/events/` (audit preserved) |

## Root causes repaired (generalized)

| Failure | Cause | Repair layer |
| --- | --- | --- |
| Raphael `html_watch` / `no_yield` | `/event-calendar/` missing from path heuristics → early-signals path | `url-inspect` + `event-listing-extract` `EVENT_PATH_RE` |
| TEC zero cards on some themes | Required `type-tribe_events` only | Loosen list article match; curtain times; venue address |
| TEC REST past flood under CAPTCHA | `ends_after=2020-01-01` returned historical rows → false `empty_confirmed` | Current-day Chicago `ends_after` + upcoming-aware reconcile |
| PnL false past-only / needs_adapter | `__NEXT_DATA__.initialEvents` discovered but never extracted; weak JSON-LD could win | `embedded-json-events-extract` + `surface-reconcile` |
| VisitKC feed “healthy website” | `/events/feed/` routed as event listing; RSS typed but adaptive JSON-LD run | Exclude RSS/feed from event-listing router; `source-overlap` → `duplicate_source` |
| Feed pubDate as event start | WP “appeared first on” boilerplate | Feed parse: refuse pubDate when syndication boilerplate |
| Pagination stuck at pages 1–5 | No per-watcher cursor | Persist `htmlCalendarPaginationCursor`; always refresh page 1; resume deep pages |
| `&amp;` in titles/venues | Partial local decoders | Shared `decodeHtmlEntitiesDeterministic` at extract/feed boundaries |
| IG promo title / `VYE. 8PM.` venue | Weak title scoring; time mangled into venue | Caption title scoring; strip time from venue; collab attribution helper; review count prefers visual authority |

## PART 4 — Visit KC watcher inventory

| ID | URL | Declared / adapter | Platform | Method (last) | Status | Lifetime notes |
| --- | --- | --- | --- | --- | --- | --- |
| `6e43a4cd-90d4-4a70-a910-bec6c13ff773` | https://www.visitkc.com/events/ | event_directory / event_listing | web | semantic_html_blocks | healthy | Authoritative HTML calendar; 60 pages detected |
| `f6e49a80-6221-477d-a549-a4418b9646e6` | https://www.visitkc.com/events/feed/ | event_directory / rss_feed | rss | (superseded) | **duplicate_source** | Real `application/rss+xml`; WP syndication feed overlapping `/events/` |

Consumers: Scout watchlist + scout_items; Calendar Admission remains downstream. Overlap: feed is syndication of the same CPT inventory as the HTML calendar — not an independent listing.

## Sample events (live)

### Raphael (Chaz Restaurant)
| Title | Start | Venue | URL |
| --- | --- | --- | --- |
| Strings on The Green: Chloe McFadden Quartet | 2026-09-16 17:30 | Chaz Restaurant | https://raphaelkc.com/event-calendar/strings-on-the-green-chloe-mcfadden-quartet-3/ |
| Jackie Myers Duo | 2026-09-17 18:00 | Chaz Restaurant | https://raphaelkc.com/event-calendar/jackie-myers-duo-19/ |
| Brian Ruskin Duo | 2026-09-18 18:00 | Chaz Restaurant | https://raphaelkc.com/event-calendar/brian-ruskin-duo-13/ |
| Matt Villinger Duo | 2026-09-19 18:00 | Chaz Restaurant | https://raphaelkc.com/event-calendar/matt-villinger-duo-17/ |
| Mengel & Matthew Duo | 2026-09-20 18:00 | (unpublished) | https://raphaelkc.com/event-calendar/mengel-matthew-duo-27/ |

Note: configured HTML may be CAPTCHA-challenged from the host; public TEC REST (`…/v1/events?ends_after=<today>`) supplies upcoming Chaz nights. Second run: **0 new / no_change**.

### Power & Light (September)
| Title | Start | Venue |
| --- | --- | --- |
| POWER HOUR SCULPT FUSION | 2026-09-16 | KC Power & Light |
| NIC VANS | 2026-09-18 | Mosaic Ultra Lounge |
| UFC 331 Watch Party | 2026-09-19 | McFadden's Sports Saloon |
| KANSAS CITY TACO FESTIVAL | 2026-09-19 | KC Live! |

Second run: **0 new / no_change**.

### VisitKC pagination cursor proof
| Check | Occurrences | Pages completed | Cursor | Newly traversed |
| --- | --- | --- | --- | --- |
| Pass A | 176 | 4/4 | **5** | 2,3,4,5 |
| Pass B | 200 | 4/4 | **9** | **6,7,8,9** |

Configured URL unchanged: `https://www.visitkc.com/events/`. Total pages detected: **60**. Page 1 always refreshed; deep pages resume from cursor.

### VYE / OnWax
Coverage line: `1 candidate · 3 review · coverage=complete` (review count reconciles).

| event_name | date | time | venue | notes |
| --- | --- | --- | --- | --- |
| OnWax R&B Edition | 2026-09-19 | 8PM | @vyelounge Rooftop | PARTIALLY_VERIFIED (prior good row) |
| OnWax R&B Edition | 2026-09-19 | — | — | New review row (title fixed; fields incomplete → review, not demote) |

Legacy bad row (`We’ve sold out…` / venue `VYE. 8PM.`) retained for audit; new extracts prefer series title + time-stripped venue. Attribution still records collaborative collaborator handle on some rows; `buildAttributionLine` now accepts collaborators — further watcher-handle provenance wiring remains incremental.

## Status semantics (shipped)

Added / wired: `duplicate_source`, `superseded`, `misconfigured`, `complete_no_current_events`, `partial` on adaptive + display health. HTTP 200 / browser alone never imply healthy. Empty surface cannot overrule coherent upcoming surface (reconcile by upcoming completeness).

## Tests / validation

| Suite | Result |
| --- | --- |
| `multi-source-extraction-repair.test.ts` + TEC + HTML calendar | **29/29 pass** |
| Full `benson-scout/**/*.test.ts` | **141/142** — 1 pre-existing IG canonical DB flaky (`watchlist-canonical.test.ts` jasfoodjourney) unchanged |
| Deploy health | **MATCH** `ea180d69102e4db1` |

Core `tsc --noEmit` still has longstanding unrelated script/type debt (documented prior); production dashboard + worker build succeeded via deploy.

## Files changed (high level)

- `embedded-json-events-extract.ts`, `surface-reconcile.ts`, `source-overlap.ts` (new)
- `event-listing-extract.ts`, `wordpress-tec-extract.ts`, `html-calendar-extract.ts`
- `adaptive-extraction/{orchestrator,feed-extract,platform-registry,types}.ts`
- `event-listing-watch.ts`, `pipeline.ts`, `url-inspect.ts`
- Instagram: `caption-event-extract.ts`, `location-trust.ts`, `slide-ocr.ts`, curator `pipeline.ts`, `watchlist-state.ts`
- Regressions: `multi-source-extraction-repair.test.ts`

## Deploy

```
status: MATCH
source/api/dashboard/worker: ea180d69102e4db1
apiStartedAt: 2026-09-15T17:24:41.166Z
dashboardBuiltAt: 2026-09-15T17:24:48Z
workerStartedAt: 2026-09-15T17:24:48.332Z
```

## Return

| Field | Value |
| --- | --- |
| MATCH | `ea180d69102e4db1` |
| Watcher IDs + dispositions | see table above |
| Sample events | Raphael Chaz / PnL September / VisitKC / OnWax |
| Pagination cursor proof | VisitKC cursor **5 → 9**, newly **6,7,8,9** |
| Report path | `BENSON_MULTI_SOURCE_EXTRACTION_REPAIR_2026-09-15.md` |
