import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { sourceWatchers } from '../schema.js';
import { assessCreatorValue, isCalendarEligible } from './creator-value.js';
import { findInventoryDuplicate, isPastEvent } from './dedupe.js';
import { researchCuratorEventLead } from './event-research.js';
import { fetchInstagramProfilePostsWithContext } from './instagram-profile-watcher.js';
import { pauseWatcherForAuth, closeInstagramSession, openInstagramSession, syncInstagramWatchersWithSharedSession, instagramWatcherFlagsFromSharedSession, sharedInstagramSessionReady } from './instagram-session.js';
import { reconcileAuthenticatedInstagramSuccess } from './auth-reconciliation.js';
import { promoteCuratorLead } from './promote.js';
import { parseAllSlides } from './roundup-parser.js';
import { incrementCuratorRunStats, refreshCuratorReliability } from './reliability.js';
import { buildAttributionLine, createSessionImageFetcher, ocrAllCarouselSlides, type InstagramImageFetcher } from './slide-ocr.js';
import {
  attachLeadProvenance,
  findActiveLeadByOccurrence,
  leadFingerprint,
  listKnownInstagramPostKeys,
  listKnownWatchlistOccurrenceKeys,
  listRecentFingerprints,
  markPostProcessed,
  saveSlide,
  upsertEventLead,
  upsertSocialPost,
} from './store.js';
import type { CapturedSocialPost, CuratorPipelineResult } from './types.js';
import { classifyWatchlistText, isEngagementLedText, watchlistOccurrenceIdentityKeys } from './watchlist-intelligence.js';
import { persistWatchlistFindings } from './watchlist-activity.js';
import { normalizeInstagramUrl } from './instagram-url.js';
import { canonicalizeWatchSource } from '../benson-scout/canonical-source.js';
import {
  formatInstagramWatchInspectionSummary,
  type InstagramWatchInspection,
} from './watch-inspection.js';

