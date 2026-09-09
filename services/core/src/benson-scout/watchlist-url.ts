/**
 * Watchlist URL normalization.
 *
 * Critical rule: never collapse a meaningful Eventbrite listing path (e.g.
 * /d/mo--kansas-city/events/) to the domain root. Tracking params may be stripped;
 * legitimate location/search/category params are preserved.
 */

const TRACKING_PARAM_RE = /^(fbclid|gclid|msclkid|mc_eid|igsh|igshid|_ga|_gl|ref|ref_|ref_src|source)$/i;
const UTM_PARAM_RE = /^utm_/i;

const EVENTBRITE_HOST_RE = /(^|\.)eventbrite\.com$/i;

export type NormalizedWatchlistUrl = {
  submittedUrl: string;
  /** Operator-configured URL Benson must preserve and re-fetch. */
  configuredUrl: string;
  /** Stable key for dedupe — host + intentional path (+ preserved query when meaningful). */
  canonicalKeyPath: string;
  hostname: string;
  pathname: string;
  isEventbrite: boolean;
  /** True when the URL is only Eventbrite homepage / empty path — not a usable listing. */
  needsSetup: boolean;
  setupReason: string | null;
};

function withScheme(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\/+/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function stripTrackingParams(url: URL): void {
  const drop: string[] = [];
  for (const key of url.searchParams.keys()) {
    if (TRACKING_PARAM_RE.test(key) || UTM_PARAM_RE.test(key)) drop.push(key);
  }
  for (const key of drop) url.searchParams.delete(key);
}

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  // Keep a single trailing slash for Eventbrite directory listings (canonical form).
  const cleaned = pathname.replace(/\/{2,}/g, '/');
  return cleaned.endsWith('/') ? cleaned : `${cleaned}/`;
}

function isEventbriteHomepage(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  return p === '/' || p === '';
}

/**
 * Normalize a submitted Watchlist URL without following redirects and without
 * replacing it with a publisher origin.
 */
export function normalizeWatchlistUrl(raw: string): NormalizedWatchlistUrl {
  const submittedUrl = raw.trim();
  let url: URL;
  try {
    url = new URL(withScheme(submittedUrl));
  } catch {
    throw new Error('Invalid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http and https URLs are supported');
  }

  stripTrackingParams(url);
  const hostname = url.hostname.toLowerCase();
  const isEventbrite = EVENTBRITE_HOST_RE.test(hostname);
  const pathname = isEventbrite ? normalizePathname(url.pathname) : url.pathname || '/';
  url.hostname = hostname.startsWith('www.') ? hostname : hostname;
  if (isEventbrite && !hostname.startsWith('www.') && hostname === 'eventbrite.com') {
    url.hostname = 'www.eventbrite.com';
  }
  url.pathname = pathname;
  url.hash = '';

  const needsSetup = isEventbrite && isEventbriteHomepage(pathname);
  const configuredUrl = needsSetup
    ? 'https://www.eventbrite.com/'
    : `${url.origin}${url.pathname}${url.search}`;

  const hostKey = url.hostname.replace(/^www\./, '').toLowerCase();
  const pathKey = (url.pathname.replace(/\/+$/, '') || '/').toLowerCase();
  const queryKey = url.search ? url.search.toLowerCase() : '';
  const canonicalKeyPath = `${hostKey}${pathKey}${queryKey}`;

  return {
    submittedUrl,
    configuredUrl,
    canonicalKeyPath,
    hostname: url.hostname,
    pathname: url.pathname,
    isEventbrite,
    needsSetup,
    setupReason: needsSetup
      ? 'This source needs a location-specific Eventbrite URL (for example a Kansas City events listing), not the Eventbrite homepage.'
      : null,
  };
}

/** True when a final fetch URL abandoned a meaningful Eventbrite listing path. */
export function eventbriteListingRedirectedToHomepage(configuredUrl: string, finalUrl: string): boolean {
  try {
    const configured = normalizeWatchlistUrl(configuredUrl);
    const final = normalizeWatchlistUrl(finalUrl);
    if (!configured.isEventbrite) return false;
    if (configured.needsSetup) return false;
    return final.needsSetup || final.pathname === '/' || final.pathname === '';
  } catch {
    return false;
  }
}

export function isEventbriteWatchUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    return normalizeWatchlistUrl(raw).isEventbrite;
  } catch {
    return /eventbrite\.com/i.test(raw);
  }
}
