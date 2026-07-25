import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, type ContentItem } from '../schema.js';
import {
  buildLocationSearchQuery,
  decideLocationResolution,
  scoreLocationCandidate,
} from './scoring.js';
import {
  createLocationProvider,
  isLocationProviderConfigured,
  type LocationProvider,
} from './providers/index.js';
import type {
  LocationSearchContext,
  LocationStatus,
  OpportunityLocationRecord,
  ScoredLocationCandidate,
} from './types.js';
import { normalizeLocationStatus } from './types.js';

function stringField(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function flattenMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = { ...metadata };
  for (const value of Object.values(metadata)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(flat, value as Record<string, unknown>);
    }
  }
  return flat;
}

export function buildLocationSearchContext(item: ContentItem): LocationSearchContext {
  const metadata = (item.metadata ?? {}) as Record<string, unknown>;
  const flat = flattenMetadata(metadata);
  const category = stringField(flat, 'category', 'opportunityCategory');
  const onlineHints = ['online', 'virtual', 'webinar', 'livestream'];
  const blob = [item.topic, item.hook, item.script, category].filter(Boolean).join(' ').toLowerCase();

  return {
    venueName: stringField(flat, 'venue') ?? item.locationName,
    businessName: stringField(flat, 'businessName', 'title'),
    address: stringField(flat, 'address'),
    neighborhood: stringField(flat, 'neighborhood'),
    city: stringField(flat, 'city') ?? 'Kansas City',
    state: stringField(flat, 'state') ?? 'MO',
    zip: stringField(flat, 'zip', 'postalCode'),
    sourceUrl: item.sourceUrl,
    organizerAddress: stringField(flat, 'organizerAddress', 'organizer_address'),
    eventVenue: stringField(flat, 'eventVenue', 'event_venue') ?? stringField(flat, 'venue'),
    isOnlineOnly: onlineHints.some((hint) => blob.includes(hint)),
  };
}

function parseCandidates(value: unknown): ScoredLocationCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row) => row && typeof row === 'object') as ScoredLocationCandidate[];
}

