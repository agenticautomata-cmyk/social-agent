/**
 * Entity resolution helpers for Calendar admission duplicate merge.
 */

const FILLER =
  /\b(?:the|a|an|and|at|in|on|of|for|kc|kansas\s+city|presents?|featuring|feat|live|event|events|concert|show|shows|tour|festival|tickets?|night|party)\b/gi;

const YEAR_TOKEN_RE = /\b(?:19|20)\d{2}\b/g;

export function normalizeAdmissionTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(YEAR_TOKEN_RE, ' ')
    .replace(FILLER, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Collapse near-duplicate title tokens (Nerdcon / Nerd Con). */
export function admissionTitleTokenSet(title: string): Set<string> {
  const norm = normalizeAdmissionTitle(title);
  return new Set(norm.split(' ').filter((t) => t.length > 1));
}

export function admissionTitlesLikelySame(a: string, b: string): boolean {
  const na = normalizeAdmissionTitle(a);
  const nb = normalizeAdmissionTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Compact form equality: "kc nerd con" vs "kc nerdcon"
  const compact = (s: string) => s.replace(/\s+/g, '');
  if (compact(na) === compact(nb)) return true;
  const ta = admissionTitleTokenSet(a);
  const tb = admissionTitleTokenSet(b);
  if (ta.size === 0 || tb.size === 0) return false;
  // Soft hyphenation: compact equality or near-equal length stem (nerdcon / nerd con).
  const ca = compact(na);
  const cb = compact(nb);
  if (ca.length >= 6 && cb.length >= 6) {
    const longer = ca.length >= cb.length ? ca : cb;
    const shorter = ca.length >= cb.length ? cb : ca;
    const similarLen = shorter.length / longer.length >= 0.7;
    if (similarLen && longer.includes(shorter)) return true;
  }
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  const min = Math.min(ta.size, tb.size);
  // Require strong overlap — two shared tokens alone is too aggressive
  // ("Megan Moroney Concert" vs unrelated Megan Moroney headline).
  if (shared >= 3 && shared >= Math.ceil(min * 0.75)) return true;
  if (shared === min && min >= 3) return true;
  return false;
}

export function chicagoDayKeyFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function normalizeVenueKey(venue: string | null | undefined): string {
  return (venue ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Same logical event: similar title, same Chicago day, compatible venue.
 * Datetime tolerance: within 2 hours if both timed.
 */
export function admissionEntitiesMatch(
  a: {
    title: string;
    startAt?: string | null;
    venue?: string | null;
    location?: string | null;
    sourceUrl?: string | null;
  },
  b: {
    title: string;
    startAt?: string | null;
    venue?: string | null;
    location?: string | null;
    sourceUrl?: string | null;
  },
): boolean {
  if (!admissionTitlesLikelySame(a.title, b.title)) return false;
  const dayA = chicagoDayKeyFromIso(a.startAt);
  const dayB = chicagoDayKeyFromIso(b.startAt);
  if (dayA && dayB && dayA !== dayB) return false;

  const venueA = normalizeVenueKey(a.venue ?? a.location);
  const venueB = normalizeVenueKey(b.venue ?? b.location);
  if (venueA && venueB && venueA !== venueB) {
    // Allow substring venue match (Convention Center vs Overland Park Convention Center).
    if (!venueA.includes(venueB) && !venueB.includes(venueA)) {
      // Same metro locality tokens (overland park / kansas city) still merge on strong titles.
      const metroToken = (v: string) => {
        const m = v.match(
          /\b(?:overland park|kansas city|olathe|lenexa|independence|lee s summit|westport|crossroads)\b/,
        );
        return m?.[0] ?? null;
      };
      const ma = metroToken(venueA);
      const mb = metroToken(venueB);
      if (!(ma && mb && ma === mb)) return false;
    }
  }

  if (a.startAt && b.startAt) {
    const ta = new Date(a.startAt).getTime();
    const tb = new Date(b.startAt).getTime();
    if (Number.isFinite(ta) && Number.isFinite(tb) && Math.abs(ta - tb) > 2 * 60 * 60 * 1000) {
      // Same day already checked; clock skew beyond 2h still OK for all-day vs timed.
      const allDayish = (iso: string) => {
        const d = new Date(iso);
        return d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
      };
      if (!allDayish(a.startAt) && !allDayish(b.startAt)) return false;
    }
  }

  return true;
}
