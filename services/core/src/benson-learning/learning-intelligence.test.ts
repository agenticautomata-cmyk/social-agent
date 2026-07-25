import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyLessonQualityGates } from './post-process.js';
import { buildPerformanceSignals } from './analytics-enrich.js';
import { NOTHING_NEW_SUMMARY, type BensonInsight } from './types.js';
import type { SuppressionRecord } from '../creator-agent/entity-suppression.js';
import type { VideoWithMetrics } from '../creator-analytics/types.js';

const majr: SuppressionRecord = {
  id: '1',
  canonicalName: 'Maj-R Thrift',
  aliases: ['Maj R Thrift'],
  domains: [],
  suppressionScope: 'suppress_everywhere',
  permanent: true,
};

function baseLesson(partial: Partial<BensonInsight> & Pick<BensonInsight, 'id' | 'insight' | 'action'>): BensonInsight {
  return {
    category: 'performance',
    confidence: 'low',
    lessonType: 'recent_performance_signal',
    durability: 'temporary',
    evidenceSource: 'tiktok analytics',
    evidenceDateRange: 'Jul 1–Jul 25 2026',
    materialChangeSinceLastShown: false,
    lastShownAt: null,
    timelyUntil: null,
    ...partial,
  };
}

describe('learning intelligence gates', () => {
  const july25 = new Date('2026-07-25T12:00:00.000Z');

  it('excludes expired Savers July 16 opening on July 25', () => {
    const result = applyLessonQualityGates({
      summary: 'Film Savers opening soon.',
      insights: [
        baseLesson({
          id: 'savers',
          insight: 'Consider filming the Savers Thrift Store Grand Opening in Belton, MO, on July 16.',
          action: 'Head to Belton for opening-day b-roll this weekend.',
        }),
      ],
      previousInsights: [],
      timelyOpportunities: [],
      suppressions: [],
      now: july25,
    });
    assert.equal(result.insights.length, 0);
    assert.ok(result.blockedReasons.some((r) => r.startsWith('expired_date')));
  });

  it('excludes suppressed entities', () => {
    const result = applyLessonQualityGates({
      summary: 'Retail guidance.',
      insights: [
        baseLesson({
          id: 'majr',
          insight: 'Maj-R Thrift is off the table for recommendations.',
          action: 'Skip Maj-R Thrift entirely.',
        }),
      ],
      previousInsights: [],
      timelyOpportunities: [],
      suppressions: [majr],
      now: july25,
    });
    assert.equal(result.insights.length, 0);
    assert.ok(result.blockedReasons.some((r) => r.startsWith('suppressed')));
  });

  it('blocks ungrounded event recommendations not in timelyOpportunities', () => {
    const result = applyLessonQualityGates({
      summary: 'Opening idea.',
      insights: [
        baseLesson({
          id: 'fake-opening',
          insight: 'Film the Legends Outlet grand opening on August 2 for retail content.',
          action: 'Visit Legends Outlet before the opening crowds leave.',
        }),
      ],
      previousInsights: [],
      timelyOpportunities: [
        {
          id: 'real-1',
          title: 'Summer sidewalk sale — Country Club Plaza',
          category: 'retail',
          eventDate: '2026-08-01T00:00:00.000Z',
          lifecycleStatus: 'active',
          composite: 82,
          actionWindow: 'within 7 days',
        },
      ],
      suppressions: [],
      now: july25,
    });
    assert.equal(result.insights.length, 0);
    assert.ok(result.blockedReasons.some((r) => r.startsWith('ungrounded_event')));
  });

  it('blocks repeated advice when nothing materially changed', () => {
    const previous = [
      baseLesson({
        id: 'retail',
        insight: 'Thrift and retail posts beat Kellie recent baseline.',
        action: 'Prioritize a thrift haul this week.',
      }),
    ];
    const result = applyLessonQualityGates({
      summary: 'Retail still strong.',
      insights: [
        baseLesson({
          id: 'retail-2',
          insight: 'Thrift and retail content continues to outperform Kellie recent median views.',
          action: 'Film another retail haul while momentum holds.',
        }),
      ],
      previousInsights: previous,
      timelyOpportunities: [],
      suppressions: [],
      now: july25,
    });
    assert.equal(result.insights.length, 0);
  });

  it('creates time-limited performance signal from current analytics', () => {
    const videos: VideoWithMetrics[] = [
      {
        id: '1',
        title: 'Thrift haul',
        caption: null,
        contentCategory: 'retail',
        locationTag: null,
        publishedAt: '2026-07-20T00:00:00.000Z',
        views: 12000,
        performanceIndex: 1.4,
        engagementRate: 0.08,
      } as VideoWithMetrics,
      {
        id: '2',
        title: 'Luxury dinner',
        caption: null,
        contentCategory: 'luxury_dining',
        locationTag: null,
        publishedAt: '2026-07-18T00:00:00.000Z',
        views: 4000,
        performanceIndex: 0.6,
        engagementRate: 0.03,
      } as VideoWithMetrics,
      {
        id: '3',
        title: 'Retail find',
        caption: null,
        contentCategory: 'retail',
        locationTag: null,
        publishedAt: '2026-07-15T00:00:00.000Z',
        views: 13000,
        performanceIndex: 1.3,
        engagementRate: 0.07,
      } as VideoWithMetrics,
      {
        id: '4',
        title: 'Coffee run',
        caption: null,
        contentCategory: 'lifestyle',
        locationTag: null,
        publishedAt: '2026-07-10T00:00:00.000Z',
        views: 5000,
        performanceIndex: 0.8,
        engagementRate: 0.04,
      } as VideoWithMetrics,
    ];
    const signals = buildPerformanceSignals(videos, july25);
    const retail = signals.find((s) => s.category === 'retail' && s.sampleSize >= 2);
    assert.ok(retail);
    assert.equal(retail!.sampleSize, 2);
    assert.equal(retail!.confidence, 'low');
    assert.equal(retail!.vsBaseline, 'above');
  });

  it('allows materially changed evidence to update an existing lesson', () => {
    const previous = [
      baseLesson({
        id: 'retail',
        insight: 'Retail posts are slightly above baseline.',
        action: 'Film one more retail post.',
      }),
    ];
    const result = applyLessonQualityGates({
      summary: 'Retail jumped after new hook.',
      insights: [
        baseLesson({
          id: 'retail',
          insight: 'Retail posts jumped 40% above baseline after stronger price hooks.',
          action: 'Reuse the price-reveal hook on the next thrift haul.',
          materialChangeSinceLastShown: true,
          confidence: 'medium',
        }),
      ],
      previousInsights: previous,
      timelyOpportunities: [],
      suppressions: [],
      now: july25,
    });
    assert.equal(result.insights.length, 1);
  });

  it('documents honest nothing-new state via empty gated insights', () => {
    const previous = [
      baseLesson({
        id: 'retail',
        insight: 'Thrift posts beat baseline.',
        action: 'Film a thrift haul.',
      }),
    ];
    const result = applyLessonQualityGates({
      summary: 'More retail advice.',
      insights: [
        baseLesson({
          id: 'retail-dup',
          insight: 'Thrift posts continue beating Kellie baseline views.',
          action: 'Keep filming thrift content this week.',
        }),
      ],
      previousInsights: previous,
      timelyOpportunities: [],
      suppressions: [],
      now: july25,
    });
    assert.equal(result.insights.length, 0);
    assert.notEqual(NOTHING_NEW_SUMMARY, result.summary);
  });
});
