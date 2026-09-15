import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { sourceWatchers } from '../schema.js';
import { assessCreatorValue, isCalendarEligible } from './creator-value.js';
import { findInventoryDuplicate, isPastEvent } from './dedupe.js';
import { researchCuratorEventLead } from './event-research.js';
import { fetchInstagramProfilePostsWithContext } from './instagram-profile-watcher.js';
import { extractHandleFromProfileUrl } from './instagram-page-utils.js';
import { pauseWatcherForAuth, closeInstagramSession, openInstagramSession, syncInstagramWatchersWithSharedSession, instagramWatcherFlagsFromSharedSession, sharedInstagramSessionReady } from './instagram-session.js';
import { reconcileAuthenticatedInstagramSuccess } from './auth-reconciliation.js';
import { promoteCuratorLead } from './promote.js';
import { parseAllSlides } from './roundup-parser.js';
import { incrementCuratorRunStats, refreshCuratorReliability } from './reliability.js';
import { buildAttributionLine, createSessionImageFetcher, ocrAllCarouselSlides, type InstagramImageFetcher } from './slide-ocr.js';
import { processPostVisualEvents } from './instagram-visual/process-post.js';
import {
  coverageStatusToHealthStatus,
  emptyCoverageReport,
  finalizeCoverageReport,
  summarizeCandidates,
} from './instagram-visual/coverage.js';
import { defaultInstagramVisualBounds } from './instagram-visual/bounds.js';
import { isInstagramErrorChrome, isInstagramErrorChromeTitle } from './instagram-visual/ig-error-chrome.js';
import { evaluateEventQualityGate, isResearchFailureProse } from './instagram-visual/event-quality-gate.js';
import { isOcrGibberishTitle } from './instagram-visual/ocr-quality.js';
import type { VisualEventCandidate } from './instagram-visual/types.js';
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
import type { CapturedSocialPost, CuratorPipelineResult, EventResearchResult, ParsedRoundupEvent } from './types.js';
import { classifyWatchlistText, isEngagementLedText, watchlistOccurrenceIdentityKeys } from './watchlist-intelligence.js';
import { persistWatchlistFindings } from './watchlist-activity.js';
import { normalizeInstagramUrl } from './instagram-url.js';
import { canonicalizeWatchSource } from '../benson-scout/canonical-source.js';
import {
  formatInstagramWatchInspectionSummary,
  type InstagramWatchInspection,
} from './watch-inspection.js';
import {
  applyPersistenceOutcome,
  emptyCuratorRunCounters,
  mergeCuratorRunCounters,
  type CuratorRunCounters,
  type PersistenceOutcome,
} from './persistence-outcome.js';
import { reclassifyExpiredCuratorLeadsForWatcher } from './instagram-visual-backfill.js';

function visualCandidateToParsed(c: VisualEventCandidate): ParsedRoundupEvent | null {
  if (!c.title?.trim()) return null;
  if (c.decisionStage === 'rejected' || c.decisionStage === 'duplicate') return null;
  if (isInstagramErrorChromeTitle(c.title) || isInstagramErrorChrome(c.originalQuotedText)) return null;
  return {
    eventName: c.title,
    eventDate: c.eventDate,
    eventTime: c.eventTime,
    venue: c.venue,
    neighborhood: c.neighborhood,
    price: c.price,
    ageRestriction: c.ageRestriction,
    registrationNotes: c.ticketUrl,
    dayHeading: c.dayHeading,
    originalQuotedText: c.originalQuotedText,
    slideNumber: c.slideNumbers[0] ?? 1,
  };
}

