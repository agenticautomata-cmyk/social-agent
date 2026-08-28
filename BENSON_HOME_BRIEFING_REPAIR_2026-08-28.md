# Benson Home Briefing Repair — 2026-08-28

## Summary

Home was acting as an inventory dump (contradictory learning, raw Jul-23 scout prose, false **Pitch Ready** dining labels, Savers triplicated, unexplained −140k view deltas). It now runs through response-level briefing authority: preference conflict resolution, category guards, operational pitch labels, placement dedupe, scout scrubbing, and coherent analytics.

**Deploy fingerprints: MATCH `49e227d6efef5f10`**

## Root causes

1. **Learning** — GPT summary could claim literary interest while durable insights said disinterest; “Nothing new emerged” still listed old prefs.
2. **Scout** — `getLatestDiscovery` returned raw `web_search` markdown (Bandsintown citations/URLs) from a Jul 24 batch as if current.
3. **Pitch Ready** — `home-showroom` hard-coded `Pitch ready` for any promoted sponsor (`contactFirst ≥ 70`), ignoring operational evidence.
4. **Category** — keyword/`dining` metadata and `inferContentFraming` treated unrelated subjects as restaurant openings (Coffee & Death, Funk House Law, band interviews).
5. **Dedupe** — Best Move and Money both iterated the same sponsor list with no placement claims.
6. **Analytics** — Pulse `whatChanged` subtracted incompatible lifetime totals across snapshots (−140,673) while follower prose disagreed with live count.
7. **Mobile** — Dense Pulse + FAB over primary controls.

## Data-flow map (after)

```
/home
  HomeDashboardPanel → GET /api/pre-alpha/home
    computePreAlphaHome → buildHomeShowroom
      claimed placements: Needs You → Best Move → Money → Worth a Look
      todaysBrief + analyticsSnapshot (coherent followers)
      pitch labels via resolveHomePitchStatusLabel
      category via evaluateHomeCategoryGuard / safeHomeReason
  BensonPulseCard
    GET /api/benson-pulse/latest → coherent whatChanged (no unexplained cumulative declines)
    GET /api/benson-learning/latest → selectHomeLearningBrief (hide stale restatements)
    GET /api/benson-discovery/latest → shapeDiscoveryForHome (scrub/stale suppress)
    GET /api/benson-pulse/top-opportunities
```

## Files changed (core)

- `services/core/src/pre-alpha/home-preference-authority.ts` (new)
- `services/core/src/pre-alpha/home-category-guard.ts` (new)
- `services/core/src/pre-alpha/home-pitch-ready.ts` (new)
- `services/core/src/pre-alpha/home-placement.ts` (new)
- `services/core/src/pre-alpha/home-analytics-coherence.ts` (new)
- `services/core/src/pre-alpha/home-scout-surface.ts` (new)
- `services/core/src/pre-alpha/home-worth-a-look.ts` (new)
- `services/core/src/pre-alpha/home-briefing-authority.test.ts` (new)
- `services/core/src/pre-alpha/home-showroom.ts`
- `services/core/src/pre-alpha/home.ts`
- `services/core/src/benson-learning/index.ts`
- `services/core/src/benson-discovery/index.ts`
- `services/core/src/benson-pulse/index.ts`
- `services/core/src/inventory/content-framing.ts`
- `services/core/src/scripts/reeval-home-briefing.ts` (new)
- Prior calendar geo hardening (preserved): `url-geo.ts`, calendar eligibility, public-event eligibility

## Files changed (dashboard)

- `dashboard/lib/pre-alpha-types.ts`
- `dashboard/components/home-morning-briefing.tsx`
- `dashboard/components/benson-pulse-card.tsx`
- `dashboard/components/benson-chat-floating.tsx`
- `dashboard/app/home-dashboard-panel.tsx`

## Live findings (screenshot examples)

