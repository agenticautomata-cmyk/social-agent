/**
 * Event listing Watchlist checks (Wix calendars and similar public listing pages).
 *
 * Never overwrite the operator-configured URL with a redirected fetch URL.
 * Yield (usable extracted events) is separate from HTTP reachability.
 * No email / Telegram / outreach from this path.
 */

import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { scoutItems, sourceWatchers, type SourceWatcher } from '../schema.js';
import { insertSnapshot, updateWatcherHealth } from '../early-signals/store.js';
import { recordSourceRun } from './watchlist.js';
import { normalizeWatchlistUrl } from './watchlist-url.js';
import type { WatchlistReachability } from './types.js';
import {
  detectEventListingCapability,
  extractEventListingsFromHtml,
  stableEventListingFingerprint,
  urlLooksLikeEventListing,
  type ExtractedEventListing,
} from './event-listing-extract.js';

const FETCH_TIMEOUT_MS = 25_000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; BensonWatchlist/1.0; +https://benson.kckellie.com)';

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

type WatcherConfig = Record<string, unknown>;

function asConfig(row: SourceWatcher): WatcherConfig {
  return (row.config && typeof row.config === 'object' ? row.config : {}) as WatcherConfig;
}

function contentHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function looksBlocked(html: string, status: number): boolean {
  if (status === 401 || status === 403 || status === 429) return true;
  return /cf-challenge|captcha-delivery|g-recaptcha|hcaptcha|access denied|pardon our interruption|verify you are human/i.test(
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
    const html = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      html,
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

export function isEventListingDirectoryWatcher(watcher: SourceWatcher): boolean {
  const config = asConfig(watcher);
  if (config.extractionMethod === 'event_listing' || config.extractionMethod === 'wix_events') {
    return true;
  }
  if (watcher.adapterType === 'event_listing' || watcher.adapterType === 'wix_events') return true;
  if (watcher.sourceCategory === 'event_directory' && !/eventbrite\.com/i.test(watcher.sourceUrl)) {
    return urlLooksLikeEventListing(watcher.sourceUrl) || Boolean(config.extractionCapabilityEstablished);
  }
  return urlLooksLikeEventListing(watcher.sourceUrl);
}

function statusExplanationFor(input: {
  extracted: number;
  created: number;
  priorCapability: boolean;
  verified: number;
}): { healthStatus: string; explanation: string } {
  const { extracted, created, priorCapability, verified } = input;
  if (extracted > 0 && !priorCapability) {
    return {
      healthStatus: 'healthy',
      explanation: `Baseline created from ${verified || extracted} verified event listings.`,
    };
  }
  if (extracted > 0 && created > 0) {
    return {
      healthStatus: 'healthy',
      explanation: `Recent check extracted ${extracted} events; ${created} were new.`,
    };
  }
  if (extracted > 0 && created === 0) {
    return {
      healthStatus: 'no_change',
      explanation: `Checked ${extracted} current listings; no changes found.`,
    };
  }
  if (priorCapability) {
    return {
      healthStatus: 'no_change',
      explanation: 'Checked current listings; no changes found.',
    };
  }
  return {
    healthStatus: 'no_yield',
    explanation: 'Page responded, but no usable events were found.',
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
    evidence: input.event.evidence,
    title: input.event.title,
    startDate: input.event.startDate,
    startDateTime: input.event.startDateTime,
    endDate: input.event.endDate,
    endDateTime: input.event.endDateTime,
    venue: input.event.venue,
    address: input.event.address,
    city: input.event.city,
    regionState: input.event.regionState,
    isRecurring: input.event.isRecurring,
    verificationState: input.event.verificationState,
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
  let normalizedConfigured = configuredUrl;
  try {
    normalizedConfigured = normalizeWatchlistUrl(configuredUrl).configuredUrl;
  } catch {
    normalizedConfigured = configuredUrl;
  }

  const priorConfig = asConfig(watcher);
  const now = new Date();

  await db
    .update(sourceWatchers)
    .set({ lastAttemptedCheck: now, updatedAt: now })
    .where(eq(sourceWatchers.id, watcherId));

  const fetched = await fetchWithFinalUrl(configuredUrl);
  const lastResolvedUrl = fetched.finalUrl;
  const blocked = fetched.ok && looksBlocked(fetched.html, fetched.status);

  if (!fetched.ok || fetched.status === 0) {
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
      finalFetchMethod: 'event_listing',
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
    const explanation = 'Access is blocked (login, CAPTCHA, bot protection, or robots rules).';
    const nextConfig = {
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
    };
    await db
      .update(sourceWatchers)
      .set({
        sourceUrl: configuredUrl,
        healthStatus: 'blocked',
        paused: true,
        lastFailureAt: new Date(),
        lastFailureMessage: explanation,
        config: nextConfig,
        updatedAt: new Date(),
      })
      .where(eq(sourceWatchers.id, watcherId));
    await recordSourceRun({
      watcherId,
      triggerType,
      finalFetchMethod: 'event_listing',
      itemCount: 1,
      newCount: 0,
      qualifiedCount: 0,
      sanitizedFailure: explanation,
      metadata: { configuredUrl, lastResolvedUrl, outcome: 'blocked' },
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

  const capability = detectEventListingCapability(fetched.html, configuredUrl);
  // Non-event Wix/business pages: do not pretend this is an event directory failure.
  if (!capability.looksLikeEventListing && !isEventListingDirectoryWatcher(watcher)) {
    const explanation =
      'Page responded, but it does not look like a public event listing.';
    await db
      .update(sourceWatchers)
      .set({
        sourceUrl: configuredUrl,
        lastSuccessfulCheck: now,
        healthStatus: 'no_yield',
        config: {
          ...priorConfig,
          lastResolvedUrl,
          reachability: 'reachable',
          statusExplanation: explanation,
          lastCheckOutcome: 'no_yield',
          itemsProcessed: 1,
          recordsExtracted: 0,
          newRecordsFound: 0,
          verifiedYield: 0,
          rejectionReasons: capability.reasons,
          extractionMethod: priorConfig.extractionMethod ?? 'http_then_browser',
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
        inspectionSummary: explanation,
        capability,
      },
    });
    return {
      ok: true,
      newItems: 0,
      qualified: 0,
      inspectionSummary: explanation,
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

  const extracted = extractEventListingsFromHtml({
    html: fetched.html,
    pageUrl: normalizedConfigured || configuredUrl,
  });

  let created = 0;
  for (const event of extracted.events) {
    const outcome = await upsertListingScoutItem({ watcherId, event });
    if (outcome === 'created') created += 1;
  }

  const count = extracted.events.length;
  const verified = extracted.events.filter((e) => e.verificationState === 'verified').length;
  const priorCapability = Boolean(priorConfig.extractionCapabilityEstablished);
  const capabilityEstablished = priorCapability || count > 0;
  const { healthStatus, explanation } = statusExplanationFor({
    extracted: count,
    created,
    priorCapability,
    verified,
  });

  // Prefer baseline language even when health is healthy for first yield.
  const nextConfig = {
    ...priorConfig,
    lastResolvedUrl,
    reachability: 'reachable' as WatchlistReachability,
    statusExplanation: explanation,
    itemsProcessed: 1,
    recordsExtracted: count,
    newRecordsFound: created,
    verifiedYield: verified,
    extractionCapabilityEstablished: capabilityEstablished,
    lastSuccessfulExtractionAt: count > 0 ? now.toISOString() : priorConfig.lastSuccessfulExtractionAt ?? null,
    lastCheckOutcome: healthStatus,
    suppressSchedule: false,
    extractionMethod: extracted.method === 'wix_events_hydration' ? 'wix_events' : 'event_listing',
    rejectionReasons: extracted.rejectionReasons,
    strategiesAttempted: extracted.strategiesAttempted,
    listingCapability: capability,
  };

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
      adapterType:
        watcher.adapterType === 'html_watch' || watcher.adapterType === 'event_listing'
          ? 'event_listing'
          : watcher.adapterType,
      sourceCategory: 'event_directory',
      config: nextConfig,
      updatedAt: now,
      ...(count > 0 ? { lastChangedAt: now } : {}),
    })
    .where(eq(sourceWatchers.id, watcherId));

  await insertSnapshot({
    watcherId,
    contentHash: contentHash(
      extracted.events
        .map((e) => stableEventListingFingerprint(e))
        .sort()
        .join('|'),
    ),
    extractedContent: extracted.events
      .slice(0, 20)
      .map((e) => `${e.title} | ${e.startDate ?? 'undated'} | ${e.venue ?? ''} | ${e.eventUrl ?? ''}`)
      .join('\n')
      .slice(0, 4000),
    responseStatus: fetched.status,
    changeSummary: explanation,
    metadata: {
      configuredUrl,
      lastResolvedUrl,
      extracted: count,
      created,
      verified,
      method: extracted.method,
      rejectionReasons: extracted.rejectionReasons,
      httpStatus: fetched.status,
      htmlBytes: fetched.html.length,
    },
  });

  await recordSourceRun({
    watcherId,
    triggerType,
    finalFetchMethod: extracted.method === 'none' ? 'event_listing' : extracted.method,
    itemCount: count,
    newCount: created,
    qualifiedCount: verified,
    metadata: {
      configuredUrl,
      lastResolvedUrl,
      outcome: healthStatus,
      inspectionSummary: explanation,
      method: extracted.method,
      rejectionReasons: extracted.rejectionReasons,
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
    recordsExtracted: count,
    verifiedYield: verified,
    method: extracted.method,
    rejectionReasons: extracted.rejectionReasons,
  };
}
