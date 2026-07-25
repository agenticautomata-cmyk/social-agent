import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ContentItem } from '../schema.js';
import {
  buildLocationSearchContext,
  mapContentItemToLocationRecord,
  processProviderSearchResult,
} from './service.js';
import { MockLocationProvider } from './providers/mock.js';
import { GooglePlacesLocationProvider, parseGooglePlacesSearchResponse } from './providers/google-places.js';
import { normalizeLocationStatus } from './types.js';

function baseContentItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    campaignId: '00000000-0000-4000-8000-000000000002',
    industryId: null,
    personaId: null,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    topic: 'Sample opportunity',
    topicEmbedding: null,
    hook: null,
    script: null,
    cta: null,
    durationSeconds: null,
    captionInstagram: null,
    captionTiktok: null,
    hashtagsInstagram: null,
    hashtagsTiktok: null,
    heygenVideoId: null,
    heygenVideoUrl: null,
    finalVideoUrl: null,
    plannedForDate: null,
    scheduledFor: null,
    publishedAt: null,
    scriptApprovedAt: null,
    scriptApprovedBy: null,
    scriptRejectionReason: null,
    lastError: null,
    retryCount: 0,
    metadata: {},
    sourceId: null,
    sourceExternalId: null,
    sourceUrl: null,
    discoveredAt: null,
    relevanceScore: null,
    urgencyScore: null,
    eventStartsAt: null,
    eventEndsAt: null,
    locationName: 'Union Station',
    locationLat: null,
    locationLng: null,
    locationStatus: null,
    googlePlaceId: null,
    formattedAddress: null,
    googleMapsUrl: null,
    locationWebsiteUrl: null,
    locationConfidence: null,
    locationSource: null,
    locationCandidates: null,
    locationVerifiedAt: null,
    locationResolutionError: null,
    rawPayload: null,
    firstSeenAt: null,
    lastSeenAt: null,
    sourceLastCheckedAt: null,
    stale: false,
    freshnessBucket: null,
    coverageFormat: null,
    suggestedCoverageFormat: null,
    firsthandVisited: false,
    creatorValueStatus: 'hidden_raw_signal',
    lifecycleStatus: 'active',
    creatorRelevanceExplanation: [],
    contentCategory: null,
    classificationVerifiedAt: null,
    canonicalEntityId: null,
    creatorNextAction: null,
    topPickValidatedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('backward compatibility', () => {
  it('keeps existing opportunities valid without location resolution fields', () => {
    const record = mapContentItemToLocationRecord(baseContentItem(), { providerConfigured: true });
    assert.equal(record.locationStatus, 'unresolved');
    assert.equal(record.locationName, 'Union Station');
    assert.equal(record.googlePlaceId, null);
    assert.deepEqual(record.locationCandidates, []);
  });
});

describe('provider configuration', () => {
  it('returns provider not configured without crashing when API key is missing', async () => {
    const provider = new GooglePlacesLocationProvider(undefined);
    const result = await provider.search({ businessName: 'Union Station', city: 'Kansas City' });
    assert.equal(result.configured, false);
    assert.equal(result.errorCode, 'not_configured');
    assert.match(result.error ?? '', /not configured/i);
  });
});

