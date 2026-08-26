# Benson Alexa — WhatShouldKelliePostIntent (first expansion slice)

**Date:** 2026-08-23 (implemented 2026-08-24 CT)  
**Scope:** “Alexa, ask Benson what Kellie should post today.”  
**Not done in this task:** AWS Lambda upload, Alexa Developer Console model edits, Cloudflare/tunnel/DNS changes, Ask Benson passthrough, Why/home-filmable/Johnson County follow-ups.

---

## 1. CURRENT checkout findings (before edits)

Inspected on this machine before changing code.

### Alexa package (`services/alexa/`) — already present

| Feature | Status |
|---|---|
| `services/alexa/src/continuation.ts` | **Exists** — session attr `bensonContinuation`, page size 3 |
| `MoreResultsIntent` | **Exists** — pages weekend calendar/list without second Benson HTTP |
| `SessionEndedRequest` handling | **Exists** — safe empty response + redacted logging |
| APL / `services/alexa/src/apl.ts` | **Exists** — shared list document for weekend calendar/list |
| SSML escaping / speech path | **Exists** — `speech.ts` `escapeSsmlText` |
| CanFulfillIntent | **Exists** — YES for WeekendCalendar, WeekendList, MoreResults |

Hardcoded intent → path map (pre-change):

- `WeekendCalendarIntent` → `GET /api/benson-voice/weekend-calendar`
- `WeekendListIntent` → `GET /api/benson-voice/weekend-list`

Auth path already: household allowlist → Bearer `BENSON_VOICE_API_KEY` + CF Access client id/secret + `x-benson-request-id` → `https://alexa.kckellie.com/...` (2.5s timeout).

**Verdict vs known working architecture:** no material mismatch. Continuation / APL / SessionEnded / SSML / CanFulfill already exist. Slice extends them; does not recreate them.

### Voice API / core

| Path | Pre-change |
|---|---|
| `services/api/src/routes/benson-voice.ts` | Weekend calendar + weekend list GETs only; shared bearer middleware |
| `services/core/src/benson-voice-read/` | Weekend loaders + formatter + auth; ops `weekend_calendar` \| `weekend_list` |

### Authoritative content ranking (selected)

| Question | Operator authority |
|---|---|
| “What should Kellie post today?” | `computeCommandCenter(...).sections.postToday` in `services/core/src/inventory/command-center.ts` |

Supporting gates (already used by that section):

- Film This / filmable: `qualifiesFilmThis` (`pre-alpha/home-showroom-lanes.ts`)
- Today eligibility / lanes: `today-clarity.ts` (`passesTodayEligibility`, `film_this` lane)
- Freshness: `isAudienceFreshContent` + lifecycle soft gate
- Home eligibility before ranking: `isHomeEligible`
- Ranking score: `scorePostToday` (audience, freshness, today boosts) — **not reinvented for voice**

**Why this source:** Command Center section metadata literally asks *“What should Kellie post today?”* and is the operator-facing Today content stack. Home Best Move / full `/api/pre-alpha/home` is heavier and returns a single card — **not** used for this voice read.

**Home/Showroom:** inspected only for reusable selectors (`qualifiesFilmThis`, lane labels). Voice does **not** call Home.

---

## 2. Files changed

### Benson core / API

| Path | Change |
|---|---|
| `services/core/src/benson-voice-read/types.ts` | Added `what_should_kellie_post` op + response types |
| `services/core/src/benson-voice-read/what-should-kellie-post.ts` | **New** loader/shaper/speech |
| `services/core/src/benson-voice-read/what-should-kellie-post.test.ts` | **New** focused coverage |
| `services/core/src/benson-voice-read/index.ts` | Exports |
| `services/core/src/benson-voice-read/operations.test.ts` | Allowlist expects third op |
| `services/api/src/routes/benson-voice.ts` | `GET /what-should-kellie-post` |

### Alexa Lambda adapter

| Path | Change |
|---|---|
| `services/alexa/src/benson-client.ts` | Intent → GET map + item parse (`reason`/`when`/`area`) |
| `services/alexa/src/continuation.ts` | `post_recommendations` kind; MoreResults speaks remaining |
| `services/alexa/src/handlers.ts` | Map op → continuation kind; APL screen |
| `services/alexa/src/apl.ts` | `postRecommendationsScreen` (same list document) |
| `services/alexa/src/can-fulfill.ts` | `WhatShouldKelliePostIntent` YES |
| `services/alexa/src/logging.ts` | Operation union extended |
| `services/alexa/src/adapter.test.ts` | Intent routing + auth headers + unauthorized |
| `services/alexa/src/continuation.test.ts` | Post MoreResults + APL |
| `services/alexa/src/can-fulfill.test.ts` | CFIR YES for new intent |

