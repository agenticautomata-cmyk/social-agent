import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeCommandCenter, isGenericTicketResaleListing } from './command-center.js';
import type { InventoryItem } from './normalize.js';

function baseItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Union Station exhibit',
    summary: null,
    sourceName: 'Visit KC',
    sourceType: 'visitkc',
    category: 'event',
    state: 'planned',
    eventDate: '2026-08-15T18:00:00.000Z',
    eventEndDate: null,
    discoveredAt: '2026-08-01T12:00:00.000Z',
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    venue: 'Union Station',
    businessName: null,
    neighborhood: 'Downtown',
    address: null,
    locationName: 'Union Station Kansas City',
    locationStatus: 'resolved',
    formattedAddress: '30 W Pershing Rd, Kansas City, MO',
    locationLat: 39.0854,
    locationLng: -94.5859,
    googlePlaceId: 'union-station',
    googleMapsUrl: 'https://maps.google.com/?q=Union+Station',
    locationWebsiteUrl: null,
    locationConfidence: 0.86,
    locationSource: 'google',
    locationVerifiedAt: null,
    locationResolutionError: null,
    sourceUrl: null,
    ingest: null,
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
    audienceScore: 8,
    whyItMatters: 'Free community event — high traffic, lower sponsor fit.',
    metadata: {},
    relevanceScore: '4',
    urgencyScore: '2',
    coverageFormat: 'field_visit',
    suggestedCoverageFormat: null,
    firsthandVisited: false,
    creatorValueStatus: 'creator_candidate',
    lifecycleStatus: 'active',
    ...overrides,
  } as InventoryItem;
}

describe('isGenericTicketResaleListing', () => {
  it('flags a raw Ticketmaster listing with only a category fallback reason', () => {
    const item = baseItem({
      title: 'J. Cole Tickets, 2026-2027 Concert Tour Dates | Ticketmaster',
      sourceName: 'J. Cole Tickets, 2026 Concert Tour Dates | Ticketmaster',
      category: 'concert',
      whyItMatters: 'Category: concert.',
    });
    assert.equal(isGenericTicketResaleListing(item), true);
  });

  it('does not flag a Ticketmaster-sourced item with substantive reasoning', () => {
    const item = baseItem({
      title: 'Chiefs watch party — Ticketmaster box office pop-up',
      sourceName: 'Ticketmaster',
      whyItMatters: 'KC sports audience — Chiefs/Royals/Sporting KC adjacency.',
    });
    assert.equal(isGenericTicketResaleListing(item), false);
  });

  it('does not flag ordinary non-reseller opportunities', () => {
    const item = baseItem();
    assert.equal(isGenericTicketResaleListing(item), false);
  });
});

describe('computeCommandCenter ticket-resale exclusion', () => {
  it('excludes generic ticket-reseller listings from every section', () => {
    const junk = baseItem({
      id: '00000000-0000-4000-8000-000000000002',
      title: 'J. Cole Tickets, 2026-2027 Concert Tour Dates | Ticketmaster',
      sourceName: 'Ticketmaster',
      category: 'concert',
      whyItMatters: 'Category: concert.',
      audienceScore: 9,
    });
    const good = baseItem();
    const result = computeCommandCenter([good, junk], { now: new Date('2026-08-01T12:00:00.000Z') });
    for (const section of Object.values(result.sections)) {
      assert.ok(
        section.items.every((card) => card.id !== junk.id),
        `expected ${junk.id} to be excluded from every command center section`,
      );
    }
  });
});
