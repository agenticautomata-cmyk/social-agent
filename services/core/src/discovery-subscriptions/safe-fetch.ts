import dns from 'node:dns/promises';
import net from 'node:net';
import {
  EMAIL_SERVICE_PROVIDER_DOMAINS,
  FETCH_TIMEOUT_MS,
  MAX_REDIRECTS,
  MAX_RESPONSE_BYTES,
  UNSAFE_LINK_PATH_PATTERNS,
  URL_SHORTENER_DOMAINS,
} from './constants.js';
import { domainFromUrl, rootDomain } from './extract.js';

export type SafeFetchBlockReason =
  | 'invalid_url'
  | 'http_not_allowed'
  | 'private_host'
  | 'url_shortener'
  | 'unsafe_path'
  | 'redirect_limit'
  | 'dns_failed'
  | 'response_too_large'
  | 'unsupported_content_type'
  | 'fetch_failed';

export type SafeFetchResult = {
  ok: boolean;
  blocked?: SafeFetchBlockReason;
  finalUrl?: string;
  redirectCount?: number;
  httpStatus?: number;
  bodySnippet?: string;
  contentType?: string;
};

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const a = parts[0] ?? -1;
    const b = parts[1] ?? -1;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 0) return true;
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('fe80')) return true;
  return false;
}

export function validateConfirmationUrl(url: string): SafeFetchBlockReason | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'invalid_url';
  }

  if (parsed.protocol !== 'https:') return 'http_not_allowed';
  if (net.isIP(parsed.hostname)) return 'private_host';

  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    return 'private_host';
  }

  const root = rootDomain(host);
  if (URL_SHORTENER_DOMAINS.has(host) || URL_SHORTENER_DOMAINS.has(root)) {
    return 'url_shortener';
  }

  const path = `${parsed.pathname}${parsed.search}`;
  if (UNSAFE_LINK_PATH_PATTERNS.some((p) => p.test(path))) return 'unsafe_path';

  return null;
}

export async function assertPublicHost(hostname: string): Promise<SafeFetchBlockReason | null> {
  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    for (const record of records) {
      if (isPrivateIp(record.address)) return 'private_host';
    }
    return null;
  } catch {
    return 'dns_failed';
  }
}

export function isAllowedConfirmationDestination(input: {
  linkUrl: string;
  signupDomain?: string | null;
  expectedSenderDomain?: string | null;
  senderDomain?: string | null;
}): boolean {
  const linkHost = domainFromUrl(input.linkUrl);
  if (!linkHost) return false;

  const linkRoot = rootDomain(linkHost);
  const signupRoot = input.signupDomain ? rootDomain(input.signupDomain) : null;
  const senderRoot = input.senderDomain ? rootDomain(input.senderDomain) : null;
  const expectedRoot = input.expectedSenderDomain
    ? rootDomain(input.expectedSenderDomain)
    : null;

  if (signupRoot && (linkRoot === signupRoot || linkHost.endsWith(`.${signupRoot}`))) return true;
  if (senderRoot && (linkRoot === senderRoot || linkHost.endsWith(`.${senderRoot}`))) return true;
  if (expectedRoot && (linkRoot === expectedRoot || linkHost.endsWith(`.${expectedRoot}`))) {
    return true;
  }

  if (EMAIL_SERVICE_PROVIDER_DOMAINS.has(linkHost) || EMAIL_SERVICE_PROVIDER_DOMAINS.has(linkRoot)) {
    return true;
  }

  for (const esp of EMAIL_SERVICE_PROVIDER_DOMAINS) {
    if (linkHost.endsWith(`.${esp}`)) return true;
  }

  return false;
}

function looksLikeConfirmationSuccess(body: string, finalUrl: string): boolean {
  const text = `${body}\n${finalUrl}`.toLowerCase();
  return (
    /\b(thank you|confirmed|verified|subscription confirmed|successfully subscribed|you'?re subscribed)\b/i.test(
      text,
    ) || /confirmed=1|verified=1|success=1/i.test(finalUrl)
  );
}

export async function safeConfirmSubscriptionLink(url: string): Promise<SafeFetchResult> {
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
          'User-Agent': 'BensonDiscoveryBot/1.0 (+https://kckellie.com)',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        },
      });
      clearTimeout(timer);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          return { ok: false, blocked: 'fetch_failed', finalUrl: current, redirectCount, httpStatus: response.status };
        }
        redirectCount += 1;
        if (redirectCount > MAX_REDIRECTS) {
          return { ok: false, blocked: 'redirect_limit', finalUrl: current, redirectCount };
        }
        current = new URL(location, current).toString();
        continue;
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        return {
          ok: false,
          blocked: 'unsupported_content_type',
          finalUrl: current,
          redirectCount,
          httpStatus: response.status,
          contentType,
        };
      }

      const reader = response.body?.getReader();
      if (!reader) {
        return { ok: false, blocked: 'fetch_failed', finalUrl: current, redirectCount, httpStatus: response.status };
      }

      let received = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        received += value.byteLength;
        if (received > MAX_RESPONSE_BYTES) {
          return {
            ok: false,
            blocked: 'response_too_large',
            finalUrl: current,
            redirectCount,
            httpStatus: response.status,
          };
        }
        chunks.push(value);
      }

      const bodySnippet = Buffer.concat(chunks).toString('utf8').slice(0, 8000);
      const success =
        response.ok && looksLikeConfirmationSuccess(bodySnippet, current);

      return {
        ok: success,
        finalUrl: current,
        redirectCount,
        httpStatus: response.status,
        bodySnippet,
        contentType,
      };
    } catch {
      clearTimeout(timer);
      return { ok: false, blocked: 'fetch_failed', finalUrl: current, redirectCount };
    }
  }

  return { ok: false, blocked: 'redirect_limit', finalUrl: current, redirectCount };
}
