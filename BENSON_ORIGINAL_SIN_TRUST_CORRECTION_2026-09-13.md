# Benson Original Sin Trust Correction (2026-09-13)

**Branch:** `release/scout-expansion-2026-07-25`  
**Commit:** `47c2298`  
**Rule version:** `2026-09-13.admission.3`  
**Fingerprint:** **MATCH** `2ee20d8cccd4da04`  
**Public:** https://benson.kckellie.com · **API:** https://api.kckellie.com  
**Hard bans honored:** no email, Telegram, pitches, forms, social publish, billable image gen; credentials not exposed; Central Calendar Admission Authority retained.

## Executive summary

Live mobile exposed two trust failures that the admission second pass did not catch:

1. **UTC day grouping** — Original Sin (`2026-09-20T02:00:00.000Z` = Sat Sep 19 9:00 PM CT) rendered under **Sunday Sep 20** because the row was mistagged `allDay: true`, and all-day bucketing used the UTC calendar date.
2. **Fabricated Instagram permalink** — `https://www.instagram.com/p/original-sin-hookedonkc/` was **synthesized** by `repair-original-sin-and-venues.ts` (title/handle slug), not captured evidence. Live IG shows the page unavailable.

Both failure classes are surgically repaired. Mobile proof: Original Sin under **SATURDAY · SEP 19** with card **Sat, Sep 19, 9:00 PM**, View source → captured `Dcjl6BJlYA0`.

---

## Root causes

### Failure 1 — Calendar groups by UTC date

| Layer | Finding |
| --- | --- |
| Production payload | `startAt=2026-09-20T02:00:00.000Z`, **`allDay=true`**, description said Saturday |
| Day key | `getCalendarItemDayKey` used UTC date whenever `allDay===true` |
| Projection | `candidateFromCuratorLead` set `allDay = !eventTime` even after surgical evening instant |
| Surgical prior | `repair-original-sin-and-venues.ts` wrote 9pm UTC but never cleared `allDay` |
| Range queries | Curator projection used `from.toISOString().slice(0,10)` (UTC YMD); list range did not expand to full Chicago local days |

**Fix:** all-day UTC-date path only when `allDay &&` UTC-midnight encoding; otherwise America/Chicago local day. Curator `allDay` requires a real clock. List/API ranges expand via `utcInstantRangeForLocalDays`. Mistagged non-midnight `allDay=true` suggestions repaired in DB (13 rows).

### Failure 2 — Fabricated Instagram source URL

| Question | Answer |
| --- | --- |
| Origin | **Synthesized** in `repair-original-sin-and-venues.ts` as `/p/original-sin-hookedonkc/` |
| Captured evidence? | **No** — never a platform shortcode |
| Genuine permalink | **Yes** — curator lead `47cd2415-…` `discoveredViaPostUrl` = `https://www.instagram.com/p/Dcjl6BJlYA0/` (slide 4) |
| Alias evidence | `Sapphic Cabaret…` lead `d5c443af-…` has `eventTime=21:00` + `https://www.instagram.com/p/Dc_eWSEFVOy/` |
| Disposition | Restored captured URL; scrub fabricated; ban synthetic social permalinks in admission |

---

## Original Sin — proven facts (from legitimate evidence)

| Field | Proven value | Evidence |
| --- | --- | --- |
| Id | `a1f8695c-6266-431c-8bc9-2ab94374ed27` | Calendar survivor |
| Title | Original Sin: A Sapphic Cabaret and Dance Party | Curator lead `47cd2415-…` + Watchlist |
| Local date | **Saturday, September 19, 2026** | Lead `eventDate=2026-09-19`; Chicago day of stored instant |
| Local time | **9:00 PM Central** | Alias lead `eventTime=21:00`; preferred evening survivor |
| Stored UTC | **`2026-09-20T02:00:00.000Z`** (unchanged) | Production + repair |
| Venue | Woody's · Westport | Canonical registry `woodys-westport` + prior collaboration `@woodyskc` 9/19 |
| Address | 4800 Main St, Kansas City, MO 64112 | Venue registry |
| Organizer / attribution | `@hookedonkc` | Watchlist source + lead `discoveredViaHandle` |
| Canonical source URL | `https://www.instagram.com/p/Dcjl6BJlYA0/` | Captured `discoveredViaPostUrl` |
| Verification | `VERIFIED` retained | Captured shortcode supports same event carousel; fabricated URL removed |

**Source disposition:** fabricated URL removed; captured IG permalink restored; unrelated Pitch “warehouse” organizer URL (openai UTM) scrubbed — attribution remains `@hookedonkc`.

---

## Synthetic URL audit

### Calendar production (post-repair)

- Suspicious IG title-slug URLs remaining in accepted window: **0**
- Fabricated Original Sin URL: **removed**
- Mistagged `allDay=true` + non-midnight timed suggestions repaired: **13**

### Created/replaced by Calendar admission migrations / surgical scripts

