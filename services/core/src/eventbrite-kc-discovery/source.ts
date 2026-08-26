import { and, desc, eq, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { campaigns, contentItems, sources } from '../schema.js';
import {
  buildUserOpportunityExternalId,
  normalizeOpportunityTitle,
} from '../ask-benson/url-intake-dedupe.js';
import { EVENTBRITE_KC_INGEST, EVENTBRITE_KC_SOURCE_NAME } from './surfaces.js';

export async function defaultCampaignId(): Promise<string> {
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.active, true))
    .orderBy(desc(campaigns.createdAt))
    .limit(1);
  if (!campaign) throw new Error('No active campaign found');
  return campaign.id;
}

export async function getOrCreateEventbriteKcSource(campaignId: string): Promise<string> {
  const existing = await db.query.sources.findFirst({
    where: and(
      eq(sources.campaignId, campaignId),
      eq(sources.type, 'manual'),
      eq(sources.name, EVENTBRITE_KC_SOURCE_NAME),
    ),
  });
  if (existing) return existing.id;

  const [created] = await db
    .insert(sources)
    .values({
      campaignId,
      type: 'manual',
      name: EVENTBRITE_KC_SOURCE_NAME,
      config: {
        ingest: EVENTBRITE_KC_INGEST,
        place: 'mo--kansas-city',
        discoveryMode: 'public_html_itemlist',
      },
      active: true,
    })
    .returning({ id: sources.id });

  return created!.id;
}

export type ExistingEventTwin = {
  id: string;
  topic: string;
  sourceUrl: string | null;
  sourceExternalId: string | null;
  eventStartsAt: Date | null;
  locationName: string | null;
  ingest: string | null;
  eventbriteEventId: string | null;
  matchKind: 'eventbrite_id' | 'external_id' | 'title_date_near';
};

/**
 * Campaign-wide lookup for an Eventbrite id (any source).
 * Safe read for dry-run + persist dedupe before insert.
 */
export async function findExistingByEventbriteId(
  eventbriteEventId: string,
): Promise<ExistingEventTwin | null> {
  const externalId = buildUserOpportunityExternalId({ eventbriteEventId });
  const [row] = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      sourceUrl: contentItems.sourceUrl,
      sourceExternalId: contentItems.sourceExternalId,
      eventStartsAt: contentItems.eventStartsAt,
      locationName: contentItems.locationName,
      metadata: contentItems.metadata,
    })
    .from(contentItems)
    .where(
      or(
        sql`${contentItems.metadata}->>'eventbriteEventId' = ${eventbriteEventId}`,
        eq(contentItems.sourceExternalId, externalId),
        sql`${contentItems.sourceUrl} ILIKE ${'%' + eventbriteEventId + '%'}`,
      ),
    )
    .limit(1);

  if (!row) return null;
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    topic: row.topic,
    sourceUrl: row.sourceUrl,
    sourceExternalId: row.sourceExternalId,
    eventStartsAt: row.eventStartsAt,
    locationName: row.locationName,
    ingest: typeof meta.ingest === 'string' ? meta.ingest : null,
    eventbriteEventId:
      typeof meta.eventbriteEventId === 'string' ? meta.eventbriteEventId : eventbriteEventId,
    matchKind:
      meta.eventbriteEventId === eventbriteEventId || row.sourceExternalId === externalId
        ? meta.eventbriteEventId === eventbriteEventId
          ? 'eventbrite_id'
          : 'external_id'
        : 'eventbrite_id',
  };
}

/**
 * Best-effort cross-source near-match (title + local calendar day).
 * Used for reporting only — does not merge/stamp provenance.
 * Limitation: findMatchingUserOpportunity is Share Intake–scoped and cannot
 * safely attach Eventbrite ids onto downtownop/Ticketmaster scrape_listing twins.
 */
export async function findTitleDateNearTwin(input: {
  title: string;
  eventStartsAt: Date | null;
}): Promise<ExistingEventTwin | null> {
  if (!input.eventStartsAt) return null;
  const day = input.eventStartsAt.toISOString().slice(0, 10);
  const titleKey = normalizeOpportunityTitle(input.title);
  if (titleKey.length < 8) return null;

  const rows = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      sourceUrl: contentItems.sourceUrl,
      sourceExternalId: contentItems.sourceExternalId,
      eventStartsAt: contentItems.eventStartsAt,
      locationName: contentItems.locationName,
      metadata: contentItems.metadata,
    })
    .from(contentItems)
    .where(sql`(${contentItems.eventStartsAt}::date) = ${day}::date`)
    .limit(40);

  for (const row of rows) {
    if (normalizeOpportunityTitle(row.topic) !== titleKey) continue;
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      topic: row.topic,
      sourceUrl: row.sourceUrl,
      sourceExternalId: row.sourceExternalId,
      eventStartsAt: row.eventStartsAt,
      locationName: row.locationName,
      ingest: typeof meta.ingest === 'string' ? meta.ingest : null,
      eventbriteEventId:
        typeof meta.eventbriteEventId === 'string' ? meta.eventbriteEventId : null,
      matchKind: 'title_date_near',
    };
  }
  return null;
}
