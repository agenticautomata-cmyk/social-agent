# Benson Alexa Phase 2A — Lambda adapter (code only)

**Date:** 2026-08-16  
**Machine:** Mappy (local Benson).  
**Scope:** ASK/Lambda adapter package + unit tests + local smoke + zip build instructions.  
**Not in this phase:** AWS resources, Alexa skill, Cloudflare Tunnel/Access/DNS, `alexa.kckellie.com`, account linking, mutations, notifications, new intents, Phase 1 voice-read API changes, deploys.

Alexa is a presentation adapter. Benson remains authority. The Lambda speaks Benson’s `speech` field and does not rank, rewrite, scrape, research, or write.

---

## Files created

| Path | Role |
|---|---|
| `services/alexa/package.json` | `@social-agent/alexa`, Node 20, ASK SDK, `test` / `smoke` / `build` / `zip` |
| `services/alexa/tsconfig.json` | Extends repo `tsconfig.base.json` |
| `services/alexa/src/index.ts` | Production `handler` (`SkillBuilders…lambda()`) |
| `services/alexa/src/config.ts` | Env contract + localhost CF-header omit |
| `services/alexa/src/allowlist.ts` | Household allowlist, fail-closed setup |
| `services/alexa/src/benson-client.ts` | Hardcoded GET map, 2.5s timeout, injectable transport |
| `services/alexa/src/handlers.ts` | Custom + Help/Stop/Cancel/unknown handlers |
| `services/alexa/src/logging.ts` | Structured JSON + secret redaction |
| `services/alexa/src/speech.ts` | Static copy + `HTTP_TIMEOUT_MS = 2500` |
| `services/alexa/src/test-helpers.ts` | ASK envelopes + spoken-text helper |
| `services/alexa/src/adapter.test.ts` | 17 unit tests |
| `services/alexa/src/smoke.ts` | Localhost Phase 1 smoke (CF headers forced off) |
| `pnpm-lock.yaml` | Workspace entry for `services/alexa` + `ask-sdk-core` / `ask-sdk-model` |

Build output (gitignored via root `dist/`):

| Path | Role |
|---|---|
| `services/alexa/dist/index.js` | Single-file Node 20 CJS bundle |
| `services/alexa/dist/package.json` | `{"type":"commonjs"}` so Lambda/`require` expose `handler` |
| `services/alexa/dist/benson-alexa-voice.zip` | Upload-ready zip (not uploaded) |

Phase 1 files were **not** modified:

- `services/api/src/routes/benson-voice.ts` (mtime 2026-08-16 06:57, no Phase 2A edit)
- `services/core/src/benson-voice-read/` (last Phase 1 writes 06:51–07:07)

---

## Intent mapping

Hardcoded only. No route construction from user text. GET only. No POST.

| Alexa intent | Benson path | HTTP |
|---|---|---|
| `WeekendCalendarIntent` | `/api/benson-voice/weekend-calendar` | GET |
| `WeekendListIntent` | `/api/benson-voice/weekend-list` | GET |
| `AMAZON.HelpIntent` | none | static help |
| `AMAZON.StopIntent` | none | static close (`Okay.`) |
| `AMAZON.CancelIntent` | none | static close (`Okay.`) |
| unknown / other | none | static help |

Help copy: “You can ask what's happening this weekend, or what's on the weekend list.”

No dates, analytics, discoveries, Ask Benson, or freeform question intents.

---

## Environment contract

Read from process env. Nothing hardcoded for production values.

| Variable | Purpose |
|---|---|
| `BENSON_VOICE_BASE_URL` | Origin only (no path). Production target later: `https://alexa.kckellie.com` |
| `BENSON_VOICE_API_KEY` | Bearer token (same Mappy voice key) |
| `CF_ACCESS_CLIENT_ID` | Cloudflare Access service token id |
| `CF_ACCESS_CLIENT_SECRET` | Cloudflare Access service token secret |
| `BENSON_ALEXA_ALLOWED_USER_IDS` | Comma-separated Alexa `userId` values |

Trailing slash on the base URL is stripped. Tests inject config / mock HTTP. Smoke forces CF secrets empty so localhost is not asked for Access headers.

---

## Auth / allowlist behavior

Alexa user: `context.System.user.userId`.

| Allowlist state | Benson HTTP | Speech | Log |
|---|---|---|---|
| Empty | none (fail closed) | “Benson isn't set up for this Alexa account yet.” | `setup_required` + `setupUserId` (the only time a full user ID is logged) |
| Unknown ID | none | “I can only talk to this household's Benson.” | `unauthorized_user`, `authorized: false` only |
| Known ID | GET proceeds | Benson `speech` or error copy | `authorized: true/false` only — no complete user IDs |

There is no environment flag that grants access when the allowlist is empty.

---

## HTTP headers

Authorized custom intents send:

