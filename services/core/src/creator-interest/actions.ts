import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  contentItems,
  creatorFeedbackEvents,
  creatorInterestRecords,
  creatorResearchJobs,
  sources,
} from '../schema.js';
import { upsertPlannerItem } from '../content-planner/items.js';
import { recordPassedOpportunity } from '../creator-preferences/index.js';
import { sendTelegramMessage } from '../telegram-notifications/send.js';
import { sendBensonPush } from '../push-notifications/send.js';
import { runBusinessEnrichment, enrichmentBlocksVisit } from './enrichment.js';
import { generateAssistancePackage, buildFallbackAssistancePackage } from './assistance-package.js';
import { inferEntityType, normalizeBusinessKey, normalizeEntityName, stripBensonPrefix } from './normalize.js';
import type { BusinessEnrichment, CreatorAssistancePackage, DiscoveryRecordView, InterestAction } from './types.js';

const ACTION_TO_INTEREST: Partial<Record<InterestAction, string>> = {
  interested: 'interested',
  tell_me_more: 'interested',
  research: 'interested',
  plan_visit: 'interested',
  save_for_later: 'saved',
  generate_content_plan: 'interested',
  contact_business: 'interested',
  not_interested: 'not_interested',
  never_show: 'never_show',
};

export async function recordCreatorFeedback(input: {
  recordType: string;
  recordId: string;
  action: string;
  reasonCode?: string;
  comment?: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(creatorFeedbackEvents).values({
    recordType: input.recordType,
    recordId: input.recordId,
    action: input.action,
    reasonCode: input.reasonCode ?? null,
    comment: input.comment ?? null,
    metadata: input.metadata ?? {},
  });
}

async function resolveCanonicalContentItemId(contentItemId: string): Promise<string> {
  const [row] = await db.select().from(contentItems).where(eq(contentItems.id, contentItemId)).limit(1);
  if (!row) throw new Error('content_item_not_found');

  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const listing = (metadata.listingScrape ?? {}) as Record<string, unknown>;
  const businessName = normalizeEntityName({
    title: row.topic,
    businessName: (listing.businessName as string) ?? null,
    documentTitle: (listing.documentTitle as string) ?? null,
  });
  const key = normalizeBusinessKey(businessName);
  if (!key) return contentItemId;

  const siblings = await db
    .select({ id: contentItems.id, topic: contentItems.topic, metadata: contentItems.metadata, createdAt: contentItems.createdAt })
    .from(contentItems)
    .where(eq(contentItems.sourceId, row.sourceId!))
    .orderBy(contentItems.createdAt);

  const matches = siblings.filter((sibling) => {
    const meta = (sibling.metadata ?? {}) as Record<string, unknown>;
    const scrape = (meta.listingScrape ?? {}) as Record<string, unknown>;
    const name = normalizeEntityName({
      title: sibling.topic,
      businessName: (scrape.businessName as string) ?? null,
      documentTitle: (scrape.documentTitle as string) ?? null,
    });
    return normalizeBusinessKey(name) === key;
  });

  if (matches.length <= 1) return contentItemId;
  const primary =
    matches.find((m) => {
      const meta = (m.metadata ?? {}) as Record<string, unknown>;
      return meta.opportunityCategory === 'Food & Drink' || !/pop-up|event/i.test(m.topic);
    }) ?? matches[0]!;
  return primary.id;
}

export async function expressCreatorInterest(input: {
  contentItemId: string;
  action: InterestAction;
  sourceScreen: string;
  requestedAssistance?: string[];
}): Promise<{ interestId: string; contentItemId: string; researchJobId: string | null; duplicate: boolean }> {
  const contentItemId = await resolveCanonicalContentItemId(input.contentItemId);
  const interestLevel = ACTION_TO_INTEREST[input.action] ?? 'interested';

  const [existing] = await db
    .select()
    .from(creatorInterestRecords)
    .where(
      and(
        eq(creatorInterestRecords.contentItemId, contentItemId),
        isNull(creatorInterestRecords.dismissedAt),
        sql`${creatorInterestRecords.interestLevel} NOT IN ('never_show', 'not_interested')`,
      ),
    )
    .limit(1);

  if (existing) {
    await recordCreatorFeedback({
      recordType: 'content_item',
      recordId: contentItemId,
      action: input.action,
      metadata: { sourceScreen: input.sourceScreen, duplicate: true },
    });
    return {
      interestId: existing.id,
      contentItemId,
      researchJobId: existing.researchJobId,
      duplicate: true,
    };
  }

  const [item] = await db.select().from(contentItems).where(eq(contentItems.id, contentItemId)).limit(1);
  if (!item) throw new Error('content_item_not_found');

  const [interest] = await db
    .insert(creatorInterestRecords)
    .values({
      contentItemId,
      sourceId: item.sourceId,
      interestLevel,
      sourceScreen: input.sourceScreen,
      requestedAssistance: input.requestedAssistance ?? [input.action],
      enrichmentStatus: 'queued',
      nextAction: immediateNextAction(input.action),
    })
    .returning();

  await db
    .update(contentItems)
    .set({ creatorValueStatus: 'researching', updatedAt: new Date() })
    .where(eq(contentItems.id, contentItemId));

  if (input.action === 'save_for_later' || input.action === 'interested' || input.action === 'plan_visit') {
    await upsertPlannerItem(contentItemId, {
      listName: input.action === 'plan_visit' ? 'today' : 'saved',
      status: 'saved',
    });
  }

  if (input.action === 'never_show' || input.action === 'not_interested') {
    const metadata = (item.metadata ?? {}) as Record<string, unknown>;
    const listing = (metadata.listingScrape ?? {}) as Record<string, unknown>;
    await recordPassedOpportunity(
      (listing.businessName as string) ?? item.topic,
      'dashboard',
      input.action,
    );
    await db
      .update(creatorInterestRecords)
      .set({ dismissedAt: new Date(), enrichmentStatus: 'cancelled', updatedAt: new Date() })
      .where(eq(creatorInterestRecords.id, interest!.id));
    await recordCreatorFeedback({
      recordType: 'content_item',
      recordId: contentItemId,
      action: input.action,
      metadata: { sourceScreen: input.sourceScreen },
    });
    return { interestId: interest!.id, contentItemId, researchJobId: null, duplicate: false };
  }

  const researchJobId = await queueResearchJob(interest!.id, contentItemId);

  await recordCreatorFeedback({
    recordType: 'content_item',
    recordId: contentItemId,
    action: input.action,
    metadata: { sourceScreen: input.sourceScreen, researchJobId },
  });

  return { interestId: interest!.id, contentItemId, researchJobId, duplicate: false };
}

function immediateNextAction(action: InterestAction): string {
  switch (action) {
    case 'plan_visit':
      return 'Review visit plan once enrichment completes.';
    case 'generate_content_plan':
      return 'Generating content package from verified facts.';
    case 'contact_business':
      return 'Researching contact channels — verify before outreach.';
    case 'research':
    case 'tell_me_more':
      return 'Benson is researching this business now.';
    default:
      return 'Research queued — Benson will notify you when ready.';
  }
}

export async function queueResearchJob(interestId: string, contentItemId: string): Promise<string> {
  const [job] = await db
    .insert(creatorResearchJobs)
    .values({
      contentItemId,
      interestRecordId: interestId,
      status: 'queued',
    })
    .returning({ id: creatorResearchJobs.id });

  await db
    .update(creatorInterestRecords)
    .set({ researchJobId: job!.id, enrichmentStatus: 'queued', updatedAt: new Date() })
    .where(eq(creatorInterestRecords.id, interestId));

  void runResearchJob(job!.id).catch((err) => {
    console.warn('[creator-interest] research job failed:', err);
  });

  return job!.id;
}

export async function retryResearchJob(jobId: string) {
  const [job] = await db.select().from(creatorResearchJobs).where(eq(creatorResearchJobs.id, jobId)).limit(1);
  if (!job) throw new Error('research_job_not_found');
  await db
    .update(creatorResearchJobs)
    .set({
      status: 'queued',
      errorMessage: null,
      retryCount: job.retryCount + 1,
      updatedAt: new Date(),
    })
    .where(eq(creatorResearchJobs.id, jobId));
  if (job.interestRecordId) {
    await db
      .update(creatorInterestRecords)
      .set({ enrichmentStatus: 'queued', updatedAt: new Date() })
      .where(eq(creatorInterestRecords.id, job.interestRecordId));
  }
  void runResearchJob(jobId).catch((err) => console.warn('[creator-interest] retry failed:', err));
}

export async function runResearchJob(jobId: string) {
  const [job] = await db.select().from(creatorResearchJobs).where(eq(creatorResearchJobs.id, jobId)).limit(1);
  if (!job) return;

  await db
    .update(creatorResearchJobs)
    .set({ status: 'researching', startedAt: new Date(), updatedAt: new Date() })
    .where(eq(creatorResearchJobs.id, jobId));

  if (job.interestRecordId) {
    await db
      .update(creatorInterestRecords)
      .set({ enrichmentStatus: 'researching', updatedAt: new Date() })
      .where(eq(creatorInterestRecords.id, job.interestRecordId));
  }

  try {
    const enrichment = await runBusinessEnrichment(job.contentItemId);
    const [item] = await db.select().from(contentItems).where(eq(contentItems.id, job.contentItemId)).limit(1);
    const metadata = (item?.metadata ?? {}) as Record<string, unknown>;
    let assistancePackage;
    try {
      assistancePackage = await generateAssistancePackage({
        title: item?.topic ?? 'Opportunity',
        summary: item?.script ?? null,
        enrichment,
        category: (metadata.opportunityCategory as string) ?? null,
      });
    } catch (pkgErr) {
      console.warn('[creator-interest] assistance package fallback:', pkgErr);
      assistancePackage = buildFallbackAssistancePackage(
        {
          title: item?.topic ?? 'Opportunity',
          summary: item?.script ?? null,
          enrichment,
          category: (metadata.opportunityCategory as string) ?? null,
        },
        enrichmentBlocksVisit(enrichment),
      );
    }

    const finalStatus = enrichment.needsVerification.length > 0 ? 'needs_verification' : 'complete';

    await db
      .update(creatorResearchJobs)
      .set({
        status: finalStatus,
        enrichment,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(creatorResearchJobs.id, jobId));

    if (job.interestRecordId) {
      await db
        .update(creatorInterestRecords)
        .set({
          enrichmentStatus: finalStatus,
          assistancePackage,
          nextAction: enrichmentBlocksVisit(enrichment)
            ? 'Business may be closed or relocating — verify before visiting.'
            : 'Review visit plan and content options.',
          updatedAt: new Date(),
        })
        .where(eq(creatorInterestRecords.id, job.interestRecordId));
    }

    await db
      .update(contentItems)
      .set({ creatorValueStatus: 'actionable', creatorNextAction: 'review_assistance_package', updatedAt: new Date() })
      .where(eq(contentItems.id, job.contentItemId));

    await notifyEnrichmentComplete(job.contentItemId, enrichment, assistancePackage);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(creatorResearchJobs)
      .set({ status: 'failed', errorMessage: message, updatedAt: new Date() })
      .where(eq(creatorResearchJobs.id, jobId));
    if (job.interestRecordId) {
      await db
        .update(creatorInterestRecords)
        .set({ enrichmentStatus: 'failed', nextAction: 'Research failed — tap retry.', updatedAt: new Date() })
        .where(eq(creatorInterestRecords.id, job.interestRecordId));
    }
  }
}

async function notifyEnrichmentComplete(
  contentItemId: string,
  enrichment: BusinessEnrichment,
  pkg: CreatorAssistancePackage,
) {
  const name = enrichment.canonicalName.value ?? 'this place';
  const url = `https://benson.kckellie.com/discoveries/${contentItemId}`;
  const body = enrichmentBlocksVisit(enrichment)
    ? `Benson finished researching ${name}, but open status needs verification before a visit.`
    : `Benson finished researching ${name} — visit plan and content options are ready.`;

  await sendBensonPush({
    topic: 'local_discovery',
    title: 'Research ready',
    body,
    url: `/discoveries/${contentItemId}`,
  }).catch(() => null);

  await sendTelegramMessage(`${body}\n\n${url}`, { requireOutreachEnabled: false });
}

export async function getDiscoveryRecord(contentItemId: string): Promise<DiscoveryRecordView | null> {
  const [row] = await db
    .select({
      item: contentItems,
      sourceName: sources.name,
    })
    .from(contentItems)
    .leftJoin(sources, eq(sources.id, contentItems.sourceId))
    .where(eq(contentItems.id, contentItemId))
    .limit(1);

  if (!row) return null;

  const metadata = (row.item.metadata ?? {}) as Record<string, unknown>;
  const listing = (metadata.listingScrape ?? {}) as Record<string, unknown>;
  const tags = (metadata.tags as string[]) ?? [];

  const [interest] = await db
    .select()
    .from(creatorInterestRecords)
    .where(eq(creatorInterestRecords.contentItemId, contentItemId))
    .orderBy(desc(creatorInterestRecords.createdAt))
    .limit(1);

  const [researchJob] = interest?.researchJobId
    ? await db
        .select()
        .from(creatorResearchJobs)
        .where(eq(creatorResearchJobs.id, interest.researchJobId))
        .limit(1)
    : [];

  const enrichment = (researchJob?.enrichment ?? null) as Partial<BusinessEnrichment> | null;
  const assistancePackage = (interest?.assistancePackage ?? null) as CreatorAssistancePackage | null;

  return {
    contentItemId,
    sourceId: row.item.sourceId,
    sourceTitle: row.sourceName,
    normalizedEntityName: normalizeEntityName({
      sourceName: row.sourceName,
      title: row.item.topic,
      businessName: (listing.businessName as string) ?? null,
      documentTitle: (listing.documentTitle as string) ?? null,
    }),
    entityType: inferEntityType((metadata.opportunityCategory as string) ?? null, tags),
    sourceUrl: row.item.sourceUrl,
    processingStatus: row.item.state,
    creatorRelevanceStatus: row.item.creatorValueStatus,
    lifecycleStatus: row.item.lifecycleStatus,
    enrichmentComplete: researchJob?.status === 'complete' || researchJob?.status === 'needs_verification',
    interest: interest
      ? {
          id: interest.id,
          interestLevel: interest.interestLevel,
          enrichmentStatus: interest.enrichmentStatus,
          nextAction: interest.nextAction,
          researchJobId: interest.researchJobId,
        }
      : null,
    researchJob: researchJob
      ? {
          id: researchJob.id,
          status: researchJob.status,
          errorMessage: researchJob.errorMessage,
          retryCount: researchJob.retryCount,
        }
      : null,
    enrichment,
    assistancePackage,
    title: row.item.topic,
    summary: row.item.script,
    locationName: row.item.locationName,
    category: (metadata.opportunityCategory as string) ?? null,
    metadata,
  };
}

export async function listBensonDiscoverySources(): Promise<
  Array<{
    sourceId: string;
    sourceName: string;
    normalizedName: string;
    feedUrl: string | null;
    contentItemId: string | null;
    title: string | null;
    creatorRelevanceStatus: string | null;
    lifecycleStatus: string | null;
    enrichmentStatus: string | null;
    lastRunAt: string | null;
  }>
> {
  const scrapeSources = await db
    .select()
    .from(sources)
    .where(and(eq(sources.type, 'scrape'), sql`${sources.name} ILIKE '[Benson] %'`))
    .orderBy(desc(sources.updatedAt))
    .limit(100);

  const results = [];
  for (const source of scrapeSources) {
    const [item] = await db
      .select({
        id: contentItems.id,
        topic: contentItems.topic,
        creatorValueStatus: contentItems.creatorValueStatus,
        lifecycleStatus: contentItems.lifecycleStatus,
      })
      .from(contentItems)
      .where(eq(contentItems.sourceId, source.id))
      .orderBy(desc(contentItems.updatedAt))
      .limit(1);

    const [interest] = item
      ? await db
          .select({ enrichmentStatus: creatorInterestRecords.enrichmentStatus })
          .from(creatorInterestRecords)
          .where(eq(creatorInterestRecords.contentItemId, item.id))
          .orderBy(desc(creatorInterestRecords.createdAt))
          .limit(1)
      : [];

    const config = (source.config ?? {}) as Record<string, unknown>;
    results.push({
      sourceId: source.id,
      sourceName: source.name,
      normalizedName: stripBensonPrefix(source.name),
      feedUrl: (config.url as string) ?? (config.feedUrl as string) ?? null,
      contentItemId: item?.id ?? null,
      title: item?.topic ?? null,
      creatorRelevanceStatus: item?.creatorValueStatus ?? null,
      lifecycleStatus: item?.lifecycleStatus ?? null,
      enrichmentStatus: interest?.enrichmentStatus ?? null,
      lastRunAt: source.lastScanAt?.toISOString() ?? null,
    });
  }
  return results;
}

export async function addToToday(contentItemId: string) {
  await upsertPlannerItem(contentItemId, { listName: 'today', status: 'saved' });
}

export { stripBensonPrefix, normalizeEntityName };
