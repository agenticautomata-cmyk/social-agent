import type { ContentItem } from '../schema.js';
import { formatIsoDate } from '../datetime.js';

export type FactValidation = {
  missingFields: string[];
  unverifiedFields: string[];
  warnings: string[];
  isExpired: boolean;
  verificationStatus: 'verified' | 'partial' | 'unverified' | 'expired';
};

export type OpportunityFacts = {
  title: string;
  summary: string | null;
  eventDate: string | null;
  eventEndDate: string | null;
  location: string | null;
  sourceUrl: string | null;
  priceOrOffer: string | null;
  restrictions: string | null;
  sourceAttribution: string | null;
  firsthandVisited: boolean;
  metadata: Record<string, unknown>;
};

function stringMeta(metadata: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = metadata[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

export function extractOpportunityFacts(
  item: Pick<
    ContentItem,
    | 'topic'
    | 'hook'
    | 'script'
    | 'eventStartsAt'
    | 'eventEndsAt'
    | 'locationName'
    | 'sourceUrl'
    | 'metadata'
    | 'firsthandVisited'
  >,
): OpportunityFacts {
  const metadata = (item.metadata ?? {}) as Record<string, unknown>;
  return {
    title: item.topic,
    summary: item.script ?? item.hook,
    eventDate: item.eventStartsAt?.toISOString() ?? null,
    eventEndDate: item.eventEndsAt?.toISOString() ?? null,
    location: item.locationName ?? stringMeta(metadata, 'address', 'venue', 'neighborhood'),
    sourceUrl: item.sourceUrl,
    priceOrOffer: stringMeta(metadata, 'price', 'offer', 'dealTerms', 'priceOrOffer'),
    restrictions: stringMeta(metadata, 'restrictions', 'eligibility', 'finePrint'),
    sourceAttribution:
      stringMeta(metadata, 'sourceName', 'publisher') ??
      (typeof metadata.ingest === 'string' ? metadata.ingest.replace(/_/g, ' ') : null),
    firsthandVisited: item.firsthandVisited,
    metadata,
  };
}

export function validateOpportunityFacts(facts: OpportunityFacts, now = new Date()): FactValidation {
  const missingFields: string[] = [];
  const unverifiedFields: string[] = [];
  const warnings: string[] = [];

  if (!facts.eventDate) missingFields.push('event date');
  if (!facts.location) missingFields.push('location');
  if (!facts.sourceUrl) missingFields.push('source URL');
  if (!facts.priceOrOffer) unverifiedFields.push('pricing or offer');
  if (!facts.restrictions) unverifiedFields.push('restrictions or eligibility');

  let isExpired = false;
  if (facts.eventEndDate) {
    isExpired = new Date(facts.eventEndDate).getTime() < now.getTime();
  } else if (facts.eventDate) {
    const event = new Date(facts.eventDate);
    isExpired = event.getTime() < now.getTime() - 24 * 60 * 60 * 1000;
  }

  if (isExpired) {
    warnings.push(
      facts.eventDate
        ? `Event date ${formatIsoDate(facts.eventDate)} may have passed — verify before posting.`
        : 'This announcement may be expired — verify dates before posting.',
    );
  }

  if (!facts.summary?.trim()) {
    unverifiedFields.push('summary details');
  }

  let verificationStatus: FactValidation['verificationStatus'] = 'verified';
  if (isExpired) verificationStatus = 'expired';
  else if (missingFields.length > 0) verificationStatus = 'unverified';
  else if (unverifiedFields.length > 0) verificationStatus = 'partial';

  return {
    missingFields,
    unverifiedFields,
    warnings,
    isExpired,
    verificationStatus,
  };
}
