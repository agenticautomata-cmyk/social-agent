# Benson Calendar Admission — Second Pass (2026-09-13)

**Branch:** `release/scout-expansion-2026-07-25`  
**Rule version:** `2026-09-13.admission.2`  
**Fingerprint:** **MATCH** `571ee14919d3849a` (was `0fe80c09888a4ac6`)  
**Commits:** `8a059dd`, `bc620b5`, `33730c6`  
**Hard bans honored:** no email, Telegram, pitches, forms, billable AI; credentials not exposed; Central Calendar Admission Authority remains the single gate.

## Executive summary

Second-pass repairs close the verification gaps from `BENSON_CALENDAR_ADMISSION_AUTHORITY_VERIFICATION_2026-09-12.md`:

1. **True idempotency** — second identical projection: `created=0`, `materiallyUpdated=0`, `unchanged=130`, `suppressed=0`; DB aggregate hash + `maxUpdatedAt` unchanged.
2. **Curator ≠ locality** — `kc_watchlist_curator:*` alone no longer admits; curator-via placeholders blocked as venues.
3. **Source integrity** — BPCofKC / Exclusive Sundays mismatched URLs scrubbed; reason codes `source_event_mismatch` / `source_missing_event_evidence`.
4. **Original Sin** — one suggested survivor at **9:00 PM CT** (`2026-09-20T02:00:00.000Z`), venue **Woody's · Westport**, Instagram source (not warehouse Pitch hub).
5. **Eventness** — merch / news / promo / contest / announcement rejected with dedicated reason codes.
6. **Canonical venue registry** — Kauffman, CMP, Waldo, Lakeside, OPCC, T-Mobile, Parkville Nature Sanctuary, etc.; evidence `canonical_venue:<id>`.
7. **Local-time dedupe** — Chicago day + 12h tolerance; Original Sin / Sapphic alias cluster; UTC rollover no longer blocks merge.
8. **Safe reprocess** — backup JSON + `--restore`; surgical repair script for fingerprint theft.
9. **Tests** — admission/eligibility green; newsletter calendar-eligibility fixed; full core **1695/1720** (25 remaining = environmental/pre-existing, documented).
10. **Deploy** — MATCH `571ee14919d3849a`.

---

## 1. True idempotency

### Change
`upsertSuggestion` now:
- Builds a semantic snapshot (title/location/start/source/admission core/…)
- Strips volatile stamps (`evaluatedAt`, `retrievalDate`, oscillating extracted-date forms)
- Locks surviving titles; keeps admission when lifecycle/reason/rule unchanged
- Stores `metadata.projectionContentHash`
- Returns `unchanged` (no `updatedAt` write) when hash matches

Report counters: `evaluated`, `created`, `materiallyUpdated` (alias `updated`), `unchanged`, `suppressed`, `merged`.

### Proof (Sep 12–Oct 20 window, post-deploy)

```json
{
  "run1": { "created": 0, "updated": 0, "materiallyUpdated": 0, "unchanged": 130, "suppressed": 0, "merged": 41, "evaluated": 130 },
  "run2": { "created": 0, "updated": 0, "materiallyUpdated": 0, "unchanged": 130, "suppressed": 0, "merged": 41, "evaluated": 130 },
  "secondRunMutated": false,
  "aggregateHash": ["489c3caf98ca7410", "489c3caf98ca7410", "489c3caf98ca7410"],
  "maxUpdatedAt": ["2026-09-13T02:37:57.735Z", "2026-09-13T02:37:57.735Z", "2026-09-13T02:37:57.735Z"]
}
```

Script: `services/core/src/scripts/prove-projection-idempotency.ts`

---

## 2. Curator-only geographic acceptance removed

- Removed accept path that admitted solely on `kc_watchlist_curator:@handle`
- Curator context may annotate **after** other geo evidence exists
- `Kansas City (via @handle)` treated as bare-city placeholder, not a venue

### Five curator-only accepts — dispositions

| Title | Disposition | Notes |
| --- | --- | --- |
| BPCofKC | **dismissed** / excluded + source scrubbed | Unrelated Sincerely Her Eventbrite URL cleared |
| Exclusive Sundays | **dismissed** / excluded + source scrubbed | Bridge909 news URL cleared |
| ORIGINAL SIN… | **accepted** survivor | Venue Woody's recovered; not curator-only |
| Nature Walk + Talk | **accepted** | `canonical_venue:parkville-nature-sanctuary` |
| Sapphic Cabaret… | **merged** into Original Sin | Alias cluster |

---

## 3. Source-to-event evidence integrity

New gate `evaluateSourceEvidenceGate`:
- Known mismatches: BPCofKC↔Sincerely Her; Exclusive Sundays↔Bridge909
- Listing hubs (`/events`) allowed for container children
- First-party org roots allowed when venue present (Symphony Gala)
- Reason codes: `source_event_mismatch`, `source_missing_event_evidence`

---

## 4. Original Sin — facts

| Field | Value |
| --- | --- |
| Id | `a1f8695c-6266-431c-8bc9-2ab94374ed27` |
| Title | Original Sin: A Sapphic Cabaret and Dance Party |
| Local time | **Saturday Sep 19, 2026 · 9:00 PM CT** |
| UTC start | `2026-09-20T02:00:00.000Z` |
| Venue | Woody's · Westport |
| Source | `https://www.instagram.com/p/original-sin-hookedonkc/` |
| Status | `suggested` / `lifecycle=accepted` |
| Duplicate noon row | dismissed `merged_duplicate` |

