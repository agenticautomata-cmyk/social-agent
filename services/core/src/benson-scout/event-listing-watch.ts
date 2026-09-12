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
  findIcsUrlsInHtml,
  stableEventListingFingerprint,
  urlLooksLikeEventListing,
  type ExtractedEventListing,
} from './event-listing-extract.js';
import {
  buildTribeEventsCollectionUrl,
  discoverEventSources,
} from './event-source-discovery.js';
import { parseTribeEventsRestJson, type TribeEventsRestPayload } from './wordpress-tec-extract.js';

const FETCH_TIMEOUT_MS = 25_000;
const ICS_FETCH_TIMEOUT_MS = 12_000;
/** Bound per-event ICS fetches used only for UID enrichment after HTML yield. */
const MAX_ICS_ENRICH = 12;
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
    watcher.adapterType === 'wordpress_tec'
  ) {
    return true;
  }
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
  needsAdapter?: boolean;
  productionGroupCount?: number;
  /** Supported platform parsed successfully even if upcoming yield is zero. */
  supportedParseWithZeroUpcoming?: boolean;
  expiredRejected?: number;
  undatedLeads?: number;
  listingPlatform?: string | null;
}): { healthStatus: string; explanation: string; contentOutcome: string } {
  const {
    extracted,
    created,
    priorCapability,
    verified,
    needsAdapter,
    productionGroupCount,
    supportedParseWithZeroUpcoming,
    expiredRejected = 0,
    undatedLeads = 0,
    listingPlatform,
  } = input;
  const countLabel =
    productionGroupCount && productionGroupCount > 0
      ? `${productionGroupCount} production groups (${verified || extracted} performances)`
      : `${verified || extracted} verified event listings`;
  if (extracted > 0 && !priorCapability) {
    return {
      healthStatus: 'healthy',
      explanation: `Baseline created from ${countLabel}.`,
      contentOutcome: 'upcoming_events_found',
    };
  }
  if (extracted > 0 && created > 0) {
    return {
      healthStatus: 'healthy',
      explanation: `Recent check extracted ${countLabel}; ${created} were new.`,
      contentOutcome: 'upcoming_events_found',
    };
  }
  if (extracted > 0 && created === 0) {
    return {
      healthStatus: 'no_change',
      explanation: `Checked ${countLabel}; no changes found.`,
      contentOutcome: 'no_change',
    };
  }
  if (needsAdapter && extracted === 0) {
    return {
      healthStatus: 'needs_adapter',
      explanation:
        'Recognizable calendar surface detected, but no supported extractor produced verified events.',
      contentOutcome: 'no_upcoming_events',
    };
  }
  // Successful supported parse with zero upcoming — not no_yield.
  if (supportedParseWithZeroUpcoming && extracted === 0) {
    const platformNote = listingPlatform && listingPlatform !== 'none' ? ` (${listingPlatform})` : '';
    if (expiredRejected > 0 && undatedLeads === 0) {
      return {
        healthStatus: priorCapability ? 'no_change' : 'healthy',
        explanation: `Checked successfully. No upcoming dated events are currently published${platformNote} (${expiredRejected} expired listing${expiredRejected === 1 ? '' : 's'} detected).`,
        contentOutcome: 'expired_only',
      };
    }
    if (undatedLeads > 0) {
      return {
        healthStatus: priorCapability ? 'no_change' : 'healthy',
        explanation: `Checked successfully. Found ${undatedLeads} undated lead${undatedLeads === 1 ? '' : 's'} without a verifiable upcoming date${platformNote}.`,
        contentOutcome: 'undated_leads_only',
      };
    }
    return {
      healthStatus: priorCapability ? 'no_change' : 'healthy',
      explanation: `Checked successfully. No upcoming dated events are currently published${platformNote}.`,
      contentOutcome: 'no_upcoming_events',
    };
  }
  if (priorCapability) {
    return {
      healthStatus: 'no_change',
      explanation: 'Checked current listings; no changes found.',
      contentOutcome: 'no_change',
    };
  }
  return {
    healthStatus: 'no_yield',
    explanation: 'Page responded, but no usable events were found.',
    contentOutcome: 'no_upcoming_events',
  };
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

function todayYmdLocal(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function fetchTribeEventsRest(
  restRoot: string,
): Promise<TribeEventsRestPayload | null> {
  const url = buildTribeEventsCollectionUrl(restRoot, {
    endsAfter: `${todayYmdLocal()} 00:00:00`,
    perPage: 50,
  });
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const text = await res.text();
    return parseTribeEventsRestJson(text);
  } catch {
    return null;
  }
}

function isCollectionIcsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const isIcalQuery = /[?&]ical=1\b/i.test(u.search) || /[?&]outlook-ical=1\b/i.test(u.search);
    const isIcsFile = /\.ics$/i.test(u.pathname);
    const isEventDetail =
      /\/event\/[^/]+/i.test(u.pathname) || /\/events\/[^/]+\/[^/]+/i.test(u.pathname);
    return (isIcalQuery || isIcsFile) && !isEventDetail;
  } catch {
    return /[?&]ical=1\b/i.test(url) || /\.ics(?:$|\?)/i.test(url);
  }
}

