# Benson Alexa Phase 1 — local voice-read API

**Date:** 2026-08-16  
**Machine:** Mappy (local Benson).  
**Scope:** Phase 1 only — tiny read-only voice service, LAN/curl only.  
**Not in this phase:** AWS, Alexa skill, Cloudflare Tunnel, public hostname, `api.kckellie.com`, account linking, voice mutations, proactive notifications, Ask Benson, research/scrape, Calendar projection, Calendar/Weekend List semantic changes.

---

## Files changed

| File | Why |
|---|---|
| `services/core/src/benson-voice-read/types.ts` | Operation allowlist + compact payload types |
| `services/core/src/benson-voice-read/auth.ts` | Dedicated bearer auth (`BENSON_VOICE_API_KEY`) |
| `services/core/src/benson-voice-read/formatter.ts` | Deterministic spoken formatter |
| `services/core/src/benson-voice-read/weekend-calendar.ts` | Projection-free durable Calendar read |
| `services/core/src/benson-voice-read/weekend-list.ts` | Weekend List voice wrapper |
| `services/core/src/benson-voice-read/index.ts` | Package export |
| `services/core/src/benson-voice-read/*.test.ts` | Auth, allowlist, calendar, list, formatter tests |
| `services/api/src/routes/benson-voice.ts` | Explicit GET routes only |
| `services/api/src/server.ts` | Register `/api/benson-voice` |
| `services/core/src/env.ts` | Optional `BENSON_VOICE_API_KEY` |
| `services/core/package.json` | `./benson-voice-read` export + test glob |
| `.env.example` | Documented voice key (commented) |

Local `.env` received a generated `BENSON_VOICE_API_KEY` (gitignored). Not committed. Not the Control Tower key.

Existing Voicebox module `services/core/src/benson-voice/` was not modified.

---

## Route contract

```
GET /api/benson-voice/weekend-calendar
GET /api/benson-voice/weekend-list
```

No `POST /api/benson-voice/query`. Unknown paths return 404. Alexa/Lambda will map intents to these operations later.

Success body:

```json
{
  "ok": true,
  "requestId": "voice-smoke-cal-2026-08-16",
  "operation": "weekend_calendar",
  "count": 128,
  "ready": true,
  "items": [
    {
      "title": "One-on-One DNA & Genetic Genealogy Help - In Person or on Zoom",
      "day": "Friday",
      "time": "9:00 AM",
      "venue": "Central Resource Library",
      "verification": "unverified"
    }
  ],
  "speech": "Benson found 128 things this weekend. The strongest are …"
}
```

`items` is the spoken top 1–3. `count` is the full displayable weekend total. No IDs, URLs, emails, Google sync, notes, confidence, or admin fields.

---

## Auth contract

- Header: `Authorization: Bearer <BENSON_VOICE_API_KEY>`
- Optional: `x-benson-request-id` (echoed on the response when present)
- Missing / wrong / malformed / unset key → `401 VOICE_UNAUTHORIZED`
- Control Tower key is not accepted
- Secret is never logged

---

## Exact reused Benson loaders

| Operation | Reused | Not used |
|---|---|---|
| `weekend_calendar` | Direct `creator_calendar_items` select; `mapCalendarItemView`; `calendarSuggestionIsDisplayable`; `dedupeActiveCalendarViews`; `listActiveCalendarCategorySnoozes` / `shouldHideUnselectedSuggestionForSnooze`; `loadByBoard('Weekend')` for selection overlay; `getChicagoWeekendDayKeys` / `eventFallsInChicagoWeekend`; `startOfLocalDayKey` / `endOfLocalDayKey` | `listCalendarItems()`, `ensureCalendarInventoryProjections()`, Ask Benson, scrape, research, LLM |
| `weekend_list` | `loadWeekendList()` — authority remains `planner_items.listName = 'Weekend'` | `setWeekendListMembership`, flyer URL text as speech |

Privacy filter on calendar: `itemType = public_event` only. Google sync map is not loaded.

Order authority: existing Calendar `startAt` ascending. Speech still uses the specified “The strongest are …” phrase for the first 1–3. No new LLM ranker.

---

## Proof Calendar projection was not invoked

