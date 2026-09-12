# Benson Calendar Admission Authority (2026-09-12)

**Branch:** `release/scout-expansion-2026-07-25`  
**Rule version:** `2026-09-12.admission.1`  
**Hard bans honored:** no email, Telegram, pitches, forms, billable AI; Watchlist extractors unchanged; outreach_emails last 2h = **0**.

## Root cause

Calendar suggestions were gated by a loose, path-specific stack (`evaluateInventoryCalendarEligibility`, Discover junk helpers, projection suppress) that still allowed:

- Out-of-market tours with truncated/hallucinated place fields (J. Cole / American Airlines + fake KC address)
- Cross-source duplicates (KC Nerd Con variants)
- Stale news year-rolls (93rd Plaza Art Fair article on 2026)
- Non-events (Science City General Admission) with machine `Starts:` ISO text
- Incomplete locations rendered as bare `kansas city`
- Projection suppress that could tombstone accepted keepers after display-title / dismissed-fingerprint collisions

Prior trust correction (`8ef49ca431322cab`) was necessary but not an authoritative admission boundary.

## Ingestion paths found (all must pass admission)

| Path | Write surface | Admission wiring |
| --- | --- | --- |
| Inventory projection | `ensureCalendarInventoryProjections` → `evaluateInventoryCalendarEligibility` | `evaluateCalendarAdmission` via inventory candidate |
| Instagram curator leads | same projection / `candidateFromCuratorLead` | admission + metadata stamp |
| Watchlist scout promote | `scout-promote.ts` → `content_items` | admission before persist |
| Read list | `listCalendarItems` | `calendarAdmissionAllowsDisplay` (accepted + current rule only) |
| Manual / API create | `createCalendarItem` | user/Kellie rows; suggestions still filtered at read |
| Newsletter / Ask Benson / scrapers / Eventbrite / Wix / etc. | land in `content_items` then projection | same inventory admission |

Adapters do **not** duplicate rules; they feed the central service.

## Architecture

```
candidate
  → evaluateCalendarAdmission (geo / temporal / eventness / completeness / presentation)
  → lifecycle: accepted | quarantined | rejected | merged_duplicate
  → only accepted become/remain Calendar-visible suggestions
  → decision stored in metadata.calendarAdmission { reasonCodes, evidence, ruleVersion, timestamps, factStatus, calendarStatus, editorialStatus }
```

Entity merge: `admissionEntitiesMatch` + `dedupePopulationCandidates` (preserves merged source ids).

Defense in depth: write-time gates + read-time refuse non-accepted / obsolete rule_version / machine-text leaks. Bypass detector test fails if write paths skip admission.

## Rule definitions (summary)

1. **Geographic** — affirmative KC evidence (venue/address/metro locality/established venue/verified KC Watchlist curator). Confirmed OOM / known arenas / international → `outside_service_area`. Bare `kansas city` → `location_unverified`.
2. **Temporal** — year-bearing evidence; reject news ordinal annuals without year (`stale_source` / `date_year_unverified`).
3. **Eventness** — reject standing GA / hours / membership (`not_a_discrete_event`).
4. **Completeness** — title, start, URL/attribution.
5. **Entity resolution** — title normalize (Nerdcon/Nerd Con), day+venue tolerance, merge evidence.
6. **Presentation** — strip `Starts:` ISO / scaffold labels; empty description preferred over raw metadata.
7. **Statuses** — `factStatus` ≠ `calendarStatus` ≠ `editorialStatus`.

## Migration counts

### Full-window re-eval (first `--apply`, ~989 active calendar rows)

| | accepted | quarantined | rejected | merged_duplicate | candidate |
| --- | --- | --- | --- | --- | --- |
| **Before** | 3 | 0 | 1 | 0 | 985 |
| **After** | 226 | 412 | 332 | 19 | 0 |

- Dismissed ineligible suggestions: **760**
- Merged pairs: **19** (incl. KC Nerd Con ← KC Nerdcon 2026)
- Protected conflicts reported (not mutated): **3**

### Second pass (suggested-only stamp after first cleanup)

| | accepted | quarantined | rejected | merged |
| --- | --- | --- | --- | --- |
| Before | 229 | 0 | 0 | 0 |
| After | 178 | 37 | 13 | 1 |
| Dismissed | 48 | | | |

## Named failure dispositions

| Case | Disposition | Reason |
| --- | --- | --- |
| J. Cole Fall-Off (Dallas / American Airlines / Berlin) | **rejected** (not Calendar-visible) | `outside_service_area` |
| KC Nerdcon 2026 + KC Nerd Con | **one accepted** survivor; duplicate **merged** | `duplicate_event` on absorbed |
| 93rd annual Plaza Art Fair (2024 news) | **rejected** | `stale_source` |
| 95th Plaza (OpenAI hub scrape) | **rejected** | `excluded` / `openai_hub_url` (weak source; class gated) |
| Science City General Admission | **rejected** | `not_a_discrete_event` |
| Hike with a Naturalist | **accepted** with recovered venue **Lakeside Nature Center** (bare `kansas city` alone would quarantine) | `ok` |
| Original Sin (@hookedonkc) | **accepted** | `ok` (`kc_watchlist_curator`) |

## Two-run idempotency (Sep 12–Oct 20 window)

After suppress-guard fix:

```json
{
  "run1": { "created": 0, "updated": 124, "suppressed": 0 },
  "run2": { "created": 0, "updated": 124, "suppressed": 0 }
}
```

No duplicate creates; no re-suppress of accepted keepers.

## Tests

- Admission fixtures + gates + bypass detector
- Eligibility / merge / scout-promote / sync (incl. accept-admission suppress guard)
- Focused suite: **137/137 pass**

## Deploy

- Script: `pnpm benson:deploy-local`
- Fingerprint: **MATCH** `0fe80c09888a4ac6` (api / dashboard / workers / source — new, not reused `8ef49ca431322cab`)
- Commits: `6ec6167` (+ type-fix follow-ups `ec1dc14`, `e03a5b6`, `3b07ccc`)

## Regressions / repairs during close-out

- Projection previously tombstoned accepted rows when a dismissed identity collision blocked upsert → fixed live-match preference + do-not-suppress current accepted admissions.
- Display title “Events Archive | …” no longer replaces usable event titles.
- Original Sin fingerprint had been stolen by a wrong “New Dance Partners” merge → fingerprint repaired; lead re-linked.

## Limitations

- 95th Plaza remains Calendar-ineligible while sourced only via OpenAI hub URL; a first-party Plaza listing with affirmative place would admit.
- VERIFIED KC Watchlist curators without venue are admitted via curator locality evidence — still reject OOM titles/places.
- Read filter requires stamped `calendarAdmission` on suggestions; legacy unstamped suggestions stay hidden until migration/projection.

## Safety

- No outreach emails / Telegram / pitches / forms exercised by this work.
