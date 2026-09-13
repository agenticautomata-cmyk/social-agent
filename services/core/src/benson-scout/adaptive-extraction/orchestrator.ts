/**
 * Central adaptive website extraction orchestrator.
 *
 * Ordered capabilities: URL/policy → HTTP diagnose → surface discovery →
 * structured/platform recognition → adapters → permitted browser fallback →
 * validation. HTTP 403 is an acquisition observation, not an automatic terminal status.
 */

import {
  detectEventListingCapability,
  extractEventListingsFromHtml,
  findIcsUrlsInHtml,
  htmlLooksLikeIncompleteWixEventRender,
  type ExtractedEventListing,
} from '../event-listing-extract.js';
import { discoverEventSources } from '../event-source-discovery.js';
import { parseTribeEventsRestJson, type TribeEventsRestPayload } from '../wordpress-tec-extract.js';
import { diagnoseAcquisition, acquisitionSummary } from './acquisition.js';
import { fetchPublicBrowserHtml, htmlLooksLikeChallenge } from './browser-fallback.js';
import {
  detectRhpEventsSignals,
  recognizePlatforms,
  selectPreferredPlatform,
} from './platform-registry.js';
import { extractRhpEventListings } from './rhp-events-extract.js';
import {
  discoverPublicSurfaces,
  extractEventUrlsFromSitemapXml,
  sitemapSuggestsRhpEvents,
} from './surface-discovery.js';
import {
  emptyStrategyProfile,
  readStrategyProfile,
  updateStrategyProfile,
} from './strategy-memory.js';
import type {
  AdaptiveExtractionResult,
  AdaptiveExtractionStatus,
  AdaptiveStrategyProfile,
  DiscoveredSurface,
  StrategyStep,
} from './types.js';
import { validateExtractedEvents } from './validation.js';

const FETCH_TIMEOUT_MS = 25_000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; BensonWatchlist/1.0; +https://benson.kckellie.com)';

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
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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
}): string {
  const base = [
    input.acquisitionSummary,
    input.platform ? `platform ${input.platform}` : null,
    input.method ? `method ${input.method}` : null,
    input.fallbackResult ? `fallback ${input.fallbackResult}` : null,
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
    case 'failed':
    default:
      return `Extraction failed at ${input.failedStage ?? 'unknown'}: ${input.failureReason ?? 'error'} — ${base}`;
  }
}

