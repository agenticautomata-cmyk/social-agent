# Shared-hub child persistence: local-day identity fix

Date: 2026-08-20  
Scope: consecutive LOCAL performance nights collapsing on shared-hub child match for listing/container ingest.  
Primary live proof: `[Benson] Shows — The Bowline Brothers` (`7fb75a94-1f95-4e5a-9b41-2cc012a3ea80`).  
Listing URL: `https://www.bowlinebrothers.com/shows?utm_source=openai`

**Calendar was not re-projected. The 53 existing Bowline suggested Calendar rows were not cancelled or updated.**  
Bowline tour extraction / promotion was **not** changed in this task.  
Frozen surfaces (Calendar eligibility, listing_chrome, venue_as_title, T-Mobile, Downtown OP, Family Shows, OPCC / HPNA / CommUNITY Fest, Alexa / Discover / Today / ranking) were not edited.

---

## Problem statement

After the Bowline tour-listing extraction fix (see `benson-bowline-tour-extraction-2026-08-20.md`), live extraction was correct:

- **40** distinct tour-card children extracted
- Real card dates/times preserved (`2026-09-03T22:00:00` naive local wall clock, etc.)
- Performer-format titles + venue/location recovered

But the first re-ingest with corrected extraction returned:

| Outcome | Count |
| --- | --- |
| Created | 27 |
| Updated | 13 |

**13 updates** were not idempotent touches of the same logical child — they were **distinct consecutive LOCAL nights reconciling onto one content row** because shared-hub identity used the **UTC calendar day** of `eventStartsAt`, not the event's intended local calendar day.

### Symptom

Multi-night runs at the same venue (e.g. Tin Roof Delray Beach Sep 3 + Sep 4, both 10:00 PM America/Chicago) collapsed to one row. The surviving row often kept the **second** night's payload because the later card matched the first row's UTC day key and overwrote it on update.

The Calendar `venue_as_title` guard still could not help — that is a separate downstream issue. This task fixes **durable content identity** so all 40 logical local-day children can persist before any Calendar sync.

---

## Investigation first — collision proof

### Identity pipeline (before fix)

Shared-hub child matching flows through:

1. **`buildListingContainerChildExternalId`** — `sourceExternalId` for new rows  
2. **`persistIngestedContentItemResult` → `findSharedHubChild` → `containerChildrenShareIdentity`** — reconcile existing rows on re-ingest

Both used **`listingContainerDayKey(Date)`**:

```typescript
// BEFORE
return eventStartsAt.toISOString().slice(0, 10); // UTC calendar day
```

For external IDs, the day key was derived from **`parseEventDate(full eventDate)`** then UTC-sliced — so a naive `2026-09-03T22:00:00` (10 PM Chicago) became `2026-09-04T03:00:00Z` → day key **`2026-09-04`**.

For `childMatch` during scrape, scrape-listing passed:

```typescript
eventStartsAt: parseEventDate((opp.eventDate ?? '').slice(0, 10)) // UTC midnight on YYYY-MM-DD prefix
```

So incoming match used local date prefix (**`2026-09-03`**) while stored rows compared via **`eventStartsAt` UTC day** (**`2026-09-04`** for night 1). Night 2's match day (**`2026-09-04`**) equaled night 1's stored UTC day → **false duplicate reconciliation**.

### Traced pair: Tin Roof Delray Beach consecutive nights

| Field | Night 1 (Sep 3 local) | Night 2 (Sep 4 local) |
| --- | --- | --- |
| Extracted `eventDate` | `2026-09-03T22:00:00` | `2026-09-04T22:00:00` |
| `startTime` | `22:00:00` | `22:00:00` |
| `eventStartsAt` (persisted UTC) | `2026-09-04T03:00:00.000Z` | `2026-09-05T03:00:00.000Z` |
| Old external-id day key | `2026-09-04` (from full parse → UTC) | `2026-09-05` |
| Old childMatch day (incoming) | `2026-09-03` (date slice) | `2026-09-04` (date slice) |
| Old stored-row day (DB match) | `2026-09-04` (UTC of stored instant) | — |
| **`containerChildrenShareIdentity(night2, night1 row)`** | — | **`true` (BUG)** |
| Intended local identity day | **`2026-09-03`** | **`2026-09-04`** |

Simulated before fix:

```
night2 childMatch local day: 2026-09-04
night1 row UTC day:          2026-09-04
sharesIdentity:              true
```

### Persisted evidence (pre-fix re-ingest)

Three Delray-related content rows existed after the first corrected extraction re-ingest:

| id (short) | topic | extracted `eventDate` | `eventStartsAt` |
| --- | --- | --- | --- |
| `5389af35` | `Tin Roof Delray Beach` (legacy) | `2026-09-03T22:00:00` | `2026-09-04T03:00:00Z` |
| `f1b7ed48` | `Tin Roof Delray Beach` (legacy) | `2026-09-04T22:00:00` | `2026-09-05T03:00:00Z` |
| `de1d72cc` | `The Bowline Brothers at Tin Roof Delray Beach` | `2026-09-04T22:00:00` | `2026-09-05T03:00:00Z` |

