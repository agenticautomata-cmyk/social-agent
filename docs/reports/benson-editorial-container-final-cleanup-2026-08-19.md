# Editorial-container child extraction — final cleanup + Calendar proof (2026-08-19)

Cleanup and proof only. Extraction architecture was not redesigned. Frozen surfaces were not changed: classifier, container-event-block segmentation, shared-hub persist identity (including same-day showtime collapse), Ask Benson SHA-256 ids, Calendar eligibility, ranking, Discover / Today, Alexa, Cloudflare / AWS, confirmed Neighborhoods calendar row `546d8013-26e2-4a25-a0dc-07eaba51c501`.

Campaign `3b85115b-548b-4d91-8963-e41a55087a6b`.

---

## 1. Family Shows duplicate audit

Source `c11283db-d5d4-4814-9dfe-eb19f6860988` (`https://kc.events/family?utm_source=openai`).

Logical identity used: `normalizeOpportunityTitle` semantics + **Chicago calendar day** + Independence venue + same hub URL. Persist identity (exact normalized title + **UTC day** + venue) does **not** treat `Garden Bros Nuclear Circus` and `Garden Bros Nuclear Circus: Fun Factory` as the same row — that is why the old post-extract JSON-LD merge stored both.

| Fun Factory `containerChild` | Chicago day | Matching short-title child (same day + venue + hub) | Verdict |
| --- | --- | --- | --- |
| `a3eae9e3-eca7-495d-9884-8c41a837e280` | 2026-08-20 | `6e6e1ab6` Garden Bros `2026-08-21T00:30:00Z` | **Redundant** JSON-LD merge artifact |
| `6aefd2bc-c40c-45bf-aa85-ec01632a2358` | 2026-08-22 | `95761a0b` Garden Bros | **Redundant** |
| `95f07a99-b119-403c-94ff-f627f0a89fe0` | 2026-08-23 | `26a68821` Garden Bros `2026-08-24T00:00:00Z` (= Aug 23 7pm Chicago) | **Redundant** |
| `eb7e0c97-120a-486f-aad9-aa3adfd8b2cd` | 2026-08-24 | no short-title peer on Chicago Aug 24 | **Kept** — different local day |

Legacy rows **not** treated as this ingest’s merge artifacts (not deleted/stamped):

- `bbfc5cd9-8055-4d7e-8796-3737df69b0e8` — Fun Factory, `containerChild=false`, Chicago Aug 20, listing-index external id
- `f0eb5109-746c-4d60-ab73-bc80e40a18fb` — discovery ingest, Chicago **Aug 19**, different title/venue string
- Additional pre-existing non-child Fun Factory copies `0ca98e79`, `cc9cdfdf` (legacy index ids) also left in place

No content-item delete helper exists. Cleanup used the existing parent-repair mechanism: stamp `metadata.calendarEligible=false` + `jsonLdMergeDuplicate=true` on the three proven redundant `containerChild` rows. No suggested/tentative calendar rows existed on those three source ids, so nothing was cancelled.

`eb7e0c97` remains `calendarEligible=true` (Chicago Aug 24 JSON-LD child).

---

## 2. Idempotent re-ingest (fixed path)

Re-ingested only the two hubs via `scrapeListingUrl` (`webResearchLimit=0`, scrape refresh wave) at **2026-08-19T14:36Z**. Live extract after ingest still uses raw-HTML JSON-LD + container-event-blocks; post-extract JSON-LD merge is skipped because extract returns ≥2 children.

### Downtown OP

`https://www.downtownop.org/events?utm_source=openai`  
Source `495e6e57-2cfe-490b-84de-38cfe2b6440e`

| | Before (14:01 ingest) | After (14:36 re-ingest) |
| --- | --- | --- |
| Classifier | `multi_event_schedule` | `multi_event_schedule` |
| Structured / extracted children | 11 | **11** |
| Parent title in extract | no | **no** |
| `containerChild=true` rows | 10 | **10** |
| Source row total | 18 | **18** |
| Persist | created 10, updated 1 (Farmers Market) | **0 created**; existing children + Farmers Market **updated** (`updatedAt` 14:36:26Z, `createdAt` still 14:01) |

Farmers Market `2a8ee718-ed95-42bd-88ae-436e36e753ba`: topic, sourceUrl, **legacy** `sourceExternalId` `scrape_listing-38fa8fcfd5ed3cd8-0-overland-park-farmers-market`, `eventStartsAt` `2026-04-18T12:30:00.000Z`, location Matt Ross Community Center — unchanged except freshness (`updatedAt` 14:36:26Z). Still not flagged `containerChild` (legacy row).

### Family Shows

| | Before | After |
| --- | --- | --- |
| Classifier | `multi_event_schedule` | `multi_event_schedule` |
| Structured / extracted children | 13 | **13** |
| Parent schedule title in extract | no | **no** |
| `containerChild=true` rows | 16 | **16** (no expansion to 16+ from JSON-LD merge) |
| Calendar-eligible container children | 16 | **13** (3 Fun Factory artifacts stamped ineligible) |
| Source row total | 36 | **36** |
| New Fun Factory title-variant ids | — | **none** |

