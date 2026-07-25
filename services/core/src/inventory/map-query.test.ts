import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMapApiQuery, parseMapFiltersFromSearchParams } from './map-query.js';

describe('map query helpers', () => {
  it('builds API queries without private server keys', () => {
    const query = buildMapApiQuery({
      datePreset: 'today',
      locationStatus: 'include_needs_review',
      sort: 'nearest',
    });
    assert.equal(query, '?datePreset=today&locationStatus=include_needs_review&sort=nearest');
    assert.doesNotMatch(query, /GOOGLE_PLACES_API_KEY/);
  });

  it('parses persisted URL filters', () => {
    const filters = parseMapFiltersFromSearchParams(
      new URLSearchParams('datePreset=this_weekend&coverageFormat=green_screen&selectedForFilming=true'),
    );
    assert.equal(filters.datePreset, 'this_weekend');
    assert.equal(filters.coverageFormat, 'green_screen');
    assert.equal(filters.selectedForFilming, true);
  });
});
