import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db } from '../db.js';
import {
  curatorEventLeads,
  curatorPostSlides,
  curatorReliabilityStats,
  curatorSocialPosts,
} from '../schema.js';
import type { CapturedSocialPost, CuratorLeadView, CuratorSourceHealth } from './types.js';
import { instagramPostIdentityKeys } from './instagram-url.js';

type CuratorSocialPost = typeof curatorSocialPosts.$inferSelect;
type CuratorEventLead = typeof curatorEventLeads.$inferSelect;

export function leadFingerprint(input: {
  eventName: string;
  eventDate: string | null;
  venue: string | null;
  postUrl: string;
}): string {
  return createHash('sha256')
    .update(
      `${input.eventName.toLowerCase()}|${input.eventDate ?? ''}|${input.venue?.toLowerCase() ?? ''}|${input.postUrl}`,
    )
    .digest('hex')
    .slice(0, 32);
}

export async function findExistingPost(
  watcherId: string,
  fingerprint: string,
): Promise<CuratorSocialPost | null> {
  const [row] = await db
    .select()
    .from(curatorSocialPosts)
    .where(
      and(
        eq(curatorSocialPosts.watcherId, watcherId),
        eq(curatorSocialPosts.sourceFingerprint, fingerprint),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertSocialPost(input: {
  watcherId: string;
  post: CapturedSocialPost;
}): Promise<{ post: CuratorSocialPost; isNew: boolean }> {
  const existing = await findExistingPost(input.watcherId, input.post.sourceFingerprint);
  if (existing) {
    const [updated] = await db
      .update(curatorSocialPosts)
      .set({
        lastSeenFingerprint: input.post.sourceFingerprint,
        slideCount: input.post.slideImageUrls.length,
        updatedAt: new Date(),
      })
      .where(eq(curatorSocialPosts.id, existing.id))
      .returning();
    return { post: updated!, isNew: false };
  }

  const [row] = await db
    .insert(curatorSocialPosts)
    .values({
      watcherId: input.watcherId,
      postUrl: input.post.postUrl,
      profileHandle: input.post.profileHandle,
      publishedAt: input.post.publishedAt ? new Date(input.post.publishedAt) : null,
      caption: input.post.caption,
      postType: input.post.postType,
      sourceFingerprint: input.post.sourceFingerprint,
      lastSeenFingerprint: input.post.sourceFingerprint,
      slideCount: input.post.slideImageUrls.length,
      outboundLinks: input.post.outboundLinks,
      ephemeralSource: input.post.ephemeralSource,
    })
    .returning();
  return { post: row!, isNew: true };
}

export async function saveSlide(input: {
  postId: string;
  slideNumber: number;
  imageUrl: string;
  ocrText: string;
  ocrStatus: string;
  ocrEngine: string;
  ocrConfidence: number;
  contentHash: string;
}): Promise<string> {
  const [existing] = await db
    .select({ id: curatorPostSlides.id })
    .from(curatorPostSlides)
    .where(
      and(
        eq(curatorPostSlides.postId, input.postId),
        eq(curatorPostSlides.slideNumber, input.slideNumber),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(curatorPostSlides)
      .set({
        ocrText: input.ocrText,
        ocrStatus: input.ocrStatus,
        ocrEngine: input.ocrEngine,
        ocrConfidence: String(input.ocrConfidence),
        contentHash: input.contentHash,
      })
      .where(eq(curatorPostSlides.id, existing.id));
    return existing.id;
  }

  const [row] = await db
    .insert(curatorPostSlides)
    .values({
      postId: input.postId,
      slideNumber: input.slideNumber,
      imageUrl: input.imageUrl,
      ocrText: input.ocrText,
      ocrStatus: input.ocrStatus,
      ocrEngine: input.ocrEngine,
      ocrConfidence: String(input.ocrConfidence),
      contentHash: input.contentHash,
    })
    .returning({ id: curatorPostSlides.id });
  return row!.id;
}

export async function upsertEventLead(
  input: Omit<typeof curatorEventLeads.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<{ lead: CuratorEventLead; isNew: boolean }> {
  const [existing] = await db
    .select()
    .from(curatorEventLeads)
    .where(
      and(
        eq(curatorEventLeads.watcherId, input.watcherId),
        eq(curatorEventLeads.occurrenceFingerprint, input.occurrenceFingerprint),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(curatorEventLeads)
      .set({
        verificationStatus: input.verificationStatus,
        researchSummary: input.researchSummary,
        officialOrganizerUrl: input.officialOrganizerUrl,
        officialVenueUrl: input.officialVenueUrl,
        ticketUrl: input.ticketUrl,
        officialSocialUrl: input.officialSocialUrl,
        creatorRecommendation: input.creatorRecommendation,
        creatorValueScore: input.creatorValueScore,
        creatorValueExplanation: input.creatorValueExplanation,
        verifiedAt: input.verifiedAt,
        updatedAt: new Date(),
      })
      .where(eq(curatorEventLeads.id, existing.id))
      .returning();
    return { lead: updated!, isNew: false };
  }

  const [row] = await db.insert(curatorEventLeads).values(input).returning();
  return { lead: row!, isNew: true };
}

export async function markPostProcessed(postId: string): Promise<void> {
  await db
    .update(curatorSocialPosts)
    .set({ processedAt: new Date(), updatedAt: new Date() })
    .where(eq(curatorSocialPosts.id, postId));
}

export async function listRecentFingerprints(watcherId: string, limit = 50): Promise<string[]> {
  const rows = await db
    .select({ fp: curatorSocialPosts.sourceFingerprint })
    .from(curatorSocialPosts)
    .where(eq(curatorSocialPosts.watcherId, watcherId))
    .orderBy(desc(curatorSocialPosts.createdAt))
    .limit(limit);
  return rows.map((r) => r.fp);
}

/** Canonical post URLs + shortcodes already persisted for this watcher. */
export async function listKnownInstagramPostKeys(watcherId: string, limit = 200): Promise<Set<string>> {
  const rows = await db
    .select({ postUrl: curatorSocialPosts.postUrl })
    .from(curatorSocialPosts)
    .where(eq(curatorSocialPosts.watcherId, watcherId))
    .orderBy(desc(curatorSocialPosts.createdAt))
    .limit(limit);
  const keys = new Set<string>();
  for (const row of rows) {
    for (const key of instagramPostIdentityKeys(row.postUrl)) keys.add(key);
  }
  return keys;
}

export async function listCuratorLeads(input: {
  watcherId?: string;
  limit?: number;
  includeDismissed?: boolean;
}): Promise<CuratorLeadView[]> {
  const rows = await db
    .select()
    .from(curatorEventLeads)
    .where(
      and(
        input.watcherId ? eq(curatorEventLeads.watcherId, input.watcherId) : undefined,
        input.includeDismissed ? undefined : isNull(curatorEventLeads.dismissedAt),
      ),
    )
    .orderBy(desc(curatorEventLeads.discoveredAt))
    .limit(input.limit ?? 100);

  return rows.map(mapLeadView);
}

export function mapLeadView(row: CuratorEventLead): CuratorLeadView {
  return {
    id: row.id,
    eventName: row.eventName,
    eventDate: row.eventDate ?? null,
    eventTime: row.eventTime,
    venue: row.venue,
    neighborhood: row.neighborhood,
    verificationStatus: row.verificationStatus as CuratorLeadView['verificationStatus'],
    discoveredViaHandle: row.discoveredViaHandle,
    discoveredViaPostUrl: row.discoveredViaPostUrl,
    discoveredViaSlideNumber: row.discoveredViaSlideNumber,
    creatorRecommendation: row.creatorRecommendation as CuratorLeadView['creatorRecommendation'],
    creatorValueScore: row.creatorValueScore ? Number(row.creatorValueScore) : null,
    creatorValueExplanation: (row.creatorValueExplanation as Record<string, unknown>) ?? {},
    officialOrganizerUrl: row.officialOrganizerUrl,
    ticketUrl: row.ticketUrl,
    linkedEarlySignalId: row.linkedEarlySignalId,
    dismissedAt: row.dismissedAt?.toISOString() ?? null,
  };
}

export async function dismissCuratorLead(id: string, reason: string): Promise<boolean> {
  const [row] = await db
    .update(curatorEventLeads)
    .set({ dismissedAt: new Date(), dismissReason: reason.slice(0, 500), updatedAt: new Date() })
    .where(eq(curatorEventLeads.id, id))
    .returning();
  return Boolean(row);
}

export async function getCuratorSourceHealth(watcherId: string): Promise<CuratorSourceHealth | null> {
  const { syncInstagramWatchersWithSharedSession } = await import('./instagram-session.js');
  await syncInstagramWatchersWithSharedSession();
  const { sourceWatchers } = await import('../schema.js');
  const [watcher] = await db.select().from(sourceWatchers).where(eq(sourceWatchers.id, watcherId)).limit(1);
  if (!watcher) return null;

  const [stats] = await db
    .select()
    .from(curatorReliabilityStats)
    .where(eq(curatorReliabilityStats.watcherId, watcherId))
    .limit(1);

  const handle =
    (watcher.config as { profileHandle?: string }).profileHandle ??
    watcher.sourceUrl.replace(/.*instagram\.com\//, '@');

  const { nextScheduledCheckAt, watchlistDisplayHealth } = await import('./watchlist-state.js');
  const nextCheck = nextScheduledCheckAt({
    enabled: watcher.enabled,
    paused: watcher.paused ?? false,
    checkFrequencyMs: watcher.checkFrequencyMs,
    lastSuccessfulCheck: watcher.lastSuccessfulCheck,
    lastAttemptedCheck: watcher.lastAttemptedCheck,
    lastFailureAt: watcher.lastFailureAt,
    lastFailureMessage: watcher.lastFailureMessage,
    createdAt: watcher.createdAt,
  });
  const nextCheckEstimate = nextCheck?.toISOString() ?? null;
  const displayHealth = watchlistDisplayHealth({
    enabled: watcher.enabled,
    paused: watcher.paused ?? false,
    healthStatus: watcher.healthStatus,
    sessionStatus: watcher.sessionStatus,
    authenticationRequired: watcher.authenticationRequired,
    lastSuccessfulCheck: watcher.lastSuccessfulCheck,
    lastAttemptedCheck: watcher.lastAttemptedCheck,
    lastFailureAt: watcher.lastFailureAt,
    lastFailureMessage: watcher.lastFailureMessage,
  });

  const { isSchedulerLive } = await import('./scheduler.js');
  const schedulerLive = await isSchedulerLive();

  return {
    watcherId,
    profileHandle: handle.startsWith('@') ? handle : `@${handle}`,
    healthStatus: watcher.healthStatus,
    sessionStatus: watcher.sessionStatus,
    lastSuccessfulCheck: watcher.lastSuccessfulCheck?.toISOString() ?? null,
    lastNewPost: watcher.lastNewItemDetected?.toISOString() ?? null,
    postsProcessed: stats?.postsProcessed ?? 0,
    eventsExtracted: stats?.leadsExtracted ?? 0,
    verifiedYield: stats?.leadsVerified ?? 0,
    noiseRate: stats?.noiseRate ? Number(stats.noiseRate) : null,
    reliabilityScore: stats?.reliabilityScore ? Number(stats.reliabilityScore) : null,
    lastAttemptedCheck: watcher.lastAttemptedCheck?.toISOString() ?? null,
    lastFailureAt: watcher.lastFailureAt?.toISOString() ?? null,
    nextCheckEstimate,
    nextCheckLabel: schedulerLive
      ? 'Next scheduled check'
      : 'Next check when scheduler is enabled',
    schedulerLive,
    paused: watcher.paused ?? false,
    authenticationRequired: watcher.authenticationRequired,
    checkFrequencyHours: Math.round(watcher.checkFrequencyMs / 3_600_000),
    displayHealth,
    lastFailureMessage: watcher.lastFailureMessage
      ? (await import('../playwright-runtime/index.js')).sanitizePlaywrightOperatorError(
          watcher.lastFailureMessage,
        )
      : null,
  };
}

export async function countActiveLeadsForWatcher(watcherId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(curatorEventLeads)
    .where(and(eq(curatorEventLeads.watcherId, watcherId), isNull(curatorEventLeads.dismissedAt)));
  return Number(row?.count ?? 0);
}