async function fetchIcsBodies(urls: string[]): Promise<Array<{ url: string; text: string }>> {
  const out: Array<{ url: string; text: string }> = [];
  for (const url of urls.slice(0, MAX_ICS_ENRICH)) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(ICS_FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/calendar, text/plain, */*',
        },
        redirect: 'follow',
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (/BEGIN:VCALENDAR/i.test(text) && /BEGIN:VEVENT/i.test(text)) {
        out.push({ url, text });
      }
    } catch {
      // Bounded enrichment — skip failures.
    }
  }
  return out;
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
    productionTitle: input.event.productionTitle ?? null,
    productionId: input.event.productionId ?? null,
    productionGroupKey: input.event.productionGroupKey ?? null,
    listingRole: input.event.listingRole ?? null,
    performanceLabel: input.event.performanceLabel ?? null,
    runStartDate: input.event.runStartDate ?? null,
    runEndDate: input.event.runEndDate ?? null,
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
        // Completed check ≠ successful extraction
        lastAttemptedCheck: now,
        healthStatus: 'no_yield',
        config: {
          ...priorConfig,
          lastResolvedUrl,
          reachability: 'reachable',
          statusExplanation: explanation,
          lastCheckOutcome: 'no_yield',
          lastCheckCompletedOk: true,
          lastCompletedCheckAt: now.toISOString(),
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

  const pageUrl = normalizedConfigured || configuredUrl;
  const discovery = discoverEventSources({ html: fetched.html, pageUrl });
  const effectiveExtractionUrl = discovery.effectiveExtractionUrl ?? pageUrl;

  // Prefer official TEC REST when advertised (includes currently-running productions).
  let tecRestPayload: TribeEventsRestPayload | null = null;
  if (discovery.tribeEventsRestUrl) {
    tecRestPayload = await fetchTribeEventsRest(discovery.tribeEventsRestUrl);
  }

  // When configured URL is a marketing hub (/shows/), fetch the effective calendar HTML.
  // Never swap away from a theater-season page that already carries production listings.
  let extractionHtml = fetched.html;
  let extractionPageUrl = pageUrl;
  const configuredIsTheaterSeason =
    /\/current-season\/?$/i.test(new URL(pageUrl).pathname) ||
    (/onthestage\.tickets\/show\//i.test(fetched.html) &&
      (/Show Dates/i.test(fetched.html) || /elementor-heading-title/i.test(fetched.html)));
  if (
    !tecRestPayload &&
    !configuredIsTheaterSeason &&
    discovery.effectiveExtractionUrl &&
    discovery.effectiveExtractionUrl.replace(/\/$/, '') !== pageUrl.replace(/\/$/, '')
  ) {
    const calendarFetch = await fetchWithFinalUrl(discovery.effectiveExtractionUrl);
    if (calendarFetch.ok && !looksBlocked(calendarFetch.html, calendarFetch.status)) {
      extractionHtml = calendarFetch.html;
      extractionPageUrl = discovery.effectiveExtractionUrl;
    }
  }

  const icsUrls = [
    ...findIcsUrlsInHtml(extractionHtml, extractionPageUrl),
    ...(discovery.icalFeedUrl ? [discovery.icalFeedUrl] : []),
  ];
  const uniqueIcs = [...new Set(icsUrls)];
  // Prefer a collection-level ICS when present; otherwise skip bulk fetch until after HTML.
  const collectionIcs = uniqueIcs.filter((u) => isCollectionIcsUrl(u));
  let icsBodies =
    collectionIcs.length > 0 ? await fetchIcsBodies(collectionIcs.slice(0, 3)) : [];

  let extracted = extractEventListingsFromHtml({
    html: extractionHtml,
    pageUrl: extractionPageUrl,
    icsBodies: icsBodies.length > 0 ? icsBodies : null,
    tecRestPayload,
  });

  // After Squarespace/HTML yield, bound-fetch per-event ICS for UID enrichment only.
  if (
    extracted.events.length > 0 &&
    extracted.method === 'squarespace_events' &&
    uniqueIcs.length > 0
  ) {
    const enrichUrls = extracted.events
      .map((e) => e.icsUrl)
      .filter((u): u is string => Boolean(u))
      .slice(0, MAX_ICS_ENRICH);
    if (enrichUrls.length > 0) {
      icsBodies = await fetchIcsBodies(enrichUrls);
      if (icsBodies.length > 0) {
        extracted = extractEventListingsFromHtml({
          html: extractionHtml,
          pageUrl: extractionPageUrl,
          icsBodies,
          tecRestPayload,
        });
      }
    }
  }

  // Zero HTML yield but per-event ICS available — try a bounded ICS-only pass.
  if (extracted.events.length === 0 && uniqueIcs.length > 0 && icsBodies.length === 0) {
    icsBodies = await fetchIcsBodies(uniqueIcs.slice(0, MAX_ICS_ENRICH));
    if (icsBodies.length > 0) {
      extracted = extractEventListingsFromHtml({
        html: extractionHtml,
        pageUrl: extractionPageUrl,
        icsBodies,
        tecRestPayload,
      });
    }
  }

  let created = 0;
  for (const event of extracted.events) {
    const outcome = await upsertListingScoutItem({ watcherId, event });
    if (outcome === 'created') created += 1;
  }

  const count = extracted.events.length;
  const verified = extracted.events.filter((e) => e.verificationState === 'verified').length;
  const productionGroupCount =
    extracted.method === 'theater_season'
      ? new Set(
          extracted.events
            .map((e) => e.productionGroupKey)
            .filter((k): k is string => Boolean(k)),
        ).size
      : 0;
  const priorCapability = Boolean(priorConfig.extractionCapabilityEstablished);
  const capabilityEstablished = priorCapability || count > 0;
  const detectedPlatform =
    extracted.events[0]?.platform ??
    (capability.hasWixEventsSignals || capability.isWixSite
      ? 'wix_events'
      : capability.hasSquarespaceEventsSignals
        ? 'squarespace_events'
        : capability.hasTheaterSeasonSignals
          ? 'theater_season'
          : capability.hasWordpressTecSignals || capability.hasWordpressEventMarkup
            ? 'wordpress_tec'
            : extracted.method);
  const supportedParseWithZeroUpcoming =
    count === 0 &&
    (capability.hasWixEventsSignals ||
      capability.isWixSite ||
      capability.hasSquarespaceEventsSignals ||
      capability.hasTheaterSeasonSignals ||
      capability.hasWordpressTecSignals ||
      capability.hasWordpressEventMarkup ||
      extracted.strategiesAttempted.length > 0) &&
    !extracted.rejectionReasons.some((r) => r.startsWith('needs_adapter'));
  const expiredRejected = Number(
    (extracted as { diagnostics?: { expiredRejected?: number } }).diagnostics?.expiredRejected ?? 0,
  );
  const undatedLeads = Number(
    (extracted as { diagnostics?: { undatedLeads?: number } }).diagnostics?.undatedLeads ?? 0,
  );
  const { healthStatus, explanation, contentOutcome } = statusExplanationFor({
    extracted: count,
    created,
    priorCapability,
    verified,
    needsAdapter: capability.needsAdapter || extracted.rejectionReasons.some((r) => r.startsWith('needs_adapter')),
    productionGroupCount: productionGroupCount > 0 ? productionGroupCount : undefined,
    supportedParseWithZeroUpcoming,
    expiredRejected,
    undatedLeads,
    listingPlatform: detectedPlatform,
  });

  // Prefer baseline language even when health is healthy for first yield.
  const nextConfig = {
    ...priorConfig,
    lastResolvedUrl,
    reachability: 'reachable' as WatchlistReachability,
    statusExplanation: explanation,
    contentOutcome,
    extractionCapabilityOutcome: supportedParseWithZeroUpcoming || count > 0 ? 'supported' : capability.needsAdapter ? 'needs_adapter' : priorConfig.extractionCapabilityOutcome ?? null,
    itemsProcessed: 1,
    recordsExtracted: count,
    newRecordsFound: created,
    verifiedYield: verified,
    expiredRejected,
    undatedLeads,
    productionGroupCount: productionGroupCount > 0 ? productionGroupCount : priorConfig.productionGroupCount ?? null,
    performanceCount: extracted.method === 'theater_season' ? count : priorConfig.performanceCount ?? null,
    listingDisplayMode: productionGroupCount > 0 ? 'production_groups' : priorConfig.listingDisplayMode ?? null,
    extractionCapabilityEstablished: capabilityEstablished || supportedParseWithZeroUpcoming,
    // Successful extraction ONLY when ≥1 verified/usable event persisted this check.
    lastSuccessfulExtractionAt:
      count > 0 ? now.toISOString() : priorConfig.lastSuccessfulExtractionAt ?? null,
    lastCheckCompletedOk: true,
    lastCompletedCheckAt: now.toISOString(),
    lastCheckOutcome: healthStatus,
    suppressSchedule: false,
    extractionMethod: extractionMethodLabel(extracted.method === 'none' ? detectedPlatform : extracted.method),
    rejectionReasons: extracted.rejectionReasons,
    strategiesAttempted: extracted.strategiesAttempted,
    listingCapability: capability,
    platformSupport: extracted.platformSupport,
    listingPlatform: detectedPlatform === 'none' ? priorConfig.listingPlatform ?? detectedPlatform : detectedPlatform,
    // Preserve operator-configured URL; record where extraction actually ran.
    configuredUrl,
    effectiveExtractionUrl,
    eventSourceDiscovery: {
      reasons: discovery.reasons,
      tribeEventsRestUrl: discovery.tribeEventsRestUrl,
      icalFeedUrl: discovery.icalFeedUrl,
      sourceKinds: discovery.sources.map((s) => s.kind),
    },
    tecRestUsed: Boolean(tecRestPayload && extracted.method === 'wordpress_tec_rest'),
  };

  await db
    .update(sourceWatchers)
    .set({
      sourceUrl: configuredUrl,
      // lastSuccessfulCheck remains "last completed ok check" for scheduler; UI must not
      // label it as successful extraction unless lastSuccessfulExtractionAt is set.
      lastSuccessfulCheck: now,
      lastAttemptedCheck: now,
      consecutiveFailureCount: 0,
      healthStatus,
      lastFailureAt: null,
      lastFailureMessage: null,
      lastNewItemDetected: created > 0 ? now : watcher.lastNewItemDetected,
      adapterType:
        watcher.adapterType === 'html_watch' ||
        watcher.adapterType === 'event_listing' ||
        watcher.adapterType === 'squarespace_events'
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
    finalFetchMethod:
      extracted.method === 'none'
        ? extractionMethodLabel(String(detectedPlatform))
        : extracted.method,
    itemCount: count,
    newCount: created,
    qualifiedCount: verified,
    metadata: {
      configuredUrl,
      lastResolvedUrl,
      outcome: healthStatus,
      inspectionSummary: explanation,
      method: extracted.method === 'none' ? detectedPlatform : extracted.method,
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
    method: extracted.method === 'none' ? String(detectedPlatform) : extracted.method,
    rejectionReasons: extracted.rejectionReasons,
  };
}
