# Benson ↔ Alexa integration plan — read-only household V1

**Date:** 2026-08-16  
**Status:** Planning / audit only. No product code, deploy, AWS resources, Alexa skill, or auth changes were made.  
**Machine:** Mappy (local Benson).  
**Principle:** Alexa is a voice presentation layer. Benson remains authority for Calendar, Weekend List, discoveries, Watchlist, creator analytics, and other durable operator intelligence.

---

## 1. Executive recommendation

**Recommend Option A:** unpublished Alexa Custom Skill → AWS Lambda (ASK SDK) → a **new, path-restricted Cloudflare Tunnel hostname** → a **tiny Benson voice-read API** on Mappy.

Do **not** point Alexa at `https://api.kckellie.com`. That hostname already tunnels the **entire** Hono API with **no in-app login**. Cloudflare Access protects the dashboard (`benson.kckellie.com`), not the API (OAuth callbacks require the API to stay reachable). CORS on the API is `origin: '*'`.

Do **not** route common utterances through Ask Benson. `POST /api/ask-benson` can run an LLM, persist chat, and trigger URL intake/research (dashboard proxy timeout is 600s). Common household questions already have deterministic read paths.

**First-build intents only:**

1. “Alexa, ask Benson what’s happening this weekend.”
2. “Alexa, ask Benson what’s on the weekend list.”

Then add today/overnight, day calendar, discoveries, analytics, and watchlist summaries.

```
Household Echo
  → Alexa Custom Skill (dev, unpublished)
  → AWS Lambda (skill-ID gated)
  → alexa.kckellie.com (new CF Tunnel hostname, path allowlist)
  → GET /api/benson-voice/* (new, not built yet)
  → existing durable Benson loaders (no projection rebuild, no scrape, no LLM)
```

---

## 2. Benson API / read-path audit

**Global auth today:** no session middleware on Hono (`services/api/src/server.ts`). Most operator routes are open on the LAN and, when the tunnel is up, on `api.kckellie.com`. `resolveOperatorCreatorId()` is **not** authentication — it returns the single active TikTok creator. Control Tower uses `BENSON_CONTROL_TOWER_KEY` only.

Treat every existing route as **unsafe to call from Alexa/Lambda directly**. The voice-read service must wrap the *functions*, not expose the existing HTTP surface.

### 2.1 Today / operator briefing

| Candidate | File / function | HTTP | Auth | Shape (keys) | Latency | Expensive work? | Read side effects? | Voice? |
|---|---|---|---|---|---|---|---|---|
| Home dashboard | `computePreAlphaHome` in `services/core/src/pre-alpha/home.ts` | `GET /api/pre-alpha/home` | none | `greeting`, `priorities`, `dailyBriefing`, `topOpportunities`, `refresh`, `studioPulse` | Soft timeouts 8–35s; historically multi-second to tens of seconds; single-flight | Heavy inventory + sponsor intel; no LLM on GET | No user mutation; checkpoint logic may run | **No** as a sync Alexa call |
| TikTok pulse brief | `getLatestProgressBrief` in `services/core/src/benson-pulse/index.ts` | `GET /api/benson-pulse/latest` | none | `headline`, `progressSummary`, `whatChanged[]`, `suggestedNextStep`, `createdAt`, `dataThrough` | Fast (latest row) | No — worker precomputes | None | **Yes** |
| Overnight discovery snapshot | `getLatestDiscovery` in `services/core/src/benson-discovery/index.ts` | `GET /api/benson-discovery/latest` | none | `summary`, `items[{title,location,eventStartsAt}]`, counts | Fast (latest row + skip filter) | No | None | **Yes** |
| Learning insights | `getLatestLearnings` in `services/core/src/benson-learning/index.ts` | `GET /api/benson-learning/latest` | none | `summary`, `insights[]`, `isStale` | Fast | No | None | **Yes** if enabled |
| Top scored picks | `getTopScoredOpportunities` + `shapeHomeTopPicks` | `GET /api/benson-pulse/top-opportunities?limit=` | none | title, location, eventDate, rationale | Moderate DB | No scrape | None | **Yes** (limit 3) |
| Action center | `computeActionCenter` | `GET /api/action-center` | none | overdue / dueToday / dueThisWeek | Moderate | No | None | Later, maybe |
| Pulse **run** | `runTikTokPulse` | `POST /api/benson-pulse/run` | none | run result | Slow + LLM | **Yes** | Writes | **Never** on Alexa path |

