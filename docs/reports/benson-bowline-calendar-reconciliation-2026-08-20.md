# Bowline Brothers scoped Calendar reconciliation

Date: 2026-08-20  
Source: `[Benson] Shows — The Bowline Brothers`  
`sourceId`: `7fb75a94-1f95-4e5a-9b41-2cc012a3ea80`

**Full Calendar projection was not run. Bowline was not re-ingested. Extraction / shared-hub identity / eligibility code were not changed. Legacy venue-as-title `content_items` were not deleted.**

---

## Frozen (untouched)

T-Mobile, Downtown OP, Family Shows, OPCC / HPNA / CommUNITY Fest, Alexa / Discover / Today / ranking, confirmed / user-edited / operator-owned rows (none found on this source).

Fingerprint after mutation vs before this session’s freeze check: T-Mobile **31**, Downtown OP **12**, Family Shows **22** — **unchanged**.

---

## Phase 1 — read-only mapping (proven before mutation)

| Set | Count |
| --- | --- |
| Corrected performer-format content (`The Bowline Brothers at …`) | **40** |
| Distinct local-day keys | **40** |
| Legacy venue-as-title / other content on source | **80** (not deleted) |
| Active Bowline Calendar rows (all `suggested`) | **53** |
| Operator-owned / confirmed / user-edited | **0** |
| Calendar rows pointing at deleted UTC-key duplicates | **0** |

Mapping rule: same source + **LOCAL event day** from extracted `eventDate` (not UTC day of `startAt`) + venue semantics from card / linked content. **53 / 53** old suggestions had **exactly one** corrected counterpart. **0** unmapped. **0** many-to-many.

### Eligibility on the 40 corrected children

`evaluateInventoryCalendarEligibility` is source of truth. Geography rules were **not** expanded.

| Bucket | Count | Notes |
| --- | --- | --- |
| Eligible (current rules) | **27** | Includes KC (`Tin Roof Kansas City`) **and** cities not in `CALENDAR_OUT_OF_MARKET_RE` (Delray Beach, Fort Lauderdale, Indianapolis, Fayetteville, Columbia, etc.) |
| Rejected `wrong_city` | **7** | Chicago ×4, Orlando ×3 — names match existing out-of-market regex |
| Rejected other | **6** | `not_temporally_current` / past: Detroit Aug 14–16, Cincinnati Jul 31 / Aug 1, Brooksider Aug 7 |
| Ambiguous (venue, no city on card) | **9** | Limitless Brewing, The Levee, The Brooksider, BBQ Fest. **Did not invent city.** Current eligibility: **8 eligible**, **1 past** (`not_temporally_current`) |

Ambiguous rows were **not** overridden. Eligible ambiguous performances were kept; the past Brooksider night was cancelled with other past rows.

---

## Phase 2 — reconcile

### Semantics

`UpdateCalendarItemInput` **omits** `sourceRecordId` (cannot re-point through that API). `upsertSuggestion` only re-points when the existing row is **not** already `content_item`.

Safe path used (no application-code change):

1. **Reuse** existing suggested rows: scoped Drizzle update of title / `startAt` / `allDay` / location / `sourceRecordId` / fingerprint. **Do not overwrite `idempotencyKey`** when another row already holds that unique key (first pass hit `creator_calendar_items_idempotency_key_key`; resumed without copying colliding keys).
2. **Cancel** via existing `updateCalendarItem({ planningStatus: 'cancelled' })` — no dismissal fingerprints.
3. **Create** via existing `createCalendarItem` only for eligible children with no remaining suggested counterpart.

### Mutation totals (this session)

| Action | Count |
| --- | --- |
| Old suggestions reused + repointed to corrected content | **41** (13 then 28 across two passes) |
| Cancelled | **33** |
| Replacement rows created | **7** (`createdAt` `2026-08-20T03…`; eligible children that had no leftover suggested row after cancels) |
| Operator-owned skipped | **0** |

Cancel reasons (combined):

| Reason | Approx. |
| --- | --- |
| `wrong_city` (Chicago / Orlando) | 7 content children → their mapped suggestions cancelled |
| `not_temporally_current` (past nights) | 6 children |
| Duplicate Calendar occurrence (same title + local day + venue) | 14 + earlier extras from chrome/`Shows —` parent titles mapping onto the same child |

Chrome titles such as `Shows — The Bowline Brothers` still mapped by **linked content venue + local day**, then either repointed or cancelled as duplicates of the performer-format row.

---

## Phase 3 — after

| Check | Result |
| --- | --- |
| Active Bowline Calendar | **27** (all `suggested`) |
| Cancelled Bowline Calendar | **33** |
| Rows on this source (active+cancelled) | **60** (53 historical + 7 creates) |
| Active rows tied to performer-format content | **27 / 27** |
| Active rows tied to legacy venue-as-title content | **0** |
| Active venue-only titles (Tin Roof Delray Beach, Limitless Brewing, The Levee, …) | **0** |
| Active Chicago / Orlando | **0** |
| Duplicate title + local day + venue | **0** |
| Consecutive local nights still separate | yes (e.g. Delray Sep 3+4, FTL Sep 5+6, KC Aug 28+29 / Oct 30+31 / Dec 18+19, Indy Nov 6+7) |
| Pointers to deleted UTC-key content | **0** |
| Active failing current eligibility | **0** |
| Legacy venue-as-title **content** rows | **still present (~80 on source including non-calendar); not deleted** |
| Code changed | **No** |

Active titles are all `The Bowline Brothers at {venue}` with corrected `startAt` / location from content.

---

## Why 27 Calendar rows, not 40

The 40 durable content children remain. Calendar only keeps **current eligibility**:

- 27 eligible → **27** active suggestions  
- 7 `wrong_city` → no active Calendar  
- 6 past → no active Calendar  

That is existing eligibility, not a new geography system.

---

## Follow-up (not this task)

Delete or archive the ~80 legacy non-performer Bowline `content_items` now that **no active Calendar row references them**. Some cancelled Calendar rows still point at legacy ids; those can stay cancelled until a later content cleanup that also considers cancelled `source_record_id`s.