/**
 * Pure-ish orchestration over provided HTML/sitemap (unit-test friendly).
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
  priorConfig?: Record<string, unknown> | null;
  now?: Date;
}): AdaptiveExtractionResult {
  const now = input.now ?? new Date();
  const retrievedAt = now.toISOString();
  const strategiesAttempted: string[] = ['url_policy', 'http_acquisition'];
  let failedStage: StrategyStep | null = null;
  let failureReason: string | null = null;
  let fallbackResult: string | null = null;

  const acquisition = diagnoseAcquisition({
    configuredUrl: input.configuredUrl,
    finalUrl: input.finalUrl ?? input.configuredUrl,
    status: input.httpStatus,
    html: input.html,
    contentType: input.contentType,
    headers: input.headers,
  });
  const httpResult = acquisitionSummary(acquisition);

  strategiesAttempted.push('surface_discovery');
  let surfaces: DiscoveredSurface[] = discoverPublicSurfaces({
    configuredUrl: input.configuredUrl,
    html: acquisition.kind === 'challenge' || acquisition.kind === 'access_control' ? '' : input.html,
    sitemapIndexXml: input.sitemapXml,
    robotsTxt: input.robotsTxt,
  });

  if (input.sitemapXml && sitemapSuggestsRhpEvents(input.sitemapXml)) {
    const eventUrls = extractEventUrlsFromSitemapXml(input.sitemapXml, input.configuredUrl);
    if (eventUrls.length) {
      surfaces = [
        ...surfaces,
        {
          kind: 'event_detail_urls',
          url: eventUrls[0]!,
          evidence: [`sitemap_event_urls:${eventUrls.length}`],
          sameOrigin: true,
          publiclyFetchable: true,
        },
      ];
    }
  }

  strategiesAttempted.push('platform_recognition');
  let workingHtml = input.html;
  let platforms = recognizePlatforms({
    html: workingHtml,
    pageUrl: input.configuredUrl,
    sitemapXml: input.sitemapXml,
    acquisitionKind: acquisition.kind,
  });

  // Browser fallback when HTTP challenge/403/js shell and caller supplied browser artifacts
  // (live path uses deps.browserFetch).
  const needsBrowser =
    acquisition.kind === 'challenge' ||
    acquisition.kind === 'access_control' ||
    acquisition.http403 ||
    acquisition.kind === 'js_shell' ||
    (acquisition.kind === 'useful_html' && detectRhpEventsSignals(workingHtml) === false && platforms[0]?.signature === 'wordpress_rhp_events');

  if (needsBrowser) {
    strategiesAttempted.push('browser_fallback');
    if (input.browserHtml != null) {
      if (input.browserBlocked || htmlLooksLikeChallenge(input.browserHtml)) {
        fallbackResult = `blocked:${input.browserChallengeProvider ?? 'challenge'}`;
        failedStage = 'browser_fallback';
        failureReason = input.browserReason ?? fallbackResult;
      } else if (input.browserHtml.trim()) {
        workingHtml = input.browserHtml;
        fallbackResult = 'browser_html_ok';
        surfaces = [
          ...surfaces,
          {
            kind: 'browser_document',
            url: input.finalUrl ?? input.configuredUrl,
            evidence: ['permitted_browser_render'],
            sameOrigin: true,
            publiclyFetchable: true,
          },
        ];
        platforms = recognizePlatforms({
          html: workingHtml,
          pageUrl: input.configuredUrl,
          sitemapXml: input.sitemapXml,
          acquisitionKind: 'useful_html',
        });
      } else {
        fallbackResult = input.browserReason ?? 'browser_empty';
      }
    } else {
      fallbackResult = 'browser_not_attempted_in_artifacts_mode';
    }
  }

  const selectedPlatform = selectPreferredPlatform(platforms);
  strategiesAttempted.push('adapter_extract', 'structured_data');

  let events: ExtractedEventListing[] = [];
  let selectedMethod: string | null = null;
  const capability = detectEventListingCapability(workingHtml, input.configuredUrl);

  if (selectedPlatform?.signature === 'wordpress_rhp_events' && detectRhpEventsSignals(workingHtml)) {
    const rhp = extractRhpEventListings({ html: workingHtml, pageUrl: input.configuredUrl, now });
    events = rhp.events;
    selectedMethod = events.length ? 'wordpress_rhp_events' : null;
    strategiesAttempted.push('wordpress_rhp_events');
  }

  if (events.length === 0 && workingHtml.trim() && !htmlLooksLikeChallenge(workingHtml)) {
    const extracted = extractEventListingsFromHtml({
      html: workingHtml,
      pageUrl: input.configuredUrl,
      playwrightHtml: fallbackResult === 'browser_html_ok' ? workingHtml : null,
      icsBodies: input.icsBodies ?? null,
      tecRestPayload: input.tecRestPayload ?? null,
      now,
    });
    events = extracted.events;
    selectedMethod = extracted.method === 'none' ? selectedMethod : extracted.method;
    strategiesAttempted.push(...extracted.strategiesAttempted);
  }

  strategiesAttempted.push('validation');
  const prior = readStrategyProfile(input.priorConfig ?? null);
  const validation = validateExtractedEvents({
    events,
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
  if (
    (acquisition.kind === 'challenge' || acquisition.kind === 'access_control') &&
    validation.accepted.length === 0 &&
    (fallbackResult?.startsWith('blocked:') ||
      failureReason?.includes('blocked') ||
      (needsBrowser &&
        (fallbackResult === 'browser_not_attempted_in_artifacts_mode' ||
          Boolean(input.browserBlocked) ||
          Boolean(input.browserHtml && htmlLooksLikeChallenge(input.browserHtml)))))
  ) {
    // Challenge/access-control with no accepted yield → blocked (not failed-on-403).
    status = 'blocked';
    failedStage = failedStage ?? 'browser_fallback';
    failureReason =
      failureReason ??
      (acquisition.challengeProvider
        ? `challenge:${acquisition.challengeProvider}`
        : 'access_control');
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
    // Reachable page with no parseable events: not a transport failure.
    if (acquisition.http403 || acquisition.kind === 'challenge') {
      status = 'blocked';
      failedStage = failedStage ?? 'browser_fallback';
      failureReason = failureReason ?? 'no_accepted_events_after_challenge';
    } else if (
      selectedPlatform?.signature === 'unknown' &&
      (capability?.looksLikeEventListing || /\/(events?|shows?|calendar)\b/i.test(input.configuredUrl))
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

  // Prefer validation-accepted events for reported yield.
  const finalEvents = validation.accepted.length > 0 ? validation.accepted : [];
  const stats = engagementStats(finalEvents);
  const profileKey = selectedPlatform?.profileKey ?? 'unknown:v1';
  const signature = selectedPlatform?.signature ?? 'unknown';
  const profile: AdaptiveStrategyProfile = updateStrategyProfile({
    prior: prior ?? emptyStrategyProfile(signature, profileKey),
    signature,
    profileKey,
    method: selectedMethod,
    status,
    pageStructureFingerprint: validation.contentFingerprint || null,
    success: status === 'healthy' || status === 'no_change' || status === 'empty_confirmed',
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
  });

  return {
    status,
    configuredUrl: input.configuredUrl,
    finalUrl: acquisition.finalUrl,
    canonicalUrl: acquisition.canonicalUrl,
    acquisition,
    surfaces,
    platforms,
    selectedPlatform,
    selectedMethod,
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
  };
}

/**
 * Live adaptive extraction for a configured Watchlist URL.
 * Preserves configured URL; resolves redirects only as observations.
 */
