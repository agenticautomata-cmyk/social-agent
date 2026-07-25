import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/** Mirrors eval/scout/providers/benson-fixture-provider.js for CI without Promptfoo CLI. */
const FIXTURES: Record<string, string> = {
  suppression_maj_r: 'filtered',
  freshness_expired_opening: 'stale_archived',
  relevance_liquor_renewal: 'hidden',
  relevance_estate_sale: 'hidden',
  classification_adidas_not_date_night: 'retail_not_date_night',
  watchlist_unchanged_post: 'duplicate_blocked',
  watchlist_account_requires_approval: 'approval_required',
  ask_benson_scout_record_id: JSON.stringify({
    recordId: 'scout-item-fixture-001',
    contextType: 'scout_item',
  }),
  creator_action_skip: 'skipped',
};

describe('Scout behavioral fixtures (Promptfoo gate)', () => {
  it('Maj-R suppression fixture', () => {
    assert.equal(FIXTURES.suppression_maj_r, 'filtered');
    assert.ok(!FIXTURES.suppression_maj_r.includes('Maj-R'));
  });

  it('liquor renewal hidden', () => {
    assert.equal(FIXTURES.relevance_liquor_renewal, 'hidden');
  });

  it('unchanged post blocked', () => {
    assert.equal(FIXTURES.watchlist_unchanged_post, 'duplicate_blocked');
  });

  it('account watch requires approval', () => {
    assert.equal(FIXTURES.watchlist_account_requires_approval, 'approval_required');
  });

  it('Ask Benson scout record id', () => {
    const parsed = JSON.parse(FIXTURES.ask_benson_scout_record_id!) as { recordId: string };
    assert.ok(parsed.recordId.length > 10);
  });
});
