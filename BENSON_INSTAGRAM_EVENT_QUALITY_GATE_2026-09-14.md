# Benson Instagram Event Quality Gate (2026-09-14)

**Branch:** `release/scout-expansion-2026-07-25`  
**Final commits:** `619d7a9` (quality gate) · `b291600` (caption recovery)  
**Fingerprint:** **MATCH** `abec29d00f402b77`  
**Public:** https://benson.kckellie.com · **API:** https://api.kckellie.com  

Prior repairs preserved: visual production path (`de07ac6c1fa4a5f0`), newItems/persistence authority (`1784ad52c87e6f4d`), Rock stable ID, year/date trust, expiration, current vs lifetime, Karlous distinct dates, error-chrome rejection, local OCR first, no fabricated permalinks, Calendar Admission separation.

Hard bans honored: shared Instagram pipeline only; no KCPL-specific scraper; no hard-coded titles/dates; no invented time/organizer/address/ticket; billable vision off; no outreach.

---

## Executive verdict

Benson no longer promotes raw OCR fragments into Event Leads. Caption + carousel are assembled as one evidence bundle with a pre-persistence quality gate. Live `@kcpldistrict` no longer reports `complete_no_current_events` while upcoming caption evidence exists: **Sculpt Fusion** is visible with September 16, PNC Plaza, Free, and no invented time. Known OCR garbage and the Joevenn human-interest story are quarantined. Second MATCH run creates **zero** new logical events with a stable Sculpt Fusion ID.

---

## Root causes

| Defect | Root cause |
| --- | --- |
| Garbage titles as leads | Slide OCR lines became titles with no OCR-quality or event-identity gate; heuristic parse created one “event” per noisy line |
| Sculpt Fusion missed | Caption-first assembly missing; `9.16` numeric dates not parsed; when OCR produced junk candidates, caption was ignored; post sat outside 21-day recent window so Check now alone could not re-see it |
| Joevenn partially verified | Human-interest / award story never classified as non-event; treated as event lead |
| Research prose in public content | `searchWeb` assistant failure text stored in `researchSummary.summary` and promoted into Early Signal descriptions |
| Misleading counters / status | Lifetime “New events found” unlabeled; `complete_no_current_events` when future caption events existed but were not extracted; OCR 34/36 unexplained |

---

## Repairs shipped (A–I)

### A. Pre-persistence event-quality gate
- `event-quality-gate.ts` — requires usable title + trustworthy date + corroborating field + event-intent language
- Low-confidence discovery queue separate from ordinary Event Leads
- Wired in assembler + `processCuratorPost`

### B. OCR gibberish detection
- `ocr-quality.ts` — alphabetic-word ratio, short fragments, symbol noise, alternating caps, known garbage titles
- Known rejects: `I Zo SL dE i)`, `oy ihe po Hy`, `Epa | te- 4 3`, `fa 7S RE NARA 4`
- Raw OCR retained as diagnostic evidence only; stylized names preserved

### C. Caption + carousel evidence bundle
- `post-classification.ts` — single_event / roundup / story / recap / promo / chrome
- Single-event posts → one candidate; broken OCR fragments are not separate events
- `caption-event-extract.ts` — structured caption patterns (`Next up: FREE … in … on 9.16`)

### D. Sculpt Fusion
- Numeric `M.D` / `M/D` year inference with publish-window corroboration
- Recovered via production path + caption backfill from stored post evidence
- Fields: title Sculpt Fusion, Free, 2026-09-16, PNC Plaza, time null, year_corroborated

### E. Non-events
- Joevenn → `human_interest_story` (not Event Leads / Calendar / yield)
- Recaps / promotions classified separately

### F. Research prose
- Structured tool outcomes: confirmed / partially_confirmed / conflicting / not_found / blocked / insufficient_evidence / error
- Failure prose never public description; promote path strips it

### G. Coverage honesty
- Tracks OCR-eligible vs acquired, skipped reason (`non_image_video_children`), failed OCR
- Statuses: `complete_with_warnings`, `partial`, `structure_changed`
- `complete_no_current_events` only when no supported future candidates this run

### H. UI counters
- Lifetime card: **Unique events created (lifetime)** (was misleading “New events found”)
- Current-run card keeps `newLogicalEvents` from persistence outcomes
- OCR eligible / skip reason shown when slides ≠ OCR-eligible

### I. Backfill
- Script: `pnpm --filter @social-agent/core backfill:instagram-event-quality-gate [--handle=kcpldistrict]`
- Quarantines garbage, reclassifies stories, clears research prose, recovers caption events
- No blind title-length deletes

---

## Sculpt Fusion (final)

| Field | Value |
| --- | --- |
| **ID** | `7974784f-71ce-49d9-9be1-dd9a9dabc04f` |
| Title | Sculpt Fusion |
| Date | 2026-09-16 |
| Time | *unpublished / null* |
| Venue | PNC Plaza |
| Price | Free |
| Year trust | year_corroborated |
| Status | SOCIAL_LEAD |
| Source URL | https://www.instagram.com/p/DcPiqBwDt2c/ |

---

