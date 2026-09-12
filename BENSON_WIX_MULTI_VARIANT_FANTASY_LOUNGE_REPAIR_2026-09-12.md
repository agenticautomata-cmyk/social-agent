# Benson Wix Multi-Variant Fantasy Lounge Repair — 2026-09-12

**Role:** Primary implementer  
**Branch:** `release/scout-expansion-2026-07-25`  
**Watcher:** `a2f69814-f54b-4cbb-88c1-9501d65335f0`  
**Configured URL:** `https://www.thefantasylounge.com/event-list`  
**Baseline fingerprint before repair:** `5174ba8ff732af66`  
**Final MATCH fingerprint:** `1ec1ac9d9c6206ed`

## Verdict

**PASS** — Fantasy Lounge extracts and groups 8 upcoming ticket/RSVP nights via reusable Wix Events hydration; second run is `no_change` with zero duplicates; 18th & Vine and other regression sources remain operational; deploy fingerprints MATCH; no outreach/login/RSVP/purchase.

## Root cause

1. **Routing misclassification (primary):** `/event-list` did not match `EVENT_PATH_RE` (`events?` requires end-of-segment, so `event-list` failed). Fantasy Lounge was inspected as `http_then_browser` / `html_watch` / `web_page` and never entered the Wix-capable `event_listing` adapter. That produced false `no_yield` despite public dated cards.

2. **Detail-path overfit (secondary):** Hydration URL builder hard-coded `/event-details-registration/…`. Fantasy Lounge publishes `/event-details/…` (observed from SSR hrefs / `detailsPagePath`). Extraction against full HTML could yield rows, but links were wrong for this variant.

