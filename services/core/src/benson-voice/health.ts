import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { voiceServiceHealth } from '../schema.js';
import {
  DEFAULT_PROFILE_NAME,
  DEFAULT_VOICE_ENGINE,
  SPEECH_TRANSFORM_VERSION,
  VOICEBOX_UPSTREAM_COMMIT,
  VOICEBOX_UPSTREAM_TAG,
  sanitizeVoiceError,
} from './constants.js';
import { resolveStudioVoiceTarget } from './resolve-profile.js';
import {
  countQueuedJobs,
  claimNextQueuedJob,
  shouldRetryJob,
  updateJobStatus,
} from './jobs.js';
import { getVoiceSettings } from './settings.js';
import { normalizeAudioBuffer, saveGeneratedAudio, totalStorageBytes } from './storage.js';
import { voiceboxClient } from './voicebox-client.js';
import type { VoiceServiceHealthSnapshot } from './types.js';

const generationDurations: number[] = [];

export async function refreshVoiceHealth(): Promise<VoiceServiceHealthSnapshot> {
  const health = await voiceboxClient.health();
  const queueDepth = await countQueuedJobs();
  const storageBytes = await totalStorageBytes();

  let serviceStatus: VoiceServiceHealthSnapshot['serviceStatus'] = 'unavailable';
  let modelStatus: VoiceServiceHealthSnapshot['modelStatus'] = 'not_installed';

  if (health.ok || health.status === 'ok' || health.status === 'healthy') {
    serviceStatus = queueDepth > 5 ? 'degraded' : 'healthy';
    modelStatus = 'ready';
  } else if (health.status === 'starting') {
    serviceStatus = 'warming';
    modelStatus = 'loading';
  }

  const avg =
    generationDurations.length > 0
      ? Math.round(generationDurations.reduce((a, b) => a + b, 0) / generationDurations.length)
      : null;

  await db
    .insert(voiceServiceHealth)
    .values({
      id: 'default',
      serviceStatus,
      modelStatus,
      queueStatus: queueDepth > 8 ? 'blocked' : queueDepth > 3 ? 'delayed' : 'healthy',
      activeEngine: DEFAULT_VOICE_ENGINE,
      modelVersion: DEFAULT_VOICE_ENGINE,
      voiceboxUpstreamTag: VOICEBOX_UPSTREAM_TAG,
      voiceboxUpstreamCommit: VOICEBOX_UPSTREAM_COMMIT,
      lastHeartbeat: new Date(),
      averageGenerationMs: avg,
      currentQueueDepth: queueDepth,
      storageBytes,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: voiceServiceHealth.id,
      set: {
        serviceStatus,
        modelStatus,
        queueStatus: queueDepth > 8 ? 'blocked' : queueDepth > 3 ? 'delayed' : 'healthy',
        activeEngine: DEFAULT_VOICE_ENGINE,
        modelVersion: DEFAULT_VOICE_ENGINE,
        lastHeartbeat: new Date(),
        averageGenerationMs: avg,
        currentQueueDepth: queueDepth,
        storageBytes,
        updatedAt: new Date(),
      },
    });

  return getVoiceServiceHealth();
}

export async function getVoiceServiceHealth(): Promise<VoiceServiceHealthSnapshot> {
  const [row] = await db.select().from(voiceServiceHealth).where(eq(voiceServiceHealth.id, 'default')).limit(1);
  if (!row) {
    return {
      serviceStatus: 'unavailable',
      modelStatus: 'not_installed',
      queueStatus: 'healthy',
      activeEngine: DEFAULT_VOICE_ENGINE,
      modelVersion: null,
      voiceboxProfileId: null,
      voiceboxUpstreamTag: VOICEBOX_UPSTREAM_TAG,
      voiceboxUpstreamCommit: VOICEBOX_UPSTREAM_COMMIT,
      lastHeartbeat: null,
      lastSuccessfulGeneration: null,
      lastFailedGeneration: null,
      averageGenerationMs: null,
      currentQueueDepth: 0,
      sanitizedLatestError: null,
      generationPaused: false,
      storageBytes: 0,
    };
  }

  return {
    serviceStatus: row.serviceStatus as VoiceServiceHealthSnapshot['serviceStatus'],
    modelStatus: row.modelStatus as VoiceServiceHealthSnapshot['modelStatus'],
    queueStatus: row.queueStatus as VoiceServiceHealthSnapshot['queueStatus'],
    activeEngine: row.activeEngine,
    modelVersion: row.modelVersion,
    voiceboxProfileId: row.voiceboxProfileId,
    voiceboxUpstreamTag: row.voiceboxUpstreamTag,
    voiceboxUpstreamCommit: row.voiceboxUpstreamCommit,
    lastHeartbeat: row.lastHeartbeat?.toISOString() ?? null,
    lastSuccessfulGeneration: row.lastSuccessfulGeneration?.toISOString() ?? null,
    lastFailedGeneration: row.lastFailedGeneration?.toISOString() ?? null,
    averageGenerationMs: row.averageGenerationMs,
    currentQueueDepth: row.currentQueueDepth,
    sanitizedLatestError: row.sanitizedLatestError,
    generationPaused: row.generationPaused,
    storageBytes: Number(row.storageBytes ?? 0),
  };
}

export async function isStudioVoiceAvailable(): Promise<boolean> {
  const health = await getVoiceServiceHealth();
  if (health.generationPaused) return false;
  const live = await voiceboxClient.health();
  return Boolean(live.ok || live.status === 'ok' || live.status === 'healthy');
}

export async function setGenerationPaused(paused: boolean): Promise<void> {
  await db
    .update(voiceServiceHealth)
    .set({ generationPaused: paused, updatedAt: new Date() })
    .where(eq(voiceServiceHealth.id, 'default'));
}

