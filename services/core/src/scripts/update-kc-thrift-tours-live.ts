/**
 * Set live field status + refresh KC Thrift Tours party bus data.
 * Run: npx tsx src/scripts/update-kc-thrift-tours-live.ts
 */
import 'dotenv/config';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  campaigns,
  contentItems,
  shareIntakeSubmissions,
  sources,
} from '../schema.js';
import { setCreatorFieldStatus } from '../creator-field-status/index.js';
import { humanIntakeTitle } from '../draft-intelligence/display-title.js';
import { getOrCreateShareIntakeSource } from '../intake/promote.js';
import { KC_THRIFT_TOURS_EVENT_DATE } from '../inventory/mega-events.js';

const EVENT_NAME = 'KC Thrift Tours Party Bus';
const EVENT_LOCATION = 'Kansas City, Missouri';
const EVENT_TITLE = 'KC Thrift Tours Party Bus — live thrift tour on the bus';
const EVENT_DATE = new Date(`${KC_THRIFT_TOURS_EVENT_DATE}T18:00:00-05:00`);

async function defaultCampaignId(): Promise<string> {
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.active, true))
    .orderBy(desc(campaigns.createdAt))
    .limit(1);
  if (!campaign) throw new Error('no active campaign');
  return campaign.id;
}

async function updateLiveFieldStatus(): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 18 * 60 * 60 * 1000).toISOString();
  await setCreatorFieldStatus({
    active: true,
    headline: 'Kellie is shooting on the KC Thrift Tours party bus right now',
    eventName: EVENT_NAME,
    location: EVENT_LOCATION,
    eventDate: KC_THRIFT_TOURS_EVENT_DATE,
    activity: 'live thrift tour bus shoot',
    updatedAt: now.toISOString(),
    expiresAt,
  });
  console.log('✓ live field status set (expires', expiresAt, ')');
}

async function updateShareIntakes(): Promise<void> {
  const rows = await db
    .select()
    .from(shareIntakeSubmissions)
    .where(
      or(
        ilike(shareIntakeSubmissions.aiSummary, '%thrift tours%'),
        ilike(shareIntakeSubmissions.aiSummary, '%party bus%'),
        ilike(shareIntakeSubmissions.extractedTitle, '%thrift%'),
      ),
    );

  for (const row of rows) {
    const displayTitle = humanIntakeTitle({
      extractedTitle: EVENT_TITLE,
      hookSummary: row.hookSummary ?? 'Thrift tour bus energy — haul finds, crowd reactions, KC stops',
      aiSummary: row.aiSummary,
      intakeType: row.intakeType,
      captionSuggestionsJson: row.captionSuggestionsJson,
    });

    await db
      .update(shareIntakeSubmissions)
      .set({
        extractedTitle: displayTitle,
        extractedDate: EVENT_DATE,
        extractedLocation: EVENT_LOCATION,
        extractedBusiness: 'KC Thrift Tours',
        extractedCategory: row.extractedCategory ?? 'event',
        hookSummary:
          row.hookSummary ??
          'POV: rolling through KC thrift stops on the party bus — best finds, crowd energy, tour vibes',
        contentTheme: row.contentTheme ?? 'thrift_tour_live',
        updatedAt: new Date(),
      })
      .where(eq(shareIntakeSubmissions.id, row.id));

    console.log(`✓ intake ${row.id.slice(0, 8)}… → ${displayTitle.slice(0, 70)}`);
  }
}

async function upsertInventoryItem(campaignId: string): Promise<void> {
  const sourceId = await getOrCreateShareIntakeSource(campaignId);
  const externalId = `live-field-kc-thrift-tours-${KC_THRIFT_TOURS_EVENT_DATE}`;

  const existing = await db.query.contentItems.findFirst({
    where: eq(contentItems.sourceExternalId, externalId),
  });

  const metadata = {
    ingest: 'share_intake',
    opportunityCategory: 'event',
    tags: ['thrift', 'party_bus', 'kc_thrift_tours', 'live_shoot'],
    liveFieldEvent: true,
    eventName: EVENT_NAME,
    creatorShootingNow: true,
  };

  if (existing) {
    await db
      .update(contentItems)
      .set({
        topic: EVENT_TITLE,
        hook: 'Kellie is live on the KC Thrift Tours party bus — thrift haul energy, bus POV, KC stops',
        eventStartsAt: EVENT_DATE,
        locationName: EVENT_LOCATION,
        metadata: { ...(existing.metadata as Record<string, unknown>), ...metadata },
        updatedAt: new Date(),
      })
      .where(eq(contentItems.id, existing.id));
    console.log(`✓ inventory updated ${existing.id}`);
    return;
  }

  const [row] = await db
    .insert(contentItems)
    .values({
      campaignId,
      type: 'industry_insight',
      language: 'en',
      state: 'planned',
      topic: EVENT_TITLE,
      hook: 'Kellie is live on the KC Thrift Tours party bus — thrift haul energy, bus POV, KC stops',
      sourceId,
      sourceExternalId: externalId,
      discoveredAt: new Date(),
      eventStartsAt: EVENT_DATE,
      locationName: EVENT_LOCATION,
      metadata,
    })
    .returning({ id: contentItems.id });

  console.log(`✓ inventory created ${row?.id}`);
}

async function main() {
  const campaignId = await defaultCampaignId();
  await updateLiveFieldStatus();
  await updateShareIntakes();
  await upsertInventoryItem(campaignId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
