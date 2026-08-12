import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { correctNothingNewContradiction, correctTikTokStaleClaims } from './tiktok-truth.js';
import type { BensonInsight } from './types.js';

const baseInsight: BensonInsight = {
  id: 'kcbo_black_biz_crawl',
  category: 'timing',
  insight: 'KCBO Black Biz Crawl is happening every Saturday in August, a great fit for your shopping content.',
  confidence: 'high',
  lessonType: 'recent_performance_signal',
  durability: 'temporary',
  evidenceSource: 'planner',
  evidenceDateRange: '2026-08-01',
  materialChangeSinceLastShown: false,
  lastShownAt: null,
  action: 'Film the KCBO Black Biz Crawl this Saturday.',
  timelyUntil: '2026-08-31',
};

describe('correctTikTokStaleClaims', () => {
  it('strips the stale/reconnect clause when TikTok is actually connected and freshly synced', () => {
    const snapshot = {
      summary:
        "Nothing new to report this cycle. Your TikTok data is stale as of July 31, 2026. Reconnect at the provided URL to refresh insights. Meanwhile, there's a solid opportunity with the KCBO Black Biz Crawl every Saturday in August that aligns with your shopping content.",
      insights: [baseInsight],
    };
    const live = {
      connected: true,
      connectionStatus: 'connected',
      lastSuccessfulSyncAt: new Date().toISOString(),
    };
    const result = correctTikTokStaleClaims(snapshot, live);
    assert.equal(result.corrected, true);
    assert.doesNotMatch(result.snapshot.summary, /reconnect/i);
    assert.doesNotMatch(result.snapshot.summary, /stale/i);
    assert.match(result.snapshot.summary, /KCBO Black Biz Crawl/);
  });

  it('leaves the text untouched when TikTok really is stale/disconnected', () => {
    const snapshot = {
      summary: 'Your TikTok data is stale as of July 31, 2026. Reconnect at the provided URL to refresh insights.',
      insights: [baseInsight],
    };
    const live = {
      connected: false,
      connectionStatus: 'disconnected',
      lastSuccessfulSyncAt: null,
    };
    const result = correctTikTokStaleClaims(snapshot, live);
    assert.equal(result.corrected, false);
    assert.equal(result.snapshot.summary, snapshot.summary);
  });

  it('leaves the text untouched when the last successful sync is genuinely more than 24h old', () => {
    const snapshot = {
      summary: 'Your TikTok data is stale. Reconnect TikTok to refresh insights.',
      insights: [baseInsight],
    };
    const live = {
      connected: true,
      connectionStatus: 'connected',
      lastSuccessfulSyncAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    };
    const result = correctTikTokStaleClaims(snapshot, live);
    assert.equal(result.corrected, false);
  });

  it('falls back to the canonical nothing-new summary if stripping leaves nothing meaningful', () => {
    const snapshot = {
      summary: 'Your TikTok data is stale. Reconnect TikTok to refresh insights.',
      insights: [],
    };
    const live = {
      connected: true,
      connectionStatus: 'connected',
      lastSuccessfulSyncAt: new Date().toISOString(),
    };
    const result = correctTikTokStaleClaims(snapshot, live);
    assert.equal(result.corrected, true);
    assert.equal(result.snapshot.summary, 'No meaningful new creator lessons since the last update.');
  });

  it('strips a reconnect instruction that never mentions "tiktok" or a recognized trailing keyword', () => {
    // Exact production regression (2026-08-01): "Reconnect to get the latest trends." leaked
    // through the old RECONNECT_CLAIM_RE, which required tiktok/refresh/insights/metrics/data
    // to appear after "reconnect" in the same sentence — "trends" didn't match any of those.
    const snapshot = {
      summary:
        "Reconnect to get the latest trends. Meanwhile, your recent thrift posts are performing well, and there's a solid opportunity with the KCBO Black Biz Crawl every Saturday in August.",
      insights: [baseInsight],
    };
    const live = {
      connected: true,
      connectionStatus: 'connected',
      lastSuccessfulSyncAt: new Date().toISOString(),
    };
    const result = correctTikTokStaleClaims(snapshot, live);
    assert.equal(result.corrected, true);
    assert.doesNotMatch(result.snapshot.summary, /reconnect/i);
    assert.match(result.snapshot.summary, /KCBO Black Biz Crawl/);
  });

  it('does not touch insight text unrelated to TikTok staleness', () => {
    const snapshot = {
      summary: 'There is a solid opportunity with the KCBO Black Biz Crawl this Saturday.',
      insights: [baseInsight],
    };
    const live = {
      connected: true,
      connectionStatus: 'connected',
      lastSuccessfulSyncAt: new Date().toISOString(),
    };
    const result = correctTikTokStaleClaims(snapshot, live);
    assert.equal(result.corrected, false);
    assert.equal(result.snapshot.summary, snapshot.summary);
    assert.deepEqual(result.snapshot.insights, snapshot.insights);
  });
});

describe('correctNothingNewContradiction', () => {
  it('strips a "nothing new" opener when there is actually a real insight', () => {
    const snapshot = {
      summary:
        "Nothing new to report this cycle. Meanwhile, there's a solid opportunity with the KCBO Black Biz Crawl every Saturday in August that aligns with your shopping content.",
      insights: [baseInsight],
    };
    const result = correctNothingNewContradiction(snapshot);
    assert.equal(result.corrected, true);
    assert.doesNotMatch(result.snapshot.summary, /^nothing new/i);
    assert.match(result.snapshot.summary, /KCBO Black Biz Crawl/);
  });

  it('leaves a genuine "nothing new" summary untouched when there are no insights', () => {
    const snapshot = {
      summary: 'No meaningful new creator lessons since the last update.',
      insights: [],
    };
    const result = correctNothingNewContradiction(snapshot);
    assert.equal(result.corrected, false);
    assert.equal(result.snapshot.summary, snapshot.summary);
  });

  it('does not touch summaries that never claimed "nothing new"', () => {
    const snapshot = {
      summary: 'The KCBO Black Biz Crawl is a great fit for your shopping content this month.',
      insights: [baseInsight],
    };
    const result = correctNothingNewContradiction(snapshot);
    assert.equal(result.corrected, false);
  });
});
