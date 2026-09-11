/**
 * Eventbrite directory Watchlist checks.
 *
 * Never overwrite the operator-configured URL with a redirected fetch URL.
 * Yield (usable extracted events) is separate from HTTP reachability.
 */

import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { scoutItems, sourceWatchers, type SourceWatcher } from '../schema.js';
import { extractEventbriteCatalogEntriesFromHtml } from '../eventbrite-kc-discovery/extract.js';
import { insertSnapshot, updateWatcherHealth } from '../early-signals/store.js';
import { recordSourceRun } from './watchlist.js';
import {
  eventbriteListingRedirectedToHomepage,
  isEventbriteWatchUrl,
  normalizeWatchlistUrl,
} from './watchlist-url.js';
import type { WatchlistReachability } from './types.js';

const FETCH_TIMEOUT_MS = 25_000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; BensonWatchlist/1.0; +https://benson.kckellie.com)';

export type EventbriteWatchCheckResult = {
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
};

type WatcherConfig = Record<string, unknown>;

function asConfig(row: SourceWatcher): WatcherConfig {
  return (row.config && typeof row.config === 'object' ? row.config : {}) as WatcherConfig;
}

function fingerprint(url: string): string {
  return createHash('sha256').update(`eventbrite-watch:${url}`).digest('hex');
}

