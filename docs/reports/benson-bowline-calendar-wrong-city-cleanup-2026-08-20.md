# Bowline Calendar cleanup — wrong_city + orphaned legacy (scoped)

Date: 2026-08-20  
Source: `[Benson] Shows — The Bowline Brothers`  
`sourceId`: `7fb75a94-1f95-4e5a-9b41-2cc012a3ea80`

**No code changes. No full Calendar projection. No Bowline re-ingest. No `content_items` deletes. No other sources touched. Ambiguous-location Bowline performances left active.**

Authority: current `evaluateInventoryCalendarEligibility` + existing `updateCalendarItem({ planningStatus: 'cancelled' })` (no dismissal fingerprint).

Related: [geography eligibility report](./benson-calendar-geography-eligibility-2026-08-20.md).

---

## Before

| Set | Count |
| --- | ---: |
| Active suggested Bowline (`source_url` bowlinebrothers) | **29** |
| Linked to corrected performer-format content | **27** |
| Extra / non-performer active | **2** |

---

## Task 1 — cancel six proven `wrong_city` rows

Each linked content child was re-evaluated. Cancel only when `detail === 'wrong_city'`, status `suggested`, and no `user_edited_at`.

| Local night | Title | content id | calendar id | Decision | Cancelled |
| --- | --- | --- | --- | --- | --- |
| Sep 3 | … Tin Roof Delray Beach | `8b809eeb-…` | `3bf4bf8f-…` | `wrong_city` | yes |
| Sep 4 | … Tin Roof Delray Beach | `de1d72cc-…` | `e1dafa28-…` | `wrong_city` | yes |
| Sep 5 | … Tin Roof Fort Lauderdale | `4bd0e26f-…` | `a8131ab8-…` | `wrong_city` | yes |
| Sep 6 | … Tin Roof Fort Lauderdale | `c75b255d-…` | `b8476203-…` | `wrong_city` | yes |
| Nov 6 | … Tin Roof Indianapolis | `36a06174-…` | `0278f3b5-…` | `wrong_city` | yes |
| Nov 7 | … Tin Roof Indianapolis | `7e099d21-…` | `907904a7-…` | `wrong_city` | yes |

All six: `planning_status → cancelled`, `dismissed_at` null (no fingerprint). Content rows preserved.

**Not touched (ambiguous by design):** Kansas City, Columbia, Fayetteville, Limitless Brewing, The Levee, The Brooksider, St Elizabeth’s BBQ Fest.

---

## Task 2 — two extra active Bowline rows

### Extra A — legacy venue/show title

| Field | Value |
| --- | --- |
| calendar id | `5b4bbe34-5524-4596-90e6-50f72027f828` |
| title | `Show at Tin Roof Cincinnati` |
| sourceRecordId | `6faf642c-ebf6-43c4-a488-88587217a142` |
| linked content title | **missing** (`content_items` row deleted) |
| local start | 2026-07-31 22:00 America/Chicago |
| planningStatus | was `suggested` |
| classification | legacy non-performer (`Show at …`) |
| eligibility | cannot evaluate — source record deleted |
| same-day corrected child | `The Bowline Brothers at Tin Roof Cincinnati` (`15060924-…`, identical `start_at`) |

**Proven stale:** orphaned pointer + same local occurrence as a corrected Cincinnati child. **Cancelled.**

### Extra B — parent/chrome title

| Field | Value |
| --- | --- |
| calendar id | `27c5f5bc-4f1c-4ccd-be28-d2cf5e42827b` |
| title | `Shows — The Bowline Brothers` |
| sourceRecordId | `e652643b-1228-403f-a740-c7a4b9d20a1f` |
| linked content title | **missing** (deleted) |
| local start | 2026-08-07 21:00 America/Chicago |
| planningStatus | was `suggested` |
| classification | parent/chrome listing title |
| eligibility | cannot evaluate — source record deleted |
| same-day corrected child | `The Bowline Brothers at The Brooksider` (`c1f88ec2-…`, identical `start_at`) |

**Proven stale:** orphaned chrome row on the only corrected local day (Brooksider Aug 7). **Cancelled.**  
(Calendar `location` still said `Kansas City` — leftover bad metadata; occurrence identity is local day + exact `start_at` match to the corrected child.)

---

## Verify after

| Check | Result |
| --- | --- |
| Active Bowline before | **29** |
| Wrong-city cancelled | **6** |
| Extra legacy/chrome cancelled | **2** |
| Active Bowline after | **21** |
| Active corrected performer rows after | **21** |
| Active `wrong_city` (re-eval) | **0** |
| Duplicate local-day + venue + title | **0** |
| Ambiguous-location rows | **14 unchanged** (still suggested) |
| KC rows | **7 unchanged** |
| Confirmed / operator / user-edited touched | **0** |
| Dismissal fingerprints written | **0** |
| Code / projection / re-ingest / content deletes | **none** |

### Remaining active mix (21)

| Bucket | Count |
| --- | ---: |
| Confident KC (Tin Roof Kansas City) | 7 |
| Ambiguous eligible | 14 |

Ambiguous still active: Columbia ×3, Fayetteville ×3, Limitless Brewing ×3, The Levee ×1, The Brooksider ×2 (future), St Elizabeth’s BBQ Fest ×2.
