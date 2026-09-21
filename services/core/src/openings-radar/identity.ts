import { createHash } from 'node:crypto';
import { normalizeBusinessKey } from '../creator-interest/normalize.js';

/** Stronger business-key normalization for openings (punctuation / trailing descriptors). */
export function normalizeOpeningBusinessKey(name: string): string {
  let key = normalizeBusinessKey(name);
  // Drop trailing legal/descriptor noise that varies across mentions.
  key = key
    .replace(/\b(inc|llc|co|company|corp|corporation|ltd)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return key;
}

/**
 * Soft match: "Charlie D's" ≈ "Charlie Ds" ≈ "Charlie D's Seafood and Chicken"
 * when one is a prefix of the other after normalization.
 */
export function businessKeysLikelySame(a: string, b: string): boolean {
  const ka = normalizeOpeningBusinessKey(a);
  const kb = normalizeOpeningBusinessKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const shorter = ka.length <= kb.length ? ka : kb;
  const longer = ka.length <= kb.length ? kb : ka;
  if (shorter.length < 4) return false;
  if (longer.startsWith(shorter + ' ') || longer === shorter) return true;
  // Strip possessive / trailing s variants ("charlie d s" vs "charlie ds")
  const stripPossessive = (s: string) =>
    s
      .replace(/\b([a-z])\s+s\b/g, '$1s')
      .replace(/\s+/g, ' ')
      .trim();
  const sa = stripPossessive(ka);
  const sb = stripPossessive(kb);
  if (sa === sb) return true;
  if (sa.length >= 4 && (sb.startsWith(sa + ' ') || sb.startsWith(sa))) return true;
  if (sb.length >= 4 && (sa.startsWith(sb + ' ') || sa.startsWith(sb))) return true;
  return false;
}

export function normalizeAddressKey(input: {
  streetAddress?: string | null;
  suite?: string | null;
  city?: string | null;
  state?: string | null;
}): string {
  const street = (input.streetAddress ?? '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\b(street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|lane|ln|parkway|pkwy|highway|hwy)\b/g, (m) => {
      const map: Record<string, string> = {
        street: 'st',
        avenue: 'ave',
        boulevard: 'blvd',
        road: 'rd',
        drive: 'dr',
        lane: 'ln',
        parkway: 'pkwy',
        highway: 'hwy',
      };
      return map[m] ?? m;
    })
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const suite = (input.suite ?? '')
    .toLowerCase()
    .replace(/\b(suite|ste|unit|#)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const city = (input.city ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const state = (input.state ?? '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '')
    .trim();
  return [street, suite, city, state].filter(Boolean).join('|');
}

export function buildLocationKey(input: {
  businessName: string;
  streetAddress?: string | null;
  suite?: string | null;
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
}): string {
  const biz = normalizeOpeningBusinessKey(input.businessName);
  const addr = normalizeAddressKey(input);
  if (addr) return `${biz}::${addr}`;
  // Fall back to neighborhood when no street yet (still location-scoped).
  const hood = (input.neighborhood ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return `${biz}::${hood || 'unknown'}`;
}

export function buildSourceFingerprint(parts: {
  canonicalArticleUrl?: string | null;
  gmailMessageId?: string | null;
  subject?: string | null;
  socialPostUrl?: string | null;
  bodyHash?: string | null;
}): string {
  const raw = [
    (parts.canonicalArticleUrl ?? '').split('?')[0]!.toLowerCase(),
    parts.gmailMessageId ?? '',
    (parts.subject ?? '').toLowerCase().replace(/\s+/g, ' ').trim(),
    (parts.socialPostUrl ?? '').split('?')[0]!.toLowerCase(),
    parts.bodyHash ?? '',
  ].join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0, 40);
}

export function hashText(text: string): string {
  return createHash('sha256').update(text.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 24);
}