**Voice design:** compose pulse + discovery-latest (+ optional learning). Do not call Home.

### 2.2 Calendar by date / day / weekend

| Candidate | File / function | HTTP | Auth | Shape | Latency | Expensive? | Side effects? | Voice? |
|---|---|---|---|---|---|---|---|---|
| Calendar window | `listCalendarItems` in `services/core/src/creator-calendar/items.ts` | `GET /api/calendar/items?from=&to=` | none | `CalendarItemView[]` + snoozes | Warm median ~2.6s; cold populated ~3.8s; empty window can **await ~18s+** (`docs/reports/benson-calendar-read-latency-2026-08-14.md`) | Projection when cold/stale | **Yes** — may `await` or background `ensureCalendarInventoryProjections` (750ms delay, 90s TTL) | **Only via a projection-free wrapper** |
| Single item | `getCalendarItem` | `GET /api/calendar/items/:id` | none | one view | Fast | No | None | Yes if id known |
| Things To Do (curated) | `computeWeekendThingsToDo` | `GET /api/calendar/weekend-things-to-do` | none | suggested weekend items + `selected` | Moderate | No scrape | None | Later; not Weekend List |

Dashboard default window: now−1 day → now+60 days. Default API window if params omitted: same.

**Alexa contract:** query existing `creator_calendar_items` for the spoken day/weekend. If zero rows, say Benson does not have that day ready. Do **not** rebuild projection, scrape, or research on the voice request.

### 2.3 Weekend List

| Candidate | File / function | HTTP | Auth | Shape | Latency | Expensive? | Side effects? | Voice? |
|---|---|---|---|---|---|---|---|---|
| Operator Weekend List | `loadWeekendList` in `services/core/src/creator-calendar/weekend-list.ts` | `GET /api/calendar/weekend-list?friday=` | none | `days[]`, `selectedCount`, **`flyerBrief`**, **`fullList`**, `emptyMessage` | Fast (planner board + hydrate) | No | None | **Yes — first-build #2** |

Selection authority is the planner `Weekend` board (`plan_weekend`), not Calendar suggestions. `flyerBrief` / `fullList` are already spoken-oriented text. Reuse them; do not invent a second store.

Write paths (`POST .../weekend-list`) are **Phase 6 only**.

### 2.4 Recent discoveries

| Candidate | File / function | HTTP | Auth | Shape | Latency | Expensive? | Side effects? | Voice? |
|---|---|---|---|---|---|---|---|---|
| Discoveries feed | `listOpenDiscoveries` in `services/core/src/creator-interest/actions.ts` | `GET /api/creator-interest/discoveries/feed?limit=` | none | `OpenDiscoveryCard[]` (title, whereWhen, summary, discoveredAt) | Moderate DB + taste/skip | No LLM/scrape | None | **Yes** (top 3) |
| Overnight snapshot | `getLatestDiscovery` | `GET /api/benson-discovery/latest` | none | summary + items | Fast | No | None | **Yes** |
| Discovery sources | `listBensonDiscoverySources` | `GET /api/creator-interest/discoveries` | none | source metadata | Fast | No | None | No (ops) |

### 2.5 Kellie creator analytics

| Candidate | File / function | HTTP | Auth | Shape | Latency | Expensive? | Side effects? | Voice? |
|---|---|---|---|---|---|---|---|---|
| Hub | `computeAnalyticsHub` in `services/core/src/creator-analytics/dashboard.ts` | `GET /api/analytics/` | none | connectors + platform totals | Moderate | Demo seed if `DEMO_MODE` | Possible demo seed write | **Yes** summary |
| TikTok dashboard | `computePlatformDashboard('tiktok')` | `GET /api/analytics/tiktok` | none | views, followers, top/recent videos, `dataThrough` | Moderate | No live sync | Demo seed possible | **Yes** (trim to 1–2 videos) |
| Instagram | hub / `GET /api/analytics/meta/status` only | **no `GET /api/analytics/instagram`** | none | hub post/view counts | Fast–moderate | No | None | Speak hub fields or “not ready” |
| Pulse narrative | `getLatestProgressBrief` | `GET /api/benson-pulse/latest` | none | spoken TikTok delta | Fast | No | None | **Yes** |
| Sync | `runCreatorAnalyticsSync` | `POST /api/analytics/sync` | none | sync result | Slow + provider APIs | **Yes** | Writes | **Never** |

