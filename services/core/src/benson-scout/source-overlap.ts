/**
 * Cross-watcher source overlap / duplicate disposition.
 * Generalized: same-origin listing path families (e.g. /events/ vs /events/feed/).
 * Does not hard-code publishers.
 */

export type SourceOverlapDisposition =
  | 'authoritative'
  | 'duplicate_source'
  | 'superseded'
  | 'misconfigured'
  | 'distinct';

export type SourceOverlapResult = {
  disposition: SourceOverlapDisposition;
  reason: string;
  strongerUrl: string | null;
  weakerUrl: string | null;
};

function normalizePath(url: string): { origin: string; path: string } | null {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    return { origin: u.origin.toLowerCase(), path: path.toLowerCase() };
  } catch {
    return null;
  }
}

/**
 * Decide whether `candidateUrl` is a duplicate/superseded feed of `authoritativeUrl`.
 * Example: /events/feed/ is a weaker syndication surface of /events/.
 */
export function classifyListingSourceOverlap(input: {
  candidateUrl: string;
  authoritativeUrl: string;
  candidateContentType?: string | null;
  candidateIsFeed?: boolean;
}): SourceOverlapResult {
  const a = normalizePath(input.authoritativeUrl);
  const c = normalizePath(input.candidateUrl);
  if (!a || !c) {
    return {
      disposition: 'misconfigured',
      reason: 'unparseable_url',
      strongerUrl: null,
      weakerUrl: null,
    };
  }
  if (a.origin !== c.origin) {
    return {
      disposition: 'distinct',
      reason: 'different_origin',
      strongerUrl: null,
      weakerUrl: null,
    };
  }

  const authIsCollection =
    /\/events?$/.test(a.path) ||
    /\/event-calendars?$/.test(a.path) ||
    /\/calendar$/.test(a.path);
  const candIsFeed =
    input.candidateIsFeed ||
    /\/feed$/.test(c.path) ||
    /\.(rss|xml|atom)$/.test(c.path) ||
    /rss|atom|xml/i.test(input.candidateContentType ?? '');

  // /events/feed under /events collection → duplicate/superseded of the HTML calendar.
  if (authIsCollection && candIsFeed && (c.path === `${a.path}/feed` || c.path.startsWith(`${a.path}/feed`))) {
    return {
      disposition: 'duplicate_source',
      reason: 'same_origin_feed_of_html_calendar_collection',
      strongerUrl: input.authoritativeUrl,
      weakerUrl: input.candidateUrl,
    };
  }

  if (a.path === c.path) {
    return {
      disposition: 'duplicate_source',
      reason: 'identical_path',
      strongerUrl: input.authoritativeUrl,
      weakerUrl: input.candidateUrl,
    };
  }

  return {
    disposition: 'distinct',
    reason: 'same_origin_distinct_paths',
    strongerUrl: null,
    weakerUrl: null,
  };
}

/** Find whether a URL looks like a syndication feed of a listing collection. */
export function listingFeedSiblingOf(url: string): string | null {
  const n = normalizePath(url);
  if (!n) return null;
  if (/\/feed$/.test(n.path)) {
    const parent = n.path.replace(/\/feed$/, '') || '/';
    if (/\/events?$|\/event-calendars?$|\/calendar$/.test(parent)) {
      try {
        return new URL(parent + '/', n.origin).href;
      } catch {
        return null;
      }
    }
  }
  return null;
}
