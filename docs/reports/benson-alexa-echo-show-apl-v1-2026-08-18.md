# Benson Alexa — Echo Show APL visual V1

**Date:** 2026-08-18  
**Machine:** Mappy (local Benson).  
**Scope:** Presentation-only Alexa Presentation Language (APL) layer on the existing Lambda adapter.  
**Not in this change:** AWS deploy, Alexa Developer Console edits, Cloudflare, tunnel/DNS, Benson voice-read API, household allowlist, intent routing, invocation name, speech copy, auth headers, or network timeouts.

Benson remains the source of truth. The Lambda still speaks Benson’s `speech` field unchanged. APL is an optional visual companion for APL-capable Echo Show devices.

---

## 1. Starting verified state

This work started from a working household voice path:

| Piece | Status |
|---|---|
| Alexa Custom Skill | Benson |
| Invocation | `benson studio` |
| Lambda | `benson-alexa-voice` |
| Runtime on AWS | Node.js 22.x |
| Handler | `index.handler` |
| Physical Echo Show | Launches Benson |
| Simulator | Reaches Lambda |
| Hostname | `https://alexa.kckellie.com` through Cloudflare Access |
| Secrets / allowlist | Configured and working |
| Intents | `WeekendCalendarIntent` and `WeekendListIntent` voice responses work |
| Adapter | `services/alexa/` |

Voice, network, and auth plumbing were treated as frozen. This change only adds visuals.

---

## 2. Files changed

| Path | Change |
|---|---|
| `services/alexa/src/apl.ts` | **New.** Shared APL 1.2 document, screen builders, APL capability check, optional hero URL field |
| `services/alexa/src/handlers.ts` | Dedicated `LaunchRequest` handler; success/launch paths may attach `RenderDocument` |
| `services/alexa/src/benson-client.ts` | After a valid `ok` + `speech` body, also parse Benson `items` for display. Speech validation unchanged |
| `services/alexa/src/test-helpers.ts` | Optional APL interface on envelopes; `LaunchRequest` helper; directive inspector |
| `services/alexa/src/apl.test.ts` | **New.** Focused APL tests |
| `services/alexa/package.json` | esbuild `--target=node22` (matches live Lambda runtime) |

**Unchanged**

- `services/alexa/src/index.ts` (still `index.handler` via ASK `SkillBuilders…lambda()`)
- `services/alexa/src/config.ts`, `allowlist.ts`, `logging.ts`, `speech.ts`, `smoke.ts`
- `services/api/src/routes/benson-voice.ts`
- `services/core/src/benson-voice-read/`
- Cloudflare, tunnel, DNS, AWS, Alexa console, environment variables

Build output (gitignored `dist/`):

| Path | Role |
|---|---|
| `services/alexa/dist/index.js` | Single-file Node 22 CJS bundle (~244 KB) |
| `services/alexa/dist/package.json` | `{"type":"commonjs"}` so `require()` exposes `handler` |
| `services/alexa/dist/benson-alexa-voice.zip` | Upload-ready zip (**not uploaded**) |

---

## 3. Visual behavior

APL is added only when this is truthy:

```
event.context.System.device.supportedInterfaces["Alexa.Presentation.APL"]
```

If that interface is missing or null, the adapter returns the **exact existing voice response** with **no** visual directive.

### LaunchRequest

Previously Launch fell through the unknown-intent fallback: help speech, session stays open, no HTTP.

Now Launch is an explicit handler with the **same speech and `shouldEndSession: false`**. On an APL device it also renders a branded home screen.

| Field | Value |
|---|---|
| Brand | KCKellie |
| Title | Benson |
| Tagline | Kansas City |
| Items | none |
| Speech | `You can ask what's happening this weekend, or what's on the weekend list.` |
| Session | stays open |

### WeekendCalendarIntent (authorized + Benson `ok`)

