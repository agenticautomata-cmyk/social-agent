/**
 * Deterministic fixture provider for Benson Scout Promptfoo gate.
 */

const FIXTURES = {
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

export default class BensonFixtureProvider {
  id() {
    return 'benson-fixture-provider';
  }

  async callApi(_prompt, context) {
    const key = String(context.vars?.input ?? '').trim();
    const output = FIXTURES[key] ?? 'unknown_fixture';
    return { output };
  }
}
