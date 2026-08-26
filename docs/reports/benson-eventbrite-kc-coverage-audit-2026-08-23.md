# Benson Eventbrite KC coverage audit — 2026-08-23

**Scope:** Read-only discovery coverage audit.  
**Not done:** Eventbrite account/login, API keys, code changes, re-ingest, Calendar projection, live data mutation, CAPTCHA bypass.

**Approximate runtime:** ~8 minutes (`2026-08-23T20:13:48Z` → `2026-08-23T20:21:55Z` UTC).

---

## Executive verdict

**Eventbrite URL coverage: 0/20. Event concept presence: 2/20 (both identity mismatches). Never discovered as Eventbrite: 18/20.**

Benson does **not** browse Eventbrite city/category discovery pages. He only encounters Eventbrite when:

1. an operator pastes a concrete `/e/...` URL into Ask Benson / Share Intake, or  
2. OpenAI web search / Instagram curator research / listing scrape **happens to cite** an Eventbrite link.

Public Eventbrite KC pages are **usable without login** (HTTP 200, ItemList / Event JSON-LD, anonymous destination browse JSON with CSRF+Referer). The official authenticated Event Search API (`GET /v3/events/search/`) is **gone** (404). Creating an Eventbrite account/API key would **not** restore public city-wide search.

**Account/API recommendation: NO** — public pages are sufficient; Benson’s coverage gap is architectural (no Eventbrite discovery crawler), not missing credentials.

**Smallest next implementation (do not implement here):** treat Eventbrite as a first-class source:

`KC city + category discovery pages` → bounded pagination (HTML ItemList and/or anonymous destination browse) → `/e/{slug}-{id}` detail URLs → existing page fetch + event parser → durable identity via `eventbriteEventId` / `ask-benson-user-event-eb-<id>`.

---

## 1. Current Benson Eventbrite discovery architecture

### Answer: active browse vs indirect

**Benson does not actively browse Eventbrite discovery/category pages.**  
He only encounters Eventbrite URLs **indirectly** (web-search / newsletter / curator citations) or when a user **supplies** a single-event URL.

There is **no** `providers/eventbrite.ts`, **no** `EVENTBRITE_*` credentials in `.env` / `.env.example`, **no** watch source that polls `eventbrite.com/d/...`, and **no** Eventbrite Search API client.

### Production paths that can ingest or mention Eventbrite

| Path | Mechanism | Eventbrite discovery? |
|---|---|---|
| **Ask Benson / Share Intake** (`collectOpportunitiesFromLink`) | Scrapes a supplied `/e/{slug}-{id}` page; `extractEventbriteEventId`; external id `ask-benson-user-event-eb-<id>` | **On-demand only** (URL already known) |
| **Benson Discovery scout** (`runBensonLocalDiscovery`) | OpenAI `web_search_preview` on rotating KC queries (none say “Eventbrite”); `MAX_ITEMS_PER_QUERY=5`; interval `BENSON_DISCOVERY_INTERVAL_MS` (default 24h); query count default 2 | **Indirect** if search cites Eventbrite |
| **Curator / early-signals research** | Web search instructions *prefer* Eventbrite/Ticketmaster ticket links; stores cited URLs on leads — does not crawl Eventbrite catalogs | **Indirect** |
| **Generic `researchOpportunity`** | Title/location web search | **Indirect** |
| **Newsletter / Gmail verification** | Labels ticket hosts including Eventbrite if link already in email | **Passive** |
| **`scrape` sources** | A few scrape sources point at individual Eventbrite `/e/` or `/o/` URLs already discovered elsewhere | **Not catalog discovery** |

### Filters / limits / dedupe / cadence (relevant)

| Knob | Value |
|---|---|
| Discovery queries | KC theme strings in `benson-discovery/queries.ts` — **zero Eventbrite URLs or “site:eventbrite.com”** |
| Web-search provider | OpenAI Responses + `web_search_preview` |
| Result limit | `MAX_ITEMS_PER_QUERY = 5` |
| Query count / cadence | `BENSON_DISCOVERY_QUERY_COUNT` (default 2); `BENSON_DISCOVERY_INTERVAL_MS` (default 24h) |
| Eventbrite listing/category URLs | **None hardcoded** |
| Pagination of Eventbrite | **None** |
| Location filters | Prompt text “Kansas City metro” only — not Eventbrite place IDs |
| Eventbrite-specific parser | Id extract + ticket-host detection + user-opportunity dedupe — **not** a catalog parser |
| Dedupe | `metadata.eventbriteEventId`, `ask-benson-user-event-eb-<id>`, canonical URL helpers |

