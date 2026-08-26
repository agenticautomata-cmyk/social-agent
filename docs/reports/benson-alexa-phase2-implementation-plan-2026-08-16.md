# Benson Alexa Phase 2 — implementation plan

**Date:** 2026-08-16  
**Status:** Planning only. No product code, AWS resources, Alexa skill, Cloudflare Tunnel, DNS, or Access changes were made.  
**Machine:** Mappy (local Benson).  
**Depends on:** Phase 1 voice-read API (verified). Wording fix: calendar speech says “The first few are…” (chronological `startAt` order).  
**Principle:** Alexa is a presentation adapter. Benson remains authority. Lambda must not rank, query databases, call Ask Benson, scrape, research, or mutate.

---

## 1. Executive recommendation

**GO to build Phase 2** as an unpublished household development skill.

```
Household Echo
  → Alexa Custom Skill (en-US, Development, unpublished)
  → AWS Lambda (us-east-1, ASK SDK, skill-ID trigger)
  → https://alexa.kckellie.com/api/benson-voice/{weekend-calendar|weekend-list}
       Cloudflare Access Service Auth
       + Authorization: Bearer <BENSON_VOICE_API_KEY>
  → existing Mappy GET routes on localhost:4000
```

Do **not** point Alexa at `https://api.kckellie.com`. That hostname already tunnels the **entire** Hono API with no in-app login and Access off (OAuth callbacks).

Do **not** add intents beyond weekend calendar and weekend list.

Do **not** add account linking, mutations, or notifications.

**Benson API change required for Lambda compatibility:** none, if Lambda uses GET + Bearer + `x-benson-request-id`.

---

## 2. Verified Phase 1 contract

Inspected in-repo on 2026-08-16. Live LAN smoke already succeeded.

### Files

| Role | Path |
|---|---|
| HTTP routes | `services/api/src/routes/benson-voice.ts` |
| Registration | `services/api/src/server.ts` line 211: `app.route('/api/benson-voice', bensonVoiceRoute)` **inside** `if (featureFlags.enableOpportunitiesApi)` |
| Core module | `services/core/src/benson-voice-read/` |
| Auth | `services/core/src/benson-voice-read/auth.ts` |
| Env | `BENSON_VOICE_API_KEY` in `services/core/src/env.ts` (optional string). Documented in `.env.example`. Live value is in gitignored `.env` only. |
| Voicebox TTS | `services/core/src/benson-voice/` — **unrelated**. Do not reuse. |

### Exact routes

```
GET /api/benson-voice/weekend-calendar
GET /api/benson-voice/weekend-list
```

No `POST /query`. Unknown paths → Hono 404.

### Auth behavior

- Header: `Authorization: Bearer <BENSON_VOICE_API_KEY>`
- Timing-safe compare. Missing / wrong / malformed / unset key → `401` `{ ok: false, error: { code: "VOICE_UNAUTHORIZED", message: "Benson voice requires a valid bearer token.", requestId } }`
- Control Tower key (`BENSON_CONTROL_TOWER_KEY` / `x-benson-admin-key`) is **not** accepted
- Secret is never logged

### Request-id behavior

- Optional request header: `x-benson-request-id`
- Echoed on the response when present
- JSON `requestId` is set **only if that header is present**. Server middleware also generates a UUID into Hono context, but the voice route reads the **header only**.
- **Lambda must always send** `x-benson-request-id: <Alexa request.requestId>` so CloudWatch and Benson logs correlate.

### Success schema

Calendar:

```json
{
  "ok": true,
  "requestId": "<header or omitted>",
  "operation": "weekend_calendar",
  "count": 128,
  "ready": true,
  "items": [
    {
      "title": "…",
      "day": "Friday",
      "time": "9:00 AM",
      "venue": "…",
      "verification": "unverified"
    }
  ],
  "speech": "Benson found 128 things this weekend. The first few are …"
}
```

Weekend List: same envelope without `ready`; `operation` is `weekend_list`.

`items` is the spoken top 1–3. `count` is the full displayable total. Lambda must speak `speech` and ignore `items` for TTS.

Empty speech (already supplied by Benson):

- Calendar: `Benson doesn't have this weekend's calendar ready yet.`
- Weekend List: `Nothing is on the weekend list yet.`

### Latency expectations