If `dataThrough` is stale or brief is null: “I don’t have fresh TikTok numbers yet.”

### 2.6 Watchlist findings

| Candidate | File / function | HTTP | Auth | Shape | Latency | Expensive? | Side effects? | Voice? |
|---|---|---|---|---|---|---|---|---|
| List | `listWatchlist` | `GET /api/watchlist/` | none | health, last new item, qualifiedThisWeek | Fast–moderate | No scrape | **`syncInstagramWatchersWithSharedSession()` before list** | Later; voice wrapper must **skip** session sync |
| Detail | `getWatchlistItem` + leads | `GET /api/watchlist/:id` | none | scoutItems, curatorLeads | Moderate | No scrape | None beyond list sync | Later, summarize 1–3 |
| Check now | `runWatcherNow` | `POST /api/watchlist/:id/check-now` | none | run | Slow scrape | **Yes** | Writes | **Never** |

### 2.7 Ask Benson conversational path

| Candidate | File / function | HTTP | Auth | Shape | Latency | Expensive? | Side effects? | Voice? |
|---|---|---|---|---|---|---|---|---|
| Ask | `askBenson` in `services/core/src/ask-benson/ask.ts` | `POST /api/ask-benson` | none (creator inferred) | `answer`, evidence, collection | 1–3s partnership fast path; general LLM longer; URL/image intake can run minutes | LLM; may scrape/research | **Yes** — persists messages, may intake URLs | **No** for V1 common intents |
| History | conversation GETs | `GET /api/ask-benson/conversations*` | `resolveOperatorCreatorId` | threads/messages | Fast | No | None | Not needed |
| Transcribe | `transcribeAudioBlob` | `POST /api/ask-benson/transcribe` | none | text | OpenAI STT | Yes | None | Alexa already does ASR |
| Studio TTS | Voicebox jobs | `/api/voice/*` | generate unauthenticated; audio uses creator id | audio | Local Voicebox | TTS job | Writes jobs | **Do not use** — Alexa speaks its own text |

Existing `/api/voice` is Benson Studio TTS. It is not an Alexa skill.

---

## 3. Existing network / security audit

### What exists

| Mechanism | Status |
|---|---|
| Cloudflare Tunnel `mmm-assistant` (`6f1688b3-ae2c-48ab-abfa-20394eae5ba1`) | **Configured** — `deploy/cloudflared.config.yml.working-benson`, `/etc/cloudflared/config.yml` |
| `benson.kckellie.com` → `localhost:3000` | Dashboard; Cloudflare Access (Elliott/Kellie emails) |
| `api.kckellie.com` → `localhost:4000` | **Full API**; Access **intentionally not** applied (TikTok/Meta/Gmail/Calendar OAuth callbacks) |
| nginx / Caddy / Traefik | Not in repo |
| Tailscale / ngrok / VPN / AWS Lambda / API Gateway | Not present |
| Next.js rewrites | Dashboard `/api/*` → local `:4000` (avoids tunnel hairpin) |
| n8n | `:5678` local; not in tunnel ingress |
| Voicebox | `127.0.0.1:17493` only |
| Telegram / web push / Slack | **Outbound** notification bridges |
| Benson as OAuth **provider** | **Does not exist** (Benson is an OAuth **client**) |
| App-wide API auth | **Does not exist** except Control Tower / admin spend / some newsletter ops |

### Ports

| Service | Port | Tunnel? |
|---|---|---|
| API | 4000 | Yes (`api.kckellie.com`) |
| Dashboard | 3000 | Yes (`benson.kckellie.com`) |
| Postgres | 5433 host | **Never** |
| Voicebox | 17493 localhost | No |
| n8n | 5678 | No |

### What we do **not** want

Alexa / AWS → public raw Benson API on Mappy (`api.kckellie.com`). That is already a broad surface. Alexa must not enlarge it.

---

## 4. Recommended architecture

### Option A — Lambda + narrow Benson bridge (recommended)

Alexa Custom Skill → Lambda → `https://alexa.kckellie.com/api/benson-voice/...` (new hostname, path-restricted tunnel ingress) → Mappy voice-read module → existing loaders.

**Why:** Alexa requires a public HTTPS or Lambda endpoint. Lambda keeps Alexa request verification in AWS. The tunnel already exists, so no ports open. A **new hostname** plus path allowlist keeps the public surface to voice-read only. Business logic stays in Benson.

### Option B — Alexa HTTPS directly to Benson