**Unchanged by design:** Cloudflare Access, tunnel/DNS, `BENSON_VOICE_API_KEY` semantics, household allowlist, Lambda endpoint URL, invocation name, weekend routes/behavior.

---

## 3. Voice endpoint contract

```
GET /api/benson-voice/what-should-kellie-post
Authorization: Bearer <BENSON_VOICE_API_KEY>
x-benson-request-id: <alexa-request-id>
(+ CF-Access-Client-Id / CF-Access-Client-Secret when configured)
```

Success shape (adapted to existing voice-read conventions):

```json
{
  "ok": true,
  "requestId": "...",
  "operation": "what_should_kellie_post",
  "count": 0-3,
  "items": [
    {
      "contentItemId": "...",
      "title": "...",
      "reason": "...",
      "when": "...|null",
      "area": "...|null",
      "homeFilmable": true,
      "day": "<reason for APL>",
      "time": "<when>",
      "venue": "<area>"
    }
  ],
  "speech": "Kellie's strongest post today is …. …. I have two more if you want them."
}
```

- Ranking: `computeCommandCenter` → `sections.postToday` (max 3 for voice).
- Narrow **voice-only** content gate (not a second score): drops explicit non-content housekeeping phrases (`send a sponsor pitch`, `reply to … email`, `verify/confirm date`) if they leak into `postToday`.
- No LLM / web search / scrape / research / calendar projection / Gmail / Instagram sync.
- Spoken text strips URLs, UUIDs, confidence/score jargon (shared formatter helpers).

---

## 4. Session context / MoreResults / APL

### Session attributes

```
bensonContinuation: {
  type: 'post_recommendations',
  offset: 1,
  items: [{ title, day, time, venue, reason? }, ...]  // ≤3 typically; cap 36
}
```

No secrets, URLs, auth, content UUIDs, or evidence dumps in session state.

### MoreResults

| Flow | Behavior |
|---|---|
| Initial `WhatShouldKelliePostIntent` | Benson speech (strongest + “I have two more…”) |
| `MoreResultsIntent` | Speaks remaining 1–2 locally; ends session |
| Weekend calendar/list continuation | **Unchanged** (still pages of 3 with “Want to hear more?”) |

### APL

Reused existing list APL document via `postRecommendationsScreen` (“What Kellie Should Post”). Voice-only devices unchanged. No Echo Show dashboard redesign.

---

## 5. Latency

| Measurement (local Mappy durable state, read-only) | Value |
|---|---|
| End-to-end `loadWhatShouldKelliePostVoice()` | **~6.2 s** first call |
| `loadIngestedInventoryItems()` alone | **~2.6 s** (525 rows) |
| `computeCommandCenter` alone | **~2.0 s** |
| Shape with already-loaded items | **~1.6 s** |

**Note:** Target ≤1.5 s core read is **not met** on current inventory load path. Smallest reusable authority is still `loadIngestedInventoryItems` + `computeCommandCenter.postToday` (not full Home). Faster projection is a follow-up, not part of this slice. Lambda→Benson **2.5 s budget unchanged** in adapter config — production may timeout on cold/heavy inventory until load is optimized.

---

## 6. Tests

| Suite | Result |
|---|---|
| `services/core` `src/benson-voice-read/*.test.ts` | **36 passed / 0 failed** |
| `services/alexa` `pnpm test` | **52 passed / 0 failed** |
| `services/alexa` `pnpm typecheck` | **pass** |

Coverage mapped to requested checks:

1. Strongest filmable/content from `postToday` — pass  
2. Excludes sponsor/email housekeeping — pass (voice content gate)  
3. Excludes stale/expired — pass  
4. Excludes ordinary concert clutter — pass  
5. Max 3 — pass  
6. Deterministic speech — pass  
7. No LLM/web/scrape paths in source — pass  
8. Voice bearer required — existing shared auth middleware + auth tests  
9–20. Weekend intents / MoreResults / SessionEnded / APL / unauthorized — pass  

---

## 7. Read-only current top-3 proof (Mappy durable state)