export async function processCuratorPost(input: {
  watcherId: string;
  post: CapturedSocialPost;
  skipResearch?: boolean;
  fixtureOcrTexts?: string[];
  imageFetcher?: InstagramImageFetcher;
  firstCheckBaseline?: boolean;
  /** When provided, skip re-running visual OCR for this post. */
  precomputedVisual?: Awaited<ReturnType<typeof processPostVisualEvents>>;
}): Promise<{
  slidesProcessed: number;
  /** @deprecated Prefer newLogicalEvents — kept equal to created-only count. */
  eventsExtracted: number;
  newLogicalEvents: number;
  verified: number;
  partiallyVerified: number;
  conflicted: number;
  expired: number;
  duplicates: number;
  findingsStored?: number;
  counters: CuratorRunCounters;
  outcomes: PersistenceOutcome[];
}> {
  const stats = {
    slidesProcessed: 0,
    eventsExtracted: 0,
    newLogicalEvents: 0,
    verified: 0,
    partiallyVerified: 0,
    conflicted: 0,
    expired: 0,
    duplicates: 0,
  };
  let counters = emptyCuratorRunCounters();
  const outcomes: PersistenceOutcome[] = [];

  const recordOutcome = (outcome: PersistenceOutcome) => {
    outcomes.push(outcome);
    counters = applyPersistenceOutcome(counters, outcome);
    if (outcome === 'created') {
      stats.eventsExtracted += 1;
      stats.newLogicalEvents += 1;
    } else if (outcome === 'duplicate') {
      stats.duplicates += 1;
    } else if (outcome === 'expired') {
      stats.expired += 1;
    }
  };

  const { post: savedPost } = await upsertSocialPost({
    watcherId: input.watcherId,
    post: {
      ...input.post,
      postUrl: normalizeInstagramUrl(input.post.postUrl) ?? input.post.postUrl,
    },
  });

  const visual =
    input.precomputedVisual ??
    (await processPostVisualEvents({
      post: input.post,
      fetchImage: input.imageFetcher,
      fixtureOcrTexts: input.fixtureOcrTexts,
      notPreviouslyInspected: true,
    }));

  const ocrResults = input.fixtureOcrTexts
    ? input.fixtureOcrTexts.map((text, i) => ({
        slideNumber: i + 1,
        text,
        confidence: 0.9,
        engine: 'fixture',
        contentHash: `fixture-${i + 1}`,
        ok: text.length > 8,
      }))
    : visual.slideOcr.length > 0
      ? visual.slideOcr
          .filter((s) => s.engine !== 'platform_alt')
          .map((s) => ({
            slideNumber: s.slideNumber,
            text: s.normalizedText || s.rawText,
            confidence: s.confidence,
            engine: s.engine,
            contentHash: s.mediaHash,
            ok: (s.normalizedText || s.rawText).length > 8,
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

  const visualParsed = visual.candidates
    .filter((c) => c.decisionStage !== 'duplicate')
    .map(visualCandidateToParsed)
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

  const parsedEvents =
    visualParsed.length > 0
      ? visualParsed
      : await parseAllSlides({
          slides: slideRecords.map((s) => ({ slideNumber: s.slideNumber, ocrText: s.ocrText })),
          postCaption: input.post.caption,
          postPublishedAt: input.post.publishedAt,
        });

  for (const event of parsedEvents) {
    if (!event.eventName?.trim()) continue;
    if (isInstagramErrorChromeTitle(event.eventName) || isInstagramErrorChrome(event.originalQuotedText)) {
      recordOutcome('rejected');
      continue;
    }
    if (isOcrGibberishTitle(event.eventName, { caption: input.post.caption })) {
      recordOutcome('rejected');
      continue;
    }
    if (isEngagementLedText(event.eventName) || /\?/.test(event.eventName)) {
      recordOutcome('rejected');
      continue;
    }

    const visualMatch = visual.candidates.find(
      (c) => c.title && event.eventName.toLowerCase().includes(c.title.slice(0, 18).toLowerCase()),
    );

    // Pre-persistence quality gate — raw OCR never becomes a lead
    if (visualMatch) {
      const gate = evaluateEventQualityGate(visualMatch, {
        caption: input.post.caption,
        postClassIsEvent: true,
      });
      if (gate.queue === 'reject') {
        recordOutcome('rejected');
        continue;
      }
      if (gate.queue === 'low_confidence_discovery') {
        // Separate discovery queue — do not create ordinary Event Leads
        recordOutcome('rejected');
        counters.reviewCandidates += 1;
        continue;
      }
    } else {
      // Fallback parse path without visual match still needs gate-ish checks
      const synthetic = {
        title: event.eventName,
        eventDate: event.eventDate,
        eventTime: event.eventTime,
        venue: event.venue,
        price: event.price,
        ticketUrl: event.registrationNotes,
        originalQuotedText: event.originalQuotedText,
        yearTrust: 'year_unresolved' as const,
        temporalClass: (event.eventDate ? 'future' : 'undated') as 'future' | 'undated',
        decisionStage: 'extracted' as const,
        fieldEvidence: [] as [],
        likelihoodScore: 0.4,
      };
      const gate = evaluateEventQualityGate(synthetic, {
        caption: input.post.caption,
        postClassIsEvent: Boolean(event.eventDate && event.venue),
      });
      if (!gate.pass) {
        recordOutcome('rejected');
        continue;
      }
    }

    if (visualMatch?.decisionStage === 'review') {
      counters.reviewCandidates += 1;
    }
    if (visualMatch?.decisionStage === 'rejected' && visualMatch.rejectionReason === 'expired') {
      recordOutcome('expired');
      continue;
    }
    if (isPastEvent(event.eventDate)) {
      recordOutcome('expired');
      continue;
    }

    const existingOccurrence = await findActiveLeadByOccurrence({
      eventName: event.eventName,
      eventDate: event.eventDate,
      venue: event.venue,
      evidence: event.originalQuotedText,
    });
    if (existingOccurrence) {
      const prov = await attachLeadProvenance(existingOccurrence, input.post.postUrl);
      recordOutcome(prov.outcome === 'provenance_added' ? 'provenance_added' : 'duplicate');
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
      eventTime: event.eventTime,
    });

    const dup = await findInventoryDuplicate({
      title: event.eventName,
      eventDate: event.eventDate,
      venue: event.venue,
      sourceUrl: input.post.postUrl,
    });
    if (dup) {
      recordOutcome('duplicate');
      continue;
    }

    // Quality-gate-passing review candidates ARE persisted (visible year_inferred_review).
    // Only skip undated / discovery-queue noise (handled above).

    const research: EventResearchResult = input.skipResearch
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
          toolOutcome: 'insufficient_evidence',
        }
      : await researchCuratorEventLead({
          event,
          curatorHandle: input.post.profileHandle,
          postUrl: input.post.postUrl,
        });

    if (research.verificationStatus === 'EXPIRED') {
      recordOutcome('expired');
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
    const calendarEligible = isCalendarEligible({
      verificationStatus: research.verificationStatus,
      eventDate: event.eventDate,
      eventTime: event.eventTime,
    });
    if (calendarEligible) counters.calendarEligibleCandidates += 1;

    // Never store assistant/research failure prose as public description
    const safeSummary =
      research.summary && !isResearchFailureProse(research.summary) ? research.summary : null;

    const { lead, outcome } = await upsertEventLead({
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
        summary: safeSummary,
        citations: research.citations,
        conflicts: research.conflicts,
        attribution: buildAttributionLine(input.post.profileHandle),
        verifiedAddress: research.verifiedAddress,
        parkingInfo: research.parkingInfo,
        filmingNotes: research.filmingNotes,
        contactInfo: research.contactInfo,
        toolOutcome: research.toolOutcome ?? null,
        toolExplanation: isResearchFailureProse(research.summary) ? research.summary : null,
      },
      verificationNotes: research.conflicts.join('; ') || null,
      verifiedAt: research.verificationStatus === 'VERIFIED' ? new Date() : null,
      creatorRecommendation: value.recommendation,
      creatorValueScore: String(value.score),
      creatorValueExplanation: value.explanation,
      occurrenceFingerprint: fp,
      metadata: {
        calendarEligible,
        copyrightSafeguard: 'facts_only_no_graphic_reuse',
        occurrenceIdentity: occKeys[0] ?? null,
        occurrenceIdentityKeys: occKeys,
        provenanceUrls: [input.post.postUrl],
        yearTrust: visualMatch?.yearTrust ?? null,
        yearInferenceExplanation: visualMatch?.yearInferenceExplanation ?? null,
        address: visualMatch?.address ?? null,
        endTime: visualMatch?.endTime ?? null,
        locationTrust: visualMatch?.locationTrust ?? null,
        decisionStage: visualMatch?.decisionStage ?? null,
      },
    });

    recordOutcome(outcome);

    // Promote / Early Signals only for genuinely created logical events — never for reprocess.
    if (outcome === 'created' && value.recommendation !== 'ignore') {
      await promoteCuratorLead(lead.id).catch(() => undefined);
    }
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
  return { ...stats, findingsStored: stored.stored, counters, outcomes };
}

function pipelineFromInspection(
  inspection: InstagramWatchInspection,
  extra: Partial<CuratorPipelineResult> = {},
): CuratorPipelineResult {
  const newLogicalEvents = extra.newLogicalEvents ?? extra.eventsExtracted ?? 0;
  return {
    ok: extra.ok ?? false,
    postsProcessed: extra.postsProcessed ?? 0,
    slidesProcessed: extra.slidesProcessed ?? 0,
    eventsExtracted: newLogicalEvents,
    newLogicalEvents,
    eventsVerified: extra.eventsVerified ?? 0,
    eventsPartiallyVerified: extra.eventsPartiallyVerified ?? 0,
    eventsConflicted: extra.eventsConflicted ?? 0,
    eventsExpired: extra.eventsExpired ?? 0,
    duplicatesSkipped: extra.duplicatesSkipped ?? 0,
    newPosts: extra.newPosts ?? inspection.newlyInspected,
    candidatesExtracted: extra.candidatesExtracted,
    existingEventsUpdated: extra.existingEventsUpdated,
    provenanceAdded: extra.provenanceAdded,
    rejectedCandidates: extra.rejectedCandidates,
    reviewCandidates: extra.reviewCandidates,
    calendarEligibleCandidates: extra.calendarEligibleCandidates,
    ocrAttempted: extra.ocrAttempted,
    ocrCompleted: extra.ocrCompleted,
    ocrCached: extra.ocrCached,
    error: extra.error,
    pausedForAuth: extra.pausedForAuth,
    inspectionSummary:
      extra.inspectionSummary ?? formatInstagramWatchInspectionSummary(inspection, extra.error),
    postsDiscovered: inspection.postsDiscovered,
    alreadyKnown: inspection.alreadyKnown,
    newlyInspected: inspection.newlyInspected,
    captureFailed: inspection.failed.length,
    runId: extra.runId,
  };
}

function emptyPipelineFailure(
  error: string,
  extra: Partial<CuratorPipelineResult> = {},
): CuratorPipelineResult {
  return {
    ok: false,
    postsProcessed: 0,
    slidesProcessed: 0,
    eventsExtracted: 0,
    newLogicalEvents: 0,
    eventsVerified: 0,
    eventsPartiallyVerified: 0,
    eventsConflicted: 0,
    eventsExpired: 0,
    duplicatesSkipped: 0,
    newPosts: 0,
    error,
    ...extra,
  };
}

export async function runCuratorWatchlistPipeline(input: {
  watcherId: string;
  specificPostUrl?: string;
  force?: boolean;
  /** When true (default for production checks), re-acquire recent posts for visual OCR even if already known. */
  visualRefresh?: boolean;
  triggerType?: 'manual' | 'scheduled' | 'reprocess';
}): Promise<CuratorPipelineResult> {
  await syncInstagramWatchersWithSharedSession();
  const runId = createHash('sha256')
    .update(`${input.watcherId}:${input.triggerType ?? 'check'}:${Date.now()}:${Math.random()}`)
    .digest('hex')
    .slice(0, 16);
  const attemptedAt = new Date();

  const [watcher] = await db
    .select()
    .from(sourceWatchers)
    .where(eq(sourceWatchers.id, input.watcherId))
    .limit(1);

  if (!watcher) {
    return emptyPipelineFailure('Watcher not found', { runId });
  }

  if (watcher.paused && !input.force) {
    return emptyPipelineFailure('Watcher is paused', { runId });
  }

  await db
    .update(sourceWatchers)
    .set({ lastAttemptedCheck: attemptedAt, updatedAt: attemptedAt })
    .where(eq(sourceWatchers.id, input.watcherId));

  // Production path always re-inspects the bounded recent window so visual OCR + persistence
  // run on Check now / scheduled / reprocess — skipping known posts caused live 0/N coverage.
  const visualRefresh = input.visualRefresh !== false || Boolean(input.force);
  const previouslyKnown = await listKnownInstagramPostKeys(input.watcherId);
  const lastSeen = visualRefresh || input.force ? [] : await listRecentFingerprints(input.watcherId);
  const knownPostKeys = visualRefresh || input.force ? new Set<string>() : previouslyKnown;

  const bounds = defaultInstagramVisualBounds();

  const { ctx, status, sanitizedFailure } = await openInstagramSession();
  if (!ctx) {
    const pausedForAuth = status === 'login_required' || status === 'captcha_blocked';
    const operatorError = sanitizedFailure ?? status;
    const precise =
      status === 'login_required'
        ? 'session_expired'
        : status === 'captcha_blocked'
          ? 'session_challenge_or_rate_limited'
          : `visual_session_unavailable:${operatorError}`;
    if (pausedForAuth) {
      await pauseWatcherForAuth(input.watcherId, operatorError);
    } else {
      await db
        .update(sourceWatchers)
        .set({
          healthStatus: 'failed',
          lastFailureAt: new Date(),
          lastFailureMessage: precise.slice(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(sourceWatchers.id, input.watcherId));
    }
    return emptyPipelineFailure(precise, { pausedForAuth, runId });
  }

  let fetch: Awaited<ReturnType<typeof fetchInstagramProfilePostsWithContext>>;
  try {
    fetch = await fetchInstagramProfilePostsWithContext(ctx, {
      profileUrl: watcher.sourceUrl,
      lastSeenFingerprints: lastSeen,
      knownPostKeys,
      specificPostUrl: input.specificPostUrl,
      maxPosts: bounds.maxPosts,
      maxCarouselSlides: bounds.maxCarouselSlides,
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
        lastFailureMessage: `acquisition_failed:${message}`.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(sourceWatchers.id, input.watcherId));
    return emptyPipelineFailure(`acquisition_failed:${message}`, {
      inspectionSummary: message,
      runId,
    });
  }

  if (fetch.pausedForAuth) {
    await closeInstagramSession(ctx);
    await pauseWatcherForAuth(input.watcherId, fetch.error ?? 'Instagram login required');
    return pipelineFromInspection(fetch.inspection, {
      ok: false,
      pausedForAuth: true,
      error: `session_expired:${fetch.error ?? 'Authentication required'}`,
      runId,
    });
  }

  if (!fetch.ok) {
    await closeInstagramSession(ctx);
    const precise =
      fetch.inspection.postsDiscovered === 0
        ? 'acquisition_returned_no_post_nodes'
        : fetch.inspection.failed.length > 0
          ? `media_download_or_capture_failed:${fetch.inspection.failed[0]?.reason ?? 'unknown'}`
          : formatInstagramWatchInspectionSummary(fetch.inspection, fetch.error);
    const summary = formatInstagramWatchInspectionSummary(fetch.inspection, precise);
    await db
      .update(sourceWatchers)
      .set({
        healthStatus: 'failed',
        lastFailureAt: new Date(),
        lastFailureMessage: precise.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(sourceWatchers.id, input.watcherId));
    return pipelineFromInspection(fetch.inspection, {
      ok: false,
      error: precise,
      inspectionSummary: summary,
      runId,
    });
  }

  const inspection = fetch.inspection;
  const { instagramPostIdentityKeys } = await import('./instagram-url.js');
  let reInspectedKnown = 0;
  let newlyCaptured = 0;
  for (const post of fetch.posts) {
    if (instagramPostIdentityKeys(post.postUrl).some((k) => previouslyKnown.has(k))) {
      reInspectedKnown += 1;
    } else {
      newlyCaptured += 1;
    }
  }
  inspection.alreadyKnown = reInspectedKnown;
  inspection.newlyInspected = newlyCaptured;

  const totals = {
    postsProcessed: 0,
    slidesProcessed: 0,
    eventsExtracted: 0,
    newLogicalEvents: 0,
    eventsVerified: 0,
    eventsPartiallyVerified: 0,
    eventsConflicted: 0,
    eventsExpired: 0,
    duplicatesSkipped: 0,
    newPosts: newlyCaptured,
    recordsPersisted: 0,
  };
  let runCounters = emptyCuratorRunCounters();

  const handle = extractHandleFromProfileUrl(watcher.sourceUrl);
  let visualCoverage = emptyCoverageReport(handle, watcher.sourceUrl, bounds);
  visualCoverage.postsDiscovered = Math.max(inspection.postsDiscovered, fetch.posts.length);

  const imageFetcher = createSessionImageFetcher(ctx.page);
  const firstCheckBaseline = watcher.lastSuccessfulCheck == null;
  const runStartedMs = Date.now();

  try {
    for (const post of fetch.posts) {
      if (Date.now() - runStartedMs > bounds.runTimeoutMs) {
        visualCoverage.incompleteReason = 'run_timeout';
        break;
      }

      const visual = await processPostVisualEvents({
        post,
        fetchImage: imageFetcher,
        bounds,
        notPreviouslyInspected: true,
      });
      visualCoverage.postsInspected += 1;
      visualCoverage.slidesExpected += visual.slidesExpected;
      visualCoverage.slidesAcquired += visual.slidesAcquired;
      visualCoverage.imagesOcrEligible += visual.imagesOcrEligible;
      visualCoverage.slidesOcrAttempted += visual.ocrAttempted;
      visualCoverage.slidesOcrSucceeded += visual.ocrSucceeded;
      visualCoverage.slidesOcrFailed += visual.ocrFailed;
      visualCoverage.slidesOcrSkipped += visual.ocrSkipped;
      if (visual.ocrSkipReason) {
        visualCoverage.slidesOcrSkipReason = visual.ocrSkipReason;
      }
      visualCoverage.slidesOcrCached += visual.ocrCached;
      visualCoverage.videoMediaAcquired += visual.videoMediaAcquired;
      if (visual.slidesExpected > 1) visualCoverage.carouselsSeen += 1;
      if (post.mediaType === 'reel' || post.postType === 'reel') visualCoverage.reelsSeen += 1;
      if (visual.likelihoodScore >= 0.45) visualCoverage.likelyEventPosts += 1;
      if (visual.unreadable) visualCoverage.unreadablePosts += 1;
      const candSummary = summarizeCandidates(visual.candidates);
      visualCoverage.candidatesExtracted += candSummary.extracted;
      visualCoverage.candidatesFuture += candSummary.future;
      visualCoverage.candidatesExpired += candSummary.expired;
      visualCoverage.candidatesReview += candSummary.review;
      visualCoverage.candidatesRejected += candSummary.rejected;
      visualCoverage.duplicatesSkipped += candSummary.duplicates;
      visualCoverage.postNotes.push({
        permalink: visual.acquired?.permalink ?? post.postUrl,
        shortcode: visual.acquired?.shortcode ?? 'unknown',
        mediaType: visual.acquired?.mediaType ?? post.postType,
        slidesExpected: visual.slidesExpected,
        slidesAcquired: visual.slidesAcquired,
        ocrOk: visual.ocrSucceeded,
        candidates: visual.candidates.filter((c) => c.decisionStage !== 'duplicate').length,
        note: visual.note,
      });

      const result = await processCuratorPost({
        watcherId: input.watcherId,
        post,
        imageFetcher,
        firstCheckBaseline,
        precomputedVisual: visual,
        fixtureOcrTexts:
          visual.slideOcr.length > 0
            ? visual.slideOcr
                .filter((s) => s.engine !== 'platform_alt')
                .map((s) => s.normalizedText || s.rawText)
            : undefined,
      });
      totals.postsProcessed += 1;
      totals.slidesProcessed += result.slidesProcessed;
      totals.eventsExtracted += result.newLogicalEvents;
      totals.newLogicalEvents += result.newLogicalEvents;
      totals.eventsVerified += result.verified;
      totals.eventsPartiallyVerified += result.partiallyVerified;
      totals.eventsConflicted += result.conflicted;
      totals.eventsExpired += result.expired;
      totals.duplicatesSkipped += result.duplicates;
      totals.recordsPersisted += result.newLogicalEvents;
      runCounters = mergeCuratorRunCounters(runCounters, result.counters);
    }
  } finally {
    await closeInstagramSession(ctx);
  }

  // OCR + visual candidate totals for this run (reset each check — never inherit prior run).
  runCounters.candidatesExtracted = visualCoverage.candidatesExtracted;
  runCounters.reviewCandidates =
    visualCoverage.candidatesReview > 0
      ? visualCoverage.candidatesReview
      : runCounters.reviewCandidates;
  runCounters.ocrAttempted = visualCoverage.slidesOcrAttempted;
  runCounters.ocrCompleted = visualCoverage.slidesOcrSucceeded;
  runCounters.ocrCached = visualCoverage.slidesOcrCached;
  runCounters.duplicatesSuppressed = Math.max(
    runCounters.duplicatesSuppressed,
    visualCoverage.duplicatesSkipped + totals.duplicatesSkipped,
  );
  // Prefer persistence-authority duplicate count when present.
  if (runCounters.duplicatesSuppressed < totals.duplicatesSkipped) {
    runCounters.duplicatesSuppressed = totals.duplicatesSkipped;
  }
  runCounters.newLogicalEvents = totals.newLogicalEvents;
  runCounters.expiredCandidates = Math.max(runCounters.expiredCandidates, totals.eventsExpired);

  const expiredBackfill = await reclassifyExpiredCuratorLeadsForWatcher(input.watcherId).catch(() => ({
    expired: 0,
    errorChromeQuarantined: 0,
  }));
  totals.eventsExpired += expiredBackfill.expired;
  runCounters.expiredCandidates = Math.max(runCounters.expiredCandidates, totals.eventsExpired);

  if (
    visualCoverage.slidesExpected > visualCoverage.slidesAcquired &&
    visualCoverage.carouselsSeen > 0
  ) {
    visualCoverage.incompleteReason = `carousel_slides_incomplete ${visualCoverage.slidesAcquired}/${visualCoverage.slidesExpected}`;
  }

  if (fetch.posts.length === 0 && visualCoverage.postsDiscovered > 0) {
    visualCoverage.incompleteReason =
      visualCoverage.incompleteReason ??
      (inspection.failed.length > 0
        ? `media_download_failed:${inspection.failed[0]?.reason ?? 'unknown'}`
        : 'acquisition_returned_posts_but_none_inspected');
  } else if (visualCoverage.postsInspected === 0 && visualCoverage.postsDiscovered === 0) {
    visualCoverage.incompleteReason =
      visualCoverage.incompleteReason ?? 'acquisition_returned_no_post_nodes';
  }

  visualCoverage = finalizeCoverageReport(visualCoverage, { sessionOk: true });
  if (
    visualCoverage.postsInspected === 0 &&
    visualCoverage.postsDiscovered > 0 &&
    !visualCoverage.incompleteReason
  ) {
    visualCoverage.incompleteReason = 'posts_discovered_but_zero_inspected';
    visualCoverage = finalizeCoverageReport(visualCoverage, { sessionOk: true });
  }

  inspection.extracted = totals.newLogicalEvents;
  inspection.slidesExpected = visualCoverage.slidesExpected;
  inspection.slidesAcquired = visualCoverage.slidesAcquired;
  inspection.slidesOcrSucceeded = visualCoverage.slidesOcrSucceeded;
  inspection.carouselsSeen = visualCoverage.carouselsSeen;
  inspection.candidatesExpired = runCounters.expiredCandidates;
  inspection.candidatesReview = runCounters.reviewCandidates;
  inspection.coverageStatus = visualCoverage.status;
  inspection.incompleteReason = visualCoverage.incompleteReason;
  const summary = formatInstagramWatchInspectionSummary(inspection);

  await incrementCuratorRunStats(input.watcherId, {
    postsProcessed: totals.postsProcessed,
    slidesProcessed: totals.slidesProcessed,
  });
  await refreshCuratorReliability(input.watcherId);

  const completedAt = new Date();
  if (completedAt.getTime() < attemptedAt.getTime()) {
    completedAt.setTime(attemptedAt.getTime());
  }

  const health = coverageStatusToHealthStatus(visualCoverage.status);
  const priorConfig = (watcher.config as Record<string, unknown>) ?? {};
  const lifetimePosts =
    Number(priorConfig.itemsProcessed ?? priorConfig.lifetimePostsProcessed ?? 0) + totals.postsProcessed;
  const lifetimeExtracted =
    Number(priorConfig.recordsExtracted ?? priorConfig.lifetimeEventsExtracted ?? 0) +
    Math.max(0, totals.newLogicalEvents);
  const lifetimeVerified = Number(priorConfig.verifiedYield ?? 0) + totals.eventsVerified;
  const extractionAt =
    totals.newLogicalEvents > 0 || Number(priorConfig.recordsExtracted ?? 0) > 0
      ? totals.newLogicalEvents > 0
        ? completedAt.toISOString()
        : ((priorConfig.lastSuccessfulExtractionAt as string | null) ?? completedAt.toISOString())
      : (priorConfig.lastSuccessfulExtractionAt as string | null) ?? null;

  // If lifetime already had extractions, never show "No successful extraction yet"
  const successfulExtractionAt =
    extractionAt ??
    (lifetimeExtracted > 0 || Number(priorConfig.recordsExtracted ?? 0) > 0
      ? completedAt.toISOString()
      : null);

  await db
    .update(sourceWatchers)
    .set({
      lastSuccessfulCheck: completedAt,
      healthStatus: health,
      sessionStatus: 'ready',
      lastFailureMessage:
        visualCoverage.status === 'partial' || visualCoverage.status === 'structure_changed'
          ? (visualCoverage.incompleteReason ?? summary).slice(0, 500)
          : visualCoverage.status === 'failed' || visualCoverage.status === 'blocked'
            ? (visualCoverage.incompleteReason ?? summary).slice(0, 500)
            : null,
      lastFailureAt:
        visualCoverage.status === 'failed' || visualCoverage.status === 'blocked' ? completedAt : null,
      config: {
        ...priorConfig,
        lastCheckRunId: runId,
        lastAttemptedCheckAt: attemptedAt.toISOString(),
        lastCompletedCheckAt: completedAt.toISOString(),
        lastSuccessfulExtractionAt: successfulExtractionAt,
        lastCheckCompletedOk: visualCoverage.status !== 'failed' && visualCoverage.status !== 'blocked',
        itemsProcessed: lifetimePosts,
        recordsExtracted: Math.max(lifetimeExtracted, Number(priorConfig.recordsExtracted ?? 0)),
        verifiedYield: Math.max(lifetimeVerified, Number(priorConfig.verifiedYield ?? 0)),
        newRecordsFound: totals.newLogicalEvents,
        lifetimePostsProcessed: lifetimePosts,
        lifetimeEventsExtracted: Math.max(lifetimeExtracted, Number(priorConfig.recordsExtracted ?? 0)),
        currentRunCoverage: {
          runId,
          triggerType: input.triggerType ?? (input.force ? 'reprocess' : 'check'),
          attemptedAt: attemptedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          status: visualCoverage.status,
          incompleteReason: visualCoverage.incompleteReason,
          postsExpected: visualCoverage.postsDiscovered,
          postsInspected: visualCoverage.postsInspected,
          slidesExpected: visualCoverage.slidesExpected,
          slidesInspected: visualCoverage.slidesAcquired,
          ocrAttempted: runCounters.ocrAttempted,
          ocrCompleted: runCounters.ocrCompleted,
          ocrCached: runCounters.ocrCached,
          ocrEligible: visualCoverage.imagesOcrEligible,
          ocrFailed: visualCoverage.slidesOcrFailed,
          ocrSkipped: visualCoverage.slidesOcrSkipped,
          ocrSkipReason: visualCoverage.slidesOcrSkipReason,
          videoMediaAcquired: visualCoverage.videoMediaAcquired,
          candidatesExtracted: runCounters.candidatesExtracted,
          newLogicalEvents: runCounters.newLogicalEvents,
          existingEventsUpdated: runCounters.existingEventsUpdated,
          provenanceAdded: runCounters.provenanceAdded,
          currentEvents: visualCoverage.candidatesFuture,
          expiredEvents: runCounters.expiredCandidates,
          reviewCandidates: runCounters.reviewCandidates,
          duplicatesSuppressed: runCounters.duplicatesSuppressed,
          rejectedCandidates: runCounters.rejectedCandidates,
          calendarEligibleCandidates: runCounters.calendarEligibleCandidates,
          recordsPersisted: totals.recordsPersisted,
          summaryLine: visualCoverage.summaryLine || summary,
        },
        lastInstagramVisualCoverage: {
          runId,
          status: visualCoverage.status,
          summaryLine: visualCoverage.summaryLine || summary,
          at: completedAt.toISOString(),
          postsInspected: visualCoverage.postsInspected,
          postsDiscovered: visualCoverage.postsDiscovered,
          slidesAcquired: visualCoverage.slidesAcquired,
          slidesExpected: visualCoverage.slidesExpected,
          ocrAttempted: runCounters.ocrAttempted,
          ocrSucceeded: runCounters.ocrCompleted,
          candidatesExtracted: runCounters.candidatesExtracted,
          newLogicalEvents: runCounters.newLogicalEvents,
          candidatesExpired: runCounters.expiredCandidates,
          candidatesReview: runCounters.reviewCandidates,
          duplicatesSuppressed: runCounters.duplicatesSuppressed,
          incompleteReason: visualCoverage.incompleteReason,
        },
      },
      updatedAt: completedAt,
      ...(totals.newLogicalEvents > 0 ? { lastNewItemDetected: completedAt } : {}),
    })
    .where(eq(sourceWatchers.id, input.watcherId));

  await reconcileAuthenticatedInstagramSuccess(input.watcherId);

  const { emitDataChange } = await import('../data-revision/index.js');
  await emitDataChange({
    eventType: 'source_watcher_complete',
    domains: ['curator_watchlist', 'scout', 'early_signals'],
    completedAt: completedAt.toISOString(),
    source: 'curator-watchlist',
    recordIds: [input.watcherId],
    success: true,
  });

  return pipelineFromInspection(inspection, {
    ok: true,
    postsProcessed: totals.postsProcessed,
    slidesProcessed: totals.slidesProcessed,
    eventsExtracted: totals.newLogicalEvents,
    newLogicalEvents: totals.newLogicalEvents,
    eventsVerified: totals.eventsVerified,
    eventsPartiallyVerified: totals.eventsPartiallyVerified,
    eventsConflicted: totals.eventsConflicted,
    eventsExpired: totals.eventsExpired,
    duplicatesSkipped: runCounters.duplicatesSuppressed,
    newPosts: totals.newPosts,
    candidatesExtracted: runCounters.candidatesExtracted,
    existingEventsUpdated: runCounters.existingEventsUpdated,
    provenanceAdded: runCounters.provenanceAdded,
    rejectedCandidates: runCounters.rejectedCandidates,
    reviewCandidates: runCounters.reviewCandidates,
    calendarEligibleCandidates: runCounters.calendarEligibleCandidates,
    ocrAttempted: runCounters.ocrAttempted,
    ocrCompleted: runCounters.ocrCompleted,
    ocrCached: runCounters.ocrCached,
    inspectionSummary: summary,
    runId,
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
    return emptyPipelineFailure('No previously discovered post to reprocess for this source yet.');
  }

  return runCuratorWatchlistPipeline({
    watcherId,
    specificPostUrl: latest.postUrl,
    force: true,
    visualRefresh: true,
    triggerType: 'reprocess',
  });
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
      extractionConfig: { curatorPipeline: true, ocrEngine: 'tesseract.js-local' },
    })
    .where(eq(sourceWatchers.id, watcher.id));

  return watcher.id;
}
