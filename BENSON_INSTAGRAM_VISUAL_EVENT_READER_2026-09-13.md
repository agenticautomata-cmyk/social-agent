# Benson Instagram Visual Event Reader (2026-09-13)

**Branch:** `release/scout-expansion-2026-07-25`  
**Commit:** `270411e` (impl) · `5082f7f` (report)  
**Fingerprint:** **MATCH** `60b4f14ce9742f62`  
**Public:** https://benson.kckellie.com · **API:** https://api.kckellie.com  

**Hard bans honored:** one general Instagram visual pipeline (no Bizzy/Jas-specific scrapers); authorized session + public content only; local OCR first; billable vision/parse **disabled by default**; no fabricated `/p/` or `/reel/` permalinks; no Calendar auto-admit; no outreach/publish; bounded posts/slides/bytes/timeouts.

## Executive summary

Benson’s Instagram Watchlist path now runs a **general visual event reader**: bounded recent-post inspection, carousel slide enumeration, local flyer OCR (tesseract.js + sharp preprocess), caption/alt assembly, year/location trust, repost dedupe, and **concrete coverage counts** instead of “produced usable records.” Extraction remains separate from verification, Calendar Admission, and editorial relevance.

**Acceptance:**
- **@bizzybodyb007** — full window coverage `posts 4/4`, `slides 4/4`, `ocr 4/4`, expired vs review classified, **0 fabricated permalinks**, second run **0** new extracts (OCR cache reuse).
- **@jasfoodjourney** — after slide-count honesty fix: `posts 3/3`, `slides 7/7`, `ocr 7/7` (5 cached), multi-slide evidence, roundup cover not treated as a single event, **0 fabricated permalinks**.
- **≥3 additional** configured accounts exercised (`boonetheater`, `swittscajuncuisine`, `hookedonkc`) with honest coverage statuses.

---

## Architecture (extends curator-watchlist)

New module: `services/core/src/curator-watchlist/instagram-visual/`

| Module | Role |
| --- | --- |
| `acquisition.ts` | Platform-issued permalink validation; refuse synthesized shortcodes (Original Sin regression) |
| `bounds.ts` | Configurable max posts/age/slides/frames/bytes/timeout; vision off by default |
| `local-ocr.ts` | sharp preprocess + tesseract.js; content-hash cache |
| `vision-escalation.ts` | Provider-neutral; disabled unless `INSTAGRAM_BILLABLE_VISION=1` |
| `event-triage.ts` | Cheap likelihood; empty caption ≠ reject |
| `event-assembler.ts` | Multi-slide evidence assembly; roundup cover handling |
| `date-year-trust.ts` | `year_explicit` / `year_corroborated` / `year_inferred_review` / `year_unresolved` |
| `location-trust.ts` | Curator handle ≠ sole geo |
| `visual-dedupe.ts` | Platform id + perceptual hash + title/datetime/venue/showtime |
| `coverage.ts` | Concrete counts + statuses (`complete`, `complete_no_current_events`, `partial`, `structure_changed`, …) |
| `strategy-memory.ts` | Profile + change detection (no false healthy on cover-only regression) |
| `process-post.ts` / `orchestrator.ts` | Per-post + account runners |
| `slide-ocr.ts` (updated) | **Local OCR first**; OpenAI vision only if explicitly enabled |
| `pipeline.ts` (updated) | Wires visual coverage into Watchlist health + inspection summary |

Statuses: `complete | complete_no_current_events | partial | session_required | rate_limited | structure_changed | blocked | failed`.  
Healthy must not conceal incomplete carousel/image coverage (`coverageStatusToHealthStatus` maps partial/structure_changed → `degraded`).

---

## Live coverage findings

### @bizzybodyb007 (acceptance)

| Metric | Result |
| --- | --- |
| Status | `complete_no_current_events` |
| Posts | 4/4 inspected |
| Slides | 4/4 |
| OCR | 4/4 (1 cached on path) |
| Candidates | review=2, expired=2, extracted future=0 |
| Fabricated permalinks | **0** |
| Second run new extracts | **0** |

Stored leads (downstream, not auto-Calendar-admitted by this reader): includes Ghostface Killah / Boone Theater, Rock the Bridge, Artwalk — with genuine `instagram.com/p/…` URLs. Expired flyers classified expired/rejected for current future window.

Sample genuine permalinks from run:  
`https://www.instagram.com/p/DdKPMvSOLcT/`, `https://www.instagram.com/p/DcpUHOag6PY/`

