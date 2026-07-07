import { createHash } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { campaigns, contentItems, type NewContentItem } from '../schema.js';
import { upsertPlannerItem } from '../content-planner/items.js';
import { getOrCreateShareIntakeSource } from '../intake/promote.js';
import { persistIngestedContentItem } from '../scanner/ingest-persist.js';
import type { ConciergePick } from './concierge-picks.js';

export type ConciergeSaveAction = 'save' | 'plan_today';

export type SaveConciergePickResult = {
  contentItemId: string;
  plannerListName: string;
  plannerAction: ConciergeSaveAction;
  outcome: 'created' | 'updated';
  reviewUrl: string;
};

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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function parseEventDate(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const parsed = Date.parse(raw.trim());
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

function scorePick(pick: ConciergePick): { relevanceScore: number; urgencyScore: number } {
  let relevance = pick.origin === 'inventory' ? 0.82 : 0.68;
  if (pick.location) relevance += 0.05;
  if (pick.eventDate) relevance += 0.05;
  if (pick.sourceUrl) relevance += 0.04;

  let urgency = 0.35;
  const starts = parseEventDate(pick.eventDate);
  if (starts) {
    const daysOut = (starts.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysOut < 0) urgency = 0.15;
    else if (daysOut <= 1) urgency = 0.95;
    else if (daysOut <= 7) urgency = 0.8;
    else if (daysOut <= 21) urgency = 0.6;
  }

  return {
    relevanceScore: Number(Math.min(0.99, relevance).toFixed(3)),
    urgencyScore: Number(Math.min(0.99, urgency).toFixed(3)),
  };
}

async function ensureContentItemId(pick: ConciergePick): Promise<{ contentItemId: string; outcome: 'created' | 'updated' }> {
  if (pick.contentItemId) {
    const existing = await db.query.contentItems.findFirst({
      where: eq(contentItems.id, pick.contentItemId),
    });
    if (existing) return { contentItemId: existing.id, outcome: 'updated' };
  }

  const campaignId = await defaultCampaignId();
  const sourceId = await getOrCreateShareIntakeSource(campaignId);
  const batchId = createHash('sha256').update(pick.pickId).digest('hex').slice(0, 16);
  const externalId = `ask-benson-concierge-${batchId}-${slugify(pick.title)}`;
  const { relevanceScore, urgencyScore } = scorePick(pick);

  const row: NewContentItem = {
    campaignId,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    topic: pick.title.slice(0, 500),
    hook: 'Saved from Benson concierge',
    script: pick.summary?.slice(0, 4000) ?? null,
    sourceId,
    sourceExternalId: externalId,
    sourceUrl: pick.sourceUrl,
    discoveredAt: new Date(),
    eventStartsAt: parseEventDate(pick.eventDate),
    locationName: pick.location?.slice(0, 500) ?? null,
    relevanceScore: String(relevanceScore),
    urgencyScore: String(urgencyScore),
    metadata: {
      ingest: 'ask_benson_concierge',
      opportunityCategory: 'local_event',
      askBensonCapture: {
        batchId,
        pickId: pick.pickId,
        origin: pick.origin,
        eventDateLabel: pick.eventDateLabel,
      },
    },
    rawPayload: { pick },
  };

  const outcome = await persistIngestedContentItem(sourceId, externalId, () => row, {
    sourceUrl: pick.sourceUrl,
  });

  const saved = await db.query.contentItems.findFirst({
    where: eq(contentItems.sourceExternalId, externalId),
  });
  if (!saved) throw new Error('Failed to persist concierge pick');

  return {
    contentItemId: saved.id,
    outcome: outcome === 'created' ? 'created' : 'updated',
  };
}

export async function saveConciergePick(input: {
  pick: ConciergePick;
  action: ConciergeSaveAction;
  pinToTop?: boolean;
}): Promise<SaveConciergePickResult> {
  const { contentItemId, outcome } = await ensureContentItemId(input.pick);
  const planner = await upsertPlannerItem(contentItemId, {
    action: input.action,
    pinToTop: input.pinToTop,
  });

  return {
    contentItemId,
    plannerListName: planner.listName,
    plannerAction: input.action,
    outcome,
    reviewUrl: `/review/inventory?id=${contentItemId}`,
  };
}

export async function saveContentItemToPlanner(input: {
  contentItemId: string;
  action: ConciergeSaveAction;
  pinToTop?: boolean;
}): Promise<SaveConciergePickResult> {
  const existing = await db.query.contentItems.findFirst({
    where: eq(contentItems.id, input.contentItemId),
  });
  if (!existing) throw new Error('Inventory item not found');

  const planner = await upsertPlannerItem(input.contentItemId, {
    action: input.action,
    pinToTop: input.pinToTop,
  });

  return {
    contentItemId: input.contentItemId,
    plannerListName: planner.listName,
    plannerAction: input.action,
    outcome: 'updated',
    reviewUrl: `/review/inventory?id=${input.contentItemId}`,
  };
}
