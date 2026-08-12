import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { InventoryItem } from '../inventory/normalize.js';
import {
  buildSourceInventoryItemCard,
  filterItemsBySourceProvenance,
  viewSourceItemsLabel,
} from './source-items.js';

function baseItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'item-1',
    title: '2026 CommUNITY Fest',
    summary: 'Community festival in Kansas City.',
    sourceName: '2026 CommUNITY Fest',
    sourceType: 'scrape',
    category: 'community_event',
    state: 'new',
    eventDate: '2026-08-15T17:00:00.000Z',
    eventEndDate: null,
    discoveredAt: '2026-08-12T12:00:00.000Z',
    createdAt: '2026-08-12T12:00:00.000Z',
    updatedAt: '2026-08-12T12:00:00.000Z',
    venue: 'Swope Park',
    businessName: null,
    neighborhood: null,
    address: null,
    locationName: 'Swope Park',
    locationStatus: 'resolved',
    formattedAddress: null,
    locationLat: null,
    locationLng: null,
    googlePlaceId: null,
    googleMapsUrl: null,
    locationWebsiteUrl: null,
    locationConfidence: null,
    locationSource: null,
    locationVerifiedAt: '2026-08-12T12:00:00.000Z',
    locationResolutionError: null,
    sourceUrl: 'https://example.com/community-fest',
    ingest: 'scrape',
    flags: {
      sponsorFriendly: false,
      luxury: false,
      dining: false,
      dateNight: false,
      estateSale: false,
      businessOpening: false,
      freeEvent: true,
      celebrityCharity: false,
      sports: false,
      reddit: false,
      worldCup: false,
      shopping: false,
      retail: false,
      vendorMarket: false,
      collector: false,
    },
    badges: [],
    audienceScore: 50,
    whyItMatters: 'Local community festival worth covering.',
    metadata: {},
    relevanceScore: null,
    urgencyScore: null,
    coverageFormat: null,
    suggestedCoverageFormat: null,
    firsthandVisited: false,
    creatorValueStatus: 'relevant',
    lifecycleStatus: 'upcoming',
    ...overrides,
  };
}

describe('source items provenance + labels', () => {
  it('viewSourceItemsLabel matches operator copy', () => {
    assert.equal(viewSourceItemsLabel(0), '');
    assert.equal(viewSourceItemsLabel(1), 'View 1 item');
    assert.equal(viewSourceItemsLabel(3), 'View 3 items');
  });

  it('filterItemsBySourceProvenance drops foreign source rows', () => {
    const rows = [
      { id: 'a', rowSourceId: 'source-a' },
      { id: 'b', rowSourceId: 'source-b' },
      { id: 'c', rowSourceId: null },
    ];
    const kept = filterItemsBySourceProvenance(rows, 'source-a');
    assert.deepEqual(
      kept.map((r) => r.id),
      ['a'],
    );
  });

  it('buildSourceInventoryItemCard retains sourceId and lane CTA fields', () => {
    const card = buildSourceInventoryItemCard(baseItem(), 'source-community');
    assert.equal(card.sourceId, 'source-community');
    assert.equal(card.id, 'item-1');
    assert.ok(card.displayTitle);
    assert.ok(card.laneLabel);
    assert.ok(card.primaryAction.label);
    assert.equal(card.viewSourceUrl, 'https://example.com/community-fest');
    assert.match(card.freshness.label, /upcoming|location verified/i);
  });

  it('boulevard-style tasting keeps venue and why', () => {
    const card = buildSourceInventoryItemCard(
      baseItem({
        id: 'item-blvd',
        title: '420 Munchie + Beer Tasting',
        sourceName: '420 Munchie + Beer Tasting / Boulevard Brewing',
        businessName: 'Boulevard Brewing',
        venue: 'Boulevard Brewing Company',
        sourceUrl: 'https://example.com/boulevard-tasting',
        whyItMatters: 'Local brewery tasting with clear filming angle.',
      }),
      'source-blvd',
    );
    assert.equal(card.sourceId, 'source-blvd');
    assert.match(card.whereLabel ?? '', /Boulevard/i);
    assert.ok(card.whySummary.length > 0);
  });
});