describe('mock provider resolution flows', () => {
  it('resolves an exact Kansas City venue', async () => {
    const provider = new MockLocationProvider();
    const context = {
      venueName: 'Union Station',
      address: '30 W Pershing Rd, Kansas City, MO 64108',
      city: 'Kansas City',
      state: 'MO',
    };
    const providerResult = await provider.search(context);
    const patch = processProviderSearchResult(context, providerResult);
    assert.equal(patch.locationStatus, 'resolved');
    assert.equal(patch.googlePlaceId, 'mock-union-station');
  });

  it('returns needs_review for ambiguous chain locations', async () => {
    const provider = new MockLocationProvider();
    const context = { businessName: 'Starbucks', city: 'Kansas City', state: 'MO' };
    const providerResult = await provider.search(context);
    const patch = processProviderSearchResult(context, providerResult);
    assert.equal(patch.locationStatus, 'needs_review');
    assert.ok((patch.locationCandidates ?? []).length >= 2);
  });

  it('handles event venue versus organizer address', async () => {
    const provider = new MockLocationProvider();
    const context = {
      eventVenue: 'Kauffman Center for the Performing Arts',
      organizerAddress: '123 Main St, Kansas City, MO 64105',
      city: 'Kansas City',
      state: 'MO',
    };
    const providerResult = await provider.search(context);
    const patch = processProviderSearchResult(context, providerResult);
    // Venue name should win over organizer office when only one strong name match exists
    assert.equal(patch.locationStatus, 'resolved');
    assert.equal(patch.googlePlaceId, 'mock-kauffman');
  });

  it('marks online-only opportunities as not applicable', () => {
    const context = buildLocationSearchContext(
      baseContentItem({
        topic: 'Virtual creator workshop',
        script: 'Join us online for a livestream event',
      }),
    );
    assert.equal(context.isOnlineOnly, true);
  });

  it('handles no-result behavior', async () => {
    const provider = new MockLocationProvider();
    const context = { businessName: 'Nowhere Cafe', city: 'Kansas City', state: 'MO' };
    const providerResult = await provider.search(context);
    const patch = processProviderSearchResult(context, providerResult);
    assert.equal(patch.locationStatus, 'unresolved');
    assert.match(patch.locationResolutionError ?? '', /No matching places/i);
  });

  it('handles provider failure', async () => {
    const provider = new MockLocationProvider();
    const context = { businessName: 'Provider Outage Test', city: 'Kansas City', state: 'MO' };
    const providerResult = await provider.search(context);
    const patch = processProviderSearchResult(context, providerResult);
    assert.equal(patch.locationStatus, 'unresolved');
    assert.match(patch.locationResolutionError ?? '', /outage/i);
  });

  it('handles rate limit responses', async () => {
    const provider = new MockLocationProvider();
    const context = { businessName: 'Rate Limit Test', city: 'Kansas City', state: 'MO' };
    const providerResult = await provider.search(context);
    assert.equal(providerResult.errorCode, 'rate_limit');
  });
});

describe('manual location actions', () => {
  it('supports candidate selection patch shape', () => {
    const candidate = {
      placeId: 'mock-q39-south',
      displayName: 'Q39 South',
      formattedAddress: '1100 E 39th St, Kansas City, MO 64110, USA',
      latitude: 39.0572,
      longitude: -94.5771,
      googleMapsUrl: 'https://maps.example/q39-south',
      websiteUrl: 'https://q39kc.com',
      score: 0.91,
      scoreBreakdown: { name: 0.2 },
    };
    const patch = {
      locationStatus: 'resolved' as const,
      locationName: candidate.displayName,
      formattedAddress: candidate.formattedAddress,
      locationLat: String(candidate.latitude),
      locationLng: String(candidate.longitude),
      googlePlaceId: candidate.placeId,
      googleMapsUrl: candidate.googleMapsUrl,
      locationWebsiteUrl: candidate.websiteUrl ?? null,
      locationConfidence: String(candidate.score),
      locationSource: 'manual_selection',
      locationCandidates: [candidate],
      locationResolutionError: null,
      locationVerifiedAt: null,
    };
    assert.equal(patch.locationStatus, 'resolved');
    assert.equal(patch.googlePlaceId, 'mock-q39-south');
  });

  it('supports verified, clear, and not-applicable statuses', () => {
    assert.equal(normalizeLocationStatus('verified'), 'verified');
    assert.equal(normalizeLocationStatus(null), 'unresolved');
    assert.equal(normalizeLocationStatus('not_applicable'), 'not_applicable');
  });
});

describe('google places adapter structure', () => {
  it('parses search responses into candidates', () => {
    const candidates = parseGooglePlacesSearchResponse({
      places: [
        {
          id: 'places/ChIJ123',
          displayName: { text: 'Union Station Kansas City' },
          formattedAddress: '30 W Pershing Rd, Kansas City, MO 64108, USA',
          location: { latitude: 39.0854, longitude: -94.5859 },
          googleMapsUri: 'https://maps.google.com/?cid=123',
          websiteUri: 'https://unionstation.org',
        },
      ],
    });
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.placeId, 'ChIJ123');
    assert.equal(candidates[0]?.displayName, 'Union Station Kansas City');
  });
});

describe('read-only detail behavior', () => {
  it('does not require provider calls when mapping stored location state', () => {
    const record = mapContentItemToLocationRecord(
      baseContentItem({
        locationStatus: 'resolved',
        googlePlaceId: 'mock-union-station',
        formattedAddress: '30 W Pershing Rd, Kansas City, MO 64108, USA',
        locationLat: '39.0854',
        locationLng: '-94.5859',
      }),
      { providerConfigured: false },
    );
    assert.equal(record.locationStatus, 'resolved');
    assert.equal(record.providerConfigured, false);
  });
});
