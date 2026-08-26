import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  contentItems,
  creatorFeedbackEvents,
  creatorInterestRecords,
  creatorResearchJobs,
  sources,
} from '../schema.js';
import { upsertPlannerItem } from '../content-planner/items.js';
import { applyDiscoverTasteVote, getDiscoverTasteWeights, recordPassedOpportunity } from '../creator-preferences/index.js';
import { isDiscoverEligible } from '../inventory/discover-eligibility.js';
import { buildDiscoverCardModel, extractDiscoverTraits } from './discover-card.js';
import { isOpaqueContentId } from '../ask-benson/url-type.js';
import { sendBensonPush } from '../push-notifications/send.js';
import {
  computeSkipMatchIdentity,
  coreTitle,
  isSkippedByMatchers,
  loadSkipMatchers,
  skipIdentitiesMatch,
  type SkipMatchIdentity,
} from '../creator-skip/index.js';
import { isDiscoveryFeedFresh } from '../inventory/content-freshness.js';
import { isOperatorTemporallyCurrent } from '../creator-agent/stale-temporal-prose.js';
import { sanitizeStaleTemporalProse } from '../creator-agent/stale-temporal-prose.js';
import { runBusinessEnrichment, enrichmentBlocksVisit } from './enrichment.js';
import { generateAssistancePackage, buildFallbackAssistancePackage } from './assistance-package.js';
import { inferEntityType, normalizeBusinessKey, normalizeEntityName, stripBensonPrefix } from './normalize.js';
import type { BusinessEnrichment, CreatorAssistancePackage, DiscoveryRecordView, InterestAction } from './types.js';

function operatorFacingSummary(input: {
  script: string | null | undefined;
  eventStartsAt?: Date | string | null;
  eventEndsAt?: Date | string | null;
  metadata?: Record<string, unknown> | null;
}): string | null {
  if (!input.script) return null;
  return sanitizeStaleTemporalProse({
    text: input.script,
    startsAt: input.eventStartsAt,
    endsAt: input.eventEndsAt,
    timezone:
      typeof input.metadata?.timezone === 'string'
        ? input.metadata.timezone
        : typeof input.metadata?.timeZone === 'string'
          ? input.metadata.timeZone
          : null,
  }).text;
}

const ACTION_TO_INTEREST: Partial<Record<InterestAction, string>> = {
  interested: 'interested',
  tell_me_more: 'interested',
  research: 'interested',
  plan_visit: 'interested',
  save_for_later: 'saved',
  generate_content_plan: 'interested',
  contact_business: 'interested',
  more_like_this: 'more_like_this',
  less_like_this: 'less_like_this',
  not_interested: 'not_interested',
  never_show: 'never_show',
};

const NEGATIVE_VOTE_ACTIONS = new Set<InterestAction>([
  'less_like_this',
  'not_interested',
  'never_show',
]);

