# Container/listing child persistence — shared hub URL (2026-08-19)

Scoped persist fix after [editorial-container re-ingest](./benson-editorial-container-reingest-2026-08-19.md) and the [Ask Benson external-id collision fix](./benson-ask-benson-external-id-collision-2026-08-19.md).

Classifier, Calendar eligibility, LLM extraction, Ask Benson SHA-256 ids, ranking, Discover, Today, Alexa, Cloudflare, AWS, and the confirmed Neighborhoods calendar row were not changed.

Live proof: re-ingest **only** `https://www.downtownop.org/events?utm_source=openai` at **2026-08-19T04:51Z**. Extraction still returned one row, so extraction was **not** changed.

---

## Problem

Editorial-container classification was already correct. Ask Benson user-event ids were already SHA-256 of the full identity key. Listing persist still treated **exact `sourceUrl`** as a duplicate.

Hub pages often have no per-card detail URL. Every child inherits the listing URL, e.g.:

`https://www.downtownop.org/events?utm_source=openai`

Legitimate children on that page:

- Overland Park Farmers Market (already persisted)
- Third Fridays
- Wellness Wednesdays
- Movie Night
- Harvesting Hope
- Bourbon, Bacon & Brews
- Trick-or-Treat Event
- Concerts in the Park: Twice on Sunday

`persistIngestedContentItem` did:

1. Match `sourceId` + `sourceExternalId`
2. Else match **global exact `sourceUrl`** and only touch `lastSeenAt`
3. Listing scrape then re-queried by the **new** `sourceExternalId`, found nothing, dropped the row (`created=0`, `updated=0`, `items=[]`)

First child to own the hub URL (Farmers Market `2a8ee718`) absorbed every later child. Persist never created Movie Night / Third Fridays even if extraction had supplied them.

During the earlier re-ingest, Downtown OP `extractedCount=1` and persist returned empty items because the one extracted row URL-collided with Farmers Market.

---

## Old behavior

```ts
if (opts?.sourceUrl) {
  const urlDup = await db.query.contentItems.findFirst({
    where: eq(contentItems.sourceUrl, opts.sourceUrl),
  });
  if (urlDup) {
    await touchExistingItem(urlDup.id, checkedAt);
    return 'updated';
  }
}
```

No `sourceId` filter. No title/date/venue. Hub URL = one content row.

Listing child `sourceExternalId` also included the loop index:

`scrape_listing-<batchId>-<i>-<slug(title)>`

Reordering cards would mint a new id for the same show. After a URL-dup touch, lookup by that new id failed, so the scrape result list went empty.

Ask Benson `collect-from-link` had the same URL-dup on persist, and `findMatchingUserOpportunity` used the **hub** canonical URL for container children without a detail link — first share-intake child on that hub could swallow the rest via `persistUserConfirmedOpportunity` (topic merge).

---

## New persistence rule

Applies only when the caller marks a row as an editorial/listing **container child** (`sharedHubProvenance: true`). Parent discovery rows and ordinary single-event pages keep exact-URL dedupe.

Match order:

1. `sourceId` + `sourceExternalId`
2. Same source + normalized **title + UTC day + venue** (venue compared only when both sides have one), scoped to the same listing URL via `sourceUrl` / `listingSourceUrl` / `parentArticleUrl`
3. Exact `sourceUrl` **only if** `sharedHubProvenance` is false
4. Insert

Hub URL stays provenance. No invented child web URLs.

Internal listing child id (not an external link):

```
scrape_listing-<sha256(listingUrl)[0:16]>-<slug(title)>-<YYYY-MM-DD|undated>-<slug(venue)|novenue>
```

Ask Benson children still use `ask-benson-user-event-<sha256-prefix>` of canonicalUrl+title+date+venue. For container children, `findMatchingUserOpportunity` is given `#<slug(title)>` (or a real detail URL) instead of the bare hub, so URL match cannot collapse siblings.

`persistIngestedContentItemResult` returns `{ outcome, contentItemId }` so scrape-listing / collect-from-link look up the reconciled row by **id**, not by a new external id that the legacy Farmers Market row does not have.

---

## Call sites

| Path | Container child? | Persist |
| --- | --- | --- |
| `scrape-listing.ts` | `container.isContainer && !parentRepresentsSingleEvent && title ≠ documentTitle` | `sharedHubProvenance` + deterministic child external id |
| `collect-from-link.ts` | same | `sharedHubProvenance`; hub canonical URL not used for URL match |
| RSS / email / discount watch / single-event scrape | no | exact `sourceUrl` dedupe unchanged |

Child metadata now includes `containerChild: true` plus existing `listingSourceUrl` / `parentArticleUrl`. Parent rows still get `editorialContainer: true`, `calendarEligible: false`.

---

## Tests