| Example | Before | After (live API + UI) |
|---|---|---|
| Literary learning conflict | Positive summary + negative durable insight | Learning omitted (`noNewLessons`, empty insights) |
| Bandsintown scout dump | Raw markdown + Jul 23 batch | `homeSuppressedReason: stale_scout_batch`; empty summary/items |
| Coffee & Death | Pitch Ready + dining reason | `local_story`; Worth a Look only (not Pitch Ready / dining) |
| Funk House Law | Pitch Ready + dining reason | `professional_services`; not on Home money paths |
| Train / Morton interview | Worth a Look as dining | Reclassified `entertainment`; removed from Worth a Look |
| Fragile Figures | `hotel_package` | Reclassified `attraction` |
| Savers triple | Best Move + Money + Pitch while hot | Absent from Home sections |
| −140,673 views | Shown as ordinary change | Suppressed; brief shows coherent gains |
| Followers | 6,554 vs 6,557 | Single live count **6559** everywhere |

## Before/after section behavior

| Section | Before | After |
|---|---|---|
| Pulse / Brief | Long prose + contradictory bullets | Headline + ≤3 coherent changes; filler “Nothing major” dropped when real changes exist |
| Learned | Always on, conflicting | Only when material new evidence |
| Scouted | Raw search dump | Hidden when stale/raw |
| Best Move | Hardcoded Pitch Ready | Contact needed / Worth researching / real Pitch Ready |
| Money | Up to 4 duplicate sponsors | ≤3, deduped, no article false sponsors |
| Worth a Look | Missing | Up to 3; empty OK; category-guarded |
| Creator Momentum | Pitch while hot duplicate | Compact; no duplicate cue |
| Handled | Always expanded | Collapsed `<details>` |
| FAB | Covered controls | Raised on `/home` (390×844: FAB top≈752; primary Skip/Later not overlapping) |

## Dry-run / applied cleanup

**Script:** `services/core/src/scripts/reeval-home-briefing.ts`

**Dry-run (final authority pass):** learning hide + stale scout; category proposals from `opportunityCategory` + title guard.

**Applied (bounded):**
- Coffee & Death → `local_story`
- Funk House Law → `professional_services`
- Train frontman interview → `entertainment`
- Fragile Figures (+ other museum exhibitions mis-tagged hotel_package) → `attraction`
- Over-quarantine of true food discourse → **reverted** to prior opportunity categories when food subject signals matched

No truncates; skip/dismiss/outreach/Google calendar untouched.

## Analytics consistency

- Authoritative follower count from studio pulse.
- Unexplained cumulative view declines stripped from Home-facing pulse brief.
- Live: `analyticsSnapshot.followers === creatorAnalytics.followers.count === 6559`.

## Tests

`pnpm exec tsx --test src/pre-alpha/home-briefing-authority.test.ts` — **17/17 pass**

Deploy precheck suite (eligibility + newsletter + worker-heartbeat) — **pass** (deploy gate).

## Production build / deploy

- Dashboard `next build` succeeded.
- `pnpm benson:deploy-local` completed.
- **Fingerprints MATCH `49e227d6efef5f10`** (source/api/dashboard/worker).

## Mobile verification

- Viewport: 390×844 (Android-class).
- Screenshots: `docs/ops/screenshots/home-mobile-briefing-2026-08-28.png`, `docs/ops/screenshots/home-mobile-mid-2026-08-28.png`
- Verified: no literary conflict, no Bandsintown dump, no Pitch Ready, no Savers dup, coherent followers, FAB raised.
- Today’s Brief shows concise positive deltas (no unexplained cumulative decline).

## Remaining limitations

1. Crown Center / Raphael can still use date-night framing when hotel-adjacent flags fire — status is honest (`Contact needed`), not Pitch Ready.
2. Coffee & Death may still appear in Worth a Look as a local story (not dining / not Pitch Ready).
3. Pulse `progressSummary` prose can still mention lifetime views; bullets are the Home authority.
4. Host disk remains critically low (~0.7–1.1G free); Next rebuilds are fragile.
5. Some editorial “Best of KC” items remain `needs_category_review` when dining was stored without clear food subject — intentional quarantine, not Home-promoted dining.

## Final commit SHA

