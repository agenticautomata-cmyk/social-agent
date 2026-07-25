import { createHash } from 'node:crypto';
import { SPEECH_TRANSFORM_VERSION } from './constants.js';

export function hashSpeechInputs(input: {
  spokenText: string;
  voiceProfile: string;
  engine: string;
  playbackSpeed: number;
  speechTransformVersion?: number;
}): string {
  const payload = [
    input.spokenText,
    input.voiceProfile,
    input.engine,
    String(input.playbackSpeed),
    String(input.speechTransformVersion ?? SPEECH_TRANSFORM_VERSION),
  ].join('\0');
  return createHash('sha256').update(payload).digest('hex');
}
