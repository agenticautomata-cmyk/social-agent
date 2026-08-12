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
    const handlePostMatch = path.match(/^\/(@?[\w.]+)\/(p|reel|tv)\/([^/]+)/i);
    if (handlePostMatch) {
      url.pathname = `/${handlePostMatch[2]!.toLowerCase()}/${handlePostMatch[3]}/`;
      return url.toString();
    }
    const postMatch = path.match(/^\/(p|reel|tv)\/([^/]+)/i);
    if (postMatch) {
      url.pathname = `/${postMatch[1]!.toLowerCase()}/${postMatch[2]}/`;
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
    return /(^|\.)instagram\.com$/i.test(u.hostname) && /\/(p|reel|tv)\//i.test(u.pathname);
  } catch {
    return false;
  }
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