Only valid if Benson already has a safe public HTTPS architecture. **It does not.** `api.kckellie.com` is the full API without Access. Rejected.

### Option C — something already safer in-repo

Nothing materially safer exists (no Tailscale Funnel, no API gateway, no dedicated ingress service). Closest reusable pieces: Cloudflare Tunnel + `x-benson-request-id` + Control Tower shared-secret pattern. Those support Option A; they are not a third architecture.

### Architecture diagram

```
                    Amazon (unpublished skill)
  Echo ──ASK──► Alexa service ──► Lambda (skill ID + user allowlist)
                                      │
                                      │ HTTPS + service token
                                      │ 2.5s timeout
                                      ▼
                         Cloudflare Tunnel hostname
                         alexa.kckellie.com
                         path: /api/benson-voice/*
                                      │
                                      ▼
                         Mappy :4000 voice-read route
                         allowlisted ops only
                                      │
              ┌───────────┬───────────┼────────────┬────────────┐
              ▼           ▼           ▼            ▼            ▼
         calendar    weekend     pulse/      discoveries   analytics
         rows only   list        discovery   feed (later)  hub (later)
                     flyerBrief  latest
```

---

## 5. Alexa skill intent model

**Desired utterance:** “Alexa, ask Benson …”

### Invocation name

