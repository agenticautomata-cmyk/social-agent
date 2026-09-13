# Benson General Public Website Reader (2026-09-13)

**Branch:** `release/scout-expansion-2026-07-25`  
**Commit:** `f2ae55d`  
**Builds on:** `BENSON_ADAPTIVE_WEBSITE_EXTRACTION_2026-09-13.md` (architecture extended, not replaced)  
**Prior MATCH:** `054ef39b17e47a2d`  
**Fingerprint:** **MATCH** `10488c50fc46b004`  
**Public:** https://benson.kckellie.com · **API:** https://api.kckellie.com  

**Hard bans honored:** no Funny Bone–specific scraper; no CAPTCHA/auth/paywall/proxy bypass; no SERP scraping as event source; no Telegram/email/outreach; no billable AI (OCR local-first, vision DISABLED by default); configured Watchlist URLs preserved; Calendar Admission Authority remains downstream.

## Executive summary

Benson’s adaptive extraction is now a **general public-website reader**: a failed request to the configured URL is one acquisition observation. Before declaring blocked/empty/failed/unsupported, the orchestrator diagnoses, recognizes platform signatures, discovers bounded same-publisher alternatives (robots/sitemaps/feeds/collections/details), ranks strategies, extracts with field evidence, remembers reusable profiles, detects change, and applies controlled blocked-source backoff.

**Kansas City Funny Bone (`https://kc.funnybone.com/shows/`):**
- Configured URL preserved; HTTP **403** DataDome (+ Cloudflare) recorded as observation
- Platform **`wordpress_rhp_events`** via public sitemap CPT signature
- Exhaustive first-party ladder attempted (see table below) — **all HTML/API/feed/browser surfaces challenged**
- Public sitemaps remain reachable but contain only URL/lastmod (insufficient to verify performances without inventing dates)
- Final status: **`blocked`** with controlled reassessment (`captcha_access_control`, next retry scheduled) — **not** silently abandoned; watcher **not** operator-paused forever
- Success criterion met as **exhaustive documented proof** every permitted first-party capability is blocked/insufficient (no DataDome evasion)

Healthy matrix sources stayed healthy (Fantasy Lounge 7, Melting Pot 36, MTH 19, OSC 34, 18th & Vine 5). Eventbrite KC healthy; Meetup no_change; Do816 honestly paused/blocked.

---

## Architecture extensions (additive)

Under `services/core/src/benson-scout/adaptive-extraction/`:

| Module | Role |
| --- | --- |
| `orchestrator.ts` | Full ladder: discover → plan → alternate fetch → adapters/feeds → browser → validate → change → retry |
| `surface-discovery.ts` | Recursive sitemap (bounded), semantic same-origin links, platform-standard surfaces **only after evidence** |
| `surface-graph.ts` | Per-surface attempt evidence (HTTP, usefulness, trust, event count) |
| `strategy-planner.ts` | Deterministic ranking: structured → feed → collection → browser → detail → OCR |
| `feed-extract.ts` | RSS/Atom/JSON Feed with source evidence (never invents fields) |
| `retry-policy.ts` | CAPTCHA backoff, Retry-After, unsupported reassessment, operator pause |
| `change-detection.ts` | LKG fingerprint; retain inventory on sudden zero/block |
| `image-ocr.ts` | Optional local OCR; billable vision disabled by default |
| `strategy-memory.ts` | v2 profiles: surface type, consecutive failures, trusted promotion after repeat success |
| `validation.ts` | Visible events + zero extract → `needs_adapter`, never `empty_confirmed` |

Watchlist UI: concise HTTP/platform/challenge/surfaces/next-retry + expandable technical surface details (mobile-friendly `<details>`).

Statuses: `healthy | no_change | empty_confirmed | partial | needs_adapter | structure_changed | blocked | rate_limited | failed | operator_paused`.

---

## Funny Bone — every surface attempted

| Surface | Discovery | HTTP / result | Usefulness |
| --- | --- | --- | --- |
| `https://kc.funnybone.com/shows/` (configured) | configured | **403** DataDome challenge | challenge |
| `/robots.txt` | convention | **403** challenge | discovery blocked |
| `/sitemap.xml` → `/sitemap_index.xml` | convention | **200** XML | discovery_only (reachable) |
| `page-sitemap.xml` | sitemap child | **200** | declared `/calendar/`, `/shows/`, `/events/` |
| `rhp_events-sitemap1.xml` / `2.xml` | sitemap child | **200** | CPT signature + event URL sample |
| `rhp_venue-sitemap.xml` | sitemap child | **200** | venue CPT |
| `/calendar/` | sitemap-declared collection | **403** + browser **403** | challenge |
| `/events/` | RHP archive convention after signature | **403** | challenge |
| `/wp-json/` | platform-standard after RHP evidence | **403** | challenge |
| `/wp-json/wp/v2/rhp_events` | CPT REST after signature | **403** | challenge |
| `/feed/?post_type=rhp_events` | CPT feed after signature | **403** | challenge |
| Sitemap event detail sample (e.g. `/event/godfrey-7/...`) | bounded sitemap sample | **403** each | challenge |
| Permitted public browser on configured + `/calendar/` | browser fallback | DataDome challenge document | challenge |
| National `funnybone.com/events/` | **not used as KC source** | (family proof only: healthy RHP elsewhere) | — |

