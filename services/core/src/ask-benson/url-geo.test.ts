import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isKcMetroLocation, isOutOfMarketLocation } from './url-geo.js';

describe('url-geo out-of-market confidence', () => {
  it('treats KC metro city/state as in-market', () => {
    assert.equal(isKcMetroLocation('Kansas City, MO'), true);
    assert.equal(isOutOfMarketLocation('Kansas City, MO'), false);
    assert.equal(isOutOfMarketLocation('Overland Park, KS'), false);
  });

  it('rejects distinctive non-KC cities without requiring state', () => {
    assert.equal(isOutOfMarketLocation('Fort Lauderdale'), true);
    assert.equal(isOutOfMarketLocation('Delray Beach'), true);
    assert.equal(isOutOfMarketLocation('Indianapolis'), true);
  });

  it('rejects City, ST when state is outside MO/KS', () => {
    assert.equal(isOutOfMarketLocation('Delray Beach, FL'), true);
    assert.equal(isOutOfMarketLocation('Indianapolis, IN'), true);
  });

  it('does not guess on ambiguous bare city names', () => {
    assert.equal(isOutOfMarketLocation('Columbia'), false);
    assert.equal(isOutOfMarketLocation('Fayetteville'), false);
  });

  it('does not guess on venue-only labels', () => {
    assert.equal(isOutOfMarketLocation('Limitless Brewing'), false);
    assert.equal(isOutOfMarketLocation('The Levee'), false);
  });

  it('rejects home-state cities that are not KC metro when state is present', () => {
    assert.equal(isOutOfMarketLocation('Columbia, MO'), true);
    assert.equal(isOutOfMarketLocation('Springfield, MO'), true);
  });
});
