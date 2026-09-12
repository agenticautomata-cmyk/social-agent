# Benson WordPress / TEC + Music Theater Heritage Handoff — 2026-09-11

## Ownership

WordPress / The Events Calendar (TEC / Tribe) reusable extraction + Music Theater Heritage Watchlist repair lane.

**Not owned here:** Squarespace / Wix / Eventbrite / Meetup / DoStuff adapters (untouched). No deploy / push / Telegram.

## Root cause (MTH)

Configured URL `https://musictheaterheritage.com/shows/` is a Divi **marketing hub**, not a TEC list. Same-origin evidence advertises the real calendar:

| Signal | Value |
| --- | --- |
| Nav “Calendar” | `/events/` |
| TEC meta | `tec-api-version=v1`, `tec-api-origin` |
| Official REST | `https://musictheaterheritage.com/wp-json/tribe/events/v1/` |
| iCal | `https://musictheaterheritage.com/events/?ical=1` |
| Plugin | The Events Calendar **6.17.3** (list view default) |

Public “~35 events” matches **month-grid day cells** for multi-day runs. Official list / REST / ICS expose **production runs** (~18 currently ending after today) — one row per show span, not per performance night. Curtain times are **not published** (all-day DATE spans).

## What landed

### New modules

| File | Role |
| --- | --- |
| `services/core/src/benson-scout/event-source-discovery.ts` | Same-origin discovery (nav, TEC meta, REST alternate, iCal, list vs month) |
| `services/core/src/benson-scout/wordpress-tec-extract.ts` | TEC REST + list-HTML extractors; refuses month-grid cell expansion |
| `services/core/src/benson-scout/wordpress-tec-extract.test.ts` | Discovery + REST + list + month refusal + idempotency |
| Fixtures | `fixtures/wordpress-tec-*.fixture.{html,json}` |

### Pipeline wiring

| File | Change |
| --- | --- |
| `event-listing-extract.ts` | Methods `wordpress_tec_rest` / `wordpress_tec_list`; TEC capability fields; REST-first when payload supplied; TEC list before Squarespace; platform matrix `wordpress_tec: supported` |
| `event-listing-watch.ts` | Discover → fetch TEC REST (`ends_after=today`) → else fetch effective `/events/` HTML; **never overwrite** `sourceUrl`; persist `effectiveExtractionUrl` + discovery metadata |
| `index.ts` | Re-exports discovery + TEC modules |
| `theater-season-extract.ts` | Compatibility exports only (`looksLikeTheaterSeasonPage`, `extractTheaterSeasonListings`, `THEATER_SEASON_TIME_ZONE`) so parallel season-page lane compiles; TEC pages suppress false theater_season takeover |

## Strategy order (TEC sites)

1. Official `tribe/events/v1/events?ends_after=…&status=publish` (includes currently-running runs)
2. Event JSON-LD
3. Collection ICS (`?ical=1`)
4. TEC **list** HTML articles (`type-tribe_events`)
5. Shared Squarespace / theater-season / Wix / semantic fallbacks

**Forbidden:** scraping month-grid cells into per-day duplicates. **Forbidden:** inventing curtain times from midnight / `00:00:00` placeholders.

## Live dry-run (2026-09-11, no deploy)

Configured `…/shows/` → effective `…/events/` → REST yield:

- **method:** `wordpress_tec_rest`
- **count:** 18 verified production runs
- **startDateTime present:** 0 (honest)
- **second pass fingerprints:** identical (idempotent)
- Sample: Jesus Christ Superstar `2026-08-20` → `2026-09-13`, MTH MainStage

## Primary wiring — Watchlist runner + status

`checkEventListingWatcher` already performs discovery + REST. Primary should:

1. **Ensure watcher exists** with:
   - `sourceUrl` = `https://musictheaterheritage.com/shows/` (**preserved**)
   - `sourceCategory` = `event_directory`
   - `adapterType` = `event_listing` (or leave for runner to set)
2. **Run** the existing event-listing check path (same as OSC/Wix listing watchers) — no new adapter type required beyond `extractionMethod` label `wordpress_tec`.
3. **Expect config after healthy yield:**

```json
{
  "configuredUrl": "https://musictheaterheritage.com/shows/",
  "effectiveExtractionUrl": "https://musictheaterheritage.com/events/",
  "extractionMethod": "wordpress_tec",
  "listingPlatform": "wordpress_tec",
  "tecRestUsed": true,
  "verifiedYield": 18,
  "extractionCapabilityEstablished": true,
  "lastSuccessfulExtractionAt": "<iso>",
  "lastCheckOutcome": "healthy | no_change",
  "eventSourceDiscovery": {
    "tribeEventsRestUrl": "https://musictheaterheritage.com/wp-json/tribe/events/v1/",
    "icalFeedUrl": "https://musictheaterheritage.com/events/?ical=1",
    "reasons": ["…"]
  }
}
```

4. **Status language** (unchanged contract):
   - First yield → `healthy` + baseline
   - Second unchanged → `no_change`
   - Zero yield with TEC markers but failed fetch → still not “successful extraction” unless `lastSuccessfulExtractionAt` set
5. **UI:** treat rows as **production runs** (`listingRole: production`, `runStartDate` / `runEndDate`). Do not imply nightly curtain times when `startDateTime` is null.
6. **Do not** rewrite configured URL to `/events/` in DB — only `effectiveExtractionUrl` / discovery metadata.

### Integration points (clear)

| Hook | Location | Notes |
| --- | --- | --- |
| Directory watcher gate | `isEventListingDirectoryWatcher` | Recognizes `/shows/` path + `wordpress_tec` method |
| Check entry | `checkEventListingWatcher` | Discovery + REST already inside |
| Pure extract | `extractEventListingsFromHtml({ tecRestPayload })` | Unit / offline reuse |
| Discovery only | `discoverEventSources` | Same-origin candidates without fetch |
| REST URL builder | `buildTribeEventsCollectionUrl` | Always prefer `ends_after` over `starts_after` |

## Tests

```bash
cd services/core
node --import tsx --test \
  src/benson-scout/wordpress-tec-extract.test.ts \
  src/benson-scout/event-listing-extract.test.ts
```

**27/27 pass** (Wix + Squarespace regressions included).

## Granularity truth

| Public month-grid | Official REST/list/ICS | Watchlist should store |
| --- | --- | --- |
| ~35 day-cells | ~18 production spans | **Production runs** (1 row / show) |

If individual performances later appear with real clocks in REST/JSON-LD, timed rows are allowed (`listingRole: performance`) — still no invented times.

## Out of scope / limitations

- No deploy, fingerprint, Telegram, or DB watcher mutation in this lane
- Pagination beyond `per_page=50` not needed for MTH today (single page)
- `tec/v1` namespace detected but unused (Tribe `events/v1` is the public catalog)
- Theater-season Elementor/on-the-stage lane remains separate; TEC sites do not take that path

## Suggested primary checklist

- [ ] Upsert/select MTH watcher with configured `/shows/`
- [ ] Run listing check twice → `healthy` then `no_change`, 18 items, zero dupes
- [ ] Confirm UI shows production date ranges, not extraction timestamp only
- [ ] Confirm configured URL unchanged; `effectiveExtractionUrl` = `/events/`
- [ ] Regression: OSC Squarespace + Wix 18th & Vine still green after deploy
