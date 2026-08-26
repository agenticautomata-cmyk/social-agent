# Calendar geography eligibility — confident non-KC structured locations

Date: 2026-08-20  
Scope: Calendar inventory geography only (`isOutOfMarketLocation` / `evaluateInventoryCalendarEligibility`)  
Source audited (read-only): `[Benson] Shows — The Bowline Brothers`  
`sourceId`: `7fb75a94-1f95-4e5a-9b41-2cc012a3ea80`

**Calendar rows were not mutated. Full Calendar projection was not run. Bowline was not re-ingested. Extraction / shared-hub identity / T-Mobile / Downtown OP / Family Shows / OPCC / HPNA / CommUNITY Fest / Alexa / Discover / Today / ranking were not touched.**

Related prior work: [Bowline Calendar reconciliation](./benson-bowline-calendar-reconciliation-2026-08-20.md) left 27 active suggested rows under pre-fix geography (Delray / Fort Lauderdale / Indianapolis still “eligible”).

---

## Problem

After Bowline tour extraction + reconciliation:

| Metric (pre-fix) | Count |
| --- | ---: |
| Corrected performer-format content children | 40 |
| Active suggested Calendar rows | 27 |
| Rejected `wrong_city` | 7 (Chicago / Orlando only) |
| Rejected past | 6 |
| Venue-only active titles | 0 |
| Duplicate occurrences | 0 |

Eligibility still treated several **clearly non-KC** recovered cities as eligible because `CALENDAR_OUT_OF_MARKET_RE` / `isOutOfMarketLocation` did not recognize them:

- Delray Beach  
- Fort Lauderdale  
- Indianapolis  
- (also visible in the eligible bucket pre-fix: Fayetteville, Columbia — see ambiguity notes below)

---

## Investigation

### Path inspected

| Symbol | File |
| --- | --- |
| `isKcMetroLocation` | `services/core/src/ask-benson/url-geo.ts` |
| `isOutOfMarketLocation` | `services/core/src/ask-benson/url-geo.ts` |
| `isCalendarKcRelevant` | `services/core/src/creator-calendar/population/eligibility.ts` |
| `evaluateInventoryCalendarEligibility` | `services/core/src/creator-calendar/population/eligibility.ts` |
| Former `CALENDAR_OUT_OF_MARKET_RE` | `eligibility.ts` (removed; now delegates to shared helper) |

### Why Delray / Fort Lauderdale / Indianapolis passed

1. `placeCore` for a corrected child is roughly  
   `venue + locationName + businessName + …`  
   e.g. `Fort Lauderdale` + `Fort Lauderdale` + `Tin Roof Fort Lauderdale`.
2. Pre-fix `isOutOfMarketLocation` only matched a short national blacklist (Chicago, Orlando, Miami, …). **Fort Lauderdale / Delray Beach / Indianapolis were absent.**
3. `isCalendarKcRelevant(place, { watchlistDefault: false })` returned **true** for any non-empty blob that did **not** match that blacklist:
   ```ts
   return !(isOutOfMarketLocation(blob) || CALENDAR_OUT_OF_MARKET_RE.test(blob)) && blob.length > 0;
   ```
4. The `wrong_city` branch therefore never fired for those cities. Chicago / Orlando already matched the calendar regex and were correctly rejected.

### Persisted evidence on the 40 corrected children

Queried live `content_items` (`topic ILIKE 'The Bowline Brothers at %'`).

| Field | Typical value |
| --- | --- |
| `topic` | `The Bowline Brothers at {venue}` |
| `location_name` | City recovered from venue label **or** venue string when no city |
| `metadata.listingScrape.businessName` | Full venue label (e.g. `Tin Roof Fort Lauderdale`) |
| `metadata.extracted.city` / address / state | **Absent** on these rows |
| `listingScrape.venue` / `listingScrape.location` | **Absent** (only `businessName` + listing URL + confidence) |

**Source/detail page:** Squarespace `/shows` cards expose venue as H1; city is embedded in the venue string. No separate city/state/address block was available that we failed to persist. Stronger disambiguation (e.g. `, FL`) is **not** present in stored evidence.

### Pre-fix classification of every corrected child (conceptual)

| Location pattern | Examples | Pre-fix geo | Pre-fix eligibility |
| --- | --- | --- | --- |
| KC metro city | Kansas City | KC | eligible |
| Distinctive non-KC city in blacklist | Chicago, Orlando | out-of-market | `wrong_city` |
| Distinctive non-KC city **not** in blacklist | Delray Beach, Fort Lauderdale, Indianapolis, Cincinnati*, Detroit* | treated as “relevant” | eligible (*past nights still expired) |
| Ambiguous bare city | Columbia, Fayetteville | not OOM | eligible (should **not** guess) |
| Venue-only (no city) | Limitless Brewing, The Levee, The Brooksider, BBQ Fest | not OOM | eligible (should **not** guess) |

