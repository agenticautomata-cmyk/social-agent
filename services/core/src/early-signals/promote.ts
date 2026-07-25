import { desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { campaigns, contentItems, type EarlySignal } from '../schema.js';
import { persistIngestedContentItem } from '../scanner/ingest-persist.js';
import { getOrCreateShareIntakeSource } from '../intake/promote.js';
import { scoreContentItemIds } from '../opportunity-scoring/index.js';
import { updateSignal } from './store.js';

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

export async function promoteSignalToOpportunity(signal: EarlySignal): Promise<{
  contentItemId: string;
  outcome: 'created' | 'updated';
}> {
  if (signal.linkedOpportunityId) {
    return { contentItemId: signal.linkedOpportunityId, outcome: 'updated' };
  }

  const campaignId = await defaultCampaignId();
  const sourceId = await getOrCreateShareIntakeSource(campaignId);
  const externalId = `early-signal-${signal.id}`;

  const outcome = await persistIngestedContentItem(
    sourceId,
    externalId,
    () => ({
      campaignId,
      type: 'industry_insight',
      language: 'en',
      state: 'planned',
      topic: signal.title.slice(0, 500),
      hook: signal.summary.slice(0, 500) || signal.title.slice(0, 500),
      script: signal.rawText?.slice(0, 4000) ?? signal.summary.slice(0, 4000),
      sourceId,
      sourceExternalId: externalId,
      sourceUrl: signal.sourceUrl,
      discoveredAt: new Date(),
      eventStartsAt: signal.eventDate,
      locationName: signal.address ?? signal.city,
      relevanceScore: Math.min(0.95, Number(signal.confidenceScore) / 100).toFixed(2),
      urgencyScore: Math.min(0.95, Number(signal.urgencyScore) / 100).toFixed(2),
      metadata: {
        ingest: 'early_signal',
        earlySignalId: signal.id,
        signalType: signal.signalType,
        confidenceLevel: signal.confidenceLevel,
        urgencyLevel: signal.urgencyLevel,
        verificationStatus: signal.verificationStatus,
        contentRecommendation: signal.contentRecommendation,
      },
      rawPayload: {
        signalId: signal.id,
        normalizedData: signal.normalizedData,
      },
    }),
    { sourceUrl: signal.sourceUrl },
  );

  const saved = await db.query.contentItems.findFirst({
    where: eq(contentItems.sourceExternalId, externalId),
  });
  if (!saved) throw new Error('Failed to create opportunity from signal');

  if (outcome === 'created') {
    await scoreContentItemIds([saved.id]).catch(() => undefined);
  }

  await updateSignal(signal.id, {
    linkedOpportunityId: saved.id,
    signalState: 'promoted',
    verificationStatus: signal.verificationStatus === 'unverified' ? 'partial' : signal.verificationStatus,
  });

  return { contentItemId: saved.id, outcome: outcome === 'created' ? 'created' : 'updated' };
}
