import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { generatedVoiceAudio } from '../schema.js';
import { env } from '../env.js';
import { ALLOWED_AUDIO_MIME, VOICE_RETENTION_DAYS } from './constants.js';
import { ffmpegBin, probeMediaDurationSeconds } from '../intake/ffmpeg-utils.js';
import { spawn } from 'node:child_process';

function voiceStorageRoot(): string {
  return env.VOICE_AUDIO_STORAGE_DIR;
}

export function audioStoragePath(audioId: string, ext: string): string {
  const shard = audioId.slice(0, 2);
  return join(voiceStorageRoot(), shard, `${audioId}.${ext}`);
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegBin(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (b) => (stderr += b.toString()));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed: ${stderr.slice(-300)}`));
    });
  });
}

export type NormalizeResult = {
  path: string;
  format: string;
  sizeBytes: number;
  durationSeconds: number | null;
  originalPeakDb: number | null;
  normalizedPeakDb: number | null;
};

export async function normalizeAudioBuffer(
  input: Buffer,
  inputMime: string,
  audioId: string,
): Promise<NormalizeResult> {
  if (!ALLOWED_AUDIO_MIME.has(inputMime) && !inputMime.includes('wav')) {
    throw new Error('Unsupported audio format from Studio Voice');
  }

  const workDir = join(voiceStorageRoot(), '_work');
  await mkdir(workDir, { recursive: true });
  const rawPath = join(workDir, `${audioId}-raw.wav`);
  const outPath = audioStoragePath(audioId, 'mp3');

  await writeFile(rawPath, input);
  await ensureDir(outPath);

  await runFfmpeg([
    '-y',
    '-i',
    rawPath,
    '-af',
    'loudnorm=I=-16:TP=-1.5:LRA=11',
    '-codec:a',
    'libmp3lame',
    '-b:a',
    '128k',
    outPath,
  ]);

  await unlink(rawPath).catch(() => undefined);

  const fileStat = await stat(outPath);
  const durationSeconds = await probeMediaDurationSeconds(outPath);

  return {
    path: outPath,
    format: 'audio/mpeg',
    sizeBytes: fileStat.size,
    durationSeconds,
    originalPeakDb: null,
    normalizedPeakDb: -1.5,
  };
}

export async function findCachedAudio(input: {
  messageId: string;
  textHash: string;
  voiceProfile: string;
  engine: string;
  playbackSpeed: number;
  speechTransformVersion: number;
  chunkIndex: number;
}): Promise<typeof generatedVoiceAudio.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(generatedVoiceAudio)
    .where(
      and(
        eq(generatedVoiceAudio.messageId, input.messageId),
        eq(generatedVoiceAudio.textHash, input.textHash),
        eq(generatedVoiceAudio.voiceProfile, input.voiceProfile),
        eq(generatedVoiceAudio.engine, input.engine),
        eq(generatedVoiceAudio.playbackSpeed, String(input.playbackSpeed)),
        eq(generatedVoiceAudio.speechTransformVersion, input.speechTransformVersion),
        eq(generatedVoiceAudio.chunkIndex, input.chunkIndex),
        isNull(generatedVoiceAudio.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function saveGeneratedAudio(input: {
  messageId: string | null;
  creatorId: string;
  jobId: string;
  textHash: string;
  voiceProfile: string;
  engine: string;
  modelVersion: string | null;
  speechTransformVersion: number;
  playbackSpeed: number;
  chunkIndex: number;
  chunkTotal: number;
  normalize: NormalizeResult;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + VOICE_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(generatedVoiceAudio).values({
    id,
    messageId: input.messageId,
    creatorId: input.creatorId,
    jobId: input.jobId,
    textHash: input.textHash,
    voiceProfile: input.voiceProfile,
    engine: input.engine,
    modelVersion: input.modelVersion,
    speechTransformVersion: input.speechTransformVersion,
    playbackSpeed: String(input.playbackSpeed),
    durationSeconds: input.normalize.durationSeconds != null ? String(input.normalize.durationSeconds) : null,
    fileFormat: input.normalize.format,
    fileSizeBytes: input.normalize.sizeBytes,
    storagePath: input.normalize.path,
    originalPeakDb: input.normalize.originalPeakDb != null ? String(input.normalize.originalPeakDb) : null,
    normalizedPeakDb: input.normalize.normalizedPeakDb != null ? String(input.normalize.normalizedPeakDb) : null,
    chunkIndex: input.chunkIndex,
    chunkTotal: input.chunkTotal,
    generationMetadata: input.metadata ?? {},
    expiresAt,
  });

  return id;
}

export async function loadAudioFile(
  audioId: string,
  creatorId: string,
): Promise<{ buffer: Buffer; format: string; durationSeconds: number | null } | null> {
  const [row] = await db
    .select()
    .from(generatedVoiceAudio)
    .where(and(eq(generatedVoiceAudio.id, audioId), eq(generatedVoiceAudio.creatorId, creatorId), isNull(generatedVoiceAudio.deletedAt)))
    .limit(1);
  if (!row) return null;

  try {
    const buffer = await readFile(row.storagePath);
    await db
      .update(generatedVoiceAudio)
      .set({ lastPlayedAt: new Date() })
      .where(eq(generatedVoiceAudio.id, audioId));
    return {
      buffer,
      format: row.fileFormat,
      durationSeconds: row.durationSeconds != null ? Number(row.durationSeconds) : null,
    };
  } catch {
    return null;
  }
}

export async function deleteGeneratedAudio(audioId: string, creatorId: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(generatedVoiceAudio)
    .where(and(eq(generatedVoiceAudio.id, audioId), eq(generatedVoiceAudio.creatorId, creatorId), isNull(generatedVoiceAudio.deletedAt)))
    .limit(1);
  if (!row) return false;

  await db
    .update(generatedVoiceAudio)
    .set({ deletedAt: new Date() })
    .where(eq(generatedVoiceAudio.id, audioId));

  await unlink(row.storagePath).catch(() => undefined);
  return true;
}

export async function cleanupExpiredAudio(): Promise<number> {
  const now = new Date();
  const expired = await db
    .select()
    .from(generatedVoiceAudio)
    .where(and(lt(generatedVoiceAudio.expiresAt, now), isNull(generatedVoiceAudio.deletedAt)))
    .limit(200);

  for (const row of expired) {
    await deleteGeneratedAudio(row.id, row.creatorId);
  }
  return expired.length;
}

export async function totalStorageBytes(): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${generatedVoiceAudio.fileSizeBytes}), 0)` })
    .from(generatedVoiceAudio)
    .where(isNull(generatedVoiceAudio.deletedAt));
  return Number(row?.total ?? 0);
}
