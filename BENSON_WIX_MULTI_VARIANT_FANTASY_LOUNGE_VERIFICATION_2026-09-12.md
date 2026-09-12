# Benson Wix Multi-Variant Fantasy Lounge — Independent Verification (2026-09-12)

**Verifier role:** adversarial, non-implementer  
**Primary claim under review:** `BENSON_WIX_MULTI_VARIANT_FANTASY_LOUNGE_REPAIR_2026-09-12.md`  
**Watcher:** `a2f69814-f54b-4cbb-88c1-9501d65335f0`  
**Configured URL:** `https://www.thefantasylounge.com/event-list`  
**Checked at:** 2026-09-12 (~02:17–02:24Z)  
**Commits observed on `origin/release/scout-expansion-2026-07-25`:** `585e7f6`, `7768661`, `f5a2c6b`

## Verdict

**PARTIAL**

Fantasy Lounge **does** extract and group 8 ticket/RSVP nights from live Wix hydration (`wix_events_hydration`), persists them with stable fingerprints, second-run `no_change`, URL preserved, deploy **MATCH** `1ec1ac9d9c6206ed`, regressions operational, and no outreach in the repair window.

Two material claim misses keep this from PASS:

1. **Companion `soldOut` merge is wrong for all 8 nights** — ticket cards are `soldOut:false` (priced inventory); themed RSVP cards are `soldOut:true`; merge prefers the themed primary (`primary.soldOut ?? secondary.soldOut`) so every night persists `soldOut:true`.
2. **UI claim overstated** — companion `productionGroupKey` forces the theater **production_groups** card path, so the detail page shows themed title / venue / expandable `YYYY-MM-DD · 21:00` / single **Open tickets** link. It does **not** surface members/vetted, dual Ticket+RSVP actions, evidence, or sold-out in the event cards (those fields exist only on the unused per-item branch).

---

## Check results

