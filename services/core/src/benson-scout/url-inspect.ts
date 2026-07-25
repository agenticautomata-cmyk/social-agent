import { createHash } from 'node:crypto';
import type { MonitoringMode, ScoutPlatform, UrlInspectResult } from './types.js';

const IG_POST = /instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i;
const IG_PROFILE = /instagram\.com\/([A-Za-z0-9._]+)\/?(?:\?|$)/i;
const FB_PAGE = /facebook\.com\/([A-Za-z0-9.]+)/i;
const TIKTOK = /tiktok\.com\/@([A-Za-z0-9._]+)/i;
const RSS = /\.(rss|xml|atom)(\?|$)|\/feed\/?$/i;
const PDF = /\.pdf(\?|$)/i;

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
  return 'web';
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

  const platform = detectPlatform(parsed.href);
  const canonicalUrl = parsed.origin + parsed.pathname;

  if (platform === 'instagram' && IG_POST.test(parsed.href)) {
    const publisherMatch = parsed.href.match(/instagram\.com\/(?:p|reel|tv)\//i);
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
    };
  }

  if (platform === 'instagram') {
    const profile = parsed.pathname.replace(/\//g, '') || 'account';
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
    };
  }

  return {
    submittedUrl: rawUrl,
    canonicalUrl,
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
  };
}

export function watcherFingerprint(url: string, mode: MonitoringMode): string {
  return hashUrl(`${mode}:${url.toLowerCase()}`);
}
