import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  isBensonVoiceAuthorized,
  loadWeekendCalendarVoice,
  loadWeekendListVoice,
  loadWhatShouldKelliePostVoice,
  voiceUnauthorizedMessage,
} from '@social-agent/core/benson-voice-read';
import { logStructured } from '@social-agent/core/structured-log';
import { structuredError } from '../lib/structured-error.js';

export const bensonVoiceRoute = new Hono();

function voiceRequestId(c: Context): string | undefined {
  const header = c.req.header('x-benson-request-id')?.trim();
  return header || undefined;
}

bensonVoiceRoute.use('*', async (c, next) => {
  const requestId = voiceRequestId(c);
  if (requestId) c.header('x-benson-request-id', requestId);
  if (!isBensonVoiceAuthorized(c.req.header('authorization'))) {
    return structuredError(c, 'VOICE_UNAUTHORIZED', voiceUnauthorizedMessage(), 401);
  }
  await next();
});

async function voiceRead(
  c: Context,
  operation: 'weekend_calendar' | 'weekend_list' | 'what_should_kellie_post',
  loader: () => Promise<{ count: number } & Record<string, unknown>>,
): Promise<Response> {
  const started = Date.now();
  const requestId = voiceRequestId(c);
  try {
    const result = await loader();
    const latencyMs = Date.now() - started;
    logStructured({
      level: 'info',
      service: 'benson-voice-read',
      message: 'voice_read',
      requestId,
      operation,
      latencyMs,
      success: true,
      status: 200,
      count: result.count,
    });
    return c.json({ ok: true, requestId, ...result });
  } catch (err) {
    const latencyMs = Date.now() - started;
    logStructured({
      level: 'error',
      service: 'benson-voice-read',
      message: 'voice_read_failed',
      requestId,
      operation,
      latencyMs,
      success: false,
      status: 500,
      count: 0,
    });
    return structuredError(
      c,
      'VOICE_READ_FAILED',
      err instanceof Error ? err.message : 'Voice read failed',
      500,
    );
  }
}

bensonVoiceRoute.get('/weekend-calendar', (c) =>
  voiceRead(c, 'weekend_calendar', () => loadWeekendCalendarVoice()),
);

bensonVoiceRoute.get('/weekend-list', (c) =>
  voiceRead(c, 'weekend_list', () => loadWeekendListVoice()),
);

bensonVoiceRoute.get('/what-should-kellie-post', (c) =>
  voiceRead(c, 'what_should_kellie_post', () => loadWhatShouldKelliePostVoice()),
);
