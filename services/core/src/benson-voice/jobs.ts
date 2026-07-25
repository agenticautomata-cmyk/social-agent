import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { voiceGenerationJobs } from '../schema.js';
import {
  DEFAULT_PROFILE_NAME,
  DEFAULT_VOICE_ENGINE,
  SPEECH_TRANSFORM_VERSION,
  VOICE_MAX_CONCURRENT,
  VOICE_MAX_RETRIES,
} from './constants.js';
import type { VoiceGenerationJob, VoiceJobStatus } from './types.js';

function rowToJob(row: typeof voiceGenerationJobs.$inferSelect): VoiceGenerationJob {
  return {
    id: row.id,
    requestId: row.requestId,
    messageId: row.messageId,
    creatorId: row.creatorId,
    voiceProfile: row.voiceProfile,
    engine: row.engine,
    textHash: row.textHash,
    spokenText: row.spokenText,
    speechTransformVersion: row.speechTransformVersion,
    playbackSpeed: Number(row.playbackSpeed),
    status: row.status as VoiceJobStatus,
    queueTimestamp: row.queueTimestamp.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    retryCount: row.retryCount,
    sanitizedError: row.sanitizedError,
    generatedAudioId: row.generatedAudioId,
    durationSeconds: row.durationSeconds != null ? Number(row.durationSeconds) : null,
    modelVersion: row.modelVersion,
    chunkIndex: row.chunkIndex,
    chunkTotal: row.chunkTotal,
    voiceboxGenerationId: row.voiceboxGenerationId,
  };
}

export async function getVoiceJob(jobId: string): Promise<VoiceGenerationJob | null> {
  const [row] = await db.select().from(voiceGenerationJobs).where(eq(voiceGenerationJobs.id, jobId)).limit(1);
  return row ? rowToJob(row) : null;
}

export async function listJobsForMessage(messageId: string): Promise<VoiceGenerationJob[]> {
  const rows = await db
    .select()
    .from(voiceGenerationJobs)
    .where(eq(voiceGenerationJobs.messageId, messageId))
    .orderBy(voiceGenerationJobs.chunkIndex);
  return rows.map(rowToJob);
}

export async function countActiveJobs(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(voiceGenerationJobs)
    .where(inArray(voiceGenerationJobs.status, ['preparing', 'generating', 'normalizing']));
  return Number(row?.count ?? 0);
}

export async function countQueuedJobs(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(voiceGenerationJobs)
    .where(eq(voiceGenerationJobs.status, 'queued'));
  return Number(row?.count ?? 0);
}

export async function enqueueVoiceJobs(input: {
  messageId: string;
  creatorId: string;
  chunks: string[];
  textHash: string;
  voiceProfile?: string;
  engine?: string;
  playbackSpeed: number;
}): Promise<VoiceGenerationJob[]> {
  const requestId = randomUUID();
  const voiceProfile = input.voiceProfile ?? DEFAULT_PROFILE_NAME;
  const engine = input.engine ?? DEFAULT_VOICE_ENGINE;
  const chunkTotal = input.chunks.length;
  const jobs: VoiceGenerationJob[] = [];

  for (let i = 0; i < input.chunks.length; i++) {
    const spokenText = input.chunks[i]!;
    const [existing] = await db
      .select()
      .from(voiceGenerationJobs)
      .where(
        and(
          eq(voiceGenerationJobs.messageId, input.messageId),
          eq(voiceGenerationJobs.textHash, input.textHash),
          eq(voiceGenerationJobs.voiceProfile, voiceProfile),
          eq(voiceGenerationJobs.engine, engine),
          eq(voiceGenerationJobs.playbackSpeed, String(input.playbackSpeed)),
          eq(voiceGenerationJobs.speechTransformVersion, SPEECH_TRANSFORM_VERSION),
          eq(voiceGenerationJobs.chunkIndex, i),
          inArray(voiceGenerationJobs.status, ['queued', 'preparing', 'generating', 'normalizing', 'complete']),
        ),
      )
      .limit(1);

    if (existing) {
      jobs.push(rowToJob(existing));
      continue;
    }

    const [row] = await db
      .insert(voiceGenerationJobs)
      .values({
        requestId,
        messageId: input.messageId,
        creatorId: input.creatorId,
        voiceProfile,
        engine,
        textHash: input.textHash,
        spokenText,
        speechTransformVersion: SPEECH_TRANSFORM_VERSION,
        playbackSpeed: String(input.playbackSpeed),
        status: 'queued',
        chunkIndex: i,
        chunkTotal,
      })
      .returning();

    jobs.push(rowToJob(row!));
  }

  return jobs;
}

