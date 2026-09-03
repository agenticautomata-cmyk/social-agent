/**
 * Stable business identity for the partnership vertical.
 *
 * Reply attribution, relationship memory and opportunity dedupe all need to agree on
 * "which business is this?". Before this existed the only join was
 * `outreach_emails.gmail_thread_id`, which is why all 14 inbound messages had a NULL
 * `outreach_email_id` and every reply in the system's lifetime was unattributed.
 *
 * The key is deliberately conservative: it normalizes case, punctuation and common
 * suffixes, but it does NOT try to merge similar names. "Crossroads Hotel" and
 * "Crossroads Hotel Kansas City" produce the same key; "Crossroads Hotel" and
 * "Crossroads Arts District" do not.
 */

const LEGAL_SUFFIXES = [
  'llc',
  'l l c',
  'inc',
  'incorporated',
  'co',
  'company',
  'corp',
  'corporation',
  'ltd',
  'lp',
  'llp',
  'plc',
  'group',
];

/** Location qualifiers that describe the same property, not a different one. */
const LOCATION_QUALIFIERS = [
  'kansas city',
  'kansas city mo',
  'kansas city missouri',
  'kansas city ks',
  'kc',
  'kcmo',
  'overland park',
  'downtown',
];

const NOISE_WORDS = ['the'];

/**
 * Removes a phrase wherever it appears, so "Loews Hotel Kansas City" and "Loews
 * Kansas City Hotel" resolve to the same business. Only used for location
 * qualifiers — legal suffixes are stripped from the tail only, because "Group" in
 * the middle of a name is usually part of it.
 */
function stripPhrasesAnywhere(tokens: string[], phrases: string[]): string[] {
  let out = [...tokens];
  // Longest first, so "kansas city mo" is consumed before "kansas city".
  const ordered = [...phrases].sort((a, b) => b.split(' ').length - a.split(' ').length);
  for (const phrase of ordered) {
    const parts = phrase.split(' ');
    let i = 0;
    while (i + parts.length <= out.length) {
      if (out.slice(i, i + parts.length).join(' ') === phrase) {
        out = [...out.slice(0, i), ...out.slice(i + parts.length)];
        continue;
      }
      i += 1;
    }
  }
  return out;
}

function stripTrailingPhrases(tokens: string[], phrases: string[]): string[] {
  let out = [...tokens];
  let changed = true;
  while (changed) {
    changed = false;
    for (const phrase of phrases) {
      const parts = phrase.split(' ');
      if (parts.length > out.length) continue;
      const tail = out.slice(out.length - parts.length).join(' ');
      if (tail === phrase) {
        out = out.slice(0, out.length - parts.length);
        changed = true;
        break;
      }
    }
  }
  return out;
}

/**
 * Normalized identity for a business or property.
 * Returns an empty string when the input carries no usable identity — callers must
 * treat that as "no business identity", never as a wildcard match.
 */
export function businessKeyFor(name: string | null | undefined): string {
  const raw = (name ?? '').toLowerCase();
  if (!raw.trim()) return '';

  const cleaned = raw
    .replace(/&/g, ' and ')
    .replace(/['\u2018\u2019\u02bc]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!cleaned) return '';

  let tokens = cleaned.split(' ').filter(Boolean);
  tokens = tokens.filter((t, i) => !(i === 0 && NOISE_WORDS.includes(t)));
  tokens = stripTrailingPhrases(tokens, LEGAL_SUFFIXES);
  tokens = stripPhrasesAnywhere(tokens, LOCATION_QUALIFIERS);
  tokens = stripTrailingPhrases(tokens, LEGAL_SUFFIXES);

  if (tokens.length === 0) {
    // Everything was a suffix or qualifier — fall back to the cleaned form rather than
    // returning a key that would collide with other stripped-to-nothing names.
    return cleaned.split(' ').filter(Boolean).join('-');
  }
  return tokens.join('-');
}

/** Normalized email domain, used as a secondary reply-attribution signal. */
export function emailDomainKey(email: string | null | undefined): string {
  const at = (email ?? '').trim().toLowerCase().lastIndexOf('@');
  if (at < 0) return '';
  const domain = (email ?? '').trim().toLowerCase().slice(at + 1);
  return domain.replace(/^(www|mail|email|smtp)\./, '');
}

/** Registrable-ish domain for a website URL, for matching a reply to a business. */
export function websiteDomainKey(url: string | null | undefined): string {
  const raw = (url ?? '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}
