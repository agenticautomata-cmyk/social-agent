import { Hono } from 'hono';
import { z } from 'zod';
import {
  cancelJob,
  cleanupExpiredAudio,
  clearFailedJobs,
  deleteGeneratedAudio,
  getVoiceJob,
  getVoiceServiceHealth,
  getVoiceSettings,
  listJobsForMessage,
  loadAudioFile,
  prewarmVoiceModel,
  requestVoiceGeneration,
  resolveLongAnswerMode,
  retryJob,
  runVoiceHealthCheck,
  runVoiceTestPhrase,
  setGenerationPaused,
  upsertVoiceSettings,
  userFacingVoiceError,
  voiceboxPin,
  VOICE_RATE_LIMIT_PER_MINUTE,
  PLAYBACK_SPEEDS,
} from '@social-agent/core/benson-voice';

export const voiceRoute = new Hono();

const rateWindow = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateWindow.get(key);
  if (!entry || now > entry.resetAt) {
    rateWindow.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= VOICE_RATE_LIMIT_PER_MINUTE) return false;
  entry.count += 1;
  return true;
}

voiceRoute.get('/settings', async (c) => {
  const settings = await getVoiceSettings();
  return c.json({ ok: true, settings });
});

voiceRoute.post('/prewarm', async (c) => {
  void prewarmVoiceModel();
  return c.json({ ok: true });
});

const SettingsPatchSchema = z.object({
  voiceMode: z.enum(['studio', 'device', 'text_only']).optional(),
  voiceboxProfileId: z
    .union([z.literal('Benson Custom'), z.literal('benson_custom_v1'), z.null()])
    .optional(),
  autoPlay: z.enum(['off', 'short_only', 'all']).optional(),
  playbackSpeed: z.union([z.literal(0.75), z.literal(1.0), z.literal(1.25), z.literal(1.5)]).optional(),
  longAnswerMode: z.enum(['full', 'summary', 'ask']).optional(),
  fallbackEnabled: z.boolean().optional(),
});

voiceRoute.patch('/settings', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = SettingsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'Invalid voice settings' }, 400);
  }
  const settings = await upsertVoiceSettings(parsed.data);
  return c.json({ ok: true, settings });
});

const GenerateSchema = z.object({
  messageId: z.string().uuid(),
  answerText: z.string().min(1).max(20_000),
  regenerate: z.boolean().optional(),
  playbackSpeed: z.union([z.literal(0.75), z.literal(1.0), z.literal(1.25), z.literal(1.5)]).optional(),
  longAnswerOverride: z.enum(['full', 'summary', 'ask']).optional(),
  confirmLong: z.boolean().optional(),
  preferFastVoice: z.boolean().optional(),
});

voiceRoute.post('/generate', async (c) => {
  if (!checkRateLimit('voice-generate')) {
    return c.json({ ok: false, error: 'Too many voice requests — try again shortly.' }, 429);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = GenerateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'messageId and answerText are required' }, 400);
  }

  try {
    let longAnswerOverride = resolveLongAnswerMode(parsed.data.longAnswerOverride);
    if (parsed.data.confirmLong) longAnswerOverride = 'full';

    const result = await requestVoiceGeneration({
      messageId: parsed.data.messageId,
      answerText: parsed.data.answerText,
      regenerate: parsed.data.regenerate,
      playbackSpeed: parsed.data.playbackSpeed,
      longAnswerOverride,
      preferFastVoice: parsed.data.preferFastVoice,
    });
    return c.json(result);
  } catch (err) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'VOICE_GENERATION_FAILED',
          message: userFacingVoiceError(err),
        },
      },
      400,
    );
  }
});

voiceRoute.get('/jobs/:id', async (c) => {
  const job = await getVoiceJob(c.req.param('id'));
  if (!job) return c.json({ ok: false, error: 'Job not found' }, 404);
  return c.json({ ok: true, job });
});

