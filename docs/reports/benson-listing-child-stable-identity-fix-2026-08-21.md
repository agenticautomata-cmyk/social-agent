# Listing/container child stable identity fix

Date: 2026-08-21 (operator timezone America/Chicago)

**CODE-ONLY. Live data unchanged. No Calendar projection. No re-ingest. No Discover ranking. No partnership/sponsor work. Existing duplicate rows were NOT cleaned.**

---

## Proven root cause

Listing scrape durable identity was **gated on container classification**.

Path:

1. `scrapeListing` extracts opportunities (LLM + JSON-LD merge + editorial decompose)
2. Loop `for (let i = 0; i < extraction.opportunities.length; i++)`
3. `sourceExternalId` chosen here
4. Persist: exact `sourceExternalId` lookup, then optional detail-`sourceUrl` hit, then `findSharedHubChild` / `containerChildrenShareIdentity`

Exact pre-fix formula in `services/core/src/ask-benson/scrape-listing.ts`:

```ts
const externalId = input.discountWatch
  ? `dw-${sha256(slugify(title) + '|' + sourceUrl).slice(0, 20)}`
  : isContainerChild
    ? buildListingContainerChildExternalId({ ingest, listingUrl, title, eventDate, venue })
    : `${input.ingest}-${batchId}-${i}-${slugify(title)}`;
```

Where:

- `batchId = sha256(listingUrl).slice(0, 16)`
- `i` = **array index in `extraction.opportunities`** (card/DOM/extraction order)
- `isContainerChild` = container classifier said hub + this row is not the parent

The index branch is the S1 bug. Live OPCC clones prove it:

| Index component | Live `sourceExternalId` suffix |
| --- | --- |
| `-1-` | `scrape_listing-5cd63116244d6030-1-inspiring-women-in-public-administration-confere` |
| `-3-` | `…-3-inspiring-women-…` |
| `-5-` | `…-5-inspiring-women-…` |
| `-7-` | `…-7-inspiring-women-…` |

`5cd63116244d6030` = `sha256("https://opconventioncenter.com/events?utm_source=openai").slice(0, 16)`.

When a later scrape classified the same hub as a container, one occurrence also received the **already-correct** helper id (no index). Persist looked up by the new id, missed the index clones, and created another row. Repair wrote the corrected 8:00 AM CT clock onto **one** row; index clones stayed `00:00Z`.

`buildListingContainerChildExternalId` already implemented occurrence identity. It was simply **not used** unless `isContainerChild` was true. Classifier misses, pre-container historical scrapes, and any non-container multi-card listing all took the index formula.

---

## Exact current (legacy UNSTABLE) identity formula

For listing children that were **not** tagged `isContainerChild`:

```
{ingest}-{sha256(listingUrl)[0:16]}-{extractionIndex}-{slugify(title)[0:48]}
```

Example:

```
scrape_listing-5cd63116244d6030-7-inspiring-women-in-public-administration-confere
```

This is unstable under reorder, insertion above, and any extraction-order change. Unit tests reconstruct this string as `legacyListingIndexExternalId` and prove index 1 ≠ index 7 for the same title.

---

## Exact new stable identity formula / precedence

No new global identity framework. Reuse `buildListingContainerChildExternalId` for **every** listing child event (not only classified container children).

### Child event `sourceExternalId`

```
{ingest}-{sha256(listingUrl.trim())[0:16]}-{slugify(title)}-{localDay|undated}-{slugify(venue)|novenue}
```

`localDay` = `listingContainerLocalDayKey`:

1. `YYYY-MM-DD` prefix of extracted `eventDate` (intended local/source day)
2. else date-only stored instant → UTC date prefix (date-only encoding)
3. else `getLocalCalendarDay(eventStartsAt)` (America/Chicago)

**Not used:** card index, extraction order, DOM position, array index `i`.

### Persist match precedence (unchanged architecture, wider gate)

1. **Stable native/detail URL** — if `listingChildHasStableDetailUrl(listingUrl, sourceUrl)`, match existing row by `sourceId + sourceUrl`. This remains preferred when OPCC (and similar) already have a real child detail URL.
2. **Exact new `sourceExternalId`**
3. **Shared-hub occurrence match** — `findSharedHubChild` / `containerChildrenShareIdentity` (normalized title + intended local day + venue when both sides have venue + listing URL equivalence)

Step 1 is **not** hashed into the id. That avoids inventing a second identity scheme. Detail URL remains the first persist key when it is distinct from the hub.

### Parent hub row

Index-free:

```
{ingest}-{sha256(listingUrl)[0:16]}-parent-{slugify(title)}
```

Discount-watch ids unchanged (`dw-…`).

Entry point: `resolveListingScrapeExternalId`.

---

## Why listing index is no longer durable identity

Index is a property of **one scrape’s array order**, not of the occurrence. The same OPCC card moved from slot 1 → 3 → 5 → 7 and minted four content rows. Reorder tests prove the old formula changes while the new formula does not.