```
cd services/core
pnpm exec tsx --test \
  src/ask-benson/container-child-persist.test.ts \
  src/scanner/ingest-persist.container-child.test.ts \
  src/ask-benson/user-opportunity-add.test.ts
```

**16 passed**, 0 failed.

| # | Proof |
| --- | --- |
| 1 | Same hub + different title/date → two `content_items` |
| 2 | Same hub + same normalized title/day/venue → one row |
| 3 | Re-ingest with a different external id still updates the same row |
| 4 | Extra hub child does not change Farmers Market fixture title/date/URL |
| 5 | Child `sourceUrl` remains the hub |
| 6 | `listingSourceUrl` / `parentArticleUrl` retained |
| 7 | Non-container exact-URL dedupe: second title on the same URL does not create a row |
| 8 | Ask Benson SHA-256 / Eventbrite tests still green |

DB fixtures used a **test** hub query (`benson_test=container_child`) so they could not URL-collide with live Farmers Market.

---

## Downtown OP regression proof (extraction unchanged)

`scrapeListingUrl` on source `495e6e57-2cfe-490b-84de-38cfe2b6440e`, listing URL with `utm_source=openai`.

| | |
| --- | --- |
| Classification | container, `multi_event_schedule`, `parentRepresentsSingleEvent=false` |
| Opportunities **extracted** | **1** |
| Persist `created` / `updated` | 0 / **1** |
| Ingest `items` | 1 — resolved to existing Farmers Market |
| New children | **none** |

Resolved row:

| Field | Value |
| --- | --- |
| id | `2a8ee718-ed95-42bd-88ae-436e36e753ba` |
| topic | Overland Park Farmers Market |
| sourceUrl | `https://www.downtownop.org/events?utm_source=openai` |
| sourceExternalId | `scrape_listing-38fa8fcfd5ed3cd8-0-overland-park-farmers-market` (legacy, not rewritten) |
| eventStartsAt | `2026-04-18T12:30:00.000Z` |
| locationName | Matt Ross Community Center |

Topic, URL, date, and external id **unchanged**. `updatedAt` moved `2026-08-19T04:47:53Z` → `04:51:12Z` (freshness touch only).

Previously this ingest ended with `items=[]` because URL-dup + lookup-by-new-external-id dropped the row. Now the one extracted opportunity **reconciles onto Farmers Market** instead of vanishing. It still does **not** create Third Fridays / Movie Night / etc., because extraction did not return those titles.

**Stopped.** Persistence is ready for multiple hub children. Extraction is still a single opportunity and was left alone.

Live page text still lists dated cards (Farmers Market, Third Fridays, Wellness Wednesdays, Movie Night, Harvesting Hope, Bourbon Bacon & Brews, Trick-or-Treat, Concerts in the Park). JSON-LD Event count remains 0, so children depend on the LLM.

---

## What this did not fix

1. **LLM extraction** on schedule/hub pages still returning one row (Downtown OP this run; Family Shows previously). Next: extract dated cards without changing `classifyEditorialContainer`.
2. **Parent-row URL dedupe** — if extraction emits the hub title, that parent is not a container child, so exact-URL dedupe can still resolve onto Farmers Market. This run reported Farmers Market as `updated` for that reason or because the one child title was Farmers Market itself. Either way, Farmers Market was not overwritten.
3. Migrating legacy listing external ids that contain a loop index (`-0-`). Identity match covers re-ingest; ids are not rewritten in place.
4. Family Shows re-ingest (out of scope for this pass).
5. Confirmed Neighborhoods calendar row `546d8013`.

---

## Files

| Path | Change |
| --- | --- |
| `services/core/src/ask-benson/container-child-persist.ts` | **New.** Child external id, listing URL equivalence, title+day+venue identity |
| `services/core/src/ask-benson/container-child-persist.test.ts` | **New.** Pure identity tests |
| `services/core/src/scanner/ingest-persist.ts` | `sharedHubProvenance` / `childMatch`; `persistIngestedContentItemResult` returns id |
| `services/core/src/scanner/ingest-persist.container-child.test.ts` | **New.** DB persist tests |
| `services/core/src/ask-benson/scrape-listing.ts` | Child ids + shared-hub persist; lookup by reconciled id |
| `services/core/src/ask-benson/collect-from-link.ts` | Same persist opts; hub URL not used as sibling match key |

Not changed: `classifyEditorialContainer`, Calendar eligibility, listing-extract prompt, Ask Benson SHA-256 helper.

---

## How to re-check persist without extraction

```
cd services/core
pnpm exec tsx --test \
  src/ask-benson/container-child-persist.test.ts \
  src/scanner/ingest-persist.container-child.test.ts \
  src/ask-benson/user-opportunity-add.test.ts
```

Those tests insert and delete `ZZZ_TEST_FIXTURE_container_child_persist_*` rows only.