| Call | Measured (localhost:4000) |
|---|---|
| `weekend-calendar` | 0.32–1.22 s curl; logged ~531 ms warm |
| `weekend-list` | ~0.044 s; logged ~41 ms |

Target remains under 1.5 s on Mappy. Hard internal budget ~2 s. No projection, scrape, research, or Ask Benson on this path.

### Compatibility issues that MUST be solved before Phase 2 go-live

Do **not** fix these in this planning document. They are operational / later-build constraints:

1. Voice routes are unregistered if `ENABLE_OPPORTUNITIES_API` is false (schema default is false; Mappy is currently true). Confirm it stays on.
2. A hostname-only tunnel rule (the `api.kckellie.com` pattern) would expose the **full** Hono API on `alexa.kckellie.com`. Path restriction is mandatory.
3. `kckellie.com` DNS lives in a **different Cloudflare account** than tunnel `mmm-assistant` (`6f1688b3-ae2c-48ab-abfa-20394eae5ba1`). CNAME must be created in the kckellie.com zone. See `CLOUDFLARE_TUNNEL_RECOVERY.md`.
4. Cloudflare Access policy must be **Service Auth**, not email Allow. Otherwise Lambda receives an HTML login page.
5. Lambda must send `x-benson-request-id` or Benson’s JSON `requestId` is undefined.

**No Benson voice-read schema or auth change is required for Lambda.**

---

## 3. Skill model

**Type:** Custom Skill  
**Locale:** en-US only  
**Stage:** Development / unpublished  
**Endpoint:** AWS Lambda ARN (NA)

### Invocation name

| Order | Invocation | Spoken example | Notes |
|---|---|---|---|
| **Try first** | `benson` | “Alexa, ask Benson what’s happening this weekend.” | Official certification rule: one-word names are not allowed unless unique brand/IP with proof. Development console may still accept or reject at save. |
| **Fallback** | `benson studio` | “Alexa, ask Benson Studio what’s on the weekend list.” | Use immediately if the console rejects `benson`. |

