# Benson multi-platform Watchlist extraction — Independent Verification (2026-09-11)

**Verifier role:** adversarial, non-implementer  
**Primary claim under review:** `BENSON_MULTI_PLATFORM_WATCHLIST_EXTRACTION_REPAIR_2026-09-11.md`  
**Checked at:** 2026-09-12 (~00:01–00:06Z)  
**Safety:** no pitches, email, Telegram, alerts, calendar invites, or billable AI from this lane

## Overall verdict

**PARTIAL — source claims largely confirmed; deploy status is DRIFT, not MATCH**

Runtime API / dashboard / worker fingerprints all equal the claimed deploy id `66f64b497ca70647`, and per-source Watchlist outcomes match the primary table with only minor inventory/label caveats. However, `pnpm benson:deployment-status` at verification time reports **DRIFT** (`sourceFingerprint` `5174ba8ff732af66` ≠ deployed `66f64b497ca70647`), so the primary’s live **MATCH** claim does not hold as re-checked.

| Source | Verdict | Notes |
|--------|---------|-------|
| Music Theater Heritage | **PASS** | TEC REST; configured `/shows/` kept; effective `/events/`; 18 verified incl. in-run Superstar through 2026-09-13 |
| Do816 | **BLOCKED** | Live `check-now` HTTP 403; `reachability=blocked`; not `no_yield` |
| KC Melting Pot | **PASS** | 4 groups / 36 performances; Like Six excluded; +1 stale pre-repair scout row |
| Meetup (AA KC find) | **PASS** | 12 SSR; bands 2 / 4 / 6; `autoPromote/Pitch/Alert=false` |
| Cannabis Network KC | **EMPTY** | `wix_events` + `no_upcoming_events`; honest empty copy |
| OSC | **PASS** (no regression) | 36 Squarespace |
| 18th & Vine Wix | **PASS** (no regression) | verifiedYield 6; live page 6 upcoming |
| Eventbrite KC | **PASS** (no regression) | verifiedYield 59 |

Commits `74a846c`, `2edd922`, `f653d9a` are on `release/scout-expansion-2026-07-25` (HEAD `f653d9a`). Focused unit suite: **43/43 pass**.

---

## 1. Deploy fingerprint

```text
pnpm benson:deployment-status  → exit 2
status: DRIFT
sourceFingerprint:     5174ba8ff732af66
apiFingerprint:        66f64b497ca70647
dashboardFingerprint:  66f64b497ca70647
workerFingerprint:     66f64b497ca70647
apiStartedAt:          2026-09-11T23:58:14.735Z
```

| Check | Result |
| --- | --- |
| Claimed MATCH `66f64b497ca70647` | **FAIL as re-checked** — status is DRIFT |
| Runtime services share claimed id | **PASS** — api/dashboard/worker all `66f64b497ca70647` |
| Source ahead of runtime | **Yes** — local fingerprint `5174ba8ff732af66` (uncommitted/source tree drift since deploy) |

**Discrepancy:** Primary closeout states deployed fingerprint **MATCH `66f64b497ca70647`**. That was plausible at deploy (~23:58Z); independent re-check does **not** observe MATCH.

---

## 2. Music Theater Heritage — PASS

**Watcher:** `1a737b42-064d-4c6c-b566-fbeea86d7449`

| Field | Observed |
| --- | --- |
| configured / `sourceUrl` / `lastResolvedUrl` | `https://musictheaterheritage.com/shows/` |
| `effectiveExtractionUrl` | `https://musictheaterheritage.com/events/` |
| method (run history) | `wordpress_tec_rest` |
| list-card `extractionMethod` | `wordpress_tec` (coarser label) |
| verifiedYield / scoutItems | 18 / 18 |
| displayHealth | `no_change` |
| capability / content | `supported` / `no_change` |

**Live:** `/shows/` and `/events/` HTTP 200. TEC REST returns Superstar when the window includes its run (`start` 2026-08-20 → `end` 2026-09-13); default “from today” listing shows 17 start-dated futures without Superstar. Persisted 18 titles/URLs match TEC for the in-window set; Superstar is still a running production, not an expired leftover.

**Idempotency:** Multiple `no_change` runs at 18 (acceptance + later). Pre-repair runs were zero-yield `event_listing`.

---

## 3. Do816 — BLOCKED

**Watcher:** `77484aa9-cef8-44c3-8279-0f2f2894d530`

| Field | Observed |
| --- | --- |
| configured URL | `https://do816.com/blackeventsinkc` (unchanged) |
| lastResolvedUrl | `https://do816.com/blackeventsinkc.json` |
| reachability / health | `blocked` / `blocked` |
| paused | `true` (auto after block) |
| statusExplanation | `DoStuff/Do816 blocked automated access (HTTP 403).` |
| verifiedYield | 0 |
| contentOutcome | not `no_upcoming_events` / not empty-success |

**Runtime evidence (this verification):** unpaused + `POST …/check-now` → `ok:false`, error/summary HTTP **403**, `displayHealth=blocked`, `reachability=blocked`, `lastResolvedUrl` still `.json`. Re-auto-paused.

**Workstation nuance (not a contradiction of BLOCKED):** browser-like / edge-cached GET of `.json` can still return HTTP 200 and parse **6** events via `extractDostuffEventsFromJson`. Scout UA HTML GET returns **403** empty body. Edge 200 ≠ worker success; classification remains **BLOCKED**, not `no_yield`.

---

## 4. KC Melting Pot — PASS

**Watcher:** `f3699cd6-e383-48aa-886c-b881d3c751d6`

