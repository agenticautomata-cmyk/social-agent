# Benson Wix / 18th & Vine Event Extraction — Independent Verification (2026-09-10)

**Verifier role:** adversarial, non-implementer  
**Primary claim under review:** `BENSON_WIX_EVENT_EXTRACTION_REPAIR_2026-09-10.md`  
**Watcher:** `1b263831-ac1c-4412-be1d-cb610058dbf9`  
**Configured URL:** `https://www.18thandvinelives.com/live-music-events`  
**Checked at:** 2026-09-11 (~00:50–00:55Z)

## Verdict

**PASS — live accurate extraction**

Persisted inventory matches the live Wix page (title / local date / venue / detail link), URL is preserved, status semantics are honest (`baseline` → `no_change`, not false-healthy), website UI is not Instagram-session copy, extraction is pipeline-driven (not production hard-codes), Eventbrite KC remains healthy with URL intact, deploy fingerprint reports **MATCH** `d11183a96a5806f5`, and no outreach was observed from this path.

---

## Check results

| # | Check | Result |
| --- | --- | --- |
| 1 | Live extraction vs live page | **PASS** |
| 2 | URL preservation | **PASS** |
| 3 | Status honesty (healthy / baseline / no_change / no dupes) | **PASS** |
| 4 | UI (no Instagram instructions; list/detail agree) | **PASS** |
| 5 | Not hard-coded | **PASS** |
| 6 | Eventbrite / adapter regression | **PASS** |
| 7 | Deploy fingerprint MATCH | **PASS** (with identity caveat) |
| 8 | Safety (no outreach) | **PASS** |

---

### 1. Live extraction — **PASS**

**Live page (HTTP 200, ~1.6 MB, URL unchanged):** six SSR cards + Wix hydration blob. Titles / short dates / venues:

| # | Live title | Live short date | Live venue |
| --- | --- | --- | --- |
| 1 | Late Night Jam Session | Fri, Sep 11 | Mutual Musicians Foundation |
| 2 | 10th Annual Wine & Jazz Festival | Sat, Sep 12 | Clara Eitmann Messmer Amphitheater |
| 3 | Wendell Phillips Neighborhood Association Meeting | Mon, Sep 21 | Gregg/Klice Community Center |
| 4 | Jammin' at the Juke Jam Session | Thu, Oct 01 | Juke House |
| 5 | The Vine Room | Thu, Oct 01 | Mutual Musicians' Foundation Building |
| 6 | First Friday @ 18th & Vine | Fri, Oct 02 | Historic 18th & Vine District |

**Independent re-extract** of the same live HTML via `extractEventListingsFromHtml` → method `wix_events_hydration`, strategies `json_ld` → `wix_events_hydration`, rejection `json_ld:zero_events`, **6/6 verified**. Local `startDate` values `2026-09-11` … `2026-10-02` match live cards / `startDateFormatted`.

**Persisted (DB + `/api/watchlist/{id}`):** 6 `scout_items`, 6 distinct `occurrence_fingerprint`s, 6 distinct `item_url`s. `relevanceExplanation` holds matching `title` / `startDate` / `venue` / method `wix_events_hydration`. Detail URLs under `/event-details-registration/…` match extractor output.

Not fixture-only: live fetch + live HTML parse + DB/API rows all agree.

### 2. URL preservation — **PASS**

DB: `source_url` = `submitted_url` = `canonical_source_url` = `https://www.18thandvinelives.com/live-music-events`.  
Config: `lastResolvedUrl` same. Run metadata on baseline and no_change runs: `configuredUrl` / `lastResolvedUrl` unchanged. Screenshots + proof text show the same configured URL.

### 3. Status honesty — **PASS**

`scout_source_runs` (newest first):

| Time (UTC) | Method | item/new | Summary / outcome |
| --- | --- | --- | --- |
| 2026-09-11 00:44:00 | `wix_events_hydration` | 6 / 0 | Checked 6… no changes · `no_change` |
| 2026-09-11 00:43:48 | `wix_events_hydration` | 6 / 6 | Baseline created from 6 verified… · `healthy` |
| 2026-09-10 23:24:42 | `http_then_browser` | 0 / 0 | Check completed with no new signals |

Current watcher: `health_status=no_change`, `verifiedYield=6`, `recordsExtracted=6`, `newRecordsFound=0`, `extractionMethod=wix_events`, `adapter_type=event_listing`. Inventory still **6** rows after second check (no duplicates). Healthy path required verified yield; second unchanged check is `no_change`, not a second baseline.

