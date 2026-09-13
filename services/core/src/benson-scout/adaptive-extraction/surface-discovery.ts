/**
 * Stage 3 — discover legitimate public extraction surfaces (same-origin).
 * Never invents off-origin private endpoints or uses stolen tokens.
 */

import type { DiscoveredSurface } from './types.js';

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

export function discoverPublicSurfaces(input: {
  configuredUrl: string;
  html?: string | null;
  sitemapIndexXml?: string | null;
  robotsTxt?: string | null;
}): DiscoveredSurface[] {
  const out: DiscoveredSurface[] = [];
  const seen = new Set<string>();
  const page = tryParse(input.configuredUrl);
  if (!page) return out;
  const origin = page.origin;

  // Standard public discovery paths — callers fetch and decide.
  push(out, seen, {
    kind: 'robots_txt',
    url: `${origin}/robots.txt`,
    evidence: ['convention:robots.txt'],
    sameOrigin: true,
    publiclyFetchable: true,
  });
  push(out, seen, {
    kind: 'sitemap_index',
    url: `${origin}/sitemap.xml`,
    evidence: ['convention:sitemap.xml'],
    sameOrigin: true,
    publiclyFetchable: true,
  });
  push(out, seen, {
    kind: 'sitemap_index',
    url: `${origin}/sitemap_index.xml`,
    evidence: ['convention:sitemap_index.xml'],
    sameOrigin: true,
    publiclyFetchable: true,
  });
  push(out, seen, {
    kind: 'wp_rest',
    url: `${origin}/wp-json/`,
    evidence: ['convention:wp-json'],
    sameOrigin: true,
    publiclyFetchable: true,
  });

  const html = input.html ?? '';
  if (html) {
    for (const m of html.matchAll(
      /<link[^>]+rel=["'](?:alternate|canonical)["'][^>]+href=["']([^"']+)["'][^>]*>/gi,
    )) {
      const abs = tryParse(m[1]!, input.configuredUrl);
      if (!abs || abs.origin !== origin) continue;
      const href = abs.href;
      if (/\.ics(?:$|\?)/i.test(href) || /format=ical/i.test(href) || /text\/calendar/i.test(m[0]!)) {
        push(out, seen, {
          kind: 'ics_feed',
          url: href,
          evidence: ['link[rel=alternate] ical'],
          sameOrigin: true,
          publiclyFetchable: true,
        });
      } else if (/rss|atom|feed/i.test(href)) {
        push(out, seen, {
          kind: 'rss_atom',
          url: href,
          evidence: ['link[rel=alternate] feed'],
          sameOrigin: true,
          publiclyFetchable: true,
        });
      } else if (/rel=["']canonical["']/i.test(m[0]!)) {
        push(out, seen, {
          kind: 'canonical_events_archive',
          url: href,
          evidence: ['link[rel=canonical]'],
          sameOrigin: true,
          publiclyFetchable: true,
        });
      }
    }
    if (/application\/ld\+json/i.test(html)) {
      push(out, seen, {
        kind: 'json_ld',
        url: input.configuredUrl,
        evidence: ['script[type=application/ld+json]'],
        sameOrigin: true,
        publiclyFetchable: true,
      });
    }
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
      });
    }
  }

  if (input.sitemapIndexXml) {
    for (const m of input.sitemapIndexXml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
      const abs = tryParse(m[1]!.trim());
      if (!abs || abs.origin !== origin) continue;
      const loc = abs.href;
      const isEventSitemap =
        /rhp_events/i.test(loc) ||
        /tribe.?events/i.test(loc) ||
        /event/i.test(loc) ||
        /sitemap/i.test(loc);
      push(out, seen, {
        kind: /sitemapindex/i.test(input.sitemapIndexXml) && /sitemap/i.test(loc)
          ? 'sitemap_index'
          : 'sitemap_urlset',
        url: loc,
        evidence: isEventSitemap
          ? [`sitemap_loc:${abs.pathname}`, 'eventish_sitemap_name']
          : [`sitemap_loc:${abs.pathname}`],
        sameOrigin: true,
        publiclyFetchable: true,
      });
    }
  }

  return out;
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

export function sitemapSuggestsRhpEvents(xml: string): boolean {
  return /rhp_events/i.test(xml) || /rhp_venue/i.test(xml);
}

export { sameOrigin };
