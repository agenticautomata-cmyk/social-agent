# Benson Common Calendar / The OSC Squarespace Extraction Repair — 2026-09-11

## Root cause

`https://www.theosc.co/events` is a reachable Squarespace **Events** collection (`collection-type-events-stacked`, `eventlist--upcoming`) with full SSR event evidence in HTML:

- titles, local start/end dates + clocks (`<time class="event-date|event-time-localized">`)
- detail links under `/events/…`
- Google Calendar TEMPLATE links
- per-event ICS (`?format=ical`)

The Watchlist event-listing pipeline only covered JSON-LD → Wix hydration → Wix SSR cards → optional Playwright. OSC has **no Event JSON-LD** and is not Wix, so extraction returned **0** events → `no_yield`.

Separately, the detail UI labeled **“Last successful extraction”** using `lastSuccessfulCheck` as a fallback. Completed zero-yield checks still stamp `lastSuccessfulCheck`, so the UI could show a “successful extraction” timestamp after a failed yield.

## Failure path (trace)

1. Detect — URL path `/events` → event directory / `event_listing`
2. Fetch — HTTP 200, ~600KB HTML, reachable
3. HTML — Squarespace eventlist articles present (not auth-walled)
4. JSON-LD — WebSite only → zero Event nodes
5. Squarespace — **no adapter** (pre-repair)
6. Detail / GCal / ICS — present in HTML but unused
7. Dates / upcoming / past — not reached
8. Verify / dedupe / persist — zero yield
9. Status — `no_yield` with reachable completed check
10. UI — risk of “Last successful extraction” via `lastSuccessfulCheck` fallback

## Strategy used

Capability-based common-calendar extraction (no LLM as factual authority; no OSC title hard-coding; hostname-only ≠ success):

1. Event JSON-LD
2. Direct collection ICS (when bodies supplied)
3. Squarespace Events upcoming `eventlist` HTML (local wall times preferred)
4. Per-event ICS as primary only if HTML strategies yield nothing; otherwise **UID enrichment only**
5. Semantic HTML blocks
6. Wix Events hydration (preserved)
7. Bounded Playwright only when caller supplies rendered HTML
8. Eventbrite remains on its dedicated adapter

Temporal preference rule: **HTML local date/time wins** over Google Calendar / ICS UTC. Conflicts retain both signals in evidence and set `needsTemporalReview` / `temporal_conflict_review`. Multi-day spans (e.g. Co-Work Day Aug→Jan) stay **one row** — no day explosion. Past `eventlist--past` articles are excluded. Repeated titles (Bible Study, Connected, Restored) stay distinct by detail URL + local start.

Dedupe order: ICS UID+occurrence → platform ID → detail URL → title+local start+venue.

## Platform support matrix

| Platform | Detectable | Extractable | Status |
| --- | --- | --- | --- |
| JSON-LD Event | yes | yes | supported when present |
| ICS (feed / per-event) | yes | yes | supported (standards parser + zone projection) |
| Google Calendar TEMPLATE | yes | partial | evidence / conflict check; HTML preferred |
| Squarespace Events | capability markers | yes | supported |
| Wix Events | capability markers | yes | supported (regression preserved) |
| Eventbrite | dedicated adapter | yes | preserved |
| WordPress / Tribe / EventON | markers | no | `needs_adapter` when detected only |
| iframe calendar embeds | markers | no | `needs_adapter` |
| Unsupported / custom | honest degraded | no | `needs_adapter` / `no_yield` |

## Diagnostics (live The OSC)

| Field | Value |
| --- | --- |
| Configured URL | `https://www.theosc.co/events` |
| Final fetched URL | same |
| HTTP status | 200 |
| HTML size | ~613 KB |
| Event text in raw HTML | yes (`eventlist-event--upcoming`) |
| JSON-LD Event | none (WebSite only) |
| Squarespace markers | `Static.SQUARESPACE_CONTEXT`, `collection-type-events-stacked`, `eventlist--upcoming` |
| Site TZ | `America/Chicago` |
| ICS / GCal | per-event `?format=ical` + Google Calendar links |
| Strategies | `json_ld` → `direct_ics` (links, bodies later) → `squarespace_events` |
| Method selected | `squarespace_events` |
| Candidate / verified | **36 / 36** upcoming |
| Past leak | 0 |

Sample local-time checks:

