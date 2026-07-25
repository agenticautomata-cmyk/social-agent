import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMapGroupKey,
  buildMapOpportunities,
  computeMapDateRange,
  groupMapPinsByLocation,
  isExpiredMapOpportunity,
  isMapExcludedContentState,
  isOnlineOnlyMapOpportunity,
  sortMapPins,
  toMapOpportunityPin,
  type MapOpportunitySource,
} from './map-opportunities.js';

function baseItem(overrides: Partial<MapOpportunitySource> = {}): MapOpportunitySource {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Union Station exhibit',
    summary: null,
    sourceName: 'Visit KC',
    sourceType: 'visitkc',
    category: 'event',
    state: 'planned',
    eventDate: '2026-07-25T18:00:00.000Z',
    eventEndDate: null,
    discoveredAt: '2026-07-19T12:00:00.000Z',
    createdAt: '2026-07-19T12:00:00.000Z',
    updatedAt: '2026-07-19T12:00:00.000Z',
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
    audienceScore: 2,
    whyItMatters: 'Free community event',
    metadata: {},
    relevanceScore: '4',
    urgencyScore: '2',
    coverageFormat: 'field_visit',
    suggestedCoverageFormat: null,
    firsthandVisited: false,
    creatorValueStatus: 'creator_candidate',
    lifecycleStatus: 'active',
    locationCandidates: null,
    ...overrides,
  };
}