export async function processCuratorPost(input: {
  watcherId: string;
  post: CapturedSocialPost;
  skipResearch?: boolean;
  fixtureOcrTexts?: string[];
  imageFetcher?: InstagramImageFetcher;
  firstCheckBaseline?: boolean;
}): Promise<{
  slidesProcessed: number;
  eventsExtracted: number;
  verified: number;
  partiallyVerified: number;
  conflicted: number;
  expired: number;
  duplicates: number;
  findingsStored?: number;
}> {
  const stats = {
    slidesProcessed: 0,
    eventsExtracted: 0,
    verified: 0,
    partiallyVerified: 0,
    conflicted: 0,
    expired: 0,
    duplicates: 0,
  };

  const { post: savedPost } = await upsertSocialPost({
    watcherId: input.watcherId,
    post: {
      ...input.post,
      postUrl: normalizeInstagramUrl(input.post.postUrl) ?? input.post.postUrl,
    },
  });

  const ocrResults = input.fixtureOcrTexts
    ? input.fixtureOcrTexts.map((text, i) => ({
        slideNumber: i + 1,
        text,
        confidence: 0.9,
        engine: 'fixture',
        contentHash: `fixture-${i + 1}`,
        ok: text.length > 8,
      }))
    : await ocrAllCarouselSlides({
        slideImageUrls: input.post.slideImageUrls,
        captionContext: input.post.caption,
        fetchImage: input.imageFetcher,
      });

  const slideRecords: Array<{ slideNumber: number; ocrText: string; slideId: string }> = [];
  for (const ocr of ocrResults) {
    if (!ocr.ok && !ocr.text) continue;
    stats.slidesProcessed += 1;
    const slideId = await saveSlide({
      postId: savedPost.id,
      slideNumber: ocr.slideNumber,
      imageUrl: input.post.slideImageUrls[ocr.slideNumber - 1] ?? '',
      ocrText: ocr.text,
      ocrStatus: ocr.ok ? 'completed' : 'failed',
      ocrEngine: ocr.engine,
      ocrConfidence: ocr.confidence,
      contentHash: ocr.contentHash,
    });
    slideRecords.push({ slideNumber: ocr.slideNumber, ocrText: ocr.text, slideId });
  }

  const parsedEvents = await parseAllSlides({
    slides: slideRecords.map((s) => ({ slideNumber: s.slideNumber, ocrText: s.ocrText })),
    postCaption: input.post.caption,
    postPublishedAt: input.post.publishedAt,
  });

  for (const event of parsedEvents) {
    if (!event.eventName?.trim()) continue;
    if (isEngagementLedText(event.eventName) || /\?/.test(event.eventName)) continue;
    if (isPastEvent(event.eventDate)) {
      stats.expired += 1;
      continue;
    }

    const existingOccurrence = await findActiveLeadByOccurrence({
      eventName: event.eventName,
      eventDate: event.eventDate,
      venue: event.venue,
      evidence: event.originalQuotedText,
    });
    if (existingOccurrence) {
      await attachLeadProvenance(existingOccurrence, input.post.postUrl);
      stats.duplicates += 1;
      continue;
    }

    const occKeys = watchlistOccurrenceIdentityKeys({
      title: event.eventName,
      eventDate: event.eventDate,
      venue: event.venue,
      evidence: event.originalQuotedText,
      type: 'curator_event_lead',
    });

    const fp = leadFingerprint({
      eventName: event.eventName,
      eventDate: event.eventDate,
      venue: event.venue,
      postUrl: input.post.postUrl,
    });

    const dup = await findInventoryDuplicate({
      title: event.eventName,
      eventDate: event.eventDate,
      venue: event.venue,
      sourceUrl: input.post.postUrl,
    });
    if (dup) {
      stats.duplicates += 1;
      continue;
    }

    const research = input.skipResearch
      ? {
          verificationStatus: 'SOCIAL_LEAD' as const,
          officialOrganizerUrl: null,
          officialVenueUrl: null,
          ticketUrl: null,
          officialSocialUrl: null,
          verifiedDate: event.eventDate,
          verifiedTime: event.eventTime,
          verifiedVenue: event.venue,
          verifiedAddress: null,
          verifiedCost: event.price,
          verifiedAgeRestriction: event.ageRestriction,
          parkingInfo: null,
          filmingNotes: null,
          cancellationNotes: null,
          contactInfo: null,
          conflicts: [],
          summary: null,
          citations: [],
        }
      : await researchCuratorEventLead({
          event,
          curatorHandle: input.post.profileHandle,
          postUrl: input.post.postUrl,
        });

    if (research.verificationStatus === 'EXPIRED') {
      stats.expired += 1;
      continue;
    }
    if (research.verificationStatus === 'VERIFIED') stats.verified += 1;
    else if (research.verificationStatus === 'PARTIALLY_VERIFIED') stats.partiallyVerified += 1;
    else if (research.verificationStatus === 'CONFLICTED') stats.conflicted += 1;

    const value = assessCreatorValue({
      event,
      research,
      verificationStatus: research.verificationStatus,
    });

    const slideId = slideRecords.find((s) => s.slideNumber === event.slideNumber)?.slideId ?? null;

    const { lead, isNew } = await upsertEventLead({
      watcherId: input.watcherId,
      postId: savedPost.id,
      slideId,
      eventName: event.eventName.slice(0, 500),
      eventDate: event.eventDate,
      eventTime: event.eventTime,
      venue: event.venue,
      neighborhood: event.neighborhood,
      price: event.price,
      ageRestriction: event.ageRestriction,
      registrationNotes: event.registrationNotes,
      dayHeading: event.dayHeading,
      discoveredViaHandle: input.post.profileHandle,
      discoveredViaPostUrl: input.post.postUrl,
      discoveredViaSlideNumber: event.slideNumber,
      originalQuotedText: event.originalQuotedText,
      verificationStatus: research.verificationStatus,
      officialOrganizerUrl: research.officialOrganizerUrl,
      officialVenueUrl: research.officialVenueUrl,
      ticketUrl: research.ticketUrl,
      officialSocialUrl: research.officialSocialUrl,
      researchSummary: {
        summary: research.summary,
        citations: research.citations,
        conflicts: research.conflicts,
        attribution: buildAttributionLine(input.post.profileHandle),
        verifiedAddress: research.verifiedAddress,
        parkingInfo: research.parkingInfo,
        filmingNotes: research.filmingNotes,
        contactInfo: research.contactInfo,
      },
      verificationNotes: research.conflicts.join('; ') || null,
      verifiedAt: research.verificationStatus === 'VERIFIED' ? new Date() : null,
      creatorRecommendation: value.recommendation,
      creatorValueScore: String(value.score),
      creatorValueExplanation: value.explanation,
      occurrenceFingerprint: fp,
      metadata: {
        calendarEligible: isCalendarEligible({
          verificationStatus: research.verificationStatus,
          eventDate: event.eventDate,
        }),
        copyrightSafeguard: 'facts_only_no_graphic_reuse',
        occurrenceIdentity: occKeys[0] ?? null,
        occurrenceIdentityKeys: occKeys,
        provenanceUrls: [input.post.postUrl],
      },
    });

    if (isNew && value.recommendation !== 'ignore') {
      await promoteCuratorLead(lead.id).catch(() => undefined);
    }

    stats.eventsExtracted += 1;
  }

  const combinedText = [input.post.caption, ...slideRecords.map((s) => s.ocrText)]
    .filter((part) => Boolean(part && part.trim()))
    .join('\n');
  const classified = classifyWatchlistText({
    text: combinedText,
    sourceUrl: input.post.postUrl,
    watchedSource: `@${input.post.profileHandle.replace(/^@/, '')}`,
    retrievedAt: new Date().toISOString(),
    publishedAt: input.post.publishedAt,
    firstCheckBaseline: input.firstCheckBaseline,
    knownCanonicalKeys: new Set([
      ...(await listKnownWatchlistOccurrenceKeys()),
      ...parsedEvents.flatMap((event) =>
        watchlistOccurrenceIdentityKeys({
          title: event.eventName,
          eventDate: event.eventDate,
          venue: event.venue,
          evidence: event.originalQuotedText,
          type: 'event',
        }),
      ),
    ]),
  });
  const nonEventFindings = classified.accepted.filter((finding) => {
    if (finding.type !== 'event') return true;
    return !parsedEvents.some((event) =>
      event.eventName.toLowerCase().includes(finding.title.slice(0, 18).toLowerCase()),
    );
  });
  const stored = await persistWatchlistFindings(nonEventFindings, input.watcherId).catch(() => ({
    stored: 0,
    duplicates: 0,
  }));

  await markPostProcessed(savedPost.id);
  return { ...stats, findingsStored: stored.stored };
}