The new performer-format row **`de1d72cc`** held **Sep 4** data only — **Sep 3 local night was lost** to collapse/update during the same ingest pass.

### Root cause (one sentence)

**Incoming match used local date from `eventDate` prefix; stored-row match used UTC date from `eventStartsAt`; late evening America/Chicago showtimes shift UTC calendar day forward, so consecutive local nights can share the same UTC day key on the stored row side while the incoming child uses the next local day.**

---

## Fix (smallest generic correction)

No Bowline hardcoding. Scope limited to shared-hub persistence identity.

### New helper: `listingContainerLocalDayKey`

File: `services/core/src/ask-benson/container-child-persist.ts`

```typescript
export function listingContainerLocalDayKey(input: {
  eventDate?: string | null;
  eventStartsAt?: Date | null;
}): string | null
```

Priority order (as requested):

1. **Explicit extracted `eventDate` calendar date** — YYYY-MM-DD prefix before any UTC conversion  
   - `2026-09-03T22:00:00` → **`2026-09-03`**
2. **Fallback from stored instant** (when `eventDate` absent on legacy rows):
   - UTC-midnight date-only stamps → UTC YYYY-MM-DD (existing feed convention via `isDateOnlyTimestamp`)
   - Timed instants → `getLocalCalendarDay(eventStartsAt)` in America/Chicago (`datetime.ts`)
3. **Never** derive local day by UTC-slicing a fully parsed evening wall-clock when `eventDate` is present

### Identity remains

Same listing/source + normalized title + **LOCAL event day** + venue (when available).

Examples that must be **two rows**:

- `The Bowline Brothers at Tin Roof Delray Beach` · **2026-09-03** local · `Tin Roof Delray Beach`
- `The Bowline Brothers at Tin Roof Delray Beach` · **2026-09-04** local · `Tin Roof Delray Beach`

Same title + same local day + same venue → still **one row** on re-ingest.

### Files changed

| File | Change |
| --- | --- |
| `services/core/src/ask-benson/container-child-persist.ts` | `listingContainerLocalDayKey`; external id + `containerChildrenShareIdentity` use local day; `ContainerChildMatchInput.eventDate` |
| `services/core/src/scanner/ingest-persist.ts` | `findSharedHubChild` reads `rawPayload.extracted.eventDate` for stored-row comparison |
| `services/core/src/ask-benson/scrape-listing.ts` | Pass `eventDate` + full `parseEventDate(opp.eventDate)` in `childMatch` |
| `services/core/src/ask-benson/collect-from-link.ts` | Pass `eventDate` in `childMatch` |
| `services/core/src/ask-benson/container-child-persist.test.ts` | New consecutive-night + idempotency fixtures |
| `services/core/src/scanner/ingest-persist.container-child.test.ts` | Pass `eventDate` in Downtown OP `childMatch` fixtures |

**Not changed:** Bowline tour promotion, Calendar projection/eligibility, global Calendar occurrence fingerprints, Downtown OP / Family Shows extraction logic.

---

## Tests

### Unit: `container-child-persist.test.ts` (8 cases)

| # | Case | Assert |
| --- | --- | --- |
| 1 | Same title + venue, Sep 3 10 PM vs Sep 4 10 PM local | Different external ids (`-2026-09-03-` vs `-2026-09-04-`); `shareIdentity === false` |
| 2 | Same child re-ingested | `shareIdentity === true` |
| 3 | Same local day, equivalent UTC storage | Reconciles |
| 4 | Daytime child (`2026-04-18T07:30:00`) | External id unchanged semantics (`-2026-04-18-`) |
| 5–8 | Hub URL equivalence, distinct titles, stable ids | Prior behavior preserved |

Run: `pnpm exec tsx --test src/ask-benson/container-child-persist.test.ts`

### Integration: `ingest-persist.container-child.test.ts` (3 cases)

Downtown OP shared-hub: two distinct children, idempotent re-ingest of same normalized title/day/venue, ordinary URL dedupe unchanged.

Run: `pnpm exec tsx --test src/scanner/ingest-persist.container-child.test.ts`

### Regression: `container-event-blocks.test.ts`

**14/14 pass** — Family Shows + tour extraction + Downtown OP decomposition unchanged.

---

## Live proof — Bowline re-ingest only

Path: `scrapeListingUrl`, source `7fb75a94-…`, `webResearchLimit=0`.  
Calendar: **not touched**.

### Pass 1 (first re-ingest after local-day fix)

| Metric | Value |
| --- | --- |
| Children extracted | **40** |
| Created | **15** |
| Updated | **25** |
| Content rows before | 107 |
| Content rows after | 122 |
| Performer-format rows (`The Bowline Brothers at …`) | 42 |
| **Distinct logical local-day children** (title + local day + venue) | **40** |

Pass 1 still created rows because prior re-ingest had collapsed nights and used old UTC-based external ids — new local-day ids could not match old rows.

### Pass 2 (idempotency proof)

