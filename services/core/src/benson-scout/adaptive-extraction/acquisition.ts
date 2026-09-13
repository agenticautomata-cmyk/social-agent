/**
 * Stage 2 — diagnose lightweight HTTP acquisition without treating status alone
 * as extraction success/failure.
 */

import type { AcquisitionKind, AcquisitionObservation } from './types.js';

const CHALLENGE_RE =
  /captcha-delivery|geo\.captcha-delivery|datadome|cf-challenge|g-recaptcha|hcaptcha|verify you are human|pardon our interruption|attention required|just a moment\.\.\.|enable js and disable any ad blocker/i;

const JS_SHELL_RE =
  /<div[^>]+id=["'](?:app|root|__next|__nuxt)["'][^>]*>\s*<\/div>/i;

const EVENTISH_HTML_RE =
  /application\/ld\+json|itemtype=["'][^"']*Event|tribe-events|rhp-events|eventlist-event|events-viewer|wix-one-events|BEGIN:VCALENDAR|upcoming events|eventDoorStartDate|eventStDate/i;

function pageTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
  return m?.[1]?.trim() || null;
}

function pickCacheHeaders(headers: Headers | Record<string, string> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  const wanted = ['cache-control', 'etag', 'age', 'cf-cache-status', 'x-cache'];
  if (headers instanceof Headers) {
    for (const key of wanted) {
      const v = headers.get(key);
      if (v) out[key] = v;
    }
    return out;
  }
  for (const key of wanted) {
    const v = headers[key] ?? headers[key.toLowerCase()];
    if (typeof v === 'string' && v) out[key] = v;
  }
  return out;
}

function wafIndicators(headers: Headers | Record<string, string> | null | undefined, html: string): string[] {
  const hits: string[] = [];
  const get = (k: string) => {
    if (!headers) return null;
    if (headers instanceof Headers) return headers.get(k);
    return headers[k] ?? headers[k.toLowerCase()] ?? null;
  };
  if (get('x-datadome') || /datadome/i.test(html)) hits.push('datadome');
  if (get('cf-ray') || /cloudflare/i.test(String(get('server') ?? ''))) hits.push('cloudflare');
  if (/awsWaf|awswaf/i.test(html)) hits.push('aws_waf');
  if (CHALLENGE_RE.test(html)) hits.push('challenge_document');
  return [...new Set(hits)];
}

export function diagnoseAcquisition(input: {
  configuredUrl: string;
  finalUrl?: string | null;
  status: number;
  html: string;
  contentType?: string | null;
  headers?: Headers | Record<string, string> | null;
  redirectChain?: string[];
  error?: string | null;
}): AcquisitionObservation {
  const html = input.html ?? '';
  const status = input.status;
  const challenge = CHALLENGE_RE.test(html);
  const http403 = status === 403;
  const wafOrCdnIndicators = wafIndicators(input.headers, html);
  let challengeProvider: string | null = null;
  if (/datadome|captcha-delivery/i.test(html) || wafOrCdnIndicators.includes('datadome')) {
    challengeProvider = 'datadome';
  } else if (/cf-challenge|just a moment/i.test(html)) {
    challengeProvider = 'cloudflare';
  } else if (/g-recaptcha|hcaptcha/i.test(html)) {
    challengeProvider = 'captcha';
  } else if (challenge) {
    challengeProvider = 'unknown_challenge';
  }

  let kind: AcquisitionKind = 'empty';
  if (status === 429 || /rate.?limit|too many requests/i.test(html)) {
    kind = 'rate_limited';
  } else if (status === 401 || status === 403 || challenge) {
    kind = challenge || wafOrCdnIndicators.includes('challenge_document') ? 'challenge' : 'access_control';
  } else if (status >= 400 || status === 0) {
    kind = 'error';
  } else if (
    input.redirectChain &&
    input.redirectChain.length > 1 &&
    input.finalUrl &&
    input.finalUrl.replace(/\/$/, '') !== input.configuredUrl.replace(/\/$/, '')
  ) {
    kind = 'redirect';
  } else if (EVENTISH_HTML_RE.test(html) && html.length > 1500) {
    kind = 'useful_html';
  } else if (JS_SHELL_RE.test(html) || (/__HYDRATION__|__NEXT_DATA__|"events"\s*:\s*\[/.test(html) && html.length < 8000)) {
    kind = 'js_shell';
  } else if (/application\/ld\+json|BEGIN:VCALENDAR|"@type"\s*:\s*"Event"/i.test(html)) {
    kind = 'structured_payload';
  } else if (html.trim()) {
    kind = html.length < 800 ? 'empty' : 'useful_html';
  }

  const usefulEventContentLikely =
    kind === 'useful_html' ||
    kind === 'structured_payload' ||
    (kind === 'js_shell' && /"events"\s*:\s*\[/.test(html));

  return {
    configuredUrl: input.configuredUrl,
    finalUrl: input.finalUrl ?? null,
    canonicalUrl: null,
    httpStatus: status,
    contentType: input.contentType ?? null,
    byteSize: Buffer.byteLength(html, 'utf8'),
    redirectChain: input.redirectChain ?? [],
    cacheHeaders: pickCacheHeaders(input.headers),
    wafOrCdnIndicators,
    pageTitle: pageTitle(html),
    kind,
    http403,
    challengeProvider,
    usefulEventContentLikely,
    html,
    error: input.error ?? null,
  };
}

export function acquisitionSummary(obs: AcquisitionObservation): string {
  const bits = [`HTTP ${obs.httpStatus}`, obs.kind];
  if (obs.challengeProvider) bits.push(obs.challengeProvider);
  if (obs.wafOrCdnIndicators.length) bits.push(obs.wafOrCdnIndicators.join('+'));
  return bits.join(' · ');
}
