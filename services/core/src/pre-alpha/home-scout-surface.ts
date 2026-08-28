/**
 * Home scout surface — raw web-search prose never renders; stale batches are history only.
 */

const RAW_SCOUT_MARKERS_RE =
  /\[[^\]]+\]\(https?:\/\/|bandsintown\.com|utm_source=openai|Here are some notable|For more information and ticket|^\s*https?:\/\//i;

const MARKDOWN_LINK_RE = /\[[^\]]+\]\([^)]+\)/g;
const BARE_URL_RE = /https?:\/\/[^\s)]+/gi;

export function looksLikeRawScoutProse(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  if (RAW_SCOUT_MARKERS_RE.test(text)) return true;
  if ((text.match(BARE_URL_RE) ?? []).length >= 2) return true;
  if (text.length > 400 && /Date:\*|Venue:\*|\*\*[A-Z]/.test(text)) return true;
  return false;
}

export function scrubScoutSummaryForHome(summary: string | null | undefined): string | null {
  if (!summary?.trim()) return null;
  if (looksLikeRawScoutProse(summary)) return null;
  const cleaned = summary
    .replace(MARKDOWN_LINK_RE, '')
    .replace(BARE_URL_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || looksLikeRawScoutProse(cleaned)) return null;
  return cleaned.slice(0, 220);
}

export const HOME_SCOUT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function isHomeScoutBatchFresh(createdAt: string | Date, now = new Date()): boolean {
  const t = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  if (Number.isNaN(t.getTime())) return false;
  return now.getTime() - t.getTime() <= HOME_SCOUT_MAX_AGE_MS;
}

export type HomeScoutItem = {
  contentItemId: string;
  title: string;
  location: string | null;
  eventStartsAt: string | null;
  sourceUrl: string | null;
};

/**
 * Shape discovery for Home: no raw summary, only fresh normalized upcoming items.
 * Stale batches return surface:null (caller may count them under Handled).
 */
export function shapeDiscoveryForHome(input: {
  createdAt: string;
  summary: string;
  items: HomeScoutItem[];
  createdCount?: number;
  now?: Date;
}): {
  surface: null | {
    createdAt: string;
    itemCount: number;
    items: HomeScoutItem[];
    /** Never raw search prose — short clean line or null. */
    blurb: string | null;
  };
  handledNote: string | null;
  suppressedReason: string | null;
} {
  const now = input.now ?? new Date();
  const fresh = isHomeScoutBatchFresh(input.createdAt, now);
  if (!fresh) {
    const n = input.createdCount ?? input.items.length;
    return {
      surface: null,
      handledNote:
        n > 0
          ? `Logged ${n} earlier web scout result${n === 1 ? '' : 's'} (batch not current)`
          : 'Earlier web scout batch expired from Home',
      suppressedReason: 'stale_scout_batch',
    };
  }

  const upcoming = input.items.filter((item) => {
    if (!item.title?.trim() || item.title.length < 4) return false;
    if (looksLikeRawScoutProse(item.title)) return false;
    if (!item.eventStartsAt) return false;
    const d = new Date(item.eventStartsAt);
    if (Number.isNaN(d.getTime())) return false;
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    return d.getTime() >= startOfToday.getTime() - 24 * 60 * 60 * 1000;
  });

  if (upcoming.length === 0) {
    return {
      surface: null,
      handledNote: null,
      suppressedReason: looksLikeRawScoutProse(input.summary)
        ? 'raw_scout_prose'
        : 'no_upcoming_normalized_items',
    };
  }

  return {
    surface: {
      createdAt: input.createdAt,
      itemCount: upcoming.length,
      items: upcoming.slice(0, 3),
      blurb: scrubScoutSummaryForHome(input.summary),
    },
    handledNote: null,
    suppressedReason: null,
  };
}
