import { LESSON_CATEGORIES, type LessonCategory } from './types.js';

const CATEGORY_ALIASES: Record<string, LessonCategory> = {
  event: 'content',
  events: 'content',
  filming: 'content',
  discovery: 'content',
  discoveries: 'content',
  opportunity: 'content',
  opportunities: 'content',
  calendar: 'timing',
  schedule: 'timing',
  sponsors: 'sponsor',
  outreach: 'sponsor',
  pitch: 'sponsor',
  pitches: 'sponsor',
  analytics: 'performance',
  tiktok: 'performance',
  format: 'content',
  hook: 'content',
  caption: 'voice',
  tone: 'voice',
};

/** Coerce model output into a valid lesson category instead of failing the whole cycle. */
export function normalizeLessonCategory(raw: unknown): LessonCategory {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if ((LESSON_CATEGORIES as readonly string[]).includes(key)) return key as LessonCategory;
  return CATEGORY_ALIASES[key] ?? 'content';
}
