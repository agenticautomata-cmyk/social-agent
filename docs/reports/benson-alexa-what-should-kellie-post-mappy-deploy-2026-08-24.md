# Benson Alexa — WhatShouldKelliePostIntent Mappy deploy + Lambda artifact

**Date:** 2026-08-24  
**Scope:** Deploy Benson/Mappy API for `GET /api/benson-voice/what-should-kellie-post`, smoke locally, build Lambda zip for Elliott’s manual AWS upload.  
**Not done:** Alexa Developer Console edits, AWS Lambda upload, Cloudflare/DNS/tunnel/auth changes, Today zero-yield, sponsor leak, new intents.

---

## 1. Pre-deploy runtime identity

| Field | Value |
|---|---|
| Port 4000 listeners | **1** (`node` pid **522986**) |
| API start | Sun Aug 23 13:34:37 2026 (~22h uptime) |
| Health | **200** `{"ok":true,"identity":{"gitCommit":"aaad48f","releaseTag":"release/newsletter-intelligence-2026-07-28-1-gaaad48f","serviceName":"benson-api","environment":"development"}}` |
| Deployment status | **DRIFT** — `sourceFingerprint` `8c6983f38568a41b` ≠ `apiFingerprint` `0ff019026df8a61a` |
| `BENSON_API_MODE` (process) | `production` |
| `TZ` | `America/Chicago` |
| Host Node (`/usr/bin/node`) | **v18.19.1** (runtime used by API via tsx) |
| Weekend voice without auth | both **401** (auth middleware live) |
| Source contains route | `services/api/src/routes/benson-voice.ts` → `GET /what-should-kellie-post` |
| Timezone-parity fix present | `postTodayVoiceSqlDayWindows` / `creatorTimezonePostTodayDayWindow` in `load-post-today-voice-candidates.ts` |

---

## 2. Deployment / restart

| Item | Value |
|---|---|
| Command | `bash scripts/restart-api.sh` |
| Services restarted | **API only** (port 4000) |
| Dashboard | **not** restarted |
| Workers | **not** restarted |
| Cloudflare / tunnel / DNS | **unchanged** |
| Auth secrets | **unchanged** |

Restart log excerpt:

```
Restarting API on :4000…
Stopping Benson-owned listeners on :4000 (pids: 522986)
Starting API on :4000…
✅ API healthy on :4000 (commit aaad48f)
```

---

## 3. Post-deploy runtime identity

| Field | Value |
|---|---|
| Port 4000 listeners | **1** (`node` pid **1265000**) |
| API start | Mon Aug 24 12:12:22 2026 (`apiStartedAt` `2026-08-24T17:12:19Z`) |
| Health | **200** (same identity shape; commit `aaad48f`) |
| Source ↔ API fingerprint | **`8c6983f38568a41b` = `8c6983f38568a41b`** (API parity restored) |
| Overall stack status | Still reports **DRIFT** because dashboard (`bc36761c…`) and workers (`784bb22c…`) fingerprints differ — **expected** (API-only deploy) |
| `BENSON_API_MODE` | `production` |
| `TZ` | `America/Chicago` |

**Source/runtime parity for the API service: YES.**  
Overall stack message “Source changes are not deployed” reflects dashboard/worker drift only — out of scope for this slice.

---

## 4. Local voice endpoint smoke

Auth: existing `BENSON_VOICE_API_KEY` from `.env` (value not printed).  
Header: `x-benson-request-id: alexa-post-deploy-smoke-2026-08-24` (and distinct ids for weekend).

### `GET /api/benson-voice/what-should-kellie-post`

| Check | Result |
|---|---|
| HTTP | **200** |
| `operation` | `what_should_kellie_post` |
| Elapsed | **504 ms** |
| `count` | **0** (legitimate current live empty `postToday`) |
| `speech` | `I don't have a strong content post for Kellie right now.` |
| URL / UUID in speech | **none** |

### Weekend regressions (local)

| Route | HTTP | Elapsed | Notes |
|---|---:|---:|---|
| `/api/benson-voice/weekend-calendar` | **200** | 583 ms | `operation=weekend_calendar`, count 31 (body not dumped) |
| `/api/benson-voice/weekend-list` | **200** | 158 ms | `operation=weekend_list`, empty list speech |

---

## 5. External Cloudflare path (`alexa.kckellie.com`)

### Attempt

Local checkout `.env` contains **`BENSON_VOICE_API_KEY` only**.  
**`CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` are not present** on this machine (they live on Lambda env in production). `aws` CLI is not installed here, so Lambda env could not be read.

### Observed without Access service token

| Check | Result |
|---|---|
| `GET https://alexa.kckellie.com/api/benson-voice/what-should-kellie-post` | **HTTP 403** |
| Body | Cloudflare Access HTML error page |
| Interpretation | Access still enforced; no auth weakening |

### Verdict for PART 4

**External authenticated smoke could not be completed from this host** without CF Access service-token credentials.  

- Cloudflare configuration was **not** changed.  
- Local Benson voice path after API restart is verified.  
- Elliott should re-check the external path after Lambda zip upload (Lambda already has CF + bearer env), or supply CF service-token env locally for a one-off curl.

**Not treated as an API deploy failure** — Access gate is intact; Mappy route is live on `:4000`.

---

## 6. Lambda artifact

