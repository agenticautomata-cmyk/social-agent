import { env } from '../../env.js';
import { GooglePlacesLocationProvider } from './google-places.js';
import { MockLocationProvider } from './mock.js';
import type { LocationProvider } from './types.js';

export function createLocationProvider(options?: { forceMock?: boolean }): LocationProvider {
  if (options?.forceMock || env.LOCATION_PROVIDER !== 'google') {
    return new MockLocationProvider();
  }
  return new GooglePlacesLocationProvider(env.GOOGLE_PLACES_API_KEY);
}

export function isLocationProviderConfigured(options?: { forceMock?: boolean }): boolean {
  if (options?.forceMock) return true;
  if (env.LOCATION_PROVIDER === 'google') {
    return Boolean(env.GOOGLE_PLACES_API_KEY?.trim());
  }
  return true;
}

export function activeLocationProviderId(): string {
  return env.LOCATION_PROVIDER === 'google' ? 'google_places' : 'mock';
}

export * from './types.js';
export * from './google-places.js';
export * from './mock.js';
export * from './mock-fixtures.js';