| Field | Value |
|---|---|
| Brand | KCKellie |
| Title | What's Happening This Weekend |
| Tagline | Benson |
| Items | First up to 5 items already returned by Benson (`title`, `day`, `time`, `venue`) |
| Speech | Benson `speech` **verbatim** |
| Session | ends (`true`), same as before |

### WeekendListIntent (authorized + Benson `ok`)

| Field | Value |
|---|---|
| Brand | KCKellie |
| Title | Weekend List |
| Tagline | Benson |
| Items | First up to 5 Benson Weekend List items |
| Speech | Benson `speech` **verbatim** |
| Session | ends (`true`), same as before |

### Layout

Landscape Echo Show layout, APL 1.2, no buttons, no pagination controls, no `UserEvent`, no video, no animation:

- Left ~32%: plum-to-sunset gradient panel with large **KCKellie** type (hero image slot exists but is off while the URL is empty)
- Right ~68%: brand line, large screen title, then up to five event rows
- Event row: title (large) + optional detail line `day  ·  time  ·  venue` when those fields are present
- Empty fields are omitted; nothing is invented
- No URLs, IDs, request IDs, auth data, verification flags, or internal metadata on screen

Help / Stop / Cancel / unknown intents stay voice-only (no APL).

---

## 4. When APL is *not* attached

These paths keep the previous voice-only response and **never** include Benson items in a document:

| Path | Speech | APL |
|---|---|---|
| Non-APL device | unchanged | none |
| Unauthorized household user | `I can only talk to this household's Benson.` | none (no Benson call) |
| Empty allowlist / setup | `Benson isn't set up for this Alexa account yet.` | none |
| Timeout | existing timeout copy | none |
| Network / 401 / 403 / 5xx / malformed JSON | existing unreachable copy | none |
| Help / Stop / Cancel / unknown | existing static copy | none |

Unauthorized APL-capable requests were tested to ensure event titles and Benson speech cannot leak through directives or the response JSON.

---

## 5. Image / brand asset search

Inspected before any URL was chosen:

| Candidate | Result |
|---|---|
| Raster images (`png` / `jpg` / `webp`) in this repo | none |
| `dashboard/public` media | none |
| `portfolio-media/_src/*.svg` | generic **social-agent** pipeline graphics, not Kellie, not hosted at a public HTTPS URL |
| Stable public HTTPS Kellie/KCKellie portrait in code or config | none |
| `alexa.kckellie.com` as an image host | unsuitable even later — Cloudflare Access would block Alexa’s image fetch |

**Decision:** do **not** invent an image URL. V1 uses a high-contrast branded gradient placeholder.

**Single future hook** (not an environment variable):

```ts
export const KCKELLIE_HERO_IMAGE_URL = '';
```

in `services/alexa/src/apl.ts`. When this is a non-empty HTTPS URL, `hasHero` becomes true and the left panel Image renders. Tests do not require this field.

### Asset still needed

Supply a **public HTTPS PNG or JPG** of Kellie / KCKellie:

- Portrait or landscape-friendly crop that reads from several feet
- Directly fetchable by Echo Show (no Cloudflare Access, no auth)
- Not hosted on `alexa.kckellie.com`
- Reasonable size (hundreds of KB, not a huge original)

Then set `KCKELLIE_HERO_IMAGE_URL` to that URL and rebuild the zip. Do not put the file behind the voice hostname.

---

## 6. Implementation notes (what stayed frozen)

| Concern | Behavior |
|---|---|
| Speech | Still Benson `speech` on success; static copy otherwise. Not rewritten, not re-ranked |
| `shouldEndSession` | Launch/Help `false`; calendar/list/stop/cancel `true` |
| Allowlist | Same fail-closed / household refusal; APL cannot bypass it |
| HTTP | Same two GET paths, same four production headers, 2.5s timeout |
| Ranking | Display uses Benson `items` in the order returned, sliced to 5. No new ranking |
| Network for presentation | None. No extra fetches for images or APL packages |
| ASK SDK | Already in use; APL is `addDirective(RenderDocument)` on the existing builder |
| Intents | No new intents. LaunchRequest is built-in |
| Invocation | Still `benson studio` |