1. `weekend-calendar.ts` does not call `listCalendarItems(` or reference `ensureCalendarInventoryProjections`.
2. Unit tests inject a row loader; no projection dependency exists.
3. Live smoke API log scan after both authenticated calls: **no** `inventory projection`, `ensureCalendar`, `listCalendarItems`, `ask-benson`, `scrape`, `web-research`, or `openai` lines.
4. Durable Calendar rows unchanged: `creator_calendar_items` count `650`, `max(updated_at)` `2026-08-15 20:21:05.991+00` before and after.
5. Weekend planner unchanged: `planner_items` list `Weekend` count `3`, `max(updated_at)` `2026-08-13 16:29:44.278+00` before and after.

`worker_job_runs` count ticked `315059 → 315061` during the same window. Latest rows were independent **scheduled** workers (`share-intake-media`, `unposted-draft-intelligence`, `gmail-discovery-sync`, `outreach-dispatch`) — not Calendar projection, research, or scrape.

---

## Sample spoken output (live, 2026-08-16, America/Chicago Fri Aug 14–Sun Aug 16)

**weekend_calendar**

> Benson found 128 things this weekend. The strongest are One-on-One DNA & Genetic Genealogy Help - In Person or on Zoom at Central Resource Library, Bookmobile at Transition Center at Bookmobile, and Meet & Greet w/ DC4KC at Equal Minded Cafe. Ask for more if you want the rest.

**weekend_list**

> There are 3 items on the weekend list. They are 816 Day | Kansas City at Kansas City Power & Light District, Hike with a Naturalist at Lakeside Nature Center, and KC's Friday Night Cap - Sherri's After Dark With Nneoma Lanea & The Sound Four at Sherri's Executive Lounge.

Empty copies (unit-tested):

- Calendar: `Benson doesn't have this weekend's calendar ready yet.`
- Weekend List: `Nothing is on the weekend list yet.`

---

## Latency (live curl on Mappy, localhost:4000)

| Operation | curl `time_total` | logged `latencyMs` |
|---|---|---|
| `weekend_calendar` | 0.540 s | 531 ms |
| `weekend_list` | 0.044 s | 41 ms |

Both under the 1.5 s target and the ~2 s hard budget. The route does not wait on projection, refresh, or research.

---

## Tests

`pnpm exec tsx --test src/benson-voice-read/*.test.ts` — **27 passed**.

- Auth: missing, wrong, valid, unset, Control Tower key rejected, malformed bearer
- Allowlist: only `weekend_calendar` / `weekend_list`; API source has no `POST` / `/query`
- Weekend calendar: durable rows via injected loader; no projection call; top 1–3 spoken; empty copy; no write imports
- Weekend list: existing planner state spoken; empty copy; no membership writes
- Formatter: strips URLs, UUIDs, markdown, confidence %; natural Chicago times; length cap

Live curl:

1. Unauthenticated → **401**
2. Wrong key → **401**
3. Authenticated weekend-calendar → **200**
4. Authenticated weekend-list → **200**
5. `GET /api/benson-voice/query` → **404**

---

## Health / fingerprints

API restarted locally so the new route is live. `pnpm benson:deploy-local` was attempted; it stopped on **pre-existing** date-sensitive `weekend-things-to-do` tests (not this change). API was restarted with the normal Benson start path; dashboard and workers were already healthy and left running.

| Check | Result |
|---|---|
| API `GET /health` | `ok: true` |
| Dashboard `GET /` | `200` |
| Workers | running (`benson-workers.pid`) |
| Fingerprints | **MATCH** `5456bdbca325e680` |

Checked at `2026-08-16T12:03:01.286Z`.

---

## Remaining manual Phase 2 prerequisites

From `docs/reports/benson-alexa-integration-plan-2026-08-16.md` — not done here:

- Create unpublished Alexa Custom Skill + invocation name
- AWS Lambda (ASK SDK) that maps intents to these two GETs
- New path-restricted Cloudflare Tunnel hostname (do **not** point Alexa at `api.kckellie.com`)
- Cloudflare Access service-token handling in front of this route
- Account linking (if required later)
- Additional read operations (today/overnight, day calendar, discoveries, analytics)
- No mutations, notifications, or Ask Benson on the voice path

---

BENSON VOICE READ PHASE 1 VERIFIED  
NO ALEXA OR CLOUD CHANGES MADE  
STOP.