3. **Missing companion model:** FL publishes paired ticket + themed RSVP cards for one night. Prior path treated every card as an independent listing (and never reached extraction in production due to #1).

Hydration itself was already present in SSR `appsWarmupData` / `"events":[{…}]` for Fantasy Lounge (16 records). Browser wait was not the live failure mode once routing was corrected; HTTP HTML already contained the payload. Bounded Playwright wait for mounted list/payload was still added for incomplete shells.

## Wix formats and capabilities discovered

| Variant | Signals | Payload | Detail path |
| --- | --- | --- | --- |
| 18th & Vine | `events-viewer`, SSR cards | `"events":[{…}]` hydration | `/event-details-registration/…` |
| Fantasy Lounge | `events-viewer`, `side-by-side-item`, `ev-rsvp-button` | same hydration shape + ticket/RSVP registration types | `/event-details/…` |
| Cannabis Network KC | Wix site + events-viewer **CDN assets only** | no mounted list / empty upcoming | n/a — supported empty |

Capability order remains: Event JSON-LD → Wix hydration → SSR cards → bounded Playwright DOM.

## Files changed

- `services/core/src/benson-scout/wix-events-extract.ts` (new)
- `services/core/src/benson-scout/wix-events-extract.test.ts` (new; 15 mission cases)
- `services/core/src/benson-scout/fixtures/wix-*.fixture.html` (12 structural fixtures)
- `services/core/src/benson-scout/event-listing-extract.ts`
- `services/core/src/benson-scout/event-listing-watch.ts`
- `services/core/src/benson-scout/url-inspect.ts`
- `services/core/src/benson-scout/watchlist.ts`
- `dashboard/app/watchlist/[id]/watchlist-detail-panel.tsx`

## Schema / migration changes

None. Companion fields, restrictions, and diagnostics persist in `scout_items.relevance_explanation` JSON and `source_watchers.config`.

## Live Fantasy Lounge results

### Raw / grouped

| Metric | Value |
| --- | --- |
| Raw hydration records | 16 |
| Grouped event nights | **8** |
| Companion ticket/RSVP pairs linked | **8** |
| Method | `wix_events_hydration` |
| Platform | `wix_events` |

### Companion handling

Each night merges evidenced ticket (`registration.type` / Buy Tickets) + themed RSVP (`Theme:` suffix) sharing local start + venue + base title. Display title prefers the themed card; base title kept as alias; both Wix IDs and both public detail URLs retained. Unrelated same-night titles stay separate (fixture-covered).

### Public restrictions retained

From public descriptions (not invented): **Members only**, **Vetted guests**. **21+** extracted when present in text (fixture-covered); live FL descriptions sampled did not publish an explicit 21+ string on the list payload. Sold-out flags retained when present on registration ticketing.

### Representative current nights (America/Chicago)

| Night | Local | Ticket | RSVP |
| --- | --- | --- | --- |
| Saturday Night Event-September 12 — Theme: All White Energy | 2026-09-12 · 9:00 PM | `/event-details/saturday-night-event-september-12` | `/event-details/…-theme-all-white-energy` |
| Friday Night Event-September 18 — Theme: Newbie Night | 2026-09-18 · 9:00 PM | paired | paired |
| Saturday Night Event-September 26 — Theme: Hot Wife | 2026-09-26 · 9:00 PM | paired | paired |
| Friday Night Event-October 2 — Theme: 1ST Friday Night Vibes | 2026-10-02 · 9:00 PM | paired | paired |
| Saturday Night Event-October 10 — Theme: Midnight Masquerade | 2026-10-10 · 9:00 PM | paired | paired |
| Friday Night Event-October 16 — Theme: Newbie Night | 2026-10-16 · 9:00 PM | paired | paired |
| Saturday Night Event-October 24 — Theme: Halloween | 2026-10-24 · 9:00 PM | paired | paired |
| Friday Night Event-October 30 — Theme: Fantasy After Dark | 2026-10-30 · 9:00 PM | paired | paired |

Configured URL preserved: `https://www.thefantasylounge.com/event-list`.

### First run

- Adapter upgraded `html_watch` → `event_listing`
- Baseline: 8 verified nights, 8 new scout items
- Explanation includes raw 16 / nights 8 / companions 8

### Second run

- `no_change`, `newRecordsFound=0`
- Inventory still 8 distinct `occurrence_fingerprint`s
- Companion relationships stable

### DB / API / UI

- DB scout items: 8 grouped nights with ticket+RSVP URLs, members/vetted flags, companion IDs
- `/api/watchlist/{id}` returns 8 `scoutItems` matching DB captions/dates
- Watchlist detail UI shows themed title, local date/time, venue, members/vetted, ticket+RSVP actions, evidence, review state

## Automated tests

- `wix-events-extract.test.ts` + `event-listing-extract.test.ts`: **35/35 pass**
- Broader event-extraction suite (listing, Wix, Squarespace, TEC, theater, DoStuff/Meetup, outcomes): **59/59 pass**

## Regression results (live re-check)

| Source | Result |
| --- | --- |
| 18th & Vine | **PASS** — `wix_events_hydration`, 6 listings, `no_change`, URL preserved |
| Cannabis Network KC | **PASS** — Wix detected, supported empty / no upcoming invented (`no_change`) |
| Music Theater Heritage | **PASS** — `wordpress_tec`, 18, `no_change` |
| KC Melting Pot | **PASS** — `theater_season`, 4 production groups / 36 performances, `no_change` |
| Eventbrite KC | **PASS** — operational (59 extracted this check) |
| The OSC | **PASS** — `squarespace_events`, 36, `no_change` |

## Deployment

```text
pnpm benson:deployment-status   # DRIFT after source change
pnpm benson:deploy-local        # MATCH
pnpm benson:deployment-status   # MATCH 1ec1ac9d9c6206ed
```

Final fingerprints:

```json
{
  "status": "MATCH",
  "sourceFingerprint": "1ec1ac9d9c6206ed",
  "apiFingerprint": "1ec1ac9d9c6206ed",
  "dashboardFingerprint": "1ec1ac9d9c6206ed",
  "workerFingerprint": "1ec1ac9d9c6206ed"
}
```

## Commits

- `585e7f6` — Support multi-variant Wix Events lists with ticket/RSVP companion nights.
- `7768661` — Distinguish mounted Wix event lists from CDN asset mentions.

## Safety verification

- No Fantasy Lounge login, membership/vetting forms, RSVP, or ticket purchase
- No email/Telegram/outreach (`outreach_emails` fantasy hits in window: 0; no telegram outbox tables)
- No billable AI/image APIs
- Events remain review-only (`reviewOnly: true` on persisted relevance)

## Unresolved Wix variants / limitations

- Sites that only load event payloads via authenticated XHR after shell paint still require the bounded Playwright path
- `detailsPagePath` alone is insufficient (18th & Vine settings say `details` while hrefs use `event-details-registration`); href-frequency detection is required
- Explicit 21+ is retained only when publicly present in description text
- Historical Vine scout inventory may retain a stale extra row from earlier inventory drift; current extraction yield remains 6 matching live

## Ready for verifier

**YES** — ready for independent live/DB/API/UI/deploy verification.
