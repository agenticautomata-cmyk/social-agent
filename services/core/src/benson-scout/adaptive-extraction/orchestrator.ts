/**
 * Central adaptive website extraction orchestrator (general public-website reader).
 *
 * Extends (does not replace) the capability ladder:
 * URL/policy → HTTP diagnose → surface discovery → platform recognition →
 * strategy plan → alternate first-party surfaces → adapters / feeds →
 * permitted browser → generic semantic → optional OCR (disabled) →
 * validation → change detection → retry policy.
 *
 * HTTP 403 is an acquisition observation, not an automatic terminal status.
 * Failed configured URL → investigate same-publisher public alternatives.
 */

import {
  detectEventListingCapability,
  extractEventListingsFromHtml,
  findIcsUrlsInHtml,
  htmlLooksLikeIncompleteWixEventRender,
  stableEventListingFingerprint,
  type ExtractedEventListing,
} from '../event-listing-extract.js';
import { discoverEventSources, buildTribeEventsCollectionUrl } from '../event-source-discovery.js';
import { parseTribeEventsRestJson, type TribeEventsRestPayload } from '../wordpress-tec-extract.js';
import {
  planHtmlCalendarPageFetches,
  htmlLooksLikeDateGroupedCalendar,
} from '../html-calendar-extract.js';
import { diagnoseAcquisition, acquisitionSummary } from './acquisition.js';
import { fetchPublicBrowserHtml, htmlLooksLikeChallenge } from './browser-fallback.js';
import { detectExtractionChange } from './change-detection.js';
import { bodyLooksLikeFeed, extractEventsFromFeedXml } from './feed-extract.js';
import {
  detectRhpEventsSignals,
  recognizePlatforms,
  selectPreferredPlatform,
} from './platform-registry.js';
import { buildRetryState, readRetryState } from './retry-policy.js';
import { extractRhpEventListings } from './rhp-events-extract.js';
import { planExtractionStrategies } from './strategy-planner.js';
import {
  emptyStrategyProfile,
  readStrategyProfile,
  updateStrategyProfile,
} from './strategy-memory.js';
import {
  discoverPublicSurfaces,
  extractCollectionUrlsFromSitemapXml,
  extractEventUrlsFromSitemapXml,
  sitemapChildLocs,
  sitemapSuggestsRhpEvents,
} from './surface-discovery.js';
import { mergeSurfaces, recordSurfaceAttempt, summarizeSurfaceGraph } from './surface-graph.js';
import type {
  AdaptiveDiagnostics,
  AdaptiveExtractionResult,
  AdaptiveExtractionStatus,
  AdaptiveStrategyProfile,
  DiscoveredSurface,
  DiscoveredSurfaceKind,
  PlannedStrategy,
  StrategyStep,
  SurfaceAttempt,
} from './types.js';
import { validateExtractedEvents } from './validation.js';

const FETCH_TIMEOUT_MS = 25_000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; BensonWatchlist/1.0; +https://benson.kckellie.com)';
const MAX_ALTERNATE_FETCHES = 14;
const MAX_EVENT_DETAIL_FETCHES = 5;
const MAX_SITEMAP_CHILD_FETCHES = 6;
/** Page 1 + additional numbered/next pages for SSR date-grouped calendars. */
const MAX_HTML_CALENDAR_PAGES = 5;
const MAX_HTML_CALENDAR_OCCURRENCES = 220;
const HTML_CALENDAR_PAGE_GAP_MS = 2_500;

export type OrchestratorFetchResult = {
  ok: boolean;
  status: number;
  html: string;
  finalUrl: string;
  contentType: string | null;
  headers: Record<string, string>;
  redirectChain: string[];
  error?: string;
};

export type AdaptiveOrchestratorDeps = {
  fetchText?: (url: string) => Promise<OrchestratorFetchResult>;
  browserFetch?: (url: string) => Promise<{
    ok: boolean;
    html: string | null;
    finalUrl: string | null;
    status: number | null;
    blocked: boolean;
    challengeProvider: string | null;
    incompleteRender: boolean;
    reason: string | null;
  }>;
  now?: Date;
};

