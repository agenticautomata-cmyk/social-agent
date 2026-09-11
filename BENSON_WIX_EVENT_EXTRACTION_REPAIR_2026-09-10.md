# Benson Wix / 18th & Vine Event Extraction Repair — 2026-09-10

## Root cause

The configured Watchlist URL `https://www.18thandvinelives.com/live-music-events` was classified as a generic `web_page` / `html_watch` source and routed through the early-signal **keyword** adapter.

That adapter:

1. Fetches HTML successfully (HTTP 200)
2. Strips tags to plain text
3. Returns usable results **only** when early-signal keywords match
4. Otherwise returns `ok: true` with **zero** results → status `no_yield` / “Page responded, but no usable events were found”

Meanwhile the live Wix page **already contained** event evidence in static HTML:

- SSR event cards (`data-hook="title|short-date|short-location"`)
- Wix Events / `events-viewer` hydration blob (`"events":[{title, scheduling, location, slug, …}]`)
- Public event detail URLs under `/event-details-registration/…`

No JSON-LD Event graph was present. Playwright was **not** required for this page.

Separately, website Watchlist detail UI reused Instagram empty-state copy (“Run Check now after Instagram session is configured”) and post-centric labels.

## Affected code paths

1. Watchlist inspect/create → `inspectSubmittedUrl` / `createWatchedSource` (`html_watch` for eventish paths)
2. Check → `runWatcherNow` → `runEarlySignalPipeline` → `runHtmlWatchAdapter` (keyword strip)
3. Health / explanation → zero yield → `no_yield`
4. Detail UI → Instagram session empty state + “Posts processed” / “Detected posts”
5. Eventbrite directory path remained separate (preserved)

## Strategy used

Ordered **generic event-listing extraction** (no LLM as factual source):

1. Event JSON-LD
2. Wix Events hydration when safely parseable (capability-detected; not a private API)
3. Semantic / repeated HTML event blocks
4. Playwright DOM only when caller supplies rendered HTML after a static miss

Watchlist runner mirrors Eventbrite trust semantics:

- Never overwrite configured URL with fetch/redirect URL
- Yield ≠ reachability
- First successful extraction = **baseline**
- Repeat unchanged inventory = **no_change** (no duplicate scout rows)
- `200 + zero verified listings` = **no_yield**, never healthy
- No email / Telegram / outreach from this path

## Diagnostics (live page)

| Field | Value |
| --- | --- |
| Configured URL | `https://www.18thandvinelives.com/live-music-events` |
| Final fetched URL | same |
| HTTP status | 200 |
| HTML size | ~1.6 MB |
| Event text in raw HTML | yes (cards + hydration) |
| JSON-LD Event | none |
| Wix markers | `events-viewer`, `wix-one-events`, short-date hooks |
| Strategies attempted | `json_ld` → `wix_events_hydration` |
| Method selected | `wix_events_hydration` |
| Candidate / verified count | 6 / 6 |
| Rejection notes | `json_ld:zero_events` (expected) |

## Live extraction results

Watcher id: `1b263831-ac1c-4412-be1d-cb610058dbf9`

| Check | Outcome |
| --- | --- |
| Before | `no_yield` · 0 records · Instagram-style UI risk on website |
| First check | **healthy** · Baseline created from **6** verified event listings · 6 new scout items |
| Second check | **no_change** · Checked 6 current listings; no changes found · still 6 scout items (no dupes) |
| Configured URL after | unchanged |
| Adapter after | `event_listing` · extractionMethod `wix_events` |

Verified listings (matched page title / local date / venue / link):

1. Late Night Jam Session — 2026-09-11 — Mutual Musicians Foundation
2. 10th Annual Wine & Jazz Festival — 2026-09-12 — Clara Eitmann Messmer Amphitheater
3. Wendell Phillips Neighborhood Association Meeting — 2026-09-21 — Gregg/Klice Community Center
4. Jammin' at the Juke Jam Session — 2026-10-01 — Juke House
5. The Vine Room — 2026-10-01 — Mutual Musicians' Foundation Building
6. First Friday @ 18th & Vine — 2026-10-02 — Historic 18th & Vine District

Local calendar dates prefer Wix `startDateFormatted` over UTC YMD from the ISO instant (avoids CT→UTC day shift).

## UI / status semantics

- Website sources show **Source type: Website listing** (not Session / Instagram)
- Labels: **Items/pages processed**, **Re-run latest check**
- Events inventory under **Events to review** (no auto-pitches/alerts)
- Instagram session empty-state copy is **Instagram-only**
- Eventbrite KC listing remains healthy with 61 extracted events (URL preserved)

## Schema / data changes

- No new SQL migration
- Reuses `source_watchers.config` yield fields from Eventbrite trust repair
- Scout items: `itemType=event_listing`, stable fingerprint from event URL / Wix id / title+date+venue

## Tests / build results

**Focused (new):**

- `src/benson-scout/event-listing-extract.test.ts` — pass (fixture yield, fields, recurring, JSON-LD, non-event Wix, Playwright bounded, baseline/no_change/no_yield, no Instagram inspect)

**Related Watchlist:**

- `eventbrite-watchlist-trust.test.ts`, `watchlist-state.test.ts`, `url-inspect.test.ts` — pass

**Deploy-gate (deploy script suite):** 246/246 pass

**Pre-existing / env:**

- `watchlist-canonical.test.ts` `@jasfoodjourney` DB fixture assertion can fail when that Instagram row is absent — not introduced by this change (same class of dependency noted in Eventbrite trust report)

**Typecheck:** repo-wide `tsc` still has many pre-existing errors unrelated to this repair

**Production dashboard build:** succeeds as part of `pnpm benson:deploy-local`

## Screenshots

- `docs/ops/screenshots/wix-watchlist-detail-2026-09-10-mobile.png`
- `docs/ops/screenshots/wix-watchlist-list-2026-09-10-mobile.png`
- `docs/ops/screenshots/wix-watchlist-detail-public-2026-09-10-mobile.png`
- Proof copies: `docs/ops/proofs/wix-event-extraction-2026-09-10/`

UI proof checks (local + public): no Instagram session copy; Items/pages + Re-run latest check; events visible; status no_change after second check.

## Deployment fingerprints

```json
{
  "status": "MATCH",
  "sourceFingerprint": "d11183a96a5806f5",
  "apiFingerprint": "d11183a96a5806f5",
  "dashboardFingerprint": "d11183a96a5806f5",
  "workerFingerprint": "d11183a96a5806f5"
}
```

Checked via `pnpm benson:deployment-status` after `pnpm benson:deploy-local`. Public API for this watcher returns the same URL, yield, and `no_change` status.

## Commit hashes

- `f22343c` — Fix Wix event listing Watchlist extraction and website-only UI copy
- `da0e7a9` — Record Wix event extraction repair commit hash in the closeout report
- Branch: `release/scout-expansion-2026-07-25` (pushed to `origin`)

## Honest limitations

- Pages that are pure client-rendered event widgets **without** SSR/hydration blobs still need a bounded Playwright pass; this Wix calendar did not.
- Non-event Wix business pages are not treated as event directories; they will not invent listings.
- Price/RSVP details beyond registration type are not always present in the list payload and are left null rather than invented.
- Recurring series keep the occurrence shown on the listing; full future occurrence expansion is not scraped from private Wix APIs.
- Contact intelligence / outreach paths were not used; no email or Telegram was sent.
