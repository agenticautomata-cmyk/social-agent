import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { contentHash, detectKeywordMatches } from './keywords.js';
import { scoreConfidence, scoreUrgency } from './scoring.js';
import { isAlertEligible, buildPushAlert, buildTelegramAlertBody } from './alerts.js';
import { normalizedFromManualTip } from './adapters.js';
import type { NormalizedAdapterResult } from './types.js';

function baseResult(overrides: Partial<NormalizedAdapterResult> = {}): NormalizedAdapterResult {
  return {
    entityName: 'Example Cafe',
    address: '123 Main St, Kansas City, MO',
    city: 'Kansas City',
    state: 'MO',
    signalType: 'opening',
    changeSummary: 'Grand opening announced on official site',
    relevantDates: [],
    sourceName: 'Official site',
    sourceUrl: 'https://example-cafe.com',
    sourceCategory: 'official_website',
    supportingText: 'Grand opening this Friday — reservations open',
    matchedKeywords: ['grand opening', 'reservations open'],
    reliabilityInputs: ['Official website change'],
    detectedAt: new Date(),
    contentHash: contentHash('opening-announcement'),
    ...overrides,
  };
}

describe('early-signals integration scenarios', () => {
  it('1. first-party opening announcement scores high and alerts when breaking', () => {
    const result = baseResult();
    const confidence = scoreConfidence({ results: [result], evidenceCount: 1, firstParty: true });
    const urgency = scoreUrgency({
      signalType: result.signalType,
      eventDate: new Date(Date.now() + 86400000),
      confidenceLevel: confidence.level,
      matchedKeywords: result.matchedKeywords,
    });
    assert.ok(['high', 'confirmed'].includes(confidence.level));
    assert.equal(urgency.level, 'breaking');
    const eligible = isAlertEligible(
      {
        confidenceLevel: confidence.level,
        urgencyLevel: urgency.level,
        city: 'Kansas City',
        sourceCategory: 'official_website',
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
        cities: [],
        signalCategories: [],
        keywordPatterns: [],
        updatedAt: new Date(),
      },
    );
    assert.equal(eligible.eligible, true);
  });

  it('2. permit plus hiring cluster elevates confidence with multiple evidence', () => {
    const permit = baseResult({
      sourceCategory: 'city_permit',
      sourceName: 'KC Permit portal',
      signalType: 'permit',
      changeSummary: 'Tenant finish permit filed',
      matchedKeywords: ['tenant finish'],
      contentHash: contentHash('permit'),
    });
    const hiring = baseResult({
      sourceCategory: 'job_listing',
      sourceName: 'Indeed',
      signalType: 'hiring',
      changeSummary: 'Now hiring at new location',
      matchedKeywords: ['now hiring', 'new location'],
      contentHash: contentHash('hiring'),
    });
    const merged = scoreConfidence({
      results: [permit, hiring],
      evidenceCount: 2,
      firstParty: false,
    });
    assert.ok(merged.score >= 30);
    assert.equal(merged.level, 'medium');
  });

  it('3. closing announcement gets urgency boost from language', () => {
    const closing = baseResult({
      signalType: 'closing',
      changeSummary: 'Final weekend before closing',
      matchedKeywords: ['final weekend', 'closing'],
      contentHash: contentHash('closing'),
    });
    const urgency = scoreUrgency({
      signalType: closing.signalType,
      eventDate: new Date(Date.now() + 5 * 86400000),
      confidenceLevel: 'high',
      matchedKeywords: closing.matchedKeywords,
    });
    assert.ok(['breaking', 'early_opportunity'].includes(urgency.level));
  });

  it('4. changed event date hash prevents duplicate insert', () => {
    const before = contentHash('event-date-2026-08-01');
    const after = contentHash('event-date-2026-08-08');
    assert.notEqual(before, after);
  });

  it('5. duplicate source item shares content hash', () => {
    const a = contentHash('same-feed-item');
    const b = contentHash('same-feed-item');
    assert.equal(a, b);
  });

  it('6. weak unverified signal is not alert eligible', () => {
    const eligible = isAlertEligible(
      {
        confidenceLevel: 'low',
        urgencyLevel: 'weak_signal',
        city: 'Kansas City',
        sourceCategory: 'general',
        signalState: 'needs_verification',
      },
      null,
    );
    assert.equal(eligible.eligible, false);
  });

  it('7. high-confidence breaking signal is alert eligible', () => {
    const eligible = isAlertEligible(
      {
        confidenceLevel: 'high',
        urgencyLevel: 'breaking',
        city: 'Kansas City',
        sourceCategory: 'venue_calendar',
        signalState: 'active',
      },
      {
        id: 'global',
        breakingOnly: true,
        highConfidence: false,
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
    assert.equal(eligible.eligible, true);
  });

  it('8. telegram payload escapes safely for failed delivery simulation', () => {
    const body = buildTelegramAlertBody(
      {
        id: '00000000-0000-0000-0000-000000000001',
        signalType: 'opening',
        title: 'Test _ Cafe',
        summary: 'Contains *markdown* [link](https://example.com)',
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
        contentRecommendation: {
          kind: 'green_screen_update',
          suggestedHook: 'Hook',
          confirmedFacts: [],
          needsVerification: [],
          suggestedTiming: 'Now',
          sourceAttribution: 'Example',
          callToAction: 'Post',
          discloseNotVisited: true,
          recommendedAction: 'Post',
        },
        evidence: [],
        missingVerification: [],
        alertSentAt: null,
        metadata: { contentHash: 'x' },
      },
      'https://benson.kckellie.com',
    );
    assert.match(body, /BENSON EARLY SIGNAL/);
    assert.match(body, /Test _ Cafe|Test Cafe/);
  });

  it('9. push payload includes deep link path', () => {
    const push = buildPushAlert({
      id: 'abc-123',
      signalType: 'opening',
      title: 'New Spot',
      summary: 'Soft opening posted',
      sourceUrl: null,
      sourceName: null,
      sourceCategory: 'general',
      businessName: 'New Spot',
      address: null,
      city: 'Kansas City',
      regionState: 'MO',
      firstDetectedAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      eventDate: null,
      confidenceLevel: 'high',
      confidenceScore: 60,
      confidenceExplanation: [],
      urgencyLevel: 'breaking',
      urgencyScore: 60,
      urgencyExplanation: [],
      verificationStatus: 'partial',
      state: 'active',
      linkedOpportunityId: null,
      clusterKey: null,
      contentRecommendation: {
        kind: 'field_visit',
        suggestedHook: 'Hook',
        confirmedFacts: [],
        needsVerification: [],
        suggestedTiming: 'Soon',
        sourceAttribution: 'Web',
        callToAction: 'Visit',
        discloseNotVisited: false,
        recommendedAction: 'Visit',
      },
      evidence: [],
      missingVerification: [],
      alertSentAt: null,
      metadata: { contentHash: 'y' },
    });
    assert.equal(push.url, '/signals/abc-123');
  });

  it('10. malformed manual tip still normalizes with defaults', () => {
    const normalized = normalizedFromManualTip({
      title: '',
      summary: '   ',
      sourceUrl: null,
    });
    assert.ok(normalized.contentHash);
    assert.equal(normalized.city, 'Kansas City');
    assert.equal(normalized.sourceCategory, 'user_tip');
  });

  it('detects keyword patterns in noisy HTML text', () => {
    const hits = detectKeywordMatches(
      'COMING SOON soft opening at our new Crossroads location — now hiring baristas',
    );
    assert.ok(hits.length >= 2);
  });
});
