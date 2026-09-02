# Benson Watchlist Intelligence Repair — 2026-09-02

## Executive summary

Watchlist is Benson’s information radar again. Production Chromium no longer lives in a disposable `~/.cache/ms-playwright` folder. Manual and scheduled checks persist honest success/failure, always have an explainable next check, and process Instagram posts incrementally.

`@boonetheater` had never produced information because Playwright’s browser was gone after cache cleanup **and** a failed launch did not write last-failure state or a next check. After this repair a real Check now opened the profile, processed 12 recent posts, extracted one verified event (Ghostface Killah Official After Party, 2026-09-02, Boone Theater), promoted it to Early Signals, scheduled the next check in 12 hours, and a repeat check reported “12 already processed · 0 new.”

Visit KC Events RSS (non-Instagram) checked successfully in the same pass.

This pass does **not** generate pitches or change Discover trust, Home briefing, or public-event eligibility.

## Production inventory and audit counts

Inspected all **42** `source_watchers` rows on 2026-09-02 before the Boone repair check.

| Metric | Count |
|---:|---:|
| Total watched sources | 42 |
| Instagram | 26 |
| Web | 14 |
| RSS | 1 |
| Unknown/disabled (replaced Crossroads URL) | 1 |
| Pending / never successfully checked | 11 (all Instagram, including Boone) |
| Successful at least once | 31 |
| Failed (last failure after last success) | 0 — Boone’s browser miss was **not persisted** |
| No scheduled next check (UI used last success only) | 12 |
| Auth / anti-bot blocked | 0 (shared IG session file present) |
| Sources with a missing-browser run in history | 4 |
| Curator posts stored | 362 |
| Curator events extracted | 194 |
| Verified accepted leads | 89 |
| Rejected/expired/dismissed leads | 3 |
| Scout run hidden/skipped counts (historical) | 3428 |
| Zero curator yield (no posts/leads) | 27 — includes all web/RSS rows (they do not use curator tables) plus 11 never-checked IG accounts |

A source is not healthy merely because a row exists. The 11 pending Instagram accounts had `session: ready` and **zero** successful checks.

### After-repair live inventory (2026-09-02 ~04:31Z)

`GET /api/watchlist` after Boone + Visit KC verification and the next Instagram scheduler cycle:

| Metric | Count |
|---:|---:|
| Total watched sources | 42 |
| Instagram / web / RSS | 26 / 15 / 1 |
| **Healthy** (real last success + next check) | **31** |
| **Ready** (never successfully checked; due now) | **10** |
| **Unsupported** (disabled Crossroads KC row) | **1** |
| Failed / blocked / degraded | 0 |
| Missing next check | 1 (Crossroads, disabled — expected) |

The 10 ready Instagram accounts are queued, not blocked. The scheduler cap remains 3 due Instagram sources per ~4h cycle. Three previously healthy Instagram accounts (`@royalmansion6240`, `@swiftscajuncuisine`, `@bizzybodyb007`) also completed real checks during this window.

## Root causes

1. **Disposable Playwright cache.** `chromium.launch()` used Playwright’s default `~/.cache/ms-playwright`. Disk cleanup removed it. Manual Boone check failed with `Executable doesn't exist … chromium_headless_shell-1217`.
2. **Failure not persisted** when `openInstagramSession()` returned no browser. Scheduler wrote `lastAttemptedCheck` and a run row, but `lastFailureAt` / `healthStatus` stayed `pending` / empty.
3. **Next check required `lastSuccessfulCheck`.** Never-checked or failed sources showed “—”.
4. **Operator UI leaked filesystem paths** from the raw Playwright error.
5. **No deploy precheck** for the browser executable. Workers could start “healthy” and then fail every IG check.
6. **No download-on-start policy.** After the cache vanished, nothing reinstalled Chromium until a human noticed Boone.

Incremental identity, posting-batch processing, and Early Signal promotion already existed and worked once the browser launched.