Eligible short-title children refreshed at 14:36:27Z. `eb7e0c97` was not rewritten (title still Fun Factory; persist identity does not match short-title Garden Bros). Extracted Aug 24 short-title Garden Bros reconciled onto existing `26a68821` (UTC day 2026-08-24 / Chicago Aug 23) — existing title+UTC-day identity, not a new Fun Factory duplicate.

---

## 3. Calendar proof (`ensureCalendarInventoryProjections` 2026-08-19 → 2027-12-31)

Verification pass: **created 0**, **updated 363**, duplicates 52, scanned 416, eligible 364. (First pass in this cleanup at 14:37 created the new Downtown child suggestions; this pass reconciled.)

### Downtown OP

- Future `containerChild` content rows in window: **6** (Third Fridays 8/21, Wellness Wednesdays 9/2, Movie Night 9/12, Harvesting Hope 10/1, Bourbon Bacon & Brews 10/9, Trick-or-Treat 10/24)
- Past `containerChild` content rows excluded: **4** (Car Show 6/11, Third Fridays 7/17, Health Screening 7/18, Concerts 8/13)
- Farmers Market (Apr 18) excluded as past
- Active suggested/tentative/confirmed Calendar rows on those future children: **5**
- Missing Calendar row: Trick-or-Treat `e39847f4` (future content exists; no `creator_calendar_items` row). Frozen eligibility was not changed.
- Duplicate projections: no second Third Fridays / Movie Night / etc. rows in window

### Family Shows

- Future eligible `containerChild` content rows: **13**
- Past container children in upcoming window: **0**
- Active Calendar rows whose `sourceRecordId` is one of those 13: **12**
- The 13th (Garden Bros Chicago Aug 20, `6e6e1ab6`) has no own calendar row; projection reconciled onto pre-existing suggested row `f43554b7` on legacy `bbfc5cd9` (same Chicago day + venue). That legacy row was **not** deleted.
- Examples: Bluey's Big Play 8/21–8/23, Garden Bros 8/21–8/23, What If Puppets 10/7–10/10, The Snowy Day 10/24, Fun Factory Aug 24 `eb7e0c97` → calendar `bd305384`

### Parent titles — zero active Calendar rows

| Title | Active suggested/tentative/confirmed | Cancelled copies |
| --- | --- | --- |
| Events in Overland Park — Downtown OP | **0** | 5 |
| Family Shows in Kansas City \| Schedule 2026–2027 | **0** | 18 |
| Spend a Day in Parkville: Where to Eat, Shop, and Explore | **0** | 1 |

### Confirmed Neighborhoods row (read-only)

| | |
| --- | --- |
| id | `546d8013-26e2-4a25-a0dc-07eaba51c501` |
| title | Where to Eat, Shop, Play, and Spend a Day in 20 KC Metro Neighborhoods |
| planningStatus | **confirmed** |
| startAt | 2026-08-21T05:00:00.000Z |
| updatedAt | 2026-08-15T02:44:03.711Z (**not mutated**) |

---

## 4. Runtime proof

Before this cleanup, API (`94ff48e330bf4391`, started 2026-08-18) and workers (`bc36761c4a4bcd6e`, started 2026-08-16) were **DRIFT** vs source `784bb22c58cca886`. They were not running the new extraction/persist code.

**Restart required: yes.** Restarted **only** Benson API + workers. Dashboard, Cloudflare, Postgres, and unrelated services were not restarted.

| | Fingerprint | Started |
| --- | --- | --- |
| Source | `784bb22c58cca886` | — |
| API (`tsx src/server.ts`) | `784bb22c58cca886` | 2026-08-19T15:14:54Z |
| Workers (`tsx src/benson.ts`, 19 brain workers including `opportunity-refresh`) | `784bb22c58cca886` | 2026-08-19T15:25:02Z |
| Dashboard | `bc36761c4a4bcd6e` (left running) | 2026-08-16 |
| `/health` | `{"ok":true}` | — |

Overall deploy status remains **DRIFT** only because dashboard was intentionally not rebuilt.

Loaded from current source (tsx, not a stale compile):

- raw-HTML JSON-LD: `parseJsonLdPageGraph(page.html)` in `scrape-listing.ts`
- container-event-block extraction: `container-event-blocks.ts` via `extractOpportunitiesFromPage` + `pageHtml`
- redundant JSON-LD merge guard: merge only if `extraction.opportunities.length < 2` (listing scrape and Ask Benson `collect-from-link`)
- shared-hub persistence: `container-child-persist.ts`
- SHA-256 Ask Benson ids: `buildUserOpportunityExternalId` in `url-intake-dedupe.ts`

Ask Benson URL ingest is the API process. Listing-source refresh is workers `opportunity-refresh` → `scrapeListingUrl`.

---

## Remaining known limitation (unchanged design)

Same-day multiple showtimes still collapse to **one title + day + venue child**. Live Family Shows HTML has Garden Bros 4:30 PM and 7:30 PM on Aug 20; extraction/persist keep a single Aug 20 child. This was not changed.
