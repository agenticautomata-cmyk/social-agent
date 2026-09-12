/**
 * Same-origin public event-source discovery for Watchlist listing pages.
 *
 * Finds advertised calendars, feeds, and plugin endpoints from nav / metadata /
 * structured data / link tags — never invents off-origin sources.
 */

export type DiscoveredEventSourceKind =
  | 'calendar_list'
  | 'calendar_month'
  | 'calendar_day'
  | 'ical_feed'
  | 'tribe_events_rest'
  | 'tec_views_html'
  | 'wp_rest_root'
  | 'json_ld_events'
  | 'nav_calendar';

export type DiscoveredEventSource = {
  kind: DiscoveredEventSourceKind;
  url: string;
  evidence: string[];
  sameOrigin: boolean;
  /** Prefer for extraction when configured URL is marketing/hub. */
  extractionCandidate: boolean;
};

export type EventSourceDiscoveryResult = {
  configuredUrl: string;
  origin: string | null;
  sources: DiscoveredEventSource[];
  /** Best same-origin HTML calendar URL (list preferred over month). */
  effectiveExtractionUrl: string | null;
  /** Official TEC REST collection URL when advertised. */
  tribeEventsRestUrl: string | null;
  /** Collection-level iCal / webcal feed when advertised. */
  icalFeedUrl: string | null;
  reasons: string[];
};