function pipelineFromInspection(
  inspection: InstagramWatchInspection,
  extra: Partial<CuratorPipelineResult> = {},
): CuratorPipelineResult {
  return {
    ok: extra.ok ?? false,
    postsProcessed: extra.postsProcessed ?? 0,
    slidesProcessed: extra.slidesProcessed ?? 0,
    eventsExtracted: extra.eventsExtracted ?? inspection.extracted,
    eventsVerified: extra.eventsVerified ?? 0,
    eventsPartiallyVerified: extra.eventsPartiallyVerified ?? 0,
    eventsConflicted: extra.eventsConflicted ?? 0,
    eventsExpired: extra.eventsExpired ?? 0,
    duplicatesSkipped: extra.duplicatesSkipped ?? 0,
    newPosts: extra.newPosts ?? inspection.newlyInspected,
    error: extra.error,
    pausedForAuth: extra.pausedForAuth,
    inspectionSummary:
      extra.inspectionSummary ?? formatInstagramWatchInspectionSummary(inspection, extra.error),
    postsDiscovered: inspection.postsDiscovered,
    alreadyKnown: inspection.alreadyKnown,
    newlyInspected: inspection.newlyInspected,
    captureFailed: inspection.failed.length,
  };
}

export async function runCuratorWatchlistPipeline(input: {
  watcherId: string;
  specificPostUrl?: string;
  force?: boolean;
}): Promise<CuratorPipelineResult> {
  await syncInstagramWatchersWithSharedSession();
  const [watcher] = await db
    .select()
    .from(sourceWatchers)
    .where(eq(sourceWatchers.id, input.watcherId))
    .limit(1);

  if (!watcher) {
    return {
      ok: false,
      postsProcessed: 0,
      slidesProcessed: 0,
      eventsExtracted: 0,
      eventsVerified: 0,
      eventsPartiallyVerified: 0,
      eventsConflicted: 0,
      eventsExpired: 0,
      duplicatesSkipped: 0,
      newPosts: 0,
      error: 'Watcher not found',
    };
  }

  if (watcher.paused && !input.force) {
    return {
      ok: false,
      postsProcessed: 0,
      slidesProcessed: 0,
      eventsExtracted: 0,
      eventsVerified: 0,
      eventsPartiallyVerified: 0,
      eventsConflicted: 0,
      eventsExpired: 0,
      duplicatesSkipped: 0,
      newPosts: 0,
      error: 'Watcher is paused',
    };
  }

  const lastSeen = input.force ? [] : await listRecentFingerprints(input.watcherId);
  const knownPostKeys = input.force ? new Set<string>() : await listKnownInstagramPostKeys(input.watcherId);

  const { ctx, status, sanitizedFailure } = await openInstagramSession();
  if (!ctx) {
    const pausedForAuth = status === 'login_required' || status === 'captcha_blocked';
    const operatorError = sanitizedFailure ?? status;
    if (pausedForAuth) {
      await pauseWatcherForAuth(input.watcherId, operatorError);
    } else {
      await db
        .update(sourceWatchers)
        .set({
          healthStatus: 'failed',
          lastFailureAt: new Date(),
          lastFailureMessage: operatorError.slice(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(sourceWatchers.id, input.watcherId));
    }
    return {
      ok: false,
      postsProcessed: 0,
      slidesProcessed: 0,
      eventsExtracted: 0,
      eventsVerified: 0,
      eventsPartiallyVerified: 0,
      eventsConflicted: 0,
      eventsExpired: 0,
      duplicatesSkipped: 0,
      newPosts: 0,
      pausedForAuth,
      error: sanitizedFailure ?? status,
    };
  }

  let fetch: Awaited<ReturnType<typeof fetchInstagramProfilePostsWithContext>>;
  try {
    fetch = await fetchInstagramProfilePostsWithContext(ctx, {
      profileUrl: watcher.sourceUrl,
      lastSeenFingerprints: lastSeen,
      knownPostKeys,
      specificPostUrl: input.specificPostUrl,
      pageWaitUntil: 'domcontentloaded',
    });
  } catch (err) {
    await closeInstagramSession(ctx);
    const { sanitizePlaywrightOperatorError } = await import('../playwright-runtime/index.js');
    const message = sanitizePlaywrightOperatorError(err instanceof Error ? err.message : 'Fetch failed');
    await db
      .update(sourceWatchers)
      .set({
        healthStatus: 'failed',
        lastFailureAt: new Date(),
        lastFailureMessage: message.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(sourceWatchers.id, input.watcherId));
    return {
      ok: false,
      postsProcessed: 0,
      slidesProcessed: 0,
      eventsExtracted: 0,
      eventsVerified: 0,
      eventsPartiallyVerified: 0,
      eventsConflicted: 0,
      eventsExpired: 0,
      duplicatesSkipped: 0,
      newPosts: 0,
      error: message,
      inspectionSummary: message,
    };
  }

  if (fetch.pausedForAuth) {
    await closeInstagramSession(ctx);
    await pauseWatcherForAuth(input.watcherId, fetch.error ?? 'Instagram login required');
    return pipelineFromInspection(fetch.inspection, {
      ok: false,
      pausedForAuth: true,
      error: fetch.error ?? 'Authentication required',
    });
  }

  if (!fetch.ok) {
    await closeInstagramSession(ctx);
    const summary = formatInstagramWatchInspectionSummary(fetch.inspection, fetch.error);
    await db
      .update(sourceWatchers)
      .set({
        healthStatus: 'failed',
        lastFailureAt: new Date(),
        lastFailureMessage: summary.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(sourceWatchers.id, input.watcherId));
    return pipelineFromInspection(fetch.inspection, {
      ok: false,
      error: summary,
    });
  }

  const inspection = fetch.inspection;
  const totals = {
    postsProcessed: 0,
    slidesProcessed: 0,
    eventsExtracted: 0,
    eventsVerified: 0,
    eventsPartiallyVerified: 0,
    eventsConflicted: 0,
    eventsExpired: 0,
    duplicatesSkipped: 0,
    newPosts: fetch.posts.length,
  };

  const imageFetcher = createSessionImageFetcher(ctx.page);
  const firstCheckBaseline = watcher.lastSuccessfulCheck == null;

  try {
    for (const post of fetch.posts) {
      const result = await processCuratorPost({
        watcherId: input.watcherId,
        post,
        imageFetcher,
        firstCheckBaseline,
      });
      totals.postsProcessed += 1;
      totals.slidesProcessed += result.slidesProcessed;
      totals.eventsExtracted += result.eventsExtracted;
      totals.eventsVerified += result.verified;
      totals.eventsPartiallyVerified += result.partiallyVerified;
      totals.eventsConflicted += result.conflicted;
      totals.eventsExpired += result.expired;
      totals.duplicatesSkipped += result.duplicates;
    }
  } finally {
    await closeInstagramSession(ctx);
  }

  inspection.extracted = totals.eventsExtracted;
  const summary = formatInstagramWatchInspectionSummary(inspection);

  await incrementCuratorRunStats(input.watcherId, {
    postsProcessed: totals.postsProcessed,
    slidesProcessed: totals.slidesProcessed,
  });
  await refreshCuratorReliability(input.watcherId);

  await db
    .update(sourceWatchers)
    .set({
      lastSuccessfulCheck: new Date(),
      healthStatus: 'healthy',
      sessionStatus: 'ready',
      lastFailureMessage: null,
      lastFailureAt: null,
      updatedAt: new Date(),
      ...(totals.newPosts > 0 ? { lastNewItemDetected: new Date() } : {}),
    })
    .where(eq(sourceWatchers.id, input.watcherId));

  await reconcileAuthenticatedInstagramSuccess(input.watcherId);

  const { emitDataChange } = await import('../data-revision/index.js');
  await emitDataChange({
    eventType: 'source_watcher_complete',
    domains: ['curator_watchlist', 'scout', 'early_signals'],
    completedAt: new Date().toISOString(),
    source: 'curator-watchlist',
    recordIds: [input.watcherId],
    success: true,
  });

  return pipelineFromInspection(inspection, {
    ok: true,
    ...totals,
    inspectionSummary: summary,
  });
}

/**
 * Idempotently resolve (or create) the watch source for an Instagram profile URL.
 *
 * Historical bug: this used to compare `profileUrl.replace(/\/$/, '')` (slash stripped)
 * against the stored `source_watchers.source_url` (which is stored WITH a trailing
 * slash), so the "already exists" check never matched and every call — including every
 * re-run of `pnpm seed:curator-watchlist` against the same literal URL — inserted a
 * brand new duplicate row. Five identical @jasfoodjourney rows were created this way.
 *
 * This now resolves via the canonical account identity (`instagram:account:<handle>`,
 * see benson-scout/canonical-source.ts) which is normalized independent of URL casing,
 * www/trailing-slash, and tracking parameters, and is backed by a DB unique constraint.
 */
/** Re-run extraction against the most recently discovered post for this watcher. */
export async function reprocessLatestCuratorPost(watcherId: string): Promise<CuratorPipelineResult> {
  const { curatorSocialPosts } = await import('../schema.js');
  const { desc } = await import('drizzle-orm');
  const [latest] = await db
    .select()
    .from(curatorSocialPosts)
    .where(eq(curatorSocialPosts.watcherId, watcherId))
    .orderBy(desc(curatorSocialPosts.createdAt))
    .limit(1);

  if (!latest) {
    return {
      ok: false,
      postsProcessed: 0,
      slidesProcessed: 0,
      eventsExtracted: 0,
      eventsVerified: 0,
      eventsPartiallyVerified: 0,
      eventsConflicted: 0,
      eventsExpired: 0,
      duplicatesSkipped: 0,
      newPosts: 0,
      error: 'No previously discovered post to reprocess for this source yet.',
    };
  }

  return runCuratorWatchlistPipeline({ watcherId, specificPostUrl: latest.postUrl, force: true });
}

export async function ensureCuratorWatcher(profileUrl: string): Promise<string> {
  const { createWatchedSource, findWatchSourceByCanonicalKey } = await import('../benson-scout/watchlist.js');
  const canonical = canonicalizeWatchSource(profileUrl);
  const handle = canonical.handle ?? profileUrl.replace(/.*instagram\.com\//, '').replace(/\/$/, '');

  const existing = canonical.handle ? await findWatchSourceByCanonicalKey(canonical.key) : null;

  if (existing) {
    await db
      .update(sourceWatchers)
      .set({
        watcherKind: 'curator',
        platform: 'instagram',
        adapterType: 'social_account',
        monitoringMode: 'WATCH_ACCOUNT',
        config: { profileHandle: handle, curatorSource: true },
        updatedAt: new Date(),
      })
      .where(eq(sourceWatchers.id, existing.id));
    return existing.id;
  }

  const { watcher, alreadyWatching } = await createWatchedSource({
    url: canonical.canonicalUrl,
    monitoringMode: 'WATCH_ACCOUNT',
    sourceName: `@${handle}`,
  });

  if (alreadyWatching) {
    // A concurrent call (or a non-Instagram/legacy canonical mismatch) resolved to an
    // existing row — bring it up to curator-watcher config without creating a duplicate.
    await db
      .update(sourceWatchers)
      .set({
        watcherKind: 'curator',
        config: { profileHandle: handle, curatorSource: true },
        updatedAt: new Date(),
      })
      .where(eq(sourceWatchers.id, watcher.id));
    return watcher.id;
  }

  const sessionReady = await sharedInstagramSessionReady();
  const flags = instagramWatcherFlagsFromSharedSession({
    sessionReady,
    monitoringMode: 'WATCH_ACCOUNT',
  });

  await db
    .update(sourceWatchers)
    .set({
      watcherKind: 'curator',
      paused: flags.paused,
      authenticationRequired: flags.authenticationRequired,
      sessionStatus: flags.sessionStatus,
      healthStatus: flags.healthStatus,
      config: { profileHandle: handle, curatorSource: true },
      extractionConfig: { curatorPipeline: true, ocrEngine: 'openai-vision' },
    })
    .where(eq(sourceWatchers.id, watcher.id));

  return watcher.id;
}
