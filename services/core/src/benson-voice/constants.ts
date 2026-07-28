import voiceboxPin from './voicebox-pin.json' with { type: 'json' };

export const SPEECH_TRANSFORM_VERSION = voiceboxPin.speechTransformVersion;
export const VOICEBOX_UPSTREAM_TAG = voiceboxPin.upstreamTag;
export const VOICEBOX_UPSTREAM_COMMIT = voiceboxPin.upstreamCommit;
export const DEFAULT_VOICE_ENGINE = voiceboxPin.defaultEngine;
export const DEFAULT_PRESET_VOICE_ID = voiceboxPin.presetVoiceId;
export const DEFAULT_PROFILE_NAME = voiceboxPin.profileName;

export const CUSTOM_PROFILE_INTERNAL_ID = voiceboxPin.customProfileInternalId;
export const CUSTOM_PROFILE_NAME = voiceboxPin.customProfileName;
export const CUSTOM_VOICE_ENGINE = voiceboxPin.customEngine;
export const FALLBACK_PROFILE_NAME = voiceboxPin.fallbackProfileName;
export const FALLBACK_VOICE_ENGINE = voiceboxPin.fallbackEngine ?? voiceboxPin.defaultEngine;
export const BENSON_VOICE_TEST_PHRASE =
  voiceboxPin.testPhrase ??
  'Good morning, Kellie. I found several new Kansas City opportunities worth reviewing.';

/** Allowlisted Voicebox profile names — no arbitrary client input. */
export const ALLOWED_VOICE_PROFILES = new Set(
  [CUSTOM_PROFILE_NAME, FALLBACK_PROFILE_NAME, DEFAULT_PROFILE_NAME].filter(Boolean),
);

export const VOICE_UNAVAILABLE_USER_MESSAGE =
  "Benson's custom voice is temporarily unavailable.";

export const VOICE_RETENTION_DAYS = 14;
export const VOICE_MAX_TEXT_CHARS = 12_000;
export const VOICE_CHUNK_TARGET_CHARS = 900;
export const VOICE_MAX_CONCURRENT = 1;
export const VOICE_GENERATION_TIMEOUT_MS = 120_000;
export const VOICE_POLL_INTERVAL_MS = 800;
export const VOICE_MAX_RETRIES = 2;
export const VOICE_RATE_LIMIT_PER_MINUTE = 20;

export const ALLOWED_AUDIO_MIME = new Set(['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3']);

export const PLAYBACK_SPEEDS = [0.75, 1.0, 1.25, 1.5] as const;

export const DEFAULT_VOICE_SETTINGS = {
  voiceMode: 'studio' as const,
  autoPlay: 'all' as const,
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