`benson-client` still requires `ok === true` and non-empty `speech`. `items` are display-only and optional; missing/malformed `items` yield an empty list rather than failing the voice response.

---

## 7. Tests

Command: `pnpm --filter @social-agent/alexa test`  
Typecheck: `pnpm --filter @social-agent/alexa typecheck`

**23 passed, 0 failed** (2026-08-18).

Existing adapter suite: **17/17** still green (headers, speech, help/stop/cancel/unknown, allowlist, timeout, 401/403/500, malformed JSON, request-id correlation, secret redaction, localhost CF-header omit).

New APL suite:

| # | Case | Result |
|---|---|---|
| 1 | APL-capable `LaunchRequest` → `RenderDocument`, help speech unchanged, session open, zero HTTP | pass |
| 2 | APL-capable `WeekendCalendarIntent` → `RenderDocument` with Benson titles/details, speech identical | pass |
| 3 | APL-capable `WeekendListIntent` → `RenderDocument` with list titles, speech identical | pass |
| 4 | Non-APL device → no `RenderDocument`; calendar speech + Launch help unchanged | pass |
| 5 | Unauthorized APL user → household refusal, zero Benson calls, no event leak in response | pass |
| 6 | Detail formatting uses only present fields; max 5 items | pass |

---

## 8. Rebuilt artifact (not deployed)

```
pnpm --filter @social-agent/alexa zip
```

| Item | Value |
|---|---|
| Zip | `services/alexa/dist/benson-alexa-voice.zip` |
| Size | 28,859 bytes |
| Contents | `index.js`, `package.json` (`{"type":"commonjs"}`) |
| Handler | `index.handler` (`typeof require('./dist/index.js').handler === 'function'`) |
| Bundle target | Node.js 22 (`esbuild --target=node22`) |
| Packaging | Single CJS bundle; ASK SDK inlined; no `node_modules` in the zip |
| Uploaded to AWS | **No** |

---

## 9. Required manual Alexa console step

APL cannot be enabled from this repo. After the new zip is uploaded to Lambda `benson-alexa-voice`:

1. Open [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) → skill **Benson**.
2. **Build** → **Interfaces**.
3. Turn **Alexa Presentation Language** **ON**.
4. **Save Interfaces**.
5. Rebuild the interaction model if the console asks.

Until that toggle is on, Echo Show will keep voice-only even with this zip. Do not add extra APL documents, widgets, or touch handlers in the console for V1.

Then verify on the physical Show:

- “Alexa, open Benson studio” → branded KCKellie/Benson screen + existing help speech
- Weekend calendar / weekend list → list visual + **same** spoken copy as today
- A non-screen Alexa device (if present) → voice only, no errors

---

## 10. Operator follow-up (not done here)

1. Upload `services/alexa/dist/benson-alexa-voice.zip` to Lambda `benson-alexa-voice` (handler remains `index.handler`, runtime Node.js 22.x).
2. Enable APL in the Alexa console (section 9).
3. Later: host a public Kellie HTTPS image and set `KCKELLIE_HERO_IMAGE_URL`.

Do **not** change Cloudflare Access, `alexa.kckellie.com` ingress, `BENSON_VOICE_API_KEY`, or `BENSON_ALEXA_ALLOWED_USER_IDS` for this visual.

---

## 11. Confirmation

| Check | Result |
|---|---|
| Voice copy | Unchanged |
| Auth / CF headers / bearer | Unchanged |
| Household allowlist | Unchanged |
| Intent → GET map | Unchanged |
| Benson API / voice-read | Unchanged |
| Invocation `benson studio` | Unchanged |
| AWS / Cloudflare / DNS | Unchanged |
| Lambda zip uploaded | No |

BENSON ALEXA ECHO SHOW APL V1 CODED AND TESTED  
NO AWS ALEXA CLOUDFLARE OR DNS CHANGES MADE
