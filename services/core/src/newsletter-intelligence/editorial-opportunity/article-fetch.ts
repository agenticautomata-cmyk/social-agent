import {
  assertPublicHost,
  validateConfirmationUrl,
} from '../../discovery-subscriptions/safe-fetch.js';
import { FETCH_TIMEOUT_MS, MAX_REDIRECTS } from '../../discovery-subscriptions/constants.js';
import { stripTrackingParams } from './canonical-url.js';
import type { ArticleAccessStatus, EditorialArticleFetchResult } from './types.js';

const MAX_ARTICLE_BYTES = 600_000;
const USER_AGENT = 'BensonEditorialBot/1.0 (+https://kckellie.com; editorial research; respects robots)';

const PAYWALL_HINTS =
  /\b(?:subscribe to (?:continue|read)|create (?:a )?free account|sign in to continue|metered paywall|subscribers only|already a subscriber)\b/i;
const LOGIN_HINTS = /\b(?:log\s*in|sign\s*in|authentication required)\b/i;

function extractMeta(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    'i',
  );
  return html.match(re)?.[1] ?? html.match(re2)?.[1] ?? null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50_000);
}

/**
 * Follow a public article URL within strict limits.
 * Never bypasses paywall/CAPTCHA/login. On block, caller keeps email evidence.
 */
export async function fetchEditorialArticle(
  url: string,
  opts?: { maxBytes?: number },
): Promise<EditorialArticleFetchResult> {
  const original = stripTrackingParams(url.trim());
  const blockedUrl = validateConfirmationUrl(original);
  if (blockedUrl) {
    return {
      url: original,
      canonicalUrl: null,
      access: 'blocked',
      headline: null,
      author: null,
      publicationDate: null,
      text: null,
      blockedReason: blockedUrl,
    };
  }

  let current = original;
  let redirectCount = 0;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    try {
      const host = new URL(current).hostname;
      const dnsBlock = await assertPublicHost(host);
      if (dnsBlock) {
        return {
          url: original,
          canonicalUrl: null,
          access: 'blocked',
          headline: null,
          author: null,
          publicationDate: null,
          text: null,
          blockedReason: dnsBlock,
        };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        },
      });
      clearTimeout(timer);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          return {
            url: original,
            canonicalUrl: stripTrackingParams(current),
            access: 'fetch_failed',
            headline: null,
            author: null,
            publicationDate: null,
            text: null,
            blockedReason: 'redirect_without_location',
          };
        }
        redirectCount += 1;
        if (redirectCount > MAX_REDIRECTS) {
          return {
            url: original,
            canonicalUrl: stripTrackingParams(current),
            access: 'fetch_failed',
            headline: null,
            author: null,
            publicationDate: null,
            text: null,
            blockedReason: 'redirect_limit',
          };
        }
        current = new URL(location, current).toString();
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        return {
          url: original,
          canonicalUrl: stripTrackingParams(current),
          access: 'subscription_required',
          headline: null,
          author: null,
          publicationDate: null,
          text: null,
          blockedReason: `http_${response.status}`,
        };
      }

      if (!response.ok) {
        return {
          url: original,
          canonicalUrl: stripTrackingParams(current),
          access: 'fetch_failed',
          headline: null,
          author: null,
          publicationDate: null,
          text: null,
          blockedReason: `http_${response.status}`,
        };
      }

      const buf = Buffer.from(await response.arrayBuffer());
      const max = opts?.maxBytes ?? MAX_ARTICLE_BYTES;
      const html = buf.subarray(0, max).toString('utf8');
      const text = htmlToText(html);
      const access: ArticleAccessStatus =
        PAYWALL_HINTS.test(html) || PAYWALL_HINTS.test(text)
          ? 'subscription_required'
          : LOGIN_HINTS.test(text) && text.length < 800
            ? 'subscription_required'
            : 'fetched';

      return {
        url: original,
        canonicalUrl: stripTrackingParams(current),
        access,
        headline: extractMeta(html, 'og:title') ?? extractMeta(html, 'twitter:title'),
        author: extractMeta(html, 'author') ?? extractMeta(html, 'article:author'),
        publicationDate:
          extractMeta(html, 'article:published_time') ?? extractMeta(html, 'pubdate'),
        text: access === 'fetched' ? text : text.slice(0, 2000),
        blockedReason: access === 'fetched' ? null : access,
      };
    } catch {
      return {
        url: original,
        canonicalUrl: null,
        access: 'fetch_failed',
        headline: null,
        author: null,
        publicationDate: null,
        text: null,
        blockedReason: 'fetch_failed',
      };
    }
  }

  return {
    url: original,
    canonicalUrl: null,
    access: 'fetch_failed',
    headline: null,
    author: null,
    publicationDate: null,
    text: null,
    blockedReason: 'redirect_limit',
  };
}