describe('map opportunity filters', () => {
  const now = new Date('2026-07-19T15:00:00.000Z');

  it('includes resolved and verified opportunities with coordinates', () => {
    const result = buildMapOpportunities(
      [baseItem(), baseItem({ id: '2', locationStatus: 'verified' })],
      new Map(),
      { datePreset: 'next_30_days' },
      'soonest',
      now,
    );
    assert.equal(result.visibleCount, 2);
    assert.equal(result.hiddenUnresolvedCount, 0);
  });

  it('excludes unresolved and not_applicable opportunities by default', () => {
    const result = buildMapOpportunities(
      [
        baseItem({ locationStatus: 'unresolved', locationLat: null, locationLng: null }),
        baseItem({ id: '2', locationStatus: 'not_applicable', locationLat: null, locationLng: null }),
      ],
      new Map(),
      { datePreset: 'next_30_days' },
      'soonest',
      now,
    );
    assert.equal(result.visibleCount, 0);
    assert.equal(result.hiddenUnresolvedCount, 1);
    assert.equal(result.hiddenNotApplicableCount, 1);
  });

  it('optionally includes needs_review opportunities with candidate coordinates', () => {
    const result = buildMapOpportunities(
      [
        baseItem({
          locationStatus: 'needs_review',
          locationLat: null,
          locationLng: null,
          locationCandidates: [
            {
              placeId: 'starbucks-1',
              displayName: 'Starbucks',
              formattedAddress: 'Main St',
              latitude: 39.05,
              longitude: -94.58,
              googleMapsUrl: 'https://maps.google.com/?q=starbucks',
              score: 0.42,
            },
          ],
        }),
      ],
      new Map(),
      { datePreset: 'next_30_days', locationStatus: 'include_needs_review' },
      'soonest',
      now,
    );
    assert.equal(result.visibleCount, 1);
    assert.equal(result.pins[0]?.needsReviewPin, true);
  });

  it('filters by date preset and coverage format', () => {
    const result = buildMapOpportunities(
      [
        baseItem({ eventDate: '2026-07-19T18:00:00.000Z', coverageFormat: 'field_visit' }),
        baseItem({
          id: '2',
          eventDate: '2026-08-01T18:00:00.000Z',
          coverageFormat: 'green_screen',
        }),
      ],
      new Map(),
      { datePreset: 'today', coverageFormat: 'field_visit' },
      'soonest',
      now,
    );
    assert.equal(result.visibleCount, 1);
    assert.equal(result.pins[0]?.coverageFormat, 'field_visit');
  });

  it('groups multiple opportunities at one venue', () => {
    const shared = {
      locationLat: 39.0418,
      locationLng: -94.5894,
      googlePlaceId: 'plaza',
      locationName: 'Country Club Plaza',
    };
    const pins = [
      toMapOpportunityPin(baseItem(shared), {
        latitude: shared.locationLat,
        longitude: shared.locationLng,
        formattedAddress: 'Country Club Plaza',
        googleMapsUrl: null,
        locationName: shared.locationName,
        needsReviewPin: false,
      }),
      toMapOpportunityPin(baseItem({ id: '2', title: 'Plaza pop-up', ...shared }), {
        latitude: shared.locationLat,
        longitude: shared.locationLng,
        formattedAddress: 'Country Club Plaza',
        googleMapsUrl: null,
        locationName: shared.locationName,
        needsReviewPin: false,
      }),
    ];
    const groups = groupMapPinsByLocation(pins);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.opportunities.length, 2);
    assert.equal(buildMapGroupKey(shared.locationLat, shared.locationLng, shared.googlePlaceId), groups[0]?.groupKey);
  });

  it('sorts by score and preserves google maps url', () => {
    const low = baseItem({ id: 'low', relevanceScore: '1', urgencyScore: '0' });
    const high = baseItem({ id: 'high', relevanceScore: '8', urgencyScore: '4' });
    const result = buildMapOpportunities([low, high], new Map(), { datePreset: 'next_30_days' }, 'highest_score', now);
    assert.equal(result.pins[0]?.id, 'high');
    assert.match(result.pins[0]?.googleMapsUrl ?? '', /maps\.google\.com/);
    assert.equal(result.pins[0]?.detailUrl, '/review/inventory?id=high');
  });

  it('counts unresolved upcoming opportunities separately from visible pins', () => {
    const result = buildMapOpportunities(
      [
        baseItem(),
        baseItem({
          id: '2',
          title: 'Needs review',
          locationStatus: 'needs_review',
          locationLat: null,
          locationLng: null,
        }),
      ],
      new Map(),
      { datePreset: 'next_30_days' },
      'soonest',
      now,
    );
    assert.equal(result.visibleCount, 1);
    assert.equal(result.hiddenUnresolvedCount, 1);
  });

  it('excludes expired and rejected opportunities', () => {
    assert.equal(isMapExcludedContentState('script_rejected'), true);
    assert.equal(
      isExpiredMapOpportunity(
        { eventDate: '2026-07-10T18:00:00.000Z', eventEndDate: null },
        now,
        'America/Chicago',
      ),
      true,
    );
    assert.equal(isOnlineOnlyMapOpportunity(baseItem({ summary: 'Join us online for a webinar' })), true);
  });

  it('supports nearest sort using stored coordinates only', () => {
    const downtown = toMapOpportunityPin(baseItem(), {
      latitude: 39.0997,
      longitude: -94.5786,
      formattedAddress: 'Downtown',
      googleMapsUrl: null,
      locationName: 'Downtown',
      needsReviewPin: false,
    });
    const overland = toMapOpportunityPin(baseItem({ id: '2', title: 'Overland Park' }), {
      latitude: 38.9822,
      longitude: -94.6708,
      formattedAddress: 'Overland Park',
      googleMapsUrl: null,
      locationName: 'Overland Park',
      needsReviewPin: false,
    });
    const sorted = sortMapPins([overland, downtown], 'nearest', { latitude: 39.0997, longitude: -94.5786 });
    assert.equal(sorted[0]?.title, 'Union Station exhibit');
  });

  it('supports URL-style filter combinations for date and filming selection', () => {
    const plannerMap = new Map([
      [
        '00000000-0000-4000-8000-000000000001',
        {
          contentItemId: '00000000-0000-4000-8000-000000000001',
          listName: 'Today',
          notes: null,
          priority: 0,
          plannedDate: '2026-07-19',
          dueDate: null,
          contentAngle: null,
          status: 'planned' as const,
          followUpAt: null,
          draftCaption: null,
          postedUrl: null,
          postedAt: null,
          createdAt: '2026-07-19T12:00:00.000Z',
          updatedAt: '2026-07-19T12:00:00.000Z',
        },
      ],
    ]);
    const result = buildMapOpportunities(
      [baseItem()],
      plannerMap,
      { datePreset: 'next_7_days', selectedForFilming: true },
      'soonest',
      now,
    );
    assert.equal(result.visibleCount, 1);
    assert.equal(result.pins[0]?.selectedForFilming, true);
  });
});

describe('map browser configuration', () => {
  it('treats missing browser key as unconfigured', async () => {
    const { isGoogleMapsBrowserKeyConfigured } = await import('./map-query.js');
    assert.equal(isGoogleMapsBrowserKeyConfigured(''), false);
    assert.equal(isGoogleMapsBrowserKeyConfigured('   '), false);
    assert.equal(isGoogleMapsBrowserKeyConfigured('abc'), true);
  });

  it('persists filters in URL query strings', async () => {
    const { parseMapFiltersFromSearchParams, buildMapPageQuery } = await import('./map-query.js');
    const params = new URLSearchParams('datePreset=today&locationStatus=include_needs_review&sort=nearest');
    const filters = parseMapFiltersFromSearchParams(params);
    assert.equal(filters.datePreset, 'today');
    assert.equal(filters.locationStatus, 'include_needs_review');
    assert.equal(
      buildMapPageQuery(filters, 'abc'),
      '?datePreset=today&locationStatus=include_needs_review&sort=nearest&selected=abc',
    );
  });
});

describe('map security expectations', () => {
  it('does not reference private Google Places server key names in map module', () => {
    const source = `
      ${buildMapOpportunities.toString()}
      ${toMapOpportunityPin.toString()}
    `;
    assert.doesNotMatch(source, /GOOGLE_PLACES_API_KEY/);
  });
});