async function recordSuccess(durationMs: number): Promise<void> {
  generationDurations.push(durationMs);
  if (generationDurations.length > 50) generationDurations.shift();
  await db
    .update(voiceServiceHealth)
    .set({
      lastSuccessfulGeneration: new Date(),
      sanitizedLatestError: null,
      updatedAt: new Date(),
    })
    .where(eq(voiceServiceHealth.id, 'default'));
}

async function recordFailure(message: string): Promise<void> {
  await db
    .update(voiceServiceHealth)
    .set({
      lastFailedGeneration: new Date(),
      sanitizedLatestError: message,
      updatedAt: new Date(),
    })
    .where(eq(voiceServiceHealth.id, 'default'));
}

export async function processNextVoiceJob(): Promise<boolean> {
  const health = await getVoiceServiceHealth();
  if (health.generationPaused) return false;

  const job = await claimNextQueuedJob();
  if (!job) return false;

  const started = Date.now();
  try {
    await updateJobStatus(job.id, 'generating');
    const generation = await voiceboxClient.speak(job.spokenText, job.voiceProfile, job.engine);
    await updateJobStatus(job.id, 'generating', { voiceboxGenerationId: generation.id });
    await voiceboxClient.waitForCompletion(generation.id);
    const audio = await voiceboxClient.fetchAudio(generation.id);

    await updateJobStatus(job.id, 'normalizing');
    const normalized = await normalizeAudioBuffer(audio.buffer, audio.contentType, job.id);
    const audioId = await saveGeneratedAudio({
      messageId: job.messageId,
      creatorId: job.creatorId,
      jobId: job.id,
      textHash: job.textHash,
      voiceProfile: job.voiceProfile,
      engine: job.engine,
      modelVersion: DEFAULT_VOICE_ENGINE,
      speechTransformVersion: SPEECH_TRANSFORM_VERSION,
      playbackSpeed: Number(job.playbackSpeed),
      chunkIndex: job.chunkIndex,
      chunkTotal: job.chunkTotal,
      normalize: normalized,
      metadata: { voiceboxGenerationId: generation.id },
    });

    await updateJobStatus(job.id, 'complete', {
      generatedAudioId: audioId,
      durationSeconds: normalized.durationSeconds,
      modelVersion: DEFAULT_VOICE_ENGINE,
      voiceboxGenerationId: generation.id,
    });

    await recordSuccess(Date.now() - started);

    const { emitDataChange } = await import('../data-revision/index.js');
    await emitDataChange({
      eventType: 'manual_update',
      domains: ['voice'],
      completedAt: new Date().toISOString(),
      source: 'voice-generation',
      recordIds: [job.id, audioId],
      success: true,
      metadata: { messageId: job.messageId, status: 'complete' },
    });

    return true;
  } catch (err) {
    const message = sanitizeVoiceError(err);
    const retry = await shouldRetryJob(job.retryCount);
    if (retry) {
      await updateJobStatus(job.id, 'queued', {
        sanitizedError: message,
        retryCount: job.retryCount + 1,
      });
    } else {
      await updateJobStatus(job.id, 'failed', { sanitizedError: message, retryCount: job.retryCount });
      await recordFailure(message);

      const { emitDataChange } = await import('../data-revision/index.js');
      await emitDataChange({
        eventType: 'manual_update',
        domains: ['voice'],
        completedAt: new Date().toISOString(),
        source: 'voice-generation',
        recordIds: [job.id],
        success: false,
        metadata: { messageId: job.messageId, status: 'failed', error: message },
      });
    }
    return true;
  } finally {
    await refreshVoiceHealth();
  }
}

export async function kickVoiceQueue(): Promise<void> {
  await processNextVoiceJob();
}

let processorTimer: ReturnType<typeof setInterval> | null = null;

export function startVoiceQueueProcessor(intervalMs = 750): void {
  if (processorTimer) return;
  processorTimer = setInterval(() => {
    void processNextVoiceJob().catch((err) => {
      console.warn('[benson-voice] queue tick failed:', err instanceof Error ? err.message : err);
    });
  }, intervalMs);
  void refreshVoiceHealth().catch((err) => {
    console.warn('[benson-voice] health refresh failed:', err instanceof Error ? err.message : err);
  });
  void prewarmVoiceModel().catch((err) => {
    console.warn('[benson-voice] prewarm failed:', err instanceof Error ? err.message : err);
  });
}

export function stopVoiceQueueProcessor(): void {
  if (processorTimer) {
    clearInterval(processorTimer);
    processorTimer = null;
  }
}

export async function runVoiceHealthCheck(): Promise<VoiceServiceHealthSnapshot> {
  await voiceboxClient.health();
  return refreshVoiceHealth();
}

export async function prewarmVoiceModel(creatorId?: string): Promise<void> {
  try {
    const settings = await getVoiceSettings(creatorId);
    if (settings.voiceMode !== 'studio') return;
    const { profile, engine } = resolveStudioVoiceTarget(settings);
    await voiceboxClient.prewarm(profile, engine);
    await refreshVoiceHealth();
  } catch (err) {
    console.warn(
      '[benson-voice] prewarm skipped:',
      err instanceof Error ? err.message : err,
    );
  }
}

export async function runVoiceTestPhrase(phrase = 'Benson Studio Voice test.'): Promise<{
  ok: boolean;
  durationMs: number;
  error?: string;
}> {
  const started = Date.now();
  try {
    const gen = await voiceboxClient.speak(phrase);
    await voiceboxClient.waitForCompletion(gen.id);
    await voiceboxClient.fetchAudio(gen.id);
    return { ok: true, durationMs: Date.now() - started };
  } catch (err) {
    return { ok: false, durationMs: Date.now() - started, error: sanitizeVoiceError(err) };
  }
}
