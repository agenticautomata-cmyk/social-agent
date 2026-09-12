# Benson Eventbrite Watchlist Trust — Independent Verification — 2026-09-09

**Lane:** independent verification (did not implement)  
**Branch:** `release/scout-expansion-2026-07-25` @ `31bde9d` (= `origin/release/scout-expansion-2026-07-25`)  
**Code commit:** `e79075c` (fix); report tips `ca58e6a`, `31bde9d`  
**Watcher under review:** `d72be304-9338-42fc-ba12-8131dab2ed9d`  
**Implementer report:** `BENSON_EVENTBRITE_WATCHLIST_TRUST_REPAIR_2026-09-09.md`

## Verdict

**PASS — fixed with real extraction (not URL-only cosmetic).**

Configured KC listing URL is preserved; yield-aware health is enforced; live API shows **healthy** with **61** extracted / verified catalog events that match live Eventbrite HTML; deploy fingerprints **MATCH** `705df6daa09fec51`. No email/Telegram from this work.

---

## Check results

### 1. URL preservation — **PASS**

| Claim | Result | Evidence |
| --- | --- | --- |
| Submitted KC listing not overwritten by homepage | **PASS** | Live `sourceUrl` = `https://www.eventbrite.com/d/mo--kansas-city/events/`; `createWatchedSource` persists canonical/configured URL for Eventbrite directories (not `publisherUrl` origin). |
| Configured vs last-fetched separated | **PASS** | `config.lastResolvedUrl` recorded separately; check path comments + code re-assert `sourceUrl: configuredUrl`. API: both fields equal listing path after successful check. |
| Homepage-only → `needs_setup` | **PASS** | Unit test + live `POST /api/watchlist/inspect` on FB-tracked homepage → `needsSetup: true`, canonical `https://www.eventbrite.com/`. |
| Tracking params stripped without destroying path | **PASS** | Inspect of KC URL + `utm`/`fbclid` → canonical listing path intact. Tests cover FB-tracked homepage **and** clean KC URL. |
| Redirect-to-homepage classified honestly | **PASS** (code + tests) | `eventbriteListingRedirectedToHomepage` + blocked/paused paths in `eventbrite-watch.ts`; display health maps redirected → `blocked`. Not re-triggered live (listing returned 200 without homepage collapse). |

### 2. Eventbrite extraction — **PASS**

| Claim | Result | Evidence |
| --- | --- | --- |
| Real verified events (not fabricated) | **PASS** | Detail API: **62** `scoutItems`, type `eventbrite_event`, `verificationStatus: extracted`, all `/e/…` Eventbrite URLs with titles. Spot-check titles present in live KC HTML (15/15). Normalized URL overlap with live page: **58/62** IDs still on current listing (listing rotates; 4 DB-only still real Eventbrite event IDs). |
| Yield counts | **PASS** (minor drift) | Watcher config/API: `recordsExtracted=61`, `verifiedYield=61`, `newRecordsFound=1`. Scout row count is 62 (one extra persisted row vs last check’s extracted count — not fabrication). |
| Redirect/block handling honest if present | **PASS** (code) | Live fetch from verifier: HTTP 200, title “Kansas City, MO Events…”, no homepage redirect. Block/CAPTCHA markers and homepage-redirect → non-healthy statuses implemented. |

### 3. Status semantics — **PASS**

| Claim | Result | Evidence |
| --- | --- | --- |
| Healthy only with usable yield | **PASS** | `watchlistDisplayHealth` + `updateWatcherHealth(ok)` now treat zero extraction as `no_yield` / `no_change` (never healthy). Tests: 200+zero → `no_yield`; capability-established zero-new → `no_change`. |
| List and detail agree | **PASS** | List + detail API both: `displayHealth=healthy`, same explanation, same URL, `metricsLabel=pages`, `supportsReprocessLatestPost=false`. |
| Human explanation present | **PASS** | `Recent check extracted 61 events; 1 were new.` on list card, detail, and screenshots. |

**Note:** List serialization exposes `extractionCapabilityEstablished: null` even though the check writer sets it in config; display health still resolves correctly from yield counts. Low-severity API field gap, not a trust fail.

### 4. Mobile UI — **PASS** (with screenshot artifact note)

| Claim | Result | Evidence |
| --- | --- | --- |
| Directory metrics wording (not “Posts processed”) | **PASS** | Detail UI uses `Pages/items processed` when `metricsLabel === 'pages'`; live API `metricsLabel: pages`. Committed detail screenshot matches. |
| No “Reprocess latest post” for Eventbrite | **PASS** | `supportsReprocessLatestPost: false`; button gated in detail panel. Screenshot shows Check now / Open source / Pause / Remove only. |
| Configured URL + status explanation visible | **PASS** | Detail screenshot + API. “Last fetched URL” UI only renders when resolved ≠ configured (same URL → hidden); fields remain separate in API. |
| Screenshots accurate | **PASS** / **note** | Detail: `docs/ops/screenshots/…detail…` matches proofs (same hash) and API. List: **proof** shot shows Eventbrite card healthy + full KC URL; **docs** list file hash/size differs and appears cropped to “What changed” without the Eventbrite card. Treat proofs list as authoritative. Fresh Playwright re-capture timed out on `networkidle` against `:3000` — verification relied on API + committed proof screenshots. |

### 5. Deploy truth — **PASS**

```json
{
  "status": "MATCH",
  "sourceFingerprint": "705df6daa09fec51",
  "apiFingerprint": "705df6daa09fec51",
  "dashboardFingerprint": "705df6daa09fec51",
  "workerFingerprint": "705df6daa09fec51"
}
```

Re-checked via `pnpm benson:deployment-status` at verification time. Branch tip matches remote. Working tree dirty only with unrelated `dashboard/package.json` + `tsconfig.tsbuildinfo`.

**Nuance (not a fail):** `/api/health/identity` still reports `gitCommit: b4fadc6`. This repo’s deploy gate is **content fingerprint**, not git SHA — MATCH claim is correct under that contract.

### 6. Instagram / other adapters — **PASS** (smoke)

- Yield guard is directory-scoped (`applyYieldGuard: directory`); Instagram uses reliability path.
- Live Watchlist: **66** Instagram sources; sample `@jasfoodjourney` etc. still `healthy`; no suspicious mass `no_yield` on IG.
- Focused Eventbrite + watchlist-state tests: **pass**.
- `watchlist-canonical` DB test still fails expecting seeded `@jasfoodjourney` fixture — matches implementer’s pre-existing env caveat; **not** introduced as Eventbrite breakage (live IG watcher present and healthy).

### 7. Safety — **PASS**

- Eventbrite check path does not call Telegram/email delivery.
- Manual Watchlist checks use `suppressAlerts: true` on early-signal path.
- Commit file list has no mail/Telegram delivery artifacts.
- This verification lane sent **no** email/Telegram/publish.

---

## Gaps / residual risks (non-blocking)

1. Docs vs proofs **list** screenshot inconsistency (detail OK).
2. Scout item count 62 vs last-check extracted 61.
3. `extractionCapabilityEstablished` not clearly exposed on list payload.
4. Fresh headless UI re-shot failed (`networkidle` timeout); live truth confirmed via API + proof screenshots.
5. Catalog depth limited to listing-card evidence (acknowledged in implementer report).

---

## Bottom line for Elliott

**Independent verdict: PASS — fixed with extraction.**  
Root cause repair is real: listing path preserved, healthy requires yield, live KC Eventbrite watcher is healthy with ~61 real catalog events, deploy fingerprint MATCH. Not a cosmetic URL-only change. No notifications sent.
