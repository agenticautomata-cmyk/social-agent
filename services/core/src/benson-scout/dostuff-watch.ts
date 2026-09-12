/**
 * DoStuff / Do816 Watchlist checks.
 *
 * Prefer public `{path}.json`; fall back to SSR cards. Never overwrite configured URL.
 * Yield ≠ reachability. No outreach / Telegram / billable AI.
 */

import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { scoutItems, sourceWatchers, type SourceWatcher } from '../schema.js';
import { insertSnapshot, updateWatcherHealth } from '../early-signals/store.js';
import { recordSourceRun } from './watchlist.js';
import type { WatchlistReachability } from './types.js';
import {
  dostuffJsonUrlFor,
  extractDostuffEventsFromHtml,
  extractDostuffEventsFromJson,
  isDostuffWatchUrl,
  stableDostuffFingerprint,
  type DostuffExtractResult,
  type ExtractedDostuffEvent,
} from './dostuff-extract.js';

const FETCH_TIMEOUT_MS = 25_000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; BensonWatchlist/1.0; +https://benson.kckellie.com)';

export type DostuffWatchCheckResult = {
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

function looksBlocked(body: string, status: number): boolean {
  if (status === 401 || status === 403 || status === 429) return true;
  return /cf-challenge|captcha-delivery|g-recaptcha|hcaptcha|access denied|pardon our interruption|verify you are human/i.test(
    body,
  );
}

async function fetchText(url: string, accept: string): Promise<{
  ok: boolean;
  status: number;
  body: string;
  finalUrl: string;
  error?: string;
}> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT, Accept: accept },
      redirect: 'follow',
    });
    return { ok: res.ok, status: res.status, body: await res.text(), finalUrl: res.url || url };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: '',
      finalUrl: url,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function isDostuffDirectoryWatcher(watcher: SourceWatcher): boolean {
  const config = asConfig(watcher);
  if (config.extractionMethod === 'dostuff_events') return true;
  if (watcher.adapterType === 'dostuff_events') return true;
  if (watcher.sourceCategory === 'event_directory' && isDostuffWatchUrl(watcher.sourceUrl)) {
    return true;
  }
  return isDostuffWatchUrl(watcher.sourceUrl);
}

