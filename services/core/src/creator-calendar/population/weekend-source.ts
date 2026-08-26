import { desc, eq } from 'drizzle-orm';
import { db } from '../../db.js';
import {
  campaigns,
  contentItems,
  creatorCalendarItems,
  curatorEventLeads,
  type NewContentItem,
} from '../../schema.js';
import { getCalendarItem } from '../items.js';
import { setWeekendListMembership } from '../weekend-things-to-do.js';
import { findInventoryDuplicate } from '../../curator-watchlist/dedupe.js';
import { getOrCreateShareIntakeSource } from '../../intake/promote.js';
import { persistIngestedContentItem } from '../../scanner/ingest-persist.js';
import { computeLifecycleStatus } from '../../creator-agent/lifecycle.js';

async function defaultCampaignId(): Promise<string> {
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.active, true))
    .orderBy(desc(campaigns.createdAt))
    .limit(1);
  if (!campaign) throw new Error('No active campaign found');
  return campaign.id;
}

async function relinkCalendarToContentItem(calendarItemId: string, contentItemId: string): Promise<void> {
  await db
    .update(creatorCalendarItems)
    .set({
      sourceRecordType: 'content_item',
      sourceRecordId: contentItemId,
      internalDetailUrl: `/discoveries/${contentItemId}`,
      updatedAt: new Date(),
    })
    .where(eq(creatorCalendarItems.id, calendarItemId));
}

/**
 * Weekend List selection requires a content_item id.
 * Materialize from a curator lead only when Kellie explicitly adds to the weekend list.
 * Does not auto-select. Does not create a second calendar row.
 */
export async function resolveContentItemIdForCalendarItem(calendarItemId: string): Promise<string | null> {
  const item = await getCalendarItem(calendarItemId);
  if (!item) return null;
  if (item.sourceRecordType === 'content_item' && item.sourceRecordId) return item.sourceRecordId;

  const [row] = await db
    .select({
      sourceRecordType: creatorCalendarItems.sourceRecordType,
      sourceRecordId: creatorCalendarItems.sourceRecordId,
      metadata: creatorCalendarItems.metadata,
      startAt: creatorCalendarItems.startAt,
      description: creatorCalendarItems.description,
      sourceUrl: creatorCalendarItems.sourceUrl,
    })
    .from(creatorCalendarItems)
    .where(eq(creatorCalendarItems.id, calendarItemId))
    .limit(1);
  if (!row) return null;

  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const leadId =
    (typeof meta.curatorLeadId === 'string' && meta.curatorLeadId) ||
    (row.sourceRecordType === 'curator_event_lead' ? row.sourceRecordId : null);
  if (!leadId) return null;

  const [lead] = await db
    .select()
    .from(curatorEventLeads)
    .where(eq(curatorEventLeads.id, leadId))
    .limit(1);
  if (!lead) return null;
  if (lead.linkedContentItemId) {
    await relinkCalendarToContentItem(calendarItemId, lead.linkedContentItemId);
    return lead.linkedContentItemId;
  }

  const dup = await findInventoryDuplicate({
    title: lead.eventName,
    eventDate: lead.eventDate,
    venue: lead.venue,
    sourceUrl: lead.officialOrganizerUrl || lead.ticketUrl || lead.discoveredViaPostUrl,
  });
  if (dup?.id) {
    await db
      .update(curatorEventLeads)
      .set({ linkedContentItemId: dup.id, updatedAt: new Date() })
      .where(eq(curatorEventLeads.id, lead.id));
    await relinkCalendarToContentItem(calendarItemId, dup.id);
    return dup.id;
  }

  const campaignId = await defaultCampaignId();
  const sourceId = await getOrCreateShareIntakeSource(campaignId);
  const externalId = `calendar-watchlist-${lead.id}`;
  const startAt = row.startAt;
  const persistRow: NewContentItem = {
    campaignId,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    topic: lead.eventName.slice(0, 500),
    hook: `Watchlist · @${lead.discoveredViaHandle.replace(/^@/, '')}`,
    script: row.description,
    sourceId,
    sourceExternalId: externalId,
    sourceUrl: row.sourceUrl,
    discoveredAt: lead.discoveredAt,
    eventStartsAt: startAt,
    locationName: lead.venue ?? lead.neighborhood,
    creatorValueStatus: 'creator_candidate',
    lifecycleStatus: computeLifecycleStatus({
      title: lead.eventName,
      eventStartsAt: startAt,
      discoveredAt: lead.discoveredAt,
    }),
    metadata: {
      ingest: 'calendar_weekend_materialize',
      opportunityCategory: 'local_event',
      curatorLeadId: lead.id,
      calendarItemId,
      discoveredViaHandle: lead.discoveredViaHandle,
    },
  };

  await persistIngestedContentItem(sourceId, externalId, () => persistRow, { sourceUrl: row.sourceUrl });
  const saved = await db.query.contentItems.findFirst({
    where: eq(contentItems.sourceExternalId, externalId),
  });
  if (!saved) return null;

  await db
    .update(curatorEventLeads)
    .set({
      linkedContentItemId: saved.id,
      linkedCalendarItemId: calendarItemId,
      updatedAt: new Date(),
    })
    .where(eq(curatorEventLeads.id, lead.id));
  await relinkCalendarToContentItem(calendarItemId, saved.id);
  return saved.id;
}

export async function setCalendarItemWeekendMembership(
  calendarItemId: string,
  selected: boolean,
): Promise<{ contentItemId: string; selected: boolean }> {
  const contentItemId = await resolveContentItemIdForCalendarItem(calendarItemId);
  if (!contentItemId) {
    throw new Error('This suggestion is not linked to inventory yet, so it cannot join Weekend List.');
  }
  return setWeekendListMembership(contentItemId, selected);
}
