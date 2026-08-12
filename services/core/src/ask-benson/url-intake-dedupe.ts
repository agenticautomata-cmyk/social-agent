import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems } from '../schema.js';
import { slugify } from './listing-extract.js';

const TICKET_EVENT_HOSTS = new Set(['eventbrite.com', 'www.eventbrite.com']);

export function extractEventbriteEventId(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/e\/[^/]+-(\d+)\/?$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function normalizeCanonicalEventUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    parsed.hash = '';
    parsed.search = '';
    parsed.hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
    let path = parsed.pathname.replace(/\/+$/, '');
    if (path.endsWith('/tickets')) path = path.replace(/\/tickets$/, '');
    parsed.pathname = path || '/';
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

export function normalizeOpportunityTitle(title: string | null | undefined): string {
  return (title ?? '')
    .toLowerCase()
    .replace(/&amp;|&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isDirectEventListingUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (TICKET_EVENT_HOSTS.has(host) || host === 'eventbrite.com') {
      return /\/e\//.test(parsed.pathname);
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Multi-event listing/source pages (e.g. /events calendars). Extract individual events;
 * do not create one durable opportunity named after the listing page.
 */
export function isEventListingSourcePage(
  pageUrl: string,
  pageText?: string | null,
): boolean {
  try {
    const path = new URL(pageUrl).pathname.toLowerCase();
    if (/\/events?(?:\/|$)/.test(path) || /\/calendar(?:\/|$)/.test(path)) {
      return true;
    }
  } catch {
    // ignore
  }

  const text = pageText ?? '';
  if (!text.trim()) return false;
  const listingCue =
    /\bupcoming events\b/i.test(text) ||
    ((text.match(/\bview event\b/gi) ?? []).length >= 2 &&
      (text.match(/\brsvp\b/gi) ?? []).length >= 1);
  const datedItems = (
    text.match(
      /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?\b/gi,
    ) ?? []
  ).length;
  return listingCue && datedItems >= 2;
}

export function buildUserOpportunityExternalId(input: {
  eventbriteEventId?: string | null;
  canonicalUrl?: string | null;
  title?: string | null;
  eventDateIso?: string | null;
  venue?: string | null;
}): string {
  if (input.eventbriteEventId) {
    return `ask-benson-user-event-eb-${input.eventbriteEventId}`;
  }
  const key = [
    normalizeCanonicalEventUrl(input.canonicalUrl ?? '') ?? '',
    normalizeOpportunityTitle(input.title),
    input.eventDateIso?.slice(0, 10) ?? '',
    normalizeOpportunityTitle(input.venue),
  ].join('|');
  const hash = Buffer.from(key).toString('hex').slice(0, 16);
  return `ask-benson-user-event-${hash}`;
}

export type MatchedUserOpportunity = {
  id: string;
  topic: string;
  sourceUrl: string | null;
  sourceExternalId: string | null;
  eventStartsAt: Date | null;
  eventEndsAt: Date | null;
  locationName: string | null;
  script: string | null;
  metadata: Record<string, unknown> | null;
};

export async function findMatchingUserOpportunity(input: {
  sourceId: string;
  eventbriteEventId?: string | null;
  canonicalUrl?: string | null;
  title?: string | null;
  eventDate?: Date | null;
  venue?: string | null;
}): Promise<MatchedUserOpportunity | null> {
  const eventbriteEventId = input.eventbriteEventId ?? extractEventbriteEventId(input.canonicalUrl ?? '');
  if (eventbriteEventId) {
    const [byEb] = await db
      .select({
        id: contentItems.id,
        topic: contentItems.topic,
        sourceUrl: contentItems.sourceUrl,
        sourceExternalId: contentItems.sourceExternalId,
        eventStartsAt: contentItems.eventStartsAt,
        eventEndsAt: contentItems.eventEndsAt,
        locationName: contentItems.locationName,
        script: contentItems.script,
        metadata: contentItems.metadata,
      })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.sourceId, input.sourceId),
          sql`${contentItems.metadata}->>'eventbriteEventId' = ${eventbriteEventId}`,
        ),
      )
      .limit(1);
    if (byEb) return { ...byEb, metadata: (byEb.metadata ?? {}) as Record<string, unknown> };
  }

  const canonicalUrl = normalizeCanonicalEventUrl(input.canonicalUrl ?? '');
  if (canonicalUrl) {
    const [byUrl] = await db
      .select({
        id: contentItems.id,
        topic: contentItems.topic,
        sourceUrl: contentItems.sourceUrl,
        sourceExternalId: contentItems.sourceExternalId,
        eventStartsAt: contentItems.eventStartsAt,
        eventEndsAt: contentItems.eventEndsAt,
        locationName: contentItems.locationName,
        script: contentItems.script,
        metadata: contentItems.metadata,
      })
      .from(contentItems)
      .where(and(eq(contentItems.sourceId, input.sourceId), eq(contentItems.sourceUrl, canonicalUrl)))
      .limit(1);
    if (byUrl) return { ...byUrl, metadata: (byUrl.metadata ?? {}) as Record<string, unknown> };

    const [byCanonicalMeta] = await db
      .select({
        id: contentItems.id,
        topic: contentItems.topic,
        sourceUrl: contentItems.sourceUrl,
        sourceExternalId: contentItems.sourceExternalId,
        eventStartsAt: contentItems.eventStartsAt,
        eventEndsAt: contentItems.eventEndsAt,
        locationName: contentItems.locationName,
        script: contentItems.script,
        metadata: contentItems.metadata,
      })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.sourceId, input.sourceId),
          sql`${contentItems.metadata}->>'canonicalEventUrl' = ${canonicalUrl}`,
        ),
      )
      .limit(1);
    if (byCanonicalMeta) {
      return { ...byCanonicalMeta, metadata: (byCanonicalMeta.metadata ?? {}) as Record<string, unknown> };
    }
  }

  const normalizedTitle = normalizeOpportunityTitle(input.title);
  if (!normalizedTitle) return null;

  const dateKey = input.eventDate ? input.eventDate.toISOString().slice(0, 10) : null;
  const venueKey = normalizeOpportunityTitle(input.venue);

  const candidates = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      sourceUrl: contentItems.sourceUrl,
      sourceExternalId: contentItems.sourceExternalId,
      eventStartsAt: contentItems.eventStartsAt,
      eventEndsAt: contentItems.eventEndsAt,
      locationName: contentItems.locationName,
      script: contentItems.script,
      metadata: contentItems.metadata,
    })
    .from(contentItems)
    .where(
      and(
        eq(contentItems.sourceId, input.sourceId),
        or(
          sql`${contentItems.metadata}->>'ingest' = 'ask_benson_link'`,
          sql`${contentItems.sourceExternalId} LIKE 'ask-benson-%'`,
        ),
      ),
    )
    .limit(500);

  for (const row of candidates) {
    if (normalizeOpportunityTitle(row.topic) !== normalizedTitle) continue;
    const rowDate = row.eventStartsAt?.toISOString().slice(0, 10) ?? null;
    if (dateKey && rowDate && dateKey !== rowDate) continue;
    const rowVenue = normalizeOpportunityTitle(row.locationName);
    if (venueKey && rowVenue && venueKey !== rowVenue && !rowVenue.includes(venueKey) && !venueKey.includes(rowVenue)) {
      continue;
    }
    return { ...row, script: row.script ?? null, metadata: (row.metadata ?? {}) as Record<string, unknown> };
  }

  return null;
}

