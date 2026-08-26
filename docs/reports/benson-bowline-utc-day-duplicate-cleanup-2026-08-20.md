# Bowline UTC-day duplicate content cleanup

Date: 2026-08-20  
Scope: **two** proven duplicate performer-format `content_items` on `[Benson] Shows — The Bowline Brothers` (`7fb75a94-1f95-4e5a-9b41-2cc012a3ea80`).  
Listing URL: `https://www.bowlinebrothers.com/shows?utm_source=openai`

**Code: not changed.** Re-ingest: **not run.** Calendar projection: **not run.**  
The 53 suggested Calendar rows were **not** cancelled or updated.  
The ~39 legacy venue-as-title content rows were **not** cleaned.

---

## Frozen (untouched)

Bowline tour extraction / promotion, shared-hub local-day identity logic, Calendar eligibility, listing_chrome, venue_as_title, T-Mobile, Downtown OP, Family Shows, OPCC / HPNA / CommUNITY Fest, Alexa / Discover / Today / ranking, other sources.

---

## Why these two pairs existed

After the local-day identity fix (`benson-shared-hub-local-day-identity-2026-08-20.md`), a second Bowline re-ingest was **idempotent** (0 created / 40 updated) for 38 of 40 extracted children.

Two logical keys still had **count = 2** because the **first** post-extraction ingest used UTC-day `sourceExternalId` segments (`…-2026-08-17-…`, `…-2026-08-02-…`). The later local-day ingest created/updated siblings with correct local-day ids (`…-2026-08-16-…`, `…-2026-08-01-…`) **without** matching those leftover UTC-key rows.

These are **same local-day duplicates**, not consecutive-night collapses.

---

## Investigation — both pairs loaded

Calendar links on all four ids: **0**.  
FK counts on `creator_calendar_items`, `creator_interest_records`, `creator_research_jobs`, `creator_skipped_records`: **0**.

### Pair 1 — The Bowline Brothers at Tin Roof Detroit · local day 2026-08-16

| Field | Canonical | Redundant |
| --- | --- | --- |
| id | `eba129e9-0e46-406f-a0f4-f3bef8dac375` | `f8defe5d-8ba2-4316-8346-7112697038fa` |
| topic | The Bowline Brothers at Tin Roof Detroit | same |
| `sourceExternalId` | `scrape_listing-5474d685e4c6eb23-the-bowline-brothers-at-tin-roof-detroit-2026-08-16-tin-roof-detroit` | `…-2026-08-17-tin-roof-detroit` (UTC-day segment) |
| `sourceUrl` | hub listing URL | same |
| extracted `eventDate` | `2026-08-16T22:00:00` | identical |
| `startTime` | `22:00:00` | identical |
| `eventStartsAt` | `2026-08-17T03:00:00.000Z` | identical |
| venue / location | Tin Roof Detroit / Detroit | identical |
| `containerChild` | true | true |
| `lastSeenAt` | `2026-08-20T03:12:42.550Z` (idempotent pass) | `2026-08-20T02:25:06.640Z` (first pass only) |
| Calendar | none | none |

**Same logical local-day performance:** yes. Payload is the same 10:00 PM local Aug 16 show; only the external-id day token differs (UTC Aug 17 vs local Aug 16).

**Canonical:** `eba129e9` — local-day external id + freshest `lastSeenAt` from the idempotent re-ingest.

**Left alone:** Detroit nights on **2026-08-14** (`4bb7614b`) and **2026-08-15** (`39efe20b`) — different local days.

### Pair 2 — The Bowline Brothers at Tin Roof Cincinnati · local day 2026-08-01

| Field | Canonical | Redundant |
| --- | --- | --- |
| id | `73243fb2-333c-4381-9d73-88fac4f37e7a` | `f594e5f9-916d-4e32-9eca-19388207b56b` |
| topic | The Bowline Brothers at Tin Roof Cincinnati | same |
| `sourceExternalId` | `scrape_listing-5474d685e4c6eb23-the-bowline-brothers-at-tin-roof-cincinnati-2026-08-01-tin-roof-cincinnati` | `…-2026-08-02-tin-roof-cincinnati` (UTC-day segment) |
| `sourceUrl` | hub listing URL | same |
| extracted `eventDate` | `2026-08-01T22:00:00` | identical |
| `startTime` | `22:00:00` | identical |
| `eventStartsAt` | `2026-08-02T03:00:00.000Z` | identical |
| venue / location | Tin Roof Cincinnati / Cincinnati | identical |
| `lastSeenAt` | `2026-08-20T03:12:42.730Z` | `2026-08-20T02:25:06.759Z` |
| Calendar | none | none |