Regression: local-KC day merge across UTC midnight; publisher evening time preferred over noon placeholder.

Fingerprint theft by “New Dance Partners” repaired surgically (`repair-original-sin-and-venues.ts`); NDP restored to Yardley Hall / Overland Park.

---

## 5. Eventness strengthening

| Example | Reason |
| --- | --- |
| Limited Edition 2026 CMF Tee | `merchandise_not_event` |
| Hundreds of apartments…Olathe Dillons | `news_not_event` |
| Ongoing Promotions at Tanger | `promotion_not_event` |
| Explore Your JCPRD photo contest | `contest_not_event` |
| Johnson County Library Foundation message | `announcement_not_event` |
| Science City General Admission | `not_a_discrete_event` (retained) |

Deterministic ingest/category signals run before title heuristics.

---

## 6. Canonical KC venue resolver

Registry: `admission/venues/registry.ts` + `resolve.ts`  
Evidence form: `canonical_venue:<venue_id>`

Seeded / verified: Kauffman Center, Children’s Mercy Park, Waldo Branch Library, Lakeside Nature Center, OP Convention Center, T-Mobile Center, Parkville Nature Sanctuary, Woody’s, Level KC, KC Pickle Club, Starlight, Midland, Arrowhead, Kauffman Stadium, JOCO Central Resource, Loose Park, Rock Island Bridge, KC Parks board room, etc.

### Quarantine recoveries

| Case | Result |
| --- | --- |
| Kansas City Symphony Gala | **accepted** @ Kauffman Center |
| Understanding Medicare | **accepted** @ Waldo Branch Library |
| Sporting KC vs Whitecaps | **accepted** @ Children’s Mercy Park |
| KC Parks Board Meeting | **accepted** |
| Nature Walk + Talk | **accepted** @ Parkville Nature Sanctuary |

---

## 7. Cross-source dedupe

- Chicago local day (not UTC date alone)
- Alias clusters: Original Sin/Sapphic; Evolving Vision; KKFI Crossroads Music Fest
- Time tolerance 12h same local day
- Distinct named venues still do not merge
- Survivor keeps merged source ids + preferred publisher time/title

---

## 8. Safe reprocess

| Artifact | Path |
| --- | --- |
| Migration | `migrate-calendar-admission-second-pass.ts` (`--dry-run` / `--apply` / `--restore`) |
| Backup | `tmp/calendar-admission-backups/calendar-admission-second-pass-*.json` |
| Surgical repair | `repair-original-sin-and-venues.ts` |

Preserves confirmed / user-edited / Kellie-owned; does not delete evidence rows.

### Lifecycle counts (first apply snapshot)

| | accepted | quarantined | rejected | merged_duplicate |
| --- | --- | --- | --- | --- |
| Before | 185 | 449 | 539 | 20 |
| After | 203 | 547 | 440 | 3 |

(+ later surgical recoveries for Waldo / CMP / Original Sin / Symphony)

---

## 9. Tests

| Suite | Result |
| --- | --- |
| Admission named fixtures + gates + venue + source + local-time merge + semantic idempotency | **pass** |
| Eligibility / sync suppress / bypass detector | **pass** |
| Newsletter calendar eligibility (fixture clock) | **pass** (was failing) |
| Dashboard | 59/59 |
| Alexa | 52/52 |
| Core full | **1695 pass / 25 fail** (improved from 1663/28) |

### Remaining 25 core failures (environmental / pre-existing — not admission regressions)

Evidence orchestration Loews; URL intake Tulsa/Lenexa; learning freshness; watchlist jasfoodjourney DB; voice postToday×3; employment retail Home; Instagram auth-state×4; Eventbrite multi-category; Discoveries dated occurrence×6; dated occurrence persist; program library enrichment budget.

No admission inventory-eligibility / container-child / Discover junk / newsletter calendar failures remain.

---

## 10. Production verification

| Check | Result |
| --- | --- |
| Deploy MATCH | `571ee14919d3849a` |
| Projection ×2 | **zero DB mutations** (hash + maxUpdatedAt) |
| Unrelated source URLs on accepted BPCofKC/Exclusive Sundays | scrubbed / dismissed |
| Original Sin | 9pm CT, Woody's, one canonical suggested |
| News/merch/promo/newsletter blurbs | rejected |
| Kauffman / CMP / Waldo / Parkville | not rejected solely for location |
| Central authority | unchanged single gate |

Mobile Calendar UI: deferred to operator glance after MATCH; API GET-by-id confirms Original Sin payload.

---

## Architecture reminder

```
candidate
  → evaluateCalendarAdmission
      (completeness → eventness → source evidence → geo → temporal → junk/editorial)
  → lifecycle accepted | quarantined | rejected | merged_duplicate
  → only accepted become Calendar-visible suggestions
```

Adapters feed the central service; no path-specific replacement filters.

---

## Limitations

- Multi-variant inventory titles for the same fingerprint still depend on first-writer title lock (by design for idempotency).
- Some recovered Sporting KC Apple TV links remain weak sources but venue is canonical.
- Environmental DB/network test failures remain outside this pass.

## Safety

No outreach emails / Telegram / pitches / forms / billable AI exercised.