export function preferCanonicalSourceUrl(current: string | null | undefined, candidate: string | null | undefined): string | null {
  const currentEb = extractEventbriteEventId(current ?? '');
  const candidateEb = extractEventbriteEventId(candidate ?? '');
  if (candidateEb && !currentEb) return normalizeCanonicalEventUrl(candidate);
  if (currentEb && candidateEb && currentEb === candidateEb) {
    return normalizeCanonicalEventUrl(current) ?? normalizeCanonicalEventUrl(candidate);
  }
  if (candidateEb) return normalizeCanonicalEventUrl(candidate);
  return normalizeCanonicalEventUrl(current) ?? normalizeCanonicalEventUrl(candidate) ?? current ?? candidate ?? null;
}

export function mergeOpportunityTopic(current: string, incoming: string): string {
  return incoming.length > current.length ? incoming : current;
}

export function mergeOpportunityScript(current: string | null | undefined, incoming: string | null | undefined): string | null {
  const a = current?.trim() ?? '';
  const b = incoming?.trim() ?? '';
  if (!a) return b || null;
  if (!b) return a || null;
  if (a.includes(b)) return a;
  if (b.includes(a)) return b;
  return `${a}\n\n${b}`.slice(0, 4000);
}

export function titleSlugForExternalId(title: string): string {
  return slugify(title);
}
