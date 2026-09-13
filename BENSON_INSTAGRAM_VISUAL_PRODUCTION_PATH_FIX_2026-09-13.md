# Benson Instagram Visual Production Path Fix (2026-09-13)

**Branch:** `release/scout-expansion-2026-07-25`  
**Commits:** `8f99536` (production path wire-in) · `5b21707` (caption-title dedupe backfill) · `7f1212f` (this report)  
**Fingerprint:** **MATCH** `de07ac6c1fa4a5f0` (live acceptance runs executed against prior MATCH `0989296a8228bae6` containing the production-path wire-in; final redeploy after backfill+report)  
**Public:** https://benson.kckellie.com · **API:** https://api.kckellie.com  

Hard bans honored: one general Instagram visual pipeline; local OCR first; billable vision off; no fabricated permalinks; no CAPTCHA/auth bypass; no outreach/publish; no Bizzy/Funny Bone production branches.

---

## Executive verdict

The live Watchlist defect was **not** “OCR can’t read Rock the Bridge.” Prior work extracted flyers in an **isolated visual orchestrator** that updated coverage config but did **not** drive the shared Check now / scheduled / Reprocess persistence path. Production checks then **skipped already-known posts**, so the UI showed honest-looking **posts 0/4** with session ready while lifetime counters still showed historical totals — and Rock the Bridge never entered live findings via the normal path.

After this fix, production Check now for `@bizzybodyb007` inspects **12/12** posts with slides/OCR, persists **Rock the Bridge** once with dual provenance, expires past leads out of Calendar eligibility, and quarantines Instagram error-chrome findings.

---

## Root causes

| Defect | Root cause |
| --- | --- |
| Production **0/4** (session ready) | `runCuratorWatchlistPipeline` skipped known posts (`knownPostKeys` / fingerprints). Visual OCR never re-ran; coverage finalized as partial/empty inspection. |
| Rock the Bridge missing in live findings | Verify runner (`runInstagramVisualEventReader`) produced in-memory candidates / config coverage only. Production Check now did not re-acquire known posts into `processCuratorPost` persistence. |
| Expired Sep 6 still Calendar eligible | `calendarEligible` stamped once and not re-evaluated; date compares were not consistently America/Chicago; no per-check expired backfill. |
| Conflicting counters + “No successful extraction yet” | Lifetime totals (`itemsProcessed` / reliability) mixed with current-run 0/N coverage; `lastSuccessfulExtractionAt` unset even when leads existed. |
| Karlous/Karlos Miller duplicates | Lead fingerprint included `postUrl`; caption-title vs short title on same date created extra rows. |
| “Sorry, This Page Isn’t Available.” finding | Error chrome not rejected at classification / lead ingest; stale row remained active until quarantine backfill. |

---

## Repairs shipped

### A. Production job wiring
- **Check now** → `runWatcherNow` → `runScheduledCuratorWatcher(..., 'manual')` → `runCuratorWatchlistPipeline({ visualRefresh: true })`
- **Scheduled** → same pipeline with `visualRefresh: true`
- **Reprocess latest** → same pipeline with `force` + `visualRefresh` + `triggerType: 'reprocess'`
- Every check re-acquires the bounded recent window, runs `processPostVisualEvents`, persists via `processCuratorPost`
- Session-ready + 0 inspected now requires a **precise** incomplete reason (`acquisition_returned_no_post_nodes`, `media_download_failed:…`, `run_timeout`, `session_expired`, etc.)

### B. Current-run vs lifetime metrics
- Config `currentRunCoverage` + Watchlist detail **Current / latest check** card
- Lifetime fields labeled separately (`lifetimePostsProcessed`, `lifetimeEventsExtracted`)

### C. Timestamps / success semantics
- Per-run `lastCheckRunId`
- `lastAttemptedCheckAt` ≤ `lastCompletedCheckAt` for the same run
- `lastSuccessfulExtractionAt` set when extractions/persisted (and backfilled when lifetime extract count > 0)
- UI no longer shows “No successful extraction yet” when records already exist

### D–E. Date/year + Rock the Bridge
- America/Chicago comparisons for past / Calendar eligibility
- Yearless Friday Sep 18 + publish + weekday → `year_corroborated` (still not Calendar auto-admit)
- Single-flyer day heading no longer splits into fake multi-events
- Venue prefers concrete names (e.g. Rock Island Bridge) over event titles
- Time ranges capture start/end

### F. Deduplicate
- Lead fingerprint drops `postUrl`; keeps showtime
- Provenance URLs accumulate across supporting posts
- Backfill merges caption-title duplicates; preserves distinct dates/showtimes

### G–H. Error chrome + backfill
- `ig-error-chrome.ts` + classification / lead reject
- `reclassifyExpiredCuratorLeadsForWatcher` on every successful check
- Quarantined live “Sorry…” lead + early signal

---

## Files changed

