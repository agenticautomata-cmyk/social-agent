import { KC_METRO_CENTER } from '../types.js';
import { buildLocationSearchQuery } from '../scoring.js';
import type { LocationSearchContext } from '../types.js';
import type { RawLocationCandidate } from '../scoring.js';
import type { LocationProvider, LocationProviderResult } from './types.js';

function redactSecrets(text: string): string {
  return text.replace(/AIza[0-9A-Za-z_-]{10,}/g, '[REDACTED]');
}

export const GOOGLE_PLACES_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';

export const GOOGLE_PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.googleMapsUri',
  'places.websiteUri',
].join(',');

export function buildGooglePlacesTextSearchRequest(input: {
  query: string;
  apiKey: string;
}): { url: string; method: 'POST'; headers: Record<string, string>; body: string } {
  return {
    url: GOOGLE_PLACES_TEXT_SEARCH_URL,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': input.apiKey,
      'X-Goog-FieldMask': GOOGLE_PLACES_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: input.query,
      languageCode: 'en',
      regionCode: 'US',
      locationBias: {
        circle: {
          center: {
            latitude: KC_METRO_CENTER.latitude,
            longitude: KC_METRO_CENTER.longitude,
          },
          radius: 50000,
        },
      },
    }),
  };
}

type GooglePlacesSearchResponse = {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    googleMapsUri?: string;
    websiteUri?: string;
  }>;
  error?: { message?: string; status?: string };
};

export function parseGooglePlacesSearchResponse(body: unknown): RawLocationCandidate[] {
  const parsed = body as GooglePlacesSearchResponse;
  const places = parsed.places ?? [];
  const candidates: RawLocationCandidate[] = [];
  for (const place of places) {
    const placeId = place.id?.replace(/^places\//, '') ?? '';
    const latitude = place.location?.latitude;
    const longitude = place.location?.longitude;
    if (!placeId || latitude == null || longitude == null) continue;
    candidates.push({
      placeId,
      displayName: place.displayName?.text ?? place.formattedAddress ?? placeId,
      formattedAddress: place.formattedAddress ?? place.displayName?.text ?? '',
      latitude,
      longitude,
      googleMapsUrl:
        place.googleMapsUri ??
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${latitude},${longitude}`,
        )}`,
      websiteUrl: place.websiteUri ?? null,
    });
  }
  return candidates;
}

export class GooglePlacesLocationProvider implements LocationProvider {
  readonly id = 'google_places';

  constructor(private readonly apiKey: string | null | undefined) {}

  async search(context: LocationSearchContext): Promise<LocationProviderResult> {
    if (!this.apiKey?.trim()) {
      return {
        ok: false,
        configured: false,
        providerId: this.id,
        candidates: [],
        errorCode: 'not_configured',
        error: 'Location provider not configured',
      };
    }

    const query = buildLocationSearchQuery(context);
    const request = buildGooglePlacesTextSearchRequest({ query, apiKey: this.apiKey });
    const started = performance.now();

    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      const latencyMs = Math.round(performance.now() - started);

      if (response.status === 429) {
        return {
          ok: false,
          configured: true,
          providerId: this.id,
          candidates: [],
          errorCode: 'rate_limit',
          error: 'Google Places rate limit exceeded',
          diagnostics: {
            httpStatus: response.status,
            latencyMs,
            resultCount: 0,
            success: false,
          },
        };
      }

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = redactSecrets(
          (body as GooglePlacesSearchResponse)?.error?.message ??
            `Google Places request failed (${response.status})`,
        );
        return {
          ok: false,
          configured: true,
          providerId: this.id,
          candidates: [],
          errorCode: 'provider_error',
          error: message,
          diagnostics: {
            httpStatus: response.status,
            latencyMs,
            resultCount: 0,
            success: false,
          },
        };
      }

      const candidates = parseGooglePlacesSearchResponse(body);
      if (candidates.length === 0) {
        return {
          ok: true,
          configured: true,
          providerId: this.id,
          candidates: [],
          errorCode: 'no_results',
          error: 'No matching places found',
          diagnostics: {
            httpStatus: response.status,
            latencyMs,
            resultCount: 0,
            success: true,
          },
        };
      }

      return {
        ok: true,
        configured: true,
        providerId: this.id,
        candidates,
        diagnostics: {
          httpStatus: response.status,
          latencyMs,
          resultCount: candidates.length,
          success: true,
        },
      };
    } catch (err) {
      const latencyMs = Math.round(performance.now() - started);
      return {
        ok: false,
        configured: true,
        providerId: this.id,
        candidates: [],
        errorCode: 'provider_error',
        error: redactSecrets(err instanceof Error ? err.message : String(err)),
        diagnostics: {
          httpStatus: null,
          latencyMs,
          resultCount: 0,
          success: false,
        },
      };
    }
  }
}
