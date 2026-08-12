import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterActive, type ContactLookup } from './recommendations.js';
import type { InventoryItem, InventoryFlags } from '../inventory/normalize.js';
import type { SponsorContactStatus } from '../sponsor-outreach/constants.js';

const DEFAULT_FLAGS: InventoryFlags = {
  sponsorFriendly: true,
  luxury: false,
  dining: false,
  dateNight: false,
  estateSale: false,
  businessOpening: false,
  freeEvent: false,
  celebrityCharity: false,
  sports: false,
  reddit: false,
  worldCup: false,
  shopping: false,
  retail: false,
  vendorMarket: false,
  collector: false,
};

function fixtureItem(id: string, overrides: Partial<InventoryItem> = {}): InventoryItem {
  const now = new Date().toISOString();
  return {
    id,
    title: `Test business ${id}`,
    summary: null,
    sourceName: 'test-source',
    sourceType: 'rss',
    category: null,
    state: 'active',
    eventDate: null,
    eventEndDate: null,
    discoveredAt: now,
    createdAt: now,
    updatedAt: now,
    venue: null,
    businessName: `Test Business ${id}`,
    neighborhood: null,
    address: null,
    locationName: null,
    locationStatus: null,
    formattedAddress: null,
    locationLat: null,
    locationLng: null,
    googlePlaceId: null,
    googleMapsUrl: null,
    locationWebsiteUrl: null,
    locationConfidence: null,
    locationSource: null,
    locationVerifiedAt: null,
    locationResolutionError: null,
    sourceUrl: 'https://example.com/test',
    ingest: null,
    flags: { ...DEFAULT_FLAGS },
    badges: [],
    audienceScore: 50,
    whyItMatters: 'Test fixture',
    metadata: {},
    relevanceScore: null,
    urgencyScore: null,
    coverageFormat: null,
    suggestedCoverageFormat: null,
    firsthandVisited: false,
    creatorValueStatus: null,
    lifecycleStatus: null,
    ...overrides,
  };
}

function contactLookupWith(itemId: string, status: SponsorContactStatus): ContactLookup {
  const map: ContactLookup = new Map();
  map.set(itemId, { id: `contact-${itemId}`, status, sponsorFitScore: null });
  return map;
}

describe('sponsor-intelligence filterActive — P9 lifecycle awareness (no "Finish pitch" once contacted)', () => {
  it('excludes a business once real outreach has actually happened (sent/replied/follow_up_needed/converted)', () => {
    const alreadyEngaged: SponsorContactStatus[] = ['sent', 'replied', 'follow_up_needed', 'converted'];
    for (const status of alreadyEngaged) {
      const item = fixtureItem(`engaged-${status}`);
      const lookup = contactLookupWith(item.id, status);
      const active = filterActive([item], lookup);
      assert.equal(active.length, 0, `expected status "${status}" to be excluded from sponsor-candidate ranking`);
    }
  });

  it('still excludes explicitly dismissed businesses (not_interested)', () => {
    const item = fixtureItem('dismissed-1');
    const lookup = contactLookupWith(item.id, 'not_interested');
    assert.equal(filterActive([item], lookup).length, 0);
  });

  it('keeps businesses that have not been contacted yet eligible (lead / ready_to_contact / scheduled)', () => {
    const notYetContacted: SponsorContactStatus[] = ['lead', 'ready_to_contact', 'scheduled'];
    for (const status of notYetContacted) {
      const item = fixtureItem(`fresh-${status}`);
      const lookup = contactLookupWith(item.id, status);
      const active = filterActive([item], lookup);
      assert.equal(active.length, 1, `expected status "${status}" to remain eligible for a first pitch`);
    }
  });

  it('keeps businesses with no sponsor contact record at all eligible', () => {
    const item = fixtureItem('no-contact-yet');
    const active = filterActive([item], new Map());
    assert.equal(active.length, 1);
  });
});