Do not include wake words, “skill”, or “app” in the invocation name.  
Source: [Choose the Invocation Name for a Custom Skill](https://developer.amazon.com/en-US/docs/alexa/custom-skills/choose-the-invocation-name-for-a-custom-skill.html).

### Interaction model (Phase 2 only)

**WeekendCalendarIntent**

- what’s happening this weekend
- what is happening this weekend
- what’s on the calendar this weekend
- what do we have this weekend

**WeekendListIntent**

- what’s on the weekend list
- what is on the weekend list
- what did Kellie pick this weekend

**Built-ins**

- `AMAZON.HelpIntent`
- `AMAZON.StopIntent`
- `AMAZON.CancelIntent`

No `AMAZON.DATE` slots. No Analytics. No freeform Ask Benson. Sample utterances must **not** include the invocation name, “Alexa”, “ask”, or connecting words (“to”, “for”, “and”).

### Help / stop copy (Lambda static)

- Help: “You can ask what’s happening this weekend, or what’s on the weekend list.”
- Stop / Cancel: short close, no Benson call.

---

## 4. Lambda adapter design

**Later package (not created now):** e.g. `services/alexa/` — Node.js 20, `ask-sdk-core`. Out of process from Benson core.

### Responsibilities

1. Receive the Alexa request.
2. Rely on the Lambda **Alexa Skills Kit trigger** to verify the skill ID (`alexa-appkit.amazon.com` permission + skill ID restriction).
3. Enforce `BENSON_ALEXA_ALLOWED_USER_IDS` against `context.System.user.userId`.
4. Map one intent to one Benson GET.
5. Call Benson with:
   - `Authorization: Bearer <BENSON_VOICE_API_KEY>`
   - `x-benson-request-id: <request.requestId>`
   - `CF-Access-Client-Id` / `CF-Access-Client-Secret`
6. Speak Benson `speech` (plain text is enough; wrap in `<speak>` only if SSML is added later — Phase 2 should pass through plain speech).
7. On timeout / network / non-2xx: fixed short fallback. Never read HTTP codes, URLs, or IDs aloud.

### Intent map

| Alexa intent | Benson operation | URL |
|---|---|---|
| `WeekendCalendarIntent` | `weekend_calendar` | `{BASE}/api/benson-voice/weekend-calendar` |
| `WeekendListIntent` | `weekend_list` | `{BASE}/api/benson-voice/weekend-list` |
| `AMAZON.HelpIntent` | none | static copy |
| `AMAZON.StopIntent` / `CancelIntent` | none | close |
| anything else | none | “I can tell you what’s happening this weekend, or what’s on the weekend list.” |

### Lambda must NOT

- Rank events
- Query Postgres or any Benson DB
- Call Ask Benson, Calendar `listCalendarItems`, Watchlist sync, or Home
- Run LLM / scrape / research
- Mutate Weekend List, dismiss, snooze, or notify
- Re-implement spoken formatting

It is an HTTP adapter only.

---

## 5. Household user allowlist

**Choice A (recommended):** environment variable

```
BENSON_ALEXA_ALLOWED_USER_IDS=amzn1.ask.account.XXXX,amzn1.ask.account.YYYY
```

Start empty or with a placeholder. First Development Simulator request: CloudWatch log `userId` (not the transcript). Copy that value into the env var. Redeploy/update Lambda config. Then unknown users hear:

> I can only talk to this household’s Benson.

Do not log the full `userId` after allowlist is set except as `authorized: true/false`.

### How to capture `userId`

1. Alexa Developer Console → Test → Alexa Simulator.
2. Say: “ask Benson what’s on the weekend list” (or Benson Studio).
3. CloudWatch (us-east-1) → Lambda log group → first request JSON → `context.System.user.userId`.
4. Paste into `BENSON_ALEXA_ALLOWED_USER_IDS`.

Until the allowlist is non-empty, the adapter should **deny all users** (fail closed) except a one-time documented “capture mode” that logs `userId` and speaks “Benson isn’t set up for this Alexa account yet.” Prefer fail-closed after the first ID is stored.

### Amazon Household / Kellie’s account

- Unpublished skills appear for the **developer Amazon account**, not automatically for every Household profile.
- If the physical Echo is registered to **Kellie’s** Amazon account, she will not see the skill unless Elliott adds her as a **beta tester** and she enables it; then capture **her** `userId` and add it to the allowlist.
- Amazon Household sharing does **not** reliably enable development skills on another adult’s account.
- `userId` is per Amazon account that enabled the skill, not per Echo device. A new account or skill disable/re-enable can change whether the ID is recognized; if Alexa issues a new `userId`, the allowlist must be updated.

**No account linking in Phase 2.**

---

## 6. Secure Cloudflare bridge

### Current tunnel (do not change in this planning step)

File: `deploy/cloudflared.config.yml.working-benson`  
Tunnel: `mmm-assistant` / `6f1688b3-ae2c-48ab-abfa-20394eae5ba1`  
Live system copy: `/etc/cloudflared/config.yml`

Today:

```yaml
  - hostname: benson.kckellie.com
    service: http://localhost:3000
  - hostname: api.kckellie.com
    service: http://localhost:4000
  - service: http_status:404
```

The same file **already uses hostname + `path`** for `app.mentalmattersmore.org` (`path: /api/*`, etc.). Official cloudflared `path` is a **Go regular expression**. Rules evaluate top to bottom; first match wins; the last rule must be a catch-all.

**Path-based ingress is supported in the current config format.**

### Planned ingress (do not apply now)

Insert **before** the catch-all, and **do not** use a hostname-only rule for `alexa.kckellie.com`:

```yaml
  - hostname: alexa.kckellie.com
    path: ^/api/benson-voice(/.*)?$
    service: http://localhost:4000
  - hostname: alexa.kckellie.com
    service: http_status:404
```

Then keep the existing catch-all:

```yaml
  - service: http_status:404
```

Verify with:

```
cloudflared tunnel ingress rule https://alexa.kckellie.com/api/benson-voice/weekend-list
cloudflared tunnel ingress rule https://alexa.kckellie.com/api/calendar/items
cloudflared tunnel ingress rule https://alexa.kckellie.com/health
```

Expected: first URL matches `:4000`; the others match the alexa hostname 404 rule (never `:4000` for `/api/calendar`, `/api/ask-benson`, `/health`).

Do **not** modify `api.kckellie.com` or `benson.kckellie.com` rules.

### Cloudflare Access

**Yes — service tokens work cleanly for Lambda.** Official machine-to-machine headers ([Service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)):

```
CF-Access-Client-Id: <client id>
CF-Access-Client-Secret: <client secret>
Authorization: Bearer <BENSON_VOICE_API_KEY>
```

These header families do not collide. Do **not** stuff the Access token into `Authorization`; Benson already uses that for the voice key.

Create a **new** self-hosted Access application:

- Application domain: `alexa.kckellie.com` (entire hostname is fine; tunnel already 404s other paths)
- Policy action: **Service Auth**
- Include: Service Token = `benson-alexa-lambda` (name TBD)
- No email Allow policy on this hostname (browsers should not use it)

Enable Access **before** the public CNAME is live so there is no window of bearer-only public exposure.

**Why not a weaker mechanism:** Cloudflare WAF IP allowlists are a poor fit (Lambda egress IPs change). A second public hostname without Access would rely on bearer secrecy alone on a guessable name. Access + bearer + path restriction is the smallest **safe** stack.

---

## 7. Secret management

**Smallest safe choice:** Lambda environment variables. One function, household pilot. AWS encrypts env vars at rest. Skip Secrets Manager / SSM until there is more than one consumer or a rotation workflow that needs it.

| Name | Where created | Copied to | Do not |
|---|---|---|---|
| `BENSON_VOICE_BASE_URL` | Operator-chosen | Lambda env = `https://alexa.kckellie.com` | Commit |
| `BENSON_VOICE_API_KEY` | Mappy `.env` | Lambda env (same value) | Repo, chat, Alexa speech, CloudWatch |
| `CF_ACCESS_CLIENT_ID` | Zero Trust → Service token | Lambda env | Repo |
| `CF_ACCESS_CLIENT_SECRET` | Shown **once** at token create | Lambda env | Lose it (must mint a new token) |
| `BENSON_ALEXA_ALLOWED_USER_IDS` | Simulator / Echo first request | Lambda env | Treat as public |
| Skill ID | Alexa console | Lambda ASK trigger (and optional env) | — |

Mappy keeps `BENSON_VOICE_API_KEY` in `.env` only. Do not add the Access secret to Mappy.

---

## 8. Timeouts

Alexa custom-skill response ceiling is about **8 seconds**. Phase 1 Benson reads are well under that.

| Hop | Value | On miss |
|---|---|---|
| Lambda function timeout | **6 s** | Alexa default error (avoid) |
| HTTP connect to `alexa.kckellie.com` | **1.0 s** | unreachable copy |
| HTTP response (headers+body) | **2.5 s** | timeout copy |
| Benson voice-read | already &lt;1.5 s typical | — |

**Timeout speech:** “That’s taking too long. Try again, or check Benson on the dashboard.”  
**Unreachable / DNS / connection refused / CF 5xx without JSON:** “Benson isn’t reachable right now. Try again in a minute.”  
**401/403 from Access or Benson:** “Benson isn’t reachable right now. Try again in a minute.” (Do not say “unauthorized” or mention Cloudflare.)

Do not wait on Calendar projection. The voice path does not invoke it.

---

## 9. AWS region requirement

Official custom-skill hosting table ([Host a Custom Skill as an AWS Lambda Function](https://developer.amazon.com/en-US/docs/alexa/custom-skills/host-a-custom-skill-as-an-aws-lambda-function.html)):

| ASK region | Recommended AWS region | Name |
|---|---|---|
| **NA** | **us-east-1** | US East (N. Virginia) |
| EU or IN | eu-west-1 | EU (Ireland) |
| FE | us-west-2 | US West (Oregon) |

**en-US** is North America. Create the Lambda in **us-east-1**. Paste that ARN as both the **default** endpoint and the **North America** endpoint in the Alexa console.

Other allowed Lambda regions work, but they add Alexa↔Lambda latency. Phase 2 does not need EU/FE replicas.

Alexa-hosted skills are **not** recommended here: the function must call a private Cloudflare hostname with secrets; keep the adapter in Elliott’s AWS account.

---

## 10. Exact Amazon Developer Console checklist

**Service:** [developer.amazon.com/alexa/console/ask](https://developer.amazon.com/alexa/console/ask)  
**Account:** Elliott’s Alexa developer account (same Amazon account that will enable the skill on his Echo, unless Kellie is added as beta).

| Step | Page | Create / enter | Copy somewhere | Do not expose |
|---|---|---|---|---|
| 1 | Console home → Create Skill | Name: `Benson` (display). Model: **Custom**. Hosting: **Provision your own**. Locale: **en-US** | — | — |
| 2 | Invocation | Try `benson`. If save/build fails, set `benson studio` | Remember which one built | — |
| 3 | Interaction Model → Intents | Add `WeekendCalendarIntent` + 4 utterances; `WeekendListIntent` + 3 utterances; keep Help/Stop/Cancel | — | Do not add date slots |
| 4 | Build Model | Wait for success | — | — |
| 5 | Endpoint | AWS Lambda ARN (after §11). Region: NA / default = same us-east-1 ARN | Skill ID from Endpoint or Skill Information | Skill ID is not secret but don’t paste in public docs |
| 6 | Permissions | None. **Account linking OFF** | — | — |
| 7 | Test | Skill testing is enabled in **Development** | First `userId` from CloudWatch after Simulator | Transcripts |
| 8 | Distribution / Certification | **Do not submit** | — | — |

**Gotchas**

- One-word `benson` may fail invocation validation; switch to `benson studio` without redesigning intents.
- Sample utterances must not include “ask Benson”.
- Endpoint save requires a Lambda ARN that already exists and an ASK trigger that already lists this Skill ID (chicken-and-egg: create Lambda with a placeholder trigger, paste Skill ID, then paste ARN back).
- Development skill is only on this Amazon account until beta testers are added.
- Rebuild the model after every utterance change.

---

## 11. Exact AWS setup checklist

**Region:** us-east-1 (N. Virginia) — confirm the console region switcher **before** creating the function.

| Step | Page / service | Create / enter | Copy somewhere | Do not expose |
|---|---|---|---|---|
| 1 | IAM | Execution role: basic Lambda logging only (`AWSLambdaBasicExecutionRole`) | Role ARN | — |
| 2 | Lambda → Create function | Name: `benson-alexa-voice`. Runtime: **Node.js 20.x**. Arch: x86_64 | Function ARN | — |
| 3 | Configuration → General | Timeout **6 s**. Memory 256 MB is enough | — | — |
| 4 | Configuration → Triggers | Add **Alexa Skills Kit**. Restrict to Skill ID from §10 | — | Other skill IDs |
| 5 | Configuration → Environment variables | See §7 table | — | Screenshot of values |
| 6 | Code | ASK SDK adapter (later build). Handler `index.handler` | — | Hard-coded secrets |
| 7 | Alexa console Endpoint | Paste Function ARN into default + NA | — | — |

**Chicken-and-egg order:** Create skill (get Skill ID) → create Lambda + ASK trigger with that Skill ID → paste Function ARN into skill Endpoint → Save.

CloudWatch log group: `/aws/lambda/benson-alexa-voice`. Use it to capture the first `userId`.

---

## 12. Exact Cloudflare setup checklist

Two accounts matter. Do not mix them.

| Account | Used for |
|---|---|
| Tunnel / Zero Trust that already runs `mmm-assistant` (mentalmattersmore / current Zero Trust org) | Access app + service token + tunnel ingress |
| **kckellie.com** DNS zone | CNAME `alexa` → `6f1688b3-ae2c-48ab-abfa-20394eae5ba1.cfargotunnel.com` |

| Step | Page | Create / enter | Copy somewhere | Do not expose |
|---|---|---|---|---|
| 1 | Zero Trust → Access → Service credentials → Service Tokens | Name `benson-alexa-lambda`. Duration: 1 year (or shorter). Generate | **Client ID** + **Client Secret** (secret once) → Lambda env | Secret in chat/repo |
| 2 | Zero Trust → Access → Applications → Add self-hosted | App: `alexa.kckellie.com`. Policy: **Service Auth** → Service Token = token from step 1. No email Allow | — | Do not add `api.kckellie.com` |
| 3 | Mappy `/etc/cloudflared/config.yml` **and** repo backup `deploy/cloudflared.config.yml.working-benson` | Add the two `alexa.kckellie.com` rules from §6. Restart `cloudflared` | — | Do not change `api.kckellie.com` |
| 4 | Test ingress locally | `cloudflared tunnel ingress rule …` as in §6 | — | — |
| 5 | kckellie.com zone → DNS | CNAME `alexa` → `6f1688b3-ae2c-48ab-abfa-20394eae5ba1.cfargotunnel.com`, proxied | — | Do not open ports on Mappy |
| 6 | From a laptop **not** on LAN, no headers | `curl -i https://alexa.kckellie.com/api/benson-voice/weekend-list` → Access block / login, **not** Benson JSON | — | — |
| 7 | From a trusted shell with CF + Bearer headers | 200 + `speech` | — | Print secrets |

**Order:** Access app + token **before** public CNAME.

Do **not** run `cloudflared tunnel route dns` with the mentalmattersmore cert expecting it to create `alexa.kckellie.com` in the kckellie.com zone — that creates a useless record on the wrong zone (`CLOUDFLARE_TUNNEL_RECOVERY.md`).

---

## 13. Exact Mappy / code changes required

**This planning step:** none.

**Later Phase 2 build (not now):**

| Change | Why |
|---|---|
| New `services/alexa/` (or equivalent) ASK adapter + unit tests | Lambda mapping only |
| Tunnel YAML on Mappy + repo working backup | Path-restricted hostname |
| Confirm `ENABLE_OPPORTUNITIES_API=true` on Mappy | Voice routes are behind that flag |
| Lambda env on AWS | Secrets stay out of git |

**Do not change**

- `services/api/src/routes/benson-voice.ts` contract
- Calendar projection / eligibility
- Weekend List semantics
- Ask Benson
- `api.kckellie.com` ingress or Access
- Dashboard

---

## 14. Test plan

Run in this order. At no point should Calendar projection, Ask Benson, research/scrape, or durable writes run.

1. **Lambda unit:** `WeekendCalendarIntent` → GET `…/weekend-calendar` with Bearer + request-id + CF headers.
2. **Lambda unit:** `WeekendListIntent` → GET `…/weekend-list`.
3. **Unknown intent:** static help; no HTTP call.
4. **Unauthorized `userId`:** spoken household refusal; no Benson call (or call skipped).
5. **Benson timeout (2.5 s):** “That’s taking too long…”
6. **401/403 Access or Bearer:** “Benson isn’t reachable right now…”
7. **Public curl** to `https://alexa.kckellie.com/api/benson-voice/weekend-list` **without** service auth → fail (Access). `https://alexa.kckellie.com/api/calendar/items` → tunnel 404, never Calendar JSON.
8. **Authorized Lambda-like curl** (CF headers + Bearer) → 200 + `speech`.
9. **Alexa Simulator:** “ask Benson what’s happening this weekend” (or Benson Studio).
10. **Alexa Simulator:** “ask Benson what’s on the weekend list.”
11. **Physical Echo** on the developer (or beta) account.

Proof of no side effects (same as Phase 1): Benson `voice_read` logs only; no `inventory projection` / `ask-benson` / scrape lines; `creator_calendar_items` and Weekend `planner_items` counts/`updated_at` unchanged.

---

## 15. Observability

### Lambda logs (structured JSON)

| Field | Yes |
|---|---|
| Alexa `request.requestId` | yes |
| intent name | yes |
| authorized user | yes/no only |
| Benson operation | `weekend_calendar` / `weekend_list` / `none` |
| Benson HTTP status | yes |
| Benson latency ms | yes |
| Lambda duration | yes |
| success / failure class | `ok` / `timeout` / `unreachable` / `unauthorized_user` / `benson_error` |

| Do not log |
|---|
| Full utterance / transcript |
| Bearer token |
| CF Access client secret or id |
| Full Benson JSON body |
| Email, calendar notes, Google sync |

### Correlation

Set `x-benson-request-id` = Alexa `request.requestId`. Benson already logs that as `requestId` on `service: "benson-voice-read"`. Search Mappy `api.log` and CloudWatch for the same UUID.

---

## 16. Failure / recovery

| Failure | What the household hears | Operator check |
|---|---|---|
| Mappy rebooted / API down | Unreachable copy | `curl localhost:4000/health`; `pnpm benson:deploy-local` or API start |
| `cloudflared` down | Unreachable / CF 1033 | `systemctl status cloudflared`; do not change `api.kckellie.com` while fixing |
| Access token rotated / expired | Unreachable | Mint new service token; update Lambda env; old secret is dead |
| `BENSON_VOICE_API_KEY` rotated on Mappy | Unreachable | Update Lambda env to the new Mappy value |
| Lambda env wrong / missing | Unreachable or deny-all | Compare names; never paste values into Slack |
| Alexa `userId` changes / Kellie account | Household refusal | Capture new id; append allowlist |
| Invocation misheard | Alexa “I can’t find that skill” | Confirm invocation (`benson` vs `benson studio`); rebuild model; enable skill on that Echo account |

**Short troubleshooting sequence**

1. Simulator still works? If yes, Echo account / invocation / enablement. If no, CloudWatch.
2. CloudWatch: `unauthorized_user` vs `timeout` vs `unreachable` vs `ok`.
3. Same `requestId` in Mappy `api.log`? If missing, request never reached Benson (Access, tunnel, DNS).
4. `curl` localhost voice routes with Bearer — if local works, the break is CF/Lambda.
5. Confirm `ENABLE_OPPORTUNITIES_API=true` and fingerprints MATCH.

---

## 17. Security review

| Control | Purpose |
|---|---|
| Unpublished Development skill | Not in the skill store |
| ASK trigger + Skill ID | Only this skill can invoke Lambda |
| `userId` allowlist | Only this household’s Amazon account(s) |
| Cloudflare Access Service Auth | Public hostname is not a login-less API |
| Benson bearer | Origin still rejects requests that bypass a mis-set Access policy |
| Path-restricted tunnel | `/api/calendar`, Ask Benson, Home never bind on `alexa.kckellie.com` |
| GET only, two operations | No mutations |
| Speech from Benson | No secrets in TTS |
| No account linking | No OAuth surface in Phase 2 |

`api.kckellie.com` stays as today: full API, Access off for OAuth. Alexa must never be pointed there.

---

## 18. Open blockers (account-side, not code)

- Elliott has Amazon developer + AWS (us-east-1) access.
- Elliott can edit **kckellie.com** DNS (not only the tunnel account).
- Elliott can create Zero Trust Access apps and service tokens on the org that already protects `benson.kckellie.com`.
- Console accepts `benson` or forces `benson studio`.
- Physical Echo Amazon account is Elliott’s, **or** Kellie is added as beta tester and allowlisted.
- Mappy `ENABLE_OPPORTUNITIES_API` remains true after deploys.

None of these require Benson product-code changes.

---

## 19. Estimated actual implementation effort

| Work | Estimate |
|---|---|
| Lambda adapter + unit tests (items 1–6) | ~3–5 hours |
| Elliott: Amazon + AWS console | ~45–90 minutes (including chicken-and-egg ARN/Skill ID) |
| Elliott: Access + tunnel + kckellie.com CNAME | ~30–60 minutes |
| Simulator + Echo smoke + log correlation | ~30–45 minutes |

**Same calendar day** is realistic if DNS/Access accounts are already in hand.

---

## 20. GO / NO-GO recommendation for build

**GO** to implement Phase 2 after this plan is accepted.

Preconditions for flipping DNS live:

- Access Service Auth app exists and is enforced
- Tunnel path rules verified with `cloudflared tunnel ingress rule`
- Lambda env set; skill unpublished
- Public curl without service auth fails
- Authorized curl returns Benson `speech` only

**NO-GO** if anyone proposes: pointing the skill at `api.kckellie.com`; hostname-only tunnel to `:4000`; email-only Access (Lambda cannot log in); routing utterances through Ask Benson; account linking; or mutations.

---

## References

- Phase 0 audit: `docs/reports/benson-alexa-integration-plan-2026-08-16.md`
- Phase 1 voice-read: `docs/reports/benson-alexa-phase1-voice-read-2026-08-16.md`
- Tunnel recovery / dual-account DNS: `CLOUDFLARE_TUNNEL_RECOVERY.md`
- Alexa Lambda regions: https://developer.amazon.com/en-US/docs/alexa/custom-skills/host-a-custom-skill-as-an-aws-lambda-function.html
- Invocation names: https://developer.amazon.com/en-US/docs/alexa/custom-skills/choose-the-invocation-name-for-a-custom-skill.html
- Cloudflare service tokens: https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
- cloudflared ingress / path regex: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/

---

BENSON ALEXA PHASE 2 PLAN COMPLETE
NO CLOUD OR PRODUCT CHANGES MADE
