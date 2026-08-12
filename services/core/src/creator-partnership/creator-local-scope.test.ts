import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLocalInventorySearchQuery,
  getCreatorLocalScope,
  localRelevanceUnresolvedNote,
} from './creator-local-scope.js';

describe('creator-local-scope', () => {
  it('does not invent geography when unconfigured; uses config when present', () => {
    const scope = getCreatorLocalScope();
    if (!scope.configured) {
      assert.equal(buildLocalInventorySearchQuery({ retailerName: 'X', brandName: 'Y' }), null);
      assert.match(localRelevanceUnresolvedNote(), /not configured|unresolved/i);
    } else {
      const q = buildLocalInventorySearchQuery({ retailerName: 'Retailer', brandName: 'Brand' });
      assert.ok(q);
      assert.ok(q!.includes(scope.searchGeography!));
      assert.match(q!, /Retailer/);
      assert.match(q!, /store locator/);
      // Timezone must not be used as geography substitute in this helper.
      assert.doesNotMatch(q!, /America\/Chicago/);
    }
  });
});