| Item | Value |
|---|---|
| Build command | `pnpm --filter @social-agent/alexa zip` |
| Path | `services/alexa/dist/benson-alexa-voice.zip` |
| Size | **31037 bytes** (~31 KB) |
| SHA-256 | `77767aae077e284c8503ff8d7fb88d930f68d6ddb897dd241eb4e40b3e3c5230` |
| Contents | `index.js` (261884 bytes) + `package.json` (`{"type":"commonjs"}`) |
| esbuild target | **node22** |
| Handler footer | `module.exports = { handler };` → **`index.handler`** |

### Bundle proof (string presence in `index.js`)

| Symbol | Present |
|---|---|
| `WhatShouldKelliePostIntent` | yes |
| `/api/benson-voice/what-should-kellie-post` | yes |
| `WeekendCalendarIntent` | yes |
| `WeekendListIntent` | yes |
| `MoreResultsIntent` | yes |
| `SessionEndedRequest` | yes |
| APL `RenderDocument` / APL | yes |

**AWS upload: NOT performed.**

---

## 7. Tests after artifact build

| Suite | Result |
|---|---|
| `pnpm --filter @social-agent/alexa test` | **52 passed / 0 failed** |
| `pnpm --filter @social-agent/alexa typecheck` | **pass** |
| `services/core` `src/benson-voice-read/*.test.ts` | **51 passed / 0 failed** |

---

## 8. Confirmations

| Item | Status |
|---|---|
| No AWS Lambda upload | Confirmed |
| Alexa Developer Console unchanged | Confirmed |
| Cloudflare / DNS / tunnel unchanged | Confirmed |
| Auth secrets unchanged | Confirmed |
| No durable inventory/data mutation | Confirmed |
| Today zero-yield not “fixed” | Confirmed (live count still 0) |
| Eligibility / scoring unchanged | Confirmed |
| Exactly one `:4000` listener | Confirmed |
| API health 200 | Confirmed |
| API source fingerprint matches runtime | Confirmed |

---

## 9. Exact manual Alexa Developer Console steps (Elliott)

Skill **Benson** · invocation **benson studio** (do not recreate).

1. Open **Alexa Developer Console** → skill **Benson** → **Build** → **Interaction Model** → **Intents**.  
2. **Add Intent** → name: **`WhatShouldKelliePostIntent`** (no slots).  
3. Sample utterances (no “Alexa” / invocation prefix):

   - what should Kellie post  
   - what should Kellie post today  
   - what should she post today  
   - what should Kellie post for content today  
   - what can Kellie film today  
   - what should Kellie film today  
   - give me Kellie's post for today  
   - what is Kellie's best post today  

4. Keep existing intents (`WeekendCalendarIntent`, `WeekendListIntent`, `MoreResultsIntent`, built-ins).  
5. **Save Model** → **Build Model**.  
6. Do **not** change endpoint, skill ID, or invocation name.

---

## 10. Exact manual AWS Lambda upload steps (Elliott)

Function: **`benson-alexa-voice`** · Region: **`us-east-1`**

1. Upload **`services/alexa/dist/benson-alexa-voice.zip`**.  
2. Verify SHA-256 matches:  
   `77767aae077e284c8503ff8d7fb88d930f68d6ddb897dd241eb4e40b3e3c5230`  
3. Keep runtime **Node.js 22.x**.  
4. Keep handler **`index.handler`**.  
5. Keep **all existing environment variables** (`BENSON_VOICE_BASE_URL`, `BENSON_VOICE_API_KEY`, `CF_ACCESS_*`, `BENSON_ALEXA_ALLOWED_USER_IDS`, etc.).  
6. Keep Alexa Skills Kit trigger / skill ID restriction.  
7. **Deploy**.  
8. Do **not** change memory/timeout unless inspection shows drift from known working config (report drift instead of “fixing”).

No secret changes expected.

---

## 11. Post-upload test sequence (Elliott)

Current empty-state speech for WhatShouldKelliePost is **legitimate** — not an Alexa failure.

1. **Simulator:** “ask Benson studio what Kellie should post today”  
   - Expect empty-state speech or a real top recommendation if inventory later yields `postToday`.  
2. If a multi-item response: “more” (MoreResults).  
3. **Physical Echo Show:** same What Should Kellie Post request (voice + APL list if supported).  
4. Regression: “ask Benson studio what's happening this weekend”.  
5. Regression: “ask Benson studio what's on the weekend list”.  

Optional operator curl (with Lambda’s CF + bearer, not printed here):

```bash
curl -sS -D- \
  -H "Authorization: Bearer $BENSON_VOICE_API_KEY" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "x-benson-request-id: alexa-external-smoke-2026-08-24" \
  https://alexa.kckellie.com/api/benson-voice/what-should-kellie-post
```

Expect HTTP 200, `operation: what_should_kellie_post`, latency comfortably under 2.5s.

---

## 12. OUT OF SCOPE / unrelated findings

1. **Dashboard + worker fingerprint DRIFT** remains after API-only restart — not fixed in this task.  
2. Health JSON still labels `environment: "development"` while process `BENSON_API_MODE=production` — pre-existing identity quirk; not changed.  
3. Host Node **v18.19.1** runs the API via tsx; Lambda artifact targets **Node 22** — intentional existing split.  
4. **External CF-authenticated smoke blocked** by missing local `CF_ACCESS_*` credentials — Access itself healthy (403).  
5. Live `postToday` zero-yield / `no_specific_today_reason` — not addressed.  
6. Sponsor/email housekeeping leakage — not addressed.
