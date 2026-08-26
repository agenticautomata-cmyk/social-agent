/** Instagram URL helpers for curator watchlist / future live IG capture. */

const PLACEHOLDER_RE = /BLACKSPACES_FIXTURE|\/p\/FIXTURE|example\.com|placeholder/i;

export function isPlaceholderInstagramUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  return PLACEHOLDER_RE.test(url);
}

/**
 * Normalize Instagram post/reel/profile URLs for stable storage + open-source links.
 * Strips tracking query/hash; keeps /p/ or /reel/ shortcodes when present.
 */
export function normalizeInstagramUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) {
      return trimmed.split(/[?#]/)[0] ?? trimmed;
    }
    url.hash = '';
    url.search = '';
    // Collapse trailing slash consistency for posts/reels; keep profile slash.
    const path = url.pathname.replace(/\/+/g, '/');
    const handlePostMatch = path.match(/^\/(@?[\w.]+)\/(p|reel|reels|tv)\/([^/]+)/i);
    if (handlePostMatch) {
      const kind = handlePostMatch[2]!.toLowerCase() === 'reels' ? 'reel' : handlePostMatch[2]!.toLowerCase();
      url.pathname = `/${kind}/${handlePostMatch[3]}/`;
      return url.toString();
    }
    const postMatch = path.match(/^\/(p|reel|reels|tv)\/([^/]+)/i);
    if (postMatch) {
      const kind = postMatch[1]!.toLowerCase() === 'reels' ? 'reel' : postMatch[1]!.toLowerCase();
      url.pathname = `/${kind}/${postMatch[2]}/`;
      return url.toString();
    }
    const profileMatch = path.match(/^\/(@?[\w.]+)\/?$/i);
    if (profileMatch) {
      const handle = profileMatch[1]!.replace(/^@/, '');
      url.pathname = `/${handle}/`;
      return url.toString();
    }
    url.pathname = path.endsWith('/') ? path : `${path}/`;
    return url.toString();
  } catch {
    return trimmed.split(/[?#]/)[0] ?? trimmed;
  }
}

export function isInstagramPostOrReelUrl(url: string | null | undefined): boolean {
  if (!url || isPlaceholderInstagramUrl(url)) return false;
  try {
    const u = new URL(url);
    if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return false;
    // Require a shortcode. `/reels/` and `/handle/reels/` are profile tabs, not posts.
    return /\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+/i.test(u.pathname);
  } catch {
    return false;
  }
}

export function instagramShortcode(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  return match?.[1] ?? null;
}

export function instagramPostIdentityKeys(url: string): string[] {
  const normalized = normalizeInstagramUrl(url) ?? url.split(/[?#]/)[0] ?? url;
  const keys = new Set<string>([normalized]);
  const code = instagramShortcode(normalized);
  if (code) keys.add(code);
  return [...keys];
}

/** Deduped canonical post/reel URLs from raw hrefs (DOM, HTML, or GraphQL). */
export function collectInstagramPostUrls(rawHrefs: string[], limit = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const href of rawHrefs) {
    const absolute = href.startsWith('http')
      ? href
      : href.startsWith('/')
        ? `https://www.instagram.com${href}`
        : href;
    const clean = normalizeInstagramUrl(absolute);
    if (!clean || !isInstagramPostOrReelUrl(clean) || !instagramShortcode(clean)) continue;
    const key = instagramShortcode(clean) ?? clean;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

const POST_PATH_RE =
  /(?:https?:\/\/(?:www\.)?instagram\.com)?(\/(?:[A-Za-z0-9._]+\/)?(?:p|reel|reels|tv)\/[A-Za-z0-9_-]+)/gi;

export function extractInstagramPostHrefsFromHtml(html: string): string[] {
  const hrefs: string[] = [];
  POST_PATH_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = POST_PATH_RE.exec(html))) {
    hrefs.push(`https://www.instagram.com${match[1]}`);
  }
  return hrefs;
}

export function extractInstagramShortcodesFromJsonBlob(raw: string): string[] {
  const codes: string[] = [];
  const re = /"(?:code|shortcode)"\s*:\s*"([A-Za-z0-9_-]{8,15})"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    codes.push(match[1]!);
  }
  return codes;
}

export function instagramProfileUrl(handle: string): string {
  const clean = handle.replace(/^@/, '').trim();
  return `https://www.instagram.com/${clean}/`;
}

export function resolveOpenableInstagramSource(input: {
  postUrl?: string | null;
  handle?: string | null;
}): {
  url: string | null;
  kind: 'post' | 'profile' | 'none';
  postUrlAvailable: boolean;
  note: string | null;
} {
  const normalizedPost = normalizeInstagramUrl(input.postUrl);
  if (normalizedPost && isInstagramPostOrReelUrl(normalizedPost)) {
    return { url: normalizedPost, kind: 'post', postUrlAvailable: true, note: null };
  }
  const handle = input.handle?.replace(/^@/, '').trim();
  if (handle) {
    return {
      url: instagramProfileUrl(handle),
      kind: 'profile',
      postUrlAvailable: false,
      note: normalizedPost
        ? 'Original Instagram post URL was not a usable post/reel link.'
        : 'Original Instagram post URL was not captured for this record.',
    };
  }
  return { url: null, kind: 'none', postUrlAvailable: false, note: 'No Instagram source URL available.' };
}