---

## Collision safeguards

Kept (already in the helper / `containerChildrenShareIdentity`):

| Evidence | Effect |
| --- | --- |
| Different title (normalized) | Different id / no shared-hub match |
| Different intended **local** day | Different id / no shared-hub match |
| Different venue when **both** sides have venue and neither string contains the other | Different id / no shared-hub match |
| Distinct listing hub URL (raw listing string hashed into id; persist also checks `listingUrlsEquivalent`) | Different listing family |
| Distinct child detail URL | Persist hits existing row by `sourceUrl` before insert |

Not solved here (parked): **same title + same local day + same venue + multiple showtimes**. No stable showtime component is in the current child id. Do not add clock-of-day to this key in this task.

Live nuance (cleanup, not this task): Inspiring Women clones use venue `Overland Park, KS`; the repaired occurrence uses `Overland Park Convention Center`. Those slug to different venue keys, so a later bounded merge must pick a keeper explicitly. Code identity is working as designed.

---

## Files changed

| File | Change |
| --- | --- |
| `services/core/src/ask-benson/container-child-persist.ts` | Document child formula; add `resolveListingScrapeExternalId`, `listingChildHasStableDetailUrl` |
| `services/core/src/ask-benson/scrape-listing.ts` | Always use occurrence id for non-parent listing rows; never `${ingest}-${batchId}-${i}-…`; apply shared-hub + detail-URL persist to all listing children |
| `services/core/src/ask-benson/container-child-persist.test.ts` | Legacy index proof + cases 1–9 |
| `services/core/src/scanner/ingest-persist.container-child.test.ts` | Legacy index id still matches via shared-hub `childMatch` |

**Not changed:** Ask Benson user-event SHA hashing, Eventbrite ids, partnership identity, Calendar idempotency keys, global `sourceUrl` canonicalization, Discover ranking/eligibility, OPCC time overlay, Calendar projection, live rows.

---

## Tests run + pass/fail counts

Command:

```bash
pnpm --filter @social-agent/core exec node --import tsx --test \
  src/ask-benson/container-child-persist.test.ts \
  src/scanner/ingest-persist.container-child.test.ts
```

| Suite | Pass | Fail |
| --- | --- | --- |
| `container child persist identity` (existing helper / local-day / shared-hub) | 8 | 0 |
| `listing child durable identity — index-free` (new regressions 1–9 + parent) | 10 | 0 |
| `persistIngestedContentItem — shared hub URL children` (existing 3 + legacy-index match) | 4 | 0 |
| **Total** | **22** | **0** |

Existing container-child persistence tests remain green (test 10).

### Reorder / insertion regression proof

- **Case 2:** three children A/B/C reordered to C/A/B keep the same three durable ids. Legacy index ids all change.
- **Case 3:** inserting a new child at position 0 leaves the two existing ids unchanged; only the new child gets a new id. Legacy index ids for the old children all shift by +1.

### Local-day regression proof

- **Case 7:** naive `2026-08-21T22:00:00` stores as UTC `2026-08-22T03:00:00.000Z` (Chicago CDT). Durable id contains `-2026-08-21-`, not `-2026-08-22-`.
- Existing consecutive-night test (Bowline Sep 3 vs Sep 4 at 10 PM) still passes.

---

## Bounded read-only Inspiring Women duplicate-family proof

Query: `topic ILIKE '%Inspiring Women in Public Administration%'` only. **SELECT. No UPDATE/INSERT/DELETE.**

All **5** rows still present after this task.

Listing URL used for “new identity” below = the live scrape listing string whose hash is already in these ids (`https://opconventioncenter.com/events?utm_source=openai` → `5cd63116244d6030`).

| content id | live `sourceExternalId` | title | local event day | venue | source / detail URL | legacy index | new identity key |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `91a48eb4-ee7a-44c7-9727-9ba2ef51d6c0` | `scrape_listing-5cd63116244d6030-7-inspiring-women-in-public-administration-confere` | Inspiring Women in Public Administration Conference 2026 | 2026-08-21 | Overland Park, KS | `https://opconventioncenter.com/events?utm_source=openai#inspiringwomenconference` | **7** | `scrape_listing-5cd63116244d6030-inspiring-women-in-public-administration-confere-2026-08-21-overland-park-ks` |
| `b14a7c17-8d51-487a-a3ae-0d68e7eeca37` | `…-1-inspiring-women-…` | same | 2026-08-21 | Overland Park, KS | `…#calendar` | **1** | **same new key as row 1** |
| `537624be-771e-4b58-86d8-e7800a1ba18e` | `…-3-inspiring-women-…` | same | 2026-08-21 | Overland Park, KS | `…#event-detail-inspiring-women-conference` | **3** | **same new key as row 1** |
| `0e7485a8-4a70-41bd-ba15-7650dfabe3eb` | `…-5-inspiring-women-…` | same | 2026-08-21 | Overland Park, KS | `…#inspiring-women-conference` | **5** | **same new key as row 1** |
| `1695ee52-8ca5-4cc3-8ec2-417d77fcbbf6` | `scrape_listing-5cd63116244d6030-inspiring-women-in-public-administration-confere-2026-08-21-overland-park-convention-center` | Inspiring Women in Public Administration Conference 2026 \| Overland Park Convention Center | 2026-08-21 | Overland Park Convention Center | `https://opconventioncenter.com/events/inspiring-women-in-public-administration-conference-2026/` | none (already occurrence id) | **same as live id** (detail URL persist would prefer this row) |