### Live durable inventory snapshot (read-only)

| Metric | Count |
|---|---|
| `content_items` with Eventbrite URL / `eventbriteEventId` / `ask-benson-user-event-eb-*` | **10** total |
| By ingest | `scrape_listing` 8, `ask_benson_link` 1, `discount_watch` 1 |
| By state | all `planned` |
| `sources` with Eventbrite in config | **3** scrape sources (individual pages, not city browse) |
| `creator_calendar_items` with Eventbrite in URL/metadata | **20** (mostly Instagram watchlist citations, not catalog crawl) |
| `benson_discoveries` runs mentioning Eventbrite in citations/items | **1** historical run |

---

## 2. Exact 20-event public control set

Built from **public** Eventbrite HTML (no login) on 2026-08-23. Mix: food/drink, music, business, festivals/markets, family, arts.

Discovery surfaces used:

- `https://www.eventbrite.com/d/mo--kansas-city/events/`
- `.../food-and-drink--events/` (redirects to `/b/mo--kansas-city/food-and-drink/`)
- `.../music--events/`
- `.../business--events/`
- `.../fairs-festivals--events/`
- `.../family-and-education--events/`
- `.../arts--events/`

| # | Title | Date | Venue / city | Category page | Eventbrite ID | URL |
|---|---|---|---|---|---|---|
| 1 | Kansas City Taco Festival | 2026-09-19 | KC Live! / Kansas City | fairs-festivals / food | 1996482122773 | https://www.eventbrite.com/e/kansas-city-taco-festival-tickets-1996482122773 |
| 2 | The Kansas City Margarita Festival | 2026-08-23 | 509 NW Barry Rd / Kansas City | food-and-drink | 1992430928542 | https://www.eventbrite.com/e/the-kansas-city-margarita-festival-tickets-1992430928542 |
| 3 | Bourbon, Bacon & Brews | 2026-10-09 | Overland Park | food-and-drink | 1994365695482 | https://www.eventbrite.com/e/bourbon-bacon-brews-tickets-1994365695482 |
| 4 | R&B Festival with Jacquees, Lloyd, H-Town, Changing Faces, Big Bub and more | 2026-09-05 | Grandview Amphitheater / Grandview | music / fairs-festivals | 1988697063451 | https://www.eventbrite.com/e/rb-festival-with-jacquees-lloyd-h-town-changing-faces-big-bub-and-more-tickets-1988697063451 |
| 5 | Tez Carter's All White Party | 2026-09-07 | Sporting Park / Kansas City | music | 1993329201300 | https://www.eventbrite.com/e/tez-carters-all-white-party-tickets-1993329201300 |
| 6 | Sincerely Yours R&B Experience | 2026-09-04 | The DISTRKCT / Kansas City | music | 1994887561397 | https://www.eventbrite.com/e/sincerely-yours-rb-experience-tickets-1994887561397 |
| 7 | Havana Night Party on Rock Island Bridge | 2026-10-03 | Kansas City | music | 1993956277903 | https://www.eventbrite.com/e/havana-night-party-on-rock-island-bridge-tickets-1993956277903 |
| 8 | Kansas City AI Club Meetup \| August 25, 2026 \| Panel: Avoiding AI Pitfalls | 2026-08-25 | Keystone CoLAB / Kansas City | business | 1997410817524 | https://www.eventbrite.com/e/kansas-city-ai-club-meetup-august-25-2026-panel-avoiding-ai-pitfalls-tickets-1997410817524 |
| 9 | NAWBO KC Monthly Breakfast | 2026-09-08 | Kansas City | business | 1997339553371 | https://www.eventbrite.com/e/nawbo-kc-monthly-breakfast-tickets-1997339553371 |
| 10 | Woven 2026: Women's Conference | 2026-09-11 | Graceway / Kansas City | business | 1993554814114 | https://www.eventbrite.com/e/woven-2026-womens-conference-tickets-1993554814114 |
| 11 | CROSSROADS CREATIVE VENDOR FAIR | 2026-09-25 | Kansas City Convention Center | fairs-festivals | 1996198914690 | https://www.eventbrite.com/e/crossroads-creative-vendor-fair-tickets-1996198914690 |
| 12 | Inclusive Back to School Bash & Resource Fair | 2026-08-29 | Shawnee | fairs-festivals | 1994954910841 | https://www.eventbrite.com/e/inclusive-back-to-school-bash-resource-fair-tickets-1994954910841 |
| 13 | HAIRitage Day Community Leaders & Kids Fashion Show Fundraiser | 2026-08-29 | T-Mobile Center / Kansas City | family-and-education | 1990747565558 | https://www.eventbrite.com/e/hairitage-day-community-leaders-kids-fashion-show-fundraiser-tickets-1990747565558 |
| 14 | Kansas City Reptile Show | 2026-09-13 | Overland Park | family-and-education | 1981938776232 | https://www.eventbrite.com/e/kansas-city-reptile-show-tickets-1981938776232 |
| 15 | Totally Tots | 2026-09-18 | Kansas City | family-and-education | 1992933714388 | https://www.eventbrite.com/e/totally-tots-tickets-1992933714388 |
| 16 | John Green, Hollywood, Ending with Rainy Day Books | 2026-10-06 | Unity Temple on the Plaza / Kansas City | arts | 1993833003185 | https://www.eventbrite.com/e/john-green-hollywood-ending-with-rainy-day-books-tickets-1993833003185 |
| 17 | Jodi Picoult, Hollow Bones with Rainy Day Books | 2026-09-22 | Unity Temple on the Plaza / Kansas City | arts | 1992499539760 | https://www.eventbrite.com/e/jodi-picoult-hollow-bones-with-rainy-day-books-tickets-1992499539760 |
| 18 | Hard Candy Kansas City with Joey Jay | 2026-08-24 | Hamburger Mary's / Kansas City | arts | 1993928508845 | https://www.eventbrite.com/e/hard-candy-kansas-city-with-joey-jay-tickets-1993928508845 |
| 19 | Studio Night: Action & Rest | 2026-08-27 | Kansas City | arts | 1994872637760 | https://www.eventbrite.com/e/studio-night-action-rest-tickets-1994872637760 |
| 20 | 2026 Disability Inclusion Summit | 2026-09-24 | Diamond Conference Center / North Kansas City | business | 1970414039434 | https://www.eventbrite.com/e/2026-disability-inclusion-summit-tickets-1970414039434 |

