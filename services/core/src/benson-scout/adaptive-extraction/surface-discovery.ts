/**
 * Stage 3 — discover legitimate public extraction surfaces (same-origin).
 * Recursive sitemap follow within strict bounds. Platform-standard surfaces
 * only after positive platform evidence. Never invents private endpoints.
 */

import type { DiscoveredSurface, DiscoveredSurfaceKind, PlatformSignatureId } from './types.js';

const SITEMAP_MAX_DEPTH = 3;
const SITEMAP_MAX_ITEMS = 80;
const EVENT_DETAIL_SAMPLE = 8;

const SEMANTIC_PATH_RE =
  /\/(events?|calendar|shows?|schedule|performances?|tickets?|whats-?on|upcoming|programs?|series|venue|listings?|event-list|live-music)(\/|$)/i;

const SEMANTIC_ANCHOR_RE =
  /\b(events?|calendar|shows?|schedule|performances?|tickets?|what'?s on|upcoming|programs?|series|venue calendar|more info|event details?|buy tickets?)\b/i;

function tryParse(raw: string, base?: string): URL | null {
  try {
    return new URL(raw, base);
  } catch {
    return null;
  }
}

function sameOrigin(a: string, b: string): boolean {
  const ua = tryParse(a);
  const ub = tryParse(b);
  return Boolean(ua && ub && ua.origin === ub.origin);
}

function push(
  out: DiscoveredSurface[],
  seen: Set<string>,
  surface: DiscoveredSurface,
): void {
  const key = `${surface.kind}|${surface.url}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push(surface);
}

function isEventishSitemapPath(pathname: string): boolean {
  return (
    /rhp_events/i.test(pathname) ||
    /tribe.?events/i.test(pathname) ||
    /mec[_-]?events/i.test(pathname) ||
    /event/i.test(pathname) ||
    /calendar/i.test(pathname) ||
    /shows?/i.test(pathname) ||
    /sitemap/i.test(pathname)
  );
}

/**
 * Discover public surfaces from HTML / robots / sitemap artifacts.
 * Does not perform network I/O — callers fetch and feed XML back for recursion.
 */
export function discoverPublicSurfaces(input: {
  configuredUrl: string;
  html?: string | null;
  sitemapIndexXml?: string | null;
  robotsTxt?: string | null;
  platformSignature?: PlatformSignatureId | null;
}): DiscoveredSurface[] {
  const out: DiscoveredSurface[] = [];
  const seen = new Set<string>();
  const page = tryParse(input.configuredUrl);
  if (!page) return out;
  const origin = page.origin;

  push(out, seen, {
    kind: 'configured_url',
    url: input.configuredUrl,
    evidence: ['configured_watchlist_url'],
    sameOrigin: true,
    publiclyFetchable: true,
    discoveryMethod: 'configured',
    referringSurface: null,
  });

  push(out, seen, {
    kind: 'robots_txt',
    url: `${origin}/robots.txt`,
    evidence: ['convention:robots.txt'],
    sameOrigin: true,
    publiclyFetchable: true,
    discoveryMethod: 'convention',
    referringSurface: input.configuredUrl,
  });
  push(out, seen, {
    kind: 'sitemap_index',
    url: `${origin}/sitemap.xml`,
    evidence: ['convention:sitemap.xml'],
    sameOrigin: true,
    publiclyFetchable: true,
    discoveryMethod: 'convention',
    referringSurface: input.configuredUrl,
  });
  push(out, seen, {
    kind: 'sitemap_index',
    url: `${origin}/sitemap_index.xml`,
    evidence: ['convention:sitemap_index.xml'],
    sameOrigin: true,
    publiclyFetchable: true,
    discoveryMethod: 'convention',
    referringSurface: input.configuredUrl,
  });

  const html = input.html ?? '';
  if (html) {
    discoverFromHtml(out, seen, html, input.configuredUrl, origin);
  }

  if (input.robotsTxt) {
    for (const m of input.robotsTxt.matchAll(/sitemap:\s*(\S+)/gi)) {
      const abs = tryParse(m[1]!);
      if (!abs) continue;
      push(out, seen, {
        kind: 'sitemap_index',
        url: abs.href,
        evidence: ['robots.txt Sitemap'],
        sameOrigin: abs.origin === origin,
        publiclyFetchable: true,
        discoveryMethod: 'robots_txt',
        referringSurface: `${origin}/robots.txt`,
      });
    }
  }

  if (input.sitemapIndexXml) {
    ingestSitemapXml(out, seen, input.sitemapIndexXml, input.configuredUrl, origin, {
      depth: 0,
      referringSurface: `${origin}/sitemap.xml`,
    });
  }

  // Platform-standard public surfaces — ONLY with positive platform evidence.
  if (input.platformSignature && input.platformSignature !== 'unknown') {
    addPlatformStandardSurfaces(out, seen, origin, input.configuredUrl, input.platformSignature);
  }

  return out;
}

function discoverFromHtml(
  out: DiscoveredSurface[],
  seen: Set<string>,
  html: string,
  pageUrl: string,
  origin: string,
): void {
  for (const m of html.matchAll(
    /<link[^>]+rel=["']([^"']+)["'][^>]*>/gi,
  )) {
    const tag = m[0]!;
    const rel = (m[1] ?? '').toLowerCase();
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const abs = tryParse(href, pageUrl);
    if (!abs || abs.origin !== origin) continue;

    if (/alternate/i.test(rel)) {
      const type = tag.match(/type=["']([^"']+)["']/i)?.[1] ?? '';
      if (/\.ics(?:$|\?)/i.test(abs.href) || /format=ical/i.test(abs.href) || /text\/calendar/i.test(type)) {
        push(out, seen, {
          kind: 'ics_feed',
          url: abs.href,
          evidence: ['link[rel=alternate] ical', type].filter(Boolean),
          sameOrigin: true,
          publiclyFetchable: true,
          discoveryMethod: 'link_rel_alternate',
          referringSurface: pageUrl,
        });
      } else if (/rss|atom|xml|json/i.test(type) || /rss|atom|feed|json/i.test(abs.pathname)) {
        const kind: DiscoveredSurfaceKind = /json/i.test(type) ? 'json_feed' : 'rss_atom';
        push(out, seen, {
          kind,
          url: abs.href,
          evidence: ['link[rel=alternate] feed', type].filter(Boolean),
          sameOrigin: true,
          publiclyFetchable: true,
          discoveryMethod: 'link_rel_alternate',
          referringSurface: pageUrl,
        });
      } else {
        push(out, seen, {
          kind: 'link_alternate',
          url: abs.href,
          evidence: [`link[rel=${rel}]`, type].filter(Boolean),
          sameOrigin: true,
          publiclyFetchable: true,
          discoveryMethod: 'link_rel_alternate',
          referringSurface: pageUrl,
        });
      }
    }
    if (/canonical/i.test(rel)) {
      push(out, seen, {
        kind: 'canonical_events_archive',
        url: abs.href,
        evidence: ['link[rel=canonical]'],
        sameOrigin: true,
        publiclyFetchable: true,
        discoveryMethod: 'canonical',
        referringSurface: pageUrl,
      });
    }
  }

  // Link header-like hints sometimes embedded in HTML comments / meta.
  for (const m of html.matchAll(
    /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    if (out.filter((s) => s.kind === 'same_origin_semantic').length >= 12) break;
    const abs = tryParse(m[1]!, pageUrl);
    if (!abs || abs.origin !== origin) continue;
    const text = (m[2] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const pathOk = SEMANTIC_PATH_RE.test(abs.pathname);
    const textOk = SEMANTIC_ANCHOR_RE.test(text);
    if (!pathOk && !textOk) continue;
    const kind: DiscoveredSurfaceKind = /ticket|etix|ticketmaster|eventbrite|axs/i.test(abs.href)
      ? 'ticket_provider'
      : pathOk && /calendar|events?|shows?/i.test(abs.pathname)
        ? 'calendar_collection'
        : 'same_origin_semantic';
    push(out, seen, {
      kind,
      url: abs.href,
      evidence: [
        pathOk ? `semantic_path:${abs.pathname}` : null,
        textOk ? `anchor_text:${text.slice(0, 80)}` : null,
      ].filter(Boolean) as string[],
      sameOrigin: true,
      publiclyFetchable: true,
      discoveryMethod: 'bounded_same_origin_links',
      referringSurface: pageUrl,
      selectionReason: `Selected: ${pathOk ? 'eventish path' : 'eventish anchor'} — ${text.slice(0, 60) || abs.pathname}`,
    });
  }

  if (/application\/ld\+json/i.test(html)) {
    push(out, seen, {
      kind: 'json_ld',
      url: pageUrl,
      evidence: ['script[type=application/ld+json]'],
      sameOrigin: true,
      publiclyFetchable: true,
      discoveryMethod: 'structured_data',
      referringSurface: pageUrl,
    });
  }
  if (/__NEXT_DATA__|__HYDRATION__|application\/json/i.test(html) && /"events?"\s*:/i.test(html)) {
    push(out, seen, {
      kind: 'embedded_json',
      url: pageUrl,
      evidence: ['embedded_hydration_or_json_events'],
      sameOrigin: true,
      publiclyFetchable: true,
      discoveryMethod: 'structured_data',
      referringSurface: pageUrl,
    });
  }

  // Publisher-linked ticket widgets (iframe/src only — no guessing).
  for (const m of html.matchAll(
    /<(?:iframe|script)[^>]+src=["'](https?:\/\/[^"']+(?:eventbrite|ticketmaster|etix|ticketweb|axs|onthestage)[^"']+)["']/gi,
  )) {
    push(out, seen, {
      kind: 'ticket_provider',
      url: m[1]!,
      evidence: ['embedded_ticket_widget', 'linked_by_publisher'],
      sameOrigin: false,
      publiclyFetchable: true,
      discoveryMethod: 'embedded_widget',
      referringSurface: pageUrl,
      selectionReason: 'Publisher-embedded ticket provider iframe/script',
    });
  }
}

function ingestSitemapXml(
  out: DiscoveredSurface[],
  seen: Set<string>,
  xml: string,
  pageUrl: string,
  origin: string,
  opts: { depth: number; referringSurface: string },
): void {
  if (opts.depth > SITEMAP_MAX_DEPTH) return;
  let itemCount = out.filter((s) => s.kind === 'sitemap_urlset' || s.kind === 'event_detail_urls').length;

  for (const m of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    if (itemCount >= SITEMAP_MAX_ITEMS) break;
    const abs = tryParse(m[1]!.trim());
    if (!abs || abs.origin !== origin) continue;
    const loc = abs.href;
    const eventish = isEventishSitemapPath(abs.pathname);

    if (/sitemap/i.test(abs.pathname) && /\.xml/i.test(abs.pathname)) {
      push(out, seen, {
        kind: 'sitemap_index',
        url: loc,
        evidence: eventish
          ? [`sitemap_loc:${abs.pathname}`, 'eventish_sitemap_name']
          : [`sitemap_loc:${abs.pathname}`],
        sameOrigin: true,
        publiclyFetchable: true,
        discoveryMethod: 'sitemap_recursive',
        referringSurface: opts.referringSurface,
        platformEvidence: /rhp_events/i.test(loc)
          ? ['sitemap_cpt:rhp_events']
          : /tribe/i.test(loc)
            ? ['sitemap_cpt:tribe_events']
            : [],
      });
      itemCount += 1;
      continue;
    }

    // Collection paths declared in page/event sitemaps.
    if (
      /\/(calendar|events?|shows?|schedule)\/?$/i.test(abs.pathname) ||
      /\/events?\/list\/?$/i.test(abs.pathname)
    ) {
      push(out, seen, {
        kind: 'calendar_collection',
        url: loc,
        evidence: [`sitemap_declared_collection:${abs.pathname}`],
        sameOrigin: true,
        publiclyFetchable: true,
        discoveryMethod: 'sitemap_collection',
        referringSurface: opts.referringSurface,
        selectionReason: `Site-declared collection path in sitemap: ${abs.pathname}`,
      });
      itemCount += 1;
    }

    if (/\/event\//i.test(abs.pathname) || /\/events\/[^/]+/i.test(abs.pathname)) {
      const details = out.filter((s) => s.kind === 'event_detail_urls');
      if (details.length < EVENT_DETAIL_SAMPLE) {
        push(out, seen, {
          kind: 'event_detail_urls',
          url: loc,
          evidence: [`sitemap_event_url`, `depth:${opts.depth}`],
          sameOrigin: true,
          publiclyFetchable: true,
          discoveryMethod: 'sitemap_event_detail',
          referringSurface: opts.referringSurface,
          selectionReason: 'Bounded sample of sitemap-listed individual event pages',
        });
        itemCount += 1;
      }
    }

    push(out, seen, {
      kind: 'sitemap_urlset',
      url: loc,
      evidence: eventish
        ? [`sitemap_loc:${abs.pathname}`, 'eventish_sitemap_name']
        : [`sitemap_loc:${abs.pathname}`],
      sameOrigin: true,
      publiclyFetchable: true,
      discoveryMethod: 'sitemap_url',
      referringSurface: opts.referringSurface,
    });
    itemCount += 1;
  }
}

/**
 * Platform-standard surfaces after positive signature evidence.
 * Strict, small set — never dozens of blind path guesses.
 */
function addPlatformStandardSurfaces(
  out: DiscoveredSurface[],
  seen: Set<string>,
  origin: string,
  configuredUrl: string,
  signature: PlatformSignatureId,
): void {
  const ref = configuredUrl;
  if (signature === 'wordpress_rhp_events') {
    const rhp: Array<{ kind: DiscoveredSurfaceKind; path: string; evidence: string }> = [
      { kind: 'wp_rest', path: '/wp-json/', evidence: 'wp_rest_root_after_rhp_evidence' },
      {
        kind: 'wp_rest',
        path: '/wp-json/wp/v2/rhp_events',
        evidence: 'wp_rest_cpt_rhp_events_after_signature',
      },
      {
        kind: 'wp_cpt_feed',
        path: '/feed/?post_type=rhp_events',
        evidence: 'wp_cpt_feed_rhp_events_after_signature',
      },
      {
        kind: 'calendar_collection',
        path: '/events/',
        evidence: 'rhp_events_archive_convention_after_signature',
      },
    ];
    for (const item of rhp) {
      push(out, seen, {
        kind: item.kind,
        url: `${origin}${item.path}`,
        evidence: [item.evidence, 'platform_evidence:wordpress_rhp_events'],
        sameOrigin: true,
        publiclyFetchable: true,
        discoveryMethod: 'platform_standard_after_evidence',
        referringSurface: ref,
        platformEvidence: ['wordpress_rhp_events'],
        selectionReason: `RHP platform evidence → try ${item.path}`,
      });
    }
  }

  if (signature === 'wordpress_tec') {
    const tec: Array<{ kind: DiscoveredSurfaceKind; path: string; evidence: string }> = [
      { kind: 'wp_rest', path: '/wp-json/', evidence: 'wp_rest_root_after_tec' },
      {
        kind: 'tec_rest',
        path: '/wp-json/tribe/events/v1/events',
        evidence: 'tec_rest_after_signature',
      },
      {
        kind: 'ics_feed',
        path: '/events/?ical=1',
        evidence: 'tec_ics_convention_after_signature',
      },
      {
        kind: 'rss_atom',
        path: '/events/feed/',
        evidence: 'tec_events_feed_after_signature',
      },
    ];
    for (const item of tec) {
      push(out, seen, {
        kind: item.kind,
        url: `${origin}${item.path}`,
        evidence: [item.evidence, 'platform_evidence:wordpress_tec'],
        sameOrigin: true,
        publiclyFetchable: true,
        discoveryMethod: 'platform_standard_after_evidence',
        referringSurface: ref,
        platformEvidence: ['wordpress_tec'],
        selectionReason: `TEC platform evidence → try ${item.path}`,
      });
    }
  }

  if (signature === 'wordpress_mec') {
    push(out, seen, {
      kind: 'rss_atom',
      url: `${origin}/events/feed/`,
      evidence: ['mec_feed_after_signature'],
      sameOrigin: true,
      publiclyFetchable: true,
      discoveryMethod: 'platform_standard_after_evidence',
      referringSurface: ref,
      platformEvidence: ['wordpress_mec'],
    });
  }
}

export function extractEventUrlsFromSitemapXml(xml: string, pageUrl: string): string[] {
  const page = tryParse(pageUrl);
  if (!page) return [];
  const urls: string[] = [];
  for (const m of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    const abs = tryParse(m[1]!.trim());
    if (!abs || abs.origin !== page.origin) continue;
    if (/\/event\//i.test(abs.pathname) || /\/events?\//i.test(abs.pathname)) {
      urls.push(abs.href);
    }
  }
  return [...new Set(urls)];
}

export function extractCollectionUrlsFromSitemapXml(xml: string, pageUrl: string): string[] {
  const page = tryParse(pageUrl);
  if (!page) return [];
  const urls: string[] = [];
  for (const m of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    const abs = tryParse(m[1]!.trim());
    if (!abs || abs.origin !== page.origin) continue;
    if (/\/(calendar|events?|shows?|schedule)\/?$/i.test(abs.pathname)) {
      urls.push(abs.href);
    }
  }
  return [...new Set(urls)];
}

export function sitemapSuggestsRhpEvents(xml: string): boolean {
  return /rhp_events/i.test(xml) || /rhp_venue/i.test(xml);
}

export function sitemapChildLocs(xml: string, pageUrl: string): string[] {
  const page = tryParse(pageUrl);
  if (!page) return [];
  const urls: string[] = [];
  for (const m of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    const abs = tryParse(m[1]!.trim());
    if (!abs || abs.origin !== page.origin) continue;
    if (/\.xml($|\?)/i.test(abs.pathname) || /sitemap/i.test(abs.pathname)) {
      urls.push(abs.href);
    }
  }
  return [...new Set(urls)];
}

export { sameOrigin, SEMANTIC_PATH_RE, SITEMAP_MAX_DEPTH, SITEMAP_MAX_ITEMS, EVENT_DETAIL_SAMPLE };
