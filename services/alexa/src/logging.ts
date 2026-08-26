export type ResultClass =
  | 'ok'
  | 'timeout'
  | 'unreachable'
  | 'unauthorized_user'
  | 'setup_required'
  | 'benson_error';

export type AdapterLogEvent = {
  service: 'benson-alexa-adapter';
  message: 'alexa_adapter';
  requestId: string;
  intent: string;
  authorized: boolean;
  operation:
    | 'weekend_calendar'
    | 'weekend_list'
    | 'what_should_kellie_post'
    | 'post_recommendations'
    | 'none';
  latencyMs?: number;
  httpStatus?: number;
  durationMs: number;
  resultClass: ResultClass;
  /** Only when allowlist is empty (setup). Never logged after allowlist is populated. */
  setupUserId?: string;
  /** SessionEndedRequest only. */
  reason?: string;
  error?: {
    type?: string;
    message?: string;
  };
};

const SECRET_KEYS = [
  'BENSON_VOICE_API_KEY',
  'CF_ACCESS_CLIENT_ID',
  'CF_ACCESS_CLIENT_SECRET',
  'Authorization',
  'CF-Access-Client-Id',
  'CF-Access-Client-Secret',
];

export function redactSecrets(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) {
      out = out.split(secret).join('[REDACTED]');
    }
  }
  for (const key of SECRET_KEYS) {
    out = out.replace(new RegExp(`${key}=\\S+`, 'gi'), `${key}=[REDACTED]`);
  }
  return out;
}

export function logAdapterEvent(
  event: AdapterLogEvent,
  secrets: string[] = [],
  write: (line: string) => void = console.log,
): void {
  const line = redactSecrets(JSON.stringify(event), secrets);
  write(line);
}
