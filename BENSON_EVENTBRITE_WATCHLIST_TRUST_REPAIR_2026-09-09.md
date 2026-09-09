# Benson Eventbrite Watchlist Trust Repair — 2026-09-09

## Root cause

When a web Watchlist source was created with `WATCH_PAGE` (or any non-`SINGLE_ITEM` mode), `createWatchedSource` persisted `inspect.publisherUrl` as `source_url`. For generic web inspect, `publisherUrl` was `parsed.origin` only.

So submitted:

`https://www.eventbrite.com/d/mo--kansas-city/events/`

was stored/displayed as:

`https://www.eventbrite.com`

Separately, any successful HTTP adapter run marked `health_status = healthy` and set `lastSuccessfulCheck`, so the UI showed **Healthy** with zero posts/events extracted. Reachability was conflated with information yield.

## Affected code paths

1. Watchlist form → `/api/watchlist/inspect` → `inspectSubmittedUrl`
2. Create → `createWatchedSource` (publisherUrl collapse)
3. Canonical identity → hostname-only when collapsed
4. Check → `runWatcherNow` → early-signal `html_watch` (keyword strip, not Eventbrite catalog)
5. Health → `updateWatcherHealth(ok: true)` → always healthy
6. Display → `watchlistDisplayHealth` (healthy if `lastSuccessfulCheck`)
7. Detail UI → “Posts processed” / “Reprocess latest post” for all sources

## Schema / data changes

- No new SQL migration. Yield/reachability fields live in `source_watchers.config` JSON:
  - `lastResolvedUrl`, `reachability`, `statusExplanation`
  - `itemsProcessed`, `recordsExtracted`, `newRecordsFound`, `verifiedYield`
  - `extractionCapabilityEstablished`, `suppressSchedule`, `extractionMethod`
- Adapter type `eventbrite_directory` for Eventbrite listings
- Repair script: `services/core/src/scripts/repair-eventbrite-watchlist-url.ts`
  - Restores collapsed homepage rows to the KC listing when submitted/canonical evidence exists
  - Skips already-correct rows and canonical-key conflicts
  - Does not delete unrelated Watchlist entries or extracted events

## Before / after URL values

| Stage | Before | After |
| --- | --- | --- |
| Submitted | `https://www.eventbrite.com/d/mo--kansas-city/events/` | same |
| Normalized / canonical | collapsed to origin via publisherUrl | `https://www.eventbrite.com/d/mo--kansas-city/events/` |
| Persisted `source_url` | `https://www.eventbrite.com` | `https://www.eventbrite.com/d/mo--kansas-city/events/` |
| Last resolved / fetched | (overwrote configured) | recorded separately in `config.lastResolvedUrl`; **never** overwrites configured URL |
| Facebook-tracked homepage | could be watched as bare domain | `https://www.eventbrite.com/` + `needs_setup` |

## Observed Eventbrite response behavior

From Benson’s runtime (server `fetch`, public HTML):

- KC listing URL returns **HTTP 200** without collapsing to homepage
- Page title indicates Kansas City events
- Existing JSON-LD / href catalog extractor yields **61** `/e/…` event URLs with title hints
- No CAPTCHA/login block in this verification run
- Redirect-to-homepage path is still classified as `blocked` + paused with visible reason if it occurs

## Extraction results (verification)

- Watcher id: `d72be304-9338-42fc-ba12-8131dab2ed9d`
- Configured URL after check: `https://www.eventbrite.com/d/mo--kansas-city/events/` (intact)
- Last resolved URL: same listing path
- Items processed: 1 page
- Events extracted / verified yield: 61
- New on final controlled check: 1
- List `displayHealth` === detail `displayHealth`: **healthy**
- Status explanation: `Recent check extracted 61 events; 1 were new.`
- “Reprocess latest post”: **hidden** (`supportsReprocessLatestPost: false`)
- Metrics label: **pages**

## Exact status after verification

- **healthy** (usable verified records extracted)
- Reachability: **reachable**
- Session: none
- No email or Telegram sent (Eventbrite check path does not call alert delivery; early-signal manual checks use `suppressAlerts: true`)

## Tests / build results

**Focused (new + related):**

- `src/benson-scout/eventbrite-watchlist-trust.test.ts` — pass
- `url-inspect`, `canonical-source`, `watchlist-state` — pass after yield-guard updates

**Deploy gate (deploy script suite):** 246/246 pass

**Postgres / Instagram session DB test:** `@jasfoodjourney` assertion can fail when test DB lacks the seeded account — treated as pre-existing environment dependency, not introduced by this change.

**Typecheck:** repo-wide `tsc` has many pre-existing errors unrelated to this repair; no new errors observed in the Eventbrite/watchlist modules under review.

**Production dashboard build:** succeeds (Node 22). Client-safe labels export added so Contacts UI does not pull Playwright into the browser bundle (`contact-intelligence/labels`).

## Screenshots

- `docs/ops/screenshots/eventbrite-watchlist-list-2026-09-09-mobile.png`
- `docs/ops/screenshots/eventbrite-watchlist-detail-2026-09-09-mobile.png`
- Proof copies: `docs/ops/proofs/eventbrite-watchlist-trust-2026-09-09/`

## Deployment fingerprints

```json
{
  "status": "MATCH",
  "sourceFingerprint": "705df6daa09fec51",
  "apiFingerprint": "705df6daa09fec51",
  "dashboardFingerprint": "705df6daa09fec51",
  "workerFingerprint": "705df6daa09fec51"
}
```

(Checked via `pnpm benson:deployment-status` after deploy + dashboard start.)

## Commit hashes

- `e79075c` — Fix Eventbrite Watchlist URL collapse and false-healthy status
- `ca58e6a` — Record Eventbrite trust repair commit hash in the closeout report
- Branch: `release/scout-expansion-2026-07-25` (pushed to `origin`)

## Honest limitations

- Catalog extraction uses Eventbrite public HTML (JSON-LD / `/e/` hrefs). Detail fields (exact start/end, venue, price) are only as rich as the listing card evidence; full detail enrichment is not run on every watch cycle.
- If Eventbrite later redirects KC listings to homepage or serves bot challenges, Benson will **pause/block with reason** rather than claim healthy — operators must supply a usable location URL or wait for access to recover.
- Homepage-only Eventbrite URLs are `needs_setup` and do not schedule useless 12h checks.
- Early-signal HTML keyword sources still use the older adapter; yield-aware health is enforced for Eventbrite directories and for early-signal runs that report `recordsExtracted`.

## Confirmation

- No email sent
- No Telegram messages sent
- No content published
- No fabricated events — only catalog URLs/titles present in the fetched HTML
