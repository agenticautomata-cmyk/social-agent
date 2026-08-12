import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canPromoteToCreatorFacing,
  clampCreatorFacingStatus,
  evaluateCreatorFacingPromotion,
} from './creator-facing-eligibility.js';
import { evaluateCreatorRelevance } from './relevance-gate.js';

describe('creator-facing promotion eligibility', () => {
  it('blocks employment hidden_raw_signal from score-style re-promotion', async () => {
    const input = {
      title: 'Job Opportunities',
      sourceUrl: 'https://style-encore.com/locations/overland-park-ks/jobs?utm_source=openai',
      contentCategory: 'Employment',
      metadata: {
        opportunityCategory: 'Employment',
        tags: ['jobs', 'employment', 'retail'],
        bensonScoreComposite: 0.81,
        ingest: 'ask_benson_link',
      },
    };
    assert.equal(canPromoteToCreatorFacing(input), false);
    assert.deepEqual(evaluateCreatorFacingPromotion(input).reasons, ['employment_jobs_careers']);

    const clamped = clampCreatorFacingStatus('creator_candidate', input);
    assert.equal(clamped.blocked, true);
    assert.equal(clamped.status, 'hidden_raw_signal');

    const scored = await evaluateCreatorRelevance(
      {
        title: input.title,
        sourceUrl: input.sourceUrl,
        contentCategory: 'Employment',
        metadata: input.metadata,
      },
      { skipSuppressionLoad: true, suppressions: [] },
    );
    assert.equal(scored.creatorValueStatus, 'hidden_raw_signal');
    assert.ok(
      scored.explanations.some(
        (e) => e.includes('employment') || e.includes('creator_facing_block'),
      ),
    );
  });

  it('allows legitimate creator/sponsor item to promote', () => {
    const input = {
      title: "Plato's Closet Overland Park restock day",
      sourceUrl: 'https://example.com/platos-closet-op',
      contentCategory: 'local_business',
      businessName: "Plato's Closet",
      metadata: {
        opportunityCategory: 'local_business',
        businessName: "Plato's Closet",
        tags: ['thrift', 'resale'],
      },
    };
    assert.equal(canPromoteToCreatorFacing(input), true);
    const clamped = clampCreatorFacingStatus('creator_candidate', input);
    assert.equal(clamped.blocked, false);
    assert.equal(clamped.status, 'creator_candidate');
  });

  it('reconciliation tag does not itself drive classification', () => {
    const withTagOnly = {
      title: "Plato's Closet Canary sponsor visit",
      sourceUrl: 'https://example.com/platos-canary',
      contentCategory: 'local_business',
      businessName: "Plato's Closet",
      metadata: {
        opportunityCategory: 'local_business',
        businessName: "Plato's Closet",
      },
      creatorRelevanceExplanation: ['reconcile:employment_home_ineligible_batch2'],
    };
    assert.equal(
      canPromoteToCreatorFacing(withTagOnly),
      true,
      'reconcile tag alone must not block a legitimate creator/sponsor item',
    );

    const employmentWithoutTag = {
      title: 'KCMO Career Center',
      sourceUrl: 'https://www.kcmo.gov/i-want-to/find-a-job-with-the-city',
      contentCategory: 'Job Opportunities',
      metadata: {
        opportunityCategory: 'Job Opportunities',
        tags: ['jobs', 'career'],
      },
      creatorRelevanceExplanation: [],
    };
    assert.equal(
      canPromoteToCreatorFacing(employmentWithoutTag),
      false,
      'structured employment must block even without reconcile tag',
    );
  });

  it('structured employment metadata takes precedence over generic opportunity language', () => {
    const genericProse = {
      title: 'Local boutique career-building workshop for creators',
      sourceUrl: 'https://example.com/creator-workshop',
      contentCategory: 'workshop',
      metadata: {
        opportunityCategory: 'workshop',
        tags: ['creator', 'workshop'],
      },
    };
    assert.equal(
      canPromoteToCreatorFacing(genericProse),
      true,
      'mere career/opportunity prose must not block',
    );

    const structured = {
      title: 'Great opportunity downtown',
      sourceUrl: 'https://example.com/about',
      contentCategory: 'Employment',
      metadata: {
        opportunityCategory: 'Employment',
        tags: ['retail'],
      },
    };
    assert.equal(canPromoteToCreatorFacing(structured), false);
    assert.ok(
      evaluateCreatorFacingPromotion(structured).reasons.includes('employment_jobs_careers'),
    );
  });

  it('repeated promotion attempts remain stable/idempotent', async () => {
    const input = {
      title: 'LOFT - Sales Associate - Zona Rosa',
      sourceUrl: 'https://www.zonarosa.com/events/portfolio-item/loft-sales-associate/',
      contentCategory: 'deal',
      metadata: {
        opportunityCategory: 'deal',
        tags: ['employment'],
        bensonScoreComposite: 0.9,
        ingest: 'discount_watch',
      },
    };

    const first = clampCreatorFacingStatus('creator_candidate', input);
    const second = clampCreatorFacingStatus('creator_candidate', input);
    assert.deepEqual(first, second);
    assert.equal(first.status, 'hidden_raw_signal');

    const a = await evaluateCreatorRelevance(
      {
        title: input.title,
        sourceUrl: input.sourceUrl,
        contentCategory: 'deal',
        metadata: input.metadata,
      },
      { skipSuppressionLoad: true, suppressions: [] },
    );
    const b = await evaluateCreatorRelevance(
      {
        title: input.title,
        sourceUrl: input.sourceUrl,
        contentCategory: 'deal',
        metadata: input.metadata,
      },
      { skipSuppressionLoad: true, suppressions: [] },
    );
    assert.equal(a.creatorValueStatus, 'hidden_raw_signal');
    assert.equal(b.creatorValueStatus, a.creatorValueStatus);
  });
});