**Gap:** prior UI `no_yield` string is not still on the watcher row (overwritten). Zero-yield predecessor run is evidenced; literal historical `health_status=no_yield` cannot be re-read from current state.

### 4. UI — **PASS**

- Detail proof / screenshots: **Website listing**, **Items/pages processed**, **Re-run latest check**, **Events to review**, status **no change**, explanation “Checked 6 current listings; no changes found.”
- Instagram session empty-state copy remains gated behind `isInstagram` in `watchlist-detail-panel.tsx`; not present in website proofs (`ui-checks.json` / `public-ui-checks.json` both `hasInstagramSessionCopy: false`).
- List card and detail agree on URL, 6 listings, NO CHANGE / no_change.

**Gap:** event cards in the UI text dump show titles + *extraction* timestamps, not on-card date/venue. Date/venue **are** persisted and returned on API `relevanceExplanation`; this is a display thinness, not wrong inventory.

### 5. Not hard-coded — **PASS**

- Production extractor has **no** hard-coded 18th & Vine event titles.
- Yield comes from Wix hydration / capability detection on fetched HTML (reproduced against live HTML).
- Fixture `wix-events-listing.fixture.html` mirrors real titles for tests under `fixture-venue.example` — test data only, not seeded as production watchlist inventory.
- Focused tests: **11/11 pass** (`event-listing-extract.test.ts`).

### 6. Regression — **PASS**

Eventbrite KC watcher `d72be304-9338-42fc-ba12-8131dab2ed9d`:

- URL: `https://www.eventbrite.com/d/mo--kansas-city/events/` (submitted + canonical same)
- `adapter_type=eventbrite_directory`, `health_status=healthy`, `verifiedYield=61`, `recordsExtracted=61`
- Explanation: “Recent check extracted 61 events; 1 were new.”

Wix path uses separate `event_listing` adapter; Eventbrite directory path intact.

### 7. Deploy truth — **PASS** (caveat)

Independent `pnpm benson:deployment-status`:

```json
{
  "status": "MATCH",
  "sourceFingerprint": "d11183a96a5806f5",
  "apiFingerprint": "d11183a96a5806f5",
  "dashboardFingerprint": "d11183a96a5806f5",
  "workerFingerprint": "d11183a96a5806f5"
}
```

Runtime behavior also proves the repair is live (`event_listing` / `wix_events_hydration` in DB runs). Commits `f22343c`, `da0e7a9`, `1b6207b` are on `origin/release/scout-expansion-2026-07-25`.

**Caveat:** `/api/health` identity still reports `gitCommit: c44f6da` (pre-Wix tip) while HEAD / origin tip is `1b6207b`. Fingerprint MATCH (the claimed deploy gate) holds; do not treat the stale identity string as the deploy fingerprint.

### 8. Safety — **PASS**

- `event-listing-watch.ts` documents and implements Watchlist check only (no email/Telegram send path).
- No Telegram tables present.
- `outreach_emails` since 2026-09-10 20:00Z: **0** rows mentioning 18th & Vine / these event titles; **0** sends in that window.

---

## Gaps / residual notes

1. Prior `no_yield` health label is historically supported by a zero-item run, not by a still-resident watcher status field.
2. Watchlist UI list rows emphasize title over date/venue (data correct in API/DB).
3. Some `evidence` strings can show UTC-shifted day tokens while preferred `startDate` (from `startDateFormatted`) stays correct — dates used for inventory match the live local calendar.
4. API `gitCommit` identity lag vs fingerprint MATCH (see check 7).

None of these overturn live extraction accuracy or status honesty.

## Evidence sources used

- Live GET `https://www.18thandvinelives.com/live-music-events`
- Re-run of `extractEventListingsFromHtml` on live HTML
- Postgres `source_watchers` / `scout_items` / `scout_source_runs`
- Local API `GET /api/watchlist/1b263831-ac1c-4412-be1d-cb610058dbf9`
- `pnpm benson:deployment-status`
- Screenshots + `docs/ops/proofs/wix-event-extraction-2026-09-10/`
- Code review of extractor, watch runner, watchlist detail UI
- Focused unit tests; outreach table queries

## Bottom line for Elliott

**PASS — live accurate extraction.** The repair claim holds under independent live/DB/API/deploy checks; residual gaps are display/identity polish, not fixture-only or wrong-event failures.
