import { createHash } from 'node:crypto';
import type { MonitoringMode, ScoutPlatform, UrlInspectResult } from './types.js';
import { normalizeWatchlistUrl } from './watchlist-url.js';
import { isDostuffWatchUrl } from './dostuff-extract.js';
import { isMeetupWatchUrl } from './meetup-extract.js';

const IG_POST = /instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i;
const IG_PROFILE = /instagram\.com\/([A-Za-z0-9._]+)\/?(?:\?|$)/i;
const FB_PAGE = /facebook\.com\/([A-Za-z0-9.]+)/i;
const TIKTOK = /tiktok\.com\/@([A-Za-z0-9._]+)/i;
const RSS = /\.(rss|xml|atom)(\?|$)|\/feed\/?$/i;
const PDF = /\.pdf(\?|$)/i;

/** Local path heuristic — keep inspect independent of listing extractors under concurrent repair. */
const EVENT_PATH_RE =
  /(?:^|\/)(?:event-list|event-details(?:-registration)?|events?|live-music(?:-events)?|concerts?|shows?|calendar|upcoming|whats-?on|what-s-on)(?:\/|$)/i;

function urlLooksLikeEventListing(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (EVENT_PATH_RE.test(parsed.pathname)) return true;
    if (/event-details(?:-registration)?/i.test(parsed.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

export function detectPlatform(url: string): ScoutPlatform {
  const lower = url.toLowerCase();
  if (IG_POST.test(lower) || IG_PROFILE.test(lower)) return 'instagram';
  if (FB_PAGE.test(lower)) return 'facebook';
  if (TIKTOK.test(lower)) return 'tiktok';
  if (RSS.test(lower)) return 'rss';
  if (PDF.test(lower)) return 'pdf';
  if (/eventbrite\.com/i.test(lower)) return 'web';
  return 'web';
}

function eventbriteTitleGuess(pathname: string, hostname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  // /d/mo--kansas-city/events/ → Kansas City events
  if (segments[0] === 'd' && segments[1]) {
    const place = segments[1]
      .replace(/^[a-z]{2}--/i, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return `Eventbrite · ${place}`;
  }
  if (segments[0] === 'e') return 'Eventbrite event';
  if (segments[0] === 'o') return 'Eventbrite organizer';
  return hostname.replace(/^www\./, '');
}

export function inspectSubmittedUrl(rawUrl: string): UrlInspectResult {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Invalid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https URLs are supported');
  }

  const normalized = normalizeWatchlistUrl(rawUrl);
  const platform = detectPlatform(normalized.configuredUrl);

  if (platform === 'instagram' && IG_POST.test(parsed.href)) {
    return {
      submittedUrl: rawUrl,
      canonicalUrl: parsed.href.split('?')[0]!,
      platform,
      sourceType: 'social_post',
      titleGuess: 'Instagram post',
      isSingleItem: true,
      publisherUrl: null,
      publisherName: null,
      monitoringModes: ['SINGLE_ITEM', 'WATCH_ACCOUNT'],
      recommendedMode: 'SINGLE_ITEM',
      extractionMethod: 'social_session_or_manual',
      checkFrequencyHours: 12,
      loginRequired: true,
      sourceReliability: 0.55,
      creatorLeadPotential: 0.75,
      explanation:
        'This looks like one Instagram post. Benson can process it once, or watch the publisher account after you approve.',
      needsSetup: false,
      setupReason: null,
    };
  }

  if (platform === 'instagram') {
    const profile = parsed.pathname.replace(/\//g, '') || 'account';
    const canonicalUrl = parsed.origin + parsed.pathname;
    return {
      submittedUrl: rawUrl,
      canonicalUrl,
      platform,
      sourceType: 'social_account',
      titleGuess: `@${profile}`,
      isSingleItem: false,
      publisherUrl: canonicalUrl,
      publisherName: profile,
      monitoringModes: ['WATCH_ACCOUNT'],
      recommendedMode: 'WATCH_ACCOUNT',
      extractionMethod: 'social_session',
      checkFrequencyHours: 12,
      loginRequired: true,
      sourceReliability: 0.5,
      creatorLeadPotential: 0.7,
      explanation: 'This looks like an Instagram account. Watching requires an authorized session.',
      needsSetup: false,
      setupReason: null,
    };
  }

  if (platform === 'rss') {
    return {
      submittedUrl: rawUrl,
      canonicalUrl: parsed.href,
      platform,
      sourceType: 'rss_feed',
      titleGuess: parsed.hostname,
      isSingleItem: false,
      publisherUrl: parsed.origin,
      publisherName: parsed.hostname,
      monitoringModes: ['WATCH_FEED'],
      recommendedMode: 'WATCH_FEED',
      extractionMethod: 'rss_adapter',
      checkFrequencyHours: 6,
      loginRequired: false,
      sourceReliability: 0.85,
      creatorLeadPotential: 0.65,
      explanation: 'Structured feed — Benson can watch for new entries without a browser.',
      needsSetup: false,
      setupReason: null,
    };
  }

  if (platform === 'pdf') {
    return {
      submittedUrl: rawUrl,
      canonicalUrl: parsed.href,
      platform,
      sourceType: 'document',
      titleGuess: parsed.pathname.split('/').pop() ?? 'PDF document',
      isSingleItem: true,
      publisherUrl: parsed.origin,
      publisherName: parsed.hostname,
      monitoringModes: ['SINGLE_ITEM', 'WATCH_DOCUMENT_INDEX'],
      recommendedMode: 'SINGLE_ITEM',
      extractionMethod: 'document_queue',
      checkFrequencyHours: 24,
      loginRequired: false,
      sourceReliability: 0.8,
      creatorLeadPotential: 0.6,
      explanation: 'PDF document — Benson will extract structured content with page references.',
      needsSetup: false,
      setupReason: null,
    };
  }

  if (normalized.isEventbrite) {
    if (normalized.needsSetup) {
      return {
        submittedUrl: rawUrl,
        canonicalUrl: normalized.configuredUrl,
        platform: 'web',
        sourceType: 'event_directory',
        titleGuess: 'Eventbrite homepage',
        isSingleItem: false,
        publisherUrl: 'https://www.eventbrite.com/',
        publisherName: 'eventbrite.com',
        monitoringModes: ['WATCH_PAGE'],
        recommendedMode: 'WATCH_PAGE',
        extractionMethod: 'eventbrite_directory',
        checkFrequencyHours: 12,
        loginRequired: false,
        sourceReliability: 0.2,
        creatorLeadPotential: 0.4,
        explanation:
          normalized.setupReason ??
          'This source needs a location-specific Eventbrite URL.',
        needsSetup: true,
        setupReason: normalized.setupReason,
      };
    }

    return {
      submittedUrl: rawUrl,
      // Preserve the listing path — never the bare origin.
      canonicalUrl: normalized.configuredUrl,
      platform: 'web',
      sourceType: 'event_directory',
      titleGuess: eventbriteTitleGuess(normalized.pathname, normalized.hostname),
      isSingleItem: false,
      // Publisher origin is informational only; configured URL stays the listing.
      publisherUrl: 'https://www.eventbrite.com/',
      publisherName: 'eventbrite.com',
      monitoringModes: ['WATCH_PAGE', 'SINGLE_ITEM'],
      recommendedMode: 'WATCH_PAGE',
      extractionMethod: 'eventbrite_directory',
      checkFrequencyHours: 12,
      loginRequired: false,
      sourceReliability: 0.75,
      creatorLeadPotential: 0.7,
      explanation:
        'Eventbrite location listing — Benson watches this page for public event cards without replacing it with the homepage.',
      needsSetup: false,
      setupReason: null,
    };
  }

  if (isDostuffWatchUrl(normalized.configuredUrl)) {
    const pathLabel = normalized.pathname.replace(/\/+/g, '/').replace(/^\/|\/$/g, '') || 'events';
    return {
      submittedUrl: rawUrl,
      canonicalUrl: normalized.configuredUrl,
      platform: 'web',
      sourceType: 'event_directory',
      titleGuess: `Do816 · ${pathLabel}`,
      isSingleItem: false,
      publisherUrl: 'https://do816.com/',
      publisherName: 'do816.com',
      monitoringModes: ['WATCH_PAGE', 'SINGLE_ITEM'],
      recommendedMode: 'WATCH_PAGE',
      extractionMethod: 'dostuff_events',
      checkFrequencyHours: 12,
      loginRequired: false,
      sourceReliability: 0.74,
      creatorLeadPotential: 0.68,
      explanation:
        'DoStuff/Do816 public listing — Benson extracts SSR event cards without replacing the configured URL.',
      needsSetup: false,
      setupReason: null,
    };
  }

  if (isMeetupWatchUrl(normalized.configuredUrl)) {
    const pathLabel = normalized.pathname.replace(/\/+/g, '/').replace(/^\/|\/$/g, '') || 'find';
    return {
      submittedUrl: rawUrl,
      canonicalUrl: normalized.configuredUrl,
      platform: 'web',
      sourceType: 'event_directory',
      titleGuess: `Meetup · ${pathLabel}`,
      isSingleItem: false,
      publisherUrl: 'https://www.meetup.com/',
      publisherName: 'meetup.com',
      monitoringModes: ['WATCH_PAGE', 'SINGLE_ITEM'],
      recommendedMode: 'WATCH_PAGE',
      extractionMethod: 'meetup_directory',
      checkFrequencyHours: 12,
      loginRequired: false,
      sourceReliability: 0.73,
      creatorLeadPotential: 0.66,
      explanation:
        'Meetup public search/listing — Benson extracts SSR results, scores content relevance for review, and never auto-alerts from this path.',
      needsSetup: false,
      setupReason: null,
    };
  }

  const canonicalUrl = `${parsed.origin}${parsed.pathname}${parsed.search ? '' : ''}`.replace(
    /\?$/,
    '',
  );
  // Prefer path-preserving form from normalizeWatchlistUrl for generic web too.
  const configured = normalizeWatchlistUrl(rawUrl).configuredUrl;
  const eventListing = urlLooksLikeEventListing(configured || canonicalUrl);

  if (eventListing) {
    return {
      submittedUrl: rawUrl,
      canonicalUrl: configured || canonicalUrl,
      platform: 'web',
      sourceType: 'event_directory',
      titleGuess: parsed.hostname.replace(/^www\./, ''),
      isSingleItem: false,
      publisherUrl: parsed.origin,
      publisherName: parsed.hostname,
      monitoringModes: ['WATCH_PAGE', 'SINGLE_ITEM'],
      recommendedMode: 'WATCH_PAGE',
      extractionMethod: 'event_listing',
      checkFrequencyHours: 12,
      loginRequired: false,
      sourceReliability: 0.72,
      creatorLeadPotential: 0.68,
      explanation:
        'Public event listing page — Benson extracts dated event cards without replacing the configured URL.',
      needsSetup: false,
      setupReason: null,
    };
  }

  return {
    submittedUrl: rawUrl,
    canonicalUrl: configured || canonicalUrl,
    platform: 'web',
    sourceType: 'web_page',
    titleGuess: parsed.hostname.replace(/^www\./, ''),
    isSingleItem: true,
    publisherUrl: parsed.origin,
    publisherName: parsed.hostname,
    monitoringModes: ['SINGLE_ITEM', 'WATCH_PAGE', 'WATCH_PUBLISHER'],
    recommendedMode: 'WATCH_PAGE',
    extractionMethod: 'http_then_browser',
    checkFrequencyHours: 12,
    loginRequired: false,
    sourceReliability: 0.7,
    creatorLeadPotential: 0.65,
    explanation:
      'Web page — Benson can process once or watch for material changes on a conservative schedule.',
    needsSetup: false,
    setupReason: null,
  };
}

export function watcherFingerprint(url: string, mode: MonitoringMode): string {
  return hashUrl(`${mode}:${url.toLowerCase()}`);
}
