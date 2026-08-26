import type { AlexaAdapterConfig } from './config.js';
import { shouldSendCloudflareAccessHeaders } from './config.js';
import type { ResultClass } from './logging.js';

export const INTENT_TO_PATH = {
  WeekendCalendarIntent: '/api/benson-voice/weekend-calendar',
  WeekendListIntent: '/api/benson-voice/weekend-list',
  WhatShouldKelliePostIntent: '/api/benson-voice/what-should-kellie-post',
} as const;

export type CustomVoiceIntent = keyof typeof INTENT_TO_PATH;

export const INTENT_TO_OPERATION: Record<
  CustomVoiceIntent,
  'weekend_calendar' | 'weekend_list' | 'what_should_kellie_post'
> = {
  WeekendCalendarIntent: 'weekend_calendar',
  WeekendListIntent: 'weekend_list',
  WhatShouldKelliePostIntent: 'what_should_kellie_post',
};

export type HttpTransport = (input: {
  url: string;
  method: 'GET';
  headers: Record<string, string>;
  signal: AbortSignal;
}) => Promise<{ status: number; bodyText: string }>;

export type BensonVoiceItem = {
  title: string;
  day: string;
  time: string | null;
  venue: string | null;
  /** Compact why — used for post-recommendation MoreResults speech only. */
  reason?: string | null;
};

export type BensonCallResult = {
  resultClass: Extract<ResultClass, 'ok' | 'timeout' | 'unreachable' | 'benson_error'>;
  speech?: string;
  items?: BensonVoiceItem[];
  status?: number;
  latencyMs: number;
  url: string;
  headers: Record<string, string>;
};

export function buildBensonHeaders(
  config: AlexaAdapterConfig,
  requestId: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.voiceApiKey}`,
    'x-benson-request-id': requestId,
  };
  if (shouldSendCloudflareAccessHeaders(config)) {
    headers['CF-Access-Client-Id'] = config.cfAccessClientId;
    headers['CF-Access-Client-Secret'] = config.cfAccessClientSecret;
  }
  return headers;
}

export function defaultFetchTransport(): HttpTransport {
  return async ({ url, headers, signal }) => {
    const res = await fetch(url, { method: 'GET', headers, signal });
    const bodyText = await res.text();
    return { status: res.status, bodyText };
  };
}

function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = 'name' in err ? String(err.name) : '';
  const code = 'code' in err ? String(err.code) : '';
  return name === 'TimeoutError' || name === 'AbortError' || code === 'ABORT_ERR';
}

function parseSpeech(bodyText: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const body = parsed as { ok?: unknown; speech?: unknown };
  if (body.ok !== true) return null;
  if (typeof body.speech !== 'string' || !body.speech.trim()) return null;
  return body.speech;
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseVisualItems(bodyText: string): BensonVoiceItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];
  const rawItems = (parsed as { items?: unknown }).items;
  if (!Array.isArray(rawItems)) return [];
  const items: BensonVoiceItem[] = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const title = asTrimmedString(row.title);
    if (!title) continue;
    const timeRaw = row.time;
    const whenRaw = row.when;
    const reasonRaw = row.reason;
    const day =
      asTrimmedString(row.day) ||
      asTrimmedString(reasonRaw) ||
      asTrimmedString(whenRaw);
    const venue = asTrimmedString(row.venue) || asTrimmedString(row.area) || null;
    const time =
      typeof timeRaw === 'string' && timeRaw.trim()
        ? timeRaw.trim()
        : typeof whenRaw === 'string' && whenRaw.trim()
          ? whenRaw.trim()
          : null;
    const reason = asTrimmedString(reasonRaw) || null;
    items.push({
      title,
      day,
      time,
      venue,
      ...(reason ? { reason } : {}),
    });
  }
  return items;
}

export async function callBensonVoice(
  config: AlexaAdapterConfig,
  intent: CustomVoiceIntent,
  requestId: string,
  transport: HttpTransport = defaultFetchTransport(),
): Promise<BensonCallResult> {
  const path = INTENT_TO_PATH[intent];
  const url = `${config.voiceBaseUrl}${path}`;
  const headers = buildBensonHeaders(config, requestId);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.httpTimeoutMs);
  try {
    const { status, bodyText } = await transport({
      url,
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    if (status === 401 || status === 403 || status >= 500) {
      return { resultClass: 'unreachable', status, latencyMs, url, headers };
    }
    if (status < 200 || status >= 300) {
      return { resultClass: 'unreachable', status, latencyMs, url, headers };
    }
    const speech = parseSpeech(bodyText);
    if (!speech) {
      return { resultClass: 'benson_error', status, latencyMs, url, headers };
    }
    return {
      resultClass: 'ok',
      speech,
      items: parseVisualItems(bodyText),
      status,
      latencyMs,
      url,
      headers,
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    if (isTimeoutError(err)) {
      return { resultClass: 'timeout', latencyMs, url, headers };
    }
    return { resultClass: 'unreachable', latencyMs, url, headers };
  } finally {
    clearTimeout(timer);
  }
}
