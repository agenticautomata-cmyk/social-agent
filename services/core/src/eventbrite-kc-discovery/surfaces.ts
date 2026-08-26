/** Public Eventbrite Kansas City discovery surfaces — no account / API. */

export type EventbriteDiscoverySurfaceId =
  | 'city'
  | 'food'
  | 'music'
  | 'business'
  | 'festivals'
  | 'family'
  | 'arts';

export type EventbriteDiscoverySurface = {
  id: EventbriteDiscoverySurfaceId;
  label: string;
  url: string;
};

/**
 * Exactly the bounded public surfaces for first-class Eventbrite KC discovery.
 * Redirects (e.g. /d/… → /b/…) are followed by the HTTP client.
 */
export const EVENTBRITE_KC_DISCOVERY_SURFACES: readonly EventbriteDiscoverySurface[] = [
  {
    id: 'city',
    label: 'Kansas City city events',
    url: 'https://www.eventbrite.com/d/mo--kansas-city/events/',
  },
  {
    id: 'food',
    label: 'food-and-drink',
    url: 'https://www.eventbrite.com/d/mo--kansas-city/food-and-drink--events/',
  },
  {
    id: 'music',
    label: 'music',
    url: 'https://www.eventbrite.com/d/mo--kansas-city/music--events/',
  },
  {
    id: 'business',
    label: 'business',
    url: 'https://www.eventbrite.com/d/mo--kansas-city/business--events/',
  },
  {
    id: 'festivals',
    label: 'fairs-festivals',
    url: 'https://www.eventbrite.com/d/mo--kansas-city/fairs-festivals--events/',
  },
  {
    id: 'family',
    label: 'family-and-education',
    url: 'https://www.eventbrite.com/d/mo--kansas-city/family-and-education--events/',
  },
  {
    id: 'arts',
    label: 'arts',
    url: 'https://www.eventbrite.com/d/mo--kansas-city/arts--events/',
  },
] as const;

/** Hard caps for a single discovery run. */
export const EVENTBRITE_KC_MAX_SURFACES = 7;
export const EVENTBRITE_KC_MAX_UNIQUE_EVENT_IDS = 100;
export const EVENTBRITE_KC_MAX_DETAIL_FETCHES = 100;

export const EVENTBRITE_KC_SOURCE_NAME = 'Eventbrite Kansas City';
export const EVENTBRITE_KC_INGEST = 'eventbrite_public_discovery';