Public/private: all **public_listed** (appeared on anonymous discovery HTML).

---

## 3. Benson result for every control

Read-only queries against live `social_agent` Postgres (`SET default_transaction_read_only` attempted; selects only). Match keys: Eventbrite numeric id in `source_url` / `source_external_id` / `metadata.eventbriteEventId`, plus bounded title near-misses and calendar URL/title checks.

| # | Classification | Benson result |
|---|---|---|
| 1 Taco Festival | **D** | No inventory / calendar / discovery match for Eventbrite id |
| 2 Margarita Festival | **D** | No match |
| 3 Bourbon, Bacon & Brews | **E** | Same title+date in `content_items` + calendar via `https://www.downtownop.org/events` (`scrape_listing`); **Eventbrite URL never stored**; no `eventbriteEventId` |
| 4 R&B Festival (Jacquees…) | **E** | Calendar `FOR THE LOVE OF R&B Festival` same date/venue (Grandview Amphitheater 2026-09-05) via Ticketmaster + `instagram_watchlist`; **Eventbrite listing URL never stored** |
| 5 Tez Carter's All White Party | **D** | No match (unrelated Tez Carter Linktree row exists; not this event) |
| 6 Sincerely Yours | **D** | No match |
| 7 Havana Night | **D** | No match |
| 8 AI Club Meetup | **D** | No match |
| 9 NAWBO breakfast | **D** | No match |
| 10 Woven 2026 | **D** | No match |
| 11 Crossroads Creative Vendor Fair | **D** | No match |
| 12 Inclusive Back to School Bash | **D** | No match |
| 13 HAIRitage Day | **D** | No match |
| 14 Reptile Show | **D** | No match |
| 15 Totally Tots | **D** | No match |
| 16 John Green | **D** | No match |
| 17 Jodi Picoult | **D** | No match |
| 18 Hard Candy | **D** | No match |
| 19 Studio Night | **D** | No match |
| 20 Disability Inclusion Summit | **D** | No match |

### Counts

| Class | Meaning | Count |
|---|---|---|
| A | Found and healthy (Eventbrite id/url in inventory, surfaced) | **0** |
| B | Found but not surfaced | **0** |
| C | Discovered but rejected/filtered | **0** |
| D | Never discovered | **18** |
| E | Duplicate / identity problem | **2** |