| Field | Observed |
| --- | --- |
| configured = effective | `https://kcmeltingpot.com/current-season/` |
| method | `theater_season` |
| `listingDisplayMode` | `production_groups` |
| productionGroupCount / performanceCount | 4 / 36 |
| verifiedYield | 36 |
| displayHealth | `no_change` |

**Live page:** four current productions (JITNEY, LIVIN' FAT, BLUES FOR AN ALABAMA SKY, GOD OF CARNAGE) with 9 dated performances each (=36). **Like Six O’Clock** (June 2026) is visible on the page and correctly **absent** from extracted inventory.

**Independent `check-now`:** `ok`, `theater_season`, verifiedYield 36, newItems 0.

**Discrepancy:** `scoutItems` length **37** — 36 performances plus one pre-repair `http_then_browser` row (`detectedAt` 2026-09-11T16:48Z, page chrome caption, no title/date). Yield metrics stay 36; stale row is inventory noise, not a false production group.

---

## 5. Meetup — PASS

**Watcher:** `6f18ba43-338e-43d6-b0a2-75492617f9eb`

| Field | Observed |
| --- | --- |
| URL preserved | `https://www.meetup.com/find/us--mo--kansas-city/african-american/` |
| run method | `meetup_apollo_ssr` (list card shows `meetup_directory`) |
| verifiedYield / scoutItems | 12 / 12 |
| relevance bands | verified_relevant **2**, possibly_relevant **4**, not_relevant **6** |
| autoPromote / autoPitch / autoAlert | all **false** on every item |
| needsReview | true only on possibly_relevant |

**Live SSR:** 12 unique event URLs; **12/12** overlap with persisted (slash-normalized). Weak matches not auto-promoted. First-SSR-page caveat present in status copy.

---

## 6. Cannabis Network KC — EMPTY

**Watcher:** `0d839ae2-0634-4740-9d95-5af5991e7d53`

| Field | Observed |
| --- | --- |
| platform / method | `wix_events` |
| `extractionCapabilityOutcome` | `supported` |
| `contentOutcome` | `no_upcoming_events` |
| verifiedYield / scoutItems | 0 / 0 |
| statusExplanation | `Checked successfully. No upcoming dated events are currently published (wix_events).` |
| `lastSuccessfulExtractionAt` | unset (honest) |
| displayHealth | `no_change` (not falsely “successful extraction” of listings) |

**Live:** HTTP 200, Wix events markers present, **0** upcoming dated event strings in page text — empty calendar, not parse failure.

**Independent `check-now`:** same empty-success summary, method `wix_events`, newItems 0.

---

## 7. Regressions — PASS

| Source | Watcher | verifiedYield | method | Live spot-check |
| --- | --- | --- | --- | --- |
| OSC | `21b5e1d0-…5926a` | 36 | `squarespace_events` | 36 `eventlist-event--upcoming` |
| 18th & Vine | `1b263831-…dbf9` | 6 | `wix_events` / run `wix_events_hydration` | 6 hydration upcoming; URLs preserved |
| Eventbrite KC | `d72be304-…ab2ed9d` | 59 | `eventbrite_directory` | directory reachable; yield 59 |

**Wix note:** 7 active `scoutItems` vs verifiedYield 6 (includes 2026-09-11 Late Night Jam no longer on live upcoming list). Extraction yield claim of 6 still matches live upcoming count — not a regression of the adapter.

**Eventbrite note:** 79 historical `scoutItems` vs latest verifiedYield 59 — accumulation across runs; latest run metric matches claim.

---

## 8. Status truthfulness

| Check | Result |
| --- | --- |
| Do816 blocked ≠ empty / ≠ no_yield | **PASS** |
| Cannabis supported empty ≠ no_yield | **PASS** |
| Melting / MTH / Meetup `no_change` after baseline | **PASS** |
| Configured URLs not rewritten (esp. MTH `/shows/`, Melting season URL) | **PASS** |
| Effective URL discovery-only (MTH `/events/`) | **PASS** |

**Residuals (non-blocking):**

- Coarser list-card method labels (`wordpress_tec`, `meetup_directory`) vs precise run methods (`wordpress_tec_rest`, `meetup_apollo_ssr`).
- `lastSuccessfulCheck` can stamp on completed checks including Cannabis empty and (historically odd) Do816 timestamps; UI/extraction success still gated by yield / `lastSuccessfulExtractionAt` where set.
- Do816: intermittent edge-cached JSON 200 on workstation must not be read as Watchlist health.

---

## 9. Idempotency / second run

| Source | Evidence |
| --- | --- |
| MTH | Repeated `no_change` @ 18 |
| Melting | Independent verifier `check-now` → `no_change`, 36/0 new |
| Meetup | Acceptance pass2 + later `no_change` @ 12 |
| Cannabis | Verifier `check-now` → empty success, 0 new |
| Do816 | Repeated blocked 403 (not a yield path) |

---

## 10. Discrepancies vs primary (summary)

1. **Fingerprint:** claimed MATCH → observed **DRIFT** (runtime id still `66f64b497ca70647`).
2. **Melting:** +1 stale non-performance scout item (37 rows) while yield stays 36.
3. **Method labels:** list/API card vs run-history precision.
4. **Do816:** workstation/edge JSON can 200 while **runtime check-now remains 403** — primary BLOCKED call still correct.
5. **MTH count optics:** default TEC “from today” listing 17 vs inventory 18 because Superstar is mid-run through 2026-09-13 — not an extraction miss.

---

## Hard bans

No outreach, Telegram, alerts, calendar invites, credential exposure, CAPTCHA/auth bypass, or hard-coded fake yields. Do816 was briefly unpaused only to re-observe runtime 403; it re-paused on block.
