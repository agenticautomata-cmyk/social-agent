/**
 * Meetup.com find/search Watchlist checks.
 *
 * Public SSR only (no login). Relevance is content-based; questionable items are
 * marked for review and never auto-alert / pitch / promote from this path.
 */

import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { scoutItems, sourceWatchers, type SourceWatcher } from '../schema.js';
import { insertSnapshot, updateWatcherHealth } from '../early-signals/store.js';
import { recordSourceRun } from './watchlist.js';
import type { WatchlistReachability } from './types.js';
import {
  extractMeetupEventsFromHtml,
  isMeetupWatchUrl,
  stableMeetupFingerprint,
  type ExtractedMeetupEvent,
} from './meetup-extract.js';

const FETCH_TIMEOUT_MS = 25_000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; BensonWatchlist/1.0; +https://benson.kckellie.com)';

export type MeetupWatchCheckResult = {
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
  relevanceCounts?: Record<string, number>;
};

type WatcherConfig = Record<string, unknown>;

function asConfig(row: SourceWatcher): WatcherConfig {
  return (row.config && typeof row.config === 'object' ? row.config : {}) as WatcherConfig;
}

function contentHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function looksBlocked(html: string, status: number): boolean {
  if (status === 401 || status === 403 || status === 429) return true;
  return /cf-challenge|captcha-delivery|g-recaptcha|hcaptcha|access denied|pardon our interruption|verify you are human|Just a moment/i.test(
    html,
  );
}

