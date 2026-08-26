import { createHash } from 'node:crypto';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems } from '../schema.js';
import { slugify } from './listing-extract.js';
import { isEditorialRoundupUrl } from './editorial-roundup.js';
import { classifyEditorialContainer } from './editorial-container.js';

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
  pageTitle?: string | null,
): boolean {
  if (isEditorialRoundupUrl(pageUrl)) return true;
  const container = classifyEditorialContainer({ url: pageUrl, title: pageTitle, pageText });
  if (container.isContainer && (container.kind === 'listing_hub' || container.kind === 'multi_event_schedule' || container.kind === 'roundup')) {
    return true;
  }
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

/** Operator-facing label for a listing/source page (last title segment, not a generic "Events"). */
export function listingSourceLabel(pageTitle?: string | null, domain?: string | null): string {
  const normalized = (pageTitle ?? '').replace(/&mdash;|&ndash;/gi, '—');
  const segments = normalized
    .split(/\s*[—–|]\s*|\s+-\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    const part = segments[i]!;
    if (part.length >= 3 && !/^(events?|calendar|home|upcoming)$/i.test(part)) return part;
  }
  if (domain) {
    const host = domain.replace(/^www\./i, '');
    const label = host.split('.')[0]?.replace(/-/g, ' ') ?? host;
    return label.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return 'this listing';
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
  // SHA-256 of the full identity key. Do not hex-encode the key itself: every
  // https URL starts with "https://", so Buffer.from(key).toString('hex').slice(0, 16)
  // was always 68747470733a2f2f and unrelated Ask Benson URLs collided.
  const digest = createHash('sha256').update(key).digest('hex').slice(0, 32);
  return `ask-benson-user-event-${digest}`;
}

export type MatchedUserOpportunity = {
  id: string;
  topic: string;
  sourceUrl: string | null;
  sourceExternalId: string | null;
  eventStartsAt: Date | null;
  eventEndsAt: Date | null;
  discoveredAt: Date | null;
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
        discoveredAt: contentItems.discoveredAt,
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
    const urlVariants = new Set([canonicalUrl, input.canonicalUrl ?? '']);
    try {
      const parsed = new URL(canonicalUrl);
      if (!parsed.hostname.startsWith('www.')) {
        parsed.hostname = `www.${parsed.hostname}`;
        urlVariants.add(parsed.toString());
      }
    } catch {
      // ignore
    }
    const [byUrl] = await db
      .select({
        id: contentItems.id,
        topic: contentItems.topic,
        sourceUrl: contentItems.sourceUrl,
        sourceExternalId: contentItems.sourceExternalId,
        eventStartsAt: contentItems.eventStartsAt,
        eventEndsAt: contentItems.eventEndsAt,
        discoveredAt: contentItems.discoveredAt,
        locationName: contentItems.locationName,
        script: contentItems.script,
        metadata: contentItems.metadata,
      })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.sourceId, input.sourceId),
          inArray(
            contentItems.sourceUrl,
            [...urlVariants].filter(Boolean),
          ),
        ),
      )
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
        discoveredAt: contentItems.discoveredAt,
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

    try {
      const host = new URL(canonicalUrl).hostname.replace(/^www\./, '').toLowerCase();
      const entityPrefix = `ask-benson-entity-${slugify(host)}-`;
      const entityRows = await db
        .select({
          id: contentItems.id,
          topic: contentItems.topic,
          sourceUrl: contentItems.sourceUrl,
          sourceExternalId: contentItems.sourceExternalId,
          eventStartsAt: contentItems.eventStartsAt,
          eventEndsAt: contentItems.eventEndsAt,
          discoveredAt: contentItems.discoveredAt,
          locationName: contentItems.locationName,
          script: contentItems.script,
          metadata: contentItems.metadata,
        })
        .from(contentItems)
        .where(
          and(
            eq(contentItems.sourceId, input.sourceId),
            sql`${contentItems.sourceExternalId} LIKE ${`${entityPrefix}%`}`,
          ),
        )
        .limit(4);
      const hostMatches = entityRows.filter((row) => {
        if (!row.sourceUrl) return false;
        try {
          return new URL(row.sourceUrl).hostname.replace(/^www\./, '').toLowerCase() === host;
        } catch {
          return false;
        }
      });
      const unique = hostMatches.length > 0 ? hostMatches : entityRows;
      if (unique.length === 1) {
        return { ...unique[0]!, metadata: (unique[0]!.metadata ?? {}) as Record<string, unknown> };
      }
    } catch {
      // ignore
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
      discoveredAt: contentItems.discoveredAt,
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
