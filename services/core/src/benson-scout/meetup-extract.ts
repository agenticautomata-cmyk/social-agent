/**
 * Meetup public find/search extraction + relevance classification.
 * Uses public __NEXT_DATA__ Apollo state — no login required for visible results.
 */

export type MeetupRelevance = 'verified_relevant' | 'possibly_relevant' | 'not_relevant';

export type MeetupExtractionMethod = 'meetup_apollo_ssr' | 'meetup_json_ld' | 'none';

export type ExtractedMeetupEvent = {
  externalId: string | null;
  title: string;
  startDate: string | null;
  startDateTime: string | null;
  endDate: string | null;
  endDateTime: string | null;
  venue: string | null;
  address: string | null;
  city: string | null;
  regionState: string | null;
  organizer: string | null;
  groupUrlname: string | null;
  attendanceCount: number | null;
  eventUrl: string;
  evidence: string[];
  method: MeetupExtractionMethod;
  verificationState: 'verified' | 'partial' | 'unresolved_date';
  relevance: MeetupRelevance;
  needsReview: boolean;
  relevanceReasons: string[];
};

export type MeetupCapability = {
  looksLikeMeetupSearch: boolean;
  hasApolloState: boolean;
  hasJsonLdEvents: boolean;
  needsAdapter: boolean;
  reasons: string[];
};

export type MeetupExtractResult = {
  events: ExtractedMeetupEvent[];
  method: MeetupExtractionMethod;
  rejectionReasons: string[];
  pagination: {
    bounded: boolean;
    hasNextPage: boolean;
    furtherPagesNotFetched: boolean;
    resultContainerRendered: boolean;
  };
  capability: MeetupCapability;
};

export function isMeetupWatchUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /meetup\.com$/i.test(u.hostname) && (/\/find\//i.test(u.pathname) || /\/find\/?/i.test(u.pathname));
  } catch {
    return false;
  }
}

export function meetupCollectionHintsFromUrl(url: string): string[] {
  const hints: string[] = [];
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    for (const part of parts) {
      const decoded = decodeURIComponent(part).replace(/--/g, ' ').replace(/-/g, ' ').trim();
      if (decoded && !/^us$/i.test(decoded) && !/^(mo|ks|find)$/i.test(decoded)) {
        hints.push(decoded);
      }
    }
    const q = u.searchParams.get('keywords') || u.searchParams.get('query');
    if (q) hints.push(q);
  } catch {
    // ignore
  }
  return hints;
}

export function scoreMeetupRelevance(input: {
  title: string;
  description?: string | null;
  organizer?: string | null;
  venue?: string | null;
  collectionHints?: string[];
}): { relevance: MeetupRelevance; needsReview: boolean; reasons: string[] } {
  const hay = [input.title, input.description ?? '', input.organizer ?? '', input.venue ?? '']
    .join('\n')
    .toLowerCase();
  const reasons: string[] = [];

  const strong = [
    /african[\s-]?american/,
    /\bblack\b.{0,60}\b(art|culture|history|community|literature|professional|excellence|kansas city|kc)\b/,
    /\b(black art|black culture|black history|black literature)\b/,
    /18th\s*&\s*vine/,
    /juneteenth/,
    /naacp/,
    /urban league/,
    /hbcu/,
  ];
  const soft = [/\bblack\b/, /diversity/, /multicultural/, /civil rights/, /equity/];
  const noise = [
    /rich dad/,
    /cashflow/,
    /microsoft fabric/,
    /power bi/,
    /safari/,
    /eckankar/,
    /sing hu/,
    /faithtech/,
    /bible translation/,
    /craft beer/,
    /chiefs vs/,
  ];

  for (const re of noise) {
    if (re.test(hay)) {
      reasons.push(`noise:${re.source}`);
      return { relevance: 'not_relevant', needsReview: false, reasons };
    }
  }
  for (const re of strong) {
    if (re.test(hay)) {
      reasons.push(`strong:${re.source}`);
      return { relevance: 'verified_relevant', needsReview: false, reasons };
    }
  }
  for (const re of soft) {
    if (re.test(hay)) {
      reasons.push(`soft:${re.source}`);
      return { relevance: 'possibly_relevant', needsReview: true, reasons };
    }
  }
  if ((input.collectionHints ?? []).some((h) => /african|black/i.test(h))) {
    reasons.push('collection_hint_only');
    return { relevance: 'possibly_relevant', needsReview: true, reasons };
  }
  reasons.push('no_relevance_signals');
  return { relevance: 'not_relevant', needsReview: false, reasons };
}