```
Authorization: Bearer <BENSON_VOICE_API_KEY>
x-benson-request-id: <Alexa request.requestId>
```

When **both** `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` are set (production):

```
CF-Access-Client-Id: <CF_ACCESS_CLIENT_ID>
CF-Access-Client-Secret: <CF_ACCESS_CLIENT_SECRET>
```

Local smoke / localhost config omits the two Access headers. Production tests assert all four. This does not weaken production: if both CF secrets are present, they are always sent.

Correlation: Alexa `request.requestId` is copied verbatim to `x-benson-request-id`.

---

## Timeout and error speech

HTTP budget: **2.5 seconds** (`AbortController`). Lambda function timeout (later, AWS) should stay 6s so a hung Benson call cannot consume the whole Alexa window.

| Result class | Spoken |
|---|---|
| `ok` | Benson `speech` unchanged (`ok === true` and non-empty `speech`) |
| `timeout` | “That's taking too long. Try again, or check Benson on the dashboard.” |
| `unreachable` | “Benson isn't reachable right now. Try again in a minute.” |
| `benson_error` | same unreachable copy (malformed / `ok !== true` / empty speech) |
| `unauthorized_user` | household refusal |
| `setup_required` | setup copy |

`unreachable` covers network/DNS, 401, 403, 5xx, and other non-2xx. Speech never includes HTTP codes, Cloudflare, hostnames, auth errors, or stack traces.

Success path does not re-rank `items`, rewrite `speech`, append URLs, or read JSON fields for TTS.

---

## Logging contract

Structured JSON on stdout (`service: benson-alexa-adapter`).

Logged: Alexa `requestId`, intent, `authorized` true/false, Benson operation (`weekend_calendar` / `weekend_list` / `none`), `latencyMs`, HTTP status when applicable, total `durationMs`, `resultClass`.

Not logged: utterance/transcript, `BENSON_VOICE_API_KEY`, CF Access id/secret, full Benson body, email/private data, complete user IDs after the allowlist is populated.

Secret redaction also strips those values if they accidentally appear in the JSON line.

---

## Tests / results

Command: `pnpm --filter @social-agent/alexa test`  
Typecheck: `pnpm --filter @social-agent/alexa typecheck` (`tsc --noEmit`)

**17 passed, 0 failed** (2026-08-16).

| # | Case | Result |
|---|---|---|
| 1 | `WeekendCalendarIntent` → GET weekend-calendar + four headers + speech unchanged | pass |
| 2 | `WeekendListIntent` → GET weekend-list + speech unchanged | pass |
| 3 | Help → static, zero HTTP | pass |
| 4 | Stop / Cancel → close, zero HTTP | pass |
| 5 | Unknown intent → static help, zero HTTP | pass |
| 6 | Allowed user proceeds | pass |
| 7 | Unknown user → household refusal, zero Benson calls | pass |
| 8 | Empty allowlist → fail closed, setup speech, user ID only in setup log | pass |
| 8b | Populated allowlist does not log complete user IDs | pass |
| 9 | Benson timeout → timeout speech | pass |
| 10 | Network failure → unreachable speech | pass |
| 11 | 401 / 403 → unreachable speech | pass |
| 12 | 500 → unreachable speech | pass |
| 13 | Malformed Benson JSON → unreachable speech + `benson_error` | pass |
| 14 | Exact Alexa `requestId` forwarded as `x-benson-request-id` | pass |
| 15 | Secrets absent from logs | pass |
| — | Localhost config omits CF headers; production fixture still sends all four | pass |

---

## Local Benson smoke

Safe: adapter invoked in-process against Phase 1 on `http://127.0.0.1:4000`. CF secrets unset for this run only. Allowlist set to the test fixture user. Bearer taken from local gitignored `.env` (not printed here).

Command:

```
BENSON_VOICE_BASE_URL=http://127.0.0.1:4000 \
BENSON_ALEXA_ALLOWED_USER_IDS=amzn1.ask.account.ALLOWED \
CF_ACCESS_CLIENT_ID= \
CF_ACCESS_CLIENT_SECRET= \
pnpm --filter @social-agent/alexa smoke
```

| Intent | HTTP | latencyMs | Benson speech (adapter repeated unchanged) |
|---|---|---|---|
| `WeekendCalendarIntent` | 200 | 436 | “Benson found 128 things this weekend. The first few are One-on-One DNA & Genetic Genealogy Help - In Person or on Zoom at Central Resource Library, Bookmobile at Transition Center at Bookmobile, and Meet & Greet w/ DC4KC at Equal Minded Cafe. Ask for more if you want the rest.” |
| `WeekendListIntent` | 200 | 43 | “There are 3 items on the weekend list. They are 816 Day \| Kansas City at Kansas City Power & Light District, Hike with a Naturalist at Lakeside Nature Center, and KC's Friday Night Cap - Sherri's After Dark With Nneoma Lanea & The Sound Four at Sherri's Executive Lounge.” |

