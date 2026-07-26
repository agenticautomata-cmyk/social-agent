import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { sourceWatchers } from '../schema.js';
import { assessCreatorValue, isCalendarEligible } from './creator-value.js';
import { findInventoryDuplicate, isPastEvent } from './dedupe.js';
import { researchCuratorEventLead } from './event-research.js';
import { fetchInstagramProfilePosts } from './instagram-profile-watcher.js';
import { pauseWatcherForAuth } from './instagram-session.js';
import { promoteCuratorLead } from './promote.js';
import { parseAllSlides } from './roundup-parser.js';
import { incrementCuratorRunStats, refreshCuratorReliability } from './reliability.js';
import { buildAttributionLine, ocrAllCarouselSlides } from './slide-ocr.js';
import {
  leadFingerprint,
  listRecentFingerprints,
  markPostProcessed,
  saveSlide,
  upsertEventLead,
  upsertSocialPost,
} from './store.js';
import type { CapturedSocialPost, CuratorPipelineResult } from './types.js';

export async function processCuratorPost(input: {
  watcherId: string;
  post: CapturedSocialPost;
  skipResearch?: boolean;
  fixtureOcrTexts?: string[];
}): Promise<{
  slidesProcessed: number;
  eventsExtracted: number;
  verified: number;
  partiallyVerified: number;
  conflicted: number;
  expired: number;
  duplicates: number;
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
    post: input.post,
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
    if (isPastEvent(event.eventDate)) {
      stats.expired += 1;
      continue;
    }

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
      },
    });

    if (isNew && value.recommendation !== 'ignore') {
      await promoteCuratorLead(lead.id).catch(() => undefined);
    }

    stats.eventsExtracted += 1;
  }

  await markPostProcessed(savedPost.id);
  return stats;
}

export async function runCuratorWatchlistPipeline(input: {
  watcherId: string;
  specificPostUrl?: string;
  force?: boolean;
}): Promise<CuratorPipelineResult> {
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
  const fetch = await fetchInstagramProfilePosts({
    profileUrl: watcher.sourceUrl,
    lastSeenFingerprints: lastSeen,
    specificPostUrl: input.specificPostUrl,
  });

  if (fetch.pausedForAuth) {
    await pauseWatcherForAuth(input.watcherId, fetch.error ?? 'Instagram login required');
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
      pausedForAuth: true,
      error: fetch.error ?? 'Authentication required',
    };
  }

  if (!fetch.ok) {
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
      error: fetch.error ?? 'Fetch failed',
    };
  }

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

  for (const post of fetch.posts) {
    const result = await processCuratorPost({ watcherId: input.watcherId, post });
    totals.postsProcessed += 1;
    totals.slidesProcessed += result.slidesProcessed;
    totals.eventsExtracted += result.eventsExtracted;
    totals.eventsVerified += result.verified;
    totals.eventsPartiallyVerified += result.partiallyVerified;
    totals.eventsConflicted += result.conflicted;
    totals.eventsExpired += result.expired;
    totals.duplicatesSkipped += result.duplicates;
  }

  await incrementCuratorRunStats(input.watcherId, {
    postsProcessed: totals.postsProcessed,
    slidesProcessed: totals.slidesProcessed,
  });
  await refreshCuratorReliability(input.watcherId);

  if (totals.newPosts > 0) {
    await db
      .update(sourceWatchers)
      .set({
        lastSuccessfulCheck: new Date(),
        lastNewItemDetected: new Date(),
        healthStatus: 'healthy',
        sessionStatus: 'ready',
        updatedAt: new Date(),
      })
      .where(eq(sourceWatchers.id, input.watcherId));
  } else {
    await db
      .update(sourceWatchers)
      .set({ lastSuccessfulCheck: new Date(), healthStatus: 'healthy', updatedAt: new Date() })
      .where(eq(sourceWatchers.id, input.watcherId));
  }

  const { emitDataChange } = await import('../data-revision/index.js');
  await emitDataChange({
    eventType: 'source_watcher_complete',
    domains: ['curator_watchlist', 'scout', 'early_signals'],
    completedAt: new Date().toISOString(),
    source: 'curator-watchlist',
    recordIds: [input.watcherId],
    success: true,
  });

  return { ok: true, ...totals };
}

export async function ensureCuratorWatcher(profileUrl: string): Promise<string> {
  const { createWatchedSource } = await import('../benson-scout/watchlist.js');
  const handle = profileUrl.replace(/.*instagram\.com\//, '').replace(/\/$/, '');
  const existing = await db
    .select({ id: sourceWatchers.id })
    .from(sourceWatchers)
    .where(eq(sourceWatchers.sourceUrl, profileUrl.replace(/\/$/, '')))
    .limit(1);

  if (existing[0]) {
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
      .where(eq(sourceWatchers.id, existing[0].id));
    return existing[0].id;
  }

  const { watcher } = await createWatchedSource({
    url: profileUrl,
    monitoringMode: 'WATCH_ACCOUNT',
    sourceName: `@${handle}`,
  });

  await db
    .update(sourceWatchers)
    .set({
      watcherKind: 'curator',
      paused: false,
      authenticationRequired: true,
      sessionStatus: 'ready',
      healthStatus: 'healthy',
      config: { profileHandle: handle, curatorSource: true },
      extractionConfig: { curatorPipeline: true, ocrEngine: 'openai-vision' },
    })
    .where(eq(sourceWatchers.id, watcher.id));

  return watcher.id;
}
