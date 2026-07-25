import voiceboxPin from './voicebox-pin.json' with { type: 'json' };

export const SPEECH_TRANSFORM_VERSION = voiceboxPin.speechTransformVersion;
export const VOICEBOX_UPSTREAM_TAG = voiceboxPin.upstreamTag;
export const VOICEBOX_UPSTREAM_COMMIT = voiceboxPin.upstreamCommit;
export const DEFAULT_VOICE_ENGINE = voiceboxPin.defaultEngine;
export const DEFAULT_PRESET_VOICE_ID = voiceboxPin.presetVoiceId;
export const DEFAULT_PROFILE_NAME = voiceboxPin.profileName;

export const VOICE_RETENTION_DAYS = 14;
export const VOICE_MAX_TEXT_CHARS = 12_000;
export const VOICE_CHUNK_TARGET_CHARS = 900;
export const VOICE_MAX_CONCURRENT = 1;
export const VOICE_GENERATION_TIMEOUT_MS = 120_000;
export const VOICE_POLL_INTERVAL_MS = 1_500;
export const VOICE_MAX_RETRIES = 2;
export const VOICE_RATE_LIMIT_PER_MINUTE = 20;

export const ALLOWED_AUDIO_MIME = new Set(['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3']);

export const PLAYBACK_SPEEDS = [0.75, 1.0, 1.25, 1.5] as const;

export const DEFAULT_VOICE_SETTINGS = {
  voiceMode: 'studio' as const,
  autoPlay: 'off' as const,
  playbackSpeed: 1.0 as const,
  longAnswerMode: 'ask' as const,
  fallbackEnabled: true,
};

export const LONG_ANSWER_WORD_THRESHOLD = 120;
export const SHORT_ANSWER_WORD_THRESHOLD = 40;

export function sanitizeVoiceError(raw: unknown): string {
  const message = raw instanceof Error ? raw.message : String(raw ?? 'unknown error');
  if (/timeout/i.test(message)) return 'Generation timed out';
  if (/ECONNREFUSED|fetch failed|network/i.test(message)) return 'Studio Voice service unavailable';
  if (/memory|OOM|CUDA|torch/i.test(message)) return 'Studio Voice temporarily overloaded';
  return 'Studio Voice generation failed';
}