| Script | Source URL action | Captured evidence? |
| --- | --- | --- |
| `repair-original-sin-and-venues.ts` (prior) | **Created** `/p/original-sin-hookedonkc/` | **No — fabricated** (now corrected to `Dcjl6BJlYA0`) |
| `repair-original-sin-trust-correction.ts` | Restores `Dcjl6BJlYA0`; scrubs synthetics | Yes — Watchlist lead |
| `migrate-calendar-admission-second-pass.ts` | Scrubs known mismatches (BPCofKC / Exclusive Sundays); does not invent IG shortcodes | N/A |
| Fixtures (tests only) | Previously used slug URLs; updated to captured-shape codes | Test-only |

No additional live Calendar rows found with kebab-case IG `/p/` or `/reel/` fabrications after scrub.

---

## Code changes (files)

- `dashboard/lib/calendar-local-date.ts` + `.test.ts` — timed/mistagged allDay → Chicago day; DST/rollover regressions
- `dashboard/app/calendar/calendar-panel.tsx` — `formatWhen` agrees with day key
- `services/core/src/datetime.ts` — `utcInstantRangeForLocalDays`
- `services/core/src/creator-calendar/items.ts` — list range expansion
- `services/core/src/creator-calendar/population/eligibility.ts` — curator `allDay` from real clock
- `services/core/src/creator-calendar/population/sync.ts` — curator query by Chicago local days
- `services/core/src/curator-watchlist/instagram-url.ts` — `isPlatformIssuedInstagramShortcode` / `isCapturedInstagramPostOrReelUrl`
- `services/core/src/creator-calendar/admission/gates/source-evidence.ts` — reject synthetic social permalinks
- `services/core/src/creator-calendar/admission/types.ts` — rule `2026-09-13.admission.3`
- Fixtures + admission/eligibility/sync tests
- `services/core/src/scripts/repair-original-sin-trust-correction.ts` (new)
- `services/core/src/scripts/repair-original-sin-and-venues.ts` — stop reintroducing fabricated URL

---

## Tests

| Suite | Result |
| --- | --- |
| Admission + eligibility + sync (targeted) | **141/141 pass** |
| Dashboard `calendar-local-date` | **22/22 pass** |
| Full core `pnpm test` | **1697/1722 pass**, **25 fail** (same environmental/pre-existing classes as second pass: url-intake date fixtures, IG session/db, Eventbrite, etc.) — **none admission-adjacent** |

Regressions covered: Sat 9pm CT → Saturday; midnight edges; CST/CDT; DST spring/fall; all-day UTC midnight unchanged; synthetic IG quarantine; captured shortcode accept.

---

## Deployment proof

| Check | Result |
| --- | --- |
| Deploy | `pnpm benson:deploy-local` |
| Fingerprint | **MATCH `2ee20d8cccd4da04`** |
| Surgical repair | `repair-original-sin-trust-correction.ts` applied |
| Projection run 1 | `created=0`, `materiallyUpdated=12`, `unchanged=111`, `suppressed=27` (expected after allDay/source repairs) |
| Projection run 2 | `created=0`, `materiallyUpdated=0`, `unchanged=123`, **`secondRunMutated=false`** |
| Aggregate hash | `after1` = `after2` = `f1bf8e568dd51a61`; `maxUpdatedAt` unchanged on second run |
| API Original Sin | `allDay=false`, `startAt=2026-09-20T02:00:00.000Z`, source=`…/p/Dcjl6BJlYA0/` |
| Sep 19 local window query | Includes Original Sin 02:00Z |

---

## Screenshot evidence

| Artifact | Path |
| --- | --- |
| Mobile (OS under Saturday Sep 19) | `docs/ops/screenshots/original-sin-trust-correction-2026-09-13-mobile.png` |
| Mobile card crop | `docs/ops/screenshots/original-sin-trust-correction-2026-09-13-mobile-card.png` |
| Desktop | `docs/ops/screenshots/original-sin-trust-correction-2026-09-13-desktop.png` |
| View source | `docs/ops/screenshots/original-sin-trust-correction-2026-09-13-view-source.png` → `https://www.instagram.com/p/Dcjl6BJlYA0/` |

Observed UI:

- Sticky / day: **SATURDAY · SEP 19**
- Card when: **Sat, Sep 19, 9:00 PM**
- Location: **Woody's · Westport**
- Status: **Benson suggestion · Verified** (captured source present)
- View source: captured IG permalink (not fabricated slug)

---

## Remaining limitations

1. Venue address comes from canonical registry + attribution chain; the IG carousel itself may not print the street address on-slide.
2. `fallsInWeekend` is false for Sep 19 when “this weekend” is evaluated mid-week — weekend-window semantics, not a date-bucketing bug.
3. Full-suite 25 environmental failures remain (unchanged class vs second pass).
4. Browser MCP tab tooling was unavailable this pass; screenshots captured via Playwright headless against production.

---

## Success criteria checklist

- [x] Heading Saturday Sep 19 / card Sat Sep 19 9:00 PM  
- [x] Stored instant unchanged `2026-09-20T02:00:00.000Z`  
- [x] Fabricated IG URL removed; captured shortcode restored  
- [x] Synthetic social permalink validation  
- [x] MATCH fingerprint  
- [x] Second projection zero DB mutations  
- [x] Mobile screenshot under Saturday  
- [x] View source proves supporting event source  
- [x] Late-evening allDay mistags repaired / no longer UTC-shifted  
- [x] Report path: `BENSON_ORIGINAL_SIN_TRUST_CORRECTION_2026-09-13.md`
