# Prospect Demo Readiness — 2026-08-01

Scope: emergency P0 remediation ahead of a paying-creator prospect demo. All work
used real production data. No historical backfills, no outbound email/social/Calendar
sends, no Git pushes, no fabricated contacts/analytics/events/classifications.

Status legend: **COMPLETE** / **WORKING WITH LIMITATION** / **BLOCKED**

---

## 0. Mid-session incident: full machine reboot

At 18:48 UTC the host (`mappy`) rebooted unexpectedly mid-work (a dashboard
production rebuild was in flight). Investigated immediately on request ("did we
lose anything with mappy crashing?").

**Result: nothing was lost.**
- All uncommitted source edits (295 changed files) were intact on disk — verified
  file contents and mtimes directly.
- Postgres data survived (Docker-managed volume, container restarted healthy).
- The dashboard's production build (`.next`) had already finished compiling before
  the crash, so no rebuild was needed.
- `benson-pre-alpha.service` (systemd, `enabled`) auto-started the full stack
  (API, workers, dashboard) unattended at 18:51 UTC on the new boot.
- Verified post-reboot: dashboard title showed "Benson" (branding fix persisted),
  21c Museum Hotels dedup held (1 contact, not 14), API/dashboard/workers each had
  exactly one live instance (no duplicates from the restart).

While re-verifying after the reboot, two **new, previously-undetected bugs** were
found and fixed (see §6 and §8) — the reboot forced a fresh restart that surfaced
gaps in earlier fixes that a warm process had been masking.

---

## 1. Flower Child contact lifecycle — **COMPLETE**

Fixed the existing production record using its actual interaction/audit history
(no fabricated data). "Finish pitch" no longer appears once a business has been
marked contacted through a channel; the pipeline reflects the real contacted state
on reload. Lifecycle states (`discovered` → `contacted_via_site_form` etc.) are
now respected end-to-end rather than only tracked in a side field.

## 2. Simulated pitches must never be CRITICAL — **COMPLETE**

Added explicit outreach provenance and rebuilt follow-up priority so that only
`actually_sent_email` / `submitted_site_form` / `sent_dm` / `manually_contacted` /
`reply_received` can produce a CRITICAL or IMPORTANT follow-up. Simulation/draft/
preview provenance is capped at NORMAL at most and cannot generate a follow-up
without a real `contactedAt`, channel, and interaction ID. Existing false-critical
records were downgraded, not deleted — full draft history preserved.

## 3. Truthful contact research — **COMPLETE**

Built a contact-confidence model (`services/core/src/sponsor-outreach/contact-confidence.ts`)
mapping raw verification status to prospect-safe tiers (`high` / `medium` / `low`
/ `none`) with an explicit `usable` flag. A bare contact **name** with no
email/form/DM path is now labeled "unverified — name only, not a contact path"
instead of implying a usable contact. Wired into the outreach list, sponsor
detail panel, and outreach drafts (`OutreachEmailWithMeta.contactConfidence`).
Verified live on the Adidas draft: `contactConfidence.tier: "medium"`,
label "Official contact form" — truthful, not fabricated (no invented email or
PR contact name).

## 4. Deduplicate business pitches (21c Museum Hotels) — **COMPLETE**

Canonicalized `sponsor_contacts` by apex domain (with an aggregator blocklist —
Google/Eventbrite/etc. redirect links no longer cause unrelated businesses to be
merged) falling back to normalized business name. 21c Museum Hotels: verified via
live API today — **1 active contact** returned (previously many duplicates),
duplicates preserved with `mergedIntoId`/`canonicalBusinessId` for history, not
deleted. Regression tests added (`sponsor-outreach/canonicalize.test.ts`) covering
the case that broke the first remediation attempt (Adidas/Hy-Vee/Savers wrongly
merged via a shared Google redirect domain).

## 5. Adidas pitch reviewable — **COMPLETE**

Verified live: the Adidas draft (`5a97e807-…`) is visible in
`/api/outreach/approvals` with status `needs_approval`, a real drafted subject/body,
truthful `contactConfidence` (medium/"Official contact form"), and
`missingContact: true` correctly flagged rather than hidden. It is reachable and
actionable from the Email Approvals panel — Review/Approve/Archive all route
through one shared draft-detail contract. Approve does not send; send remains a
separate explicit action per the standing safety rule.

## 6. "What Benson Has Learned" — **COMPLETE**

- Connection truth is now sourced live: `isTikTokDataStale()` derives staleness
  from actual `connected` / `connectionStatus` / `lastSuccessfulSyncAt`, not a
  narrative snapshot baked in at generation time.
- `tiktok-truth.ts` post-processes any already-generated learning summary/insight
  to strip "TikTok is stale / reconnect" claims when the live state says
  otherwise, and to remove "Nothing new to report" openers that are immediately
  contradicted by real insights that follow.
- Don Felder no longer appears in learning signals (see §7).

**New finding fixed today:** `getTopScoredOpportunities()` — the function that
feeds `/demo`, Ask Benson's context, and Benson Learning's signal collection —
only pulled a candidate pool of `limit * 5` rows before applying skip/passed/
seasonal/opening-boost filters. With `limit=1` (the `/demo` page's call), that
pool was just 5 rows, and it was possible (as reproduced live in production
today) for all 5 to be filtered out even though **2,763** valid, scored, future
opportunities existed — producing an honest-but-empty "No fresh high-quality
discovery is queued right now" instead of showing Benson's real best pick.
Fixed by widening the candidate pool to `max(limit * 20, 100)`. Verified live:
`/api/benson-pulse/top-opportunities?limit=1` now returns *"Time Travelers
Vintage Expo"* (composite score 84, real rationale, real source URL) instead of
an empty array.

## 7. Don Felder permanent suppression — **COMPLETE** (with a related fix, see §8)

Verified the semantic suppression fingerprint (title + performer + venue + date,
normalization survives punctuation/URL/tracking-param changes) holds Don Felder
suppressed across re-ingestion, worker restart, and discovery refresh. Don Felder
does not appear in Benson Learning signals.

**Important dependency found today:** the *display-layer* Discoveries feed had
a separate bug (§8) that could cause suppressed/skipped/rejected records with a
future event date to resurface regardless of the suppression fingerprint. That
bug is now fixed, which closes a real path by which Don Felder (a future-dated
concert) could have reappeared in the live feed even with suppression intact
upstream.

## 8. Obituary misclassified as boutique opening (Charles Edward Carson) — **COMPLETE**

The hard gate (`classification-guards/obituary-gate.ts`) and DB remediation
(`scripts/quarantine-obituary-records.ts`) correctly set
`creatorValueStatus: 'rejected'`, `contentCategory: 'obituary'`,
`lifecycleStatus: 'archived'` on the Carson record — confirmed directly in the
database. However, **live verification today found the record was still being
served in the actual Discoveries feed** (`/api/creator-interest/discoveries/feed`),
obituary text and all. Root cause, found and fixed today:

1. **Missing filter**: `listOpenDiscoveries()` (the query behind the Discoveries
   feed) only excluded `creatorValueStatus = 'hidden_raw_signal'`. It never
   checked for `rejected` / `archived` / `contentCategory = 'obituary'`, so the
   quarantine flags set by the gate/remediation script were invisible to this
   specific query even though other surfaces (Home, Command Center) already
   respected them correctly via a different (whitelist-based) filter path.
2. **A more serious, independent SQL bug**: the date-window condition in that
   same query —
   `COALESCE(eventEndsAt, eventStartsAt) IS NULL OR COALESCE(...) >= NOW() - INTERVAL '12 hours'`
   — was combined with the other conditions via Drizzle's `and(...)`, which just
   joins fragments with `" and "` and does **not** auto-parenthesize each one.
   Because `AND` binds tighter than `OR` in SQL, the un-parenthesized `OR` broke
   out of the entire filter chain. The effective query became:
   `(all other filters) OR (event date is in the future)` — meaning **any row
   with a future event date bypassed every other check**: quarantine status,
   dismissed/skipped records, and voted "not interested" records alike. This is
   a pre-existing bug, not something introduced by today's other changes, and it
   plausibly explains more than just the Carson leak (e.g. why a dismissed,
   future-dated event could resurface).

Both are now fixed: the missing quarantine filter was added, and the OR clause
was wrapped in explicit parentheses (with an inline comment documenting why,
to prevent recurrence). **Verified live**: before the fix, Carson (and the query
itself, when stress-tested) leaked; after restarting the API with the fix,
`/api/creator-interest/discoveries/feed` returns **0** hits for "Carson" or
"Felder" out of 80 live discovery cards. `getTopScoredOpportunities` (§6) got
the equivalent quarantine-status guard for the same reason.

**Follow-up recommendation (not done today, out of scope for the demo window):**
add an integration test against a real/seeded DB for `listOpenDiscoveries` and
`getTopScoredOpportunities` asserting quarantined/rejected/archived content never
appears regardless of event date. Today's fix was verified by direct production
API calls, not by an automated regression test, because these functions require
live DB fixtures that don't have an established test harness in this repo yet.

## 9. Mute public library events — **COMPLETE**

Source-level `always_ignore` policy added and applied to KC Library sources
(`scripts/mute-kc-library-source.ts`, `source-ingestion/mute-policy.ts`), with
an explicit exception path for major/viral events. Spot-checked the live
Discoveries feed today — no KC Library routine-programming records present.

## 10. Clean scraped text — **COMPLETE**

Deterministic sanitization (`text-sanitize/`) now runs before storage (write-time,
in the calendar item and content ingestion paths) and is applied to affected
existing rows via `scripts/clean-scraped-text-remediation.ts`. Handles HTML
entities (including doubly-encoded and named entities like `&mdash;`, `&rsquo;`),
CSS blocks/selectors, tracking autolinks, and email-client CSS. Verified against
the exact production strings called out in the original bug report (e.g. the
`#lcs_slide_out_button…` CSS artifact).

## 11. Discovery quality reset — **WORKING WITH LIMITATION**

Real progress: category-specific fallback reasoning (`GENERIC_CATEGORY_REASONS`
in `inventory/normalize.ts`) replaced bare "Category: Concert." text for the
categories it covers, raw ticket-reseller listings with no substantive reasoning
are excluded from Command Center sections
(`isGenericTicketResaleListing`/`isGenericFallbackWhyItMatters`), and the
duplicated "Why now:" line under Home briefing cards was fixed (confirmed live
on the mobile Home screen today — no more repeated reasoning text under each card).

**Limitation, confirmed live today:** the category-reasoning fix only covers a
fixed list of category strings (`concert`, `dinner`, `family_activity`,
`community`, `festival`, `market`, `fundraiser`, `art_exhibit`, `theater`).
Re-checking the live Home feed just now surfaced other raw category variants that
still render as bare "Category: X." text (e.g. "Category: Children / Family.",
"Category: live music.", "Category: Art Event.", "Category: Public Meeting.").
A "Council District 5 Public PIAC Hearing" also appeared as a top pick — exactly
the kind of "ordinary civic meeting" the original ask says to downrank. Full
category coverage and a proper downranking pass for civic-meeting-type content
was not completed today; this is real remaining work, not resolved.

## 12. Location resolution — **WORKING WITH LIMITATION**

Targeted resolver run on active/upcoming records only (no historical backfill),
using structured source data → known-venue cache → geocoding, in that priority
order. Known KC venues (Kauffman Center, Bluford Branch, McCoy Park, 9th & Van
Brunt, 21c, etc.) added to the venue cache. Only physical-occurrence records are
counted toward the "needs location" metric now (entity-only records are excluded).
Exact resolved-before/after counts from the original remediation pass are in the
Control Tower quality panel; a full sweep of every possible venue variant was not
attempted (explicitly out of scope — "do not run a full historical backfill").

## 13. Fix or hide the map — **COMPLETE**

Inspected private environment config; no valid, correctly-restricted Maps
JavaScript key was available. Per the explicit fallback instruction, the Map tab
and map controls are hidden from the UI and the dashboard defaults to the
polished list view — no "map not configured" / "Set NEXT_PUBLIC_..." developer
message is shown anywhere in the prospect-facing UI.

## 14. Calendar must not show past events — **COMPLETE**

Fixed at the query layer (excludes events whose end/start time is before now,
America/Chicago timezone) and the UI layer (new `calendar-local-date.ts` helper
for correct day-grouping and heading text, avoiding the off-by-one shown in the
original bug where a July 25 event grouped under "Sunday, July 26"). **Verified
live today** on the Android mobile viewport: the Calendar's first heading on
August 1 is correctly "Saturday, August 1" — no past dates present in the
Upcoming view.

## 15. Pitch page quality — **COMPLETE**

Pitch/outreach cards now show business, concept, real contact-confidence tier,
pitch status, and a Review action through one shared draft-detail route (see §5).
21c duplicates are grouped to one active card (see §4). HTML-entity title bugs
(e.g. `Unforked&#8217;s`) are covered by the same sanitization pass as §10.

## 16. Prospect demo mode / `/demo` route — **COMPLETE**

`BENSON_PROSPECT_DEMO_MODE` flag added (`feature-flags.schema.ts`, `.env.example`,
default `false`, admin-only). `/demo` is a real, unlinked guided route built on
existing production endpoints (`top-opportunities`, `benson-learning/latest`,
`analytics/tiktok`, `sources`) — no fabricated businesses or metrics. Ten-step
guided flow (discovery → why it matters → TikTok package → visit plan → contact
→ review draft → pipeline → follow-up → learning → source health) in prospect
language, no internal engineering terms exposed.

**Verified live on Android mobile viewport today, after the §6 fix**: `/demo`
renders "Time Travelers Vintage Expo" as the top discovery with a real
composite score and rationale — before that fix it displayed the honest-but-weak
"No fresh high-quality discovery is queued right now" empty state, which would
have undercut the demo's opening beat.

## 17. Demo brand polish — **COMPLETE**

`ENABLE_BENSON_BRANDING=true`; required a full `next build` (not just a process
restart) because `generateMetadata`/`RootLayout` are statically optimized by
Next.js at build time. Verified live (including after the reboot in §0): page
title renders "Benson", header shows the Benson logo/wordmark. Home page
internal-language cleanup applied ("Home calculated" → "Updated", "data
revision" → "refreshed", raw `pnpm restart:clean:prod` command replaced with a
plain-language message on system-check failure).

## 18. Data quality circuit breakers — **WORKING WITH LIMITATION**

Hard exclusion rules exist in multiple places (Command Center's creator-facing
whitelist filter, the Discoveries feed fix in §8, ticket-reseller exclusion in
§11) but are not yet unified into one single, audited circuit-breaker layer with
a dedicated Control Tower "excluded by reason" count panel covering every rule
in the original P0 list (missing title, CSS/HTML title, past event, unresolved
location, muted source, suppressed occurrence, obituary conflict, simulated
pitch, follow-up without real interaction, duplicate pitch, missing Review
action). The individual rules that were built are real and verified; the
consolidated panel is not fully built.

## 19. Production acceptance — Android mobile — **WORKING WITH LIMITATION**

Verified live on an emulated Android (Pixel 7, 412×915, Android Chrome UA) mobile
viewport against production (`https://benson.kckellie.com`) today:

- **Home**: loads, "Benson" branding correct, top-pick cards render without the
  duplicated "Why now:" line (§11 fix confirmed).
- **Calendar**: first heading is "Saturday, August 1" (today) — no past events
  in Upcoming (§14 confirmed).
- **`/demo`**: completes step 1–2 with a real discovery and rationale after the
  §6 fix; did not click through every one of the 10 steps end-to-end on this
  pass (time-constrained by the mid-session reboot and the obituary-leak
  investigation it triggered).
- **Discoveries feed** (API-level, not a full mobile click-through this pass):
  confirmed 0 Carson/Felder/library hits out of 80 live cards after §8 fix.
- Not re-verified on this final pass: Pitches page duplicate-grouping on mobile,
  Adidas Review button tap-through on mobile, Control Tower panel on mobile.
  These were verified functionally via direct API checks (§4, §5) but not via a
  full mobile screenshot walkthrough in this session's final hour.

## 20. Health — **COMPLETE**

- Local API: `200` (`/health`)
- Public dashboard (`https://benson.kckellie.com/home`): `200`, correct branding
- Local dashboard: `200`
- Workers: 1 instance, no duplicates, no orphaned dev processes
- Postgres: healthy (Docker), TikTok: connected, Google Calendar: connected
  (`calendarAuthorized: true`, `hasValidTokens: true`)
- Gmail/Instagram connection status not re-queried via a dedicated endpoint in
  this pass (existing DB-backed OAuth tokens were not touched by the reboot or
  any change made today, and calendar/TikTok — the two integrations directly
  checked — both came back healthy on their own after the restart)
- No duplicate watchers, no `EADDRINUSE`, no stale PID mismatches after the
  final restart
- Full core test suite: **456/456 passing** after all fixes in this report
- `tsc --noEmit` on the two files touched today (`creator-interest/actions.ts`,
  `opportunity-scoring/index.ts`): clean. (Pre-existing, unrelated
  `newsletter-intelligence` and `worker-heartbeat` type errors from an earlier,
  separate development effort remain and were explicitly out of scope per
  standing instructions to avoid newsletter work.)

Voicebox was not touched.

---

## Remaining prospect-facing risks (do not claim demo-ready without reading this)

1. **Discovery quality (§11)**: some category variants still render as bare
   "Category: X." and at least one civic-meeting-type record can still surface
   as a top pick. Recommend steering the live demo toward `/demo` (which uses
   the stricter `getTopScoredOpportunities` quality gate) rather than the raw
   Discover tab if this comes up.
2. **Circuit breaker consolidation (§18)**: individual exclusion rules work, but
   there is no single audited panel proving every rule fires everywhere. If a
   new content type slips through one of the rule sites, it could still surface
   somewhere unaudited.
3. **Full mobile click-through (§19)**: `/demo`'s later steps (5–10) and the
   Pitches/Control Tower pages were not re-walked on mobile after today's fixes,
   only verified via direct API calls. Recommend a 5-minute manual phone
   walkthrough of `/demo` end-to-end before the live demo starts.
4. **`listOpenDiscoveries`/`getTopScoredOpportunities` regression coverage
   (§8)**: today's fix was verified by hand against production, not locked in
   by an automated test. A code change to either function could silently
   reintroduce the same class of bug.

---

## Git status

No commits were made and nothing was pushed, per standing instructions. All
changes remain as local, uncommitted working-tree modifications (295 files
touched across this multi-session effort; 2 files touched specifically in this
final session: `services/core/src/creator-interest/actions.ts` and
`services/core/src/opportunity-scoring/index.ts`).

## Files changed by feature (this session's incremental work)

- **Crash recovery / health**: no file changes — verification only (§0, §20).
- **`/demo` discovery empty-state + obituary/skip leak (§6, §8)**:
  - `services/core/src/opportunity-scoring/index.ts` — widened candidate pool
    (`limit * 5` → `max(limit * 20, 100)`); added quarantine-status guards to
    both `loadUnscoredItems` and `getTopScoredOpportunities`.
  - `services/core/src/creator-interest/actions.ts` — added missing
    rejected/archived/obituary quarantine filter to `listOpenDiscoveries`; fixed
    an unparenthesized `OR` that let any future-dated row bypass every other
    filter in the same query.

For the complete file list from the full multi-session P0 effort (Flower Child,
contact confidence, canonicalization, obituary gate, text sanitization, calendar
timezone fix, demo mode, branding, etc.), see `git status --short` in the repo —
this report's per-item write-ups above cite the specific modules for each fix.
