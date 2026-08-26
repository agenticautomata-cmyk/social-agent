/** Standalone URL type — domain + path structure before entity or partnership inference. */

export const STANDALONE_URL_TYPES = [
  'affiliate_program',
  'social_post',
  'social_profile',
  'link_hub',
  'event_listing',
  'editorial_roundup',
  'local_business',
  'commerce',
  'unknown',
] as const;

export type StandaloneUrlType = (typeof STANDALONE_URL_TYPES)[number];

const IG_HOST_RE = /(^|\.)instagram\.com$/i;

const IG_POST_PATH_RE = /^\/(p|reel|reels|tv)\/([^/]+)\/?/i;

const IG_RESERVED_FIRST = new Set([
  'p',
  'reel',
  'reels',
  'tv',
  'stories',
  'explore',
  'accounts',
  'direct',
  'about',
  'legal',
  'developer',
  'developers',
  's',
  'share',
]);

const LINK_HUB_HOSTS = new Set([
  'linktr.ee',
  'linktree.com',
  'beacons.ai',
  'bio.link',
  'lnk.bio',
]);

const HTTP_URL_RE = /https?:\/\/[^\s<>"'\)\]]+/gi;

const ASSET_OR_SHARE_RE =
  /\.(css|js|png|jpe?g|gif|webp|svg|woff2?|mp4)(\?|$)/i;

/**
 * Opaque social/content IDs that must never become entity/business/brand names.
 * Instagram shortcodes, UUIDs, tracking tokens.
 */
export function isOpaqueContentId(value: string | null | undefined): boolean {
  const s = (value ?? '').trim();
  if (!s) return false;
  if (/^(utm[_-]|fbclid|gclid|igshid|igsi|igsh|mc_eid)/i.test(s)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
  if (/^[0-9a-f]{16,}$/i.test(s)) return true;
  // Compact alphanumeric tokens (IG shortcodes like DbtacOJzN1R) — not hyphenated brand slugs.
  if (!/[-_\s]/.test(s) && /^[A-Za-z0-9]{8,15}$/.test(s) && /\d/.test(s)) return true;
  return false;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url.trim()).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

export function isLinkHubUrl(url: string): boolean {
  const host = hostnameOf(url);
  return Boolean(host && LINK_HUB_HOSTS.has(host));
}

export function isInstagramPostUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (!IG_HOST_RE.test(parsed.hostname)) return false;
    return IG_POST_PATH_RE.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function isInstagramProfileUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (!IG_HOST_RE.test(parsed.hostname)) return false;
    if (IG_POST_PATH_RE.test(parsed.pathname)) return false;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length !== 1) return false;
    const handle = parts[0]!.replace(/^@/, '').trim();
    if (!handle || IG_RESERVED_FIRST.has(handle.toLowerCase())) return false;
    return /^[\w.]+$/.test(handle);
  } catch {
    return false;
  }
}

export function instagramPostShortcode(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    const match = parsed.pathname.match(IG_POST_PATH_RE);
    return match?.[2] ?? null;
  } catch {
    return null;
  }
}

export function classifyStandaloneUrlType(url: string): StandaloneUrlType {
  const trimmed = url.trim();
  if (!trimmed) return 'unknown';
  if (isInstagramPostUrl(trimmed)) return 'social_post';
  if (isInstagramProfileUrl(trimmed)) return 'social_profile';
  if (isLinkHubUrl(trimmed)) return 'link_hub';
  return 'unknown';
}

export function isKnownSocialOrLinkHubUrl(url: string): boolean {
  const type = classifyStandaloneUrlType(url);
  return type === 'social_post' || type === 'social_profile' || type === 'link_hub';
}

export function hubOwnerFromPath(url: string): string | null {
  try {
    const parts = new URL(url.trim()).pathname.split('/').filter(Boolean);
    const slug = parts[0]?.replace(/^@/, '').trim();
    if (!slug || isOpaqueContentId(slug)) return null;
    const spaced = slug
      .replace(/[-_]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
    if (spaced.length < 2) return null;
    return spaced
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  } catch {
    return null;
  }
}

export function extractHttpUrls(text: string, max = 24): string[] {
  const matches = text.match(HTTP_URL_RE) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of matches) {
    const cleaned = raw.replace(/[.,;:!?)]+$/, '');
    try {
      const parsed = new URL(cleaned);
      if (!/^https?:$/i.test(parsed.protocol)) continue;
    } catch {
      continue;
    }
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= max) break;
  }
  return out;
}

export function extractLinkHubDestinations(input: {
  hubUrl: string;
  pageText?: string | null;
  html?: string | null;
}): Array<{ url: string; type: StandaloneUrlType }> {
  const hubHost = hostnameOf(input.hubUrl);
  const blob = `${input.pageText ?? ''}\n${input.html ?? ''}`;
  const hrefs = [...(input.html?.matchAll(/href=["'](https?:[^"']+)["']/gi) ?? [])].map((m) => m[1]!);
  const fromText = extractHttpUrls(blob, 40);
  const combined = [...hrefs, ...fromText];
  const seen = new Set<string>();
  const out: Array<{ url: string; type: StandaloneUrlType }> = [];
  for (const raw of combined) {
    let normalized = raw;
    try {
      const parsed = new URL(raw);
      const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
      if (host === hubHost) continue;
      if (ASSET_OR_SHARE_RE.test(parsed.pathname)) continue;
      if (/facebook\.com\/sharer|twitter\.com\/intent|t\.co\//i.test(parsed.href)) continue;
      parsed.hash = '';
      for (const key of [...parsed.searchParams.keys()]) {
        if (/^(utm_|fbclid|gclid|igshid|igsi|igsh|mc_eid)/i.test(key)) {
          parsed.searchParams.delete(key);
        }
      }
      normalized = parsed.toString();
    } catch {
      continue;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push({ url: normalized, type: classifyStandaloneUrlType(normalized) });
    if (out.length >= 16) break;
  }
  return out;
}
