/**
 * Event listing Watchlist checks (Wix calendars and similar public listing pages).
 *
 * Primary path: adaptive website extraction orchestrator.
 * Never overwrite the operator-configured URL with a redirected fetch URL.
 * Yield (usable extracted events) is separate from HTTP reachability.
 * HTTP 403 is an acquisition observation — not an automatic terminal `failed`.
 * No email / Telegram / outreach from this path.
 */

import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { scoutItems, sourceWatchers, type SourceWatcher } from '../schema.js';
import { insertSnapshot, updateWatcherHealth } from '../early-signals/store.js';
import { recordSourceRun } from './watchlist.js';
import type { WatchlistReachability } from './types.js';
import {
  buildPlatformSupportMatrix,
  stableEventListingFingerprint,
  urlLooksLikeEventListing,
  type ExtractedEventListing,
} from './event-listing-extract.js';
import {
  runAdaptiveWebsiteExtraction,
  type AdaptiveExtractionResult,
  type AdaptiveExtractionStatus,
} from './adaptive-extraction/index.js';

type WatcherConfig = Record<string, unknown>;

function asConfig(row: SourceWatcher): WatcherConfig {
  return (row.config && typeof row.config === 'object' ? row.config : {}) as WatcherConfig;
}

function contentHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export type EventListingWatchCheckResult = {
  ok: boolean;
  newItems: number;
  qualified: number;
  error?: string;
  inspectionSummary?: string;
  displayHealth: string;
  reachability: WatchlistReachability;
  configuredUrl: string;
  lastResolvedUrl: string | null;
  itemsProcessed: number;
  recordsExtracted: number;
  verifiedYield: number;
  method?: string;
  rejectionReasons?: string[];
};

export function isEventListingDirectoryWatcher(watcher: SourceWatcher): boolean {
  // Dedicated host adapters own these URLs.
  if (/do816\.com/i.test(watcher.sourceUrl) || /meetup\.com/i.test(watcher.sourceUrl)) {
    return false;
  }
  const config = asConfig(watcher);
  if (
    config.extractionMethod === 'dostuff_events' ||
    config.extractionMethod === 'meetup_directory' ||
    config.extractionMethod === 'eventbrite_directory'
  ) {
    return false;
  }
  if (
    watcher.adapterType === 'dostuff_events' ||
    watcher.adapterType === 'meetup_directory' ||
    watcher.adapterType === 'eventbrite_directory'
  ) {
    return false;
  }
  if (
    config.extractionMethod === 'event_listing' ||
    config.extractionMethod === 'wix_events' ||
    config.extractionMethod === 'squarespace_events' ||
    config.extractionMethod === 'wordpress_tec' ||
    config.extractionMethod === 'wordpress_rhp_events' ||
    config.extractionMethod === 'direct_ics' ||
    config.extractionMethod === 'per_event_ics' ||
    config.extractionMethod === 'theater_season'
  ) {
    return true;
  }
  if (
    watcher.adapterType === 'event_listing' ||
    watcher.adapterType === 'wix_events' ||
    watcher.adapterType === 'squarespace_events' ||
    watcher.adapterType === 'wordpress_tec' ||
    watcher.adapterType === 'wordpress_rhp_events'
  ) {
    return true;
  }
  if (watcher.sourceCategory === 'event_directory' && !/eventbrite\.com/i.test(watcher.sourceUrl)) {
    return urlLooksLikeEventListing(watcher.sourceUrl) || Boolean(config.extractionCapabilityEstablished);
  }
  return urlLooksLikeEventListing(watcher.sourceUrl);
}

function extractionMethodLabel(method: string | undefined): string {
  switch (method) {
    case 'wix_events_hydration':
    case 'wix_events':
      return 'wix_events';
    case 'squarespace_events':
      return 'squarespace_events';
    case 'theater_season':
      return 'theater_season';
    case 'wordpress_tec_rest':
    case 'wordpress_tec_list':
    case 'wordpress_tec':
      return 'wordpress_tec';
    case 'wordpress_rhp_events':
      return 'wordpress_rhp_events';
    case 'direct_ics':
      return 'direct_ics';
    case 'per_event_ics':
      return 'per_event_ics';
    case 'json_ld':
      return 'json_ld';
    default:
      return method && method !== 'none' ? method : 'event_listing';
  }
}

