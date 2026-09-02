# Benson Discover Trust Pass — 2026-09-02

## Executive summary

Discover is now Kellie’s review inbox: one honest primary action per card, canonical identity so the same opportunity is not listed twice, feed-time suppression of raw scraper text / hub SKUs / stale or implausible dates / trade conferences, and durable Post now / Pitch / Save / Skip that actually leave the feed.

Home remains the concise briefing. The latest TikTok posting batch still reports per-video view deltas and follower growth once. Calendar eligibility, public-event extraction, and Home Pulse action types were not changed.

**Deploy fingerprints: MATCH `361e12534f389f15`**

**Commit branch:** `release/scout-expansion-2026-07-25`

## Original defects and root causes

Inspected the live `GET /api/creator-interest/discoveries/feed?limit=40` on 2026-09-02 *before* this pass (deployed API was still the pre-repair worker). The older Discover audits did not match this feed.

| Defect | Actual cause |
|---|---|
| Every card said **Add to Things To Do** | `discoverPrimaryAction` only emitted `add_to_today` / `review` / `open_program`. There was no Post now / Pitch / Save / Skip contract on Discover. |
| Kansas City Royals ×4, KKFI ×2, same-path URL extras | Display title preferred `listing.businessName` over the event. Feed collapse used **coreTitle-only**, which both missed venue-name clones and is too vague to merge safely. Ingest keyed on exact `sourceUrl`, so `utm_source=openai` created new rows. |
| Raw markdown titles (`* 🍻 **Drink Local`, `_[SantaCaliGon Days](`) | Discover listed all open `contentItems`, including scraper dumps. No raw-text gate on the feed. |
| “Strong fit” + generic “Possible {kind} for Kellie” | Confidence was date+location+`bensonScore ≥ 60`. Why-copy used the first summary sentence or a filler fallback. |
| Symphony titled / Cleo Club summary / Food & Drink | Mixed research dumps stored as one row; no title/summary clash hide. |
| AREMA / KSIPP / inland-rivers as Things To Do | No trade-conference hide. Hub children (Birthday Party, Field Trip, Hy-Vee, Dutch copy) used listing-page titles. |
| Pitch Ready never on Discover (0/40) | Pitch readiness was Home-only. Discover had no honest Contact needed path. |
| Post now / Add could reappear | `addToToday` wrote the planner row but **did not** write a creator-interest record, so the item stayed “open.” |
| Later was a snooze, not Skip | UI offered Later + taste votes. Skip identity was null without a date, so cross-source twins resurfaced. |
| Year-2027 Royals “this month” | Hub concert guides stamped implausible dates; no implausible-date gate. |

## Live-data audit counts (before repair)

Sample: 40 live Discover cards, 2026-09-02.

| Metric | Count |
|---:|---|
| Feed size | 40 |
| Primary action `add_to_today` / “Add to Things To Do” | 40 / 40 |
| “Strong fit” heuristic | 12 |
| Exact title duplicates (Royals ×4, KKFI ×2) | 6 extra rows |
| Same-path URL extras (cmfkc.com, kansascity.events/concerts/july, …) | 11 |
| Raw markdown titles | several (`* 🍻 **Drink Local`, `* **Come One`, `_[SantaCaliGon Days](`) |
| Generic why (“Things To Do in…”, “Possible … for Kellie”, concert-guide filler) | ~14 |
| OpenAI `utm_source` URLs | 23 |
| Missing source URL | 6 |
| Pitch Ready on Discover | 0 |
| Unsupported Pitch Ready | 0 (label was not wired; the failure was fake *Add to Today* certainty instead) |
| Hub / SKU children (Royals, KKFI, Hy-Vee, Birthday Party, Field Trip) | present |
| B2B conferences as Things To Do | AREMA, KSIPP, IRPT |

No production rows were deleted to produce the after-state. Suppression is feed-time + prospective ingest merge.

## Files and migrations changed

**No database migration.** No schema change.

