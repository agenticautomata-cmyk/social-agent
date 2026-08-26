# Benson Eventbrite KC first-class public discovery — 2026-08-23

**Scope:** Discovery coverage fix only.  
**Not done:** Eventbrite account/login/OAuth, `/v3/events/search`, anonymous destination-search JSON, live persistence, Calendar projection, Discover ranking, sponsor/partnership changes, full-site crawl.

---

## Executive verdict

Benson now has a **first-class public Eventbrite Kansas City discovery path** that actively fetches city + category HTML, extracts `/e/...` ids from JSON-LD ItemList, reuses the existing Eventbrite detail JSON-LD parser + KC geography gates, and dedupes by numeric Eventbrite id.

**Dry-run against live public pages (persist off):**

| Metric | Value |
|---|---|
| Control-set Eventbrite URL/id discovery | **20/20** (was **0/20**) |
| Unique Eventbrite ids from SSR surfaces | **99** (cap 100) |
| Detail pages parsed OK / KC eligible | **92** |
| Would create (new logical Eventbrite rows) | **91** |
| Cross-source twin (no merge invented) | **1** (Bourbon, Bacon & Brews ↔ downtownop.org) |
| Live durable writes | **0** |

No Eventbrite account or API key was used.

---

## Architecture before → after

### Before
- No Eventbrite city/category crawler
- Eventbrite only via: user paste `/e/...`, opportunistic web-search citation, curator/newsletter/listing coincidence
- Audit coverage: **0/20** Eventbrite URL/id

### After
```
PUBLIC KC CITY/CATEGORY HTML (7 surfaces)
  → JSON-LD ItemList /e/... URLs + numeric event id
  → dedupe by eventbriteEventId (cap 100)
  → detail HTML fetch
  → existing JSON-LD Event parser (Ask Benson path)
  → qualifyUrlOpportunity / KC metro geo
  → durable identity ask-benson-user-event-eb-<id>
  → dry-run report (persist gated off by default)
```

Worker: `eventbrite-kc-discovery` every **24h**, default **`EVENTBRITE_KC_DISCOVERY_PERSIST=false`** (dry-run only until explicitly enabled).

---

## Files changed

| Path | Role |
|---|---|
| `services/core/src/eventbrite-kc-discovery/surfaces.ts` | 7 public surfaces + caps + ingest constant |
| `services/core/src/eventbrite-kc-discovery/extract.ts` | ItemList `/e/` extraction + id dedupe |
| `services/core/src/eventbrite-kc-discovery/detail.ts` | Reuses `parseJsonLdPageGraph` + `jsonLdEventsToOpportunities` + `qualifyUrlOpportunity` |
| `services/core/src/eventbrite-kc-discovery/source.ts` | `Eventbrite Kansas City` source + existing twin lookups |
| `services/core/src/eventbrite-kc-discovery/run.ts` | Orchestrator + failure isolation + caps |
| `services/core/src/eventbrite-kc-discovery/index.ts` | Package exports |
| `services/core/src/eventbrite-kc-discovery/cli-dry-run.ts` | Live dry-run + 20-control report |
| `services/core/src/eventbrite-kc-discovery/eventbrite-kc-discovery.test.ts` | 15 fixture tests |
| `services/core/src/env.ts` | `EVENTBRITE_KC_DISCOVERY_*` flags |
| `services/core/package.json` | export + test glob + `eventbrite-kc:dry-run` |
| `services/workers/src/workflows/eventbrite-kc-discovery.ts` | Cron worker |
| `services/workers/src/benson.ts` | Register worker |
| `services/core/src/worker-heartbeat/definitions.ts` | Heartbeat entry |
| `services/core/src/worker-heartbeat/definitions.test.ts` | Assert worker registered |
| `.env.example` | Documented flags |

---

## Public discovery surfaces used

1. `https://www.eventbrite.com/d/mo--kansas-city/events/`
2. food-and-drink  
3. music  
4. business  
5. fairs-festivals  
6. family-and-education  
7. arts  

