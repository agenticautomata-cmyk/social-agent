# Benson Season-Page Handoff — KC Melting Pot Theatre (2026-09-11)

**Lane:** SEASON-PAGE (KC Melting Pot only)  
**URL:** `https://kcmeltingpot.com/current-season/`  
**Safety:** no deploy / push / Telegram / outreach / billable AI

## Diagnosis (collapse-to-one)

| Layer | Finding |
| --- | --- |
| Page shape | WordPress + Elementor season page: repeated `<h2 class="elementor-heading-title">` production sections; each performance is a dated `<a>` to OnTheStage |
| JSON-LD | WebPage only — **no** Event nodes |
| Prior pipeline | JSON-LD → ICS → Squarespace → Wix → semantic Wix cards → **0 yield** (`page_not_classified_as_event_listing`) |
| Collapse risk | All ~9 performances of a production share **one** OnTheStage show URL. Fingerprinting by `eventUrl` alone collapses a production (or the whole page) to one record |

Root cause: no theater-season adapter + URL-first dedupe unsafe for shared ticket links.

## Repair

New capability-based module (not hostname-hardcoded success):

1. Detect season-page signals (path `/current-season|past-seasons|now-playing` + dated performance anchors / OnTheStage show links + production headings)
2. Parse production sections → dated performances
3. Exclude expired by **America/Chicago** local YMD (`startDate >= today`)
4. Stable identity per performance: `prodperf:{ticketShowId}\|{localDateTime}\|{venueSlug}` (externalId) — **not** shared ticket URL alone
5. Persist performances with shared `productionGroupKey` / `productionId` / `productionTitle`
6. Watchlist UI groups by `productionGroupKey` → **4 production cards**; expand for dates/times

### Live / fixture check (now = 2026-09-11 America/Chicago day)

| | Count |
| --- | --- |
| Expired excluded | Like Six O’Clock — 11 performances (Jun 11–26 2026) |
| Upcoming production groups | **4** |
| Upcoming performances | **36** (9 × Jitney, Livin’ Fat, Blues…, God of Carnage) |
| Distinct fingerprints | **36** |
| Second extract | identical fingerprints (no identity drift) |

Times are local wall clocks as printed on the page (e.g. Jitney `2026-09-17T10:00:00` / `19:30:00`) — no UTC day shift.

## Files

| Path | Role |
| --- | --- |
| `services/core/src/benson-scout/theater-season-extract.ts` | Detector, parser, identity, grouping helper |
| `services/core/src/benson-scout/theater-season-extract.test.ts` | Fixture + fingerprint / expiry / grouping tests |
| `services/core/src/benson-scout/fixtures/kc-melting-pot-current-season.fixture.html` | Structural season-page fixture (5 productions incl. expired) |
| `services/core/src/benson-scout/event-listing-extract.ts` | Strategy wire-in `theater_season`; shared-ticket fingerprint guard; path `/current-season` |
| `services/core/src/benson-scout/event-listing-watch.ts` | Persist production fields on scout `relevanceExplanation`; `productionGroupCount` / `listingDisplayMode` in watcher config; status copy |
| `services/core/src/benson-scout/types.ts` + `watchlist.ts` | Card fields: `productionGroupCount`, `performanceCount`, `listingDisplayMode` |
| `services/core/src/benson-scout/index.ts` | Re-export theater-season module |
| `dashboard/app/watchlist/[id]/watchlist-detail-panel.tsx` | Production-group summary UI (expand for performances) |

**Not edited:** DoStuff, Meetup, WordPress/TEC MTH, Squarespace, Wix, Eventbrite cores.

## Schema needs

**No primary migration required** for this lane.

Hierarchy is JSON on existing `scout_items.relevanceExplanation`:

- `listingRole: "performance"`
- `productionId` (e.g. `onthestage:{showId}`)
- `productionGroupKey` (e.g. `prod:{showId}`)
- `productionTitle`
- `performanceLabel`
- `runStartDate` / `runEndDate`
- `startDate` / `startDateTime` (America/Chicago wall time, no `Z`)

Optional later (primary): `parent_scout_item_id` if production parent rows must be first-class DB entities. Current approach stores **performances only** + UI grouping.

Watcher `config` (no migration):

- `listingDisplayMode: "production_groups"`
- `productionGroupCount: 4`
- `performanceCount: 36`
- `recordsExtracted` / `verifiedYield` remain performance counts (status text cites both)

## UI grouping contract (primary)

```ts
// Scout item relevanceExplanation (per performance)
{
  method: 'theater_season',
  platform: 'theater_season',
  listingRole: 'performance',
  productionId: 'onthestage:6a04f3a83ce95448420cd2f9',
  productionGroupKey: 'prod:6a04f3a83ce95448420cd2f9',
  productionTitle: 'JITNEY',
  performanceLabel: 'Thursday, Sep 17 at 10:00am (Preview)',
  startDate: '2026-09-17',
  startDateTime: '2026-09-17T10:00:00',
  runStartDate: '2026-09-17',
  runEndDate: '2026-09-26',
  venue: 'KC Melting Pot Theatre',
  eventUrl: 'https://onthestage.tickets/show/.../6a04f3a8.../', // shared OK
  ticketOrRsvpUrl: string
}

// Watcher config
{
  listingDisplayMode: 'production_groups',
  productionGroupCount: 4,
  performanceCount: 36,
  recordsExtracted: 36,
  verifiedYield: 36
}
```

**Summary surface:** one card per distinct `productionGroupKey` (expect **4**).  
**Detail:** expand card → sorted `startDateTime` rows via `performanceLabel`.  
Helper: `groupTheaterSeasonPerformancesForWatchlist(rows)`.

## Tests

```bash
cd services/core
node --import tsx --test src/benson-scout/theater-season-extract.test.ts
# 6/6 pass
node --import tsx --test src/benson-scout/event-listing-extract.test.ts
# 19/19 pass (Wix / Squarespace / status regressions)
```

## Primary follow-ups (out of lane)

1. Deploy + run Check now on the live Melting Pot watcher (this lane did not deploy).
2. Confirm second check → `no_change`, `newRecordsFound: 0`, still 36 scout items / 4 UI groups.
3. If primary wants parent rows in DB, add migration + promote `itemKind: production` rows (extractor already can emit production metadata; pipeline persists performances today).
