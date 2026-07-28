import {
  FALLBACK_PROFILE_NAME,
  FALLBACK_VOICE_ENGINE,
} from './constants.js';
import type { VoiceSettings } from './types.js';

export type ResolvedVoiceTarget = {
  profile: string;
  engine: string;
  usesCustom: boolean;
};

/**
 * Studio voice target — always Benson Studio (kokoro).
 * Custom/Qwen clone was abandoned: it OOMs this CPU host.
 */
export function resolveStudioVoiceTarget(
  _settings: VoiceSettings,
  _options?: { preferFast?: boolean },
): ResolvedVoiceTarget {
  return {
    profile: FALLBACK_PROFILE_NAME,
    engine: FALLBACK_VOICE_ENGINE,
    usesCustom: false,
  };
}