async function defaultFetchText(url: string): Promise<OrchestratorFetchResult> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
      },
      redirect: 'follow',
    });
    const html = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return {
      ok: res.ok,
      status: res.status,
      html,
      finalUrl: res.url || url,
      contentType: res.headers.get('content-type'),
      headers,
      redirectChain: res.url && res.url !== url ? [url, res.url] : [url],
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      html: '',
      finalUrl: url,
      contentType: null,
      headers: {},
      redirectChain: [url],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function engagementStats(events: ExtractedEventListing[]): {
  groups: number;
  occurrences: number;
} {
  const keys = new Set(
    events.map((e) => e.productionGroupKey || e.companionGroupKey || e.externalId || e.title),
  );
  return { groups: keys.size, occurrences: events.length };
}

function explainStatus(input: {
  status: AdaptiveExtractionStatus;
  acquisitionSummary: string;
  method: string | null;
  platform: string | null;
  groups: number;
  occurrences: number;
  failedStage: StrategyStep | null;
  failureReason: string | null;
  fallbackResult: string | null;
  surfacesAttempted: number;
}): string {
  const base = [
    input.acquisitionSummary,
    input.platform ? `platform ${input.platform}` : null,
    input.method ? `method ${input.method}` : null,
    input.fallbackResult ? `fallback ${input.fallbackResult}` : null,
    `${input.surfacesAttempted} surfaces probed`,
    `${input.groups} groups / ${input.occurrences} occurrences`,
  ]
    .filter(Boolean)
    .join(' · ');

  switch (input.status) {
    case 'healthy':
      return `Extraction healthy — ${base}`;
    case 'no_change':
      return `No material change — ${base}`;
    case 'empty_confirmed':
      return `Calendar empty/confirmed past-only — ${base}`;
    case 'complete_no_current_events':
      return `Complete — no current upcoming events — ${base}`;
    case 'needs_adapter':
      return `Recognized surface needs adapter — ${base}`;
    case 'structure_changed':
      return `Structure/yield changed vs last healthy — ${base}`;
    case 'blocked':
      return `Blocked by public-access control (${input.failureReason ?? 'challenge'}) — ${base}`;
    case 'rate_limited':
      return `Rate limited — ${base}`;
    case 'partial':
      return `Partial extraction — ${base}`;
    case 'duplicate_source':
      return `Duplicate source of a stronger watcher — ${base}`;
    case 'superseded':
      return `Superseded by a more authoritative source — ${base}`;
    case 'misconfigured':
      return `Misconfigured source type or URL — ${base}`;
    case 'operator_paused':
      return `Operator paused — ${base}`;
    case 'failed':
    default:
      return `Extraction failed at ${input.failedStage ?? 'unknown'}: ${input.failureReason ?? 'error'} — ${base}`;
  }
}

function buildDiagnostics(input: {
  result: Omit<AdaptiveExtractionResult, 'diagnostics'>;
}): AdaptiveDiagnostics {
  const r = input.result;
  const technical = [
    ...summarizeSurfaceGraph(r.surfaceAttempts),
    ...r.plannedStrategies
      .filter((p) => p.reasonRejected)
      .slice(0, 8)
      .map((p) => `rejected:${p.id}:${p.reasonRejected}`),
    ...(r.changeDetection?.signals ?? []).map((s) => `change:${s}`),
  ];
  return {
    configuredUrl: r.configuredUrl,
    finalUrl: r.finalUrl,
    canonicalUrl: r.canonicalUrl,
    platform: r.selectedPlatform?.signature ?? null,
    httpResult: r.httpResult,
    challengeProvider: r.acquisition.challengeProvider,
    discoveredSurfaces: r.surfaces,
    surfaceAttempts: r.surfaceAttempts,
    selectedStrategy: r.selectedMethod,
    plannedStrategies: r.plannedStrategies,
    fallbacks: r.fallbackResult ? [r.fallbackResult] : [],
    groups: r.engagementGroupCount,
    occurrences: r.occurrenceCount,
    accepted: r.acceptedCount,
    quarantined: r.quarantinedCount,
    failedStage: r.failedStage,
    blocker: r.failureReason ?? r.acquisition.challengeProvider,
    lastHealthyAt: r.retry?.lastHealthyAt ?? null,
    freshness: r.changeDetection?.freshnessStatus ?? null,
    nextRetryAt: r.retry?.nextRetryAt ?? null,
    retry: r.retry,
    profileConfidence: r.profile?.confidence ?? null,
    conciseSummary: r.statusExplanation,
    technicalDetails: technical,
  };
}

function extractFromHtmlBundle(input: {
  html: string;
  pageUrl: string;
  configuredUrl?: string | null;
  now: Date;
  icsBodies?: Array<{ url: string; text: string }> | null;
  tecRestPayload?: TribeEventsRestPayload | null;
  playwrightHtml?: string | null;
}): { events: ExtractedEventListing[]; method: string | null; strategies: string[] } {
  const strategies: string[] = [];
  let events: ExtractedEventListing[] = [];
  let method: string | null = null;
  const configuredUrl = input.configuredUrl ?? input.pageUrl;

  if (detectRhpEventsSignals(input.html)) {
    const rhp = extractRhpEventListings({
      html: input.html,
      pageUrl: input.pageUrl,
      now: input.now,
    });
    if (rhp.events.length) {
      events = rhp.events.map((ev) => ({
        ...ev,
        configuredUrl,
        effectiveExtractionUrl: input.pageUrl,
      }));
      method = 'wordpress_rhp_events';
      strategies.push('wordpress_rhp_events');
      return { events, method, strategies };
    }
  }

  if (input.html.trim() && !htmlLooksLikeChallenge(input.html)) {
    const extracted = extractEventListingsFromHtml({
      html: input.html,
      pageUrl: input.pageUrl,
      playwrightHtml: input.playwrightHtml ?? null,
      icsBodies: input.icsBodies ?? null,
      tecRestPayload: input.tecRestPayload ?? null,
      now: input.now,
      configuredUrl,
    });
    events = extracted.events.map((ev) => ({
      ...ev,
      configuredUrl: ev.configuredUrl ?? configuredUrl,
      effectiveExtractionUrl: ev.effectiveExtractionUrl ?? input.pageUrl,
    }));
    method = extracted.method === 'none' ? null : extracted.method;
    strategies.push(...extracted.strategiesAttempted);
  }

  return { events, method, strategies };
}

/**
 * Pure-ish orchestration over provided HTML/sitemap/alternate bodies (unit-test friendly).
 */
export function runAdaptiveExtractionFromArtifacts(input: {
  configuredUrl: string;
  httpStatus: number;
  html: string;
  finalUrl?: string | null;
  contentType?: string | null;
  headers?: Record<string, string> | null;
  sitemapXml?: string | null;
  robotsTxt?: string | null;
  browserHtml?: string | null;
  browserBlocked?: boolean;
  browserChallengeProvider?: string | null;
  browserReason?: string | null;
  icsBodies?: Array<{ url: string; text: string }> | null;
  tecRestPayload?: TribeEventsRestPayload | null;
  /** Alternate first-party surface fetch results (feeds, calendar, details). */
  alternateBodies?: Array<{
    url: string;
    kind?: string;
    status: number;
    body: string;
    contentType?: string | null;
    headers?: Record<string, string> | null;
  }> | null;
  priorConfig?: Record<string, unknown> | null;
  operatorPaused?: boolean;
  now?: Date;
}): AdaptiveExtractionResult {
  const now = input.now ?? new Date();
  const retrievedAt = now.toISOString();
  const strategiesAttempted: string[] = ['url_policy', 'http_acquisition'];
  let failedStage: StrategyStep | null = null;
  let failureReason: string | null = null;
  let fallbackResult: string | null = null;
  const surfaceAttempts: SurfaceAttempt[] = [];

  const acquisition = diagnoseAcquisition({
    configuredUrl: input.configuredUrl,
    finalUrl: input.finalUrl ?? input.configuredUrl,
    status: input.httpStatus,
    html: input.html,
    contentType: input.contentType,
    headers: input.headers,
  });
  const httpResult = acquisitionSummary(acquisition);

  surfaceAttempts.push(
    recordSurfaceAttempt({
      url: input.configuredUrl,
      kind: 'configured_url',
      discoveryMethod: 'configured',
      httpStatus: input.httpStatus,
      contentType: input.contentType ?? null,
      acquisitionKind: acquisition.kind,
      challengeProvider: acquisition.challengeProvider,
      usefulness:
        acquisition.kind === 'challenge' || acquisition.kind === 'access_control'
          ? 'challenge'
          : acquisition.usefulEventContentLikely
            ? 'structured_useful'
            : acquisition.kind === 'empty'
              ? 'empty'
              : 'discovery_only',
      notes: [httpResult],
    }),
  );

  strategiesAttempted.push('surface_discovery', 'platform_recognition');
  let platforms = recognizePlatforms({
    html:
      acquisition.kind === 'challenge' || acquisition.kind === 'access_control'
        ? ''
        : input.html,
    pageUrl: input.configuredUrl,
    sitemapXml: input.sitemapXml,
    acquisitionKind: acquisition.kind,
  });

  let surfaces: DiscoveredSurface[] = discoverPublicSurfaces({
    configuredUrl: input.configuredUrl,
    html:
      acquisition.kind === 'challenge' || acquisition.kind === 'access_control'
        ? ''
        : input.html,
    sitemapIndexXml: input.sitemapXml,
    robotsTxt: input.robotsTxt,
    platformSignature: platforms[0]?.signature ?? null,
  });

  // Re-recognize after sitemap-enriched discovery when HTML was empty.
  if (input.sitemapXml && sitemapSuggestsRhpEvents(input.sitemapXml)) {
    platforms = recognizePlatforms({
      html: input.html,
      pageUrl: input.configuredUrl,
      sitemapXml: input.sitemapXml,
      acquisitionKind: acquisition.kind,
    });
    surfaces = mergeSurfaces(
      surfaces,
      discoverPublicSurfaces({
        configuredUrl: input.configuredUrl,
        sitemapIndexXml: input.sitemapXml,
        robotsTxt: input.robotsTxt,
        platformSignature: platforms[0]?.signature ?? null,
      }),
    );
  }

  strategiesAttempted.push('strategy_plan');
  const prior = readStrategyProfile(input.priorConfig ?? null);
  const plannedStrategies: PlannedStrategy[] = planExtractionStrategies({
    configuredUrl: input.configuredUrl,
    surfaces,
    platforms,
    priorProfile: prior,
    acquisitionChallenged:
      acquisition.kind === 'challenge' ||
      acquisition.kind === 'access_control' ||
      acquisition.http403,
  });

  let workingHtml = input.html;
  let events: ExtractedEventListing[] = [];
  let selectedMethod: string | null = null;
  const alternateCandidates: Array<{
    events: ExtractedEventListing[];
    method: string | null;
    trust: number;
    url: string;
  }> = [];

  // Alternate surface bodies — collect candidates; do not override primary yet.
  if (input.alternateBodies?.length) {
    strategiesAttempted.push('alternate_surface_fetch');
    for (const alt of input.alternateBodies) {
      const altObs = diagnoseAcquisition({
        configuredUrl: alt.url,
        finalUrl: alt.url,
        status: alt.status,
        html: alt.body,
        contentType: alt.contentType,
        headers: alt.headers,
      });
      let altEvents: ExtractedEventListing[] = [];
      let altMethod: string | null = null;
      let trust = 1;

      if (bodyLooksLikeFeed(alt.body, alt.contentType) && alt.status >= 200 && alt.status < 400) {
        const feed = extractEventsFromFeedXml({
          xml: alt.body,
          feedUrl: alt.url,
          sourceUrl: input.configuredUrl,
          now,
        });
        altEvents = feed.events;
        altMethod = feed.method;
        // Blog/CPT feeds are lower trust than structured ICS / collection HTML.
        trust = altMethod === 'rss_feed' || altMethod === 'atom_feed' ? 2 : 3;
        strategiesAttempted.push(feed.method);
      } else if (
        alt.status >= 200 &&
        alt.status < 400 &&
        alt.body.trim() &&
        !htmlLooksLikeChallenge(alt.body)
      ) {
        const bundle = extractFromHtmlBundle({
          html: alt.body,
          pageUrl: alt.url,
          configuredUrl: input.configuredUrl,
          now,
          icsBodies: input.icsBodies,
          tecRestPayload: input.tecRestPayload,
        });
        altEvents = bundle.events;
        altMethod = bundle.method;
        strategiesAttempted.push(...bundle.strategies);
        if (altMethod === 'direct_ics' || altMethod === 'wordpress_tec_rest') trust = 10;
        else if (alt.kind === 'calendar_collection' || alt.kind === 'canonical_events_archive') trust = 8;
        else if (alt.kind === 'event_detail_urls') trust = 3;
        else if (altMethod) trust = 5;
        if (altEvents.length && (!workingHtml || htmlLooksLikeChallenge(workingHtml))) {
          workingHtml = alt.body;
        }
      }

      surfaceAttempts.push(
        recordSurfaceAttempt({
          url: alt.url,
          kind: (alt.kind as DiscoveredSurfaceKind) || 'same_origin_semantic',
          discoveryMethod: 'alternate_body_fixture',
          httpStatus: alt.status,
          contentType: alt.contentType ?? null,
          acquisitionKind: altObs.kind,
          challengeProvider: altObs.challengeProvider,
          usefulness:
            altEvents.length > 0
              ? 'events_extracted'
              : altObs.kind === 'challenge'
                ? 'challenge'
                : alt.body.trim()
                  ? 'empty'
                  : 'error',
          eventCount: altEvents.length,
          notes: altMethod ? [`method:${altMethod}`] : [],
        }),
      );

      if (altEvents.length > 0) {
        alternateCandidates.push({
          events: altEvents,
          method: altMethod,
          trust: trust * 1000 + altEvents.length,
          url: alt.url,
        });
      }
    }
  }

  const needsBrowser =
    events.length === 0 &&
    (acquisition.kind === 'challenge' ||
      acquisition.kind === 'access_control' ||
      acquisition.http403 ||
      acquisition.kind === 'js_shell' ||
      (platforms[0]?.signature === 'wordpress_rhp_events' &&
        !detectRhpEventsSignals(workingHtml)));

  const preferProvidedBrowser =
    Boolean(input.browserHtml) &&
    !input.browserBlocked &&
    !htmlLooksLikeChallenge(input.browserHtml ?? '') &&
    Boolean(input.browserHtml?.trim()) &&
    (needsBrowser ||
      htmlLooksLikeIncompleteWixEventRender(workingHtml) ||
      detectEventListingCapability(workingHtml, input.configuredUrl).isWixSite ||
      detectEventListingCapability(workingHtml, input.configuredUrl).hasWixEventsSignals);

  if (needsBrowser || preferProvidedBrowser) {
    strategiesAttempted.push('browser_fallback');
    if (input.browserHtml != null) {
      if (input.browserBlocked || htmlLooksLikeChallenge(input.browserHtml)) {
        if (needsBrowser) {
          fallbackResult = `blocked:${input.browserChallengeProvider ?? 'challenge'}`;
          failedStage = 'browser_fallback';
          failureReason = input.browserReason ?? fallbackResult;
          surfaceAttempts.push(
            recordSurfaceAttempt({
              url: input.configuredUrl,
              kind: 'browser_document',
              discoveryMethod: 'permitted_browser',
              httpStatus: null,
              acquisitionKind: 'challenge',
              challengeProvider: input.browserChallengeProvider,
              usefulness: 'challenge',
              notes: [failureReason ?? 'browser_blocked'],
            }),
          );
        }
      } else if (input.browserHtml.trim() && (needsBrowser || preferProvidedBrowser)) {
        workingHtml = input.browserHtml;
        fallbackResult = 'browser_html_ok';
        surfaces = mergeSurfaces(surfaces, [
          {
            kind: 'browser_document',
            url: input.finalUrl ?? input.configuredUrl,
            evidence: ['permitted_browser_render'],
            sameOrigin: true,
            publiclyFetchable: true,
            discoveryMethod: 'permitted_browser',
          },
        ]);
        platforms = recognizePlatforms({
          html: workingHtml,
          pageUrl: input.configuredUrl,
          sitemapXml: input.sitemapXml,
          acquisitionKind: 'useful_html',
        });
      } else if (needsBrowser) {
        fallbackResult = input.browserReason ?? 'browser_empty';
      }
    } else if (needsBrowser) {
      fallbackResult = 'browser_not_attempted_in_artifacts_mode';
    }
  }

  const selectedPlatform = selectPreferredPlatform(platforms);
  strategiesAttempted.push('adapter_extract', 'structured_data');
  const capability = detectEventListingCapability(workingHtml, input.configuredUrl);

  // Always attempt primary/working HTML extraction first (collection authority).
  {
    const bundle = extractFromHtmlBundle({
      html: workingHtml,
      pageUrl: input.configuredUrl,
      configuredUrl: input.configuredUrl,
      now,
      icsBodies: input.icsBodies,
      tecRestPayload: input.tecRestPayload,
      playwrightHtml: fallbackResult === 'browser_html_ok' ? workingHtml : null,
    });
    if (bundle.events.length > 0) {
      events = bundle.events;
      selectedMethod = bundle.method ?? selectedMethod;
    }
    strategiesAttempted.push(...bundle.strategies);
  }

  // Prefer stronger alternate only when it clearly beats primary (ICS/TEC/collection),
  // or when primary yielded nothing.
  if (alternateCandidates.length) {
    alternateCandidates.sort((a, b) => b.trust - a.trust);
    const best = alternateCandidates[0]!;
    const primaryTrust =
      selectedMethod === 'direct_ics' || selectedMethod === 'wordpress_tec_rest'
        ? 10_000 + events.length
        : selectedMethod === 'theater_season' || selectedMethod === 'wix_events_hydration'
          ? 8_000 + events.length
          : selectedMethod === 'wordpress_rhp_events' || selectedMethod === 'squarespace_events'
            ? 7_500 + events.length
            : selectedMethod === 'json_ld'
              ? 6_000 + events.length
              : events.length > 0
                ? 4_000 + events.length
                : 0;
    if (events.length === 0 || best.trust > primaryTrust) {
      // Do not let a thin RSS / single detail page displace a richer primary collection.
      const isWeakFeed =
        (best.method === 'rss_feed' || best.method === 'atom_feed') &&
        events.length > 0 &&
        best.events.length <= events.length;
      // Do not let a later HTML-calendar page replace page-1 authority — merge instead.
      const isHtmlCalendarPage =
        events.length > 0 &&
        selectedMethod === 'semantic_html_blocks' &&
        best.method === 'semantic_html_blocks' &&
        (/\/page\/\d+/i.test(best.url) ||
          // Sibling category/filter calendars must not displace the configured collection.
          /\/events?\/(?:type|category|tag|topics?)\//i.test(best.url));
      if (!isWeakFeed && !isHtmlCalendarPage) {
        events = best.events;
        selectedMethod = best.method;
      }
    }
  }

  // Merge bounded HTML-calendar pagination pages into the primary date-grouped yield
  // (do not replace page-1 authority with a single later page).
  let htmlCalendarPagesMerged = 0;
  let htmlCalendarTruncated = false;
  if (
    events.length > 0 &&
    (selectedMethod === 'semantic_html_blocks' || capability.hasDateGroupedHtmlCalendar)
  ) {
    const seen = new Set(events.map((e) => stableEventListingFingerprint(e)));
    for (const alt of alternateCandidates) {
      // Only merge numbered collection pages — not sibling category/filter calendars.
      if (!/\/page\/\d+/i.test(alt.url)) continue;
      if (alt.url.replace(/\/$/, '') === input.configuredUrl.replace(/\/$/, '')) continue;
      htmlCalendarPagesMerged += 1;
      for (const ev of alt.events) {
        const fp = stableEventListingFingerprint(ev);
        if (seen.has(fp)) continue;
        seen.add(fp);
        events.push(ev);
      }
    }
    if (events.length > MAX_HTML_CALENDAR_OCCURRENCES) {
      events = events.slice(0, MAX_HTML_CALENDAR_OCCURRENCES);
      htmlCalendarTruncated = true;
    }
  }

  // Surface attempt notes for pagination merges.
  if (htmlCalendarPagesMerged > 0 || htmlCalendarTruncated) {
    surfaceAttempts.push(
      recordSurfaceAttempt({
        url: input.configuredUrl,
        kind: 'calendar_collection',
        discoveryMethod: 'html_calendar_pagination',
        httpStatus: input.httpStatus,
        usefulness: 'events_extracted',
        eventCount: events.length,
        notes: [
          `html_calendar_pages_merged:${htmlCalendarPagesMerged}`,
          htmlCalendarTruncated
            ? `occurrence_cap:${MAX_HTML_CALENDAR_OCCURRENCES}`
            : 'occurrence_cap:ok',
        ],
      }),
    );
  }

  strategiesAttempted.push('image_ocr');
  // OCR disabled by default — no billable AI; record skip.
  strategiesAttempted.push('validation');
  const visibleEventsUnparsed =
    events.length === 0 &&
    !htmlLooksLikeChallenge(workingHtml) &&
    (capability?.looksLikeEventListing ||
      capability?.hasRepeatedEventBlocks ||
      /eventlist|upcoming events|tribe-events|rhp-events/i.test(workingHtml));

  const validation = validateExtractedEvents({
    events,
    visibleEventsUnparsed,
    pageHadFutureEventsLikely: visibleEventsUnparsed,
    priorHealthyFingerprint:
      typeof input.priorConfig?.adaptiveContentFingerprint === 'string'
        ? (input.priorConfig.adaptiveContentFingerprint as string)
        : null,
    priorEventCount:
      typeof input.priorConfig?.recordsExtracted === 'number'
        ? (input.priorConfig.recordsExtracted as number)
        : null,
    now,
  });

  let status: AdaptiveExtractionStatus = 'failed';
  if (input.operatorPaused) {
    status = 'operator_paused';
    failedStage = 'persist';
    failureReason = 'operator_paused';
  } else if (
    validation.accepted.length === 0 &&
    (acquisition.kind === 'challenge' || acquisition.kind === 'access_control') &&
    (fallbackResult?.startsWith('blocked:') ||
      failureReason?.includes('blocked') ||
      (needsBrowser &&
        (fallbackResult === 'browser_not_attempted_in_artifacts_mode' ||
          Boolean(input.browserBlocked) ||
          Boolean(input.browserHtml && htmlLooksLikeChallenge(input.browserHtml)))) ||
      surfaceAttempts.every(
        (a) =>
          a.usefulness === 'challenge' ||
          a.usefulness === 'discovery_only' ||
          a.usefulness === 'empty' ||
          a.usefulness === 'error' ||
          a.usefulness === 'skipped',
      ))
  ) {
    status = 'blocked';
    failedStage = failedStage ?? 'alternate_surface_fetch';
    failureReason =
      failureReason ??
      (acquisition.challengeProvider
        ? `challenge:${acquisition.challengeProvider}`
        : 'access_control_all_surfaces');
  } else if (acquisition.kind === 'rate_limited') {
    status = 'rate_limited';
    failedStage = 'http_acquisition';
    failureReason = 'rate_limited';
  } else if (validation.okForHealthy && validation.statusHint) {
    status = validation.statusHint;
  } else if (validation.statusHint) {
    status = validation.statusHint;
  } else if (
    selectedPlatform &&
    selectedPlatform.signature !== 'unknown' &&
    validation.accepted.length === 0 &&
    !htmlLooksLikeChallenge(workingHtml)
  ) {
    status = 'needs_adapter';
    failedStage = 'adapter_extract';
    failureReason = 'platform_recognized_no_yield';
  } else if (
    acquisition.kind === 'error' &&
    validation.accepted.length === 0 &&
    !acquisition.http403
  ) {
    status = 'failed';
    failedStage = 'http_acquisition';
    failureReason = acquisition.error ?? `HTTP ${acquisition.httpStatus}`;
  } else if (validation.accepted.length === 0) {
    if (acquisition.http403 || acquisition.kind === 'challenge') {
      status = 'blocked';
      failedStage = failedStage ?? 'alternate_surface_fetch';
      failureReason = failureReason ?? 'no_accepted_events_after_challenge';
    } else if (
      selectedPlatform?.signature === 'unknown' &&
      (capability?.looksLikeEventListing ||
        /\/(events?|shows?|calendar)\b/i.test(input.configuredUrl))
    ) {
      status = 'needs_adapter';
      failedStage = 'adapter_extract';
      failureReason = 'eventish_url_no_supported_extractor_yield';
    } else if (prior?.successCount || input.priorConfig?.extractionCapabilityEstablished) {
      status = 'no_change';
      failedStage = null;
      failureReason = null;
    } else {
      status = 'needs_adapter';
      failedStage = 'adapter_extract';
      failureReason = failureReason ?? 'no_accepted_events';
    }
  }

  const finalEvents = validation.accepted.length > 0 ? validation.accepted : [];
  const stats = engagementStats(finalEvents);
  const profileKey = selectedPlatform?.profileKey ?? 'unknown:v1';
  const signature = selectedPlatform?.signature ?? 'unknown';

  strategiesAttempted.push('change_detection');
  const changeDetection = detectExtractionChange({
    status,
    contentFingerprint: validation.contentFingerprint || null,
    priorFingerprint:
      typeof input.priorConfig?.adaptiveContentFingerprint === 'string'
        ? (input.priorConfig.adaptiveContentFingerprint as string)
        : prior?.pageStructureFingerprint ?? null,
    priorEventCount:
      typeof input.priorConfig?.recordsExtracted === 'number'
        ? (input.priorConfig.recordsExtracted as number)
        : null,
    currentEventCount: finalEvents.length,
    priorPlatform: prior?.platformSignature ?? null,
    currentPlatform: signature,
    acquisitionKind: acquisition.kind,
    challengeProvider: acquisition.challengeProvider,
    priorMethod: prior?.lastMethod ?? null,
    currentMethod: selectedMethod,
  });

  const profile: AdaptiveStrategyProfile = updateStrategyProfile({
    prior: prior ?? emptyStrategyProfile(signature, profileKey),
    signature,
    profileKey,
    method: selectedMethod,
    status,
    pageStructureFingerprint: validation.contentFingerprint || null,
    success: status === 'healthy' || status === 'no_change' || status === 'empty_confirmed',
    surfaceType: selectedMethod,
    discoveryPath: surfaces
      .slice(0, 5)
      .map((s) => s.kind)
      .join(','),
    evidenceQuality: finalEvents.length > 0 ? 0.7 : 0.25,
    occurrenceCount: stats.occurrences,
    now,
  });

  const priorRetry = readRetryState(input.priorConfig ?? null);
  const retry = buildRetryState({
    status,
    prior: priorRetry,
    challengeProvider: acquisition.challengeProvider,
    retryAfterSeconds: acquisition.retryAfterSeconds,
    operatorPaused: input.operatorPaused,
    httpStatus: acquisition.httpStatus,
    lastStrategy: selectedMethod,
    lastHealthyAt: priorRetry?.lastHealthyAt ?? prior?.lastVerifiedAt ?? null,
    now,
  });

  const statusExplanation = explainStatus({
    status,
    acquisitionSummary: httpResult,
    method: selectedMethod,
    platform: selectedPlatform?.signature ?? null,
    groups: stats.groups,
    occurrences: stats.occurrences,
    failedStage,
    failureReason,
    fallbackResult,
    surfacesAttempted: surfaceAttempts.length,
  });

  const partial: Omit<AdaptiveExtractionResult, 'diagnostics'> = {
    status,
    configuredUrl: input.configuredUrl,
    finalUrl: acquisition.finalUrl,
    canonicalUrl: acquisition.canonicalUrl,
    acquisition,
    surfaces,
    surfaceAttempts,
    platforms,
    selectedPlatform,
    selectedMethod,
    plannedStrategies,
    strategiesAttempted: [...new Set(strategiesAttempted)],
    failedStage,
    failureReason,
    httpResult,
    fallbackResult,
    events: finalEvents,
    engagementGroupCount: stats.groups,
    occurrenceCount: stats.occurrences,
    acceptedCount: validation.accepted.length,
    quarantinedCount: validation.quarantined.length,
    capability,
    profile,
    validationNotes: validation.notes,
    statusExplanation,
    retrievedAt,
    retry,
    changeDetection,
  };

  return {
    ...partial,
    diagnostics: buildDiagnostics({ result: partial }),
  };
}

/**
 * Live adaptive extraction for a configured Watchlist URL.
 * Preserves configured URL; explores bounded same-publisher public alternatives.
 */
export async function runAdaptiveWebsiteExtraction(
  configuredUrl: string,
  opts?: {
    priorConfig?: Record<string, unknown> | null;
    allowBrowser?: boolean;
    operatorPaused?: boolean;
    deps?: AdaptiveOrchestratorDeps;
  },
): Promise<AdaptiveExtractionResult> {
  const fetchText = opts?.deps?.fetchText ?? defaultFetchText;
  const browserFetch = opts?.deps?.browserFetch ?? fetchPublicBrowserHtml;
  const now = opts?.deps?.now ?? new Date();
  const allowBrowser = opts?.allowBrowser !== false;

  const primary = await fetchText(configuredUrl);
  const acquisitionProbe = diagnoseAcquisition({
    configuredUrl,
    finalUrl: primary.finalUrl,
    status: primary.status,
    html: primary.html,
    contentType: primary.contentType,
    headers: primary.headers,
    redirectChain: primary.redirectChain,
    error: primary.error,
  });

  // Robots + recursive sitemap discovery (often allowed under HTML challenge).
  let robotsTxt: string | null = null;
  const robots = await fetchText(new URL('/robots.txt', configuredUrl).href);
  if (robots.ok && !htmlLooksLikeChallenge(robots.html) && robots.html.length < 100_000) {
    robotsTxt = robots.html;
  }

  let sitemapXml = '';
  const sitemapSeeds = [
    new URL('/sitemap.xml', configuredUrl).href,
    new URL('/sitemap_index.xml', configuredUrl).href,
  ];
  if (robotsTxt) {
    for (const m of robotsTxt.matchAll(/sitemap:\s*(\S+)/gi)) {
      try {
        sitemapSeeds.push(new URL(m[1]!).href);
      } catch {
        /* ignore */
      }
    }
  }

  const fetchedSitemaps = new Set<string>();
  for (const sm of [...new Set(sitemapSeeds)].slice(0, 4)) {
    if (fetchedSitemaps.has(sm)) continue;
    const res = await fetchText(sm);
    fetchedSitemaps.add(sm);
    if (res.ok && /<sitemapindex|<urlset/i.test(res.html) && !htmlLooksLikeChallenge(res.html)) {
      sitemapXml += `\n${res.html}`;
      const children = sitemapChildLocs(res.html, configuredUrl)
        .filter((u) => /event|rhp|tribe|calendar|show|sitemap/i.test(u))
        .slice(0, MAX_SITEMAP_CHILD_FETCHES);
      for (const child of children) {
        if (fetchedSitemaps.has(child)) continue;
        fetchedSitemaps.add(child);
        const childRes = await fetchText(child);
        if (
          childRes.ok &&
          /<sitemapindex|<urlset/i.test(childRes.html) &&
          !htmlLooksLikeChallenge(childRes.html)
        ) {
          sitemapXml += `\n${childRes.html}`;
        }
      }
    }
  }
  const sitemapXmlOrNull = sitemapXml.trim() ? sitemapXml : null;

  // Early platform recognition from sitemap (even when HTML challenged).
  let earlyPlatforms = recognizePlatforms({
    html: htmlLooksLikeChallenge(primary.html) ? '' : primary.html,
    pageUrl: configuredUrl,
    sitemapXml: sitemapXmlOrNull,
    acquisitionKind: acquisitionProbe.kind,
  });

  let surfaces = discoverPublicSurfaces({
    configuredUrl,
    html: htmlLooksLikeChallenge(primary.html) ? '' : primary.html,
    sitemapIndexXml: sitemapXmlOrNull,
    robotsTxt,
    platformSignature: earlyPlatforms[0]?.signature ?? null,
  });

  // Also pull collection URLs explicitly from sitemap XML.
  if (sitemapXmlOrNull) {
    for (const url of extractCollectionUrlsFromSitemapXml(sitemapXmlOrNull, configuredUrl)) {
      surfaces = mergeSurfaces(surfaces, [
        {
          kind: 'calendar_collection',
          url,
          evidence: ['sitemap_declared_collection'],
          sameOrigin: true,
          publiclyFetchable: true,
          discoveryMethod: 'sitemap_collection',
          referringSurface: configuredUrl,
          selectionReason: `Site-declared collection in sitemap: ${url}`,
        },
      ]);
    }
    const eventUrls = extractEventUrlsFromSitemapXml(sitemapXmlOrNull, configuredUrl).slice(
      0,
      MAX_EVENT_DETAIL_FETCHES,
    );
    for (const url of eventUrls) {
      surfaces = mergeSurfaces(surfaces, [
        {
          kind: 'event_detail_urls',
          url,
          evidence: ['sitemap_event_url_sample'],
          sameOrigin: true,
          publiclyFetchable: true,
          discoveryMethod: 'sitemap_event_detail',
          referringSurface: configuredUrl,
          selectionReason: 'Bounded sample of sitemap-listed event detail pages',
        },
      ]);
    }
  }

  const planned = planExtractionStrategies({
    configuredUrl,
    surfaces,
    platforms: earlyPlatforms,
    priorProfile: readStrategyProfile(opts?.priorConfig ?? null),
    acquisitionChallenged:
      acquisitionProbe.kind === 'challenge' ||
      acquisitionProbe.kind === 'access_control' ||
      acquisitionProbe.http403,
  });

  // Fetch selected alternate surfaces (strict budget).
  const alternateBodies: Array<{
    url: string;
    kind?: string;
    status: number;
    body: string;
    contentType?: string | null;
    headers?: Record<string, string> | null;
  }> = [];

  const alternateCandidates = planned
    .filter((p) => p.selected && p.surfaceUrl && p.surfaceUrl !== configuredUrl)
    .filter((p) => p.methodHint !== 'discovery_only' && p.methodHint !== 'public_browser_render')
    .filter((p) => {
      try {
        const u = new URL(p.surfaceUrl!);
        // Skip pure fragment duplicates of the configured path.
        if (u.hash && u.href.replace(/#.*$/, '') === configuredUrl.replace(/#.*$/, '')) return false;
        return true;
      } catch {
        return true;
      }
    })
    .sort((a, b) => b.rank - a.rank)
    .slice(0, MAX_ALTERNATE_FETCHES);

  // When primary HTML is already useful, only probe structured/feed/calendar alternates
  // (not dozens of individual event detail pages).
  const primaryUseful =
    acquisitionProbe.usefulEventContentLikely &&
    !htmlLooksLikeChallenge(primary.html) &&
    !acquisitionProbe.http403;
  const filteredAlternates = primaryUseful
    ? alternateCandidates.filter((p) =>
        /ics|feed|structured|collection|tec_rest|wp_rest|canonical/i.test(p.methodHint),
      )
    : alternateCandidates;

  for (const plan of filteredAlternates) {
    const url = plan.surfaceUrl!;
    // Skip pure sitemap xml locs that aren't useful as HTML/feed targets
    if (/\.xml($|\?)/i.test(url) && /sitemap/i.test(url)) continue;
    const res = await fetchText(url);
    alternateBodies.push({
      url,
      kind: surfaces.find((s) => s.url === url)?.kind,
      status: res.status,
      body: res.html,
      contentType: res.contentType,
      headers: res.headers,
    });
  }

  let browserHtml: string | null = null;
  let browserBlocked = false;
  let browserChallengeProvider: string | null = null;
  let browserReason: string | null = null;

  const altHasUseful = alternateBodies.some(
    (b) =>
      b.status >= 200 &&
      b.status < 400 &&
      b.body.length > 1500 &&
      !htmlLooksLikeChallenge(b.body) &&
      (bodyLooksLikeFeed(b.body, b.contentType) ||
        detectRhpEventsSignals(b.body) ||
        detectEventListingCapability(b.body, b.url).looksLikeEventListing),
  );

  const shouldBrowser =
    allowBrowser &&
    !altHasUseful &&
    (acquisitionProbe.kind === 'challenge' ||
      acquisitionProbe.kind === 'access_control' ||
      acquisitionProbe.http403 ||
      acquisitionProbe.kind === 'js_shell' ||
      (primary.ok &&
        sitemapXmlOrNull &&
        sitemapSuggestsRhpEvents(sitemapXmlOrNull) &&
        !detectRhpEventsSignals(primary.html)));

  if (shouldBrowser) {
    const rendered = await browserFetch(configuredUrl);
    browserHtml = rendered.html;
    browserBlocked = rendered.blocked;
    browserChallengeProvider = rendered.challengeProvider;
    browserReason = rendered.reason;

    // If configured URL browser-blocked, try browser on best calendar collection alternate.
    if (browserBlocked) {
      const calendarAlt = alternateBodies.find(
        (b) =>
          /calendar|events|shows/i.test(b.url) &&
          (b.status === 403 || htmlLooksLikeChallenge(b.body)),
      );
      // Only retry browser on a different collection URL once.
      const collectionUrl = surfaces.find((s) => s.kind === 'calendar_collection')?.url;
      if (collectionUrl && collectionUrl !== configuredUrl) {
        const altBrowser = await browserFetch(collectionUrl);
        if (!altBrowser.blocked && altBrowser.html && !htmlLooksLikeChallenge(altBrowser.html)) {
          browserHtml = altBrowser.html;
          browserBlocked = false;
          browserChallengeProvider = null;
          browserReason = null;
          alternateBodies.push({
            url: collectionUrl,
            kind: 'browser_document',
            status: altBrowser.status ?? 200,
            body: altBrowser.html,
            contentType: 'text/html',
          });
        } else {
          alternateBodies.push({
            url: collectionUrl,
            kind: 'browser_document',
            status: altBrowser.status ?? 403,
            body: altBrowser.html ?? '',
            contentType: 'text/html',
          });
          void calendarAlt;
        }
      }
    }
  }

  let workingHtml =
    browserHtml && !browserBlocked && !htmlLooksLikeChallenge(browserHtml)
      ? browserHtml
      : primary.html;

  // Prefer useful alternate HTML when primary is challenged.
  if (htmlLooksLikeChallenge(workingHtml) || acquisitionProbe.http403) {
    const usefulAlt = alternateBodies.find(
      (b) =>
        b.status >= 200 &&
        b.status < 400 &&
        b.body.length > 1500 &&
        !htmlLooksLikeChallenge(b.body) &&
        !bodyLooksLikeFeed(b.body, b.contentType),
    );
    if (usefulAlt) workingHtml = usefulAlt.body;
  }

  let icsBodies: Array<{ url: string; text: string }> = [];
  let tecRestPayload: TribeEventsRestPayload | null = null;
  if (workingHtml && !htmlLooksLikeChallenge(workingHtml)) {
    const discovery = discoverEventSources({ html: workingHtml, pageUrl: configuredUrl });
    if (discovery.tribeEventsRestUrl) {
      const collectionUrl = buildTribeEventsCollectionUrl(discovery.tribeEventsRestUrl, {
        endsAfter: '2020-01-01 00:00:00',
        perPage: 50,
      });
      const rest = await fetchText(collectionUrl);
      if (rest.ok && !htmlLooksLikeChallenge(rest.html)) {
        tecRestPayload = parseTribeEventsRestJson(rest.html);
      }
    }
    const icsUrls = [
      ...findIcsUrlsInHtml(workingHtml, configuredUrl),
      ...(discovery.icalFeedUrl ? [discovery.icalFeedUrl] : []),
    ];
    for (const icsUrl of [...new Set(icsUrls)].slice(0, 8)) {
      const body = await fetchText(icsUrl);
      if (body.ok && /BEGIN:VCALENDAR/i.test(body.html) && /BEGIN:VEVENT/i.test(body.html)) {
        icsBodies.push({ url: icsUrl, text: body.html });
      }
    }

    if (
      allowBrowser &&
      !browserHtml &&
      (htmlLooksLikeIncompleteWixEventRender(workingHtml) ||
        detectEventListingCapability(workingHtml, configuredUrl).hasWixEventsSignals ||
        detectEventListingCapability(workingHtml, configuredUrl).isWixSite)
    ) {
      const preliminary = extractEventListingsFromHtml({
        html: workingHtml,
        pageUrl: configuredUrl,
        icsBodies: icsBodies.length ? icsBodies : null,
        tecRestPayload,
        now,
      });
      if (preliminary.events.length === 0) {
        const rendered = await browserFetch(configuredUrl);
        browserHtml = rendered.html;
        browserBlocked = rendered.blocked;
        browserChallengeProvider = rendered.challengeProvider;
        browserReason = rendered.reason;
        if (browserHtml && !browserBlocked && !htmlLooksLikeChallenge(browserHtml)) {
          workingHtml = browserHtml;
        }
      }
    }
  }

  // Bounded pagination for SSR date-grouped HTML calendars (numbered + next).
  // Always refresh page 1 (workingHtml). Use remaining budget from persisted cursor.
  let htmlCalendarPageFailure = false;
  let htmlCalendarPagesAttempted = 0;
  let htmlCalendarPagesCompleted = 0;
  let htmlCalendarPagesNewlyTraversed: number[] = [];
  let htmlCalendarCursorPage: number | null = null;
  let htmlCalendarTotalPagesDetected: number | null = null;
  let htmlCalendarCycleRestarted = false;
  if (
    primaryUseful &&
    workingHtml &&
    !htmlLooksLikeChallenge(workingHtml) &&
    htmlLooksLikeDateGroupedCalendar(workingHtml)
  ) {
    const priorCursor = Number(
      (opts?.priorConfig as Record<string, unknown> | undefined)?.htmlCalendarPaginationCursor ?? 0,
    );
    const plannedPages = planHtmlCalendarPageFetches({
      collectionUrl: configuredUrl,
      html: workingHtml,
      maxPages: MAX_HTML_CALENDAR_PAGES,
      resumeFromPage: priorCursor > 1 ? priorCursor : null,
    });
    htmlCalendarTotalPagesDetected = plannedPages.pagination.totalPages;
    if (priorCursor > 1 && plannedPages.resumeFromPage >= 1) {
      const firstPlanned = Number(plannedPages.pages[0]?.match(/\/page\/(\d+)/i)?.[1] ?? 0);
      if (firstPlanned === 2 && priorCursor >= (plannedPages.pagination.totalPages ?? priorCursor)) {
        htmlCalendarCycleRestarted = true;
      }
    }
    const paginationBodies: Array<{ body: string }> = [{ body: workingHtml }];
    let lastCompletedPage = 1;
    for (const pageUrl of plannedPages.pages) {
      if (htmlCalendarPagesCompleted + 1 >= MAX_HTML_CALENDAR_PAGES) break;
      htmlCalendarPagesAttempted += 1;
      if (htmlCalendarPagesAttempted > 1) {
        await new Promise((r) => setTimeout(r, HTML_CALENDAR_PAGE_GAP_MS));
      }
      const res = await fetchText(pageUrl);
      const pageNum = Number(pageUrl.match(/\/page\/(\d+)/i)?.[1] ?? 0);
      if (
        res.ok &&
        res.html.length > 1500 &&
        !htmlLooksLikeChallenge(res.html) &&
        htmlLooksLikeDateGroupedCalendar(res.html)
      ) {
        htmlCalendarPagesCompleted += 1;
        if (pageNum > 0) {
          htmlCalendarPagesNewlyTraversed.push(pageNum);
          lastCompletedPage = pageNum;
        }
        paginationBodies.push({ body: res.html });
        alternateBodies.push({
          url: pageUrl,
          kind: 'calendar_collection',
          status: res.status,
          body: res.html,
          contentType: res.contentType,
          headers: res.headers,
        });
      } else {
        htmlCalendarPageFailure = true;
        alternateBodies.push({
          url: pageUrl,
          kind: 'calendar_collection',
          status: res.status || 0,
          body: res.html || '',
          contentType: res.contentType,
          headers: res.headers,
        });
        // Stop following further pages after a failure (no loops / no skip-ahead).
        break;
      }
    }
    // Persist cursor at deepest newly completed page this run (page 1 always refreshed).
    htmlCalendarCursorPage =
      htmlCalendarPagesNewlyTraversed.length > 0
        ? Math.max(...htmlCalendarPagesNewlyTraversed)
        : priorCursor > 1
          ? priorCursor
          : lastCompletedPage;
    // If we completed through totalPages, mark full cycle and restart next time.
    if (
      htmlCalendarTotalPagesDetected &&
      htmlCalendarCursorPage >= htmlCalendarTotalPagesDetected
    ) {
      htmlCalendarCursorPage = htmlCalendarTotalPagesDetected;
    }
    void paginationBodies;
  }

  void earlyPlatforms;
  void planned;

  const result = runAdaptiveExtractionFromArtifacts({
    configuredUrl,
    httpStatus: primary.status,
    html: primary.html,
    finalUrl: primary.finalUrl,
    contentType: primary.contentType,
    headers: primary.headers,
    sitemapXml: sitemapXmlOrNull,
    robotsTxt,
    browserHtml,
    browserBlocked,
    browserChallengeProvider,
    browserReason,
    icsBodies: icsBodies.length ? icsBodies : null,
    tecRestPayload,
    alternateBodies: alternateBodies.length ? alternateBodies : null,
    priorConfig: opts?.priorConfig,
    operatorPaused: opts?.operatorPaused,
    now,
  });

  if (
    htmlCalendarPageFailure &&
    result.events.length > 0 &&
    (result.status === 'healthy' || result.status === 'no_change')
  ) {
    return {
      ...result,
      status: 'partial',
      failureReason: result.failureReason ?? 'html_calendar_pagination_page_failed',
      statusExplanation: `Partial extraction — HTML calendar pagination stopped after a failed page (${htmlCalendarPagesCompleted}/${htmlCalendarPagesAttempted} completed) · ${result.statusExplanation}`,
      diagnostics: {
        ...result.diagnostics,
        conciseSummary: `Partial — pagination page failed after ${htmlCalendarPagesCompleted} completed`,
        technicalDetails: [
          ...result.diagnostics.technicalDetails,
          `html_calendar_pages_attempted:${htmlCalendarPagesAttempted}`,
          `html_calendar_pages_completed:${htmlCalendarPagesCompleted}`,
          `html_calendar_pages_refreshed:1`,
          `html_calendar_pages_newly_traversed:${htmlCalendarPagesNewlyTraversed.join(',') || 'none'}`,
          `html_calendar_pagination_cursor:${htmlCalendarCursorPage ?? 'none'}`,
          `html_calendar_total_pages_detected:${htmlCalendarTotalPagesDetected ?? 'unknown'}`,
          htmlCalendarCycleRestarted ? 'html_calendar_cycle:restarted' : 'html_calendar_cycle:continuing',
          'html_calendar_pagination:partial_failure',
        ],
      },
    };
  }

  if (htmlCalendarPagesAttempted > 0 || htmlCalendarCursorPage != null) {
    return {
      ...result,
      statusExplanation: `${result.statusExplanation} · html_calendar_pages ${htmlCalendarPagesCompleted}/${htmlCalendarPagesAttempted} · cursor ${htmlCalendarCursorPage ?? 1}`,
      diagnostics: {
        ...result.diagnostics,
        technicalDetails: [
          ...result.diagnostics.technicalDetails,
          `html_calendar_pages_attempted:${htmlCalendarPagesAttempted}`,
          `html_calendar_pages_completed:${htmlCalendarPagesCompleted}`,
          `html_calendar_pages_refreshed:1`,
          `html_calendar_pages_newly_traversed:${htmlCalendarPagesNewlyTraversed.join(',') || 'none'}`,
          `html_calendar_pagination_cursor:${htmlCalendarCursorPage ?? 1}`,
          `html_calendar_total_pages_detected:${htmlCalendarTotalPagesDetected ?? 'unknown'}`,
          htmlCalendarCycleRestarted ? 'html_calendar_cycle:restarted' : 'html_calendar_cycle:continuing',
        ],
      },
    };
  }

  return result;
}

export { readStrategyProfile };