`b6fa2f8cb0ea997b1ed35d810265dbb43dfe5493`

---

## Follow-up (2026-08-28 afternoon)

### Code / product fixes
1. **Home Show Worth a Look test** — non-vacuous: fixture must yield exactly one card; asserts title, `bestUse=share`, reason, `Sep 12`, source URL, non–Pitch Ready, and showroom-gate/Best Move absence. `buildWorthALook` now admits `things_to_do_weekly` without Best Move gate.
2. **Empty Pulse shell** — Pulse returns `null` when learning, scout, and top picks are all absent; progress brief lives only in Today’s Brief (no duplicate analytics body).
3. **Named brief headline** — `buildCoherentHomeAnalytics` extracts quoted post titles (`Do Good Co.`, `Most views gained from '…'`) into headlines.
4. **Single As of** — Home header shows one `As of {timestamp}`; removed `Updated` + `refreshed`.

### Tests / build / deploy
- `home-briefing-authority.test.ts` — **18/18 pass**
- Deploy precheck — **142/142 pass** (earlier full deploy)
- Dashboard production build — succeeded
- Fingerprints **MATCH `d453e0e268038792`**

### Live Home checks
- Header: `As of Aug 28, 2026…` only (no Updated/refreshed)
- Brief headline names post: `“Kansas City, this is designer shopping with a purpose”…`
- DOM section titles once each: Today’s Brief, Benson Pulse (top picks only), Best Move, Needs You, Money, Worth a Look, Creator Momentum
- No Pitch Ready labels

### Screenshots (390×844 class)
- `docs/ops/screenshots/home-mobile-full-2026-08-28.png` (+ `home-mobile-full-390-2026-08-28.png`)
- Segment proofs: `home-mobile-top-2026-08-28.png`, `home-mobile-mid-best-2026-08-28.png`, `home-mobile-worth-2026-08-28.png`
- Live DOM confirmed single section instances; stitch crops sticky chrome between frames

### Mappy disk audit (read-only findings; no durable deletes in audit)

| Path / resource | Size | Notes / recommendation |
|---|---:|---|
| `/` root LV | 57G, **~100% full** | Critical — free ≥5–10G before next Next rebuild |
| `~/.config/Cursor/User/globalStorage/state.vscdb` | **~14G** | Largest single file. Safe cleanup: quit Cursor → backup → `VACUUM`/rebuild DB or reset unused workspace state (do **not** delete while Cursor is running) |
| Docker images (all active) | **~10.3G** | `social-agent-voicebox` alone **7.94G**. Not reclaimable without removing Voicebox stack |
| `social-agent_voicebox_data` volume | **4.58G** | Active — do not prune |
| `social-agent_postgres_data` | **1.56G** | Active — do not prune |
| `/var/lib/snapd` | **3.3G** | Review unused snaps: `snap list` → `snap remove` old revisions |
| journald | **~1.1G** | Safe: `journalctl --vacuum-size=200M` |
| `/var/log` | **~1.4G** | Rotate/vacuum old logs after review |
| `/var/cache/apt` | **146M** | Safe: `sudo apt-get clean` |
| Repo `dashboard/.next` | **~315–345M** | Ephemeral — delete before rebuilds |
| Repo `.cache/instagram-meetup` | **~190M** | Rebuildable cache — safe to clear |
| Repo SQL dumps `data/backups` + `backups` | **~355M** | Keep newest 1–2; archive older off-box |
| Unused volume `social_agent_bootstrap_data` | **~81M** | Was 0-link; removed during emergency recovery after ENOSPC |
| `/tmp` | small | Safe to clear |

**Recommended safe order (manual):** (1) Cursor `state.vscdb` maintenance after quit, (2) journal/apt/snap old revisions, (3) `.next` + `.cache/*` before builds, (4) offload old DB dumps, (5) only then consider Voicebox image rebuild strategy — never `docker system prune -a` while stacks are required.

### Follow-up commit SHA
*`77648d699034a8a3d3bd695c31d187ae2a28370c`*
