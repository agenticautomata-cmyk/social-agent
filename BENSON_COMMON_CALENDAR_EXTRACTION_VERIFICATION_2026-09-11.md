# Benson Common Calendar / The OSC Squarespace — Independent Verification (2026-09-11)

**Verifier role:** adversarial, non-implementer  
**Primary claim under review:** `BENSON_COMMON_CALENDAR_EXTRACTION_REPAIR_2026-09-11.md`  
**Watcher:** `21b5e1d0-0801-4d5e-863b-c0b62305926a`  
**Configured URL:** `https://www.theosc.co/events`  
**Checked at:** 2026-09-11 (~12:02–12:07Z)  
**Safety:** no email / Telegram / forms / publish from this verification (primary closeout Telegram already sent; none resent)

## Verdict

**PASS — live accurate extraction**

Live OSC HTML, independent `extractEventListingsFromHtml` re-parse, DB/API inventory, and per-event ICS agree on **36** upcoming listings (title / KC-local start–end / detail URL). Overnight span is correct (not UTC-shifted). Second and **third** checks are `no_change` with stable count and zero duplicates. Status language separates completed check from successful extraction. Extraction is capability-based (not hostname-only). Wix and Eventbrite KC regressions hold. Deploy fingerprint **MATCH** `8c9247d432890dc7`. Detail UI shows event date/time, not only extraction timestamp.

---

## Check results

| # | Check | Result |
| --- | --- | --- |
| 1 | Live accuracy (sample vs page / ICS) | **PASS** |
| 2 | Date handling (KC local / overnight) | **PASS** |
| 3 | Deduplication / second+ check stability | **PASS** |
| 4 | Status language (zero-yield ≠ successful) | **PASS** |
| 5 | Capability-based (not hostname-only OSC scraper) | **PASS** |
| 6 | Regressions (Wix + Eventbrite KC) | **PASS** |
| 7 | Past filtering | **PASS** |
| 8 | Deploy fingerprint MATCH | **PASS** |
| 9 | UI event date/time on detail | **PASS** |
| 10 | Safety (no extra outreach) | **PASS** |

---

### 1. Live accuracy — **PASS**

**Live page:** HTTP 200, ~613 KB, `America/Chicago`, **36** `eventlist-event--upcoming`, **30** past (excluded from upcoming parse).

Independent re-extract of the same live HTML:

| Field | Value |
| --- | --- |
| Method | `squarespace_events` |
| Strategies | `json_ld` → `direct_ics` → `squarespace_events` |
| Rejections | `json_ld:zero_events`, `direct_ics:links_present_bodies_not_supplied` |
| Candidate / verified | **36 / 36** |

**Sample cross-check (live HTML clocks ↔ extractor ↔ persisted API):**

| Sample | Live local | Extracted | Persisted |
| --- | --- | --- | --- |
| Go To Kellz (overnight) | Fri Sep 11 10:00 PM → Sat Sep 12 2:00 AM | `2026-09-11T22:00:00` → `2026-09-12T02:00:00` | same + `/events/go-to-kellz` |
| Mats and Matcha (single-day) | Sun Sep 13 1:00–4:00 PM | `2026-09-13T13:00:00`–`16:00:00` | same |
| Bible Study (repeated title) | four distinct detail URLs / dates | four rows | four distinct fingerprints |
| OSC Co-Work Day (multiday span) | Aug 3 2026 → Jan 2 2027, one card | one row `08-03`→`01-02` | one row |
| Connected / Restored | repeated titles, distinct dates/URLs | 3 Connected + 4 Restored | same |

**ICS (Go To Kellz `?format=ical`):** HTTP 200. Raw UTC `20260912T030000Z` / `20260912T070000Z` projects with `preferTimeZone=America/Chicago` to local **2026-09-11 22:00** → **2026-09-12 02:00** — matches HTML authority (not silent UTC calendar-date shift).

Venue absent on listing cards in live HTML and inventory (optional; not treated as failure).

Full inventory compare: **0** persisted↔live mismatches; **0** live-only; **36** distinct URLs and occurrence fingerprints.

Not fixture-only: live fetch + live parse + DB + `/api/watchlist/{id}` (36 scout items) agree.

### 2. Date handling — **PASS**

- Site TZ detected: `America/Chicago`.
- HTML local wall times preferred; overnight Go To Kellz keeps start date Sep 11 (ICS UTC alone would look like Sep 12 without zone projection).
- Multiday Co-Work remains **one** span row (no day explosion).
- Unit suite `event-listing-extract.test.ts`: **19/19 pass** (includes Squarespace / ICS / status semantics).

### 3. Deduplication — **PASS**

`scout_source_runs` (newest first, OSC):