### New

- `services/core/src/creator-interest/discover-identity.ts` — canonical URL, Eventbrite id, opportunity key, series/hub-day collapse
- `services/core/src/creator-interest/discover-trust.ts` — visibility, honest state, why/gap, Pitch vs Contact needed
- `services/core/src/creator-interest/discover-trust.test.ts`

### Edited

- `services/core/src/creator-interest/actions.ts` — trust + collapse on `listOpenDiscoveries`; `addToToday` also records `interested`
- `services/core/src/creator-interest/discover-card.ts` — primary keys `post_now \| pitch \| save \| skip`; display title prefers cleaned topic
- `services/core/src/creator-interest/index.ts` — re-exports
- `services/core/src/creator-interest/discover-kind.test.ts` — expected CTA is **Post now**
- `services/core/src/creator-interest/discover-quality.test.ts` — skip-duplicate identity + save recovery
- `services/core/src/creator-skip/index.ts` — `SkipSourceScreen` includes `'discoveries'`
- `services/core/src/scanner/ingest-persist.ts` — canonical-URL merge for non-hub tracking-query duplicates; distinct `?id=` values stay separate
- `services/core/src/gmail-inbox/discovery-newsletter-route.test.ts` — freeze `now` on the multi-event persist-shape fixture (same 14-day expiry pattern as the sale-window test in this file; August 15 2026 had aged past the gate)
- `dashboard/app/discoveries/discoveries-panel.tsx` — one primary + Skip; optional Save; source line

### Not changed (safety)

- `home-video-growth.ts`, `home-analytics-coherence.ts`, `home-briefing-authority.test.ts`, `home-showroom.ts`, `home-pitch-ready.ts`, `home-worth-a-look.ts`
- Public-event extraction / `public-event-eligibility.ts`
- Calendar eligibility
- Home Pulse top-pick actions (`add_to_today \| review \| open_program`)

## Exact behavior implemented

### 1. Canonical identity and deduplication

- Opportunity key prefers Eventbrite id, then canonical URL (tracking query stripped, host/path normalized), then dated skip identity, then `daytitle` / `biz` — **never title-only**.
- One-word titles (`Royals`, `KKFI`) do not get a series key, so vague names cannot swallow a day.
- Hub URLs are provenance, not identity. Undated hub homepage/listing rows are hidden. Dated children of a hub page collapse by hub-day when they share that page and day.
- Ingest: after exact URL match, match `canonicalizeDiscoverSourceUrl` among same host+path candidates (limit 25). `?id=1` vs `?id=2` do not merge. Hubs and `sharedHubProvenance` children are excluded.

### 2. Trustworthy recommendation states

Visible cards resolve to exactly one of **Post now**, **Pitch** (label **Pitch** only when `evaluatePitchReadiness` is `pitch_ready`, else **Contact needed**), **Save**. Skip is the dismiss action, not a ranked state.

Hidden (not dressed up): raw markdown, field-dump titles (`Operational Hours`, `… Duration`), trade/user/developer conferences, past seasonal titles without a date (Juneteenth after June), undated hub listings, implausible next-year + “this month” dates, title/summary clash, Dutch-only dumps, generic why with no specific fallback.

### 3. Explanations

`whyItMatters` is a specific first sentence or `{title} — {kind} · {whereWhen}`. Generic “strong social media potential” / “Discover the ultimate…” is rejected. Verification gaps (no contact, title-only listing) are attached in copy and on the card.

### 4. Feedback and learning — what actually happens

| Action | Persistence | Downstream effect |
|---|---|---|
| **Post now** | Planner `today` + interest `interested` (`sourceScreen: discoveries`) | Leaves Discover; sits on Today. Same identity will not reappear as an open discovery. |
| **Pitch** | Interest `contact_business` | Leaves Discover; opens the detail/contact path. Research may queue from the existing interest pipeline. Label is **Contact needed** unless pitch-ready evidence exists. |
| **Save** | Interest `save_for_later` + planner `saved` | Leaves Discover. Repeat Save returns `duplicate: true` with the same `interestId` (recoverable). |
| **Skip** | `skipDiscoveryRecord` with **no snooze** | Hidden by skip matchers + skip identity. Cross-source twins with the same dated identity stay hidden. **Next occurrence of a recurring series is a different day key and can appear.** |

