/**
 * Entity resolution helpers for Calendar admission duplicate merge.
 * Uses KC local (America/Chicago) day — never UTC date alone.
 */

const FILLER =
  /\b(?:the|a|an|and|at|in|on|of|for|kc|kansas\s+city|presents?|featuring|feat|live|event|events|concert|show|shows|tour|festival|tickets?|night|party)\b/gi;

const YEAR_TOKEN_RE = /\b(?:19|20)\d{2}\b/g;

/** Known alias clusters that must merge even when titles differ in branding. */
const TITLE_ALIAS_CLUSTERS: RegExp[][] = [
  [/\boriginal\s+sin\b/i, /\bsapphic\s+cabaret\b/i],
  [/\bevolving\s+vision\b/i, /\bbrush\s+creek\s+corridor\b/i],
  [/\bkkfi\b/i, /\bcrossroads\s+music\s+fest\b/i],
];

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

function titlesInAliasCluster(a: string, b: string): boolean {
  for (const cluster of TITLE_ALIAS_CLUSTERS) {
    const aHit = cluster.some((re) => re.test(a));
    const bHit = cluster.some((re) => re.test(b));
    if (aHit && bHit) return true;
  }
  return false;
}

export function admissionTitlesLikelySame(a: string, b: string): boolean {
  if (titlesInAliasCluster(a, b)) return true;
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

function isAllDayishIso(iso: string): boolean {
  const d = new Date(iso);
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
}

/**
 * Same logical event: similar title, same Chicago day, compatible venue.
 * Time tolerance: within 12h on the same local day (covers noon vs 9pm CT UTC rollover).
 * Separate performances at different venues still do not merge.
 */
export function admissionEntitiesMatch(
  a: {
    title: string;
    startAt?: string | null;
    venue?: string | null;
    location?: string | null;
    sourceUrl?: string | null;
    organizer?: string | null;
  },
  b: {
    title: string;
    startAt?: string | null;
    venue?: string | null;
    location?: string | null;
    sourceUrl?: string | null;
    organizer?: string | null;
  },
): boolean {
  if (!admissionTitlesLikelySame(a.title, b.title)) return false;
  const dayA = chicagoDayKeyFromIso(a.startAt);
  const dayB = chicagoDayKeyFromIso(b.startAt);
  // Local KC day is authoritative — UTC date rollover must not block merge.
  if (dayA && dayB && dayA !== dayB) return false;

  const venueA = normalizeVenueKey(a.venue ?? a.location);
  const venueB = normalizeVenueKey(b.venue ?? b.location);
  if (venueA && venueB && venueA !== venueB) {
    // Allow substring venue match (Convention Center vs Overland Park Convention Center).
    if (!venueA.includes(venueB) && !venueB.includes(venueA)) {
      const metroToken = (v: string) => {
        const m = v.match(
          /\b(?:overland park|kansas city|olathe|lenexa|independence|lee s summit|westport|crossroads|parkville)\b/,
        );
        return m?.[0] ?? null;
      };
      const ma = metroToken(venueA);
      const mb = metroToken(venueB);
      // Distinct named venues (Rock Island Bridge vs Midland) must not merge.
      const distinctVenue =
        venueA.length >= 8 &&
        venueB.length >= 8 &&
        !venueA.includes(venueB) &&
        !venueB.includes(venueA);
      if (distinctVenue && !(ma && mb && ma === mb && titlesInAliasCluster(a.title, b.title))) {
        // Same multi-venue fest title may still share metro — require alias cluster or URL.
        const urlA = (a.sourceUrl ?? '').split('?')[0]?.toLowerCase() ?? '';
        const urlB = (b.sourceUrl ?? '').split('?')[0]?.toLowerCase() ?? '';
        if (!(urlA && urlB && urlA === urlB)) {
          if (!(ma && mb && ma === mb)) return false;
          // Multi-venue fest variants with same title+day+metro: merge only when
          // titles are strong alias / exact-norm matches (not weak token overlap alone).
          if (!titlesInAliasCluster(a.title, b.title) && normalizeAdmissionTitle(a.title) !== normalizeAdmissionTitle(b.title)) {
            return false;
          }
        }
      } else if (!(ma && mb && ma === mb)) {
        return false;
      }
    }
  }

  if (a.startAt && b.startAt) {
    const ta = new Date(a.startAt).getTime();
    const tb = new Date(b.startAt).getTime();
    if (Number.isFinite(ta) && Number.isFinite(tb)) {
      const delta = Math.abs(ta - tb);
      // Same local day already checked; allow up to 12h for noon vs evening CT encodings.
      if (delta > 12 * 60 * 60 * 1000) {
        if (!isAllDayishIso(a.startAt) && !isAllDayishIso(b.startAt)) return false;
      }
    }
  }

  return true;
}

/**
 * Prefer publisher/organizer-supported start when merging duplicate candidates.
 * Nightlife / cabaret titles prefer evening CT clocks over noon placeholders.
 */
export function preferAdmissionStartIso(
  a: { startAt: string; title: string; extractedStartTime?: string | null; sourceUrl?: string | null },
  b: { startAt: string; title: string; extractedStartTime?: string | null; sourceUrl?: string | null },
): string {
  const score = (c: typeof a): number => {
    let s = 0;
    const t = (c.extractedStartTime ?? '').toLowerCase();
    if (/\b(?:9|10|11)\s*(?::\d{2})?\s*pm\b/i.test(t) || /\b21:|\b22:|\b23:/.test(t)) s += 50;
    if (/\b(?:[6-8])\s*(?::\d{2})?\s*pm\b/i.test(t)) s += 40;
    if (t) s += 10;
    const hourUtc = new Date(c.startAt).getUTCHours();
    // 02:00Z ≈ 9pm CT; 17:00Z ≈ noon CT — prefer evening for nightlife titles.
    if (/\b(?:cabaret|dance\s+party|nightlife|dj)\b/i.test(c.title)) {
      if (hourUtc >= 1 && hourUtc <= 6) s += 30;
      if (hourUtc >= 16 && hourUtc <= 18) s -= 20;
    }
    if (c.sourceUrl && /thepitchkc\.com|instagram\.com\/p\//i.test(c.sourceUrl)) s += 15;
    return s;
  };
  return score(a) >= score(b) ? a.startAt : b.startAt;
}
