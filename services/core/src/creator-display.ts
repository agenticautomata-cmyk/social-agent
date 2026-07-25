import { env } from './env.js';

/** Canonical creator first name — never "Kelly". */
export function creatorFirstName(): string {
  const fromEnv = env.CREATOR_DISPLAY_NAME?.trim();
  if (fromEnv) return fromEnv.split(/\s+/)[0] ?? fromEnv;
  return 'Kellie';
}

/** Fix common speech-to-text / LLM misspellings of the creator's name. */
export function normalizeCreatorNameInText(text: string | null | undefined): string {
  if (!text?.trim()) return text ?? '';
  const name = creatorFirstName();
  return text
    .replace(/\bKC\s+Kelly\b/gi, `KC ${name}`)
    .replace(/\bI'm\s+KC\s+Kelly\b/gi, `I'm KC ${name}`)
    .replace(/\bI am\s+KC\s+Kelly\b/gi, `I am KC ${name}`)
    .replace(/\bKelly\b/g, name)
    .replace(/\bkelly\b/g, name.toLowerCase());
}

/** Banded follower language for pitches — no exact quoted counts. */
export function formatFollowerDescriptor(count: number | null | undefined): string | null {
  if (count == null || count <= 0) return null;
  if (count >= 1_000_000) return 'over 1M followers';
  if (count >= 100_000) return 'over 100K followers';
  if (count >= 50_000) return 'over 50K followers';
  if (count >= 10_000) return 'over 10K followers';
  if (count >= 5_000) return 'over 5K followers';
  if (count >= 1_000) return 'over 1K followers';
  return 'a growing KC audience';
}

/** Normalize @handle for pitch copy. */
export function formatTikTokHandle(username: string | null | undefined): string | null {
  const raw = username?.trim().replace(/^@/, '');
  if (!raw) return null;
  return `@${raw}`;
}

/** Default TikTok handle when OAuth username is unavailable. */
export function defaultTikTokHandle(): string {
  return '@kckellie';
}
