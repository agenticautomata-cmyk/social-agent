# Benson Openings Radar — 2026-09-21

**Branch:** `release/scout-expansion-2026-07-25`  
**Commit:** `6724b2c`  
**Deploy fingerprint:** **MATCH `6fced54ecd0fa8d7`**  
**Public:** https://benson.kckellie.com/openings · **API:** https://api.kckellie.com/api/openings-radar  
**Host:** mappy (memory-conscious deploy; Playwright storm skipped; KellieCam disabled)

**Prior work preserved:**
- Editorial opportunity MATCH `893f75d8e3511427`
- Veronica Beard opportunity `1315fdc4-0d60-44bb-a9a0-3e3fb5f74902` — **intact, not duplicated**
- Opportunity research MATCH `f772fc9fea395fc7`

---

## Verdict

Openings Radar is live as a first-class Discover destination. The KCInsiders **BIG LIST** fixture path created **10 distinct establishment/location records**, selective Opportunities (8) and qualifying Events (3), with **zero duplicate businesses/locations/opportunities/events on repeat ingest**, and **≥3 follow-up updates** that modified existing records (Alice → soft_open, Angry Chickz → delayed, Blurred → delayed/mid-November, Donutology → exact grand opening Oct 15).

---

## Root cause

Editorial email opportunity discovery could extract single-business openings (e.g. Veronica Beard) but:

1. There was **no first-class destination** for establishment openings/relocations/soft openings.
2. Roundup articles were not split into **many location records**.
3. Success was often defined as Calendar occurrences or a single Opportunity — establishments disappeared into generic paths.

---

## Ingestion path used

| Preference order | Used for acceptance |
|---|---|
| Structured article/feed | Public Substack “BIG LIST” slug **not published** yet (archive/search miss) |
| Complete email HTML | Not present in `discovery_email_messages` for this title |
| Public Substack HTML | Teased in Taco Trade-Off post; full BIG LIST not live |
| Fixture → production ingest | **Used** — same `ingestOpeningRoundup` path as email/article (`force: true`, channel `fixture`) |

Live newsletter pipeline now also calls `processOpeningsFromEditorialEmail` whenever monitored mail looks like an openings roundup.

---

## Schema / migration

Migration `91_openings_radar.sql`:

- `opening_businesses` — business identity (`normalized_key`)
- `opening_locations` — location + lifecycle + dates + research + decisions
- `opening_status_transitions` — historical status changes
- `opening_evidence` — append-only evidence
- `opening_alerts` — fingerprint-deduped alerts
- `opening_ingest_runs` — run reports

Applied via `pnpm migrate:openings-radar`.

---

## Files changed (high level)

- `services/core/src/openings-radar/**` — parser, identity, dates, lifecycle, persist, promote, pipeline, list, actions, backfill, fixtures, tests
- `services/core/src/newsletter-intelligence/pipeline.ts` — wire Openings Radar into editorial email path
- `services/core/src/schema.ts` — Drizzle tables
- `services/api/src/routes/openings-radar.ts` + `server.ts`
- `dashboard/app/openings/**` — Discover UI (list/cards/timeline/map filters)
- `dashboard/lib/opportunities-ui.ts` / `nav-config.ts` — nav entry
- `db/migrations/91_openings_radar.sql` + `db/init/91_openings_radar.sql`

---

## All 10 Opening Radar records

| # | Business | Location ID | Address | Status | Expected / exact | Opportunity | Event |
|---|---|---|---|---|---|---|---|
| 1 | Alice Scooper's Ice Cream Co. | `63e98b65-e754-4b98-ae9d-e70cdc0f464b` | 906 W. 39th St | soft_open | opening soon (no exact) | create first_look `34e42ed2-…` | skip (soft open) |
| 2 | Angry Chickz | `7bb1676e-6464-44df-bbe3-c515253e2fbe` | 14995 W. 119th St, Olathe | delayed | December 2026 | **skip** (chain retained on radar) | skip |
| 3 | The Bad Cat | `efce1c3f-71cc-45b6-b954-bfbc36a905fd` | 1220 W. 103rd St | site_identified | **2026-09-25** | create `73f1dbea-…` | **create** `e1079eae-…` |
| 4 | Bam Bird Social | `d1f5a7bb-58a7-440b-a5c9-57629d186da6` | 1512 N.W. Mock Ave, Suite C, Blue Springs | grand_opening_scheduled | grand **2026-10-03** | create grand_opening `53fe97d5-…` | **create** `e1562cac-…` |
| 5 | Blurred Bar | `06da7e6c-409a-4769-9f77-6b2b63aeb881` | 4149 Pennsylvania Ave, Westport | delayed | mid-November 2026 (no exact) | create `05a6b58b-…` | skip |
| 6 | Bojangles | `ed4ed657-5edd-452f-b5c6-773af9795231` | 12005 Metcalf Ave, Overland Park | site_identified | **2026-11-10** | **skip** (thin chain) | skip (projected open ≠ public event) |
| 7 | Boutique Collective | `1c1eb9c4-9aa7-4563-a584-5be3a1b3343d` | 5701 W. 135th St, Overland Park | opening_soon | opening soon | create `68d4cbf5-…` | skip |
| 8 | Charlie D's Seafood and Chicken | `69403034-d704-4263-a69f-d94ada349213` | 1124 Oak St | site_identified | mid-October 2026 | create `be3d788b-…` | skip |
| 9 | Donutology | `f504357b-e928-4a31-985d-dd1d708e22da` | 2450 Grand Blvd, Suite 121, Crown Center | grand_opening_scheduled | grand **2026-10-15** (after update) | create `e9ce4ba9-…` | **create** `01cb2222-…` |
| 10 | Fleet Feet | `6e00adbe-ce06-4aa5-87fb-24a90bc33d3b` | 314 W. 63rd St, Suite B, Brookside | site_identified | early November 2026 | create `d75951ad-…` | skip |

