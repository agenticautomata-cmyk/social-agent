# Benson Adaptive Website Extraction (2026-09-13)

**Branch:** `release/scout-expansion-2026-07-25`  
**Commit:** `1ee905c`  
**Fingerprint:** **MATCH** `054ef39b17e47a2d`  
**Public:** https://benson.kckellie.com · **API:** https://api.kckellie.com  
**Hard bans honored:** no Funny Bone–specific scraper; no CAPTCHA/auth/paywall bypass; no Telegram/email/pitches/forms/social publish; no billable AI; configured Watchlist URLs preserved; extraction ≠ Calendar admission.

## Executive summary

Benson’s Watchlist event-listing path now runs a **capability-based adaptive extraction orchestrator**. HTTP 403 is an **acquisition observation**, not an automatic terminal `failed`. The orchestrator discovers public surfaces (including sitemaps), recognizes platforms by **signature** (not domain guesses), may use a **permitted public browser** fallback, validates before healthy, and stores strategy memory + diagnostics for the Watchlist UI.

**Kansas City Funny Bone (`https://kc.funnybone.com/shows/`) acceptance:**
- HTTP **403** recorded (DataDome + Cloudflare challenge document)
- Capability chain continued (sitemap discovery → platform recognition → browser fallback → validation)
- Platform detected: **`wordpress_rhp_events`** (Rockhouse Partners Events) via public `rhp_events` sitemap CPT signature — profile key `wordpress:rhp_events:v1`
- Selected method after block: none (browser also challenged)
- Final status: **`blocked`** with evidence — **not** bare `failed` on first 403
- Live performance extraction was **not** possible without solving DataDome’s intentional bot challenge (hard rule: do not bypass CAPTCHA/challenges)

Reusable extraction for the same platform family is proven on fixtures (403 → browser HTML → RHP extract) and on the accessible public RHP collection `https://funnybone.com/events/` (**9** dated listings, status `healthy`).

---

## Architecture

Ordered stages in `services/core/src/benson-scout/adaptive-extraction/`:

| Stage | Module | Role |
| --- | --- | --- |
| 1 URL/policy | orchestrator | Preserve configured URL; record final URL separately |
| 2 HTTP acquisition | `acquisition.ts` | Diagnose useful HTML / JS shell / challenge / rate limit / error |
| 3 Surface discovery | `surface-discovery.ts` | robots, sitemaps, feeds, WP REST conventions, event URL sets |
| 4 Platform recognition | `platform-registry.ts` | Signature registry (TEC, RHP, Wix, Squarespace, schema.org, ICS, …) |
| 5 Browser fallback | `browser-fallback.ts` | Permitted public render only; never solve CAPTCHA |
| 6 Adapters | wraps existing + `rhp-events-extract.ts` | TEC/Wix/Squarespace/ICS/theater/JSON-LD + RHP |
| 7 Validation | `validation.ts` | Quarantine noise; fingerprint; healthy / no_change / empty_confirmed |
| 8 Strategy memory | `strategy-memory.ts` | Profile by signature; success/failure history; no tokens/cookies |

Watch entry: `event-listing-watch.ts` → `runAdaptiveWebsiteExtraction(...)`.

### Capability interfaces (core)

- `AcquisitionObservation` — HTTP status, kind, challenge provider, WAF/CDN indicators, body
- `DiscoveredSurface` — kind/url/evidence/sameOrigin
- `PlatformRecognition` — signature, confidence, evidence, `profileKey`
- `AdaptiveStrategyProfile` — reusable capability sequence + fingerprint history
- `AdaptiveExtractionResult` — status model + events + diagnostics
- Status model: `healthy | no_change | empty_confirmed | needs_adapter | structure_changed | blocked | rate_limited | failed | partial`

### Acquisition decision tree (simplified)

```
HTTP GET configured URL
  ├─ diagnose(kind)
  ├─ always attempt public sitemap/robots (often allowed under HTML challenge)
  ├─ if challenge/403/js_shell/RHP-sitemap-without-HTML → permitted browser
  │    ├─ browser useful HTML → continue adapters
  │    └─ browser challenge → status blocked (+ platform evidence if known)
  ├─ discover ICS / TEC REST when HTML is usable → existing extract waterfall
  ├─ RHP signature → rhp-events extractor
  └─ validate → healthy / no_change / empty_confirmed / needs_adapter / …
```

---

## Funny Bone live proof