Taste weights are **not** updated by Skip or Post now. More/less-like-this still exists on the detail path. This pass does **not** claim Skip “trains” ranking.

### 5. Freshness

- Past `eventEndsAt` / `eventStartsAt` already dropped by SQL (≥ now − 12h).
- Implausible dates and past seasonal undated holidays are hidden.
- Recurring series: skip identity includes the day; series collapse keeps the soonest occurrence only.

### 6. Mobile

390×844: cards ~215–275px tall, 358px wide, primary 44px, no overflow, no overlapping buttons. One purple primary (Post now / Save / Contact needed). Skip always present. Save is secondary when primary is not Save.

## Cleanup performed

**No production DELETE.** Live junk is suppressed at `evaluateDiscoverTrust` / `collapseDiscoverFeedItems`.

Prospective ingest cleanup: future tracking-query re-fetches of a non-hub URL update the existing row instead of inserting a sibling.

Affected **visible** feed (after vs before, same `limit=40` endpoint):

| Issue | Before | After |
|---|---:|---:|
| Exact title duplicates | Royals ×4, KKFI ×2 | 0 |
| Raw markdown titles | present | 0 |
| Pitch Ready | 0 (unwired) | 0 |
| Add to Things To Do as only CTA | 40 | 0 |
| Post now / Save | 0 / 0 | 17 / 23 |
| Hub SKUs (Birthday Party packages, Operational Hours, Hy-Vee Duration, Funny Bone on `/concerts/july`) | present | 0 |
| JNUC / Mobile Health / Developers Conference | present | 0 |
| Juneteenth undated | present | 0 |
| Symphony / Cleo clash | present | 0 |

## Feedback / learning behavior

See the table above. Ranking still uses existing Discover taste weights only when Kellie votes more/less-like-this on a detail surface. Inbox actions change **membership** of the open feed (interest, skip identity, planner), not a new ML model.

## Tests added and complete results

Coverage in `discover-trust.test.ts` + `discover-quality.test.ts` + `discover-kind.test.ts`:

- Cross-source duplicates (Eventbrite + tracking query)
- Near-duplicate false positives (same vague title, different venue/day)
- Stale / implausible date suppression
- Recurring-event skip identity (same title, different day)
- Skipped duplicate suppression (Don Felder two URLs)
- Saved-item recovery (`duplicate: true`)
- Honest Pitch vs Contact needed
- Exactly one primary action per visible recommendation
- Useful source attribution / no “strong social media potential”
- Raw scraper + trade conference + hub SKU + Juneteenth + dated hub child kept
- Newsletter persist-shape fixture frozen so extraction still requires 3 independent occurrences

| Suite | Result |
|---|---|
| Focused Discover unit (`discover-trust`, `discover-kind`, newsletter route) | **32/32 pass** |
| Discover quality (DB) | **9/9 pass** |
| Full relevant glob (creator-interest, discover-eligibility, creator-skip, skip-filter, home-briefing-authority, content-freshness, weekend-things-to-do) | **123/123 pass** (pre-final hide asserts; those asserts landed in existing cases) |
| Home briefing authority (included in relevant glob) | pass — Home not regressed |
| Deploy precheck (calendar eligibility, newsletter, worker-heartbeat, …) | **142/142 pass** |
| Dashboard `tsc --noEmit` | pass |
| Core `tsc --noEmit` on Discover files | no Discover errors (pre-existing unrelated core errors unchanged) |

## Build and deploy-precheck results