**Collapse under new identity:** the four index clones (`91a48eb4`, `b14a7c17`, `537624be`, `0e7485a8`) share one logical key. The repaired timed row (`1695ee52`, `eventStartsAt=2026-08-21T13:00:00.000Z`) stays a second key because venue slug is `overland-park-convention-center` vs `overland-park-ks`. **Not merged in this task.**

Clones remain `00:00Z`. Only `1695ee52` has the corrected 8:00 AM CT clock. That is why cleanup must be a **separate bounded merge**, keeper = repaired occurrence.

---

## Second / third duplicate families (generic pattern)

Bounded to OPCC `sourceId` `6ce4341e-5203-46d8-9ed9-0f6e7af25339` (30 rows). Did **not** scan the whole `content_items` table.

### The Calling: Kansas City (Flesh and Blood World Tour)

Local day `2026-08-28`, venue `Overland Park, KS` on all four.

| content id | legacy index | live id contains | new identity |
| --- | --- | --- | --- |
| `e3fd2608-46ed-4ca0-8e98-db1197381bc6` | 11 | `-11-the-calling-…` | `scrape_listing-5cd63116244d6030-the-calling-kansas-city-flesh-and-blood-world-to-2026-08-28-overland-park-ks` |
| `4b554758-4bc0-4db5-aaf7-0687c277c1b0` | 9 | `-9-the-calling-…` | **same** |
| `18b99a0f-0069-4d0f-b5e6-89e6a4263b72` | 7 | `-7-the-calling-…` | **same** |
| `9a9dd2df-d2f1-4177-bc85-1977c9a93c0e` | 6 | `-6-the-calling-…` | **same** |

All four collapse to one logical child. Rows **not** deleted.

### Forever the Free State: Johnson County Democratic Banquet 2026

Local day `2026-08-15`.

| content id | legacy index | venue | new identity |
| --- | --- | --- | --- |
| `103a6fa2-732e-4084-94d7-a5933dfd13fd` | 0 | Overland Park Convention Center | `…-2026-08-15-overland-park-convention-center` |
| `81cb4154-b8e7-481f-bf51-981d5c91190b` | 4 | Overland Park, KS | `…-2026-08-15-overland-park-ks` |
| `74de0ef8-c1c1-40d7-a970-b04a60905dec` | 6 | Overland Park, KS | **same as index 4** |
| `5dd40bda-d03a-4e24-8800-0e3a00ed86e4` | 2 | Overland Park, KS | **same as index 4** |

Three index clones collapse; index 0 differs only by venue slug. Same generic index bug. Rows **not** deleted.

Also seen on this source (not expanded): “Events Archive” parent chrome with index ids — parent formula is now index-free going forward; historical parent dupes are a separate cleanup.

---

## Confirmations

| Check | Result |
| --- | --- |
| Live data changed | **No** |
| Calendar projection | **Not run** |
| OPCC / listing re-ingest | **Not run** |
| Existing duplicates cleaned | **No** — 5 Inspiring Women rows still present with original ids |
| Same-day multi-showtime identity | **Explicitly out of scope** |
| Discover ranking / eligibility | **Not touched** |
| Partnership / sponsor workflows | **Not touched** |
| Ask Benson user-event SHA / Eventbrite / Calendar idempotency keys | **Not touched** |

---

## Unrelated findings (out of scope)

- Raw `listingUrl` hashing is sensitive to trailing slash vs `?utm_source=openai` (`dd573212…` vs `5cd63116…` vs `4f22b905…`). Do **not** globally canonicalize `sourceUrl` here; a later identity pass may hash a canonical listing hub if cleanup needs one keeper key.
- Listing cards often store city `Overland Park, KS` while detail pages store `Overland Park Convention Center`. Venue-slug split is intentional collision resistance and must be handled in bounded dedupe, not by dropping venue from the key.
- Discover still surfaces hub/venue chrome. Eligibility/ranking was not part of this identity fix.
- Calendar clones of index rows remain stale until a separate merge + optional projection.

---

## Follow-up (not this task)

Bounded cleanup of index-clone families: keeper = occurrence-id / repaired timed row when present; retire index-suffixed clones; then a **narrow** Calendar sync for those ids only. Do not re-ingest the whole OPCC listing as the cleanup mechanism.
