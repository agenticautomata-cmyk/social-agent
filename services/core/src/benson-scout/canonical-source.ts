/**
 * Canonical identity for watchlist sources.
 *
 * Root cause of the @jasfoodjourney duplicate rows: `ensureCuratorWatcher()` compared
 * a slash-stripped input URL against a slash-having stored `source_watchers.source_url`,
 * so the "already exists" check never matched and every call inserted a fresh row.
 * `createWatchedSource()` also did a blind insert with no uniqueness check at all.
 *
 * This module computes one stable canonical key per real-world source so both paths can
 * upsert against it instead of guessing at URL string equality.
 */

const IG_HOST_RE = /(^|\.)instagram\.com$/i;
const TIKTOK_HOST_RE = /(^|\.)tiktok\.com$/i;
const FB_HOST_RE = /(^|\.)facebook\.com$/i;

export type CanonicalSourceKind = 'instagram_account' | 'tiktok_account' | 'facebook_page' | 'web';

export interface CanonicalSource {
  /** Stable, unique identity string, e.g. "instagram:account:jasfoodjourney". */
  key: string;
  kind: CanonicalSourceKind;
  /** Normalized handle for social accounts (lowercase, no leading @, no trailing slash). */
  handle: string | null;
  /** A clean canonical URL suitable for display / re-fetching. */
  canonicalUrl: string;
}

function stripLeadingAt(s: string): string {
  return s.replace(/^@+/, '');
}

/**
 * Normalize any of the following to the same Instagram account handle:
 *   instagram.com/jasfoodjourney
 *   www.instagram.com/jasfoodjourney/
 *   https://instagram.com/jasfoodjourney/
 *   https://www.instagram.com/JasFoodJourney/?hl=en
 *   @jasfoodjourney
 */
export function extractInstagramHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Bare "@handle" or "handle" input (no URL).
  if (!/^https?:\/\//i.test(trimmed) && !trimmed.includes('/')) {
    const handle = stripLeadingAt(trimmed).toLowerCase();
    return /^[a-z0-9._]{1,60}$/.test(handle) ? handle : null;
  }

  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withScheme);
    if (!IG_HOST_RE.test(url.hostname)) return null;
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return null;
    const first = stripLeadingAt(segments[0]!).toLowerCase();
    // Reject Instagram path prefixes that are not account handles.
    const RESERVED = new Set(['p', 'reel', 'reels', 'tv', 'stories', 'explore', 'accounts', 'direct']);
    if (RESERVED.has(first)) return null;
    return /^[a-z0-9._]{1,60}$/.test(first) ? first : null;
  } catch {
    return null;
  }
}

function normalizeGenericWebUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let path = url.pathname.replace(/\/+$/, '');
    if (!path) path = '/';
    return `${host}${path}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase().replace(/\/+$/, '');
  }
}

function extractSocialHandle(raw: string, hostRe: RegExp): string | null {
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withScheme);
    if (!hostRe.test(url.hostname)) return null;
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return null;
    const handle = stripLeadingAt(segments[0]!).toLowerCase();
    return /^[a-z0-9._]{1,60}$/.test(handle) ? handle : null;
  } catch {
    return null;
  }
}

/**
 * Compute the canonical identity for a watch-source URL. Every URL variant that
 * refers to the same real-world account/page/document must map to the same `key`.
 */
export function canonicalizeWatchSource(raw: string | null | undefined): CanonicalSource {
  const fallback: CanonicalSource = {
    key: `web:${normalizeGenericWebUrl(raw ?? '')}`,
    kind: 'web',
    handle: null,
    canonicalUrl: (raw ?? '').trim(),
  };
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  const igHandle = extractInstagramHandle(trimmed);
  if (igHandle) {
    return {
      key: `instagram:account:${igHandle}`,
      kind: 'instagram_account',
      handle: igHandle,
      canonicalUrl: `https://www.instagram.com/${igHandle}/`,
    };
  }

  const tiktokHandle = extractSocialHandle(trimmed, TIKTOK_HOST_RE);
  if (tiktokHandle) {
    return {
      key: `tiktok:account:${tiktokHandle}`,
      kind: 'tiktok_account',
      handle: tiktokHandle,
      canonicalUrl: `https://www.tiktok.com/@${tiktokHandle}`,
    };
  }

  const fbHandle = extractSocialHandle(trimmed, FB_HOST_RE);
  if (fbHandle) {
    return {
      key: `facebook:page:${fbHandle}`,
      kind: 'facebook_page',
      handle: fbHandle,
      canonicalUrl: `https://www.facebook.com/${fbHandle}`,
    };
  }

  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withScheme);
    const normalized = normalizeGenericWebUrl(url.toString());
    return {
      key: `web:${normalized}`,
      kind: 'web',
      handle: null,
      canonicalUrl: url.toString(),
    };
  } catch {
    return fallback;
  }
}

/** Convenience: canonical key alone, e.g. for quick equality checks. */
export function canonicalWatchSourceKey(raw: string | null | undefined): string {
  return canonicalizeWatchSource(raw).key;
}