**Same logical local-day performance:** yes.

**Canonical:** `73243fb2` — same rationale as Detroit.

**Left alone:** Cincinnati **2026-07-31** (`15060924`) — different local day.

---

## Cleanup mechanism (existing, not invented)

No dedicated “Bowline duplicate cleaner” exists. Used the **existing operational pattern**:

1. **Refuse delete if Calendar-linked** — same guard as T-Mobile content duplicate deletes (`refusing to delete content with calendar rows`). All four rows had **0** Calendar links.
2. **Record merge provenance on the keeper** — `mergedDuplicateIds` / reason / timestamp, same metadata convention as `merge-eventbrite-opportunity-duplicates.ts`.
3. **Delete only the redundant `content_items` row** via Drizzle `delete` + `inArray`.

Canonical rows were not rewritten (titles, dates, venues, external ids unchanged except metadata stamp). External ids were **not** cosmetically migrated.

---

## Mutation

| Role | id | Action |
| --- | --- | --- |
| Detroit canonical | `eba129e9-0e46-406f-a0f4-f3bef8dac375` | kept; metadata `mergedDuplicateIds: [f8defe5d-…]`, reason `utc_day_external_id_duplicate` |
| Detroit redundant | `f8defe5d-8ba2-4316-8346-7112697038fa` | **deleted** |
| Cincinnati canonical | `73243fb2-333c-4381-9d73-88fac4f37e7a` | kept; metadata `mergedDuplicateIds: [f594e5f9-…]`, same reason |
| Cincinnati redundant | `f594e5f9-916d-4e32-9eca-19388207b56b` | **deleted** |

---

## After

| Check | Result |
| --- | --- |
| Detroit 2026-08-16 logical key count | **1** |
| Cincinnati 2026-08-01 logical key count | **1** |
| Performer-format rows (`The Bowline Brothers at …`) | **40** |
| Distinct local-day keys (title + local day + venue) | **40** |
| Remaining duplicate local-day keys | **0** |
| Consecutive-night collapses | **0** |
| Bowline `content_items` total | 122 → **120** (−2 redundant only) |
| Calendar linked to Bowline content | **53**, all **suggested** |
| Legacy venue-as-title rows | **untouched** |
| Code | **not changed** |

---

## Relationship to prior Bowline work

| Stage | Report | Status |
| --- | --- | --- |
| 1. Extraction | `benson-bowline-tour-extraction-2026-08-20.md` | Performer title + venue/location |
| 2. Persistence identity | `benson-shared-hub-local-day-identity-2026-08-20.md` | 40 local-day children durable |
| 3. UTC-key leftover duplicates | **this report** | 2 redundant rows deleted |
| 4. Calendar sync | *not started* | 53 venue-titled suggestions still live |
| 5. Legacy venue-as-title content | *not started* | ~39 rows remain |

---

## Follow-up (not this task)

1. **Calendar** — project from the 40 corrected local-day children; cancel the 53 suggested rows tied to old venue-as-title content.
2. **Legacy venue-as-title content** — ~39 rows with venue stored as title and null place fields.
3. Optional cosmetic `sourceExternalId` rewrite on keepers that still carry UTC-day tokens from other nights — **not** done here.

---

## Summary

Two leftover performer-format rows from the old UTC-day `sourceExternalId` scheme duplicated the same local-day performances as later local-day rows (Detroit Aug 16, Cincinnati Aug 1). Neither pair had Calendar or other FK links. Canonical keepers are the local-day-id rows last touched by the idempotent re-ingest; the two UTC-key siblings were deleted. Performer-format inventory is now **40 unique local-day children**. Calendar and venue-as-title legacy rows remain for a later pass.