---

## Desired rule (implemented)

When content has a **confident, structured** geographic location that is **demonstrably outside** the Kansas City metro:

⇒ `evaluateInventoryCalendarEligibility` returns `wrong_city`.

Constraints honored:

- No Bowline venue hardcoding  
- No handful-of-cities patch only for this tour  
- No national geocoder / external APIs  
- Prefer existing shared geography utilities  
- Do **not** guess on venue-only labels  
- Do **not** blindly reject ambiguous bare city names (Columbia, Fayetteville, …)

### Discrimination target

| Evidence | Expected |
| --- | --- |
| Kansas City, MO / Kansas City, KS / KC metro suburb | eligible geography |
| Explicit Indianapolis / Fort Lauderdale / Delray Beach (distinctive) | `wrong_city` |
| Explicit `City, FL` / `City, IN` | `wrong_city` |
| Ambiguous venue, no city (Limitless Brewing) | preserve prior behavior (do not reject as wrong_city) |
| Ambiguous bare city without state (Columbia, Fayetteville) | do not blindly reject |

---

## Implementation

### `services/core/src/ask-benson/url-geo.ts`

`isOutOfMarketLocation` now returns true when **any** of:

1. **Distinctive out-of-market place name** matches expanded `OUT_OF_MARKET_RE`  
   - Includes prior cities (Chicago, Orlando, Miami, …) plus distinctive US places (Indianapolis, Cincinnati, Detroit, Fort Lauderdale, Delray Beach, …)  
   - **Omits** ambiguous multi-state bare names: columbia, springfield, fayetteville, franklin, madison, auburn, richmond, jackson, albany, …
2. **Non-home state evidence** via comma form only: `, FL`, `, IN`, … (not MO/KS)  
   - Avoids matching prose like “in Kansas City”
3. **`City, MO|KS` where city is not KC metro** (aligned with newsletter `KC_METRO_CITIES`)  
   - e.g. `Columbia, MO` / `Springfield, MO` → out-of-market  
   - `Overland Park, KS` / `Kansas City, MO` → in-market

KC metro short-circuit unchanged: if `isKcMetroLocation(text)` → never out-of-market.

### `services/core/src/creator-calendar/population/eligibility.ts`

- Removed local `CALENDAR_OUT_OF_MARKET_RE` duplicate list  
- Title / placeCore / display / curator-lead / market-token conflict checks all call `isOutOfMarketLocation`  
- Eligibility control flow otherwise unchanged (past / chrome / venue-as-title / Downtown OP neighborhood path untouched)

---

## Tests

Files:

- `services/core/src/ask-benson/url-geo.test.ts` (new)  
- `services/core/src/creator-calendar/population/eligibility.test.ts` (extended)

Command:

```bash
pnpm exec tsx --test \
  src/ask-benson/url-geo.test.ts \
  src/creator-calendar/population/eligibility.test.ts
```

Result: **41 pass / 0 fail**.

Covered requirements:

1. Explicit KC metro city/state remains eligible  
2. Explicit non-KC city/state (`Delray Beach, FL`) → `wrong_city`  
3. Bowline-style Fort Lauderdale with structured city field → `wrong_city`  
4. Indianapolis structured location → `wrong_city`  
5. Ambiguous venue (Limitless Brewing) not falsely rejected  
6. Ambiguous bare city (Columbia) not blindly rejected  
7. Downtown OP / Family Shows existing eligibility remains green  

---

## Read-only re-evaluation (40 corrected children only)

`NOW` = `2026-08-20T12:00:00.000Z`  
Authority: `normalizeInventoryItem` → `evaluateInventoryCalendarEligibility`  
**No Calendar writes.**

### Bucket counts

| Bucket | Count | Notes |
| --- | ---: | --- |
| Eligible (confident KC) | **7** | All Tin Roof Kansas City nights |
| Still ambiguous (eligibility `ok: true`, no geo guess) | **14** | Venue-only + bare Columbia/Fayetteville |
| `wrong_city` | **13** | Distinctive non-KC (+ prior Chicago/Orlando) |
| Past (`not_temporally_current`) | **6** | Cincinnati ×2, Detroit ×3, Brooksider Aug 7 |
| Other | **0** | — |
| **Total** | **40** | — |

### Eligible — confident KC (7)

| Title | locationName | event (UTC) |
| --- | --- | --- |
| The Bowline Brothers at Tin Roof Kansas City | Kansas City | 2026-08-29 |
| The Bowline Brothers at Tin Roof Kansas City | Kansas City | 2026-08-30 |
| The Bowline Brothers at Tin Roof Kansas City | Kansas City | 2026-10-31 |
| The Bowline Brothers at Tin Roof Kansas City | Kansas City | 2026-11-01 |
| The Bowline Brothers at Tin Roof Kansas City | Kansas City | 2026-11-26 |
| The Bowline Brothers at Tin Roof Kansas City | Kansas City | 2026-12-19 |
| The Bowline Brothers at Tin Roof Kansas City | Kansas City | 2026-12-20 |