**Called:** `loadWhatShouldKelliePostVoice()` against live Postgres (`localhost:5433` / `social_agent`) with repo `.env`.  
**Mutations:** none.

| Field | Result |
|---|---|
| Execution time | ~6236 ms |
| Authoritative lane | `command_center.sections.postToday` |
| Count | **0** |
| Top 3 | *(none)* |
| Speech | “I don't have a strong content post for Kellie right now.” |

### Why empty (current durable inventory)

- Inventory loaded: **525** rows  
- `qualifiesFilmThis`: 72  
- `isEligibleThingsToDoToday`: 178  
- `passesTodayEligibility`: **0** (universal fail reason: `no_specific_today_reason`)  
- Therefore `postToday` ranking set is empty — voice correctly returns empty speech  
- No #1/#2/#3 ranking comparison available until inventory has Today-eligible content with specific reasons  

**Confirmation:** no LLM/web/search/scrape/research; no durable writes.

---

## 8. Architecture confirmations

| Item | Status |
|---|---|
| WeekendCalendarIntent unchanged | Yes |
| WeekendListIntent unchanged | Yes |
| Cloudflare / Access / tunnel / bearer semantics | Unchanged |
| Household allowlist | Unchanged |
| Lambda endpoint / invocation name | Unchanged (not redeployed here) |
| No freeform Ask Benson / POST `/query` | Confirmed |

---

## 9. Manual Elliott steps (after code approval)

### A. Alexa Developer Console

Skill **Benson** → **Build** → **Interaction Model** → **Intents** → **Add Intent**

1. Intent name: **`WhatShouldKelliePostIntent`** (no slots).
2. Sample utterances (no “Alexa” / invocation prefix):

   - what should Kellie post
   - what should Kellie post today
   - what should she post today
   - what should Kellie post for content today
   - what can Kellie film today
   - what should Kellie film today
   - give me Kellie's post for today
   - what is Kellie's best post today

3. **Save Model** → **Build Model**.
4. Keep existing `MoreResultsIntent` utterances (`more`, `what else`, `what are the others`, `what are the other two`, etc.) — already sufficient for this slice.

Do **not** recreate the skill, endpoint, or invocation name (`benson studio`).

### B. AWS Lambda

```bash
pnpm --filter @social-agent/alexa zip
```

Artifact: `services/alexa/dist/benson-alexa-voice.zip` (built locally in this task; ~31 KB).

1. Upload/update existing function **`benson-alexa-voice`** (region **us-east-1**).
2. Keep runtime **Node.js 22.x**.
3. Keep handler **`index.handler`**.
4. **No environment-secret changes expected** (same voice bearer, CF Access, allowlist).
5. Deploy Benson/Mappy API with the new `GET /api/benson-voice/what-should-kellie-post` route (same process as other API deploys) before relying on the intent in production.

Do **not** recreate Lambda, Cloudflare Access, tunnel, or bearer token.

### C. Smoke after deploy

1. Simulator / Echo: “Alexa, ask Benson what Kellie should post today.”
2. If two+ recommendations: “what else” / “more”.
3. Confirm weekend calendar/list still work.

---

## 10. Next recommended follow-up intent (DO NOT implement here)

**`WhyDidYouPickThatIntent`** — explain the current session’s #1 using compact session reason/when/area (no new ranking system).

Alternate candidates (also later): home-filmable filter; Johnson County geography filter.

---

## 11. Out of scope / unrelated findings

- **Latency:** full ingested inventory load + Command Center is heavier than weekend targeted reads; optimize separately if voice timeouts appear in prod.
- **Durable `postToday` emptiness:** current inventory largely fails `hasSpecificTodayReason` / `passesTodayEligibility` — content-quality/operator Today pipeline issue, not Alexa wiring.
- **Sponsor-pitch leak into Command Center `postToday`:** some hotel/sponsor-worded follow-ups can still rank into `postToday` under core eligibility; voice applies a narrow housekeeping phrase gate. Fixing Command Center eligibility itself is out of scope for this slice.
- Eventbrite discovery, Ask Benson image attachment, calendar temporal repairs, and other parallel workstreams — untouched.

---

## 12. Artifact (not deployed to AWS)

```
pnpm --filter @social-agent/alexa zip
```

→ `services/alexa/dist/benson-alexa-voice.zip`  
Handler `index.handler`, target Node 22. **Not uploaded in this task.**
