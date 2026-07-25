import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { bensonChatMessages } from '../schema.js';
import { resolveOperatorCreatorId } from '../tiktok-operator/resolve-creator.js';
import { chunkSpeechText } from './chunk-text.js';
import {
  DEFAULT_PROFILE_NAME,
  DEFAULT_VOICE_ENGINE,
  SPEECH_TRANSFORM_VERSION,
  VOICE_MAX_TEXT_CHARS,
  sanitizeVoiceError,
} from './constants.js';
import {
  countQueuedJobs,
  enqueueVoiceJobs,
  listJobsForMessage,
} from './jobs.js';
import { getVoiceSettings, hashSpeechInputs } from './settings.js';
import { isLongAnswer, transformAnswerToSpeechText } from './speech-text.js';
import { findCachedAudio } from './storage.js';
import { refreshVoiceHealth, isStudioVoiceAvailable } from './health.js';
import type { LongAnswerMode, VoiceGenerateRequest, VoiceGenerateResponse } from './types.js';

export async function requestVoiceGeneration(
  input: VoiceGenerateRequest,
  creatorId?: string,
): Promise<VoiceGenerateResponse> {
  const cid = await resolveOperatorCreatorId(creatorId);
  const settings = await getVoiceSettings(cid);

  if (settings.voiceMode === 'text_only') {
    return {
      ok: true,
      jobs: [],
      cached: false,
      audioIds: [],
      spokenText: '',
      studioAvailable: false,
      fallbackRecommended: false,
      statusMessage: 'Text only mode',
    };
  }

  if (settings.voiceMode === 'device') {
    return {
      ok: true,
      jobs: [],
      cached: false,
      audioIds: [],
      spokenText: transformAnswerToSpeechText(input.answerText),
      studioAvailable: false,
      fallbackRecommended: true,
      statusMessage: 'Using device voice',
    };
  }

  const [message] = await db
    .select()
    .from(bensonChatMessages)
    .where(eq(bensonChatMessages.id, input.messageId))
    .limit(1);

  if (!message || message.creatorId !== cid) {
    throw new Error('Message not found');
  }

  const longMode = input.longAnswerOverride ?? settings.longAnswerMode;
  let speechMode: 'full' | 'summary' = 'full';
  if (isLongAnswer(input.answerText)) {
    if (longMode === 'summary') speechMode = 'summary';
    if (longMode === 'ask' && !input.regenerate) {
      return {
        ok: true,
        jobs: [],
        cached: false,
        audioIds: [],
        spokenText: transformAnswerToSpeechText(input.answerText, 'summary'),
        studioAvailable: await isStudioVoiceAvailable(),
        fallbackRecommended: false,
        statusMessage: 'Long answer — confirm to generate full audio',
        needsConfirmation: true,
      };
    }
  }

  const spokenText = transformAnswerToSpeechText(input.answerText, speechMode);
  if (!spokenText.trim()) {
    throw new Error('Nothing to speak');
  }
  if (spokenText.length > VOICE_MAX_TEXT_CHARS) {
    throw new Error('Answer is too long for Studio Voice');
  }

  const playbackSpeed = input.playbackSpeed ?? settings.playbackSpeed;
  const voiceProfile = settings.voiceboxProfileId ?? DEFAULT_PROFILE_NAME;
  const engine = DEFAULT_VOICE_ENGINE;
  const textHash = hashSpeechInputs({
    spokenText,
    voiceProfile,
    engine,
    playbackSpeed,
    speechTransformVersion: SPEECH_TRANSFORM_VERSION,
  });

  const chunks = chunkSpeechText(spokenText);
  const studioAvailable = await isStudioVoiceAvailable();

  if (!studioAvailable) {
    return {
      ok: true,
      jobs: [],
      cached: false,
      audioIds: [],
      spokenText,
      studioAvailable: false,
      fallbackRecommended: settings.fallbackEnabled,
      statusMessage: "Benson's Studio Voice is temporarily unavailable. Device voice is ready.",
    };
  }

  const cachedAudioIds: string[] = [];
  if (!input.regenerate) {
    for (let i = 0; i < chunks.length; i++) {
      const cached = await findCachedAudio({
        messageId: input.messageId,
        textHash,
        voiceProfile,
        engine,
        playbackSpeed,
        speechTransformVersion: SPEECH_TRANSFORM_VERSION,
        chunkIndex: i,
      });
      if (cached) cachedAudioIds.push(cached.id);
    }
    if (cachedAudioIds.length === chunks.length) {
      return {
        ok: true,
        jobs: await listJobsForMessage(input.messageId),
        cached: true,
        audioIds: cachedAudioIds,
        spokenText,
        studioAvailable: true,
        fallbackRecommended: false,
        statusMessage: 'Ready to play',
      };
    }
  }

  const jobs = await enqueueVoiceJobs({
    messageId: input.messageId,
    creatorId: cid,
    chunks,
    textHash,
    voiceProfile,
    engine,
    playbackSpeed,
  });

  await refreshVoiceHealth();

  const queueDepth = await countQueuedJobs();
  return {
    ok: true,
    jobs,
    cached: false,
    audioIds: cachedAudioIds,
    spokenText,
    studioAvailable: true,
    fallbackRecommended: false,
    statusMessage: queueDepth > 2 ? 'Preparing Benson’s voice… (queue delayed)' : 'Preparing Benson’s voice…',
  };
}

export function resolveLongAnswerMode(mode: string | undefined): LongAnswerMode | undefined {
  if (mode === 'full' || mode === 'summary' || mode === 'ask') return mode;
  return undefined;
}

export function userFacingVoiceError(err: unknown): string {
  return sanitizeVoiceError(err);
}