## Browser provisioning repair

Durable install:

- Path: `PLAYWRIGHT_BROWSERS_PATH` or `<repo>/.benson/playwright` (gitignored).
- **Not** `~/.cache/ms-playwright` and not Elliott’s home directory unless an operator overrides the env var.
- `scripts/ensure-playwright.sh` installs Chromium **once** when missing (deploy path).
- Worker/API start **export the path only** — they do not download.
- `services/core/src/playwright-runtime/cli-precheck.ts` fails deploy if the executable is missing.
- Launch uses `launchManagedChromium()` with an explicit `executablePath`.
- Sessions still use the existing `SCOUT_INSTAGRAM_PROFILE_DIR` / `storage-state.json` (no credentials in logs).
- Cleanup remains `browser.close()` in `finally` (no persistent userDataDir profiles).

### Browser executable path and disk usage

| Field | Value |
|---|---|
| Browsers directory | `/home/elliott/Projects/kellie-assistant/social-agent/.benson/playwright` |
| Chromium executable | `.benson/playwright/chromium-1217/chrome-linux64/chrome` |
| Installed size | **628.1 MB** (`du` 631M) — Chromium + headless shell + Playwright ffmpeg |
| Disk after install | ~16G free on the root volume (was 16G before; this is not another 14G cache) |

## Scheduling/state repair

- `nextScheduledCheckAt` always returns a time for enabled, unpaused sources: due now if never attempted; last success + frequency after a real success; **15 minutes** after a missing-browser failure so a deploy can recover without waiting 12 hours.
- `watchlistDisplayHealth` is derived from worker fields: ready / checking / healthy / degraded / blocked / failed / unsupported. Stored `health_status` is still updated (`failed` on real failure, `healthy` only after a real success).
- Manual Check now now writes `lastFailureAt` + operator-safe message when the browser cannot launch.
- Success still clears failure fields only after a real pipeline success.
- Concurrent checks still share `curator-watchlist-check.lock`.
- Scheduler worker marker remains the live PID file.

## Platform-by-platform support status

| Platform | How it is collected | Status after this pass |
|---|---|---|
| Instagram accounts | Authenticated Playwright + shared `storage-state.json` | **Supported when the shared session is seeded.** Boone succeeded. 10 other IG accounts were still never-checked at audit time (scheduler cap: 3 due sources per 4h cycle). |
| Instagram one-off posts | Same session, `SINGLE_ITEM` | Supported; not re-tested here |
| Web HTML watch | HTTP early-signals adapters (no Playwright) | Working — several sources last succeeded 2026-09-02 ~03:40 |
| RSS | HTTP early-signals | **Verified live:** Visit KC Events RSS Check now succeeded |
| Socrata / civic JSON | HTTP adapters | Working on the same early-signals cycle |
| Facebook / TikTok watch | Not a live Watchlist adapter | Unsupported (no new sources added) |

## Instagram session status (no secrets)

- `SCOUT_INSTAGRAM_PROFILE_DIR` is configured.
- `storage-state.json` is present.
- Boone Check now used the shared session and opened the public profile grid.
- No login wall, captcha, or consent block was observed on this check.
- Session cookies/tokens were not logged, committed, or shown in the UI.

## Incremental-post identity and posting-batch behavior

- Identity keys: normalized Instagram URL + shortcode (`instagramPostIdentityKeys`).
- Fingerprint: `sha256(postUrl|caption|slideCount)`.
- Each check inspects up to ~12 recent grid posts.
- New posts in that window are all processed (Boone: 12 new on the first successful check).
- Repeat check: **12 already processed · 0 new**. Lead count stayed 1.
- Historical posts already stored are not re-presented as new.

## Extraction and rejection behavior

- Caption + carousel OCR + roundup parser + research (existing pipeline).
- Page chrome / already-processed posts are inspection skips, not findings.
- Boone yield this pass: **1 verified event** from 12 posts (other posts produced no dated event lead).
- Discover trust rules were not loosened. Calendar eligibility helpers were not changed.

