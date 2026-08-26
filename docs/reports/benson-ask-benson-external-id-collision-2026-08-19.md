# Ask Benson external-id collision fix (2026-08-19)

Scoped persist-identity fix discovered during [editorial-container re-ingest](./benson-editorial-container-reingest-2026-08-19.md). Classifier, Calendar eligibility, listing child persistence, LLM extraction, ranking, Discover, Today, Alexa, Cloudflare, and AWS were not changed. Existing records were **not** rewritten.

Live proof ran locally at **2026-08-19T04:02Z** against only:

- Where to Eat, Shop, Play, and Spend a Day in 20 KC Metro Neighborhoods
- Spend a Day in Parkville: Where to Eat, Shop, and Explore

Family Shows and Downtown OP were **not** re-ingested in this pass.

---

## Problem

Ask Benson URL intake (`collectOpportunitiesFromLink` → `buildUserOpportunityExternalId`) assigned every non-Eventbrite user-event the **same** `sourceExternalId`:

`ask-benson-user-event-68747470733a2f2f`

During the 2026-08-19 editorial-container re-ingest, both In Kansas City guides reported an `updated` persist of content item `ac3a048f-6dc8-44ed-8939-13f187c1dfc6` — **The Reunion Hosted By DJ DOT WAV** (`https://theosc.co/events`). That row was only freshness-touched (`persistIngestedContentItem` on an existing `sourceId` + `sourceExternalId` does not replace topic). The ingest API still returned Reunion’s id with the incoming article title, which is how the collision showed up.

Unrelated Ask Benson URL ingests could not get their own durable identity. New https URLs kept matching Reunion (or whichever share-intake row first occupied that id).

---

## Old identity behavior

```ts
const key = [
  normalizeCanonicalEventUrl(input.canonicalUrl ?? '') ?? '',
  normalizeOpportunityTitle(input.title),
  input.eventDateIso?.slice(0, 10) ?? '',
  normalizeOpportunityTitle(input.venue),
].join('|');
const hash = Buffer.from(key).toString('hex').slice(0, 16);
return `ask-benson-user-event-${hash}`;
```

This is not a hash of the key. It is UTF-8 → hex of the key string, truncated to 16 hex characters (8 bytes).

Every canonical URL starts with `https://`:

| UTF-8 | Hex |
| --- | --- |
| `h t t p s : / /` (8 bytes) | `68747470733a2f2f` |

So `Buffer.from(key).toString('hex').slice(0, 16)` is **always** `68747470733a2f2f` whenever `canonicalUrl` is an https URL, regardless of host, path, title, date, or venue.

Eventbrite rows were already on a separate scheme (`ask-benson-user-event-eb-<numericId>`) and were not part of this collision.

`persistIngestedContentItem` matches `(sourceId, sourceExternalId)` first. Share-intake uses one source for Ask Benson links, so every colliding id hit the same content row.

Live Reunion occupant (left in place; not migrated):

| Field | Value |
| --- | --- |
| id | `ac3a048f-6dc8-44ed-8939-13f187c1dfc6` |
| topic | The Reunion Hosted By DJ DOT WAV |
| sourceUrl | `https://theosc.co/events` |
| sourceExternalId | `ask-benson-user-event-68747470733a2f2f` |
| eventStartsAt | `2026-08-29T15:00:00.000Z` |
| ingest | `ask_benson_link` |
| canonicalEventUrl | `https://theosc.co/events` |

---

## New identity format

`buildUserOpportunityExternalId` in `services/core/src/ask-benson/url-intake-dedupe.ts` now digests the **full** identity key with Node `crypto.createHash('sha256')`.

```ts
const key = [
  normalizeCanonicalEventUrl(input.canonicalUrl ?? '') ?? '',
  normalizeOpportunityTitle(input.title),
  input.eventDateIso?.slice(0, 10) ?? '',
  normalizeOpportunityTitle(input.venue),
].join('|');
const digest = createHash('sha256').update(key).digest('hex').slice(0, 32);
return `ask-benson-user-event-${digest}`;
```