| Metric | Value |
| --- | --- |
| Extracted | **40** |
| Created | **0** |
| Updated | **40** |

All 40 extracted children reconciled without creating duplicates. **Idempotent.**

### Consecutive-night before/after

#### Tin Roof Delray Beach

| Local day | Content id | `eventDate` | `eventStartsAt` (UTC) | External id day segment |
| --- | --- | --- | --- | --- |
| **Sep 3** | `8b809eeb-00ff-46c6-a32c-dc48776962c5` | `2026-09-03T22:00:00` | `2026-09-04T03:00:00Z` | `-2026-09-03-` |
| **Sep 4** | `de1d72cc-483b-4c74-9bfd-fcf4e257d7d5` | `2026-09-04T22:00:00` | `2026-09-05T03:00:00Z` | `-2026-09-04-` |

Before fix: only **`de1d72cc`** (Sep 4) survived as performer-format row; Sep 3 collapsed.

#### Tin Roof Fort Lauderdale

| Local day | Content id |
| --- | --- |
| **Sep 5** | `4bd0e26f-5107-4433-915f-1fb5affbf262` |
| **Sep 6** | `c75b255d-9482-4d88-8755-9384cb4d239a` |

Two distinct rows — no consecutive-night collapse.

#### Tin Roof Kansas City (local-day consecutive nights)

| Local day | Content id |
| --- | --- |
| Aug 28 | `d85c5e4d-bdd2-4a07-a055-e83f73289bb3` |
| Aug 29 | `01fda0ab-0563-4073-b227-41361c981c4c` |
| Oct 30 | `5422d752-5e22-45d1-9fcf-1e3286ebe4ca` |
| Oct 31 | `6f49628a-1228-454f-b3e9-40bd0b6d3e26` |
| Dec 18 | `168b33d8-66e4-483c-aa54-334f5e17992d` |
| Dec 19 | `0f3774bc-e566-4d18-8dd3-69eb36c95663` (from prior pass) |

KC-metro multi-night runs persist as separate local-day rows.

### Remaining duplicate local-day keys (legacy, not consecutive-night collapse)

After pass 2, **2** performer-format keys still appear twice — leftover rows from **prior UTC-key ingests** with different `sourceExternalId` values that did not reconcile:

| Key (title \| local day \| venue) | Count |
| --- | --- |
| `The Bowline Brothers at Tin Roof Detroit` \| 2026-08-16 \| Tin Roof Detroit | 2 |
| `The Bowline Brothers at Tin Roof Cincinnati` \| 2026-08-01 \| Tin Roof Cincinnati | 2 |

These are **same local day duplicates**, not Sep 3/Sep 4-style consecutive-night merges. Per task scope: **legacy rows not cleaned yet.**

### Consecutive-night collapses remaining

**0** — no title+venue pairs with adjacent local nights collapsed onto one row after pass 2.

---

## Calendar status (unchanged)

| Check | Result |
| --- | --- |
| Calendar projection | **Not run** |
| Bowline Calendar rows cancelled | **0** |
| Linked Calendar rows | **53 suggested** (still point at pre-fix / legacy content ids) |
| Legacy venue-as-title content rows | **Not cleaned** (~39 pre-fix rows remain alongside corrected performer-format rows) |

---

## Relationship to prior Bowline work

| Stage | Report | Status |
| --- | --- | --- |
| 1. Extraction | `benson-bowline-tour-extraction-2026-08-20.md` | Performer title + venue/location recovery |
| 2. Persistence identity | **this report** | 40 local-day children durable + idempotent |
| 3. Calendar sync | *not started* | Cancel 53 venue-titled suggestions; project from corrected content |

---

## Follow-up (not this task)

1. **Legacy content dedupe** — merge or cancel duplicate performer-format rows (Detroit Aug 16 ×2, Cincinnati Aug 1 ×2) and ~39 venue-as-title legacy rows.
2. **Calendar sync** — project from 40 corrected local-day children; cancel 53 old suggested rows tied to venue-as-title content.
3. **Optional external-id migration** — some rows retain old UTC-day segments in `sourceExternalId` (e.g. `-2026-11-26-` while `eventDate` is `2026-11-25T22:00:00`); matching now uses `childMatch.eventDate` + shared-hub identity, so functionally OK but ids are cosmetically stale until re-keyed.

---

## Summary

Shared-hub child identity incorrectly used **UTC calendar day of `eventStartsAt`**, while extracted naive `eventDate` carries the **intended local performance day**. For 10 PM America/Chicago shows, local Sep 3 and Sep 4 map to UTC Sep 4 and Sep 5 — but night 2's incoming local day **Sep 4** matched night 1's stored UTC day **Sep 4**, collapsing distinct performances.

Fix: **`listingContainerLocalDayKey`** prefers extracted `eventDate` YYYY-MM-DD, with Chicago local-day fallback only when `eventDate` is absent. After fix, Bowline re-ingest persists **40 distinct local-day children**, and a second pass is **fully idempotent** (0 created, 40 updated). Calendar and legacy cleanup deferred.
