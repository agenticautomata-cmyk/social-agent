import {
  assertPublicHost,
  validateConfirmationUrl,
  type SafeFetchResult,
} from '../discovery-subscriptions/safe-fetch.js';
import { URL_SHORTENER_DOMAINS } from '../discovery-subscriptions/constants.js';
import { rootDomain } from '../discovery-subscriptions/extract.js';
import { MAX_REDIRECTS, FETCH_TIMEOUT_MS } from '../discovery-subscriptions/constants.js';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LINK_CACHE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../.cache/newsletter-links',
);

export type ResolvedLink = {
  originalUrl: string;
  canonicalUrl: string | null;
  resolved: boolean;
  blocked?: string;
};

function isTrackingUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const root = rootDomain(host);
    if (URL_SHORTENER_DOMAINS.has(host) || URL_SHORTENER_DOMAINS.has(root)) return true;
    return /click\.|track\.|trk\.|email\.|links\.|list-manage\.com|mailchi\.mp|constantcontact|hubspotlinks|sendgrid|cmail\d+\.com/i.test(
      host,
    );
  } catch {
    return false;
  }
}

async function followRedirects(url: string): Promise<SafeFetchResult & { finalUrl: string }> {
  let current = url;
  let redirectCount = 0;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const blocked = validateConfirmationUrl(current);
    if (blocked) return { ok: false, blocked, finalUrl: current, redirectCount };

    const host = new URL(current).hostname;
    const dnsBlock = await assertPublicHost(host);
    if (dnsBlock) return { ok: false, blocked: dnsBlock, finalUrl: current, redirectCount };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'BensonNewsletterBot/1.0 (+https://kckellie.com)',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        },
      });
      clearTimeout(timer);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return { ok: false, blocked: 'fetch_failed', finalUrl: current, redirectCount };
        redirectCount += 1;
        if (redirectCount > MAX_REDIRECTS) {
          return { ok: false, blocked: 'redirect_limit', finalUrl: current, redirectCount };
        }
        current = new URL(location, current).toString();
        continue;
      }

      return {
        ok: response.ok,
        finalUrl: current,
        redirectCount,
        httpStatus: response.status,
      };
    } catch {
      clearTimeout(timer);
      return { ok: false, blocked: 'fetch_failed', finalUrl: current, redirectCount };
    }
  }

  return { ok: false, blocked: 'redirect_limit', finalUrl: current, redirectCount };
}

export async function resolveNewsletterUrl(url: string | null | undefined): Promise<ResolvedLink | null> {
  if (!url?.trim()) return null;
  const originalUrl = url.trim();
  if (!isTrackingUrl(originalUrl)) {
    return { originalUrl, canonicalUrl: originalUrl, resolved: false };
  }

  const cacheKey = createHash('sha256').update(originalUrl).digest('hex').slice(0, 24);
  const cachePath = resolve(LINK_CACHE_DIR, `${cacheKey}.json`);
  try {
    if (existsSync(cachePath)) {
      return JSON.parse(readFileSync(cachePath, 'utf8')) as ResolvedLink;
    }
  } catch {
    // ignore
  }

  const result = await followRedirects(originalUrl);
  const resolved: ResolvedLink = {
    originalUrl,
    canonicalUrl: result.finalUrl ?? null,
    resolved: Boolean(result.redirectCount && result.redirectCount > 0),
    blocked: result.blocked,
  };
  try {
    mkdirSync(LINK_CACHE_DIR, { recursive: true });
    writeFileSync(cachePath, JSON.stringify(resolved));
  } catch {
    // best-effort
  }
  return resolved;
}

export async function resolveNewsletterUrls(urls: string[]): Promise<Map<string, ResolvedLink>> {
  const out = new Map<string, ResolvedLink>();
  const candidates = urls.filter(Boolean).slice(0, 12);
  for (const url of candidates) {
    const resolved = await resolveNewsletterUrl(url);
    if (resolved) out.set(url, resolved);
  }
  return out;
}

export function pickCanonicalSourceUrl(input: {
  sourceUrl: string | null;
  ticketLink: string | null;
  reservationLink: string | null;
  officialWebsite: string | null;
  resolved: Map<string, ResolvedLink>;
}): string | null {
  for (const raw of [input.sourceUrl, input.ticketLink, input.reservationLink, input.officialWebsite]) {
    if (!raw) continue;
    const link = input.resolved.get(raw);
    if (link?.canonicalUrl) return link.canonicalUrl;
    if (!isTrackingUrl(raw)) return raw;
  }
  return input.officialWebsite ?? input.sourceUrl ?? null;
}

export function inferOfficialDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export { isTrackingUrl };
