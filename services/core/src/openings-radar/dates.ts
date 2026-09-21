import type { OpeningDateInfo } from './types.js';

const MONTHS: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

const MONTH_NAME =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

/**
 * Parse opening-date language honestly.
 * Exact ISO dates only when a concrete calendar day is stated.
 * Approximate/vague labels are preserved as labels (never invented as exact).
 */
export function parseOpeningDateLanguage(
  text: string,
  fallbackYear?: number,
): OpeningDateInfo {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return { label: null, exactDate: null, precision: 'unknown' };
  const year = fallbackYear ?? new Date().getFullYear();

  // Approximate / vague bands FIRST — never invent exact days from these phrases
  if (/\bopening soon\b/i.test(t)) {
    return { label: 'opening soon', exactDate: null, precision: 'vague' };
  }
  if (/\bearly[- ]november\b/i.test(t)) {
    const y = t.match(/\b(20\d{2})\b/)?.[1] ?? String(year);
    return { label: `early November ${y}`, exactDate: null, precision: 'approximate' };
  }
  if (/\bmid[- ]october\b/i.test(t)) {
    const y = t.match(/\b(20\d{2})\b/)?.[1] ?? String(year);
    return { label: `mid-October ${y}`, exactDate: null, precision: 'approximate' };
  }
  if (/\bmid[- ]november\b/i.test(t)) {
    const y = t.match(/\b(20\d{2})\b/)?.[1] ?? String(year);
    return { label: `mid-November ${y}`, exactDate: null, precision: 'approximate' };
  }
  if (
    /\blate[- ](?:october|november|december|january|february|march|april|may|june|july|august|september)\b/i.test(
      t,
    )
  ) {
    const m = t.match(/\blate[- ]([A-Za-z]+)(?:\s+(20\d{2}))?\b/i);
    if (m) {
      const y = m[2] ?? String(year);
      return { label: `late ${m[1]} ${y}`, exactDate: null, precision: 'approximate' };
    }
  }
  if (/\bhalloween[- ]weekend\b/i.test(t)) {
    const y = t.match(/\b(20\d{2})\b/)?.[1] ?? String(year);
    return { label: `Halloween weekend ${y}`, exactDate: null, precision: 'approximate' };
  }

  // Exact: September 25, 2026 / Nov 10, 2026
  // Day must NOT be a prefix of a 4-digit year ("November 2026" must not become Nov 20).
  const exact = t.match(
    new RegExp(
      `\\b(${MONTH_NAME})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)(?:,?\\s+(20\\d{2}))?\\b`,
      'i',
    ),
  );
  if (exact) {
    const mon = MONTHS[exact[1]!.toLowerCase().replace(/\./g, '')];
    const dayNum = Number(exact[2]);
    const y = exact[3] ?? String(year);
    // Guard: if no explicit year group and the digits after month look like a year, skip
    if (!exact[3]) {
      const yearish = t.match(
        new RegExp(`\\b${exact[1]}\\.?\\s+(20\\d{2})\\b`, 'i'),
      );
      if (yearish) {
        // Month + year only — approximate, not exact day
        return { label: `${exact[1]} ${yearish[1]}`, exactDate: null, precision: 'approximate' };
      }
    }
    if (mon && dayNum >= 1 && dayNum <= 31) {
      const day = String(dayNum).padStart(2, '0');
      const label = `${exact[1]} ${exact[2]}${exact[3] ? `, ${exact[3]}` : `, ${y}`}`;
      return { label, exactDate: `${y}-${mon}-${day}`, precision: 'exact' };
    }
  }

  // ISO
  const iso = t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    return { label: iso[0], exactDate: iso[0], precision: 'exact' };
  }

  // Month-only: November opening / November 2026
  const monthOnly = t.match(
    new RegExp(`\\b(${MONTH_NAME})\\b(?:\\s+(20\\d{2}))?(?:\\s+opening)?`, 'i'),
  );
  if (monthOnly && /\b(opening|open|planned|scheduled|november|october|september)\b/i.test(t)) {
    const monName = monthOnly[1]!;
    const y = monthOnly[2] ?? String(year);
    if (!/\b(previously|announced in|since)\b/i.test(t.slice(0, monthOnly.index ?? 0) + ' ' + monName)) {
      return { label: `${monName} ${y}`, exactDate: null, precision: 'approximate' };
    }
  }

  if (/\b(coming soon|planned|expected)\b/i.test(t)) {
    return { label: t.slice(0, 80), exactDate: null, precision: 'vague' };
  }

  return { label: null, exactDate: null, precision: 'unknown' };
}

export function pickBestOpeningDate(...candidates: OpeningDateInfo[]): OpeningDateInfo {
  const rank = { exact: 3, approximate: 2, vague: 1, unknown: 0 };
  let best: OpeningDateInfo = { label: null, exactDate: null, precision: 'unknown' };
  for (const c of candidates) {
    if (!c.label && !c.exactDate) continue;
    if (rank[c.precision] > rank[best.precision]) best = c;
  }
  return best;
}
