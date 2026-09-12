import type { InventoryItem } from '../../inventory/normalize.js';
import type { CalendarAdmissionCandidate } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export type AdmissionCuratorLeadInput = {
  id: string;
  eventName: string;
  eventDate: string | null;
  eventTime: string | null;
  venue: string | null;
  neighborhood: string | null;
  dayHeading?: string | null;
  originalQuotedText?: string | null;
  verificationStatus: string;
  discoveredViaHandle: string;
  discoveredViaPostUrl: string;
  officialOrganizerUrl: string | null;
  officialVenueUrl: string | null;
  ticketUrl: string | null;
  officialSocialUrl: string | null;
  watcherId: string;
};

/** Map inventory → admission candidate (shared by projection + migration). */
export function admissionCandidateFromInventory(item: InventoryItem): CalendarAdmissionCandidate {
  const meta = item.metadata ?? {};
  const extracted = isRecord(meta.extracted) ? meta.extracted : null;
  const fromEvidence = item.temporalEvidence;
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    description: item.summary,
    venue: item.venue,
    locationName: item.locationName,
    formattedAddress: item.formattedAddress,
    neighborhood: item.neighborhood,
    businessName: item.businessName,
    sourceUrl: item.sourceUrl,
    sourceName: item.sourceName,
    eventDate: item.eventDate,
    eventEndDate: item.eventEndDate,
    extractedEventDate:
      extractedString(fromEvidence?.eventDate) ?? extractedString(extracted?.eventDate),
    extractedEventEndDate:
      extractedString(fromEvidence?.eventEndDate) ?? extractedString(extracted?.eventEndDate),
    extractedStartTime:
      extractedString(fromEvidence?.startTime) ?? extractedString(extracted?.startTime),
    publicationDate:
      extractedString(meta.publicationDate) ??
      extractedString(meta.publishedAt) ??
      item.discoveredAt,
    retrievalDate: item.updatedAt ?? item.discoveredAt,
    yearExplicit:
      typeof meta.yearExplicit === 'boolean'
        ? meta.yearExplicit
        : typeof meta.dateYearExplicit === 'boolean'
          ? meta.dateYearExplicit
          : null,
    parser: extractedString(meta.parser) ?? extractedString(meta.extractionParser),
    ingest: item.ingest,
    category: item.category,
    attribution: item.sourceName,
    lifecycleStatus: item.lifecycleStatus,
    creatorValueStatus: item.creatorValueStatus,
    metadata: meta,
    watchlistVerified: /watchlist_verified/i.test(item.ingest ?? ''),
    userConfirmed: meta.userConfirmed === true || meta.manuallyPlanned === true,
  };
}

export function admissionCandidateFromCuratorLead(
  lead: AdmissionCuratorLeadInput,
): CalendarAdmissionCandidate {
  return {
    id: lead.id,
    title: lead.eventName,
    summary: lead.originalQuotedText,
    venue: lead.venue,
    locationName: lead.neighborhood,
    neighborhood: lead.neighborhood,
    sourceUrl:
      lead.officialOrganizerUrl ||
      lead.ticketUrl ||
      lead.officialVenueUrl ||
      lead.officialSocialUrl ||
      lead.discoveredViaPostUrl,
    sourceName: `Instagram @${lead.discoveredViaHandle.replace(/^@/, '')}`,
    eventDate: lead.eventDate,
    extractedEventDate: lead.eventDate,
    extractedStartTime: lead.eventTime,
    attribution: `@${lead.discoveredViaHandle.replace(/^@/, '')}`,
    ingest: 'instagram_watchlist',
    watchlistVerified:
      lead.verificationStatus === 'VERIFIED' || lead.verificationStatus === 'PARTIALLY_VERIFIED',
    metadata: {
      dayHeading: lead.dayHeading,
      watcherId: lead.watcherId,
    },
  };
}

export function admissionCandidateFromScoutPromote(input: {
  title: string;
  eventUrl: string;
  startAt: Date;
  endAt?: Date | null;
  venue?: string | null;
  city?: string | null;
  address?: string | null;
  platform?: string | null;
}): CalendarAdmissionCandidate {
  return {
    title: input.title,
    venue: input.venue,
    locationName: input.city,
    formattedAddress: input.address,
    city: input.city,
    sourceUrl: input.eventUrl,
    sourceName: input.platform ?? 'Watchlist',
    eventDate: input.startAt.toISOString(),
    eventEndDate: input.endAt ? input.endAt.toISOString() : null,
    extractedEventDate: input.startAt.toISOString().slice(0, 10),
    ingest: 'watchlist_verified',
    parser: input.platform ?? 'watchlist',
    watchlistVerified: true,
    attribution: 'Watchlist verified',
  };
}