| Check | Result |
| --- | --- |
| Configured URL | `https://kc.funnybone.com/shows/` (preserved) |
| HTTP | **403** · `challenge` · **datadome** (+ cloudflare) |
| 403 reason | DataDome interstitial (`captcha-delivery` / `x-datadome: protected`) — intentional bot challenge |
| Surfaces | Public sitemaps reachable (`rhp_events-sitemap*.xml`, venue sitemap) |
| Platform | **`wordpress_rhp_events`** · confidence 0.78 · evidence: sitemap CPT `rhp_events` / `rhp_venue` |
| Profile | `wordpress:rhp_events:v1` |
| Browser fallback | Attempted → **`blocked:datadome`** (Playwright headed/headless both remain on challenge document; CAPTCHA not solved) |
| Final status | **`blocked`** (watcher paused + `suppressSchedule`) |
| Prior behavior | Bare **`failed`** on first HTTP 403 without platform/surface chain |

Watcher id: `0e5b8427-38da-41f9-8c82-eb76ccbce5aa`  
Second identical check: **0** new items, **0** scout rows created (idempotent under block).

### What was *not* done (safety)

- No DataDome/CAPTCHA solve, proxy rotation, identity spoofing, or auth bypass
- No Funny Bone performer names/dates/prices/selectors in production logic
- No Telegram/email/outreach

---

## Reusable RHP extraction proof (same signature family)

### Fixture path (403 → browser success)

`orchestrator.test.ts`: challenge HTML + sitemap + browser-supplied listing HTML → status healthy/partial, platform `wordpress_rhp_events`, multiple occurrences. Multi-performance fixture yields **4** distinct showtimes with doors separated in evidence/description.

### Live accessible RHP collection

`https://funnybone.com/events/` (HTTP 200, same `rhp-events` plugin signatures):

- Status: **healthy**
- Method: `wordpress_rhp_events`
- Occurrences: **9** dated event cards (sample: Chris Munch 2026-10-01, …)
- No domain hard-coding — listing anchors + `singleEventDate` / doors/cost/age semantic markers

---

## Adapter regressions (live Watchlist checks)

| Source | Platform family | Result |
| --- | --- | --- |
| Melting Pot `current-season` | theater_season | healthy · 36 occurrences / 4 groups |
| Fantasy Lounge `event-list` | wix_events | healthy · 7 occurrences |
| Music Theater Heritage `shows/` | wordpress_tec (+ ICS) | healthy · 19 occurrences |

---

## Tests

Focused adaptive + adapter suites: **14/14** adaptive orchestrator tests pass; Wix/TEC/listing extract suites included in focused run (**87/88** with one **pre-existing** DB Instagram canonical upsert failure unrelated to this change: `watchlist canonical identity — DB-level regression`).

Fixture coverage includes: SSR JSON-LD, JS shell diagnosis, 403→browser success, 403→browser blocked, RHP listing + multi-performance, sitemap signature recognition, idempotent fingerprint `no_change`, nav-noise quarantine, shared waterfall regressions.

---

## Watchlist UI / API

Detail panel now surfaces adaptive diagnostics when present: HTTP result, fallback, groups/occurrences, failure stage/reason. Card serialization exposes `adaptiveHttpResult`, `adaptiveFallbackResult`, `adaptiveFailedStage`, `httpStatus`, `platformSignature`, engagement counts from `sourceWatchers.config`.

---

## Remaining limitations

1. **Sites behind hard bot challenges (DataDome/CAPTCHA)** where permitted browser cannot complete ordinary public render → precise **`blocked`** (platform may still be inferred from public sitemaps). Benson will not claim healthy or invent events.
2. **RHP listing cards** often omit doors/price until detail pages; detail enrichment is bounded and only when HTML is publicly fetchable.
3. **Unsupported / weak surfaces** still land in `needs_adapter` rather than fabricated events.
4. Calendar admission / editorial relevance remain separate downstream gates.

---

## Deployment proof

| Check | Result |
| --- | --- |
| Push | `1ee905c` → `origin/release/scout-expansion-2026-07-25` |
| Deploy | `pnpm benson:deploy-local` (dashboard `.next` cleaned after first ENOENT flake) |
| Fingerprint | **MATCH `054ef39b17e47a2d`** |
| Deploy tests | 258/258 pass in deploy gate |

```json
{
  "ok": true,
  "status": "MATCH",
  "sourceFingerprint": "054ef39b17e47a2d",
  "apiFingerprint": "054ef39b17e47a2d",
  "dashboardFingerprint": "054ef39b17e47a2d",
  "workerFingerprint": "054ef39b17e47a2d"
}
```

Report path: `BENSON_ADAPTIVE_WEBSITE_EXTRACTION_2026-09-13.md`