## Downstream information flow

Accepted curator leads still:

1. Persist on `curator_event_leads` with the Instagram post URL and handle.
2. Promote to `early_signals` (`signal_type: curator_event_lead`, `source_category: curator_watchlist`) for Watchlist + Signals UI.
3. Become Discover `content_items` only after existing verify/promote actions — **not** automatically from every scrape.
4. Remain calendar-eligible via `populationSource: 'instagram_watchlist'` when dates/venues qualify.

Boone’s finding: Early Signal `d53c6d30-053d-48fd-adde-dc006c276819`, source post `https://www.instagram.com/p/DcpBspFAGLL/`, Watchlist `/watchlist/c4a1f301-6008-432b-86da-187470805dd0`.

Web/RSS findings continue through early-signals snapshots, not curator tables.

No pitch generation.

## Files and migrations changed

**No database migration.**

New:

- `services/core/src/playwright-runtime/index.ts`
- `services/core/src/playwright-runtime/cli-precheck.ts`
- `services/core/src/playwright-runtime/playwright-runtime.test.ts`
- `services/core/src/curator-watchlist/watchlist-state.ts`
- `services/core/src/curator-watchlist/watchlist-state.test.ts`
- `scripts/ensure-playwright.sh`

Edited:

- `instagram-session.ts`, `pipeline.ts`, `scheduler.ts`, `store.ts`, `index.ts`
- `benson-scout/watchlist.ts`, `benson-scout/types.ts`
- `ask-benson/url-intake-pipeline.ts` (same managed Chromium)
- `scripts/benson-runtime-lib.sh`, `scripts/benson-deploy-local.sh`
- `.gitignore` (`.benson/`), `.env.example`
- `dashboard/app/watchlist/[id]/watchlist-detail-panel.tsx`
- `dashboard/app/watchlist/watchlist-panel.tsx`

## Production cleanup performed

- No Watchlist rows deleted.
- No fake posts inserted.
- Installed Chromium into `.benson/playwright` only.
- Did not restore the old 14 GB Cursor cache.
- Boone’s leftover research/interest from Discover tests was not involved.

## Tests and exact results

| Suite | Result |
|---|---|
| Playwright runtime + Watchlist state + scheduler + inspection + Discover trust + calendar eligibility | **100/100** |
| Deploy precheck (calendar, newsletter, worker-heartbeat, Watchlist/Playwright extras) | **160/160** |
| Dashboard `tsc --noEmit` | pass |
| Instagram session DB fixture (`@jasfoodjourney` on empty test DB) | 1 pre-existing skip/fail when the test database has no production row — not loosened |

## Deployment/precheck results

- `ensure-playwright.sh`: installed once into `.benson/playwright`, then precheck OK
- `tsx src/playwright-runtime/cli-precheck.ts`: executable present
- API + workers restarted with `PLAYWRIGHT_BROWSERS_PATH=<repo>/.benson/playwright` (export only; no download on start)
- Dashboard production `next build` + `next start` on `:3000` after the UI change
- Existing deploy precheck extras: Playwright runtime + Watchlist state tests included
- Worker / dashboard / API fingerprints: **MATCH `cce2a2122ed94b98`**

## Public mobile and desktop verification

Verified on 2026-09-02 against the live public site (not a screenshot-only render).

