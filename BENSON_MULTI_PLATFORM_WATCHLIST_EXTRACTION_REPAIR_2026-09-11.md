# Benson multi-platform Watchlist extraction repair — 2026-09-11

## Verdict

Shared Watchlist pipeline separates reachability, extraction capability, content outcome, and reliability. Five target sources classified after live `check-now` ×2 (plus baseline regression). Deployed fingerprint **MATCH `66f64b497ca70647`**.

| Source | Classification | Evidence (live) |
|--------|----------------|-----------------|
| Music Theater Heritage | **PASS** | TEC REST; 18 verified productions; configured `/shows/` preserved; effective `/events/` |
| Do816 | **BLOCKED** | Production host HTTP 403 on JSON + HTML; not `no_yield` |
| KC Melting Pot | **PASS** | 4 production groups / 36 performances; `theater_season`; Like Six excluded |
| Meetup (AA KC find) | **PASS** | 12 SSR listings; relevance 2 / 4 / 6; no auto-promote |
| Cannabis Network KC | **legitimate EMPTY** | Wix capability; healthy empty copy; 0 upcoming |
| OSC (baseline) | **no regression** | 36 verified Squarespace |
| 18th & Vine Wix (baseline) | **no regression** | 6 verified |
| Eventbrite KC (baseline) | **no regression** | 59 (~60) verified |

## Architecture (owned by primary)

- **Configured URL** never rewritten; **effectiveExtractionUrl** is discovery/extraction only.
- Outcomes: `reachability` | `extractionCapabilityOutcome` | `contentOutcome` | health / reliability.
- Supported parse + zero upcoming → legitimate empty (not `no_yield`).
- Adapters: `wordpress-tec-extract`, `dostuff-*`, `meetup-*`, `theater-season-extract`, `event-source-discovery`, `event-listing-outcomes`.
- Pipeline routes DoStuff / Meetup before generic event listing.

### Critical fix this closeout

Season pages were rewritten to nav “Events” hubs (`/events-programs-outreach/`), wiping Melting Pot yield. Discovery now keeps theater-season configured URLs; weak nav scores are not calendar candidates.

## Live acceptance metrics

Fingerprint during acceptance runs: `c9fae5abf30443f4` then final method-label deploy `66f64b497ca70647`. API: `https://api.kckellie.com`.

### Music Theater Heritage — PASS

| Pass | ok | method | verifiedYield | displayHealth | notes |
|------|----|--------|---------------|---------------|-------|
| 1 | true | wordpress_tec_rest | 18 | no_change | configured `…/shows/` |
| 2 | true | wordpress_tec_rest | 18 | no_change | effectiveExtractionUrl `…/events/` |

### Do816 — BLOCKED

| Pass | ok | reachability | notes |
|------|----|--------------|-------|
| 1 | false | blocked | HTTP 403; auto-paused |
| 2 | false | blocked | Re-unpaused; still 403 on `.json` and HTML from production IP |

Same URLs return HTTP 200 from the developer workstation (fixture/extract path verified). Classify **BLOCKED**, not empty and not `no_yield`.

### KC Melting Pot — PASS

| Pass | ok | method | groups | performances | displayHealth |
|------|----|--------|--------|--------------|---------------|
| 1 | true | theater_season | 4 | 36 | healthy (36 new) |
| 2 | true | theater_season | 4 | 36 | no_change |

effectiveExtractionUrl = configured `https://kcmeltingpot.com/current-season/`. UI `listingDisplayMode=production_groups`. Expired Like Six O’Clock excluded.

### Meetup — PASS (relevance review)

| Pass | verifiedYield | relevanceCounts |
|------|---------------|-----------------|
| 1–2 | 12 | verified_relevant: 2, possibly_relevant: 4, not_relevant: 6 |

Method `meetup_apollo_ssr`. Weak matches not auto-promoted (`autoPromote` / `autoPitch` off in payload). First SSR page only (documented).

### Cannabis Network KC — legitimate EMPTY

| Pass | ok | method (final) | verifiedYield | copy |
|------|----|----------------|---------------|------|
| 1–2 + smoke | true | wix_events | 0 | “Checked successfully. No upcoming dated events are currently published (wix_events).” |

`listingPlatform=wix_events`, `contentOutcome=no_upcoming_events`, reachability reachable. Operationally healthy with zero upcoming.

### Baselines (no regression)

| Source | verifiedYield | method |
|--------|---------------|--------|
| OSC | 36 | squarespace_events |
| 18th & Vine | 6 | wix_events_hydration |
| Eventbrite KC | 59 | Eventbrite directory |

## Tests

Focused suite: **43/43 pass** (`wordpress-tec`, `event-listing-extract`, `dostuff-meetup`, `theater-season`).

## Deploy

```
pnpm benson:deployment-status  # DRIFT when source ahead
pnpm benson:deploy-local       # MATCH 66f64b497ca70647
```

## Ownership / sibling handoff

| Lane | Prefer | Status |
|------|--------|--------|
| WordPress/TEC | `wordpress-tec-extract*`, discovery | Integrated; MTH PASS |
| Dynamic-platform | `dostuff*`, `meetup*` | Integrated; Meetup PASS; Do816 BLOCKED at edge |
| Season-page | `theater-season*` | Integrated; Melting PASS after discovery fix |
| Verification | starts after this report | **READY** |

### Verification lane — start here

1. Report: `BENSON_MULTI_PLATFORM_WATCHLIST_EXTRACTION_REPAIR_2026-09-11.md`
2. Fingerprint: `66f64b497ca70647` (re-check `pnpm benson:deployment-status`)
3. Watcher IDs:
   - MTH `1a737b42-064d-4c6c-b566-fbeea86d7449`
   - Do816 `77484aa9-cef8-44c3-8279-0f2f2894d530` (expect blocked until edge allows)
   - Melting `f3699cd6-e383-48aa-886c-b881d3c751d6`
   - Meetup `6f18ba43-338e-43d6-b0a2-75492617f9eb`
   - Cannabis `0d839ae2-0634-4740-9d95-5af5991e7d53`
   - OSC `21b5e1d0-0801-4d5e-863b-c0b62305926a`
   - Wix `1b263831-ac1c-4412-be1d-cb610058dbf9`
   - Eventbrite `d72be304-9338-42fc-ba12-8131dab2ed9d`
4. Confirm UI: effective URL, content outcome, Melting production groups, Meetup relevance bands, Cannabis empty copy.
5. Do not treat HTTP 200 / nonzero DB alone as success; Do816 must stay BLOCKED while 403 persists.

## Hard bans observed

No pitches, Telegram, alerts, calendar invites, billable AI, auth/CAPTCHA bypass, or hard-coded fake yields.

## Commits

See git history on `release/scout-expansion-2026-07-25` for the repair commit(s) landing this report and adapters (filled at commit time).