- Go To Kellz — 2026-09-11 22:00 → 2026-09-12 02:00 (overnight; ICS UTC alone would look like Sep 12)
- Mats and Matcha — 2026-09-13 13:00–16:00
- OSC Co-Work Day — single multiday row 2026-08-03 → 2027-01-02
- Bible Study — 4 distinct occurrence URLs/dates

## Live verification

Watcher id: `21b5e1d0-0801-4d5e-863b-c0b62305926a`

| Check | Outcome |
| --- | --- |
| Before | `no_yield` · 0 records · extractionMethod `event_listing` |
| First check | **healthy** · Baseline from **36** verified listings · 36 new scout items |
| Second check | **no_change** · Checked 36; 0 new · still 36 scout items (no dupes) |
| Configured URL after | unchanged |
| Adapter / method | `event_listing` · `squarespace_events` |
| Public API | same URL, 36 scout items, `no_change` |

## Status language

- **Last successful extraction** only when `lastSuccessfulExtractionAt` is set (≥1 verified event)
- Else UI shows completed-check context + **“No successful extraction yet”**
- Reachable / completed / succeeded / changed / new remain separate fields
- New display health: `needs_adapter` for recognizable unsupported calendars
- Zero-yield is never labeled healthy / successful extraction

## UI / mobile

Watchlist detail (website listing):

- Source type: Website listing
- Platform / method: squarespace events
- Events to review cards show **actual event date/time**, evidence, detail link (not just extraction timestamp)
- `pb-24` spacing avoids bottom-nav overlap
- Viewports tested: 360×800, 390×844, 412×915 — no horizontal overflow

Screenshots:

- `docs/ops/screenshots/osc-watchlist-detail-2026-09-11-mobile-360.png`
- `docs/ops/screenshots/osc-watchlist-detail-2026-09-11-mobile-390.png`
- `docs/ops/screenshots/osc-watchlist-detail-2026-09-11-mobile-412.png`
- Proof copies: `docs/ops/proofs/osc-squarespace-extraction-2026-09-11/`

## Regressions

| Source | Result |
| --- | --- |
| 18th & Vine Wix | **PASS** — 6 listings, `wix_events_hydration`, `no_change`, URL preserved |
| Eventbrite KC | **PASS** — URL preserved, healthy/usable yield (~60 live listings; inventory churn vs prior 61) |
| URL preservation | **PASS** (OSC / Wix / Eventbrite) |
| UI language | **PASS** — successful extraction only after yield; website listing copy retained |
| Watchlist semantics | **PASS** — baseline → no_change; zero-yield never healthy |
| Instagram / outreach / send | **PASS** (untouched paths; no auto-pitch from listing check) |

## Schema / data changes

- No new SQL migration
- Reuses `source_watchers.config` yield / extraction fields
- Adds config: `lastCompletedCheckAt`, `listingPlatform`, `platformSupport`
- Scout fingerprints: URL / ICS UID / title+local start+venue

## Tests / build

**Focused:**

- `event-listing-extract.test.ts` — Wix + Squarespace + ICS + status semantics — pass
- `eventbrite-watchlist-trust.test.ts`, `watchlist-state.test.ts` — pass

**Deploy-gate:** included in `pnpm benson:deploy-local`

**Pre-existing:** repo-wide `tsc` still has unrelated errors; Instagram DB-fixture tests remain environment-dependent

## Deployment fingerprints

```json
{
  "status": "MATCH",
  "sourceFingerprint": "8c9247d432890dc7",
  "apiFingerprint": "8c9247d432890dc7",
  "dashboardFingerprint": "8c9247d432890dc7",
  "workerFingerprint": "8c9247d432890dc7"
}
```

Checked via `pnpm benson:deployment-status` after `pnpm benson:deploy-local`.

## Commit hashes

- _(filled after commit)_ — Squarespace/ICS common-calendar extraction repair + OSC status/UI honesty
- Branch: `release/scout-expansion-2026-07-25`

## Limitations

- Listing pages often omit venue in the card HTML; missing venue is allowed (optional)
- Per-event ICS UID enrichment is bounded (fetch cap) and best-effort
- WordPress / iframe calendars are detect-only (`needs_adapter`) — no speculative full adapters
- Google Calendar UTC links are evidence, not primary authority for KC local dates
- Multi-month continuous listings remain one span event by design (no RRULE day explosion)

## Telegram closeout

One operator Telegram summarizing OSC/Squarespace/ICS extraction, status language, and regressions — sent after deploy + this report.
