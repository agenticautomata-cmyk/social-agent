import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyLessonQualityGates } from './post-process.js';
import {
  applyMonetizationFirstCorrections,
  computeCreatorBusinessScore,
  correctStopDoingForMonetization,
  isBlanketStopPostingRecommendation,
  rewriteToWeekdayStrategy,
  shouldBlockStopPostingRecommendation,
  weekdayStrategyInsight,
} from './monetization-first.js';
import type { BensonInsight } from './types.js';

function baseLesson(partial: Partial<BensonInsight> & Pick<BensonInsight, 'id' | 'insight' | 'action'>): BensonInsight {
  return {
    category: 'timing',
    confidence: 'medium',
    lessonType: 'recent_performance_signal',
    durability: 'temporary',
    evidenceSource: 'tiktok analytics',
    evidenceDateRange: 'Jul 1–Jul 31 2026',
    materialChangeSinceLastShown: false,
    lastShownAt: null,
    timelyUntil: null,
    ...partial,
  };
}

describe('monetization-first learning corrections', () => {
  it('does not auto-produce stop posting from below-average engagement alone', () => {
    const lesson = baseLesson({
      id: 'monday-weak',
      insight: 'Monday posts trail Kellie median engagement.',
      action: 'Try a stronger hook on the next Monday post and compare results.',
    });
    const corrected = applyMonetizationFirstCorrections([lesson]);
    assert.ok(!isBlanketStopPostingRecommendation(corrected[0]!.insight));
    assert.ok(!/stop posting/i.test(corrected[0]!.action));
  });

  it('rewrites stop posting Monday into weekday strategy', () => {
    const lesson = baseLesson({
      id: 'stop-monday',
      insight: 'Stop posting on Mondays; it is clearly not working.',
      action: 'Skip Mondays entirely to protect average engagement.',
    });
    const corrected = applyMonetizationFirstCorrections([lesson])[0]!;
    assert.match(corrected.insight, /MONDAY STRATEGY|Monday posts currently trail/i);
    assert.match(corrected.action, /sponsor deliverables|affiliate|experiments/i);
    assert.ok(!isBlanketStopPostingRecommendation(`${corrected.insight} ${corrected.action}`));
    assert.equal(corrected.lessonType, 'test_needed');
  });

  it('blocks stop posting when sponsor obligation signal is present', () => {
    assert.ok(
      shouldBlockStopPostingRecommendation({
        text: 'Stop posting on Mondays',
        hasSponsorObligation: true,
      }),
    );
  });

  it('blocks stop posting when positive revenue language is present', () => {
    assert.ok(
      shouldBlockStopPostingRecommendation({
        text: 'Never post on Tuesday because sponsor deliverables still need inventory slots',
        hasPositiveRevenueSignal: true,
      }),
    );
  });

  it('keeps low-effort positive-reach recommendation for weak weekday', () => {
    const rewritten = rewriteToWeekdayStrategy(
      baseLesson({
        id: 'monday',
        insight: 'Monday underperforms.',
        action: 'Do less on Monday.',
      }),
      'Monday',
    );
    assert.match(rewritten.action, /repurposed|evergreen|experiments/i);
    assert.match(rewritten.insight, /sponsored deliverables|evergreen/i);
  });

  it('uses cautious language for small weekday samples', () => {
    const text = weekdayStrategyInsight('Tuesday', {
      sampleSize: 2,
      avgViews: 4200,
      medianViews: 8000,
      engagementRate: 0.04,
      contentTypeMix: ['restaurant'],
      confidence: 'low',
    });
    assert.match(text, /Sample is limited/i);
    assert.match(text, /n=2/i);
    assert.match(text, /restaurant/i);
  });

  it('considers content-type mix in weekday strategy insight', () => {
    const text = weekdayStrategyInsight('Monday', {
      sampleSize: 5,
      avgViews: 5000,
      medianViews: 9000,
      engagementRate: 0.05,
      contentTypeMix: ['sponsored', 'evergreen'],
      confidence: 'low',
    });
    assert.match(text, /sponsored|evergreen/i);
  });

  it('assigns Monday a content strategy rather than elimination via quality gates', () => {
    const result = applyLessonQualityGates({
      summary: 'Timing guidance.',
      insights: [
        baseLesson({
          id: 'monday-stop',
          insight: 'Stop posting on Mondays — clearly not working for engagement.',
          action: 'Remove Monday from the posting calendar completely.',
        }),
      ],
      previousInsights: [],
      timelyOpportunities: [],
      suppressions: [],
      performanceSignals: [
        {
          title: 'Monday posting window (3 posts)',
          category: 'restaurant',
          weekday: 'Monday',
          contentTypeMix: ['restaurant', 'sponsored'],
          publishedAt: '2026-07-20T00:00:00.000Z',
          views: 4500,
          medianViews: 4200,
          totalViews: 13500,
          performanceIndex: 0.82,
          engagementRate: 0.04,
          sampleSize: 3,
          vsBaseline: 'below',
          monetizationValue: 'positive',
          businessScore: 1.02,
          conclusion: 'Monday: average views below median — prefer lower-effort formats.',
          confidence: 'low',
        },
      ],
    });
    assert.equal(result.insights.length, 1);
    const lesson = result.insights[0]!;
    assert.match(lesson.insight, /MONDAY STRATEGY|Monday posts currently trail/i);
    assert.ok(!isBlanketStopPostingRecommendation(`${lesson.insight} ${lesson.action}`));
  });

  it('corrects strategist stopDoing away from silence-on-Monday advice', () => {
    const corrected = correctStopDoingForMonetization(
      'Stop posting on Mondays; it is clearly not working.',
    );
    assert.match(corrected, /MONDAY STRATEGY/i);
    assert.match(corrected, /sponsor deliverables|evergreen|experiments/i);
    assert.ok(!isBlanketStopPostingRecommendation(corrected));
  });

  it('ranks business score with engagement as non-dominant factor', () => {
    const highEngagementLowBusiness = computeCreatorBusinessScore({
      avgViews: 3000,
      medianViews: 9000,
      totalViews: 9000,
      sampleSize: 3,
      engagementRate: 0.12,
      sponsoredShare: 0,
      performanceIndex: 0.33,
    });
    const lowEngagementHighBusiness = computeCreatorBusinessScore({
      avgViews: 7000,
      medianViews: 9000,
      totalViews: 21000,
      sampleSize: 3,
      engagementRate: 0.03,
      sponsoredShare: 0.33,
      performanceIndex: 0.78,
    });
    assert.ok(lowEngagementHighBusiness > highEngagementLowBusiness);
  });
});
