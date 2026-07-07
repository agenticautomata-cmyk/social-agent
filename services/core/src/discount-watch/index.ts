import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { campaigns, contentItems, sources } from '../schema.js';
import { normalizeScrapeUrl } from '../source-ingestion/register-scrape-source.js';
import {
  KC_DISCOUNT_WATCH_SOURCES,
  LUXURY_RESALE_EVENT_SCRAPES,
} from './sources.js';
export { isLuxuryEstateFind, hasDiscountSignal } from './luxury-keywords.js';
export { KC_DISCOUNT_WATCH_SOURCES, LUXURY_RESALE_EVENT_SCRAPES } from './sources.js';

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

type SeedEntry = {
  name: string;
  listingUrl: string;
  category: string;
  pillar?: string;
};

async function insertDiscountWatchSource(campaignId: string, entry: SeedEntry): Promise<boolean> {
  const listingUrl = normalizeScrapeUrl(entry.listingUrl);
  if (!listingUrl) return false;

  const exists = await db.query.sources.findFirst({
    where: and(eq(sources.campaignId, campaignId), eq(sources.name, entry.name)),
  });
  if (exists) return false;

  await db.insert(sources).values({
    campaignId,
    type: 'scrape',
    name: entry.name,
    config: {
      listingUrl,
      discountWatch: true,
      opportunityCategory: entry.category,
      pillar: entry.pillar ?? 'luxury_deals',
      discoveredVia: 'discount_watch_seed',
      registeredAt: new Date().toISOString(),
    },
    active: true,
    pollIntervalCron: '0 */6 * * *',
  });
  return true;
}

export async function seedDiscountWatchSources(): Promise<{
  created: number;
  skipped: number;
}> {
  const campaignId = await defaultCampaignId();
  let created = 0;
  let skipped = 0;

  const all: SeedEntry[] = [
    ...KC_DISCOUNT_WATCH_SOURCES.map((s) => ({
      name: s.name,
      listingUrl: s.listingUrl,
      category: s.category,
      pillar: s.pillar,
    })),
    ...LUXURY_RESALE_EVENT_SCRAPES.map((s) => ({
      name: s.name,
      listingUrl: s.listingUrl,
      category: s.category,
      pillar: 'luxury_deals',
    })),
  ];

  for (const entry of all) {
    const inserted = await insertDiscountWatchSource(campaignId, entry);
    if (inserted) created += 1;
    else skipped += 1;
  }

  return { created, skipped };
}

export type RecentDiscountDeal = {
  id: string;
  title: string;
  category: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  eventDate: string | null;
  discoveredAt: string;
  newDeal: boolean;
  luxuryEstate: boolean;
};

/** NowInStock-style feed: recently first-seen discount/luxury deals. */
export async function listRecentDiscountDeals(limit = 30): Promise<RecentDiscountDeal[]> {
  const rows = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      sourceUrl: contentItems.sourceUrl,
      eventStartsAt: contentItems.eventStartsAt,
      discoveredAt: contentItems.discoveredAt,
      firstSeenAt: contentItems.firstSeenAt,
      metadata: contentItems.metadata,
      sourceName: sources.name,
    })
    .from(contentItems)
    .leftJoin(sources, eq(sources.id, contentItems.sourceId))
    .where(
      sql`(
        ${contentItems.metadata}->>'ingest' = 'discount_watch'
        OR ${contentItems.metadata}->>'luxuryEstateFlag' = 'true'
        OR ${contentItems.metadata}->>'opportunityCategory' IN ('luxury_deal', 'hotel_package', 'spa_package', 'consignment_event', 'luxury_resale', 'staycation')
      )`,
    )
    .orderBy(desc(contentItems.firstSeenAt))
    .limit(limit);

  return rows.map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const dw = meta.discountWatch as { newDeal?: boolean } | undefined;
    return {
      id: row.id,
      title: row.topic,
      category: typeof meta.opportunityCategory === 'string' ? meta.opportunityCategory : null,
      sourceName: row.sourceName,
      sourceUrl: row.sourceUrl,
      eventDate: row.eventStartsAt?.toISOString() ?? null,
      discoveredAt: (row.firstSeenAt ?? row.discoveredAt ?? new Date()).toISOString(),
      newDeal: dw?.newDeal === true || meta.newDeal === true,
      luxuryEstate: meta.luxuryEstateFlag === true,
    };
  });
}