### @jasfoodjourney (acceptance)

**Initial run** (pre slide-count honesty): reported `structure_changed` with inflated `slidesExpected` from untrusted UI chrome — **honest incomplete**, not false healthy.

**Recheck after fix** (`verify-ig-visual-one.ts`):

| Metric | Result |
| --- | --- |
| Status | `complete_no_current_events` |
| Posts | 3/3 |
| Slides | **7/7** |
| OCR | 7/7 (5 cached) |
| Candidates | review=3, dupes=5 |
| Fabricated permalinks | **0** |

Carousel slides enumerated; shared carousel permalink + slide evidence; roundup title “Kansas City Events…” pattern handled in assembler (cover ≠ one event). Curator handle alone is not geo proof.

Sample: `https://www.instagram.com/p/DdJpblvnJ9m/` (slide 2 evidence), reels retained as platform URLs only.

### Additional accounts (≥3)

| Handle | Status | Notes |
| --- | --- | --- |
| @boonetheater | structure_changed → honest incomplete on first matrix | OCR ran; expired classified; 0 fabricated |
| @swittscajuncuisine | `complete_no_current_events` | posts 3/3, slides 3/3 |
| @hookedonkc | structure_changed / partial honesty | posts inspected with OCR; 0 fabricated |

No account-specific production branches.

---

## Decisions kept separate

1. **Acquire** — session + public grid/post media  
2. **Understand** — OCR / caption / alt  
3. **Extract** — candidates with field evidence  
4. **Verify** — existing research / admission gates (downstream)  
5. **Admit** — Calendar Admission Authority (unchanged; never auto-confirmed here)  
6. **Editorial relevance** — separate

Reachable + healthy OCR coverage ≠ current Calendar events. Event in post ≠ verified. Verified ≠ relevant.

---

## Tests

- `instagram-visual.test.ts` fixture matrix: single flyer, roundup cover+later slides, multi-slide merge, year trust, expired no roll-forward, caption correction, out-of-market, curator≠geo, triage, dedupe/showtimes, vision disabled, coverage honesty, synthetic permalink reject, strategy memory, sharp smoke.
- Related: `watch-inspection`, `watchlist-state`, curator suites — **pass** (45 tests in focused run).

Billable vision/parse env left unset/`0` during implementation and live runs.

---

## Idempotency / cache

- Second runs: **0** new extracts on Bizzy/Jas acceptance paths.
- OCR content-addressed cache under `.cache/instagram-visual/` (reuse when media hash unchanged).
- Strategy profile stored on watcher `config.instagramVisualStrategy` + `lastInstagramVisualCoverage` for operator-facing summaries.

---

## Deploy / MATCH

| Item | Value |
| --- | --- |
| Deploy | `pnpm benson:deploy-local` (dashboard `.next` cleaned after ENOENT flake) |
| Fingerprint | **MATCH `60b4f14ce9742f62`** |
| Deploy gate tests | 258/258 pass |
| Report | `BENSON_INSTAGRAM_VISUAL_EVENT_READER_2026-09-13.md` |

```json
{
  "status": "MATCH",
  "sourceFingerprint": "60b4f14ce9742f62",
  "apiFingerprint": "60b4f14ce9742f62",
  "dashboardFingerprint": "60b4f14ce9742f62",
  "workerFingerprint": "60b4f14ce9742f62"
}
```

---

## Limitations

- Local OCR on stylized flyers is noisy (garbage titles go to **review**, not verified Calendar).
- Video frames optional/bounded; full audio transcription off by default.
- Platform “N of M” chrome can mislead — reader now prefers completed Next-button enumeration over inflated chrome counts.
- First Jas matrix run showed `structure_changed` with inflated expected slides; fixed and rechecked to 7/7.
- Host memory tight during Playwright+OCR; verification kept bounded (≤4 posts / account) to avoid thrashing.

---

## Success criteria

| Criterion | Met |
| --- | --- |
| Bounded recent-post window inspected | Yes |
| Carousel slides enumerated when available | Yes (Jas 7/7 post-fix) |
| Flyer OCR with traceable evidence | Yes (local) |
| Current vs expired distinguished | Yes |
| Incomplete coverage reported honestly | Yes |
| Not merely “reachable / usable records” | Yes |
| No fabricated IG permalinks | Yes (0) |
| MATCH deploy + this report | Yes (post-deploy) |