voiceRoute.get('/messages/:messageId/jobs', async (c) => {
  const jobs = await listJobsForMessage(c.req.param('messageId'));
  return c.json({ ok: true, jobs });
});

voiceRoute.post('/jobs/:id/cancel', async (c) => {
  const ok = await cancelJob(c.req.param('id'));
  return c.json({ ok });
});

voiceRoute.get('/audio/:id', async (c) => {
  const audioId = c.req.param('id');
  if (!/^[0-9a-f-]{36}$/i.test(audioId)) {
    return c.json({ ok: false, error: 'Invalid audio id' }, 400);
  }

  const { resolveOperatorCreatorId } = await import('@social-agent/core/tiktok-operator');
  const creatorId = await resolveOperatorCreatorId();
  const file = await loadAudioFile(audioId, creatorId);
  if (!file) return c.json({ ok: false, error: 'Audio not found' }, 404);

  const range = c.req.header('range');
  const total = file.buffer.length;

  if (range?.startsWith('bytes=')) {
    const match = range.match(/bytes=(\d+)-(\d+)?/);
    if (match) {
      const start = Number.parseInt(match[1]!, 10);
      const end = match[2] ? Number.parseInt(match[2], 10) : total - 1;
      if (start >= 0 && end < total && start <= end) {
        const chunk = file.buffer.subarray(start, end + 1);
        return new Response(chunk, {
          status: 206,
          headers: {
            'Content-Type': file.format,
            'Content-Length': String(chunk.length),
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'private, max-age=3600',
          },
        });
      }
    }
  }

  return new Response(file.buffer, {
    headers: {
      'Content-Type': file.format,
      'Content-Length': String(total),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

voiceRoute.delete('/audio/:id', async (c) => {
  const audioId = c.req.param('id');
  const { resolveOperatorCreatorId } = await import('@social-agent/core/tiktok-operator');
  const creatorId = await resolveOperatorCreatorId();
  const ok = await deleteGeneratedAudio(audioId, creatorId);
  if (!ok) return c.json({ ok: false, error: 'Audio not found' }, 404);

  const { emitDataChange } = await import('@social-agent/core/data-revision');
  await emitDataChange({
    eventType: 'manual_update',
    domains: ['voice'],
    completedAt: new Date().toISOString(),
    source: 'voice-audio-delete',
    recordIds: [audioId],
    success: true,
  });

  return c.json({ ok: true });
});

voiceRoute.get('/admin/health', async (c) => {
  const health = await getVoiceServiceHealth();
  return c.json({
    ok: true,
    health,
    pin: voiceboxPin,
    playbackSpeeds: PLAYBACK_SPEEDS,
  });
});

voiceRoute.post('/admin/health-check', async (c) => {
  const health = await runVoiceHealthCheck();
  return c.json({ ok: true, health });
});

voiceRoute.post('/admin/prewarm', async (c) => {
  await prewarmVoiceModel();
  const health = await getVoiceServiceHealth();
  return c.json({ ok: true, health });
});

voiceRoute.post('/admin/test-phrase', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const phrase = typeof body.phrase === 'string' ? body.phrase : 'Benson Studio Voice test.';
  const result = await runVoiceTestPhrase(phrase);
  return c.json({ ...result });
});

voiceRoute.post('/admin/clear-failed', async (c) => {
  const cleared = await clearFailedJobs();
  return c.json({ ok: true, cleared });
});

voiceRoute.post('/admin/jobs/:id/retry', async (c) => {
  const ok = await retryJob(c.req.param('id'));
  return c.json({ ok });
});

voiceRoute.post('/admin/pause', async (c) => {
  await setGenerationPaused(true);
  return c.json({ ok: true, paused: true });
});

voiceRoute.post('/admin/resume', async (c) => {
  await setGenerationPaused(false);
  return c.json({ ok: true, paused: false });
});

voiceRoute.post('/admin/cleanup', async (c) => {
  const removed = await cleanupExpiredAudio();
  return c.json({ ok: true, removed });
});