| Property | Choice |
| --- | --- |
| Algorithm | SHA-256 (Node built-in `crypto`) |
| Input | Full `canonicalUrl\|title\|date\|venue` after existing normalizers |
| Output | `ask-benson-user-event-` + first **32 hex chars** (128 bits) |
| Eventbrite | Unchanged: `ask-benson-user-event-eb-<id>` |
| Secrets / random UUIDs | None |
| Existing rows | Not rewritten. Reunion keeps the legacy collision id. |

32 hex chars is short enough for `source_external_id` and collision-resistant enough for content identity. It is **not** a raw encoding of the URL: the id does not contain `http`, the host, or the `https://` hex prefix.

Canonicalization is unchanged (`normalizeCanonicalEventUrl` strips www, hash, query, trailing slash). Same URL/title/date/venue still yields the same digest; a different title, day, or venue on the same URL yields a different digest.

Call sites were not redesigned. `collect-from-link.ts` and `user-opportunity-save.ts` still call `buildUserOpportunityExternalId`.

---

## Tests

```
cd services/core
pnpm exec tsx --test src/ask-benson/user-opportunity-add.test.ts
```

**9 passed**, 0 failed.

| Test | Assertion |
| --- | --- |
| Eventbrite / canonical URL (existing) | `ask-benson-user-event-eb-123456789`; Eventbrite URL still canonicalizes |
| Unrelated https URLs do not collide | Neighborhoods, Parkville, and Reunion each get `ask-benson-user-event-[0-9a-f]{32}`; none equal `ask-benson-user-event-68747470733a2f2f` |
| Deterministic | Same input twice → same id; `www` + trailing slash on the same path → same id |
| Title / date / venue matter | Same Downtown OP hub URL, different title or date or venue → different ids |
| No raw URL in the id | No `http`, host, path token, or `68747470733a2f2f`; not equal to `Buffer.from(url).toString('hex')` |
| Explicit add / qualification / confirmation copy (existing) | Still green |

---

## Regression proof (two InKC sources only)

Path: Ask Benson `collectOpportunitiesFromLink` with the live article URL as `userMessage` (normal pasted-URL path, not an explicit “add these events” command).

Ran **2026-08-19T04:02Z**. Family Shows and Downtown OP were not included.

### Neighborhoods

| | |
| --- | --- |
| URL | `https://www.inkansascity.com/home-design/neighborhoods/where-to-eat-shop-play-and-spend-a-day-in-20-kc-metro-neighborhoods/` |
| Ingest API | `extractedCount=1`, `created=0`, `updated=0`, `items=[]` |
| Resolved to Reunion? | **No** (`ac3a048f` not in ingest ids) |

Exact `sourceUrl` already belonged to the repaired RSS parent. `persistIngestedContentItem` URL-duped onto that row and only refreshed freshness. Lookup by the **new** Ask Benson digest then found nothing, so the ingest result list was empty. That URL-dup behavior was **not** changed in this task.

Reconciled parent (correct article, not Reunion):

| Field | After ingest |
| --- | --- |
| id | `4256ab24-4d51-497e-b7fb-979f31adb61c` |
| topic | Where to Eat, Shop, Play, and Spend a Day in 20 KC Metro Neighborhoods |
| sourceUrl | article URL (no hash) |
| sourceExternalId | `home-design/neighborhoods/where-to-eat-shop-play-and-spend-a-day-in-20-kc-metro-neighborhoods` (RSS id, **not** rewritten) |
| eventStartsAt | `null` |
| calendarEligible | `false` |
| editorialContainer | `true` |
| lastSeenAt / updatedAt | `2026-08-19T04:02:04Z` (touched) |
| ingest | `inkc_openings_rss` |

Sister luxury-RSS copy `f4318bca` (`#luxury-deal`) was not touched.

### Parkville

| | |
| --- | --- |
| URL | `https://www.inkansascity.com/innovators-influencers/local-news/spend-a-day-in-parkville-where-to-eat-shop-and-explore/` |
| Ingest API | `extractedCount=1`, **created=1**, `updated=0` |
| Resolved to Reunion? | **No** |