function tryParseUrl(raw: string, base?: string): URL | null {
  try {
    return new URL(raw, base);
  } catch {
    return null;
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#038;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'");
}

function absoluteSameOrigin(href: string, pageUrl: string, origin: string): string | null {
  const abs = tryParseUrl(decodeHtmlEntities(href.trim()), pageUrl);
  if (!abs) return null;
  if (abs.origin !== origin) return null;
  abs.hash = '';
  return abs.href;
}

function pushUnique(
  out: DiscoveredEventSource[],
  seen: Set<string>,
  source: DiscoveredEventSource,
): void {
  const key = `${source.kind}|${source.url}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push(source);
}

function scoreExtractionCandidate(url: string): number {
  try {
    const path = new URL(url).pathname.toLowerCase();
    // Exact calendar archives only — never treat marketing paths like
    // /events-programs-outreach/ as event calendars.
    if (/\/events\/list\/?$/i.test(path) || /\/events\/?$/i.test(path)) return 100;
    if (/\/events\/(?!month\b)[^/]+/i.test(path)) return 80;
    if (/\/calendar\/?$/i.test(path)) return 70;
    if (/\/events\/month/i.test(path)) return 20;
    if (/\/shows\/?$/i.test(path)) return 5;
    return 0;
  } catch {
    return 0;
  }
}

function isTheaterSeasonConfiguredPath(pathname: string): boolean {
  return /\/current-season\/?$/i.test(pathname) || /\/season\/?$/i.test(pathname);
}

function pageHasTheaterSeasonListingSignals(html: string): boolean {
  return (
    /onthestage\.tickets\/show\//i.test(html) &&
    (/Show Dates/i.test(html) || /elementor-heading-title/i.test(html))
  );
}

/**
 * Discover same-origin event sources advertised on a page.
 * Does not fetch follow-up URLs — caller decides what to retrieve.
 */
export function discoverEventSources(input: {
  html: string;
  pageUrl: string;
}): EventSourceDiscoveryResult {
  const configuredUrl = input.pageUrl;
  const page = tryParseUrl(configuredUrl);
  const origin = page?.origin ?? null;
  const reasons: string[] = [];
  const sources: DiscoveredEventSource[] = [];
  const seen = new Set<string>();

  if (!origin || !page) {
    return {
      configuredUrl,
      origin: null,
      sources: [],
      effectiveExtractionUrl: null,
      tribeEventsRestUrl: null,
      icalFeedUrl: null,
      reasons: ['invalid_page_url'],
    };
  }

  const html = input.html;

  // TEC / WP advertised endpoints
  const tecOrigin =
    html.match(/<meta[^>]+name=["']tec-api-origin["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']tec-api-origin["']/i)?.[1] ||
    null;
  if (tecOrigin) {
    const abs = absoluteSameOrigin(tecOrigin, configuredUrl, origin);
    if (abs) reasons.push(`tec_api_origin:${abs}`);
  }

  const tribeRestAlt =
    html.match(
      /<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']*wp-json\/tribe\/events\/v1\/?)["'][^>]*>/i,
    )?.[1] ||
    html.match(
      /<link[^>]+href=["']([^"']*wp-json\/tribe\/events\/v1\/?)["'][^>]+rel=["']alternate["'][^>]*>/i,
    )?.[1] ||
    null;
  if (tribeRestAlt) {
    const abs = absoluteSameOrigin(tribeRestAlt, configuredUrl, origin);
    if (abs) {
      pushUnique(sources, seen, {
        kind: 'tribe_events_rest',
        url: abs.endsWith('/') ? abs : `${abs}/`,
        evidence: ['link_rel_alternate_tribe_events_v1'],
        sameOrigin: true,
        extractionCandidate: true,
      });
      reasons.push('tribe_events_rest_advertised');
    }
  } else if (/tec-api-version/i.test(html) || /the-events-calendar/i.test(html)) {
    const guessed = `${origin}/wp-json/tribe/events/v1/`;
    pushUnique(sources, seen, {
      kind: 'tribe_events_rest',
      url: guessed,
      evidence: ['tec_plugin_signals_guessed_rest_root'],
      sameOrigin: true,
      extractionCandidate: true,
    });
    reasons.push('tribe_events_rest_guessed_from_tec_signals');
  }

  const wpRoot =
    html.match(/<link[^>]+rel=["']https:\/\/api\.w\.org\/["'][^>]+href=["']([^"']+)["']/i)?.[1] ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']https:\/\/api\.w\.org\/["']/i)?.[1] ||
    null;
  if (wpRoot) {
    const abs = absoluteSameOrigin(wpRoot, configuredUrl, origin);
    if (abs) {
      pushUnique(sources, seen, {
        kind: 'wp_rest_root',
        url: abs,
        evidence: ['link_rel_api_w_org'],
        sameOrigin: true,
        extractionCandidate: false,
      });
    }
  }

  // iCal / text/calendar alternates + explicit ?ical=1
  const icalLinkRe =
    /<link[^>]+(?:type=["']text\/calendar["'][^>]+href=["']([^"']+)["']|href=["']([^"']+)["'][^>]+type=["']text\/calendar["'])[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = icalLinkRe.exec(html)) !== null) {
    const href = m[1] || m[2];
    if (!href) continue;
    const abs = absoluteSameOrigin(href, configuredUrl, origin);
    if (!abs) continue;
    pushUnique(sources, seen, {
      kind: 'ical_feed',
      url: abs,
      evidence: ['link_rel_alternate_text_calendar'],
      sameOrigin: true,
      extractionCandidate: true,
    });
  }

  const hrefRe = /href=["']([^"']+)["']/gi;
  while ((m = hrefRe.exec(html)) !== null) {
    const href = decodeHtmlEntities(m[1]!);
    const abs = absoluteSameOrigin(href, configuredUrl, origin);
    if (!abs) continue;
    const path = new URL(abs).pathname.toLowerCase();
    const search = new URL(abs).search.toLowerCase();

    if (/[?&]ical=1\b/i.test(search) || /\.ics(?:$|[?#])/i.test(abs)) {
      pushUnique(sources, seen, {
        kind: 'ical_feed',
        url: abs,
        evidence: ['href_ical_or_ics'],
        sameOrigin: true,
        extractionCandidate: true,
      });
      continue;
    }

    if (/\/events\/list\/?$/i.test(path) || (/\/events\/?$/i.test(path) && !/\/events\/.+/i.test(path))) {
      pushUnique(sources, seen, {
        kind: 'calendar_list',
        url: abs.endsWith('/') ? abs : `${abs}/`,
        evidence: ['href_events_list_or_archive'],
        sameOrigin: true,
        extractionCandidate: true,
      });
    } else if (/\/events\/month/i.test(path)) {
      pushUnique(sources, seen, {
        kind: 'calendar_month',
        url: abs,
        evidence: ['href_events_month'],
        sameOrigin: true,
        // Month grids duplicate multi-day productions per cell — not preferred.
        extractionCandidate: false,
      });
    } else if (/\/events\/day/i.test(path)) {
      pushUnique(sources, seen, {
        kind: 'calendar_day',
        url: abs,
        evidence: ['href_events_day'],
        sameOrigin: true,
        extractionCandidate: false,
      });
    }
  }

  // Nav labels that point at calendar without /events/ path wording alone
  const navCalendar = html.match(
    /<a[^>]+href=["']([^"']+)["'][^>]*>\s*(?:Calendar|Events(?:\s+Calendar)?|Upcoming(?:\s+Events)?)\s*<\/a>/i,
  );
  if (navCalendar?.[1]) {
    const abs = absoluteSameOrigin(navCalendar[1], configuredUrl, origin);
    if (abs) {
      const normalized = abs.endsWith('/') ? abs : `${abs}/`;
      const score = scoreExtractionCandidate(normalized);
      pushUnique(sources, seen, {
        kind: 'nav_calendar',
        url: normalized,
        evidence: ['nav_label_calendar_or_events'],
        sameOrigin: true,
        // Require a real calendar path — bare "Events" nav often points at programs hubs.
        extractionCandidate: score >= 70,
      });
      reasons.push(score >= 70 ? 'nav_calendar_link' : 'nav_events_label_not_calendar');
    }
  }

  const viewsRest = html.match(/data-view-rest-url=["']([^"']+)["']/i)?.[1];
  if (viewsRest) {
    const abs = absoluteSameOrigin(viewsRest, configuredUrl, origin);
    if (abs) {
      pushUnique(sources, seen, {
        kind: 'tec_views_html',
        url: abs,
        evidence: ['data_view_rest_url'],
        sameOrigin: true,
        extractionCandidate: false,
      });
    }
  }

  if (/application\/ld\+json/i.test(html) && /"@type"\s*:\s*"Event"/i.test(html)) {
    pushUnique(sources, seen, {
      kind: 'json_ld_events',
      url: configuredUrl,
      evidence: ['json_ld_event_nodes_on_page'],
      sameOrigin: true,
      extractionCandidate: true,
    });
    reasons.push('json_ld_events_present');
  }

  const tribeRest = sources.find((s) => s.kind === 'tribe_events_rest')?.url ?? null;
  const icalFeedUrl =
    sources.find((s) => s.kind === 'ical_feed' && /[?&]ical=1\b/i.test(s.url))?.url ??
    sources.find((s) => s.kind === 'ical_feed')?.url ??
    null;

  const htmlCandidates = sources
    .filter((s) => s.extractionCandidate && (s.kind === 'calendar_list' || s.kind === 'nav_calendar'))
    .sort((a, b) => scoreExtractionCandidate(b.url) - scoreExtractionCandidate(a.url));

  let effectiveExtractionUrl = htmlCandidates[0]?.url ?? null;

  // Season / production pages are the extraction surface — never rewrite to a nav "Events" hub.
  if (
    isTheaterSeasonConfiguredPath(page.pathname) ||
    pageHasTheaterSeasonListingSignals(html)
  ) {
    effectiveExtractionUrl = configuredUrl.endsWith('/') ? configuredUrl : `${configuredUrl}/`;
    reasons.push('configured_url_is_theater_season_page');
  } else if (/\/events\/(?:list\/?)?$/i.test(page.pathname)) {
    // If configured page already is the list archive, keep it.
    effectiveExtractionUrl = configuredUrl.endsWith('/') ? configuredUrl : `${configuredUrl}/`;
    reasons.push('configured_url_is_events_calendar');
  } else if (effectiveExtractionUrl && effectiveExtractionUrl.replace(/\/$/, '') !== configuredUrl.replace(/\/$/, '')) {
    reasons.push(`effective_extraction_url:${effectiveExtractionUrl}`);
  } else if (!effectiveExtractionUrl && /\/shows\/?$/i.test(page.pathname)) {
    // Common WP theater pattern: /shows/ hub advertises /events/ calendar.
    const guessed = `${origin}/events/`;
    pushUnique(sources, seen, {
      kind: 'calendar_list',
      url: guessed,
      evidence: ['shows_hub_default_events_archive'],
      sameOrigin: true,
      extractionCandidate: true,
    });
    effectiveExtractionUrl = guessed;
    reasons.push('shows_hub_guessed_events_archive');
  }

  if (tribeRest) reasons.push(`tribe_rest:${tribeRest}`);
  if (icalFeedUrl) reasons.push(`ical_feed:${icalFeedUrl}`);

  return {
    configuredUrl,
    origin,
    sources,
    effectiveExtractionUrl,
    tribeEventsRestUrl: tribeRest,
    icalFeedUrl,
    reasons,
  };
}

/** Build a public TEC events collection query that includes currently-running productions. */
export function buildTribeEventsCollectionUrl(
  restRoot: string,
  opts?: { endsAfter?: string; perPage?: number; page?: number },
): string {
  const root = restRoot.endsWith('/') ? restRoot : `${restRoot}/`;
  const url = new URL('events', root);
  url.searchParams.set('per_page', String(opts?.perPage ?? 50));
  if (opts?.page && opts.page > 1) url.searchParams.set('page', String(opts.page));
  // ends_after keeps multi-day productions still running (not only future starts).
  if (opts?.endsAfter) url.searchParams.set('ends_after', opts.endsAfter);
  url.searchParams.set('status', 'publish');
  return url.href;
}