**Business IDs (10):** one per establishment; Angry Chickz expansion text retained on the Olathe location (`other area locations pending`) without minting a second location.

---

## Enrichment / research

At create time each location receives editorial-seeded research with honest labels:

- address / opening labels → `editorial_supported`
- website / phone / email / contact form / socials / programs → `not_found`
- `autoOutreach: false` always

No contacts invented. Bounded web research can be triggered later via existing Opportunity Research on promoted opportunities.

---

## Opportunity / Event decisions (summary)

- **Opportunities created:** 8 (Alice, Bad Cat, Bam Bird, Blurred, Boutique, Charlie D’s, Donutology, Fleet Feet)
- **Retained on radar only:** Angry Chickz (chain), Bojangles (thin signals)
- **Events created:** 3 — Bad Cat (2026-09-25), Bam Bird grand opening (2026-10-03), Donutology grand opening after exact date confirmed (2026-10-15)
- Mid-October / early-November / Halloween-weekend / opening-soon **never** become fabricated exact Event dates

---

## Duplicate-suppression / second-run proof

| Run | Locations created | Updated/merged | Opportunities created | Events created |
|---|---|---|---|---|
| First | **10** | 0 | 8 | 2 (+1 later on Donutology update) |
| Second (same BIG LIST) | **0** | 10 | **0** | **0** |

Evidence rows retained/appended (all 10 locations have ≥2 evidence fragments after updates).

---

## Follow-up update proofs (≥3)

| Target | Location ID | Result |
|---|---|---|
| Alice Scooper’s | `63e98b65-…` | updated → `soft_open` (not new record) |
| Angry Chickz | `7bb1676e-…` | updated → `delayed`, label December 2026 |
| Blurred Bar | `06da7e6c-…` | updated → `delayed`, honest `mid-November 2026` (exact cleared; no invented day) |
| Donutology | `f504357b-…` | updated → exact grand opening `2026-10-15` + Event candidate |

Status transitions recorded historically (`opening_status_transitions` = 13 rows).

---

## UI verification

| Check | Result |
|---|---|
| Nav “Openings Radar” under Daily/Discover | shipped |
| https://benson.kckellie.com/openings | **200** |
| http://127.0.0.1:3000/openings | **200** |
| GET `/api/openings-radar` | **total: 10** |
| Views | list / cards / timeline / map (coords pending) + filters/search/sort |
| Actions | dismiss, mark opened/delayed, view evidence, open source, opportunity link |

---

## Tests / typecheck / build

| Check | Result |
|---|---|
| `src/openings-radar/openings-radar.test.ts` | **14/14 pass** |
| Core `tsc --noEmit` | Pre-existing errors elsewhere; **no openings-radar errors** |
| Dashboard production build | OK (includes `/openings`) |
| Deploy parity | **MATCH `6fced54ecd0fa8d7`** |

---

## Remaining limitations

1. Public Substack post titled “The BIG LIST…” was **not findable** in archive/email at acceptance time — fixture body exercised the **same production ingest path**; when Joyce publishes, email/article fetch will attach without recreating the 10.
2. Coordinates / map pins not geocoded yet (addresses shown).
3. Automatic deep web research per opening is seeded only; full Opportunity Research remains on-demand for promoted cards (memory-safe).
4. Memory-conscious deploy skipped Playwright ensure + full deploy-local test battery after focused openings tests (host ~5G/7.6G with swap pressure post-reboot).

---

## Success criteria checklist

- [x] Visible Openings Radar in Benson (`/openings`)
- [x] All ten BIG LIST entries separate
- [x] Business/location identity + dedupe
- [x] Honest approximate dates
- [x] Research/evidence attached
- [x] Selective Opportunities
- [x] Qualifying Events only
- [x] No dups on repeat
- [x] Update tracking
- [x] Production UI verification
- [x] MATCH deploy + report