The luxury-RSS parent `572963d8` uses `#luxury-deal`, so exact `sourceUrl` did not collide. Ask Benson created a new discovery row with a real digest:

| Field | Value |
| --- | --- |
| id | `b0f6b883-7808-43da-9ed5-39b217e2fa46` |
| topic | Spend a Day in Parkville: Where to Eat, Shop, and Explore - IN Kansas City Magazine |
| sourceUrl | article URL (no hash) |
| sourceExternalId | `ask-benson-user-event-6b123644bb71b5b52218e6a83e53ee14` |
| eventStartsAt | `null` |
| calendarEligible | `false` |
| editorialContainer | `true` |
| ingest | `ask_benson_link` |
| listingSourceUrl / parentArticleUrl | article URL |
| publisher | `inkansascity.com` |
| canonicalEventUrl | `https://inkansascity.com/innovators-influencers/local-news/spend-a-day-in-parkville-where-to-eat-shop-and-explore` |
| Calendar rows for this id | **none** |

The RSS `#luxury-deal` copy `572963d8` remains as the repaired undated parent (`calendarEligible=false`). It was not mutated.

### The Reunion unchanged

Before and after this re-ingest (byte-for-byte on identity fields):

| Field | Value |
| --- | --- |
| id | `ac3a048f-6dc8-44ed-8939-13f187c1dfc6` |
| topic | The Reunion Hosted By DJ DOT WAV |
| hook | Events \| Join, Connect, Grow Today! — Outsiders Social Club |
| sourceUrl | `https://theosc.co/events` |
| sourceExternalId | `ask-benson-user-event-68747470733a2f2f` |
| eventStartsAt | `2026-08-29T15:00:00.000Z` |
| updatedAt | `2026-08-19T03:18:44.206Z` (**unchanged**; last touch was the earlier colliding ingest) |
| listingSourceUrl | `https://www.theosc.co/events` |
| canonicalEventUrl | `https://theosc.co/events` |

### Calendar

| Check | Result |
| --- | --- |
| New suggested/tentative parent for either article | **None** |
| Parkville `b0f6b883` projected | **No** (undated, `calendarEligible=false`) |
| Pre-existing confirmed neighborhoods row | Still `546d8013-26e2-4a25-a0dc-07eaba51c501` (`2026-08-21T05:00:00.000Z`, source `4256ab24`). Repair never cancelled confirmed. This ingest did not create it. |

---

## What this did not fix

Still open from the re-ingest report; **out of scope** here:

1. **Listing persist URL-dedupe** — children (and Ask Benson retries) that share an exact hub `sourceUrl` still collapse onto the first row with that URL. That is why Neighborhoods did not store a new `ask-benson-user-event-<digest>` row, and why Downtown OP children cannot persist yet.
2. **LLM extraction** on schedule/hub pages still returning one parent-titled row (Family Shows, Downtown OP).
3. **Confirmed** neighborhoods calendar row `546d8013`.
4. Migrating historical rows off `ask-benson-user-event-68747470733a2f2f`. Reunion keeps that legacy id on purpose.

---

## Files

| Path | Change |
| --- | --- |
| `services/core/src/ask-benson/url-intake-dedupe.ts` | SHA-256 digest of the full identity key; 32-hex prefix |
| `services/core/src/ask-benson/user-opportunity-add.test.ts` | Collision, determinism, title/date/venue, no raw-URL tests |

Not changed: `classifyEditorialContainer`, Calendar eligibility, `scrape-listing.ts` persist, listing-extract prompt, ranking, Discover, Today, Alexa, Cloudflare, AWS.

---

## How to re-check identity

```
cd services/core
pnpm exec tsx --test src/ask-benson/user-opportunity-add.test.ts
```

To confirm two https URLs no longer share an id:

```
node -e "
import { createHash } from 'node:crypto';
const a = createHash('sha256').update('https://a.example/x||').digest('hex').slice(0,32);
const b = createHash('sha256').update('https://b.example/y||').digest('hex').slice(0,32);
console.log(a === b, a, b);
"
```