Redirects followed normally (`/d/…` → `/b/…` where applicable).  
**No additional categories. No destination-search API.**

---

## Extraction method

1. `fetchPageContent` (existing HTTP helper, follows redirects)
2. Prefer **JSON-LD `ItemList`** → `itemListElement[].item.url`
3. Fallback href scan for `/e/{slug}-{id}` only
4. `extractEventbriteEventId` / `isDirectEventListingUrl` (Ask Benson helpers)
5. Ignore `/o/` organizer pages, category chrome, malformed URLs

---

## Limits / caps

| Cap | Value |
|---|---|
| Max surfaces | **7** |
| Max unique Eventbrite ids | **100** |
| Max detail fetches | **100** |
| Pagination beyond SSR HTML | **None** (this task) |
| Recursive crawl | **None** |
| Detail concurrency | 5 (network only) |

---

## Scheduling / cadence

| Setting | Default |
|---|---|
| `EVENTBRITE_KC_DISCOVERY_ENABLED` | `true` |
| `EVENTBRITE_KC_DISCOVERY_INTERVAL_MS` | `86400000` (24h) |
| `EVENTBRITE_KC_DISCOVERY_PERSIST` | **`false`** (dry-run; no durable writes) |

Worker name: `eventbrite-kc-discovery` (registered beside `benson-discovery`).

---

## Identity / dedupe

- Authoritative id: **numeric Eventbrite event id**
- Durable external id: `ask-benson-user-event-eb-<id>` via `buildUserOpportunityExternalId`
- Metadata: `eventbriteEventId`, `ingest: eventbrite_public_discovery`, `discoverySurface` (city|food|…)
- **Category / page position / scrape index are not part of durable identity**
- Cross-surface duplicates deduped **before** detail fetch

---

## Cross-source duplicate behavior

**Limitation (explicit):**  
`findMatchingUserOpportunity` is Share Intake–scoped and cannot safely stamp Eventbrite provenance onto downtownop / Ticketmaster / Instagram twins.

This task:
- Detects campaign-wide **Eventbrite id** matches → treat as already exists / update path
- Detects **title + calendar-day** near twins → disposition `cross_source_twin_no_merge` (**does not invent a merge system**)
- Dry-run found **1** such twin: Bourbon, Bacon & Brews (Eventbrite id `1994365695482` ↔ existing downtownop.org scrape)

R&B Festival vs calendar “FOR THE LOVE OF R&B” was **not** auto-matched (different normalized titles) — out of scope for a full identity merger.

---

## Tests

```
pnpm exec tsx --test src/eventbrite-kc-discovery/eventbrite-kc-discovery.test.ts
```

| Result | Count |
|---|---|
| Pass | **15/15** |
| Fail | **0** |

Covered: ItemList extract, cross-category dedupe, `/o/` ignore, malformed ignore, one-fetch-for-three-categories, id extraction, detail JSON-LD title/date/time/venue, date-only, timed clock, out-of-market reject, stable durable id, cross-source limitation note, surface failure isolation, max caps, no category in id.

---

## Dry-run discovery counts (live public pages)

Command: `pnpm --filter @social-agent/core eventbrite-kc:dry-run`  
Elapsed: **~24s**  
Persist: **false**

| Surface | Fetch | Extracted ids |
|---|---|---|
| city | OK | 63 |
| food | OK | 8 |
| music | OK | 8 |
| business | OK | 8 |
| festivals | OK | 20 |
| family | OK | 8 |
| arts | OK | 8 |

| Aggregate | Count |
|---|---|
| Unique ids (after dedupe, before/at cap) | **99** |
| Duplicates across categories | **24** |
| Detail fetch attempts | **99** |
| Detail parsed OK | **92** |
| KC metro eligible | **92** |
| Rejected geography | **0** |
| Parser failures (no Event JSON-LD / qualify) | **7** |
| Detail fetch failures | **0** |
| Already existing Eventbrite id | **0** |
| Cross-source twin (no merge) | **1** |
| Would create | **91** |
| Would update | **0** |
| Created / updated in DB | **0 / 0** |