/** Prefer adaptive status strings for health; map partial → degraded for legacy UI. */
function healthStatusFromAdaptive(
  status: AdaptiveExtractionStatus,
  opts?: { created?: number; priorCapability?: boolean },
): string {
  if (status === 'partial') return 'partial';
  if (status === 'healthy' && opts?.priorCapability && (opts.created ?? 0) === 0) {
    // Orchestrator may report healthy on first fingerprint change while upsert finds no new rows.
    return 'healthy';
  }
  return status;
}

function shouldPauseForStatus(status: AdaptiveExtractionStatus): boolean {
  return status === 'blocked';
}

function reachabilityFromAdaptive(result: AdaptiveExtractionResult): WatchlistReachability {
  if (result.status === 'blocked') return 'blocked';
  if (result.status === 'rate_limited') return 'failed';
  if (
    result.status === 'failed' &&
    result.acceptedCount === 0 &&
    (result.acquisition.kind === 'error' || result.acquisition.httpStatus === 0)
  ) {
    return 'failed';
  }
  return 'reachable';
}

function adaptiveConfigFields(result: AdaptiveExtractionResult, priorConfig: WatcherConfig) {
  const selected = result.selectedPlatform?.signature ?? null;
  return {
    adaptiveExtractionStatus: result.status,
    adaptiveHttpResult: result.httpResult,
    adaptiveFallbackResult: result.fallbackResult,
    adaptiveFailedStage: result.failedStage,
    adaptiveFailureReason: result.failureReason,
    adaptiveStrategiesAttempted: result.strategiesAttempted,
    adaptiveStrategyProfile: result.profile,
    adaptiveContentFingerprint: result.profile?.pageStructureFingerprint ?? null,
    adaptiveValidationNotes: result.validationNotes,
    adaptiveRetryState: result.retry,
    adaptiveDiagnostics: {
      conciseSummary: result.diagnostics.conciseSummary,
      challengeProvider: result.diagnostics.challengeProvider,
      nextRetryAt: result.diagnostics.nextRetryAt,
      freshness: result.diagnostics.freshness,
      lastHealthyAt: result.diagnostics.lastHealthyAt,
      profileConfidence: result.diagnostics.profileConfidence,
      surfaceAttemptCount: result.surfaceAttempts.length,
      technicalDetails: result.diagnostics.technicalDetails.slice(0, 40),
      plannedSelected: result.plannedStrategies.filter((p) => p.selected).slice(0, 12),
    },
    adaptiveSurfaceAttempts: result.surfaceAttempts.slice(0, 40),
    platformSignature: selected,
    listingPlatform: selected && selected !== 'unknown' ? selected : priorConfig.listingPlatform ?? selected,
    engagementGroupCount: result.engagementGroupCount,
    occurrenceCount: result.occurrenceCount,
    acceptedCount: result.acceptedCount,
    quarantinedCount: result.quarantinedCount,
    httpStatus: result.acquisition.httpStatus,
    acquisitionKind: result.acquisition.kind,
    wafOrCdnIndicators: result.acquisition.wafOrCdnIndicators,
    discoveredSurfaces: result.surfaces.map((s) => ({
      kind: s.kind,
      url: s.url,
      evidence: s.evidence,
      sameOrigin: s.sameOrigin,
      discoveryMethod: s.discoveryMethod ?? null,
      selectionReason: s.selectionReason ?? null,
    })),
    detectedPlatforms: result.platforms.map((p) => ({
      signature: p.signature,
      confidence: p.confidence,
      evidence: p.evidence,
    })),
  };
}

