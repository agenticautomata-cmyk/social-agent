import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCategoryRules,
  matchesEstateSaleDefault,
  matchesLibraryRoutineDefault,
  matchesLiquorRenewalDefault,
} from './exclusion-rules.js';
import { textMatchesSuppression } from './entity-suppression.js';
import { computeLifecycleStatus } from './lifecycle.js';
import { evaluateCreatorRelevance, qualifiesForTopPick } from './relevance-gate.js';
import {
  classifyContactVerification,
  evaluatePitchReadiness,
  isPlaceholderEmail,
  normalizeCompanyName,
} from './pitch-readiness.js';
import { stripSuppressedMentions } from './filters.js';

describe('creator-agent exclusion rules', () => {
  it('hides routine liquor renewals', () => {
    const rule = evaluateCategoryRules({
      title: 'Annual beer license renewal for neighborhood bar',
      sourceType: 'liquor_license',
    });
    assert.equal(rule?.hidden, true);
    assert.match(rule?.reason ?? '', /liquor/);
  });

  it('allows new liquor license concepts', () => {
    const rule = evaluateCategoryRules({
      title: 'New craft brewery opening in Crossroads',
      sourceType: 'liquor_license',
    });
    assert.notEqual(rule?.hidden, true);
  });

  it('hides routine estate sales', () => {
    assert.equal(matchesEstateSaleDefault('Weekend estate sale in Overland Park'), true);
    const rule = evaluateCategoryRules({ title: 'Weekend estate sale in Overland Park' });
    assert.equal(rule?.hidden, true);
  });

  it('allows high-value estate angles', () => {
    const rule = evaluateCategoryRules({
      title: 'Celebrity estate auction with designer inventory in Kansas City',
    });
    assert.equal(rule?.hidden, false);
  });

  it('hides routine library programming', () => {
    assert.equal(matchesLibraryRoutineDefault('Tuesday story hour at KC Library'), true);
    const rule = evaluateCategoryRules({ title: 'Tuesday story hour at KC Library' });
    assert.equal(rule?.hidden, true);
  });

  it('hides broader routine library formats (job seeker, bookmobile, workshops)', () => {
    for (const title of [
      'Job Seeker Drop-In Hours',
      'Bookmobile at Sam Rodgers Place',
      'Resume Workshop at Plaza Branch',
      'Adult Literacy ESL Class',
      'Homework Help at Waldo Branch',
    ]) {
      assert.equal(matchesLibraryRoutineDefault(title), true, `expected "${title}" to match routine library pattern`);
      const rule = evaluateCategoryRules({ title });
      assert.equal(rule?.hidden, true, `expected "${title}" to be hidden`);
    }
  });

  it('still allows genuinely major library events through', () => {
    const rule = evaluateCategoryRules({
      title: 'Nationally touring bestselling author book signing at KC Library',
    });
    assert.equal(rule?.hidden, false);
  });
});

describe('entity suppression', () => {
  const majr = {
    id: '1',
    canonicalName: 'Maj-R Thrift',
    aliases: ['Maj R Thrift', 'MajR Thrift', 'Maj-R'],
    domains: [],
    suppressionScope: 'suppress_everywhere' as const,
    permanent: true,
  };

  it('suppresses Maj-R Thrift aliases', () => {
    for (const phrase of ['Maj-R Thrift', 'Maj R Thrift', 'MajR Thrift', 'Visit Maj-R today']) {
      assert.ok(textMatchesSuppression(phrase, [majr]));
    }
  });

  it('removes suppressed mentions from generated text', () => {
    const cleaned = stripSuppressedMentions('Try Maj-R Thrift for vintage finds.', [majr]);
    assert.equal(cleaned.includes('Maj-R'), false);
    assert.equal(cleaned.includes('Thrift'), false);
  });
});

describe('lifecycle', () => {
  it('archives past events', () => {
    const status = computeLifecycleStatus({
      title: 'Summer festival',
      eventStartsAt: '2026-06-01T18:00:00.000Z',
      eventEndsAt: '2026-06-01T22:00:00.000Z',
    }, new Date('2026-07-24T12:00:00.000Z'));
    assert.equal(status, 'expired');
  });

  it('does not treat recent ingestion as current when event is old', () => {
    const status = computeLifecycleStatus({
      title: 'Old event re-ingested',
      eventStartsAt: '2026-06-10T18:00:00.000Z',
      discoveredAt: '2026-07-24T10:00:00.000Z',
    }, new Date('2026-07-24T12:00:00.000Z'));
    assert.equal(status, 'expired');
  });
});

describe('pitch readiness and CRM normalization', () => {
  it('rejects article headlines as companies', () => {
    const rule = evaluateCategoryRules({
      title: 'Clearance sale: buy 5 or more items this weekend',
    });
    assert.equal(rule?.hidden, true);
  });

  it('rejects placeholder emails', () => {
    assert.equal(isPlaceholderEmail('[email protected]'), true);
    assert.equal(classifyContactVerification({ email: '[email protected]' }), 'missing');
  });

  it('does not treat generic customer service as pitch ready', () => {
    const status = evaluatePitchReadiness({
      businessName: 'Price Chopper',
      contactVerificationStatus: 'generic_business_channel',
      hasPersonalizedDraft: true,
      hasConcreteAngle: true,
      hasDeliverableValueProp: true,
      hasTimingReason: true,
      sendMechanismAvailable: true,
      suppressed: false,
      stale: false,
      duplicateUnresolvedOutreach: false,
    });
    assert.equal(status, 'needs_contact');
  });

  it('allows verified pitch-ready outreach', () => {
    const status = evaluatePitchReadiness({
      businessName: 'Local Boutique',
      contactVerificationStatus: 'verified_appropriate',
      hasPersonalizedDraft: true,
      hasConcreteAngle: true,
      hasDeliverableValueProp: true,
      hasTimingReason: true,
      sendMechanismAvailable: true,
      suppressed: false,
      stale: false,
      duplicateUnresolvedOutreach: false,
    });
    assert.equal(status, 'pitch_ready');
  });

  it('decodes malformed HTML entities in company names', () => {
    assert.equal(normalizeCompanyName('Chef&#8217;s Table'), "Chef's Table");
  });
});

describe('top picks validation', () => {
  it('blocks top pick without source link', () => {
    const result = qualifiesForTopPick({
      title: 'Sample event',
      sourceUrl: null,
      reviewUrl: '/review/inventory?item=1',
      creatorValueStatus: 'actionable',
      lifecycleStatus: 'active',
      whyFit: 'Fits Kellie',
      nextAction: 'Film this weekend',
      classificationVerified: true,
    });
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes('missing_source_url'));
  });
});

describe('creator relevance with suppression', () => {
  it('rejects suppressed records before scoring', async () => {
    const result = await evaluateCreatorRelevance(
      {
        title: 'Maj-R Thrift donation event',
        sourceUrl: 'https://example.com/majr',
      },
      {
        suppressions: [
          {
            id: '1',
            canonicalName: 'Maj-R Thrift',
            aliases: ['Maj-R'],
            domains: [],
            suppressionScope: 'suppress_everywhere',
            permanent: true,
          },
        ],
      },
    );
    assert.equal(result.blockedBySuppression, true);
    assert.equal(result.creatorValueStatus, 'rejected');
  });
});