---

## Exact 20-event control comparison

| # | Event | Before | Discovered | Detail parsed | KC eligible | Twin | Disposition |
|---|---|---|---|---|---|---|---|
| 1 | Taco Festival | D never | **yes** | yes | yes | no | would_create |
| 2 | Margarita Festival | D | **yes** | yes | yes | no | would_create |
| 3 | Bourbon, Bacon & Brews | E alt URL | **yes** | yes | yes | **yes** (downtownop) | cross_source_twin_no_merge |
| 4 | R&B Festival (Jacquees) | E Ticketmaster title twin | **yes** | yes | yes | no* | would_create |
| 5 | Tez Carter All White | D | **yes** | yes | yes | no | would_create |
| 6 | Sincerely Yours | D | **yes** | yes | yes | no | would_create |
| 7 | Havana Night | D | **yes** | yes | yes | no | would_create |
| 8 | AI Club Meetup | D | **yes** | yes | yes | no | would_create |
| 9 | NAWBO breakfast | D | **yes** | yes | yes | no | would_create |
| 10 | Woven 2026 | D | **yes** | yes | yes | no | would_create |
| 11 | Crossroads Vendor Fair | D | **yes** | yes | yes | no | would_create |
| 12 | Back to School Bash | D | **yes** | yes | yes | no | would_create |
| 13 | HAIRitage Day | D | **yes** | yes | yes | no | would_create |
| 14 | Reptile Show | D | **yes** | yes | yes | no | would_create |
| 15 | Totally Tots | D | **yes** | yes | yes | no | would_create |
| 16 | John Green | D | **yes** | yes | yes | no | would_create |
| 17 | Jodi Picoult | D | **yes** | yes | yes | no | would_create |
| 18 | Hard Candy | D | **yes** | yes | yes | no | would_create |
| 19 | Studio Night | D | **yes** | yes | yes | no | would_create |
| 20 | Disability Inclusion Summit | D | **yes** | yes | yes | no | would_create |

\*Calendar “FOR THE LOVE OF R&B” not title-matched; Eventbrite listing would create a new Eventbrite-id row if persist were enabled — known cross-source limitation.

**Coverage: 0/20 → 20/20 Eventbrite URL/id discovery on dry-run.**

---

## Parser / geography failures (non-control)

- **7** detail pages lacked usable Event JSON-LD / failed qualify (not geo)
- **0** out-of-market rejects in this capped dry-run batch
- Geography gate is still applied via existing `qualifyUrlOpportunity` / `isOutOfMarketLocation`

---

## Confirmations

| Confirmation | Status |
|---|---|
| Eventbrite account / login / API key used | **No** |
| Anonymous destination-search API used | **No** |
| Official `/v3/events/search` used | **No** |
| Live durable data changed | **No** (`PERSIST=false`, dry-run) |
| Calendar projection run | **No** |
| Discover ranking changed | **No** |
| Sponsor/partnership workflows touched | **No** |
| Full Eventbrite site crawl | **No** |

---

## Cross-source dedupe limitation (stated)

Safe Eventbrite-id upsert exists.  
**Safe automatic merge/stamp onto downtownop / Ticketmaster / Instagram twins does not** — requires a separate campaign-wide identity task. Dry-run reports `cross_source_twin_no_merge` instead of inventing merge.

---

## Next step (out of scope here)

After review: set `EVENTBRITE_KC_DISCOVERY_PERSIST=true` (or run a one-shot persist) to write the first live batch, then optionally add bounded pagination / destination-search later if SSR first-page coverage regresses.

---

## Unrelated / out of scope

- Ask Benson image-attachment / Node 18 File issues  
- Transcription `/transcribe` File bug  
- Discoveries email pipeline  
- Calendar projection / ranking redesign  
- Eventbrite OAuth / partner distribution program  