async function upsertListingScoutItem(input: {
  watcherId: string;
  event: ExtractedEventListing;
}): Promise<'created' | 'existing'> {
  const fp = contentHash(`event-listing:${stableEventListingFingerprint(input.event)}`);
  const contentHashValue = contentHash(
    `${input.event.externalId ?? ''}:${input.event.eventUrl ?? ''}:${input.event.title}:${input.event.startDate ?? ''}`,
  );
  const [existing] = await db
    .select({ id: scoutItems.id })
    .from(scoutItems)
    .where(
      and(eq(scoutItems.watcherId, input.watcherId), eq(scoutItems.occurrenceFingerprint, fp)),
    )
    .limit(1);
  const relevance = {
    source: 'event_listing',
    method: input.event.method,
    platform: input.event.platform ?? input.event.method,
    evidence: input.event.evidence,
    title: input.event.title,
    startDate: input.event.startDate,
    startDateTime: input.event.startDateTime,
    endDate: input.event.endDate,
    endDateTime: input.event.endDateTime,
    startTimeLocal: input.event.startTimeLocal ?? null,
    endTimeLocal: input.event.endTimeLocal ?? null,
    venue: input.event.venue,
    address: input.event.address,
    city: input.event.city,
    regionState: input.event.regionState,
    isRecurring: input.event.isRecurring,
    verificationState: input.event.verificationState,
    needsTemporalReview: input.event.needsTemporalReview ?? false,
    icsUrl: input.event.icsUrl ?? null,
    eventUrl: input.event.eventUrl,
    ticketOrRsvpUrl: input.event.ticketOrRsvpUrl,
    ticketUrl: input.event.ticketUrl ?? null,
    rsvpUrl: input.event.rsvpUrl ?? null,
    theme: input.event.theme ?? null,
    baseTitle: input.event.baseTitle ?? null,
    titleAlias: input.event.titleAlias ?? null,
    description: input.event.description ?? null,
    membersOnly: input.event.membersOnly ?? null,
    vettedGuests: input.event.vettedGuests ?? null,
    ageRestriction: input.event.ageRestriction ?? null,
    soldOut: input.event.soldOut ?? null,
    actionType: input.event.actionType ?? null,
    companionGroupKey: input.event.companionGroupKey ?? null,
    companionExternalIds: input.event.companionExternalIds ?? [],
    companionTitles: input.event.companionTitles ?? [],
    companionEventUrls: input.event.companionEventUrls ?? [],
    needsCompanionReview: input.event.needsCompanionReview ?? false,
    productionTitle: input.event.productionTitle ?? null,
    productionId: input.event.productionId ?? null,
    productionGroupKey: input.event.productionGroupKey ?? null,
    listingRole: input.event.listingRole ?? null,
    performanceLabel: input.event.performanceLabel ?? null,
    runStartDate: input.event.runStartDate ?? null,
    runEndDate: input.event.runEndDate ?? null,
    reviewOnly: true,
    retrievedAt: new Date().toISOString(),
  };
  if (existing) {
    await db
      .update(scoutItems)
      .set({
        captionText: input.event.title,
        itemUrl: input.event.eventUrl ?? input.event.sourceUrl,
        relevanceExplanation: relevance,
        updatedAt: new Date(),
      })
      .where(eq(scoutItems.id, existing.id));
    return 'existing';
  }
  await db.insert(scoutItems).values({
    watcherId: input.watcherId,
    itemUrl: input.event.eventUrl ?? input.event.sourceUrl,
    itemType: 'event_listing',
    captionText: input.event.title,
    contentHash: contentHashValue,
    occurrenceFingerprint: fp,
    externalItemId: input.event.externalId,
    creatorValueStatus: 'pending',
    verificationStatus:
      input.event.verificationState === 'verified'
        ? 'extracted'
        : input.event.verificationState === 'unresolved_date'
          ? 'needs_date'
          : 'partial',
    relevanceExplanation: relevance,
  });
  return 'created';
}