export async function claimNextQueuedJob(): Promise<typeof voiceGenerationJobs.$inferSelect | null> {
  const active = await countActiveJobs();
  if (active >= VOICE_MAX_CONCURRENT) return null;

  const [row] = await db
    .select()
    .from(voiceGenerationJobs)
    .where(eq(voiceGenerationJobs.status, 'queued'))
    .orderBy(voiceGenerationJobs.queueTimestamp, voiceGenerationJobs.chunkIndex)
    .limit(1);

  if (!row) return null;

  const [updated] = await db
    .update(voiceGenerationJobs)
    .set({ status: 'preparing', startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(voiceGenerationJobs.id, row.id), eq(voiceGenerationJobs.status, 'queued')))
    .returning();

  return updated ?? null;
}

export async function updateJobStatus(
  jobId: string,
  status: VoiceJobStatus,
  patch: Partial<{
    sanitizedError: string | null;
    generatedAudioId: string | null;
    durationSeconds: number | null;
    modelVersion: string | null;
    voiceboxGenerationId: string | null;
    retryCount: number;
  }> = {},
): Promise<void> {
  await db
    .update(voiceGenerationJobs)
    .set({
      status,
      sanitizedError: patch.sanitizedError,
      generatedAudioId: patch.generatedAudioId,
      durationSeconds: patch.durationSeconds != null ? String(patch.durationSeconds) : undefined,
      modelVersion: patch.modelVersion,
      voiceboxGenerationId: patch.voiceboxGenerationId,
      retryCount: patch.retryCount,
      completedAt: status === 'complete' ? new Date() : undefined,
      failedAt: status === 'failed' ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(voiceGenerationJobs.id, jobId));
}

export async function cancelJob(jobId: string): Promise<boolean> {
  const [row] = await db
    .update(voiceGenerationJobs)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(eq(voiceGenerationJobs.id, jobId), inArray(voiceGenerationJobs.status, ['queued', 'preparing'])))
    .returning();
  return Boolean(row);
}

export async function clearFailedJobs(): Promise<number> {
  const rows = await db
    .update(voiceGenerationJobs)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(eq(voiceGenerationJobs.status, 'failed'))
    .returning();
  return rows.length;
}

export async function retryJob(jobId: string): Promise<boolean> {
  const [row] = await db
    .update(voiceGenerationJobs)
    .set({
      status: 'queued',
      sanitizedError: null,
      failedAt: null,
      retryCount: sql`${voiceGenerationJobs.retryCount} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(voiceGenerationJobs.id, jobId), eq(voiceGenerationJobs.status, 'failed')))
    .returning();
  return Boolean(row);
}

export async function recentFailedJobs(limit = 20): Promise<VoiceGenerationJob[]> {
  const rows = await db
    .select()
    .from(voiceGenerationJobs)
    .where(eq(voiceGenerationJobs.status, 'failed'))
    .orderBy(desc(voiceGenerationJobs.failedAt))
    .limit(limit);
  return rows.map(rowToJob);
}

export async function shouldRetryJob(retryCount: number): Promise<boolean> {
  return retryCount < VOICE_MAX_RETRIES;
}