const FEED_VOTE_ACTIONS = new Set<InterestAction>([
  'more_like_this',
  'less_like_this',
  'not_interested',
]);

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
    .where(eq(creatorInterestRecords.contentItemId, contentItemId))
    .orderBy(desc(creatorInterestRecords.createdAt))
    .limit(1);

  // Discoveries feed votes always update the latest interest row (or create one).
  if (existing && FEED_VOTE_ACTIONS.has(input.action)) {
    await applyFeedVote({
      interestId: existing.id,
      contentItemId,
      action: input.action,
      interestLevel,
      sourceScreen: input.sourceScreen,
      itemTopic: null,
    });
    const researchJobId =
      input.action === 'more_like_this' ? await queueResearchJob(existing.id, contentItemId) : null;
    return {
      interestId: existing.id,
      contentItemId,
      researchJobId,
      duplicate: false,
    };
  }

  if (
    existing &&
    !existing.dismissedAt &&
    !['never_show', 'not_interested', 'less_like_this'].includes(existing.interestLevel)
  ) {
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
      enrichmentStatus: NEGATIVE_VOTE_ACTIONS.has(input.action) ? 'cancelled' : 'queued',
      nextAction: immediateNextAction(input.action),
      dismissedAt: NEGATIVE_VOTE_ACTIONS.has(input.action) ? new Date() : null,
    })
    .returning();

  if (NEGATIVE_VOTE_ACTIONS.has(input.action)) {
    if (input.action === 'never_show' || input.action === 'not_interested') {
      const phrase = passedPhraseForItem(item);
      if (phrase && !isOpaqueContentId(phrase)) {
        await recordPassedOpportunity(phrase, 'dashboard', input.action);
      }
    }
    await recordDiscoverFeedTaste(contentItemId, input.action);
    await recordCreatorFeedback({
      recordType: 'content_item',
      recordId: contentItemId,
      action: input.action,
      metadata: { sourceScreen: input.sourceScreen },
    });
    return { interestId: interest!.id, contentItemId, researchJobId: null, duplicate: false };
  }

  await db
    .update(contentItems)
    .set({
      creatorValueStatus: input.action === 'more_like_this' ? 'creator_candidate' : 'researching',
      updatedAt: new Date(),
    })
    .where(eq(contentItems.id, contentItemId));

  await recordDiscoverFeedTaste(contentItemId, input.action);

  if (
    input.action === 'save_for_later' ||
    input.action === 'interested' ||
    input.action === 'plan_visit' ||
    input.action === 'more_like_this'
  ) {
    await upsertPlannerItem(contentItemId, {
      listName: input.action === 'plan_visit' ? 'today' : 'saved',
      status: 'saved',
    });
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

async function loadItemForDiscoverTaste(contentItemId: string) {
  const [item] = await db
    .select({
      topic: contentItems.topic,
      script: contentItems.script,
      locationName: contentItems.locationName,
      sourceUrl: contentItems.sourceUrl,
      eventStartsAt: contentItems.eventStartsAt,
      metadata: contentItems.metadata,
    })
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  return item ?? null;
}

async function recordDiscoverFeedTaste(
  contentItemId: string,
  action: InterestAction,
): Promise<void> {
  const direction =
    action === 'more_like_this'
      ? 'more'
      : action === 'less_like_this'
        ? 'less'
        : action === 'not_interested'
          ? 'not_interested'
          : null;
  if (!direction) return;
  const item = await loadItemForDiscoverTaste(contentItemId);
  if (!item) return;
  const metadata = (item.metadata ?? {}) as Record<string, unknown>;
  const traits = extractDiscoverTraits({
    title: item.topic,
    summary: item.script,
    locationName: item.locationName,
    category: typeof metadata.opportunityCategory === 'string' ? metadata.opportunityCategory : null,
    sourceUrl: item.sourceUrl,
    eventStartsAt: item.eventStartsAt,
    metadata,
  });
  await applyDiscoverTasteVote(traits, direction, 'dashboard');
}

function passedPhraseForItem(item: {
  topic: string;
  eventStartsAt: Date | null;
  metadata: unknown;
}): string {
  const metadata = (item.metadata ?? {}) as Record<string, unknown>;
  const listing = (metadata.listingScrape ?? {}) as Record<string, unknown>;
  const business = typeof listing.businessName === 'string' ? listing.businessName.trim() : '';
  const phrase = item.eventStartsAt ? item.topic : business || item.topic;
  return phrase.trim();
}

async function applyFeedVote(input: {
  interestId: string;
  contentItemId: string;
  action: InterestAction;
  interestLevel: string;
  sourceScreen: string;
  itemTopic: string | null;
}) {
  const now = new Date();
  await recordDiscoverFeedTaste(input.contentItemId, input.action);
  if (NEGATIVE_VOTE_ACTIONS.has(input.action)) {
    await db
      .update(creatorInterestRecords)
      .set({
        interestLevel: input.interestLevel,
        dismissedAt: now,
        enrichmentStatus: 'cancelled',
        sourceScreen: input.sourceScreen,
        updatedAt: now,
      })
      .where(eq(creatorInterestRecords.id, input.interestId));

    if (input.action === 'not_interested' || input.action === 'never_show') {
      const item = await loadItemForDiscoverTaste(input.contentItemId);
      if (item) {
        const phrase = passedPhraseForItem(item);
        if (phrase && !isOpaqueContentId(phrase)) {
          await recordPassedOpportunity(phrase, 'dashboard', input.action);
        }
      }
    }
  } else {
    await db
      .update(creatorInterestRecords)
      .set({
        interestLevel: input.interestLevel,
        dismissedAt: null,
        enrichmentStatus: 'queued',
        sourceScreen: input.sourceScreen,
        nextAction: immediateNextAction(input.action),
        updatedAt: now,
      })
      .where(eq(creatorInterestRecords.id, input.interestId));
    await upsertPlannerItem(input.contentItemId, { listName: 'saved', status: 'saved' });
    await db
      .update(contentItems)
      .set({ creatorValueStatus: 'creator_candidate', updatedAt: now })
      .where(eq(contentItems.id, input.contentItemId));
  }

  await recordCreatorFeedback({
    recordType: 'content_item',
    recordId: input.contentItemId,
    action: input.action,
    metadata: { sourceScreen: input.sourceScreen, feedVote: true },
  });
}

function immediateNextAction(action: InterestAction): string {
  switch (action) {
    case 'interested':
      return 'Saved to your list. Benson is verifying hours, address, and contact details now, then it shows up in Today with a filming angle.';
    case 'save_for_later':
      return 'Saved to your list. Benson is researching it in the background — no rush, it will be waiting under Saved.';
    case 'plan_visit':
      return 'Added to Today. Benson is building a visit plan with timing and a shot list.';
    case 'generate_content_plan':
      return 'Benson is writing a content package — hook, shot list, and caption — from verified facts.';
    case 'contact_business':
      return 'Benson is finding contact channels. You approve the message before anything sends.';
    case 'research':
    case 'tell_me_more':
      return 'Benson is researching this now and will notify you when the details are verified.';
    case 'more_like_this':
      return 'Benson will surface more like this and saved it to your list.';
    case 'less_like_this':
      return 'Benson will show fewer like this from now on.';
    case 'not_interested':
      return 'Gone from your discoveries, including duplicates of this same event from other sources.';
    case 'never_show':
      return 'Gone for good — Benson will not surface this or anything like it again.';
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
  const body = enrichmentBlocksVisit(enrichment)
    ? `Benson finished researching ${name}, but open status needs verification before a visit.`
    : `Benson finished researching ${name} — visit plan and content options are ready.`;

  // Dashboard/push only until a polished Telegram format ships. Auto "research
  // complete" Telegram messages (raw deep links / UUIDs) are suppressed for
  // operational stabilization — see Priority 7.
  await sendBensonPush({
    topic: 'local_discovery',
    title: 'Research ready',
    body,
    url: `/discoveries/${contentItemId}`,
  }).catch(() => null);
}

/** Persists an assistance package (full replace or partial merge) on the latest interest record for this discovery. */
export async function saveAssistancePackage(
  contentItemId: string,
  pkg: Partial<CreatorAssistancePackage>,
  mode: 'replace' | 'merge' = 'replace',
): Promise<CreatorAssistancePackage | null> {
  const [interest] = await db
    .select()
    .from(creatorInterestRecords)
    .where(eq(creatorInterestRecords.contentItemId, contentItemId))
    .orderBy(desc(creatorInterestRecords.createdAt))
    .limit(1);
  if (!interest) return null;

  const existing = (interest.assistancePackage ?? null) as CreatorAssistancePackage | null;
  const next: CreatorAssistancePackage =
    mode === 'merge' && existing
      ? {
          ...existing,
          ...pkg,
          contentPackage: { ...existing.contentPackage, ...(pkg.contentPackage ?? {}) },
          visitPlan: { ...existing.visitPlan, ...(pkg.visitPlan ?? {}) },
          businessAction: { ...existing.businessAction, ...(pkg.businessAction ?? {}) },
          generatedAt: existing.generatedAt,
        }
      : ({ ...pkg, generatedAt: pkg.generatedAt ?? new Date().toISOString() } as CreatorAssistancePackage);

  await db
    .update(creatorInterestRecords)
    .set({ assistancePackage: next, updatedAt: new Date() })
    .where(eq(creatorInterestRecords.id, interest.id));

  return next;
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
    summary: operatorFacingSummary({
      script: row.item.script,
      eventStartsAt: row.item.eventStartsAt,
      eventEndsAt: row.item.eventEndsAt,
      metadata,
    }),
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

export type OpenDiscoveryCard = {
  contentItemId: string;
  title: string;
  summary: string | null;
  locationName: string | null;
  category: string | null;
  opportunityKind: string;
  whereWhen: string | null;
  confidenceLabel: string;
  primaryAction: {
    key: 'add_to_today' | 'review' | 'open_program';
    label: string;
  };
  sourceUrl: string | null;
  sourceLabel: string | null;
  eventStartsAt: string | null;
  discoveredAt: string | null;
};

/** Identities of events already voted on, so re-ingested duplicates don't come back. */
async function loadVotedIdentities(): Promise<SkipMatchIdentity[]> {
  const rows = await db
    .select({
      topic: contentItems.topic,
      eventStartsAt: contentItems.eventStartsAt,
      locationName: contentItems.locationName,
      formattedAddress: contentItems.formattedAddress,
    })
    .from(creatorInterestRecords)
    .innerJoin(contentItems, eq(contentItems.id, creatorInterestRecords.contentItemId))
    .where(sql`${creatorInterestRecords.interestLevel} IN ('more_like_this', 'less_like_this', 'not_interested', 'never_show', 'interested', 'saved')`);

  const identities: SkipMatchIdentity[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const identity = computeSkipMatchIdentity({
      title: row.topic,
      eventDate: row.eventStartsAt?.toISOString() ?? null,
      locationName: row.locationName,
      formattedAddress: row.formattedAddress,
    });
    if (identity && !seen.has(identity.key)) {
      seen.add(identity.key);
      identities.push(identity);
    }
  }
  return identities;
}

/** Recent discoveries still open for taste voting (more / less / not interested). */
export async function listOpenDiscoveries(limit = 40): Promise<OpenDiscoveryCard[]> {
  const capped = Math.min(Math.max(limit, 1), 500);
  const [skipMatchers, votedIdentities, tasteWeights] = await Promise.all([
    loadSkipMatchers(),
    loadVotedIdentities(),
    getDiscoverTasteWeights(),
  ]);

  const rows = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      script: contentItems.script,
      hook: contentItems.hook,
      locationName: contentItems.locationName,
      formattedAddress: contentItems.formattedAddress,
      sourceUrl: contentItems.sourceUrl,
      eventStartsAt: contentItems.eventStartsAt,
      eventEndsAt: contentItems.eventEndsAt,
      discoveredAt: contentItems.discoveredAt,
      metadata: contentItems.metadata,
      createdAt: contentItems.createdAt,
      contentCategory: contentItems.contentCategory,
      creatorValueStatus: contentItems.creatorValueStatus,
      lifecycleStatus: contentItems.lifecycleStatus,
      sourceName: sources.name,
      sourceType: sources.type,
    })
    .from(contentItems)
    .leftJoin(sources, eq(contentItems.sourceId, sources.id))
    .where(
      and(
        sql`${contentItems.creatorValueStatus} IS DISTINCT FROM 'hidden_raw_signal'`,
        // Quarantined content (e.g. obituaries misclassified as openings, or anything
        // explicitly rejected/archived by a hard gate or remediation pass) must never
        // resurface in the live Discoveries feed even though its legacy `state` column
        // still says "planned".
        sql`${contentItems.creatorValueStatus} IS DISTINCT FROM 'rejected'`,
        sql`${contentItems.creatorValueStatus} IS DISTINCT FROM 'archived'`,
        sql`COALESCE(${contentItems.metadata}->>'programLibraryQuiet', 'false') IS DISTINCT FROM 'true'`,
        sql`${contentItems.metadata}->>'ingest' IS DISTINCT FROM 'program_library'`,
        sql`${contentItems.lifecycleStatus} IS DISTINCT FROM 'archived'`,
        sql`${contentItems.contentCategory} IS DISTINCT FROM 'obituary'`,
        sql`NOT EXISTS (
          SELECT 1 FROM creator_interest_records r
          WHERE r.content_item_id = ${contentItems.id}
            AND r.interest_level IN (
              'more_like_this', 'less_like_this', 'not_interested', 'never_show', 'interested', 'saved'
            )
        )`,
        sql`NOT EXISTS (
          SELECT 1 FROM creator_skipped_records s
          WHERE s.content_item_id = ${contentItems.id}
            AND s.restored_at IS NULL
            AND (s.snooze_until IS NULL OR s.snooze_until > NOW())
        )`,
        // Undated evergreen finds stay; finished events do not. Multi-day runs
        // count as live until their end date passes.
        // NOTE: this OR must stay wrapped in parens — and() just joins fragments with
        // " and ", so an unparenthesized top-level OR here previously broke out of the
        // whole AND chain (SQL precedence: AND binds tighter than OR), which meant any
        // row with a future event date silently bypassed every other filter above
        // (quarantine status, skip records, interest records).
        sql`(COALESCE(${contentItems.eventEndsAt}, ${contentItems.eventStartsAt}) IS NULL
            OR COALESCE(${contentItems.eventEndsAt}, ${contentItems.eventStartsAt}) >= NOW() - INTERVAL '12 hours')`,
      ),
    )
    .orderBy(desc(contentItems.discoveredAt), desc(contentItems.updatedAt))
    // Overfetch: collapsing a 31-date tour into one card can eat a lot of rows.
    .limit(Math.min(capped * 15, 600));

  const scored: Array<{ card: OpenDiscoveryCard; score: number; discoveredAt: number }> = [];
  const shownIdentities: SkipMatchIdentity[] = [];
  // Display-only: one card per distinct thing. A touring act with 31 dates, or one
  // listing repeated per venue, is a single taste question — not 31 votes.
  const shownTitles = new Set<string>();

  for (const row of rows) {
    const titleKey = coreTitle(row.topic);
    if (titleKey && shownTitles.has(titleKey)) continue;

    const identity = computeSkipMatchIdentity({
      title: row.topic,
      eventDate: row.eventStartsAt?.toISOString() ?? null,
      locationName: row.locationName,
      formattedAddress: row.formattedAddress,
    });
    if (
      identity &&
      [...votedIdentities, ...shownIdentities].some((other) => skipIdentitiesMatch(other, identity))
    ) {
      continue;
    }
    if (
      isSkippedByMatchers(skipMatchers, {
        id: row.id,
        title: row.topic,
        eventDate: row.eventStartsAt?.toISOString() ?? null,
        locationName: row.locationName,
        formattedAddress: row.formattedAddress,
        sourceUrl: row.sourceUrl,
        summary: row.script,
      })
    ) {
      continue;
    }
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const category =
      typeof metadata.opportunityCategory === 'string' ? metadata.opportunityCategory : null;
    if (
      !isDiscoveryFeedFresh({
        title: row.topic,
        summary: row.script,
        hook: row.hook,
        eventStartsAt: row.eventStartsAt,
        eventEndsAt: row.eventEndsAt,
        discoveredAt: row.discoveredAt,
        createdAt: row.createdAt,
        category,
        sourceName: row.sourceName,
        sourceType: row.sourceType,
        ingest: typeof metadata.ingest === 'string' ? metadata.ingest : null,
        metadata,
      })
    ) {
      continue;
    }
    // Producer lifecycle/planning stamps cannot bypass America/Chicago temporal authority.
    if (
      (row.eventStartsAt || row.eventEndsAt) &&
      !isOperatorTemporallyCurrent({
        startsAt: row.eventStartsAt,
        endsAt: row.eventEndsAt,
        summaryText: [row.topic, row.script, row.hook].filter(Boolean).join('\n'),
      })
    ) {
      continue;
    }

    const summary = operatorFacingSummary({
      script: row.script,
      eventStartsAt: row.eventStartsAt,
      eventEndsAt: row.eventEndsAt,
      metadata,
    });
    if (
      !isDiscoverEligible({
        title: row.topic,
        summary,
        hook: row.hook,
        locationName: row.locationName,
        formattedAddress: row.formattedAddress,
        sourceUrl: row.sourceUrl,
        category,
        contentCategory: row.contentCategory,
        metadata,
        eventStartsAt: row.eventStartsAt,
        eventEndsAt: row.eventEndsAt,
        creatorValueStatus: row.creatorValueStatus,
        lifecycleStatus: row.lifecycleStatus,
      })
    ) {
      continue;
    }

    if (identity) shownIdentities.push(identity);
    if (titleKey) shownTitles.add(titleKey);

    const model = buildDiscoverCardModel(
      {
        title: row.topic,
        summary,
        locationName: row.locationName,
        formattedAddress: row.formattedAddress,
        category,
        sourceUrl: row.sourceUrl,
        eventStartsAt: row.eventStartsAt,
        discoveredAt: row.discoveredAt,
        metadata,
      },
      tasteWeights,
    );

    scored.push({
      card: {
        contentItemId: row.id,
        title: model.title,
        summary: model.whyItMatters,
        locationName: row.locationName,
        category: model.opportunityKind,
        opportunityKind: model.opportunityKind,
        whereWhen: model.whereWhen,
        confidenceLabel: model.confidenceLabel,
        primaryAction: model.primaryAction,
        sourceUrl: row.sourceUrl,
        sourceLabel: row.sourceName ? stripBensonPrefix(row.sourceName) : row.sourceType,
        eventStartsAt: row.eventStartsAt?.toISOString() ?? null,
        discoveredAt: row.discoveredAt?.toISOString() ?? null,
      },
      score: model.rankScore,
      discoveredAt: row.discoveredAt?.getTime() ?? 0,
    });
  }

  scored.sort((a, b) => b.score - a.score || b.discoveredAt - a.discoveredAt);
  return scored.slice(0, capped).map((row) => row.card);
}

/** User-facing "here's what happens next" copy for a discovery action. */
export function describeInterestNextStep(action: InterestAction): string {
  return immediateNextAction(action);
}

export async function addToToday(contentItemId: string) {
  await upsertPlannerItem(contentItemId, { listName: 'today', status: 'saved' });
}

export { stripBensonPrefix, normalizeEntityName };