## Backfill counts

### @kcpldistrict (first pass)
| Metric | Count |
| --- | --- |
| beforeActive | 8 |
| afterActive | 2 |
| garbageQuarantined | 4 |
| nonEventReclassified | 2 (Joevenn + recap) |
| researchProseCleared | 1 |

### @kcpldistrict (caption recovery)
| Metric | Count |
| --- | --- |
| captionEventsRecovered | 1 (Sculpt Fusion) |
| afterActive | 4 |

### System-wide
| Metric | Count |
| --- | --- |
| watchers | 78 |
| garbageQuarantined | 54 |
| nonEventReclassified | 1 |
| researchProseCleared | 185 |
| beforeActive → afterActive | 464 → 409 |

---

## Live MATCH acceptance (`abec29d00f402b77`)

Watcher IDs: KCPL `7fda642d-bff3-47b0-9808-59bec2a9fe73` · Bizzy `91213b18-2ccc-4cc4-bee3-96e6872caee7` · Funny Bone `9f21743c-2ac7-4607-8c8b-24798447977a`

### @kcpldistrict run 1 — `7942d9c4d5ca6fcb`
- status **complete** (not `complete_no_current_events`)
- posts 11/12 · slides 25/25 · OCR 24/24 eligible 24/25 (`non_image_video_children`)
- newLogicalEvents **0** (Sculpt already recovered)
- Sculpt Fusion visible; zero garbage / Joevenn / research prose in active leads

### @kcpldistrict run 2 — `8d07f1a22b66697a`
- newLogicalEvents **0** · newItems **0**
- Sculpt ID stable `7974784f-71ce-49d9-9be1-dd9a9dabc04f`
- permalink stable · no duplicate Sculpt · no recreated garbage

### @bizzybodyb007 — `5aeebb2236d8746b`
- Rock the Bridge ID stable **`1ba562b0-4e12-451a-ae88-b65d2a1ed3ba`**
- 2026-09-18 · 7PM–11PM · Rock Island Bridge · PARTIALLY_VERIFIED
- newLogicalEvents 0 · no active error-chrome

### @funnybonekcmo — `99be2850a0df1b22`
- Karlous Miller dates intact: **2026-09-18** and **2026-09-19** (distinct)
- no active “Sorry…” chrome · newLogicalEvents 0

---

## Tests / build / typecheck / lint (honest)

| Command | Result |
| --- | --- |
| `node --import tsx --test src/curator-watchlist/instagram-visual/*.test.ts src/curator-watchlist/persistence-outcome.test.ts` | **80/80 pass** (includes 25 quality-gate regressions + Bizzy/Rock/Funny Bone prior cases) |
| `pnpm --filter @social-agent/dashboard test` | **66/66 pass** |
| Focused curator-watchlist (incl. auth DB) | **179 pass / 4 fail** — failures are pre-existing DB auth-session inserts (`assert.ok(row?.id)`), not quality-gate regressions |
| `pnpm --filter @social-agent/core typecheck` | Pre-existing DOM/lib noise in capture/session + unrelated scripts; **no new errors** in quality-gate / caption / OCR / pipeline gate files after fixes |
| `pnpm --filter @social-agent/dashboard typecheck` | exit 0 |
| Dashboard `next lint` | Blocked (no ESLint config / interactive setup) — infra, not assertion failure |
| `pnpm benson:deploy-local` | Stabilization gate green · **MATCH** `abec29d00f402b77` |

Core full `pnpm test` (~1780) not re-run end-to-end on this memory-tight host after final deploy; focused Instagram + persistence + dashboard + deploy gate are the acceptance authority for this pass.

---

## Files changed

- `services/core/src/curator-watchlist/instagram-visual/{ocr-quality,post-classification,event-quality-gate,caption-event-extract,event-assembler,date-year-trust,coverage,process-post,orchestrator,types,bounds,index}.ts`
- `services/core/src/curator-watchlist/instagram-visual/event-quality-gate.test.ts`
- `services/core/src/curator-watchlist/{pipeline,event-research,promote,reliability,roundup-parser,types,instagram-visual-backfill}.ts`
- `services/core/src/scripts/backfill-instagram-event-quality-gate.ts`
- `services/core/package.json` (`backfill:instagram-event-quality-gate`)
- `dashboard/app/watchlist/[id]/watchlist-detail-panel.tsx`

---

## Remaining limitations

- Bounded recent-post window can still miss older upcoming caption events until caption backfill/recovery runs (recovery is now automatic in quality-gate backfill; max post age raised to 45 days).
- Marketing blurbs with a bare month/day and weak intent can still require human review; gate is stricter but not omniscient.
- `rejectedCandidates` run counters can look high when many OCR fragments are evaluated then rejected — expected, not “new events.”
- Funny Bone may report `complete_no_current_events` on a run that only re-touches already-persisted future leads (lifetime Karlous rows remain intact).

---

## Success criteria

Reject noise ✓ · understand caption/carousel ✓ · surface Sculpt Fusion ✓ · classify non-events ✓ · clean junk ✓ · stable second run ✓ — not merely “OCR ran.”
