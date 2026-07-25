import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectKeywordMatches, contentHash, buildClusterKey } from './keywords.js';
import { scoreConfidence, scoreUrgency, buildContentRecommendation } from './scoring.js';
import { isAlertEligible, buildPushAlert, buildTelegramAlertBody } from './alerts.js';
import type { EarlySignalView } from './types.js';

describe('early-signals keywords', () => {
  it('detects coming soon and closing phrases', () => {
    const hits = detectKeywordMatches('Soft opening this Friday — final weekend before closing');
    assert.ok(hits.some((h) => h.pattern.id === 'soft_opening'));
    assert.ok(hits.some((h) => h.pattern.id === 'final_weekend'));
  });

  it('dedupes by content hash', () => {
    const a = contentHash('Same text');
    const b = contentHash('same text');
    assert.equal(a, b);
  });

  it('builds stable cluster keys', () => {
    const key = buildClusterKey({ businessName: 'Example Cafe', address: '123 Main St' });
    assert.ok(key && key.length >= 12);
  });
});

describe('early-signals scoring', () => {
  it('scores low confidence for single keyword without first-party source', () => {
    const result = scoreConfidence({
      results: [
        {
          entityName: 'Test Biz',
          address: null,
          city: 'Kansas City',
          state: 'MO',
          signalType: 'opening',
          changeSummary: 'Coming soon page updated',
          relevantDates: [],
          sourceName: 'Test',
          sourceUrl: 'https://example.com',
          sourceCategory: 'general',
          supportingText: 'coming soon',
          matchedKeywords: ['coming soon'],
          reliabilityInputs: [],
          detectedAt: new Date(),
          contentHash: 'abc',
        },
      ],
      evidenceCount: 1,
      firstParty: false,
    });
    assert.equal(result.level, 'low');
    assert.ok(result.score >= 8);
    assert.ok(result.explanation.some((line) => line.factor === 'keyword_strength'));
  });

  it('marks breaking urgency near-term events', () => {
    const result = scoreUrgency({
      signalType: 'opening',
      eventDate: new Date(Date.now() + 86400000),
      confidenceLevel: 'high',
      matchedKeywords: ['grand opening'],
    });
    assert.equal(result.level, 'breaking');
  });

  it('builds content recommendation', () => {
    const rec = buildContentRecommendation({
      signalType: 'opening',
      confidenceLevel: 'confirmed',
      urgencyLevel: 'breaking',
      title: 'New Cafe',
      confirmedFacts: ['Official site says grand opening Friday'],
      needsVerification: [],
      sourceName: 'Official site',
    });
    assert.equal(rec.kind, 'green_screen_update');
  });
});

describe('early-signals alerts', () => {
  const baseView: EarlySignalView = {
    id: '00000000-0000-0000-0000-000000000001',
    signalType: 'opening',
    title: 'Test Cafe',
    summary: 'Grand opening posted on official site',
    sourceUrl: 'https://example.com',
    sourceName: 'Example',
    sourceCategory: 'official_website',
    businessName: 'Test Cafe',
    address: null,
    city: 'Kansas City',
    regionState: 'MO',
    firstDetectedAt: new Date().toISOString(),
    lastCheckedAt: new Date().toISOString(),
    eventDate: null,
    confidenceLevel: 'high',
    confidenceScore: 70,
    confidenceExplanation: [],
    urgencyLevel: 'breaking',
    urgencyScore: 65,
    urgencyExplanation: [],
    verificationStatus: 'partial',
    state: 'active',
    linkedOpportunityId: null,
    clusterKey: null,
    contentRecommendation: buildContentRecommendation({
      signalType: 'opening',
      confidenceLevel: 'high',
      urgencyLevel: 'breaking',
      title: 'Test Cafe',
      confirmedFacts: [],
      needsVerification: ['Date TBD'],
      sourceName: 'Example',
    }),
    evidence: [],
    missingVerification: ['Date TBD'],
    alertSentAt: null,
    metadata: { contentHash: 'hash123' },
  };

  it('skips weak signals for alerts', () => {
    const eligible = isAlertEligible(
      {
        confidenceLevel: 'low',
        urgencyLevel: 'weak_signal',
        city: 'Kansas City',
        sourceCategory: 'general',
        signalState: 'active',
      },
      {
        id: 'global',
        breakingOnly: false,
        highConfidence: true,
        dailyDigest: false,
        allQualified: false,
        quietHoursStart: null,
        quietHoursEnd: null,
        cities: ['Kansas City'],
        signalCategories: [],
        keywordPatterns: [],
        updatedAt: new Date(),
      },
    );
    assert.equal(eligible.eligible, false);
  });

  it('builds push and telegram payloads', () => {
    const push = buildPushAlert(baseView);
    assert.match(push.title, /Early Signal/);
    assert.equal(push.url, `/signals/${baseView.id}`);
    const telegram = buildTelegramAlertBody(baseView, 'https://benson.kckellie.com');
    assert.match(telegram, /BENSON EARLY SIGNAL/);
    assert.match(telegram, /Test Cafe/);
  });
});