function looksBlocked(html: string, status: number): boolean {
  if (status === 401 || status === 403 || status === 429) return true;
  // Prefer concrete challenge markers over the generic word "bot".
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

async function upsertEventScoutItem(input: {
  watcherId: string;
  eventUrl: string;
  title: string | null;
  eventId: string;
}): Promise<'created' | 'existing'> {
  const fp = fingerprint(input.eventUrl);
  const contentHash = createHash('sha256')
    .update(`${input.eventId}:${input.eventUrl}`)
    .digest('hex');
  const [existing] = await db
    .select({ id: scoutItems.id })
    .from(scoutItems)
    .where(
      and(eq(scoutItems.watcherId, input.watcherId), eq(scoutItems.occurrenceFingerprint, fp)),
    )
    .limit(1);
  if (existing) {
    await db
      .update(scoutItems)
      .set({
        captionText: input.title,
        updatedAt: new Date(),
      })
      .where(eq(scoutItems.id, existing.id));
    return 'existing';
  }
  await db.insert(scoutItems).values({
    watcherId: input.watcherId,
    itemUrl: input.eventUrl,
    itemType: 'eventbrite_event',
    captionText: input.title,
    contentHash,
    occurrenceFingerprint: fp,
    externalItemId: input.eventId,
    creatorValueStatus: 'pending',
    verificationStatus: 'extracted',
    relevanceExplanation: {
      source: 'eventbrite_directory',
      evidence: 'json_ld_or_href_catalog',
      title: input.title,
      eventbriteEventId: input.eventId,
    },
  });
  return 'created';
}

export function isEventbriteDirectoryWatcher(watcher: SourceWatcher): boolean {
  const config = asConfig(watcher);
  if (config.extractionMethod === 'eventbrite_directory') return true;
  if (watcher.adapterType === 'eventbrite_directory') return true;
  if (watcher.sourceCategory === 'event_directory' && isEventbriteWatchUrl(watcher.sourceUrl)) {
    return true;
  }
  return isEventbriteWatchUrl(watcher.sourceUrl);
}

export async function runEventbriteWatchlistCheck(
  watcherId: string,
  triggerType: 'manual' | 'scheduled' = 'manual',
): Promise<EventbriteWatchCheckResult> {
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
  let normalized;
  try {
    normalized = normalizeWatchlistUrl(configuredUrl);
  } catch {
    normalized = null;
  }

  const priorConfig = asConfig(watcher);
  const now = new Date();

  if (normalized?.needsSetup) {
    const explanation =
      normalized.setupReason ??
      'This source needs a location-specific Eventbrite URL.';
    const nextConfig = {
      ...priorConfig,
      lastResolvedUrl: configuredUrl,
      reachability: 'reachable' as WatchlistReachability,
      statusExplanation: explanation,
      itemsProcessed: 0,
      recordsExtracted: 0,
      newRecordsFound: 0,
      verifiedYield: 0,
      lastCheckOutcome: 'needs_setup',
      suppressSchedule: true,
    };
    await db
      .update(sourceWatchers)
      .set({
        lastAttemptedCheck: now,
        healthStatus: 'needs_setup',
        paused: true,
        lastFailureMessage: explanation,
        config: nextConfig,
        updatedAt: now,
      })
      .where(eq(sourceWatchers.id, watcherId));
    await recordSourceRun({
      watcherId,
      triggerType,
      finalFetchMethod: 'eventbrite_directory',
      itemCount: 0,
      newCount: 0,
      qualifiedCount: 0,
      sanitizedFailure: explanation,
      metadata: { outcome: 'needs_setup', configuredUrl },
    });
    return {
      ok: false,
      newItems: 0,
      qualified: 0,
      error: explanation,
      inspectionSummary: explanation,
      displayHealth: 'needs_setup',
      reachability: 'reachable',
      configuredUrl,
      lastResolvedUrl: configuredUrl,
      itemsProcessed: 0,
      recordsExtracted: 0,
      verifiedYield: 0,
    };
  }

  await db
    .update(sourceWatchers)
    .set({ lastAttemptedCheck: now, updatedAt: now })
    .where(eq(sourceWatchers.id, watcherId));

  const fetched = await fetchWithFinalUrl(configuredUrl);
  const lastResolvedUrl = fetched.finalUrl;
  const redirectedHome = eventbriteListingRedirectedToHomepage(configuredUrl, lastResolvedUrl);
  const blocked = fetched.ok && looksBlocked(fetched.html, fetched.status);

  if (!fetched.ok || fetched.status === 0) {
    const explanation = fetched.error?.slice(0, 300) || `Fetch failed (HTTP ${fetched.status})`;
    await updateWatcherHealth(watcherId, { ok: false, error: explanation });
    // Preserve configured URL — only record resolved URL in config.
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
        // Never overwrite source_url with redirect target.
        sourceUrl: configuredUrl,
        updatedAt: new Date(),
      })
      .where(eq(sourceWatchers.id, watcherId));
    await recordSourceRun({
      watcherId,
      triggerType,
      finalFetchMethod: 'eventbrite_directory',
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

  if (redirectedHome || blocked) {
    const reachability: WatchlistReachability = redirectedHome ? 'redirected' : 'blocked';
    const explanation = redirectedHome
      ? 'Eventbrite redirected this Kansas City listing to its homepage.'
      : 'Eventbrite blocked automated access (CAPTCHA or bot protection).';
    const nextConfig = {
      ...priorConfig,
      lastResolvedUrl,
      reachability,
      statusExplanation: explanation,
      redirectEvidence: redirectedHome
        ? { configuredUrl, finalUrl: lastResolvedUrl, kind: 'homepage_redirect' }
        : { configuredUrl, finalUrl: lastResolvedUrl, kind: 'bot_protection', status: fetched.status },
      lastCheckOutcome: reachability,
      itemsProcessed: 1,
      recordsExtracted: 0,
      newRecordsFound: 0,
      verifiedYield: 0,
      suppressSchedule: true,
    };
    await db
      .update(sourceWatchers)
      .set({
        // Preserve configured listing URL forever.
        sourceUrl: configuredUrl,
        healthStatus: 'blocked',
        paused: true,
        lastFailureAt: new Date(),
        lastFailureMessage: explanation,
        config: nextConfig,
        updatedAt: new Date(),
      })
      .where(eq(sourceWatchers.id, watcherId));
    await insertSnapshot({
      watcherId,
      contentHash: createHash('sha256').update(fetched.html.slice(0, 8000)).digest('hex'),
      extractedContent: fetched.html.slice(0, 2000),
      responseStatus: fetched.status,
      changeSummary: explanation,
      metadata: { configuredUrl, lastResolvedUrl, reachability },
    });
    await recordSourceRun({
      watcherId,
      triggerType,
      finalFetchMethod: 'eventbrite_directory',
      itemCount: 1,
      newCount: 0,
      qualifiedCount: 0,
      sanitizedFailure: explanation,
      metadata: { configuredUrl, lastResolvedUrl, outcome: reachability },
    });
    return {
      ok: false,
      newItems: 0,
      qualified: 0,
      error: explanation,
      inspectionSummary: explanation,
      displayHealth: 'blocked',
      reachability,
      configuredUrl,
      lastResolvedUrl,
      itemsProcessed: 1,
      recordsExtracted: 0,
      verifiedYield: 0,
    };
  }

  const entries = extractEventbriteCatalogEntriesFromHtml(fetched.html, 'city');
  let created = 0;
  for (const entry of entries) {
    const outcome = await upsertEventScoutItem({
      watcherId,
      eventUrl: entry.url,
      title: entry.titleHint ?? null,
      eventId: entry.eventbriteEventId,
    });
    if (outcome === 'created') created += 1;
  }

  const extracted = entries.length;
  const verified = entries.filter((e) => Boolean(e.eventbriteEventId && e.url)).length;
  const priorCapability = Boolean(priorConfig.extractionCapabilityEstablished);
  const capability = priorCapability || extracted > 0;
  let healthStatus: string;
  let explanation: string;
  if (extracted > 0 && !priorCapability) {
    healthStatus = 'healthy';
    explanation = `Baseline created from ${verified || extracted} verified event listings.`;
  } else if (extracted > 0 && created === 0) {
    healthStatus = 'no_change';
    explanation = `Checked ${extracted} current listings; no changes found.`;
  } else if (extracted > 0) {
    healthStatus = 'healthy';
    explanation = `Recent check extracted ${extracted} events; ${created} were new.`;
  } else if (capability) {
    healthStatus = 'no_change';
    explanation = 'Checked current listings; no changes found.';
  } else {
    healthStatus = 'no_yield';
    explanation = 'Page responded, but no usable events were found.';
  }

  const nextConfig = {
    ...priorConfig,
    lastResolvedUrl,
    reachability: 'reachable' as WatchlistReachability,
    statusExplanation: explanation,
    itemsProcessed: 1,
    recordsExtracted: extracted,
    newRecordsFound: created,
    verifiedYield: verified,
    extractionCapabilityEstablished: capability,
    lastSuccessfulExtractionAt: extracted > 0 ? now.toISOString() : priorConfig.lastSuccessfulExtractionAt ?? null,
    lastCheckOutcome: healthStatus,
    suppressSchedule: false,
    extractionMethod: 'eventbrite_directory',
  };

  // Mark yield-aware health. updateWatcherHealth(ok:true) alone would claim healthy
  // even with zero records — write the precise status ourselves.
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
      config: nextConfig,
      updatedAt: now,
      ...(extracted > 0 ? { lastChangedAt: now } : {}),
    })
    .where(eq(sourceWatchers.id, watcherId));

  await insertSnapshot({
    watcherId,
    contentHash: createHash('sha256')
      .update(entries.map((e) => e.eventbriteEventId).join('|'))
      .digest('hex'),
    extractedContent: entries
      .slice(0, 20)
      .map((e) => `${e.titleHint ?? ''} ${e.url}`)
      .join('\n')
      .slice(0, 4000),
    responseStatus: fetched.status,
    changeSummary: explanation,
    metadata: {
      configuredUrl,
      lastResolvedUrl,
      extracted,
      created,
      verified,
    },
  });

  await recordSourceRun({
    watcherId,
    triggerType,
    finalFetchMethod: 'eventbrite_directory',
    itemCount: extracted,
    newCount: created,
    qualifiedCount: verified,
    metadata: {
      configuredUrl,
      lastResolvedUrl,
      outcome: healthStatus,
      inspectionSummary: explanation,
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
    recordsExtracted: extracted,
    verifiedYield: verified,
  };
}
