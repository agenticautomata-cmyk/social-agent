# Alexa skill — manual Console / Lambda checklist

Use when ASK CLI / AWS CLI are unavailable. Do **not** weaken Cloudflare Access.

## 1. Interaction model (Alexa Developer Console)

1. Open skill **benson studio** (confirm live invocation name before changing).
2. Build → Interaction Model → JSON Editor.
3. Merge intents from repo file `services/alexa/interaction-model/en-US.json`:
   - `WeekendCalendarIntent`
   - `WeekendListIntent`
   - `WhatShouldKelliePostIntent`
   - `MoreResultsIntent`
   - standard Help / Stop / Cancel / Fallback
4. Preserve any existing live intents not listed above.
5. **Save Model** → **Build Model**.
6. Record build timestamp.

## 2. Lambda upload (AWS Console, us-east-1 historically)

1. Function name historically: `benson-alexa-voice`.
2. Runtime historically: Node.js 22.x; handler `index.handler`.
3. Upload `services/alexa/dist/benson-alexa-voice.zip` (rebuild with `pnpm --filter @social-agent/alexa build` then zip `dist/index.js` + `dist/package.json`).
4. Confirm env var **names** exist (values already set — do not rotate casually):
   - `BENSON_VOICE_BASE_URL` (typically `https://alexa.kckellie.com`)
   - `BENSON_VOICE_API_KEY`
   - `CF_ACCESS_CLIENT_ID`
   - `CF_ACCESS_CLIENT_SECRET`
   - `BENSON_ALEXA_ALLOWED_USER_IDS`
5. Save → optional publish version/alias.
6. Test in Alexa Simulator: weekend calendar, more, what should Kellie post.

## 3. Cloudflare Access

1. Confirm Access application for `alexa.kckellie.com`.
2. Confirm Lambda service token still valid (do not print secrets).
3. Unauthenticated GET should return **403 Access**.

## 4. Verification statuses after manual work

| Layer | Mark |
|---|---|
| Repo interaction model | CODED |
| Console model built | DEPLOYED (manual) |
| Lambda zip uploaded | DEPLOYED (manual) |
| Simulator success | VERIFIED E2E (simulator) |
| Physical Echo Show | VERIFIED E2E (device) |
