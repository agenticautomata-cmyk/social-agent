import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterNovelLessons,
  isNearDuplicateLesson,
  lessonsAreMateriallySame,
  rejectPermanentProhibitionFromWeakEvidence,
} from './novelty.js';
import type { BensonInsight } from './types.js';

function lesson(partial: Partial<BensonInsight> & Pick<BensonInsight, 'id' | 'insight'>): BensonInsight {
  return {
    category: 'performance',
    confidence: 'low',
    lessonType: 'recent_performance_signal',
    durability: 'temporary',
    evidenceSource: 'tiktok analytics',
    evidenceDateRange: 'Jul 2026',
    materialChangeSinceLastShown: false,
    lastShownAt: null,
    action: 'Try a stronger price hook on the next retail post.',
    timelyUntil: null,
    ...partial,
  };
}

describe('learning novelty', () => {
  it('blocks repeated thrift advice', () => {
    const previous = [
      lesson({
        id: 'retail-strong',
        insight: 'Thrift and retail posts are outperforming Kellie recent baseline.',
        action: 'Prioritize a retail haul this week.',
      }),
    ];
    const next = [
      lesson({
        id: 'retail-strong-2',
        insight: 'Retail and thrift content continues to beat Kellie recent median views.',
        action: 'Film another thrift haul while momentum is up.',
      }),
    ];
    const filtered = filterNovelLessons(next, previous);
    assert.equal(filtered.length, 0);
  });

  it('blocks paraphrased duplicate lessons', () => {
    const a = lesson({
      id: 'luxury-a',
      insight: 'Luxury dining content is not connecting with Kellie audience lately.',
      action: 'Test a stronger value hook before dropping the category.',
    });
    const b = lesson({
      id: 'luxury-b',
      insight: 'Luxury dining videos are not connecting with the audience right now.',
      action: 'Try a stronger price/value hook before abandoning luxury dining.',
    });
    assert.ok(isNearDuplicateLesson(a, b));
  });

  it('downgrades one weak luxury dining result from permanent prohibition', () => {
    const downgraded = rejectPermanentProhibitionFromWeakEvidence(
      lesson({
        id: 'luxury-ban',
        lessonType: 'durable_preference',
        durability: 'durable',
        confidence: 'medium',
        insight: 'Luxury dining content is not connecting, so steer clear.',
        action: 'Avoid luxury dining spots for now.',
      }),
    );
    assert.ok(downgraded);
    assert.equal(downgraded!.lessonType, 'test_needed');
    assert.equal(downgraded!.durability, 'test');
    assert.equal(downgraded!.confidence, 'low');
  });

  it('allows materially changed evidence through', () => {
    const previous = [
      lesson({
        id: 'retail',
        insight: 'Retail posts are above baseline.',
        action: 'Film a retail haul.',
      }),
    ];
    const next = [
      lesson({
        id: 'retail',
        insight: 'Retail posts are above baseline.',
        action: 'Film a retail haul.',
        materialChangeSinceLastShown: true,
      }),
    ];
    const filtered = filterNovelLessons(next, previous);
    assert.equal(filtered.length, 1);
  });

  it('detects materially same lesson sets', () => {
    const a = [
      lesson({ id: 'a', insight: 'Thrift hauls beat baseline this month.' }),
      lesson({ id: 'b', insight: 'Weekend posting window is strongest.' }),
    ];
    const b = [
      lesson({ id: 'a2', insight: 'Thrift haul posts beat baseline this month.' }),
      lesson({ id: 'b2', insight: 'Weekend posting window remains strongest.' }),
    ];
    assert.ok(lessonsAreMateriallySame(a, b));
  });
});
