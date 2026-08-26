# Benson Alexa — weekend result continuation

**Date:** 2026-08-18  
**Scope:** Keep weekend calendar/list sessions open when more than 3 items remain, and add `MoreResultsIntent` to page locally.  
**Not done:** AWS upload, Alexa console edits, Cloudflare, invocation name, allowlist, auth headers.

---

## Files changed

| Path | Change |
|---|---|
| `services/alexa/src/continuation.ts` | **New.** Page size 3, session state, first/next/final speech |
| `services/alexa/src/continuation.test.ts` | **New.** Paging, list, no-state, unauthorized, APL/non-APL |
| `services/alexa/src/handlers.ts` | Open session + reprompt when more remain; `MoreResultsIntent` |
| `services/alexa/src/speech.ts` | `moreReprompt`, `moreWithoutContext` |
| `services/alexa/src/can-fulfill.ts` | `MoreResultsIntent` → CFIR `YES` |
| `services/alexa/src/can-fulfill.test.ts` | CFIR coverage for `MoreResultsIntent` |
| `services/alexa/src/test-helpers.ts` | Session attributes on test envelopes |
| `services/core/src/benson-voice-read/weekend-calendar.ts` | JSON `items` is the full ordered list; speech still first 3 |
| `services/core/src/benson-voice-read/weekend-list.ts` | Same: full `items`, speech still first 3 |
| `services/core/src/benson-voice-read/weekend-calendar.test.ts` | Expects all compact items in JSON, fourth title still not spoken |

Voice **routes, auth, ranking, and spoken order are unchanged**. `items` in the GET JSON is now the full compact list so Alexa can page without a second Benson call. Alexa session attributes cap stored items at 36 (`CONTINUATION_MAX_ITEMS`).

---

## Behavior

| Case | Speech | Session |
|---|---|---|
| 1–3 items | Benson `speech` unchanged | `shouldEndSession=true` |
| 4+ items, first page | Benson first-3 speech, ending replaced with **“Want to hear more?”** | open + reprompt **“Say more, or say stop.”** |
| `MoreResultsIntent`, more remain | “The next few are … Want to hear more?” | open |
| `MoreResultsIntent`, last page | “The last one/few are … That's the rest.” | close |
| `MoreResultsIntent`, no state | “Ask what's happening this weekend, or what's on the weekend list first.” | close |
| Unauthorized | existing household/setup copy | close, no item leak |

Continuation uses Alexa session attributes only:

```
bensonContinuation: { type: 'weekend_calendar' | 'weekend_list', offset, items[] }
```

Each item is `{ title, day, time, venue }` only. No auth, URLs, IDs, verification, or request IDs. Zero Benson HTTP on `MoreResultsIntent`.

APL: same document; `items` on screen are the **current spoken page** (up to 3).

---

## Tests

`pnpm --filter @social-agent/alexa test` → **41 passed** (17 adapter + 6 APL + 11 CFIR + 7 continuation).  
`pnpm --filter @social-agent/alexa typecheck` → pass.  
Voice-read tests → **28 passed**.

---

## Artifact (not deployed)

```
pnpm --filter @social-agent/alexa zip
```

`services/alexa/dist/benson-alexa-voice.zip` — handler `index.handler`, Node 22.

---

## Alexa Developer Console — interaction model

After uploading the zip:

1. Skill **Benson** → **Build** → **Interaction Model** → **Intents** → **Add Intent**.
2. Name: **`MoreResultsIntent`** (no slots).
3. Sample utterances (exactly, no invocation name / “Alexa” / “ask”):

   - more
   - tell me more
   - keep going
   - what else
   - next
   - next three
   - give me more
   - what are the others
   - give me the rest

4. **Save** → **Build Model**.
5. Confirm existing intents are unchanged: `WeekendCalendarIntent`, `WeekendListIntent`, `AMAZON.HelpIntent`, `AMAZON.StopIntent`, `AMAZON.CancelIntent`.
6. **Build** → **Interfaces**: keep **CanFulfillIntentRequest** ON (new intent must be answered; Lambda returns `YES` for `MoreResultsIntent`).

Do **not** change the invocation name (`benson studio`).
