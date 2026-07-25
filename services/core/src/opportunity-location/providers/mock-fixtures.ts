import type { LocationSearchContext } from '../types.js';
import type { RawLocationCandidate } from '../scoring.js';

export type MockFixtureId =
  | 'exact_kc_venue'
  | 'chain_multiple_locations'
  | 'event_venue_not_organizer'
  | 'incomplete_new_business'
  | 'neighborhood_event'
  | 'online_only'
  | 'no_match'
  | 'api_failure'
  | 'rate_limit'
  | 'ambiguous_chain';

export type MockFixture = {
  id: MockFixtureId;
  label: string;
  match: (context: LocationSearchContext) => boolean;
  result:
    | { type: 'candidates'; candidates: RawLocationCandidate[] }
    | { type: 'error'; errorCode: 'no_results' | 'provider_error' | 'rate_limit'; error: string };
};

const FIXTURES: MockFixture[] = [
  {
    id: 'online_only',
    label: 'Online-only opportunity',
    match: (ctx) => Boolean(ctx.isOnlineOnly),
    result: { type: 'candidates', candidates: [] },
  },
  {
    id: 'api_failure',
    label: 'API failure',
    match: (ctx) => normalize(ctx.businessName).includes('provider outage'),
    result: { type: 'error', errorCode: 'provider_error', error: 'Mock provider outage' },
  },
  {
    id: 'rate_limit',
    label: 'Rate limit',
    match: (ctx) => normalize(ctx.businessName).includes('rate limit test'),
    result: { type: 'error', errorCode: 'rate_limit', error: 'Mock rate limit exceeded' },
  },
  {
    id: 'no_match',
    label: 'No match',
    match: (ctx) => normalize(ctx.businessName).includes('nowhere cafe'),
    result: { type: 'error', errorCode: 'no_results', error: 'No matching places found' },
  },
  {
    id: 'exact_kc_venue',
    label: 'Exact Kansas City venue',
    match: (ctx) =>
      normalize(ctx.address).includes('1900 baltimore') ||
      normalize(ctx.venueName).includes('union station'),
    result: {
      type: 'candidates',
      candidates: [
        {
          placeId: 'mock-union-station',
          displayName: 'Union Station Kansas City',
          formattedAddress: '30 W Pershing Rd, Kansas City, MO 64108, USA',
          latitude: 39.0854,
          longitude: -94.5859,
          googleMapsUrl: 'https://maps.google.com/?cid=mock-union-station',
          websiteUrl: 'https://unionstation.org',
        },
      ],
    },
  },
  {
    id: 'chain_multiple_locations',
    label: 'Restaurant chain with several metro locations',
    match: (ctx) => normalize(ctx.businessName).includes('q39'),
    result: {
      type: 'candidates',
      candidates: [
        {
          placeId: 'mock-q39-south',
          displayName: 'Q39 South',
          formattedAddress: '1100 E 39th St, Kansas City, MO 64110, USA',
          latitude: 39.0572,
          longitude: -94.5771,
          googleMapsUrl: 'https://maps.google.com/?cid=mock-q39-south',
          websiteUrl: 'https://q39kc.com',
        },
        {
          placeId: 'mock-q39-midtown',
          displayName: 'Q39 Midtown',
          formattedAddress: '1000 West 47th St, Kansas City, MO 64112, USA',
          latitude: 39.0416,
          longitude: -94.5988,
          googleMapsUrl: 'https://maps.google.com/?cid=mock-q39-midtown',
          websiteUrl: 'https://q39kc.com',
        },
        {
          placeId: 'mock-q39-overland',
          displayName: 'Q39 Overland Park',
          formattedAddress: '7700 Metcalf Ave, Overland Park, KS 66204, USA',
          latitude: 38.9881,
          longitude: -94.6677,
          googleMapsUrl: 'https://maps.google.com/?cid=mock-q39-overland',
          websiteUrl: 'https://q39kc.com',
        },
      ],
    },
  },
  {
    id: 'ambiguous_chain',
    label: 'Ambiguous chain results',
    match: (ctx) => normalize(ctx.businessName).includes('starbucks'),
    result: {
      type: 'candidates',
      candidates: [
        {
          placeId: 'mock-starbucks-plaza',
          displayName: 'Starbucks',
          formattedAddress: '4706 Broadway Blvd, Kansas City, MO 64112, USA',
          latitude: 39.0448,
          longitude: -94.5901,
          googleMapsUrl: 'https://maps.google.com/?cid=mock-starbucks-plaza',
          websiteUrl: 'https://starbucks.com',
        },
        {
          placeId: 'mock-starbucks-ward',
          displayName: 'Starbucks',
          formattedAddress: '8600 Ward Pkwy, Kansas City, MO 64114, USA',
          latitude: 38.9264,
          longitude: -94.6064,
          googleMapsUrl: 'https://maps.google.com/?cid=mock-starbucks-ward',
          websiteUrl: 'https://starbucks.com',
        },
      ],
    },
  },
  {
    id: 'event_venue_not_organizer',
    label: 'Event at venue different from organizer',
    match: (ctx) =>
      normalize(ctx.eventVenue).includes('kauffman center') &&
      (normalize(ctx.organizerAddress).includes('main street') ||
        normalize(ctx.organizerAddress).includes('main st')),
    result: {
      type: 'candidates',
      candidates: [
        {
          placeId: 'mock-kauffman',
          displayName: 'Kauffman Center for the Performing Arts',
          formattedAddress: '1601 Broadway Blvd, Kansas City, MO 64108, USA',
          latitude: 39.0942,
          longitude: -94.5876,
          googleMapsUrl: 'https://maps.google.com/?cid=mock-kauffman',
          websiteUrl: 'https://kauffmancenter.org',
        },
        {
          placeId: 'mock-organizer-office',
          displayName: 'Downtown Arts Alliance Office',
          formattedAddress: '123 Main St, Kansas City, MO 64105, USA',
          latitude: 39.1012,
          longitude: -94.5841,
          googleMapsUrl: 'https://maps.google.com/?cid=mock-organizer-office',
          websiteUrl: 'https://downtownarts.example.org',
        },
      ],
    },
  },
  {
    id: 'incomplete_new_business',
    label: 'New business with incomplete address',
    match: (ctx) => normalize(ctx.businessName).includes('new bakery brookside'),
    result: {
      type: 'candidates',
      candidates: [
        {
          placeId: 'mock-brookside-bakery',
          displayName: 'Brookside Bakery',
          formattedAddress: '6320 Brookside Plaza, Kansas City, MO 64113, USA',
          latitude: 39.0298,
          longitude: -94.5947,
          googleMapsUrl: 'https://maps.google.com/?cid=mock-brookside-bakery',
          websiteUrl: null,
        },
      ],
    },
  },
  {
    id: 'neighborhood_event',
    label: 'Neighborhood-wide event',
    match: (ctx) => normalize(ctx.neighborhood).includes('crossroads') && !ctx.address,
    result: {
      type: 'candidates',
      candidates: [
        {
          placeId: 'mock-crossroads-district',
          displayName: 'Crossroads Arts District',
          formattedAddress: 'Crossroads, Kansas City, MO 64108, USA',
          latitude: 39.0924,
          longitude: -94.5836,
          googleMapsUrl: 'https://maps.google.com/?cid=mock-crossroads',
          websiteUrl: 'https://crossroadskc.org',
        },
      ],
    },
  },
];

function normalize(value: string | null | undefined): string {
  return (value ?? '').toLowerCase();
}

export function listMockFixtures(): Array<{ id: MockFixtureId; label: string }> {
  return FIXTURES.map(({ id, label }) => ({ id, label }));
}

export function resolveMockFixture(context: LocationSearchContext): MockFixture | null {
  for (const fixture of FIXTURES) {
    if (fixture.match(context)) return fixture;
  }
  return null;
}

export function mockCandidatesForContext(context: LocationSearchContext): MockFixture['result'] {
  const fixture = resolveMockFixture(context);
  if (fixture) return fixture.result;

  if (context.address && normalize(context.address).includes('1900 baltimore')) {
    return FIXTURES.find((f) => f.id === 'exact_kc_venue')!.result;
  }

  return { type: 'error', errorCode: 'no_results', error: 'No matching places found' };
}
