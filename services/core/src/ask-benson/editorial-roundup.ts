/** Editorial / roundup URL intent — classify before partnership qualification. */

import { classifyEditorialContainer, looksLikeEditorialContainerTitle, looksLikeEditorialContainerUrl } from './editorial-container.js';

const EDITORIAL_ROUNDUP_PATH_RE =
  /\/(?:top[-_])?things[-_]to[-_]do\b|\/(?:best[-_]of|weekend[-_]guide|city[-_]guide)\b|\b(?:roundup|listicle)\b|\/what[-_]to[-_]do\b/i;

const EDITORIAL_SLUG_RE =
  /things[-_]?to[-_]?do|roundup|listicle|weekend[-_]?guide|best[-_]of|this[-_]summer|summer[-_]20\d{2}|what[-_]to[-_]do/i;

const EDITORIAL_TITLE_RE =
  /\b(?:top|best)\s+things\s+to\s+do\b|\bwhat\s+to\s+do\s+(?:this|in)\b|\b(?:summer|weekend|holiday)\s+roundup\b|\broundup\s+of\b/i;

export function looksLikeEditorialSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  if (!s) return false;
  if (EDITORIAL_SLUG_RE.test(s)) return true;
  if (/\b20\d{2}\b/.test(s) && /(?:things|to-do|guide|summer|weekend|best)/i.test(s)) return true;
  return false;
}

export function isEditorialRoundupUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    const path = `${parsed.pathname}${parsed.search}`.toLowerCase();
    if (EDITORIAL_ROUNDUP_PATH_RE.test(path)) return true;
    return parsed.pathname.split('/').filter(Boolean).some((seg) => looksLikeEditorialSlug(seg));
  } catch {
    return false;
  }
}

export function isEditorialRoundupTitle(title: string | null | undefined): boolean {
  const t = (title ?? '').trim();
  if (!t) return false;
  return EDITORIAL_TITLE_RE.test(t) || looksLikeEditorialContainerTitle(t);
}

export function isEditorialRoundupSource(
  url: string,
  title?: string | null,
  pageText?: string | null,
): boolean {
  if (isEditorialRoundupUrl(url) || isEditorialRoundupTitle(title) || looksLikeEditorialContainerUrl(url)) {
    return true;
  }
  return classifyEditorialContainer({ url, title, pageText }).isContainer;
}

export function extractRoundupYear(url: string, title?: string | null): number | null {
  const blob = `${url} ${title ?? ''}`;
  const years = [...blob.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
  const valid = years.filter((y) => y >= 2018 && y <= 2100);
  if (valid.length === 0) return null;
  return Math.min(...valid);
}

export function isStaleEditorialRoundup(
  url: string,
  title?: string | null,
  now = new Date(),
): boolean {
  if (!isEditorialRoundupSource(url, title)) return false;
  const year = extractRoundupYear(url, title);
  if (year == null) return false;
  return year < now.getFullYear();
}

export function editorialRoundupSeason(url: string, title?: string | null): string | null {
  const blob = `${url} ${title ?? ''}`.toLowerCase();
  if (/\bsummer\b/.test(blob)) return 'summer';
  if (/\bwinter\b/.test(blob)) return 'winter';
  if (/\bspring\b/.test(blob)) return 'spring';
  if (/\b(?:fall|autumn)\b/.test(blob)) return 'fall';
  return null;
}

export function editorialRoundupPlace(url: string, title?: string | null): string | null {
  const blob = `${url} ${title ?? ''}`;
  if (/kcstudio|kansas\s*city|\bkc\b/i.test(blob)) return 'KC';
  return null;
}
