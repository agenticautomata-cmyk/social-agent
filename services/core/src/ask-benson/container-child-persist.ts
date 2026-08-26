import { createHash } from 'node:crypto';
import { getLocalCalendarDay } from '../datetime.js';
import { isDateOnlyTimestamp } from '../creator-agent/temporal-state.js';
import { parseEventDate, slugify } from './listing-extract.js';
import { normalizeCanonicalEventUrl, normalizeOpportunityTitle } from './url-intake-dedupe.js';

export type ContainerChildMatchInput = {
  title: string;
  eventStartsAt: Date | null;
  /** Extracted naive/local eventDate before UTC conversion (preferred for identity). */
  eventDate?: string | null;
  venue?: string | null;
  listingUrl?: string | null;
};

/**
 * Shared-hub child identity day: intended local/source calendar day, not UTC day of eventStartsAt.
 * Prefers the YYYY-MM-DD prefix from extracted eventDate; falls back to stored instant semantics.
 */
export function listingContainerLocalDayKey(input: {
  eventDate?: string | null;
  eventStartsAt?: Date | null;
}): string | null {
  const raw = input.eventDate?.trim();
  if (raw) {
    const dateOnly = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateOnly) return dateOnly[1]!;
  }
  const at = input.eventStartsAt;
  if (!at) return null;
  if (isDateOnlyTimestamp(at)) {
    return at.toISOString().slice(0, 10);
  }
  return getLocalCalendarDay(at);
}

/** @deprecated Prefer listingContainerLocalDayKey — UTC slice caused late-local-night collapse. */
export function listingContainerDayKey(eventStartsAt: Date | null | undefined): string | null {
  return listingContainerLocalDayKey({ eventStartsAt });
}

/**
 * Durable listing/container child `sourceExternalId`.
 *
 * Formula (index-free):
 *   `{ingest}-{sha256(listingUrl)[0:16]}-{slugify(title)}-{localDay|undated}-{slugify(venue)|novenue}`
 *
 * Local day is the intended source calendar day (`listingContainerLocalDayKey`), not a UTC slice
 * and not extraction/card/DOM/array index.
 *
 * Distinct child detail URLs are NOT hashed into this id. Persist prefers an exact `sourceUrl`
 * match when the child already has a stable native/detail URL (see scrape-listing urlHit).
 */
export function buildListingContainerChildExternalId(input: {
  ingest: string;
  listingUrl: string;
  title: string;
  eventDate?: string | null;
  venue?: string | null;
}): string {
  const listingKey = createHash('sha256').update(input.listingUrl.trim()).digest('hex').slice(0, 16);
  const dateKey = listingContainerLocalDayKey({ eventDate: input.eventDate }) ?? 'undated';
  const venueKey = slugify(input.venue ?? '') || 'novenue';
  const titleKey = slugify(input.title) || 'untitled';
  return `${input.ingest}-${listingKey}-${titleKey}-${dateKey}-${venueKey}`;
}

/**
 * Listing scrape `sourceExternalId` for every non-discount row.
 *
 * Child events always use {@link buildListingContainerChildExternalId}.
 * Parent hub rows use listing-hash + `parent` + title slug — also index-free.
 *
 * Legacy UNSTABLE formula (do not use):
 *   `{ingest}-{sha256(listingUrl)[0:16]}-{extractionIndex}-{slugify(title)}`
 */
export function resolveListingScrapeExternalId(input: {
  ingest: string;
  listingUrl: string;
  title: string;
  eventDate?: string | null;
  venue?: string | null;
  isParentContainerRow?: boolean;
}): string {
  if (input.isParentContainerRow) {
    const listingKey = createHash('sha256').update(input.listingUrl.trim()).digest('hex').slice(0, 16);
    return `${input.ingest}-${listingKey}-parent-${slugify(input.title) || 'listing'}`;
  }
  return buildListingContainerChildExternalId({
    ingest: input.ingest,
    listingUrl: input.listingUrl,
    title: input.title,
    eventDate: input.eventDate,
    venue: input.venue,
  });
}

/** Distinct child detail/native URL — persist match key, not a durable-id component. */
export function listingChildHasStableDetailUrl(
  listingUrl: string,
  childSourceUrl?: string | null,
): boolean {
  const child = childSourceUrl?.trim();
  if (!child) return false;
  return !listingUrlsEquivalent(child, listingUrl);
}

export function listingUrlsEquivalent(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  if (a.trim() === b.trim()) return true;
  return normalizeCanonicalEventUrl(a) === normalizeCanonicalEventUrl(b);
}

export function containerChildrenShareIdentity(
  left: ContainerChildMatchInput,
  right: {
    topic: string;
    eventStartsAt: Date | null;
    eventDate?: string | null;
    locationName?: string | null;
  },
): boolean {
  if (normalizeOpportunityTitle(left.title) !== normalizeOpportunityTitle(right.topic)) return false;
  const leftDay = listingContainerLocalDayKey({
    eventDate: left.eventDate,
    eventStartsAt: left.eventStartsAt,
  });
  const rightDay = listingContainerLocalDayKey({
    eventDate: right.eventDate,
    eventStartsAt: right.eventStartsAt,
  });
  if (leftDay && rightDay && leftDay !== rightDay) return false;
  const leftVenue = normalizeOpportunityTitle(left.venue);
  const rightVenue = normalizeOpportunityTitle(right.locationName);
  if (
    leftVenue &&
    rightVenue &&
    leftVenue !== rightVenue &&
    !leftVenue.includes(rightVenue) &&
    !rightVenue.includes(leftVenue)
  ) {
    return false;
  }
  return true;
}