export async function runAdaptiveWebsiteExtraction(
  configuredUrl: string,
  opts?: {
    priorConfig?: Record<string, unknown> | null;
    allowBrowser?: boolean;
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

  // Always try public sitemap — often allowed when HTML is challenged.
  let sitemapXml: string | null = null;
  const sitemapUrls = [
    new URL('/sitemap.xml', configuredUrl).href,
    new URL('/sitemap_index.xml', configuredUrl).href,
  ];
  for (const sm of sitemapUrls) {
    const res = await fetchText(sm);
    if (res.ok && /<sitemapindex|<urlset/i.test(res.html)) {
      sitemapXml = res.html;
      // If index, fetch first eventish child
      if (/<sitemapindex/i.test(res.html) && /rhp_events/i.test(res.html)) {
        const child = res.html.match(/<loc>\s*([^<]*rhp_events[^<]*)\s*<\/loc>/i)?.[1];
        if (child) {
          const childRes = await fetchText(child.trim());
          if (childRes.ok && /<urlset/i.test(childRes.html)) {
            sitemapXml = `${res.html}\n${childRes.html}`;
          }
        }
      }
      break;
    }
  }

  let robotsTxt: string | null = null;
  const robots = await fetchText(new URL('/robots.txt', configuredUrl).href);
  if (robots.ok && !htmlLooksLikeChallenge(robots.html) && robots.html.length < 100_000) {
    robotsTxt = robots.html;
  }

  let browserHtml: string | null = null;
  let browserBlocked = false;
  let browserChallengeProvider: string | null = null;
  let browserReason: string | null = null;

  const shouldBrowser =
    allowBrowser &&
    (acquisitionProbe.kind === 'challenge' ||
      acquisitionProbe.kind === 'access_control' ||
      acquisitionProbe.http403 ||
      acquisitionProbe.kind === 'js_shell' ||
      (primary.ok &&
        sitemapXml &&
        sitemapSuggestsRhpEvents(sitemapXml) &&
        !detectRhpEventsSignals(primary.html)));

  if (shouldBrowser) {
    const rendered = await browserFetch(configuredUrl);
    browserHtml = rendered.html;
    browserBlocked = rendered.blocked;
    browserChallengeProvider = rendered.challengeProvider;
    browserReason = rendered.reason;
  }

  // Working HTML for discovery/adapters — prefer successful browser document.
  let workingHtml =
    browserHtml && !browserBlocked && !htmlLooksLikeChallenge(browserHtml)
      ? browserHtml
      : primary.html;

  // Same-origin event-source discovery + bounded public ICS / TEC REST (existing adapters).
  let icsBodies: Array<{ url: string; text: string }> = [];
  let tecRestPayload: TribeEventsRestPayload | null = null;
  if (workingHtml && !htmlLooksLikeChallenge(workingHtml)) {
    const discovery = discoverEventSources({ html: workingHtml, pageUrl: configuredUrl });
    if (discovery.tribeEventsRestUrl) {
      const rest = await fetchText(
        discovery.tribeEventsRestUrl.includes('?')
          ? `${discovery.tribeEventsRestUrl}${discovery.tribeEventsRestUrl.includes('ends_after') ? '' : '&ends_after=2020-01-01 00:00:00'}`
          : `${discovery.tribeEventsRestUrl}?per_page=50&ends_after=2020-01-01 00:00:00`,
      );
      if (rest.ok && !htmlLooksLikeChallenge(rest.html)) {
        tecRestPayload = parseTribeEventsRestJson(rest.html);
      }
    }
    const icsUrls = [
      ...findIcsUrlsInHtml(workingHtml, configuredUrl),
      ...(discovery.icalFeedUrl ? [discovery.icalFeedUrl] : []),
    ];
    const uniqueIcs = [...new Set(icsUrls)].slice(0, 8);
    for (const icsUrl of uniqueIcs) {
      const body = await fetchText(icsUrl);
      if (
        body.ok &&
        /BEGIN:VCALENDAR/i.test(body.html) &&
        /BEGIN:VEVENT/i.test(body.html)
      ) {
        icsBodies.push({ url: icsUrl, text: body.html });
      }
    }

    // Wix incomplete shell → permitted browser if not already attempted.
    if (
      allowBrowser &&
      !browserHtml &&
      (htmlLooksLikeIncompleteWixEventRender(workingHtml) ||
        detectEventListingCapability(workingHtml, configuredUrl).hasWixEventsSignals)
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

  return runAdaptiveExtractionFromArtifacts({
    configuredUrl,
    httpStatus: primary.status,
    html: primary.html,
    finalUrl: primary.finalUrl,
    contentType: primary.contentType,
    headers: primary.headers,
    sitemapXml,
    robotsTxt,
    browserHtml,
    browserBlocked,
    browserChallengeProvider,
    browserReason,
    icsBodies: icsBodies.length ? icsBodies : null,
    tecRestPayload,
    priorConfig: opts?.priorConfig,
    now,
  });
}

export { readStrategyProfile };