### Coverage percentage

- **Eventbrite URL / id coverage: 0/20 (0%)**
- **Any durable presence of the same event concept: 2/20 (10%)** — both **E**, not healthy Eventbrite-backed rows
- **Never discovered (D): 18/20 (90%)**

---

## 4. First failed stage for misses (root-cause grouping)

For every **D**, the first failure is the same:

### Primary root cause (18/18 D events)

**Eventbrite discovery/category pages are never queried.**  
Benson has no worker/source that fetches `/d/mo--kansas-city/...` or category browse surfaces. Without that (or an equivalent catalog feed), these public events never enter the URL funnel.

### Secondary contributors (same first stage; amplify the gap)

| Cause | Role |
|---|---|
| Web search never reliably surfaces these Eventbrite URLs | Discovery scout / curator research can cite Eventbrite but are not Eventbrite-first; live inventory shows only sparse EB URLs |
| No Eventbrite pagination / place-id browse | Even if one page were fetched, there is no page-2+ / continuation loop |
| Result limits on generic discovery (`MAX_ITEMS_PER_QUERY=5`, ~2 queries/day) | Too small to cover ~2000+ KC Eventbrite listings (`object_count≈2084` on place browse) |
| Category coverage too narrow for Eventbrite | Queries mention festivals/food/music thematically but never Eventbrite categories |

### E events (2) — first failed stage differs slightly

| Event | First failure relative to Eventbrite |
|---|---|
| Bourbon, Bacon & Brews | Event discovered via **downtownop.org**, not Eventbrite; identity not linked to Eventbrite id |
| R&B Festival | Event surfaced via **Instagram watchlist → Ticketmaster venue**, not Eventbrite listing URL |

Neither is “rejected Eventbrite parse”; Eventbrite was simply not the discovery source.

**Not observed as first failure for these 20:** Eventbrite blocking the scraper on public HTML (pages returned 200), parser failing after URL known, or source filter dropping an ingested Eventbrite id.

---

## 5. Public Eventbrite page access findings

### Tests run (anonymous, no login)

| Surface | HTTP | Usable server HTML? | Structured data | Notes |
|---|---|---|---|---|
| KC city discovery `/d/mo--kansas-city/events/` | **200** | Yes (~958KB) | **JSON-LD `ItemList`** (~65 `/e/` links) | “captcha” string appears in bundle; **no login wall**; events visible |
| Category food / music / business / family / arts | **200** (often redirect to `/b/...`) | Yes | JSON-LD ItemList (~8 events each in SSR) | Public |
| Fairs/festivals category | **200** | Yes | ItemList (~20–26 links) | Public |
| City `?page=2` HTML | **200** | Yes | Same ~66 event paths as page 1 | **HTML pagination ineffective** — SPA/API driven |
| 5 detail pages (taco, AI club, vendor fair, John Green, Tez Carter) | **200** | Yes (~180–245KB) | Event / SocialEvent JSON-LD and/or `__NEXT_DATA__` + og:title | Public; times/venue present when Event schema present |
| Official `GET https://www.eventbriteapi.com/v3/events/search/` | **404** | — | — | Public Event Search API removed |
| Browser `POST /api/v3/destination/search/` without Referer | **401** CSRF | — | — | Not an account gate |
| Same destination search with CSRF cookie + Referer/Origin | **200** | JSON | Events with `url`, `name`, dates, `eventbrite_event_id` | **Anonymous**; place `85970739` → `object_count≈2084`, page 1≠page 2 |

### Pagination findings

- **SSR HTML** for city/category is a **first-page / partial** catalog (ItemList), not full infinite scroll.
- **`?page=2` on HTML** did not yield new event ids in this audit.
- **Anonymous destination search** supports real pagination (`page`, `continuation`, `page_count` ~49 at page_size 20 for KC place).
- Additional results **can** be fetched without login via that browser JSON endpoint (CSRF token + Referer). This is **not** the official org OAuth Event API and is still a public-web contract that can change.

### Anti-bot / access limitations

- No CAPTCHA challenge blocked these curl fetches.
- Destination search requires CSRF + Referer (browser-like headers), not an Eventbrite user account.
- Did **not** attempt to bypass any challenge pages.

---

## 6. Current Eventbrite API limitation (public search)