async function fetchWithFinalUrl(url: string): Promise<{
  ok: boolean;
  status: number;
  html: string;
  finalUrl: string;
  error?: string;
}> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    return {
      ok: res.ok,
      status: res.status,
      html: await res.text(),
      finalUrl: res.url || url,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      html: '',
      finalUrl: url,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function isMeetupDirectoryWatcher(watcher: SourceWatcher): boolean {
  const config = asConfig(watcher);
  if (config.extractionMethod === 'meetup_directory') return true;
  if (watcher.adapterType === 'meetup_directory') return true;
  if (watcher.sourceCategory === 'event_directory' && isMeetupWatchUrl(watcher.sourceUrl)) {
    return true;
  }
  return isMeetupWatchUrl(watcher.sourceUrl);
}

async function upsertMeetupScoutItem(input: {
  watcherId: string;
  event: ExtractedMeetupEvent;
}): Promise<'created' | 'existing'> {
  const fp = contentHash(`meetup:${stableMeetupFingerprint(input.event)}`);
  const contentHashValue = contentHash(
    `${input.event.externalId ?? ''}:${input.event.eventUrl}:${input.event.title}:${input.event.startDate ?? ''}`,
  );
  const [existing] = await db
    .select({ id: scoutItems.id })
    .from(scoutItems)
    .where(
      and(eq(scoutItems.watcherId, input.watcherId), eq(scoutItems.occurrenceFingerprint, fp)),
    )
    .limit(1);
  const relevance = {
    source: 'meetup_directory',
    method: input.event.method,
    platform: 'meetup',
    evidence: input.event.evidence,
    title: input.event.title,
    startDate: input.event.startDate,
    startDateTime: input.event.startDateTime,
    venue: input.event.venue,
    address: input.event.address,
    city: input.event.city,
    regionState: input.event.regionState,
    organizer: input.event.organizer,
    groupUrlname: input.event.groupUrlname,
    attendanceCount: input.event.attendanceCount,
    verificationState: input.event.verificationState,
    relevance: input.event.relevance,
    needsReview: input.event.needsReview,
    relevanceReasons: input.event.relevanceReasons,
    autoAlert: false,
    autoPitch: false,
    autoPromote: false,
    eventUrl: input.event.eventUrl,
    retrievedAt: new Date().toISOString(),
  };
  if (existing) {
    await db
      .update(scoutItems)
      .set({
        captionText: input.event.title,
        itemUrl: input.event.eventUrl,
        relevanceExplanation: relevance,
        verificationStatus:
          input.event.verificationState === 'verified'
            ? 'extracted'
            : input.event.verificationState === 'unresolved_date'
              ? 'needs_date'
              : 'partial',
        updatedAt: new Date(),
      })
      .where(eq(scoutItems.id, existing.id));
    return 'existing';
  }
  await db.insert(scoutItems).values({
    watcherId: input.watcherId,
    itemUrl: input.event.eventUrl,
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

function statusExplanationFor(input: {
  extracted: number;
  created: number;
  priorCapability: boolean;
  verified: number;
  needsAdapter?: boolean;
  hasNextPage?: boolean;
}): { healthStatus: string; explanation: string } {
  const { extracted, created, priorCapability, verified, needsAdapter, hasNextPage } = input;
  const pageNote = hasNextPage
    ? ' First SSR page only (further Meetup pages not fetched without GraphQL).'
    : '';
  if (extracted > 0 && !priorCapability) {
    return {
      healthStatus: 'healthy',
      explanation: `Baseline created from ${verified || extracted} verified Meetup listings.${pageNote}`,
    };
  }
  if (extracted > 0 && created > 0) {
    return {
      healthStatus: 'healthy',
      explanation: `Recent check extracted ${extracted} events; ${created} were new.${pageNote}`,
    };
  }
  if (extracted > 0 && created === 0) {
    return {
      healthStatus: 'no_change',
      explanation: `Checked ${extracted} current listings; no changes found.${pageNote}`,
    };
  }
  if (needsAdapter) {
    return {
      healthStatus: 'needs_adapter',
      explanation:
        'Meetup search surface detected, but SSR Apollo/JSON-LD results were missing.',
    };
  }
  if (priorCapability) {
    return { healthStatus: 'no_change', explanation: 'Checked current listings; no changes found.' };
  }
  return {
    healthStatus: 'no_yield',
    explanation: 'Page responded, but no usable Meetup events were found.',
  };
}

export async function runMeetupWatchlistCheck(
  watcherId: string,
  triggerType: 'manual' | 'scheduled' = 'manual',
): Promise<MeetupWatchCheckResult> {
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

  const fetched = await fetchWithFinalUrl(configuredUrl);
  const lastResolvedUrl = fetched.finalUrl;
  const blocked = looksBlocked(fetched.html, fetched.status);

  if (!fetched.ok && !blocked) {
    const explanation = fetched.error?.slice(0, 300) || `Fetch failed (HTTP ${fetched.status})`;
    await updateWatcherHealth(watcherId, { ok: false, error: explanation });
    await db
      .update(sourceWatchers)
      .set({
        config: {
          ...priorConfig,
          lastResolvedUrl,
          reachability: 'failed',
          statusExplanation: explanation,
          lastCheckOutcome: 'failed',
          itemsProcessed: 0,
          recordsExtracted: 0,
          newRecordsFound: 0,
          verifiedYield: 0,
        },
        sourceUrl: configuredUrl,
        updatedAt: new Date(),
      })
      .where(eq(sourceWatchers.id, watcherId));
    await recordSourceRun({
      watcherId,
      triggerType,
      finalFetchMethod: 'meetup_directory',
      sanitizedFailure: explanation,
      metadata: { configuredUrl, lastResolvedUrl, outcome: 'failed' },
    });
    return {
      ok: false,
      newItems: 0,
      qualified: 0,
      error: explanation,
      inspectionSummary: explanation,
      displayHealth: 'failed',
      reachability: 'failed',
      configuredUrl,
      lastResolvedUrl,
      itemsProcessed: 0,
      recordsExtracted: 0,
      verifiedYield: 0,
    };
  }

  if (blocked) {
    const explanation = `Meetup blocked automated access (HTTP ${fetched.status || 'challenge'}).`;
    await db
      .update(sourceWatchers)
      .set({
        sourceUrl: configuredUrl,
        healthStatus: 'blocked',
        paused: true,
        lastFailureAt: new Date(),
        lastFailureMessage: explanation,
        config: {
          ...priorConfig,
          lastResolvedUrl,
          reachability: 'blocked' as WatchlistReachability,
          statusExplanation: explanation,
          lastCheckOutcome: 'blocked',
          itemsProcessed: 1,
          recordsExtracted: 0,
          newRecordsFound: 0,
          verifiedYield: 0,
          suppressSchedule: true,
          extractionMethod: 'meetup_directory',
        },
        updatedAt: new Date(),
      })
      .where(eq(sourceWatchers.id, watcherId));
    await insertSnapshot({
      watcherId,
      contentHash: createHash('sha256').update(fetched.html.slice(0, 8000)).digest('hex'),
      extractedContent: fetched.html.slice(0, 2000),
      responseStatus: fetched.status,
      changeSummary: explanation,
      metadata: { configuredUrl, lastResolvedUrl, reachability: 'blocked' },
    });
    await recordSourceRun({
      watcherId,
      triggerType,
      finalFetchMethod: 'meetup_directory',
      itemCount: 1,
      sanitizedFailure: explanation,
      metadata: { configuredUrl, lastResolvedUrl, outcome: 'blocked', status: fetched.status },
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
    };
  }

  const extracted = extractMeetupEventsFromHtml(fetched.html, configuredUrl);
  let created = 0;
  for (const event of extracted.events) {
    // Persist all extracted rows with relevance labels; never auto-alert.
    if ((await upsertMeetupScoutItem({ watcherId, event })) === 'created') created += 1;
  }

  const recordsExtracted = extracted.events.length;
  const verified = extracted.events.filter((e) => e.verificationState === 'verified').length;
  const priorCapability = Boolean(priorConfig.extractionCapabilityEstablished);
  const relevanceCounts = extracted.events.reduce<Record<string, number>>((acc, ev) => {
    acc[ev.relevance] = (acc[ev.relevance] ?? 0) + 1;
    return acc;
  }, {});
  const { healthStatus, explanation } = statusExplanationFor({
    extracted: recordsExtracted,
    created,
    priorCapability,
    verified,
    needsAdapter: extracted.capability.needsAdapter && recordsExtracted === 0,
    hasNextPage: extracted.pagination.hasNextPage,
  });

  await db
    .update(sourceWatchers)
    .set({
      sourceUrl: configuredUrl,
      lastSuccessfulCheck: now,
      lastAttemptedCheck: now,
      consecutiveFailureCount: 0,
      healthStatus,
      lastFailureAt: null,
      lastFailureMessage: null,
      lastNewItemDetected: created > 0 ? now : watcher.lastNewItemDetected,
      config: {
        ...priorConfig,
        lastResolvedUrl,
        reachability: 'reachable' as WatchlistReachability,
        statusExplanation: explanation,
        itemsProcessed: 1,
        recordsExtracted,
        newRecordsFound: created,
        verifiedYield: verified,
        extractionCapabilityEstablished: priorCapability || recordsExtracted > 0,
        lastSuccessfulExtractionAt:
          recordsExtracted > 0 ? now.toISOString() : priorConfig.lastSuccessfulExtractionAt ?? null,
        lastCheckOutcome: healthStatus,
        suppressSchedule: false,
        extractionMethod: 'meetup_directory',
        meetupPagination: extracted.pagination,
        meetupRelevanceCounts: relevanceCounts,
        rejectionReasons: extracted.rejectionReasons,
      },
      updatedAt: now,
      ...(recordsExtracted > 0 ? { lastChangedAt: now } : {}),
    })
    .where(eq(sourceWatchers.id, watcherId));

  await insertSnapshot({
    watcherId,
    contentHash: createHash('sha256')
      .update(extracted.events.map((e) => e.eventUrl).join('|'))
      .digest('hex'),
    extractedContent: extracted.events
      .slice(0, 20)
      .map(
        (e) =>
          `${e.title} | ${e.startDateTime ?? e.startDate ?? ''} | ${e.organizer ?? ''} | ${e.relevance} | ${e.eventUrl}`,
      )
      .join('\n')
      .slice(0, 4000),
    responseStatus: fetched.status,
    changeSummary: explanation,
    metadata: {
      configuredUrl,
      lastResolvedUrl,
      extracted: recordsExtracted,
      created,
      verified,
      method: extracted.method,
      pagination: extracted.pagination,
      relevanceCounts,
      autoAlert: false,
    },
  });

  await recordSourceRun({
    watcherId,
    triggerType,
    finalFetchMethod: 'meetup_directory',
    itemCount: recordsExtracted,
    newCount: created,
    qualifiedCount: verified,
    metadata: {
      configuredUrl,
      lastResolvedUrl,
      outcome: healthStatus,
      inspectionSummary: explanation,
      method: extracted.method,
      relevanceCounts,
    },
  });

  return {
    ok: true,
    newItems: created,
    qualified: verified,
    inspectionSummary: explanation,
    displayHealth: healthStatus,
    reachability: 'reachable',
    configuredUrl,
    lastResolvedUrl,
    itemsProcessed: 1,
    recordsExtracted,
    verifiedYield: verified,
    method: extracted.method,
    rejectionReasons: extracted.rejectionReasons,
    relevanceCounts,
  };
}
