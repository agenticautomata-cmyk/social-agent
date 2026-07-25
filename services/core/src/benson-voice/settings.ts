import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { voiceSettings } from '../schema.js';
import { resolveOperatorCreatorId } from '../tiktok-operator/resolve-creator.js';
import { DEFAULT_VOICE_SETTINGS, PLAYBACK_SPEEDS } from './constants.js';
import { hashSpeechInputs } from './hash.js';
import type { LongAnswerMode, PlaybackSpeed, VoiceMode, VoiceSettings } from './types.js';

function rowToSettings(row: typeof voiceSettings.$inferSelect): VoiceSettings {
  return {
    voiceMode: row.voiceMode as VoiceMode,
    voiceboxProfileId: row.voiceboxProfileId,
    autoPlay: row.autoPlay as VoiceSettings['autoPlay'],
    playbackSpeed: Number(row.playbackSpeed) as PlaybackSpeed,
    longAnswerMode: row.longAnswerMode as LongAnswerMode,
    fallbackEnabled: row.fallbackEnabled,
  };
}

export async function getVoiceSettings(creatorId?: string): Promise<VoiceSettings> {
  const cid = await resolveOperatorCreatorId(creatorId);
  const [row] = await db.select().from(voiceSettings).where(eq(voiceSettings.creatorId, cid)).limit(1);
  if (!row) {
    return {
      ...DEFAULT_VOICE_SETTINGS,
      voiceboxProfileId: null,
    };
  }
  return rowToSettings(row);
}

export async function upsertVoiceSettings(
  patch: Partial<VoiceSettings>,
  creatorId?: string,
): Promise<VoiceSettings> {
  const cid = await resolveOperatorCreatorId(creatorId);
  const current = await getVoiceSettings(cid);

  const next: VoiceSettings = {
    voiceMode: patch.voiceMode ?? current.voiceMode,
    voiceboxProfileId: patch.voiceboxProfileId ?? current.voiceboxProfileId,
    autoPlay: patch.autoPlay ?? current.autoPlay,
    playbackSpeed: patch.playbackSpeed ?? current.playbackSpeed,
    longAnswerMode: patch.longAnswerMode ?? current.longAnswerMode,
    fallbackEnabled: patch.fallbackEnabled ?? current.fallbackEnabled,
  };

  if (!PLAYBACK_SPEEDS.includes(next.playbackSpeed)) {
    next.playbackSpeed = 1.0;
  }

  await db
    .insert(voiceSettings)
    .values({
      creatorId: cid,
      voiceMode: next.voiceMode,
      voiceboxProfileId: next.voiceboxProfileId,
      autoPlay: next.autoPlay,
      playbackSpeed: String(next.playbackSpeed),
      longAnswerMode: next.longAnswerMode,
      fallbackEnabled: next.fallbackEnabled,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: voiceSettings.creatorId,
      set: {
        voiceMode: next.voiceMode,
        voiceboxProfileId: next.voiceboxProfileId,
        autoPlay: next.autoPlay,
        playbackSpeed: String(next.playbackSpeed),
        longAnswerMode: next.longAnswerMode,
        fallbackEnabled: next.fallbackEnabled,
        updatedAt: new Date(),
      },
    });

  const { emitDataChange } = await import('../data-revision/index.js');
  await emitDataChange({
    eventType: 'manual_update',
    domains: ['voice'],
    completedAt: new Date().toISOString(),
    source: 'voice-settings',
    success: true,
  });

  return next;
}

export { hashSpeechInputs } from './hash.js';