Request-id correlation in `.logs/pre-alpha/api.log`:

- `alexa-smoke-WeekendCalendarIntent-1786884028096` → `voice_read` `weekend_calendar` 200 count=128
- `alexa-smoke-WeekendListIntent-1786884028537` → `voice_read` `weekend_list` 200 count=3

New API log lines were only those two GETs. No Calendar projection, Ask Benson, scrape/research, or durable writes.

---

## Deploy artifact (do not upload)

Exact later command:

```
pnpm --filter @social-agent/alexa zip
```

Equivalent: `cd services/alexa && pnpm zip`

That runs esbuild, then zips `dist/index.js` + `dist/package.json`.

| Item | Value |
|---|---|
| Handler | `index.handler` |
| Runtime | Node.js 20.x (x86_64, later AWS) |
| Packaging | One CJS bundle; `ask-sdk-core` / `ask-sdk-model` inlined; **no `node_modules` in the zip** |
| Bundle | `dist/index.js` ≈ 237 KB (242,924 bytes) |
| Zip | `services/alexa/dist/benson-alexa-voice.zip` ≈ 27 KB (27,205 bytes) |
| Zip contents | `index.js`, `package.json` (`{"type":"commonjs"}`) |

esbuild footer `module.exports = { handler };` is required. Plain `--format=cjs` left `handler` undefined on `require()`. Verified: `typeof require('./dist/index.js').handler === 'function'`.

The zip was **not** uploaded to AWS.

---

## Phase 1 unchanged

No edits to `services/api/src/routes/benson-voice.ts` or `services/core/src/benson-voice-read/`. No compilation import/export fix was required. Voice-read contract remains GET + Bearer + optional `x-benson-request-id`.

---

## Health / fingerprints

Checked 2026-08-16 after smoke:

| Check | Result |
|---|---|
| `GET http://127.0.0.1:4000/health` | 200 `{"ok":true}` |
| Dashboard `:3000` | 200 |
| Deployment parity | **MATCH** `bc36761c4a4bcd6e` |
| API started | 2026-08-16T12:36:32.168Z |
| `services/alexa` in `FINGERPRINT_PATHS` | no (expected; adapter is not part of the Mappy API/dashboard/workers fingerprint) |

---

## Remaining manual Amazon / AWS / Cloudflare steps

None of these were done. Do them later, in this order, from `docs/reports/benson-alexa-phase2-implementation-plan-2026-08-16.md` §§10–12.

**Amazon Developer Console**

1. Create unpublished Custom skill `Benson`, Provision your own, en-US.
2. Invocation: try `benson`, fall back to `benson studio` if validation fails.
3. Add only `WeekendCalendarIntent` and `WeekendListIntent` (no date slots). Keep Help/Stop/Cancel. Build model.
4. Permissions: none. Account linking **OFF**. Do not submit for certification.

**AWS (us-east-1 only)**

1. IAM role with `AWSLambdaBasicExecutionRole` only.
2. Create function `benson-alexa-voice`, Node.js 20.x, x86_64, timeout 6s, memory 256 MB.
3. Upload `services/alexa/dist/benson-alexa-voice.zip`. Handler `index.handler`.
4. Env: `BENSON_VOICE_BASE_URL=https://alexa.kckellie.com` plus the four secrets/allowlist vars. No insecure “open allowlist” flag.
5. Chicken-and-egg: create skill → copy Skill ID → Lambda Alexa Skills Kit trigger restricted to that Skill ID → paste Function ARN into skill Endpoint (default + North America).
6. First Development Simulator request: CloudWatch `/aws/lambda/benson-alexa-voice` → copy `userId` into `BENSON_ALEXA_ALLOWED_USER_IDS`.

**Cloudflare (two accounts — do not mix)**

1. Zero Trust service token `benson-alexa-lambda`. Client secret is shown once.
2. Self-hosted Access app `alexa.kckellie.com`, **Service Auth** only (no email Allow). Enable Access **before** public DNS.
3. Tunnel ingress (Mappy `/etc/cloudflared/config.yml` + repo backup): path-restricted `alexa.kckellie.com` → `:4000` for `^/api/benson-voice(/.*)?$`, then hostname 404. Do not change `api.kckellie.com`.
4. kckellie.com zone (not the tunnel cert account): CNAME `alexa` → `6f1688b3-ae2c-48ab-abfa-20394eae5ba1.cfargotunnel.com`, proxied.
5. Off-LAN curl without headers must not return Benson JSON. Trusted curl with CF + Bearer must return `speech`.

Do **not** point Alexa at `https://api.kckellie.com`.

---

BENSON ALEXA LAMBDA ADAPTER VERIFIED
NO AWS ALEXA CLOUDFLARE OR DNS CHANGES MADE
STOP.
