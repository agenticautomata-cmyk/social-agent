import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stripBensonPrefix, normalizeEntityName, normalizeBusinessKey } from './normalize.js';
import { enrichmentBlocksVisit } from './enrichment.js';
import type { BusinessEnrichment } from './types.js';

describe('creator interest normalize', () => {
  it('strips [Benson] prefix from source titles', () => {
    assert.equal(
      stripBensonPrefix('[Benson] Frosty Frogs | Water Ice & Candy Store in Kansas City, MO'),
      'Frosty Frogs | Water Ice & Candy Store in Kansas City, MO',
    );
  });

  it('prefers business name over source title', () => {
    assert.equal(
      normalizeEntityName({
        sourceName: '[Benson] Frosty Frogs | Water Ice & Candy Store in Kansas City, MO',
        businessName: 'Frosty Frogs',
        title: 'Frosty Frogs Water Ice',
      }),
      'Frosty Frogs',
    );
  });

  it('dedupes business keys for Frosty Frogs variants', () => {
    const a = normalizeBusinessKey('Frosty Frogs');
    const b = normalizeBusinessKey('Frosty Frogs Water Ice');
    assert.notEqual(a, b);
    assert.equal(normalizeBusinessKey('Frosty Frogs'), normalizeBusinessKey('frosty frogs'));
  });
});

describe('enrichment visit gate', () => {
  it('blocks visit when business is permanently closed', () => {
    const enrichment = {
      currentlyOpen: { value: false, status: 'verified', source: 'web' },
      researchSummary: 'Storefront closed during relocation.',
    } as BusinessEnrichment;
    assert.equal(enrichmentBlocksVisit(enrichment), true);
  });

  it('allows visit when open status unknown but not closed', () => {
    const enrichment = {
      currentlyOpen: { value: null, status: 'needs_confirmation', source: null },
      researchSummary: 'Pop-ups still available.',
    } as BusinessEnrichment;
    assert.equal(enrichmentBlocksVisit(enrichment), false);
  });
});