**Extract count:** **0** verified KC performances (correct — no legitimate public HTML/feed yielded event fields).  
**Not done:** CAPTCHA solve, proxy rotation, cookie reuse, SERP scraping, performer/date hard-coding, inventing events from sitemap slugs/lastmod.

**Retry:** `captcha_access_control` · `systemBackoff: true` · `operatorPaused: false` · `paused: false` on watcher · next retry stored in `adaptiveRetryState`.

Watcher id: `0e5b8427-38da-41f9-8c82-eb76ccbce5aa`  
Second check: **0** new items (idempotent under block).

---

## Multi-source generalization matrix

| Source | Platform | Status | Occurrences | Notes |
| --- | --- | --- | --- | --- |
| KC Funny Bone `/shows/` | `wordpress_rhp_events` | **blocked** | 0 | Exhaustive first-party ladder; controlled retry |
| 18th & Vine live-music | `wix_events` | healthy → no_change | 5 | Configured URL unchanged |
| Music Theater Heritage `/shows/` | `wordpress_tec` | no_change | 19 | ICS preferred; multi-surface probed |
| Fantasy Lounge event-list | `wix_events` | no_change | 7 | Hydration; multi-perf themes preserved |
| The OSC `/events` | `squarespace_events` | healthy → no_change | 34 / 26 groups | Multi-perf preserved |
| Melting Pot current-season | `theater_season` | no_change | 36 / 4 groups | Primary theater beats thin RSS |
| Eventbrite KC directory | eventbrite adapter | healthy | 58 | Second run 0 new |
| Meetup KC find | meetup adapter | no_change | 12 | Honest adapter path |
| Do816 blackeventsinkc | dostuff | blocked/paused | — | Honest; operator/system pause |

Configured URLs unchanged across all listing sources. No synthetic broken URLs. Admission stays downstream.

### Unfamiliar KC sites (central orchestrator only)

| Site | Recognition | Strategy | Result | Second run |
| --- | --- | --- | --- | --- |
| Folly Theater `/events` (SSR/structured) | `wordpress_tec` + JSON-LD | `json_ld` | **healthy** · 10 | **no_change** · same fingerprint |
| Quality Hill Playhouse `/shows` (JS/Wix) | `wix_events` | browser render attempted | **needs_adapter** · 0 | stable needs_adapter |

Limitation: Quality Hill is recognized as Wix and permitted browser completes without CAPTCHA, but public render still yields no extractable event cards → honest `needs_adapter` (not fabricated healthy).

Family proof (not KC repair claim): `https://funnybone.com/events/` → healthy `wordpress_rhp_events` · 9 occurrences.

---

## Idempotency

| Source | 1st new | 2nd new | Counts stable |
| --- | --- | --- | --- |
| Funny Bone | 0 | 0 | yes (blocked) |
| Fantasy Lounge | 0 | 0 | 7 / 7 |
| Melting Pot | 0 | 0 | 36 / 36 |
| MTH | 0 | 0 | 19 / 19 |
| 18th & Vine | 0 | 0 | 5 / 5 |
| OSC | 2 then 0 | 0 | 34 / 34 |
| Eventbrite | 14 then 0 | 0 | 58 / 58 |
| Meetup | 0 | 0 | 12 / 12 |
| Folly (unfamiliar) | — | 0 | fingerprint unchanged |

---

## Fixture / unit tests

Focused adaptive suite: **22/22 pass** (acquisition, sitemap/RHP recognition, planner ranking, RSS alternate on 403, all-alternates-blocked + retry graph, rate-limit Retry-After, OCR hints without inventing venue, multi-perf RHP, idempotent `no_change`, visible-unparsed ≠ empty_confirmed).

---

## Watchlist diagnostics (mobile)

Detail panel shows: HTTP result, fallback, groups/occurrences, failure stage, platform, challenge/blocker, surfaces probed, next retry; expandable **Technical surface details** list (attempted URLs + HTTP + usefulness).

HTTP observation and extraction status are both visible (e.g. configured URL 403 while platform/sitemaps known).

---

## Limitations

1. Sites behind hard DataDome/CAPTCHA where **all** permitted first-party HTML/API/feed/browser surfaces are challenged → precise **`blocked`** + backoff (Cannot invent showtimes from sitemap slugs).
2. Image OCR / billable vision remain disabled by default; image-only stays reviewable.
3. Some JS/Wix venues remain `needs_adapter` after honest browser attempt with zero validated cards.
4. Calendar admission / editorial relevance unchanged and downstream.

---

## Deployment proof

| Check | Result |
| --- | --- |
| Push | `f2ae55d` → `origin/release/scout-expansion-2026-07-25` |
| Deploy | `pnpm benson:deploy-local` |
| Fingerprint | **MATCH `10488c50fc46b004`** |

---

## Success definition (met)

Benson systematically exhausts safe public possibilities, selects best evidence, reuses strategies across platform families, and fails honestly when truly unreadable — not “one domain working.” KC Funny Bone is blocked with exhaustive surface proof and controlled reassessment, not abandoned or falsely marked healthy from national funnybone.com.
