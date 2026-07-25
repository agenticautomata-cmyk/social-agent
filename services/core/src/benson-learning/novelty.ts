import type { BensonInsight } from './types.js';

const GENERIC_FILLER_RE =
  /\b(keep up the momentum|continue focusing|keep focusing|resonating with your audience|clearly resonating|steer clear|off the table|avoid recommending)\b/i;

const PERMANENT_PROHIBITION_RE =
  /\b(steer clear|avoid|never film|do not film|sidelined|not connecting|isn't connecting|isnt connecting|off the table)\b/i;

const DOMAIN_TERMS = new Set([
  'thrift',
  'retail',
  'luxury',
  'dining',
  'baseline',
  'median',
  'outperform',
  'underperform',
  'connecting',
  'audience',
  'posts',
  'content',
  'kellie',
  'film',
  'haul',
]);

function normalizeLessonText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(text: string): Set<string> {
  return new Set(
    normalizeLessonText(text)
      .split(' ')
      .filter((token) => token.length > 2),
  );
}

export function lessonSimilarity(a: string, b: string): number {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  let domainOverlap = 0;
  for (const token of left) {
    if (right.has(token)) {
      overlap += 1;
      if (DOMAIN_TERMS.has(token)) domainOverlap += 1;
    }
  }
  const base = overlap / Math.max(left.size, right.size);
  const domainBoost = domainOverlap >= 2 ? 0.18 : domainOverlap >= 1 ? 0.08 : 0;
  return Math.min(1, base + domainBoost);
}

export function isNearDuplicateLesson(a: BensonInsight, b: BensonInsight): boolean {
  if (a.lessonType === 'retired_lesson' || b.lessonType === 'retired_lesson') return false;
  if (a.id === b.id) return true;
  if (a.category === b.category && lessonSimilarity(a.insight, b.insight) >= 0.5) return true;
  if (lessonSimilarity(a.insight, b.insight) >= 0.62) return true;
  if (lessonSimilarity(a.action, b.action) >= 0.72) return true;
  return false;
}

export function filterNovelLessons(
  lessons: BensonInsight[],
  previous: BensonInsight[],
): BensonInsight[] {
  const kept: BensonInsight[] = [];
  for (const lesson of lessons) {
    const duplicate = previous.some((prev) => isNearDuplicateLesson(lesson, prev));
    if (duplicate && !lesson.materialChangeSinceLastShown) continue;
    if (GENERIC_FILLER_RE.test(lesson.insight) && !lesson.materialChangeSinceLastShown) continue;
    kept.push(lesson);
  }
  return kept;
}

export function rejectPermanentProhibitionFromWeakEvidence(lesson: BensonInsight): BensonInsight | null {
  if (lesson.lessonType !== 'durable_preference' && !PERMANENT_PROHIBITION_RE.test(lesson.insight)) {
    return lesson;
  }
  if (!PERMANENT_PROHIBITION_RE.test(lesson.insight)) return lesson;

  if (lesson.confidence === 'high' && lesson.lessonType === 'durable_preference') {
    return {
      ...lesson,
      lessonType: 'test_needed',
      durability: 'test',
      confidence: 'low',
      insight: lesson.insight.replace(PERMANENT_PROHIBITION_RE, 'test before ruling out'),
      action: lesson.action || 'Try one stronger hook before abandoning the category.',
    };
  }

  return {
    ...lesson,
    lessonType: 'test_needed',
    durability: 'test',
    confidence: 'low',
  };
}

export function lessonsAreMateriallySame(a: BensonInsight[], b: BensonInsight[]): boolean {
  if (a.length === 0 && b.length === 0) return true;
  if (a.length !== b.length) return false;
  return a.every((lesson, index) => isNearDuplicateLesson(lesson, b[index]!));
}