Amazon certification: one-word names are **not allowed** unless unique brand/IP is documented  
(https://developer.amazon.com/en-US/docs/alexa/custom-skills/choose-the-invocation-name-for-a-custom-skill.html).

| Stage | Invocation | Spoken example |
|---|---|---|
| Household development (try first) | `benson` | “Alexa, ask Benson what’s happening this weekend” |
| Fallback / certification | `benson studio` | “Alexa, ask Benson Studio what’s on the weekend list” |
| Alternate to test | `kellie's benson` | If `benson` is misheard |

Do not include wake words, “skill”, or “app” in the invocation name.

### V1 intents

| Intent | Sample utterances | Slots | Benson op |
|---|---|---|---|
| `CalendarIntent` | what’s happening this weekend; what’s on the calendar Saturday; what’s happening {date} | `AMAZON.DATE` | `weekend_calendar` or `day_calendar` |
| `WeekendListIntent` | what’s on the weekend list; what did Kellie pick this weekend | optional `AMAZON.DATE` Friday | `weekend_list` |
| `BensonTodayIntent` | what should I know today; what did you find overnight | — | `today_brief` (Phase 4) |
| `RecentDiscoveriesIntent` | what new things did you find; anything interesting lately | — | `discoveries` (Phase 4) |
| `AnalyticsIntent` | how is Kellie doing on TikTok; how is Instagram doing; how did the latest TikTok perform | `platform` custom slot | `analytics` (Phase 4) |
| `BensonHelpIntent` | what can you tell me; help | — | static copy |
| `BensonMoreIntent` / `AMAZON.NextIntent` | tell me more; next | session | paginate |
| `AMAZON.StopIntent` / `CancelIntent` | stop / cancel | — | close |

No mutation intents in V1.

---

## 6. Spoken-response contract

Formatter lives in Benson (compact JSON → speech). Lambda does not re-implement ranking.

**Rules**

- Answer immediately with 1–3 items.
- Short sentences. Spoken dates (“Saturday, October ninth”), not ISO.
- Strip URLs, UUIDs, confidence, markdown, evidence dumps, debug jargon.
- Never read a 30-event list.
- Pattern: count + top three + offer more.

**Example**

User: “What’s happening Saturday?”  
Good: “Benson found 18 things Saturday. The strongest are Melon Summer Smash at the Kansas City Zoo, the 816 Day events downtown, and Hike with a Naturalist at Lakeside Nature Center. Ask me for more Saturday events if you want the rest.”

Weekend List: prefer existing `flyerBrief` (short) then session-page `fullList`.

**Pagination:** Alexa **session attributes** (`dayKey`, `offset` or remaining titles). No new durable Benson conversation table.

**Would require research:** “I don’t have that ready. Check Benson on the dashboard.”

---

## 7. Authentication / private-pilot design

### Stage 1 — household development (recommended for V1)

Benson has no user OAuth provider. Building one is not required for a private Echo on the developer’s Amazon account.

1. Unpublished Custom Skill on Elliott’s Amazon developer account.
2. Enable on Echo devices registered to that account or the same Amazon Household.
3. Lambda trigger: Alexa Skills Kit + **skill ID verification**.
4. Code allowlist: Alexa `context.System.user.userId` (and optionally `deviceId`).
5. Lambda → Benson: Cloudflare Access **service token** (if the new hostname is Access-gated) **plus** a Benson shared secret (`Authorization: Bearer`, timestamp, `x-benson-request-id`).
6. Reject unknown skill IDs and unknown Amazon user IDs with spoken “I can only talk to this household’s Benson.”

**Limitations:** other Amazon accounts cannot use the skill; Kellie must share the Household or accept a beta invite. This is acceptable only for the private pilot.

### Stage 2 — production-grade private access

Alexa account linking, OAuth 2.0 **authorization-code** grant with PKCE  
(https://developer.amazon.com/en-US/docs/alexa/account-linking/configure-authorization-code-grant.html).

That requires a Benson authorization server, login UI, token endpoint (Alexa token exchange budget ~4.5s), and refresh tokens. **Do not implement in V1.**

**Force account linking on day one only if:**

- The skill must run on an Amazon account outside Elliott’s Household.
- The skill is published or certified.
- You need per-user Benson identity beyond the single-operator household.

---

## 8. Mappy security design

- Do not open ports. Reuse Cloudflare Tunnel.
- **New hostname** (recommended `alexa.kckellie.com`) with ingress **only** `/api/benson-voice/*` → `http://localhost:4000`. Catch-all 404.
- Do **not** add Alexa to `api.kckellie.com`.
- Allowlisted operations only: `weekend_calendar`, `day_calendar`, `weekend_list`, later `today_brief`, `discoveries`, `analytics`, `watchlist_summary`.
- Strong service authentication (Access service token + Benson bearer).
- Short timeouts (see §9). Rate limit (e.g. 20 req/min/household).
- Request IDs (`x-benson-request-id`). Replay window (timestamp ±60s, optional nonce).
- No arbitrary SQL, query, or shell endpoints.
- No secrets, tokens, or email bodies in Alexa speech or logs.
- Origin IP stays unpublished (existing pre-alpha rule).

---

## 9. Latency / timeout design

Voice must read durable/current state only.

| Hop | Budget | On miss |
|---|---|---|
| Alexa → Lambda | Amazon ~8s hard ceiling | Alexa default error |
| Lambda → Benson | **2.5s** connect+read | Spoken timeout copy |
| Benson voice-read | **1.5s** target, **2.0s** cap | 504 + spoken fallback |
| Cold calendar projection via existing GET | 3.8–18s+ | **Forbidden** on Alexa path |

**Forbidden on the Alexa request path**

- Broad research / Ask Benson URL intake
- Newsletter extraction
- Calendar projection rebuild (`ensureCalendarInventoryProjections`)
- Scraping / Watchlist `check-now`
- Analytics sync / pulse `POST /run`
- Expensive LLM jobs

If the operation would need those: say it is not ready.

---

## 10. Privacy boundaries

Assume household listening (kitchen / living room).

**V1 may speak**

- Public events (Calendar suggestions)
- Weekend List picks
- Creator analytics summaries (views, followers, latest video performance)
- General discoveries (titles, venues, dates)

**Exclude from Alexa V1 entirely**

- Private sponsor correspondence and outreach drafts
- Email bodies / Gmail inbox content
- Contact information
- Credentials, tokens, OAuth status detail
- Personal / private calendar (Google busy blocks, personal notes)
- Unpublished financial or payment information
- Control Tower / admin / spend
- Watchlist session internals

When a later intent would touch an excluded class, refuse: “That’s not something I say out loud. Open Benson on the dashboard.”

---

## 11. Error handling (spoken)

| Condition | Speak |
|---|---|
| Benson unreachable / Mappy offline | “Benson isn’t reachable right now. Try again in a minute.” |
| API timeout | “That’s taking too long. Try again, or check Benson on the dashboard.” |
| No events on requested day | “I don’t have anything on the calendar for Saturday yet.” |
| Empty Weekend List | Use existing `emptyMessage`, spoken-short: “Nothing is on the weekend list yet.” |
| Ambiguous date | “Which day do you mean?” |
| Analytics stale / missing | “I don’t have fresh TikTok numbers yet.” |
| Unauthorized Alexa user | “I can only talk to this household’s Benson.” |
| Malformed Alexa request | “I didn’t catch that. Ask me what’s happening this weekend, or what’s on the weekend list.” |

No stack traces, hostnames, HTTP codes, or tunnel language aloud.

---

## 12. Observability

Reuse `x-benson-request-id` (`services/api/src/server.ts`) and Hono access logs.

**Log**

- Alexa `requestId`
- Intent name
- Normalized slots (date → YYYY-MM-DD, platform)
- Benson operation
- Latency (Lambda hop + Benson hop)
- Success / failure + HTTP status
- Spoken item count

**Do not log**

- Full voice transcripts by default
- Auth tokens / Access service tokens
- Email bodies
- Secrets
- Raw Ask Benson evidence (Ask Benson is not on this path)

---

## 13. Manual Amazon / AWS setup checklist

Cursor cannot perform account-side steps. Elliott will eventually:

### Amazon Developer Console / Alexa Skills Kit

- [ ] Amazon developer account (same Household as the Echos if possible)
- [ ] Create unpublished **Custom Skill**, locale English (US)
- [ ] Invocation name: try `benson`; fallback `benson studio`
- [ ] Interaction model: intents in §5; `AMAZON.DATE` for calendar
- [ ] Endpoint: Lambda ARN (not a raw Benson URL)
- [ ] Copy skill ID into the Lambda ASK trigger
- [ ] Test in Alexa Simulator
- [ ] Enable skill on household Echo devices
- [ ] Stage 1: **no** account linking

### AWS (if Lambda is used)

- [ ] One Node.js Lambda (ASK SDK)
- [ ] ASK trigger with skill ID verification (`alexa-appkit.amazon.com`)
- [ ] Secrets: Benson bearer, optional CF Access client id/secret
- [ ] Timeout 6s; memory 256–512 MB is enough
- [ ] No VPC required if the tunnel hostname is public-but-gated
- [ ] CloudWatch logs with the telemetry fields in §12

### Cloudflare (Mappy stays private)

- [ ] New hostname `alexa.kckellie.com` CNAME to existing `mmm-assistant` tunnel
- [ ] Ingress: only `/api/benson-voice/*` → `http://localhost:4000`
- [ ] Access application + **service token** for Lambda (do not use human OTP)
- [ ] Confirm `api.kckellie.com` policy is unchanged (no Alexa added there)

### Do not do in V1

- [ ] Publish / certify the skill
- [ ] Proactive Events
- [ ] Benson OAuth provider
- [ ] Mutating intents

---

## 14. Implementation phases

| Phase | Work | Test separately |
|---|---|---|
| **0** Prerequisites | Amazon + AWS + Cloudflare accounts; confirm which Amazon account owns the Echos | Account access only |
| **1** Benson voice-read | New `/api/benson-voice` + formatter; ops `weekend_calendar` + `weekend_list`; projection-free; auth; no Ask Benson | curl from LAN with secret |
| **2** Lambda + skill | ASK adapter for those two intents; session “more” | Simulator |
| **3** Household smoke | Echo: weekend calendar, then weekend list | Device |
| **4** More read intents | today_brief, day_calendar, discoveries, analytics, watchlist_summary | One intent at a time |
| **5** Optional account linking | Only if a non-household Amazon account needs access | Alexa app link flow |
| **6** Optional confirmed actions | Add to Weekend List / dismiss with “Are you sure?” | Never freeform Ask Benson mutations |
| **7** Optional notifications | Alexa Proactive Events, rare high-value only | Do not clone Telegram volume |

---

## 15. First-build acceptance test

### A. “Alexa, ask Benson what’s happening this weekend.”

| Expect | Fail if |
|---|---|
| Skill invokes; Lambda receives request | Invocation missed / wrong skill |
| Authenticated request hits **voice-read**, not `api.kckellie.com` full API | Request appears on general API logs without voice-read |
| Benson reads existing Calendar rows for Fri–Sun | `ensureCalendarInventoryProjections` runs; scrape/research starts |
| Concise top events spoken (1–3) | Long monologue / URLs / IDs |
| Mappy remains private; no new open ports | Origin IP published; full API used |
| Timeout copy if Benson is down | Stack traces / “connection refused” spoken |
| No Benson state mutated | New content_items, calendar upserts, or chat rows |

### B. Then: “Alexa, ask Benson what’s on the weekend list.”

Reads `loadWeekendList` / `flyerBrief`. Speaks selected picks or the empty copy. No membership writes.

Only after A and B pass, add more intents.

---

## 16. Future voice actions (Phase 6)

Not in V1:

- “Dismiss that”
- “Add it to the weekend list”
- “Mark interested”
- “Sleep estate sales”
- “Select Panda Fest”

Require **explicit confirmation** for consequential or ambiguous changes:

> “Add Panda Fest to the Weekend List?”  
> “Yes.”

Do not grant Alexa arbitrary Ask Benson mutation authority.

---

## 17. Future proactive notifications (Phase 7)

Amazon Proactive Events can notify a custom skill. **Do not implement in V1.**

Possible later triggers (rare): high-value sponsor opportunity, major creator milestone, urgent Weekend List conflict.

**Do not** recreate Telegram spam on Alexa. Cap (example): 1/day default, 2/day hard, operator mute.

---

## 18. Exact files / functions likely involved

### Future new (not created in this planning pass)

- `services/api/src/routes/benson-voice.ts` — allowlisted HTTP
- `services/core/src/benson-voice-read/` — ops + spoken formatter
- Lambda repo or `services/alexa/` adapter (out of process is fine)
- Cloudflare ingress line for `alexa.kckellie.com`

### Reuse (read only)

| Need | Function | File |
|---|---|---|
| Calendar rows | query `creator_calendar_items` (not `listCalendarItems` as-is) | `services/core/src/creator-calendar/items.ts` |
| Weekend List | `loadWeekendList`, `flyerBrief`, `fullList` | `services/core/src/creator-calendar/weekend-list.ts` |
| Pulse | `getLatestProgressBrief` | `services/core/src/benson-pulse/index.ts` |
| Overnight | `getLatestDiscovery` | `services/core/src/benson-discovery/index.ts` |
| Discoveries | `listOpenDiscoveries` | `services/core/src/creator-interest/actions.ts` |
| Analytics | `computeAnalyticsHub`, `computePlatformDashboard` | `services/core/src/creator-analytics/dashboard.ts` |
| Watchlist | `listWatchlist` / leads **without** session sync | `services/core/src/benson-scout/watchlist.ts` |
| Request IDs | `x-benson-request-id` | `services/api/src/server.ts` |
| Shared-secret pattern | `isControlTowerAuthorized` (pattern only) | `services/api/src/lib/admin-auth.ts` |
| Tunnel | ingress YAML | `deploy/cloudflared.config.yml.working-benson` |

### Do not change for Alexa V1

Ask Benson classification, Calendar projection, Discover scoring, newsletter extraction, existing Cloudflare Access on the dashboard, Benson auth model.

---

## 19. Open questions / blockers

1. Which Amazon account owns the household Echo devices (Elliott vs Kellie vs Household)?
2. Does a development skill in this locale accept one-word `benson`, or start with `benson studio`?
3. Confirm live Access policy on `api.kckellie.com` before any hostname work (docs: Access off for OAuth).
4. Instagram has no dedicated analytics GET — speak hub fields or defer.
5. Watchlist list GET currently syncs Instagram session — voice wrapper must skip it.
6. Home is too slow; today-brief must stay a composed cheap read.

---

## 20. Estimated implementation complexity

| Phase | Estimate | Notes |
|---|---|---|
| 0 Prerequisites | 0.5 day | Manual accounts |
| 1 Voice-read API | 2–3 days | Two ops + auth + formatter + tests |
| 2 Lambda + skill model | 1–2 days | Simulator |
| 3 Household smoke | 0.5 day | Device |
| 4 Additional read intents | 2–3 days | One at a time |
| 5 Account linking | 3–5 days | New OAuth provider |
| 6 Confirmed mutations | 2–3 days | After V1 is boringly reliable |
| 7 Proactive Events | 2–4 days | Strict caps |

---

## References (official Alexa)

- Custom skill hosting (Lambda or HTTPS): https://developer.amazon.com/en-US/docs/alexa/custom-skills/host-a-custom-skill-as-an-aws-lambda-function.html
- Request verification / skill ID: https://developer.amazon.com/en-US/docs/alexa/custom-skills/handle-requests-sent-by-alexa.html
- Invocation name rules: https://developer.amazon.com/en-US/docs/alexa/custom-skills/choose-the-invocation-name-for-a-custom-skill.html
- Account linking authorization-code grant: https://developer.amazon.com/en-US/docs/alexa/account-linking/configure-authorization-code-grant.html

BENSON ALEXA INTEGRATION PLAN COMPLETE
NO PRODUCT CHANGES MADE