- `services/core/src/curator-watchlist/pipeline.ts`
- `services/core/src/curator-watchlist/scheduler.ts`
- `services/core/src/curator-watchlist/store.ts`
- `services/core/src/curator-watchlist/types.ts`
- `services/core/src/curator-watchlist/creator-value.ts`
- `services/core/src/curator-watchlist/dedupe.ts`
- `services/core/src/curator-watchlist/watchlist-intelligence.ts`
- `services/core/src/curator-watchlist/instagram-visual-backfill.ts` **(new)**
- `services/core/src/curator-watchlist/instagram-visual/ig-error-chrome.ts` **(new)**
- `services/core/src/curator-watchlist/instagram-visual/{date-year-trust,event-assembler,location-trust,index}.ts`
- `services/core/src/curator-watchlist/instagram-visual/{instagram-visual,production-path}.test.ts`
- `dashboard/app/watchlist/[id]/watchlist-detail-panel.tsx`

---

## Tests

- Focused Instagram visual + production-path + curator suites: **77/77 pass**
- Regression cases **1–20** covered in `production-path.test.ts` (+ existing visual fixture matrix)

---

## Live production acceptance (API Check now — not verify script)

Watcher IDs: Bizzy `91213b18-2ccc-4cc4-bee3-96e6872caee7` · Funny Bone `9f21743c-2ac7-4607-8c8b-24798447977a`

### @bizzybodyb007 — run 1
| Field | Value |
| --- | --- |
| Run ID | `f1a87ede77bddb61` |
| Coverage | posts **12/12**, slides **14/14**, OCR **14/14** (5 cached) |
| Status | `complete` |
| Rock the Bridge | **persisted** (see below) |

### @bizzybodyb007 — run 2
| Field | Value |
| --- | --- |
| Run ID | `427d3e23de9c97f5` |
| Coverage | posts **12/12**, slides **14/14**, OCR **14/14** (**9 cached**) |
| Rock logical events | **1** (stable id) |
| Dupes suppressed (run) | **5** |

### Rock the Bridge disposition
| Field | Value |
| --- | --- |
| Title | `ROCK THE BRIDGE VOL. 2- "Salute The Samples"` |
| Date | `2026-09-18` |
| Time | `7PM - 11PM` |
| Venue | `ROCK ISLAND BRIDGE` |
| Permalink | https://www.instagram.com/p/DcWQ1GUzbMJ/ |
| Provenance | also `https://www.instagram.com/p/DdKKm6GTTm-/` (duplicate flyer) |
| Verification | `PARTIALLY_VERIFIED` (not auto Calendar-confirmed) |
| Lead id | `1ba562b0-4e12-451a-ae88-b65d2a1ed3ba` |

### Expired / error chrome
- Past Bizzy leads reclassified `EXPIRED` with `calendarEligible: false`
- “Sorry, This Page Isn’t Available.” lead + early signal **dismissed/quarantined**

### @funnybonekcmo
| Field | Value |
| --- | --- |
| Run ID | `26a79aab88ad24f8` |
| Coverage | posts **12/12**, slides **12/12**, OCR **12/12** |
| Karlous Miller | **Sep 18** + **Sep 19** retained (distinct nights); caption duplicate **suppressed** |
| Sorry findings | **0** active |

### API excerpt (Bizzy detail after run 2)
```json
{
  "lastCheckRunId": "427d3e23de9c97f5",
  "lastAttemptedCheck": "2026-09-13T21:33:59.929Z",
  "lastCompletedCheckAt": "2026-09-13T21:36:17.785Z",
  "lastSuccessfulExtractionAt": "2026-09-13T21:36:17.785Z",
  "currentRunCoverage": {
    "status": "complete",
    "postsInspected": 12,
    "postsExpected": 12,
    "slidesInspected": 14,
    "slidesExpected": 14,
    "ocrCompleted": 14,
    "ocrAttempted": 14,
    "ocrCached": 9,
    "duplicatesSuppressed": 5
  }
}
```

---

## Deploy / MATCH

```json
{
  "status": "MATCH",
  "sourceFingerprint": "0989296a8228bae6",
  "apiFingerprint": "0989296a8228bae6",
  "dashboardFingerprint": "0989296a8228bae6",
  "workerFingerprint": "0989296a8228bae6"
}
```

---

## Limitations

- Local OCR still emits noisy titles on stylized/reel frames; they route to review / may still persist as low-quality leads until triage thresholds tighten further.
- Calendar eligibility for current future leads remains a **downstream admission** decision — visual extraction ≠ verified ≠ admitted.
- Second-run `newItems` in the Check now JSON response still reflects pipeline extract counts (including re-touch of review noise), not “new logical events”; Rock the Bridge identity stayed singular.
- Host is memory-tight; checks are sequential and bounded (`INSTAGRAM_VISUAL_MAX_POSTS`, timeouts) but each Check now is still a multi-minute Playwright+OCR job.

---

## Success criteria

Deployed production Watchlist path processes visual media, persists Rock the Bridge, displays current-run coverage honestly, remains duplicate-free on the second Bizzy run, and cleans Funny Bone / error-chrome records — **not** a standalone verify script.