Per Eventbrite platform changelog (Dec 2019) and live probe:

- **`GET /v3/events/search/`** public Event Search API was shut down; live call returns **404 NOT_FOUND**.
- Remaining official Event APIs are **org/venue/event-id scoped** for creators/partners, e.g.:
  - `GET /v3/events/:event_id/`
  - `GET /v3/venues/:venue_id/events/`
  - `GET /v3/organizations/:organization_id/events/`
- Those endpoints **do not** provide “all public events in Kansas City.”
- Distribution-partner programs exist for broader access; that is a business agreement, not “create a free API key.”

---

## 7. Account / API recommendation

**Choice: NO — public pages are sufficient; Benson coverage is the problem.**

| Claim | Evidence |
|---|---|
| Need account for public KC discovery? | **No** — city/category HTML + detail pages returned 200 with event data without login |
| Would OAuth API key unlock city search? | **No** — official public search is gone; org APIs are not city discovery |
| Would account help *some* ops? | Only organizer-owned events, orders, webhooks — **not** this miss pattern |
| Why misses happen | Benson never schedules Eventbrite discovery browse |

**Not PARTIALLY/YES:** an authenticated org endpoint was **not** shown to provide the missing public KC catalog capability. Anonymous public web surfaces already expose it.

---

## 8. Smallest next implementation recommendation

**Do not implement in this task.** Recommended next task:

1. Add an **Eventbrite KC discovery source** that periodically fetches:
   - city page `/d/mo--kansas-city/events/`
   - a **bounded** set of category pages (food, music, business, arts, family, festivals)
2. Extract `/e/{slug}-{id}` URLs from JSON-LD ItemList (and optionally destination-search pagination with hard caps, e.g. N pages / M events per run).
3. For each new id, fetch the **detail page** with the existing HTML/JSON-LD pipeline (same path Ask Benson already uses for ticket URLs).
4. Persist with **`eventbriteEventId`** + existing `ask-benson-user-event-eb-<id>` / inventory dedupe so downtownop/Ticketmaster twins merge instead of double-create.
5. Keep geography = KC metro place only; no full-site crawl.

This is smaller than building OAuth, partner applications, or Calendar projection changes.

---

## 9. Exact bounded queries / tests run

**Code / architecture (read-only):** grep Eventbrite across services; read `benson-discovery/queries.ts`, `run.ts`, Ask Benson dedupe/collect-from-link, curator research.

**Public HTTP (curl, no cookies/account):**

- 1 city + 6 category discovery URLs
- city `?page=2`
- 5 individual event detail URLs
- official `eventbriteapi.com/v3/events/search/` (404)
- destination search POST without/with Referer; place browse pages 1–2; sample q=“taco festival Kansas City”

**Postgres (read-only selects on `social_agent`):**

- Count/list Eventbrite-ish `content_items`
- Match 20 control ids against `content_items` + `creator_calendar_items`
- Title near-misses for control titles
- `sources` / `benson_discoveries` Eventbrite mentions
- Schema peeks for calendar/discovery tables

---

## 10. Confirmations

| Confirmation | Status |
|---|---|
| Code changed | **No** |
| Live durable data changed | **No** (SELECT / HTTP GET/POST search only) |
| Eventbrite account / login used | **No** |
| API key created | **No** |
| Calendar projection / re-ingest run | **No** |
| Discoveries / other features fixed | **No** (audit only) |

---

## 11. Out of scope / unrelated findings

- Instagram watchlist already drops some Eventbrite ticket URLs into **calendar suggestions** (separate path; not Eventbrite catalog coverage).
- One West Palm Beach Eventbrite row exists in inventory via `scrape_listing` — geography quality issue, **out of scope**.
- Destination-search ToS / long-term stability of the anonymous browser API — note for implementers; not solved here.
- `/transcribe` File issue and Ask Benson image restart work — unrelated.

---

## Output summary (for ChatGPT handoff)

1. **Eventbrite coverage:** **0/20** by Eventbrite URL/id (**2/20** if counting alternate-source twins as E).  
2. **Never discovered:** **18**.  
3. **Top root cause:** Eventbrite city/category discovery pages **never queried**; only indirect/user-supplied Eventbrite URLs.  
4. **Need Eventbrite account?** **NO.**  
5. **Next implementation task:** first-class Eventbrite KC discovery crawl (bounded city/category → detail URLs → existing parser → `eventbriteEventId` dedupe).