| # | Check | Result |
| --- | --- | --- |
| 1 | Deployment parity MATCH `1ec1ac9d9c6206ed` | **PASS** |
| 2 | Live FL page vs extract / DB / API | **PASS** (titles, dates, ticket+RSVP URLs, members/vetted in data) |
| 3 | Companion grouping + unrelated same-night | **PASS** (live pairs + fixture #4) |
| 4 | Configured URL + Wix-specific method | **PASS** |
| 5 | Second-run idempotency / stable identities | **PASS** (re-verified) |
| 6 | Regressions (Vine / Cannabis / MTH / Melting / Eventbrite / OSC) | **PASS** (with known Vine inventory drift) |
| 7 | No outreach / alerts | **PASS** |
| 8 | UI date/time/restrictions/actions as claimed | **PARTIAL / FAIL vs claim** |

---

### 1. Deployment — **PASS**

Independent `pnpm benson:deployment-status` (before and after verifier re-checks):

```json
{
  "status": "MATCH",
  "sourceFingerprint": "1ec1ac9d9c6206ed",
  "apiFingerprint": "1ec1ac9d9c6206ed",
  "dashboardFingerprint": "1ec1ac9d9c6206ed",
  "workerFingerprint": "1ec1ac9d9c6206ed"
}
```

Matches repair report. Commits `585e7f6` / `7768661` / `f5a2c6b` are on remote release branch tip.

---

### 2. Live Fantasy Lounge vs persisted / API — **PASS** (data plane)

**Live page:** HTTP 200, ~1.6 MB, URL unchanged. Sixteen public card titles (8 base + 8 `Theme:…` companions). Detail paths are `/event-details/…` only (`event-details-registration` count = 0). Descriptions contain members-only / vetted language; no explicit `21+` string in sampled list payload (agrees with report).

**Independent extract** of fetched HTML via `extractEventListingsFromHtml`:

| Metric | Value |
| --- | --- |
| Method | `wix_events_hydration` |
| Strategies | `json_ld` → `wix_events_hydration` |
| Grouped nights | **8** |
| Companion pairs | **8** |
| Detail prefix | `event-details` |

All eight nights match the report’s title/date set (Sep 12 → Oct 30, `9:00 PM`, venue Fantasy Lounge). Ticket URLs are unthemed `/event-details/…`; RSVP URLs are themed siblings.

**DB / API:** `adapter_type=event_listing`, `extractionMethod`/`listingPlatform`=`wix_events`, `rawCandidatesDetected=16`, `groupedEventNights=8`, `companionPairsLinked=8`, `verifiedYield=8`, `contentOutcome`/`displayHealth`=`no_change`. Eight scout items; 8/8 title/date/time/ticket/rsvp/members/vetted match independent extract. `reviewOnly: true` on relevance.

**Discrepancy (data):** every persisted night has `soldOut: true`. Live hydration shows ticket companions `registration.ticketing.soldOut=false` (with `$67.04`–`$111.73` prices) and RSVP companions `soldOut=true`. Merge at `wix-events-extract.ts` uses themed primary’s flag, so tickets-available nights are stored as sold out.

---

### 3. Companion grouping — **PASS**

- Live: each night retains two Wix IDs + both public detail URLs; themed display title; base title as alias where applicable.
- Ticket vs RSVP role assignment spot-checked for all 8 (base slug = ticket, `theme-…` slug = RSVP).
- Unrelated same-night: no live FL counterexample (all nights are intentional pairs). Fixture `wix-same-night-unrelated` + unit test #4 keep Alpha/Beta separate with `companionPairsLinked=0`. Suite: **16/16** pass in `wix-events-extract.test.ts`.
- Vine same-calendar-night unrelated pair (Jammin’ at the Juke + The Vine Room, both 2026-10-01) remains two listings under Vine extraction (not wrongly merged).

---

### 4. URL + method — **PASS**

- `sourceUrl` = `submittedUrl` = `canonicalSourceUrl` = `lastResolvedUrl` = `https://www.thefantasylounge.com/event-list`.
- Pre-repair run in history: `http_then_browser` / 0 items. Post-repair runs: `wix_events_hydration` only.
- `EVENT_PATH_RE` now includes `event-list` in both `url-inspect.ts` and `event-listing-extract.ts`.
- Not generic `http_then_browser` for successful checks.

---

### 5. Idempotency — **PASS** (re-checked)

Verifier `runWatcherNow(FL)` after implementer baseline/no_change:

- `displayHealth=no_change`, `newItems=0`, `verifiedYield=8`
- Item count remained 8; occurrence fingerprints **stable** (`fps stable true`)
- Explanation still reports raw 16 / nights 8 / companions 8

---

### 6. Regressions — **PASS** (with noted inventory drift)

Independent `runWatcherNow` re-checks against current live:

| Source | Extract / health | Notes |
| --- | --- | --- |
| 18th & Vine | `wix_events_hydration`, 6, `no_change`, URL preserved | Live extract 6; DB still **7** scout rows (stale `Late Night Jam Session` 2026-09-11 plus current 2026-09-18). Yield/status honest; inventory not purged. Report already flagged. |
| Cannabis Network KC | `wix_events`, 0, supported empty / `no_upcoming_events` | Independent HTML extract also 0 verified listings |
| Music Theater Heritage | `wordpress_tec_rest`, 18, `no_change` | URL preserved |
| KC Melting Pot | `theater_season`, 4 groups / 36 performances, `no_change` | DB item count 37 (one historical extra) |
| Eventbrite KC | operational, 59 this check, `no_change` | Inventory larger than current yield (82) — pre-existing |
| The OSC | `squarespace_events`, 36, `no_change` | URL preserved |

No Fantasy Lounge regression of Vine’s `/event-details-registration/` path (Vine still uses that prefix).

---

### 7. Safety / outreach — **PASS**

- No login/membership/RSVP/purchase automation exercised by verifier or evidenced in run metadata.
- `outreach_emails` since `2026-09-12T01:00:00Z`: **0** rows total; fantasy-keyword hits **0**.
- `telegram_outbox` / `alert_outbox` / `notification_outbox` / `scout_alerts` absent.
- Persisted relevance includes `reviewOnly: true`; UI copy states no auto-pitches/alerts from this check.
- No credentials exposed in this verification.

---

### 8. UI — **PARTIAL** (claim not fully met)

Headless Playwright against local dashboard ` /watchlist/a2f69814-… `:

**Present:** configured URL; status **no change**; explanation with raw/nights/companions; health **Companion pairs 8**; eight themed titles; venue Fantasy Lounge; expandable dates `2026-09-12 · 21:00` (from `startDateTime`, not the `9:00 PM` `startTimeLocal` string); **Open tickets** → ticket detail URL.

**Missing vs repair claim** (because `useProductionGroups` is true whenever any `productionGroupKey` exists — companion nights set that key via `productionGroupKey: companionGroupKey`):

- No **Members only** / **Vetted guests** on cards
- No separate **Ticket link** + **RSVP link** (RSVP URL not linked in this path)
- No evidence / companion-ID line on cards
- Sold-out chip not shown in this path (data still wrong if the rich branch were used)

The rich per-item UI branch in `watchlist-detail-panel.tsx` (members/vetted, Ticket+RSVP, evidence) is implemented but **not selected** for Fantasy Lounge.

---

## Root-cause claims

| Claim | Verifier assessment |
| --- | --- |
| `/event-list` missed `EVENT_PATH_RE` → never hit Wix adapter | **Supported** — pre-repair run `http_then_browser`/0; path regex now includes `event-list`; post-repair Wix method |
| Hard-coded `/event-details-registration/` vs FL `/event-details/` | **Supported** — live FL uses `/event-details/`; Vine still `/event-details-registration/` via href-frequency |
| Missing companion model | **Supported** — 16→8 with paired URLs/IDs |

---

## Discrepancies summary

1. **`soldOut` false positive on all 8 companion nights** (ticket `false` + RSVP `true` → night `true`).
2. **UI overclaim:** production-group presentation hides restrictions and RSVP action despite API having them; time shown as 24h `21:00` when expanded.
3. **Vine / Melting / Eventbrite** scout inventories can exceed current verified yield (stale rows); extraction yields match live — status not false-healthy.

None of the above are safety/outreach failures; none required implementation edits under verifier bans.

---

## Ready for follow-up?

**YES — for a small repair pass:** (a) companion `soldOut` should prefer ticket companion / only treat night sold-out when ticket inventory is sold out; (b) `wix_companion_nights` (or non-`theater_season`) should use the rich event card UI, or production-group cards should expose members/vetted + Ticket and RSVP links.

Core extraction + deploy + regression posture is otherwise sound.
