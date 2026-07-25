import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterLearningSignals,
  learningOutputIsClean,
  textContainsSuppressedEntity,
} from './suppression.js';
import type { SuppressionRecord } from '../creator-agent/entity-suppression.js';

const majr: SuppressionRecord = {
  id: '1',
  canonicalName: 'Maj-R Thrift',
  aliases: ['Maj R Thrift', 'MajR Thrift', 'Maj-R', 'Maj R', 'MajR'],
  domains: [],
  suppressionScope: 'suppress_everywhere',
  permanent: true,
};

describe('benson learning suppression', () => {
  it('detects Maj-R aliases in generated text', () => {
    for (const phrase of [
      'Maj-R Thrift is officially off the table',
      'Avoid recommending Maj-R Thrift',
      'maj r thrift closing',
      'Visit MajR today',
    ]) {
      assert.ok(textContainsSuppressedEntity(phrase, [majr]), phrase);
    }
  });

  it('filters suppressed passed opportunities from learning signals', () => {
    const filtered = filterLearningSignals(
      {
        collectedAt: new Date().toISOString(),
        analyticsWindow: 'last 45 days',
        preferenceEvents: [],
        feedbackEvents: [],
        chatFeedbackEvents: [],
        plannerActions: [],
        skippedOpportunities: [],
        passedOpportunities: [
          { phrase: 'Maj-R Thrift', reason: 'chat preference', at: '2026-07-20T00:00:00.000Z' },
          { phrase: 'Savers Thrift Store', reason: 'chat preference', at: '2026-07-20T00:00:00.000Z' },
        ],
        topPerformingPosts: [],
        performanceSignals: [],
        timelyOpportunities: [],
        savedCategories: [],
        outcomeExecution: [],
      },
      [majr],
    );
    assert.equal(filtered.passedOpportunities.length, 1);
    assert.equal(filtered.passedOpportunities[0]?.phrase, 'Savers Thrift Store');
  });

  it('rejects contaminated learning output', () => {
    assert.equal(
      learningOutputIsClean({
        summary: 'Focus on Savers and local thrift.',
        insights: [{
          id: 'a',
          category: 'content',
          insight: 'Avoid Maj-R Thrift.',
          confidence: 'high',
          lessonType: 'durable_preference',
          durability: 'durable',
          evidenceSource: 'test',
          evidenceDateRange: '2026',
          materialChangeSinceLastShown: false,
          lastShownAt: null,
          action: '',
          timelyUntil: null,
        }],
        suppressions: [majr],
      }),
      false,
    );
  });
});
