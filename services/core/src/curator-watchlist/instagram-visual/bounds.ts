/** Configurable bounded limits for twice-daily Instagram visual checks. */

import type { InstagramVisualBounds } from './types.js';

function num(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function bool(envName: string, fallback = false): boolean {
  const raw = process.env[envName]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/** Sensible defaults for twice-daily Watchlist checks. Billable vision/parse OFF. */
export function defaultInstagramVisualBounds(
  overrides?: Partial<InstagramVisualBounds>,
): InstagramVisualBounds {
  return {
    maxPosts: num('INSTAGRAM_VISUAL_MAX_POSTS', 12),
    maxPostAgeDays: num('INSTAGRAM_VISUAL_MAX_POST_AGE_DAYS', 21),
    maxCarouselSlides: num('INSTAGRAM_VISUAL_MAX_CAROUSEL_SLIDES', 12),
    maxVideoFrames: num('INSTAGRAM_VISUAL_MAX_VIDEO_FRAMES', 4),
    maxMediaBytes: num('INSTAGRAM_VISUAL_MAX_MEDIA_BYTES', 8_000_000),
    runTimeoutMs: num('INSTAGRAM_VISUAL_RUN_TIMEOUT_MS', 420_000),
    maxOcrImagesPerPost: num('INSTAGRAM_VISUAL_MAX_OCR_IMAGES', 10),
    enableBillableVision: bool('INSTAGRAM_BILLABLE_VISION', false),
    enableBillableParse: bool('INSTAGRAM_BILLABLE_PARSE', false),
    enableVideoFrames: bool('INSTAGRAM_VISUAL_ENABLE_VIDEO_FRAMES', true),
    enableAudioTranscript: bool('INSTAGRAM_VISUAL_ENABLE_AUDIO_TRANSCRIPT', false),
    ...overrides,
  };
}