| Check | Result |
|---|---|
| Boone Check now (manual) | Success: 12 posts, 12 new, 1 verified event |
| Boone scheduled path | Next check `2026-09-02T16:21:12.057Z` (12h). Scheduler also checked three other due IG accounts in this window. |
| Visit KC Events RSS | Check now success; next check `2026-09-02T10:20:50.694Z` (6h); public detail **healthy** |
| Error cleared only after real success | Last failed = None; old missing-browser run sanitized to “Benson could not open its browser…” |
| Next scheduled check populated | Boone 4:21 PM; Visit KC 10:20 AM; ready sources show due now |
| Incremental posts | First check 12 new; repeat 12 already processed · 0 new |
| Posting batch | All 12 grid posts evaluated, not only the newest |
| Repeated-check dedupe | Lead count stayed 1 |
| Downstream | Early Signal `d53c6d30-053d-48fd-adde-dc006c276819` — Ghostface Killah Official After Party, Watchlist provenance, Instagram source link |
| Discover auto-flood | Not performed; finding remains on Watchlist + Early Signals pending existing verify |
| Public pages | `https://benson.kckellie.com` home 200; `/watchlist` 200; Boone detail 200 |
| Public API | `https://api.kckellie.com/api/watchlist` 200; Boone `displayHealth=healthy` |

Public Boone detail (mobile 390×844 and desktop 1440×900):

- Status **healthy**, session ready, every 12h
- Last successful `9/2/2026, 4:21:12 AM`; last attempted `4:21:00 AM`; last failed **None**
- Next scheduled `9/2/2026, 4:21:12 PM`
- Posts 12 · events 1 · verified yield 1 · reliability 80%
- Event lead: Ghostface Killah Official After Party · 2026-09-02 · 10:00 PM · Boone Theater
- Run history includes the sanitized browser failure (no filesystem path) plus both incremental inspections
- Check now idle (not stuck)

Public list labels: Boone / Visit KC **Healthy**; never-checked IG accounts **Ready**; Crossroads KC **Stopped** / unsupported.

Screenshots:

| Surface | Path |
|---|---|
| Watchlist Boone mobile 390×844 | `docs/ops/screenshots/watchlist-intelligence-repair-2026-09-02-boone-mobile.png` |
| Watchlist Boone desktop | `docs/ops/screenshots/watchlist-intelligence-repair-2026-09-02-boone-desktop.png` |

## Fingerprints

```
status: MATCH
sourceFingerprint: cce2a2122ed94b98
apiFingerprint: cce2a2122ed94b98
dashboardFingerprint: cce2a2122ed94b98
workerFingerprint: cce2a2122ed94b98
checkedAt: 2026-09-02T04:31:06.559Z
```

## Commit hash and branch

Branch: `release/scout-expansion-2026-07-25`

Implementation commit recorded after push.

## Remaining limitations and blocked sources

1. **Ten Instagram accounts** are still never-checked (`@goodiesparty_`, `@hobotone`, `@vyelounge`, `@romeo_ryonell`, `@comeupseason816_`, `@elevationgrille`, `@theblueroomkc`, `@rio.entertainment`, `@stashhouse_kd`, `@ozone_show`). The scheduler processes at most three due Instagram sources per 4-hour cycle. They are **ready**, not blocked.
2. Historical `scout_source_runs` rows may still contain old Playwright paths in the database; the API now sanitizes them on read.
3. Instagram remains authenticated-browser collection. If Meta serves a login/challenge page later, the source must show **blocked** — this pass did not observe a challenge and did not fake support.
4. Web/RSS “healthy” means the adapter ran, not that each civic page produced a creator-facing event. Visit KC’s curator “event leads” panel is Instagram-oriented; RSS items appear under Detected posts / Early Signals.
5. Watchlist findings still do not auto-flood Discover; they stay on Watchlist / Early Signals until existing verify actions.
6. No Facebook or TikTok Watchlist adapter exists. None were added.

## Before-and-after (Boone)

| Field | Before | After |
|---|---|---|
| Status | pending | healthy |
| Last successful | Never | 2026-09-02T04:20:38Z |
| Last failed | None (not persisted) | None (cleared after real success) |
| Next check | — | 2026-09-02T16:20:38Z |
| Posts processed | 0 | 12 |
| Events extracted | 0 | 1 verified |
| Repeat check | n/a | 12 already processed, 0 new |
