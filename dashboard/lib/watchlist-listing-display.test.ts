import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldUseProductionGroupCards } from './watchlist-listing-display';

describe('shouldUseProductionGroupCards', () => {
  it('uses rich cards for Wix companion nights even when productionGroupKey exists', () => {
    assert.equal(
      shouldUseProductionGroupCards({
        hasProductionGroups: true,
        listingDisplayMode: 'wix_companion_nights',
        extractionMethod: 'wix_events',
      }),
      false,
    );
  });

  it('keeps Melting Pot / theater season on production-group cards', () => {
    assert.equal(
      shouldUseProductionGroupCards({
        hasProductionGroups: true,
        listingDisplayMode: 'production_groups',
        extractionMethod: 'theater_season',
      }),
      true,
    );
    assert.equal(
      shouldUseProductionGroupCards({
        hasProductionGroups: true,
        listingDisplayMode: null,
        extractionMethod: 'theater_season',
      }),
      true,
    );
  });

  it('does not force production groups merely because productionGroupKey is present', () => {
    assert.equal(
      shouldUseProductionGroupCards({
        hasProductionGroups: true,
        listingDisplayMode: null,
        extractionMethod: 'wix_events',
      }),
      false,
    );
    assert.equal(
      shouldUseProductionGroupCards({
        hasProductionGroups: false,
        listingDisplayMode: 'production_groups',
        extractionMethod: 'theater_season',
      }),
      false,
    );
  });
});