| Time (UTC) | Method | items / new | Outcome |
| --- | --- | --- | --- |
| 2026-09-11 12:07:03 | `squarespace_events` | 36 / 0 | `no_change` (**independent third check**) |
| 2026-09-11 11:53:11 | `squarespace_events` | 36 / 0 | `no_change` |
| 2026-09-11 11:53:09 | `squarespace_events` | 36 / 36 | `healthy` (baseline) |
| 2026-09-11 11:38:35 | `event_listing` | 0 / 0 | `no_yield` (pre-repair) |

After third check: still **36** scout items, **36** fingerprints, `newRecordsFound=0`. Same-title different dates (Bible Study ×4, Connected ×3, Restored ×4) remain separate.

### 4. Status language — **PASS**

- Pre-repair run persisted as `no_yield` with 0 items.
- `watchlistDisplayHealth`: explicit `no_yield` stays `no_yield`; falsely `healthy` with zero yield/verified is coerced to **`no_yield`**.
- Explanation for zero yield: “Page responded, but no usable events were found.”
- UI label: **“Last successful extraction”** only when `lastSuccessfulExtractionAt` is set; otherwise **“Last completed check”** + “No successful extraction yet”.
- `lastSuccessfulExtractionAt` set only when count > 0 this check (or retained prior).

**Residual (non-blocking):** scheduler still stamps `lastSuccessfulCheck` on completed OK listing checks; UI is instructed not to call that “successful extraction” unless `lastSuccessfulExtractionAt` is set. Current OSC state has both set after yield — expected.

### 5. Capability-based — **PASS**

- Production extractor has **no** hard-coded OSC event titles / detail paths (`Go To Kellz`, `Mats and Matcha`, `theosc.co/events/go-to-kellz` absent from `event-listing-extract.ts`).
- Negative: Squarespace chrome alone on `/about` → `looksLikeEventListing=false`, extract method `none`, **0** events (hostname ≠ success).
- Positive path requires Squarespace **events collection** markers + upcoming `eventlist` cards.
- Strategy order matches claim (JSON-LD → direct ICS bodies → Squarespace HTML → …); Wix path preserved separately.

### 6. Regressions — **PASS**

| Source | Result |
| --- | --- |
| 18th & Vine Wix | **PASS** — live re-extract 6/6 `wix_events_hydration`; watcher `no_change`, yield 6, URL `…/live-music-events` preserved |
| Eventbrite KC | **PASS** — `https://www.eventbrite.com/d/mo--kansas-city/events/` preserved; `healthy`, verified yield **60**, adapter `eventbrite_directory` |

### 7. Past filtering — **PASS**

- Upcoming extract uses `eventlist--upcoming` only; past section present but not inventoried.
- No expired-only rows in OSC scout inventory (Co-Work ongoing multiday span correctly retained).
- Heuristic expired filter on persisted datetimes: **0** leaks.

### 8. Deploy fingerprint — **PASS**

`pnpm benson:deployment-status` at verification time:

```json
{
  "status": "MATCH",
  "sourceFingerprint": "8c9247d432890dc7",
  "apiFingerprint": "8c9247d432890dc7",
  "dashboardFingerprint": "8c9247d432890dc7",
  "workerFingerprint": "8c9247d432890dc7"
}
```

Commits `bcf0b15`, `dc9c8ac`, `0642f10` are on HEAD / origin tip for the repair series.

### 9. UI — **PASS**

- Detail cards show **event** date/time (`2026-12-27 · 14:00–18:00`) from `relevanceExplanation.startDateTime` / end, plus evidence and detail link; extraction timestamp is secondary (“Extracted …”).
- Proof screenshots: `docs/ops/proofs/osc-squarespace-extraction-2026-09-11/` (verified yield 36, new 0, squarespace events, no auto-pitch copy).
- Public API: `healthStatus` / `displayHealth` `no_change`, explanation “Checked 36 current listings; no changes found.”

**Cosmetic gap:** platform/method line can duplicate “squarespace events · squarespace events” when platform === method — display thinness only.

### 10. Safety — **PASS**

- Listing check path does not route through alert-capable early-signal pipeline.
- This verification ran a manual `runWatcherNow` for OSC only; **no** Telegram / email / pitch send.

---

## Gaps / caveats (do not overturn PASS)

1. Listing cards omit venue on OSC SSR; missing venue allowed.
2. `lastSuccessfulCheck` remains a completed-check stamp for scheduling; honesty depends on `lastSuccessfulExtractionAt` gating in UI (verified in code + current healthy yield state).
3. Web-search summaries of OSC are unreliable vs live HTML; verification used live fetch + ICS, not search snippets.

## Bottom line for Elliott

**PASS — live accurate extraction.** The Squarespace/ICS common-calendar repair is real in production (MATCH `8c9247d432890dc7`), OSC inventory is live-faithful at 36 with honest baseline → no_change semantics, and Wix / Eventbrite KC did not regress.