export async function runEventListingWatchlistCheck(
  watcherId: string,
  triggerType: 'manual' | 'scheduled' = 'manual',
): Promise<EventListingWatchCheckResult> {
  const [watcher] = await db.select().from(sourceWatchers).where(eq(sourceWatchers.id, watcherId)).limit(1);
  if (!watcher) {
    return {
      ok: false,
      newItems: 0,
      qualified: 0,
      error: 'Source not found',
      displayHealth: 'failed',
      reachability: 'failed',
      configuredUrl: '',
      lastResolvedUrl: null,
      itemsProcessed: 0,
      recordsExtracted: 0,
      verifiedYield: 0,
    };
  }

  const configuredUrl = watcher.sourceUrl;
  const priorConfig = asConfig(watcher);
  const now = new Date();

  await db
    .update(sourceWatchers)
    .set({ lastAttemptedCheck: now, updatedAt: now })
    .where(eq(sourceWatchers.id, watcherId));

  // Controlled backoff: challenged sources are reassessed on a schedule, not abandoned forever.
  const priorRetry = priorConfig.adaptiveRetryState as
    | { nextRetryAt?: string | null; operatorPaused?: boolean; retryClass?: string }
    | undefined;
  if (
    priorRetry?.operatorPaused ||
    (typeof priorRetry?.nextRetryAt === 'string' &&
      Date.parse(priorRetry.nextRetryAt) > now.getTime() &&
      triggerType === 'scheduled')
  ) {
    const explanation = priorRetry.operatorPaused
      ? 'Operator paused — no automatic retry until resumed'
      : `System backoff until ${priorRetry.nextRetryAt}`;
    return {
      ok: true,
      newItems: 0,
      qualified: 0,
      error: undefined,
      inspectionSummary: explanation,
      displayHealth: priorRetry.operatorPaused ? 'operator_paused' : 'blocked',
      reachability: 'blocked',
      configuredUrl,
      lastResolvedUrl: (priorConfig.lastResolvedUrl as string | null) ?? null,
      itemsProcessed: 0,
      recordsExtracted: Number(priorConfig.recordsExtracted ?? 0),
      verifiedYield: Number(priorConfig.verifiedYield ?? 0),
    };
  }

  const adaptive = await runAdaptiveWebsiteExtraction(configuredUrl, {
    priorConfig,
    allowBrowser: true,
    operatorPaused: Boolean(priorConfig.operatorPaused),
  });

  const lastResolvedUrl = adaptive.finalUrl;
  const capability = adaptive.capability;
  const explanation = adaptive.statusExplanation;
  const method =
    adaptive.selectedMethod ??
    adaptive.selectedPlatform?.signature ??
    (typeof priorConfig.extractionMethod === 'string' ? priorConfig.extractionMethod : 'event_listing');
  const adaptiveFields = adaptiveConfigFields(adaptive, priorConfig);

  // Blocked after exhausting safe first-party surfaces — controlled reassessment (not forever-abandoned).
  if (adaptive.status === 'blocked' || adaptive.status === 'operator_paused') {
    const operatorPaused = adaptive.status === 'operator_paused';
    const nextConfig = {
      ...priorConfig,
      ...adaptiveFields,
      lastResolvedUrl,
      configuredUrl,
      reachability: 'blocked' as WatchlistReachability,
      statusExplanation: explanation,
      lastCheckOutcome: adaptive.status,
      itemsProcessed: 1,
      recordsExtracted: Number(priorConfig.recordsExtracted ?? 0),
      newRecordsFound: 0,
      verifiedYield: Number(priorConfig.verifiedYield ?? 0),
      // Allow scheduler to reassess after nextRetryAt; operator pause keeps suppress.
      suppressSchedule: operatorPaused,
      extractionMethod: extractionMethodLabel(method),
      listingCapability: capability,
      platformSupport: capability ? buildPlatformSupportMatrix(capability) : priorConfig.platformSupport ?? null,
      rejectionReasons: [
        ...(adaptive.failureReason ? [adaptive.failureReason] : []),
        ...adaptive.validationNotes,
        ...adaptive.diagnostics.technicalDetails.slice(0, 20),
      ],
      strategiesAttempted: adaptive.strategiesAttempted,
      reviewOnly: true,
    };
    await db
      .update(sourceWatchers)
      .set({
        sourceUrl: configuredUrl,
        healthStatus: 'blocked',
        paused: operatorPaused,
        lastFailureAt: now,
        lastFailureMessage: explanation.slice(0, 500),
        config: nextConfig,
        updatedAt: now,
      })
      .where(eq(sourceWatchers.id, watcherId));
    await recordSourceRun({
      watcherId,
      triggerType,
      finalFetchMethod: extractionMethodLabel(method),
      itemCount: 1,
      newCount: 0,
      qualifiedCount: 0,
      sanitizedFailure: explanation.slice(0, 500),
      metadata: {
        configuredUrl,
        lastResolvedUrl,
        outcome: adaptive.status,
        httpStatus: adaptive.acquisition.httpStatus,
        failedStage: adaptive.failedStage,
        platforms: adaptive.platforms,
        surfaces: adaptive.surfaces.map((s) => s.kind),
        surfaceAttempts: adaptive.surfaceAttempts.length,
        nextRetryAt: adaptive.retry?.nextRetryAt ?? null,
        retryClass: adaptive.retry?.retryClass ?? null,
      },
    });
    return {
      ok: false,
      newItems: 0,
      qualified: 0,
      error: explanation,
      inspectionSummary: explanation,
      displayHealth: 'blocked',
      reachability: 'blocked',
      configuredUrl,
      lastResolvedUrl,
      itemsProcessed: 1,
      recordsExtracted: 0,
      verifiedYield: 0,
      method: extractionMethodLabel(method),
      rejectionReasons: nextConfig.rejectionReasons as string[],
    };
  }

  // True transport failure (no useful acquisition) — still not 403-as-failed.
  if (
    adaptive.status === 'failed' &&
    adaptive.acceptedCount === 0 &&
    (adaptive.acquisition.kind === 'error' || adaptive.acquisition.httpStatus === 0) &&
    !adaptive.acquisition.http403
  ) {
    const failExplanation = adaptive.failureReason?.slice(0, 300) || explanation;
    await updateWatcherHealth(watcherId, { ok: false, error: failExplanation });
    await db
      .update(sourceWatchers)
      .set({
        sourceUrl: configuredUrl,
        config: {
          ...priorConfig,
          ...adaptiveFields,
          lastResolvedUrl,
          configuredUrl,
          reachability: 'failed',
          statusExplanation: failExplanation,
          lastCheckOutcome: 'failed',
          itemsProcessed: 0,
          recordsExtracted: 0,
          newRecordsFound: 0,
          verifiedYield: 0,
        },
        updatedAt: now,
      })
      .where(eq(sourceWatchers.id, watcherId));
    await recordSourceRun({
      watcherId,
      triggerType,
      finalFetchMethod: 'event_listing',
      sanitizedFailure: failExplanation,
      metadata: {
        configuredUrl,
        lastResolvedUrl,
        outcome: 'failed',
        httpStatus: adaptive.acquisition.httpStatus,
        failedStage: adaptive.failedStage,
      },
    });
    return {
      ok: false,
      newItems: 0,
      qualified: 0,
      error: failExplanation,
      inspectionSummary: failExplanation,
      displayHealth: 'failed',
      reachability: 'failed',
      configuredUrl,
      lastResolvedUrl,
      itemsProcessed: 0,
      recordsExtracted: 0,
      verifiedYield: 0,
    };
  }

  // Non-event page for a watcher that isn't an established event directory.
  if (
    adaptive.acceptedCount === 0 &&
    capability &&
    !capability.looksLikeEventListing &&
    !isEventListingDirectoryWatcher(watcher) &&
    adaptive.status !== 'needs_adapter'
  ) {
    const noYieldExplanation =
      'Page responded, but it does not look like a public event listing.';
    await db
      .update(sourceWatchers)
      .set({
        sourceUrl: configuredUrl,
        lastAttemptedCheck: now,
        healthStatus: 'no_yield',
        config: {
          ...priorConfig,
          ...adaptiveFields,
          lastResolvedUrl,
          configuredUrl,
          reachability: 'reachable',
          statusExplanation: noYieldExplanation,
          lastCheckOutcome: 'no_yield',
          lastCheckCompletedOk: true,
          lastCompletedCheckAt: now.toISOString(),
          itemsProcessed: 1,
          recordsExtracted: 0,
          newRecordsFound: 0,
          verifiedYield: 0,
          rejectionReasons: capability.reasons,
          extractionMethod: priorConfig.extractionMethod ?? 'adaptive',
          suppressSchedule: false,
        },
        updatedAt: now,
      })
      .where(eq(sourceWatchers.id, watcherId));
    await recordSourceRun({
      watcherId,
      triggerType,
      finalFetchMethod: 'event_listing',
      itemCount: 1,
      newCount: 0,
      qualifiedCount: 0,
      metadata: {
        configuredUrl,
        lastResolvedUrl,
        outcome: 'no_yield',
        inspectionSummary: noYieldExplanation,
        capability,
        httpStatus: adaptive.acquisition.httpStatus,
      },
    });
    return {
      ok: true,
      newItems: 0,
      qualified: 0,
      inspectionSummary: noYieldExplanation,
      displayHealth: 'no_yield',
      reachability: 'reachable',
      configuredUrl,
      lastResolvedUrl,
      itemsProcessed: 1,
      recordsExtracted: 0,
      verifiedYield: 0,
      rejectionReasons: capability.reasons,
    };
  }

  let created = 0;
  for (const event of adaptive.events) {
    const outcome = await upsertListingScoutItem({ watcherId, event });
    if (outcome === 'created') created += 1;
  }

  const count = adaptive.events.length;
  const verified = adaptive.events.filter((e) => e.verificationState === 'verified').length;
  const priorCapability = Boolean(priorConfig.extractionCapabilityEstablished);
  const capabilityEstablished = priorCapability || count > 0;
  const productionGroupCount =
    method === 'theater_season' || method === 'wordpress_rhp_events'
      ? Math.max(
          adaptive.engagementGroupCount,
          new Set(
            adaptive.events
              .map((e) => e.productionGroupKey)
              .filter((k): k is string => Boolean(k)),
          ).size,
        )
      : adaptive.engagementGroupCount > 0
        ? adaptive.engagementGroupCount
        : 0;
  const companionPairsLinked = adaptive.events.filter((e) => (e.companionExternalIds?.length ?? 0) > 0).length;

  const healthStatus = healthStatusFromAdaptive(adaptive.status, { created, priorCapability });
  const pause = shouldPauseForStatus(adaptive.status);
  const reachability = reachabilityFromAdaptive(adaptive);
  const contentOutcome =
    count > 0
      ? created > 0
        ? 'upcoming_events_found'
        : 'no_change'
      : adaptive.status === 'empty_confirmed'
        ? 'no_upcoming_events'
        : adaptive.status === 'needs_adapter'
          ? 'no_upcoming_events'
          : 'no_upcoming_events';

  const nextConfig = {
    ...priorConfig,
    ...adaptiveFields,
    lastResolvedUrl,
    configuredUrl,
    reachability,
    statusExplanation: explanation,
    contentOutcome,
    extractionCapabilityOutcome:
      count > 0 || adaptive.status === 'empty_confirmed' || adaptive.status === 'no_change'
        ? 'supported'
        : adaptive.status === 'needs_adapter'
          ? 'needs_adapter'
          : priorConfig.extractionCapabilityOutcome ?? null,
    itemsProcessed: 1,
    recordsExtracted: count,
    newRecordsFound: created,
    verifiedYield: verified,
    productionGroupCount: productionGroupCount > 0 ? productionGroupCount : priorConfig.productionGroupCount ?? null,
    performanceCount:
      method === 'theater_season' || method === 'wordpress_rhp_events'
        ? count
        : priorConfig.performanceCount ?? null,
    listingDisplayMode:
      companionPairsLinked > 0
        ? 'wix_companion_nights'
        : productionGroupCount > 0
          ? 'production_groups'
          : priorConfig.listingDisplayMode ?? null,
    companionPairsLinked,
    groupedEventNights: count,
    extractionCapabilityEstablished:
      capabilityEstablished ||
      adaptive.status === 'empty_confirmed' ||
      adaptive.status === 'no_change',
    lastSuccessfulExtractionAt:
      count > 0 ? now.toISOString() : priorConfig.lastSuccessfulExtractionAt ?? null,
    lastCheckCompletedOk: adaptive.status !== 'failed' && adaptive.status !== 'rate_limited',
    lastCompletedCheckAt: now.toISOString(),
    lastCheckOutcome: healthStatus,
    suppressSchedule: pause,
    extractionMethod: extractionMethodLabel(method),
    rejectionReasons: [
      ...(adaptive.failureReason ? [adaptive.failureReason] : []),
      ...adaptive.validationNotes,
    ],
    strategiesAttempted: adaptive.strategiesAttempted,
    listingCapability: capability,
    platformSupport: capability ? buildPlatformSupportMatrix(capability) : priorConfig.platformSupport ?? null,
    reviewOnly: true,
  };

  const terminalBad =
    adaptive.status === 'failed' || adaptive.status === 'rate_limited';
  const unpause =
    adaptive.status === 'healthy' ||
    adaptive.status === 'no_change' ||
    adaptive.status === 'empty_confirmed' ||
    (adaptive.status === 'partial' && count > 0);

  await db
    .update(sourceWatchers)
    .set({
      sourceUrl: configuredUrl,
      lastSuccessfulCheck: terminalBad ? watcher.lastSuccessfulCheck : now,
      lastAttemptedCheck: now,
      consecutiveFailureCount: terminalBad ? (watcher.consecutiveFailureCount ?? 0) + 1 : 0,
      healthStatus,
      paused: pause ? true : unpause ? false : watcher.paused,
      lastFailureAt: terminalBad || pause ? now : null,
      lastFailureMessage: terminalBad || pause ? explanation.slice(0, 500) : null,
      lastNewItemDetected: created > 0 ? now : watcher.lastNewItemDetected,
      adapterType:
        watcher.adapterType === 'html_watch' ||
        watcher.adapterType === 'event_listing' ||
        watcher.adapterType === 'squarespace_events' ||
        watcher.adapterType === 'wordpress_rhp_events'
          ? 'event_listing'
          : watcher.adapterType,
      sourceCategory: 'event_directory',
      config: { ...nextConfig, suppressSchedule: pause },
      updatedAt: now,
      ...(count > 0 ? { lastChangedAt: now } : {}),
    })
    .where(eq(sourceWatchers.id, watcherId));

  await insertSnapshot({
    watcherId,
    contentHash: contentHash(
      adaptive.events
        .map((e) => stableEventListingFingerprint(e))
        .sort()
        .join('|'),
    ),
    extractedContent: adaptive.events
      .slice(0, 20)
      .map((e) => `${e.title} | ${e.startDate ?? 'undated'} | ${e.venue ?? ''} | ${e.eventUrl ?? ''}`)
      .join('\n')
      .slice(0, 4000),
    responseStatus: adaptive.acquisition.httpStatus,
    changeSummary: explanation,
    metadata: {
      configuredUrl,
      lastResolvedUrl,
      extracted: count,
      created,
      verified,
      method,
      httpStatus: adaptive.acquisition.httpStatus,
      adaptiveStatus: adaptive.status,
      failedStage: adaptive.failedStage,
      htmlBytes: adaptive.acquisition.byteSize,
    },
  });

  await recordSourceRun({
    watcherId,
    triggerType,
    finalFetchMethod: extractionMethodLabel(method),
    itemCount: count,
    newCount: created,
    qualifiedCount: verified,
    sanitizedFailure: terminalBad || pause ? explanation.slice(0, 500) : undefined,
    metadata: {
      configuredUrl,
      lastResolvedUrl,
      outcome: healthStatus,
      inspectionSummary: explanation,
      method,
      httpStatus: adaptive.acquisition.httpStatus,
      adaptiveStatus: adaptive.status,
      strategiesAttempted: adaptive.strategiesAttempted,
    },
  });

  if (verified > 0) {
    const { maybePromoteVerifiedScoutListingsAfterCheck } = await import(
      '../creator-calendar/population/scout-promote.js'
    );
    await maybePromoteVerifiedScoutListingsAfterCheck(watcherId, verified);
  }

  return {
    ok: !terminalBad && !pause,
    newItems: created,
    qualified: verified,
    error: terminalBad || pause ? explanation : undefined,
    inspectionSummary: explanation,
    displayHealth: healthStatus,
    reachability,
    configuredUrl,
    lastResolvedUrl,
    itemsProcessed: 1,
    recordsExtracted: count,
    verifiedYield: verified,
    method: extractionMethodLabel(method),
    rejectionReasons: nextConfig.rejectionReasons as string[],
  };
}
