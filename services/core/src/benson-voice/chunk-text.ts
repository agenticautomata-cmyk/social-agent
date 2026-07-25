import { VOICE_CHUNK_TARGET_CHARS } from './constants.js';

const SENTENCE_END = /(?<=[.!?…])\s+/;

/** Split long spoken text at sentence boundaries for ordered chunk generation. */
export function chunkSpeechText(text: string, targetChars = VOICE_CHUNK_TARGET_CHARS): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= targetChars) return [trimmed];

  const sentences = trimmed.split(SENTENCE_END).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > targetChars && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = next;
    }
  }

  if (current.trim()) chunks.push(current.trim());

  if (chunks.length === 0) return [trimmed];
  return chunks;
}
