/**
 * Local adapter smoke against Phase 1 voice-read on localhost.
 * Does not require Cloudflare Access headers (localhost ignores them).
 * Does not weaken production: CF headers are sent whenever both secrets are set.
 */
import { createSkill } from './handlers.js';
import { loadConfig } from './config.js';
import { defaultFetchTransport } from './benson-client.js';
import { intentEnvelope, spokenText } from './test-helpers.js';

async function main() {
  const config = loadConfig({
    ...process.env,
    BENSON_VOICE_BASE_URL: process.env.BENSON_VOICE_BASE_URL || 'http://127.0.0.1:4000',
    BENSON_ALEXA_ALLOWED_USER_IDS:
      process.env.BENSON_ALEXA_ALLOWED_USER_IDS || 'amzn1.ask.account.ALLOWED',
    CF_ACCESS_CLIENT_ID: '',
    CF_ACCESS_CLIENT_SECRET: '',
  });
  if (!config.voiceApiKey) {
    console.error('BENSON_VOICE_API_KEY is required for local smoke');
    process.exit(1);
  }

  const skill = createSkill({
    config,
    transport: defaultFetchTransport(),
    writeLog: (line) => console.log(line),
  });

  for (const intent of ['WeekendCalendarIntent', 'WeekendListIntent'] as const) {
    const started = Date.now();
    const out = await skill.invoke(
      intentEnvelope({
        intent,
        requestId: `alexa-smoke-${intent}-${Date.now()}`,
      }),
    );
    const ms = Date.now() - started;
    console.log(JSON.stringify({ intent, latencyMs: ms, speech: spokenText(out) }));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