- Dashboard production `next build`: **✓ Compiled successfully** (74s on the final deploy)
- `pnpm benson:deploy-local`: completed
- Local health OK (API `:4000`, dashboard `:3000`)
- No migration to verify

First deploy attempt failed on `discovery-newsletter-route.test.ts` “multi-event persist shape” (`2 !== 3`) because Melon Summer Smash `2026-08-15` aged past the 14-day occurrence window after 2026-08-29. The quality gate already accepts a frozen `now`; the sale-window test in the same file already used it. The persist-shape test now freezes `now` to `2026-08-14`. Extraction behavior was not loosened.

## Live mobile and desktop verification

API after final deploy: `GET /api/creator-interest/discoveries/feed?limit=40` → 40 cards, actions `{post_now: 17, save: 23}`, **0 title dups**, **0 Pitch Ready**, **0 raw titles**, hub SKUs gone.

Browser (locked Cursor tab, `http://127.0.0.1:3000/discoveries`):

- **390×844:** cards compact; primary 44×72; Skip 44px; no overflow/overlap; Post now / Save / Skip visible. Measured first card 256×358.
- **1280×900:** same actions, source line, no clipped controls.
- **Home 390×844:** Today’s Brief still shows two latest TikToks with **+18** and **+50** view deltas and **+1 follower → 6,654** once. No Pitch Ready in the brief. Pulse top picks still use Review / Add to Things To Do (Home contract preserved).
- Calendar `/calendar` and Pitches `/email/approvals` return 200.

Alexa / notifications still consume `listOpenDiscoveries` title/summary/whereWhen. Extra fields (`verificationGap`, `opportunityKey`, new primary keys) are additive. Home Pulse action types were not changed.

## Dashboard / worker fingerprints

```
status: MATCH
source / api / dashboard / worker: 361e12534f389f15
apiStartedAt: 2026-09-02T01:43:14.543Z
dashboardBuiltAt: 2026-09-02T01:43:22Z
workerStartedAt: 2026-09-02T01:43:22.589Z
```

## Commit hash and branch

Branch: `release/scout-expansion-2026-07-25`

Commit SHA is recorded after push in the follow-up line at the bottom of this file (same pattern as the Home briefing report).

## Remaining limitations or deferred work

1. **Dated children of the same hub page** can still appear as separate cards when titles and dates differ (`kansascity.events/family-shows`: Come From Away, New Dance Partners, NASCAR). That is intentional — they are different events.
2. **Thin newsletter place-names** (Leawood City Hall, Park Place Leawood, “Caption: KC Daily”, “Participating Vendors”, “Tuesday and Wednesday Lunch”) can still pass if they have a date and a title-based why. They are honest “listing title only,” not fabricated pitches.
3. **Discoveries page chrome** still says “Tell Benson what you want more of, less of, or not at all.” Card actions no longer expose those taste votes; more/less remains on the detail path.
4. **Pitch** almost never shows as **Pitch** on Discover because listing metadata rarely has a verified non-generic email plus the other pitch-ready evidence. Contact needed is the honest default.
5. **Watch / Research** rows stay hidden when evidence is thin.
6. **Home Worth a Look** can still show IRPT / out-of-market Collect-A-Con — that surface was not in scope.
7. **OpenAI utm URLs** still appear as stored provenance; they are canonicalized for identity, not rewritten in the database.
8. **Mecum blog / Official Website** style SEO leftovers** can still appear when they have a non-hub URL and a date-shaped title. Not broadly deleted.

## Before-and-after screenshots

| Surface | Path |
|---|---|
| Discover mobile 390×844 | `docs/ops/screenshots/discover-trust-pass-2026-09-02-mobile.png` |
| Discover desktop 1280×900 | `docs/ops/screenshots/discover-trust-pass-2026-09-02-desktop.png` |
| Home mobile briefing (preserved) | `docs/ops/screenshots/discover-trust-pass-2026-09-02-home-mobile.png` |

---

## Final commit SHA

`0f209c805a3507bbb36e9a81267741f4e39e5e56`