function numeric(value: string | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapContentItemToLocationRecord(
  item: ContentItem,
  options?: { providerConfigured?: boolean },
): OpportunityLocationRecord {
  return {
    contentItemId: item.id,
    locationStatus: normalizeLocationStatus(item.locationStatus),
    locationName: item.locationName,
    formattedAddress: item.formattedAddress,
    latitude: numeric(item.locationLat),
    longitude: numeric(item.locationLng),
    googlePlaceId: item.googlePlaceId,
    googleMapsUrl: item.googleMapsUrl,
    locationWebsiteUrl: item.locationWebsiteUrl,
    locationConfidence: numeric(item.locationConfidence),
    locationSource: item.locationSource,
    locationCandidates: parseCandidates(item.locationCandidates),
    locationVerifiedAt: item.locationVerifiedAt?.toISOString() ?? null,
    locationResolutionError: item.locationResolutionError,
    providerConfigured:
      options?.providerConfigured ?? isLocationProviderConfigured(),
  };
}

export async function getOpportunityLocation(contentItemId: string): Promise<OpportunityLocationRecord | null> {
  const item = await db.query.contentItems.findFirst({
    where: eq(contentItems.id, contentItemId),
  });
  if (!item) return null;
  return mapContentItemToLocationRecord(item);
}

async function persistLocationState(
  contentItemId: string,
  patch: Partial<{
    locationStatus: LocationStatus;
    locationName: string | null;
    formattedAddress: string | null;
    locationLat: string | null;
    locationLng: string | null;
    googlePlaceId: string | null;
    googleMapsUrl: string | null;
    locationWebsiteUrl: string | null;
    locationConfidence: string | null;
    locationSource: string | null;
    locationCandidates: ScoredLocationCandidate[];
    locationVerifiedAt: Date | null;
    locationResolutionError: string | null;
  }>,
): Promise<OpportunityLocationRecord> {
  const [updated] = await db
    .update(contentItems)
    .set({
      ...patch,
      locationCandidates: patch.locationCandidates ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(contentItems.id, contentItemId))
    .returning();

  if (!updated) throw new Error('content_item_not_found');
  return mapContentItemToLocationRecord(updated);
}

export async function resolveOpportunityLocation(
  contentItemId: string,
  provider?: LocationProvider,
): Promise<OpportunityLocationRecord> {
  const { record } = await resolveOpportunityLocationWithDiagnostics(contentItemId, provider);
  return record;
}

export function buildProviderDiagnostics(
  providerResult: Awaited<ReturnType<LocationProvider['search']>>,
): {
  providerConfigured: boolean;
  providerId: string;
  httpStatus: number | null;
  resultCount: number;
  latencyMs: number | null;
  success: boolean;
  error: string | null;
} {
  return {
    providerConfigured: providerResult.configured,
    providerId: providerResult.providerId,
    httpStatus: providerResult.diagnostics?.httpStatus ?? null,
    resultCount: providerResult.diagnostics?.resultCount ?? providerResult.candidates.length,
    latencyMs: providerResult.diagnostics?.latencyMs ?? null,
    success: providerResult.ok && !providerResult.errorCode,
    error: providerResult.error ?? null,
  };
}

export async function resolveOpportunityLocationWithDiagnostics(
  contentItemId: string,
  provider?: LocationProvider,
): Promise<{
  record: OpportunityLocationRecord;
  providerDiagnostics: ReturnType<typeof buildProviderDiagnostics>;
}> {
  const item = await db.query.contentItems.findFirst({
    where: eq(contentItems.id, contentItemId),
  });
  if (!item) throw new Error('content_item_not_found');

  const context = buildLocationSearchContext(item);
  if (context.isOnlineOnly) {
    const record = await persistLocationState(contentItemId, {
      locationStatus: 'not_applicable',
      locationResolutionError: null,
      locationCandidates: [],
      locationConfidence: null,
      locationSource: 'system',
    });
    return {
      record,
      providerDiagnostics: {
        providerConfigured: isLocationProviderConfigured(),
        providerId: 'system',
        httpStatus: null,
        resultCount: 0,
        latencyMs: null,
        success: true,
        error: null,
      },
    };
  }

  await persistLocationState(contentItemId, {
    locationStatus: 'resolving',
    locationResolutionError: null,
  });

  const activeProvider = provider ?? createLocationProvider();
  const providerResult = await activeProvider.search(context);
  const patch = processProviderSearchResult(context, providerResult);
  const record = await persistLocationState(contentItemId, patch);
  return {
    record,
    providerDiagnostics: buildProviderDiagnostics(providerResult),
  };
}

export function processProviderSearchResult(
  context: LocationSearchContext,
  providerResult: Awaited<ReturnType<LocationProvider['search']>>,
): Parameters<typeof persistLocationState>[1] {
  if (!providerResult.configured) {
    return {
      locationStatus: 'unresolved',
      locationResolutionError: providerResult.error ?? 'Location provider not configured',
      locationCandidates: [],
      locationSource: providerResult.providerId,
    };
  }

  if (!providerResult.ok && providerResult.errorCode !== 'no_results') {
    return {
      locationStatus: 'unresolved',
      locationResolutionError: providerResult.error ?? 'Location provider error',
      locationCandidates: [],
      locationSource: providerResult.providerId,
    };
  }

  const scored = providerResult.candidates.map((candidate) =>
    scoreLocationCandidate(candidate, context),
  );
  const decision = decideLocationResolution(scored, context);

  if (decision.status === 'resolved' && decision.selected) {
    const selected = decision.selected;
    return {
      locationStatus: 'resolved',
      locationName: selected.displayName,
      formattedAddress: selected.formattedAddress,
      locationLat: String(selected.latitude),
      locationLng: String(selected.longitude),
      googlePlaceId: selected.placeId,
      googleMapsUrl: selected.googleMapsUrl,
      locationWebsiteUrl: selected.websiteUrl ?? null,
      locationConfidence: decision.confidence != null ? String(decision.confidence) : null,
      locationSource: providerResult.providerId,
      locationCandidates: scored,
      locationResolutionError: null,
      locationVerifiedAt: null,
    };
  }

  if (decision.status === 'needs_review') {
    return {
      locationStatus: 'needs_review',
      locationCandidates: scored,
      locationConfidence: decision.confidence != null ? String(decision.confidence) : null,
      locationSource: providerResult.providerId,
      locationResolutionError: null,
      googlePlaceId: null,
      googleMapsUrl: null,
      locationWebsiteUrl: null,
      formattedAddress: null,
      locationLat: null,
      locationLng: null,
    };
  }

  return {
    locationStatus: 'unresolved',
    locationCandidates: scored,
    locationConfidence: decision.confidence != null ? String(decision.confidence) : null,
    locationSource: providerResult.providerId,
    locationResolutionError: providerResult.error ?? 'No credible location match',
    googlePlaceId: null,
    googleMapsUrl: null,
    locationWebsiteUrl: null,
    formattedAddress: null,
    locationLat: null,
    locationLng: null,
  };
}

export async function selectOpportunityLocationCandidate(
  contentItemId: string,
  placeId: string,
): Promise<OpportunityLocationRecord> {
  const item = await db.query.contentItems.findFirst({
    where: eq(contentItems.id, contentItemId),
  });
  if (!item) throw new Error('content_item_not_found');

  const candidates = parseCandidates(item.locationCandidates);
  const selected = candidates.find((candidate) => candidate.placeId === placeId);
  if (!selected) throw new Error('candidate_not_found');

  return persistLocationState(contentItemId, {
    locationStatus: 'resolved',
    locationName: selected.displayName,
    formattedAddress: selected.formattedAddress,
    locationLat: String(selected.latitude),
    locationLng: String(selected.longitude),
    googlePlaceId: selected.placeId,
    googleMapsUrl: selected.googleMapsUrl,
    locationWebsiteUrl: selected.websiteUrl ?? null,
    locationConfidence: String(selected.score),
    locationSource: item.locationSource ?? 'manual_selection',
    locationCandidates: candidates,
    locationResolutionError: null,
    locationVerifiedAt: null,
  });
}

export async function markOpportunityLocationVerified(
  contentItemId: string,
): Promise<OpportunityLocationRecord> {
  const item = await db.query.contentItems.findFirst({
    where: eq(contentItems.id, contentItemId),
  });
  if (!item) throw new Error('content_item_not_found');
  if (!item.googlePlaceId && !item.formattedAddress) {
    throw new Error('location_not_resolved');
  }

  return persistLocationState(contentItemId, {
    locationStatus: 'verified',
    locationVerifiedAt: new Date(),
    locationResolutionError: null,
  });
}

export async function clearOpportunityLocation(contentItemId: string): Promise<OpportunityLocationRecord> {
  return persistLocationState(contentItemId, {
    locationStatus: 'unresolved',
    locationName: null,
    formattedAddress: null,
    locationLat: null,
    locationLng: null,
    googlePlaceId: null,
    googleMapsUrl: null,
    locationWebsiteUrl: null,
    locationConfidence: null,
    locationSource: null,
    locationCandidates: [],
    locationVerifiedAt: null,
    locationResolutionError: null,
  });
}

export async function markOpportunityLocationNotApplicable(
  contentItemId: string,
): Promise<OpportunityLocationRecord> {
  return persistLocationState(contentItemId, {
    locationStatus: 'not_applicable',
    locationResolutionError: null,
    locationCandidates: [],
    locationConfidence: null,
    locationSource: 'manual',
    googlePlaceId: null,
    googleMapsUrl: null,
    locationWebsiteUrl: null,
    formattedAddress: null,
    locationLat: null,
    locationLng: null,
    locationVerifiedAt: null,
  });
}

export { buildLocationSearchQuery };