async function upsertDostuffScoutItem(input: {
  watcherId: string;
  event: ExtractedDostuffEvent;
}): Promise<'created' | 'existing'> {
  const fp = contentHash(`dostuff:${stableDostuffFingerprint(input.event)}`);
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
    source: 'dostuff_events',
    method: input.event.method,
    platform: 'dostuff',
    evidence: input.event.evidence,
    title: input.event.title,
    startDate: input.event.startDate,
    startDateTime: input.event.startDateTime,
    venue: input.event.venue,
    address: input.event.address,
    city: input.event.city,
    regionState: input.event.regionState,
    organizer: input.event.organizer,
    verificationState: input.event.verificationState,
    eventUrl: input.event.eventUrl,
    ticketOrRsvpUrl: input.event.ticketOrRsvpUrl,
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
  emptyListing?: boolean;
  incompleteRender?: boolean;
}): { healthStatus: string; explanation: string } {
  const { extracted, created, priorCapability, verified, needsAdapter, emptyListing, incompleteRender } =
    input;
  if (extracted > 0 && !priorCapability) {
    return {
      healthStatus: 'healthy',
      explanation: `Baseline created from ${verified || extracted} verified DoStuff event listings.`,
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
  if (needsAdapter || incompleteRender) {
    return {
      healthStatus: 'needs_adapter',
      explanation: 'DoStuff listing chrome detected, but SSR/JSON event cards were missing or incomplete.',
    };
  }
  if (emptyListing) {
    return {
      healthStatus: 'no_yield',
      explanation: 'DoStuff listing responded with an empty event collection (not blocked).',
    };
  }
  if (priorCapability) {
    return { healthStatus: 'no_change', explanation: 'Checked current listings; no changes found.' };
  }
  return {
    healthStatus: 'no_yield',
    explanation: 'Page responded, but no usable DoStuff events were found.',
  };
}

async function extractPreferringJson(configuredUrl: string): Promise<{
  extracted: DostuffExtractResult;
  lastResolvedUrl: string;
  status: number;
  blocked: boolean;
  fetchError?: string;
  snippet: string;
}> {
  const jsonUrl = dostuffJsonUrlFor(configuredUrl);
  let jsonBlockedStatus: number | null = null;
  let jsonBlockedSnippet = '';
  let jsonBlockedUrl = jsonUrl ?? configuredUrl;
  if (jsonUrl) {
    const jsonFetched = await fetchText(jsonUrl, 'application/json, text/plain, */*');
    if (jsonFetched.ok) {
      const extracted = extractDostuffEventsFromJson(jsonFetched.body, configuredUrl);
      if (extracted.events.length > 0 || extracted.pagination.emptyListing) {
        return {
          extracted,
          lastResolvedUrl: jsonFetched.finalUrl,
          status: jsonFetched.status,
          blocked: false,
          snippet: jsonFetched.body.slice(0, 2000),
        };
      }
    } else if (looksBlocked(jsonFetched.body, jsonFetched.status)) {
      // JSON twin blocked — still try the public HTML page before declaring blocked.
      jsonBlockedStatus = jsonFetched.status;
      jsonBlockedSnippet = jsonFetched.body.slice(0, 2000);
      jsonBlockedUrl = jsonFetched.finalUrl;
    }
  }

  const htmlFetched = await fetchText(configuredUrl, 'text/html,application/xhtml+xml');
  const htmlBlocked = looksBlocked(htmlFetched.body, htmlFetched.status);
  if (htmlFetched.ok && !htmlBlocked) {
    return {
      extracted: extractDostuffEventsFromHtml(htmlFetched.body, configuredUrl),
      lastResolvedUrl: htmlFetched.finalUrl,
      status: htmlFetched.status,
      blocked: false,
      snippet: htmlFetched.body.slice(0, 2000),
    };
  }
  if (htmlBlocked || jsonBlockedStatus != null) {
    return {
      extracted: extractDostuffEventsFromHtml(htmlFetched.ok ? htmlFetched.body : '', configuredUrl),
      lastResolvedUrl: htmlFetched.ok ? htmlFetched.finalUrl : jsonBlockedUrl,
      status: htmlBlocked ? htmlFetched.status : (jsonBlockedStatus ?? htmlFetched.status),
      blocked: true,
      snippet: htmlFetched.body.slice(0, 2000) || jsonBlockedSnippet,
    };
  }
  return {
    extracted: extractDostuffEventsFromHtml('', configuredUrl),
    lastResolvedUrl: htmlFetched.finalUrl,
    status: htmlFetched.status,
    blocked: false,
    fetchError: htmlFetched.error || `Fetch failed (HTTP ${htmlFetched.status})`,
    snippet: htmlFetched.body.slice(0, 2000),
  };
}

export async function runDostuffWatchlistCheck(
  watcherId: string,
  triggerType: 'manual' | 'scheduled' = 'manual',
): Promise<DostuffWatchCheckResult> {
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

  const { extracted, lastResolvedUrl, status, blocked, fetchError, snippet } =
    await extractPreferringJson(configuredUrl);

  if (fetchError && !blocked) {
    await updateWatcherHealth(watcherId, { ok: false, error: fetchError });
    await db
      .update(sourceWatchers)
      .set({
        config: {
          ...priorConfig,
          lastResolvedUrl,
          reachability: 'failed',
          statusExplanation: fetchError,
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
      finalFetchMethod: 'dostuff_events',
      sanitizedFailure: fetchError,
      metadata: { configuredUrl, lastResolvedUrl, outcome: 'failed' },
    });
    return {
      ok: false,
      newItems: 0,
      qualified: 0,
      error: fetchError,
      inspectionSummary: fetchError,
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
    const explanation = `DoStuff/Do816 blocked automated access (HTTP ${status || 'challenge'}).`;
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
          extractionMethod: 'dostuff_events',
        },
        updatedAt: new Date(),
      })
      .where(eq(sourceWatchers.id, watcherId));
    await insertSnapshot({
      watcherId,
      contentHash: createHash('sha256').update(snippet).digest('hex'),
      extractedContent: snippet,
      responseStatus: status,
      changeSummary: explanation,
      metadata: { configuredUrl, lastResolvedUrl, reachability: 'blocked' },
    });
    await recordSourceRun({
      watcherId,
      triggerType,
      finalFetchMethod: 'dostuff_events',
      itemCount: 1,
      sanitizedFailure: explanation,
      metadata: { configuredUrl, lastResolvedUrl, outcome: 'blocked', status },
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

  let created = 0;
  for (const event of extracted.events) {
    if ((await upsertDostuffScoutItem({ watcherId, event })) === 'created') created += 1;
  }

  const recordsExtracted = extracted.events.length;
  const verified = extracted.events.filter((e) => e.verificationState === 'verified').length;
  const priorCapability = Boolean(priorConfig.extractionCapabilityEstablished);
  const { healthStatus, explanation } = statusExplanationFor({
    extracted: recordsExtracted,
    created,
    priorCapability,
    verified,
    needsAdapter: extracted.capability.needsAdapter,
    emptyListing: extracted.pagination.emptyListing,
    incompleteRender: extracted.pagination.incompleteRender,
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
        extractionMethod: 'dostuff_events',
        dostuffPagination: extracted.pagination,
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
      .map((e) => `${e.title} ${e.startDateTime ?? e.startDate ?? ''} ${e.eventUrl}`)
      .join('\n')
      .slice(0, 4000),
    responseStatus: status,
    changeSummary: explanation,
    metadata: {
      configuredUrl,
      lastResolvedUrl,
      extracted: recordsExtracted,
      created,
      verified,
      method: extracted.method,
      pagination: extracted.pagination,
    },
  });

  await recordSourceRun({
    watcherId,
    triggerType,
    finalFetchMethod: 'dostuff_events',
    itemCount: recordsExtracted,
    newCount: created,
    qualifiedCount: verified,
    metadata: {
      configuredUrl,
      lastResolvedUrl,
      outcome: healthStatus,
      inspectionSummary: explanation,
      method: extracted.method,
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
  };
}
