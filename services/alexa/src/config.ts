import { HTTP_TIMEOUT_MS } from './speech.js';

export type AlexaAdapterConfig = {
  voiceBaseUrl: string;
  voiceApiKey: string;
  cfAccessClientId: string;
  cfAccessClientSecret: string;
  allowedUserIds: string[];
  httpTimeoutMs: number;
};

export function parseAllowedUserIds(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AlexaAdapterConfig {
  return {
    voiceBaseUrl: (env.BENSON_VOICE_BASE_URL ?? '').trim().replace(/\/$/, ''),
    voiceApiKey: (env.BENSON_VOICE_API_KEY ?? '').trim(),
    cfAccessClientId: (env.CF_ACCESS_CLIENT_ID ?? '').trim(),
    cfAccessClientSecret: (env.CF_ACCESS_CLIENT_SECRET ?? '').trim(),
    allowedUserIds: parseAllowedUserIds(env.BENSON_ALEXA_ALLOWED_USER_IDS),
    httpTimeoutMs: HTTP_TIMEOUT_MS,
  };
}

/** Send Access headers only when both secrets are present. Localhost smoke omits them. */
export function shouldSendCloudflareAccessHeaders(config: AlexaAdapterConfig): boolean {
  return Boolean(config.cfAccessClientId && config.cfAccessClientSecret);
}