export function detectMeetupCapability(html: string, pageUrl?: string): MeetupCapability {
  const reasons: string[] = [];
  const hasApolloState = /__APOLLO_STATE__/i.test(html) && /id=["']__NEXT_DATA__["']/i.test(html);
  const hasJsonLdEvents = /"@type"\s*:\s*"Event"/i.test(html);
  const looksLikeMeetupSearch =
    Boolean(pageUrl && isMeetupWatchUrl(pageUrl)) ||
    /meetup\.com/i.test(html) ||
    /find-results|Search events/i.test(html);
  if (hasApolloState) reasons.push('meetup_apollo_state');
  if (hasJsonLdEvents) reasons.push('meetup_json_ld');
  if (looksLikeMeetupSearch) reasons.push('meetup_search_surface');
  const needsAdapter = looksLikeMeetupSearch && !hasApolloState && !hasJsonLdEvents;
  if (needsAdapter) reasons.push('meetup_shell_without_results');
  return { looksLikeMeetupSearch, hasApolloState, hasJsonLdEvents, needsAdapter, reasons };
}

function resolveRef(
  state: Record<string, unknown>,
  ref: unknown,
): Record<string, unknown> | null {
  if (!ref || typeof ref !== 'object') return null;
  const key = (ref as { __ref?: string }).__ref;
  if (!key) return ref as Record<string, unknown>;
  const row = state[key];
  return row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
}

function splitIso(iso: string | null | undefined): { date: string | null; dateTime: string | null } {
  if (!iso?.trim()) return { date: null, dateTime: null };
  const m = iso.trim().match(/^(\d{4}-\d{2}-\d{2})T/);
  return { date: m?.[1] ?? null, dateTime: iso.trim() };
}

export function extractMeetupEventsFromHtml(html: string, pageUrl: string): MeetupExtractResult {
  const capability = detectMeetupCapability(html, pageUrl);
  const collectionHints = meetupCollectionHintsFromUrl(pageUrl);
  const rejectionReasons: string[] = [];
  const events: ExtractedMeetupEvent[] = [];

  const m = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m?.[1]) {
    return {
      events: [],
      method: 'none',
      rejectionReasons: ['meetup_next_data_missing'],
      pagination: {
        bounded: true,
        hasNextPage: false,
        furtherPagesNotFetched: false,
        resultContainerRendered: false,
      },
      capability,
    };
  }

  let state: Record<string, unknown> | null = null;
  let hasNextPage = false;
  try {
    const data = JSON.parse(m[1]) as {
      props?: { pageProps?: { __APOLLO_STATE__?: Record<string, unknown>; filters?: { keywords?: string } } };
    };
    state = data.props?.pageProps?.__APOLLO_STATE__ ?? null;
    if (data.props?.pageProps?.filters?.keywords) {
      collectionHints.push(data.props.pageProps.filters.keywords);
    }
    if (state) {
      for (const [key, value] of Object.entries(state)) {
        if (!key.startsWith('ROOT_QUERY')) continue;
        // walk for pageInfo.hasNextPage
        const blob = JSON.stringify(value);
        if (/"hasNextPage"\s*:\s*true/.test(blob)) hasNextPage = true;
      }
    }
  } catch {
    return {
      events: [],
      method: 'none',
      rejectionReasons: ['meetup_next_data_parse_failed'],
      pagination: {
        bounded: true,
        hasNextPage: false,
        furtherPagesNotFetched: false,
        resultContainerRendered: false,
      },
      capability,
    };
  }

  if (!state) {
    rejectionReasons.push('meetup_apollo_missing');
    return {
      events: [],
      method: 'none',
      rejectionReasons,
      pagination: {
        bounded: true,
        hasNextPage: false,
        furtherPagesNotFetched: false,
        resultContainerRendered: false,
      },
      capability,
    };
  }

  for (const [key, value] of Object.entries(state)) {
    if (!key.startsWith('Event:') || !value || typeof value !== 'object') continue;
    const ev = value as Record<string, unknown>;
    const title = String(ev.title ?? '').trim();
    if (!title) continue;
    const group = resolveRef(state, ev.group);
    const venue = resolveRef(state, ev.venue);
    const organizer =
      (typeof group?.name === 'string' ? group.name : null) ||
      (typeof group?.urlname === 'string' ? group.urlname : null);
    const venueName = typeof venue?.name === 'string' ? venue.name : null;
    const start = splitIso(typeof ev.dateTime === 'string' ? ev.dateTime : null);
    const eventUrl = typeof ev.eventUrl === 'string' ? ev.eventUrl : null;
    if (!eventUrl) continue;
    const rsvps = ev.rsvps as { totalCount?: number } | undefined;
    const attendanceCount = typeof rsvps?.totalCount === 'number' ? rsvps.totalCount : null;
    const scored = scoreMeetupRelevance({
      title,
      description: typeof ev.description === 'string' ? ev.description : null,
      organizer,
      venue: venueName,
      collectionHints,
    });
    events.push({
      externalId: `meetup:${String(ev.id ?? key.replace(/^Event:/, ''))}`,
      title,
      startDate: start.date,
      startDateTime: start.dateTime,
      endDate: null,
      endDateTime: null,
      venue: venueName,
      address: typeof venue?.address === 'string' ? venue.address : null,
      city: typeof venue?.city === 'string' ? venue.city : null,
      regionState: typeof venue?.state === 'string' ? venue.state : null,
      organizer,
      groupUrlname: typeof group?.urlname === 'string' ? group.urlname : null,
      attendanceCount,
      eventUrl,
      evidence: [
        'meetup_apollo_ssr',
        start.date ? `start:${start.date}` : 'start:unresolved',
        organizer ? `organizer:${organizer}` : 'organizer:missing',
        `relevance:${scored.relevance}`,
        ...scored.reasons.map((r) => `relevance_reason:${r}`),
      ],
      method: 'meetup_apollo_ssr',
      verificationState: start.date ? 'verified' : 'unresolved_date',
      relevance: scored.relevance,
      needsReview: scored.needsReview || scored.relevance === 'possibly_relevant',
      relevanceReasons: scored.reasons,
    });
  }

  if (events.length === 0) rejectionReasons.push('meetup_zero_events');

  return {
    events,
    method: events.length > 0 ? 'meetup_apollo_ssr' : 'none',
    rejectionReasons,
    pagination: {
      bounded: true,
      hasNextPage,
      furtherPagesNotFetched: hasNextPage,
      resultContainerRendered: events.length > 0 || /find-results/i.test(html),
    },
    capability,
  };
}

export function stableMeetupFingerprint(ev: ExtractedMeetupEvent): string {
  if (ev.externalId) return `id:${ev.externalId}`;
  return `url:${ev.eventUrl.toLowerCase()}|${ev.startDate ?? ''}`;
}