### `wrong_city` (13)

| Title | locationName | Count |
| --- | --- | ---: |
| … Tin Roof Delray Beach | Delray Beach | 2 |
| … Tin Roof Fort Lauderdale | Fort Lauderdale | 2 |
| … Tin Roof Indianapolis | Indianapolis | 2 |
| … Tin Roof Orlando | Orlando | 3 |
| … Tin Roof Chicago | Chicago | 4 |

(Orlando / Chicago were already `wrong_city` before this change.)

### Past (6)

| Title | locationName | Detail |
| --- | --- | --- |
| … Tin Roof Cincinnati | Cincinnati | `not_temporally_current` ×2 |
| … Tin Roof Detroit | Detroit | `not_temporally_current` ×3 |
| … The Brooksider | The Brooksider | `not_temporally_current` ×1 |

Note: Cincinnati / Detroit would also match distinctive out-of-market names if they were future-dated; past wins first in eligibility order.

### Still ambiguous — eligibility still `ok: true` (14)

| Pattern | Titles / nights | Why not rejected |
| --- | --- | --- |
| Venue-only | Limitless Brewing ×3, The Levee ×1, The Brooksider ×2 (future), St Elizabeth’s BBQ Fest ×2 | No city; do not invent market |
| Bare city | Tin Roof Fayetteville ×3 | Multi-state name; no state evidence |
| Bare city | Harpos Columbia ×3 | Multi-state name; no state evidence |

If later source evidence adds `, AR` / `, MO` / `, SC` / etc., the comma-state rule would reject without further city hardcoding.

---

## Impact on currently active Bowline Calendar rows (no mutation)

Live query: `source_url ILIKE '%bowlinebrothers%'` + `planning_status = suggested` + not dismissed.

| Set | Count |
| --- | ---: |
| Active suggested on Bowline URL | 29 (includes 2 legacy non-performer titles) |
| Active linked to corrected performer-format content | **27** |
| Of those 27, **would become ineligible** under new geography | **6** |

### The 6 active rows that would fail eligibility now

| Title | location | startAt (UTC) | content id |
| --- | --- | --- | --- |
| The Bowline Brothers at Tin Roof Delray Beach | Delray Beach | 2026-09-04T03:00:00.000Z | `8b809eeb-00ff-46c6-a32c-dc48776962c5` |
| The Bowline Brothers at Tin Roof Delray Beach | Delray Beach | 2026-09-05T03:00:00.000Z | `de1d72cc-483b-4c74-9bfd-fcf4e257d7d5` |
| The Bowline Brothers at Tin Roof Fort Lauderdale | Fort Lauderdale | 2026-09-06T03:00:00.000Z | `4bd0e26f-5107-4433-915f-1fb5affbf262` |
| The Bowline Brothers at Tin Roof Fort Lauderdale | Fort Lauderdale | 2026-09-07T03:00:00.000Z | `c75b255d-9482-4d88-8755-9384cb4d239a` |
| The Bowline Brothers at Tin Roof Indianapolis | Indianapolis | 2026-11-07T04:00:00.000Z | `36a06174-a1fc-4963-b1b3-6f35345a34d9` |
| The Bowline Brothers at Tin Roof Indianapolis | Indianapolis | 2026-11-08T04:00:00.000Z | `7e099d21-f60a-43a4-9021-5af9befabb46` |

Hypothetical remaining active performer suggestions if cancelled: **21** (= 7 confident KC + 14 still-ambiguous).

Columbia / Fayetteville / Limitless / Levee / Brooksider / BBQ Fest active rows would **remain** under this rule set.

---

## Explicit non-goals / stop line

- Did **not** cancel or update Calendar rows  
- Did **not** run global Calendar projection / population backfill  
- Did **not** re-ingest Bowline or change extraction / local-day identity  
- Did **not** delete legacy ~80 venue-as-title content rows  
- Did **not** touch T-Mobile, Downtown OP, Family Shows, OPCC/HPNA, CommUNITY Fest, Alexa, Discover, Today, ranking  

---

## Follow-up (not this task)

1. Scoped Calendar cleanup: cancel the **6** active Delray / Fort Lauderdale / Indianapolis suggestions (and any display-only stale rows) using existing cancel paths — only when explicitly requested.  
2. Optional: if Bowline (or other tour) detail pages later expose durable `city` + `state`, persist them so ambiguous names like Columbia / Fayetteville can be resolved without expanding distinctive-city lists.  
3. Legacy Bowline venue-as-title content cleanup remains deferred.
