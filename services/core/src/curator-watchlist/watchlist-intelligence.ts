import { createHash } from 'node:crypto';

/** Explicit Watchlist information types. Prefer these over inventing new dashboards. */
export const WATCHLIST_FINDING_TYPES = [
  'event',
  'opening_closing',
  'schedule_change',
  'promotion_sale',
  'product_menu_launch',
  'participation_call',
  'collaboration',
  'community_news',
  'venue_business_update',
  'other_verified_update',
] as const;

export type WatchlistFindingType = (typeof WATCHLIST_FINDING_TYPES)[number];

export type WatchlistRejectionReason =
  | 'page_chrome'
  | 'engagement_bait'
  | 'inspirational'
  | 'recycled_promo'
  | 'no_concrete_development'
  | 'expired'
  | 'duplicate'
  | 'unsupported_inference'
  | 'missing_evidence';

export type WatchlistDownstreamRoute =
  | 'calendar_eligible'
  | 'discover_review'
  | 'todays_brief'
  | 'early_signals'
  | 'watchlist_activity'
  | 'suppressed';

export type WatchlistYieldClass =
  | 'productive'
  | 'healthy_quiet'
  | 'low_yield'
  | 'duplicative'
  | 'degraded'
  | 'blocked'
  | 'unsupported'
  | 'needs_operator_review';

export type WatchlistFindingDraft = {
  type: WatchlistFindingType;
  title: string;
  summary: string;
  evidence: string;
  publishedAt: string | null;
  eventDate: string | null;
  confidence: 'low' | 'medium' | 'high';
  currentlyActionable: boolean;
  baselineKind: 'new' | 'historical_baseline';
  sourceUrl: string;
  watchedSource: string;
  retrievedAt: string;
  canonicalKey: string;
};

export type WatchlistClassification = {
  accepted: WatchlistFindingDraft[];
  rejected: Array<{
    reason: WatchlistRejectionReason;
    evidence: string;
    sourceUrl: string;
  }>;
};

export type WatchlistClassifyInput = {
  text: string;
  sourceUrl: string;
  watchedSource: string;
  retrievedAt: string;
  publishedAt?: string | null;
  firstCheckBaseline?: boolean;
  now?: Date;
  knownCanonicalKeys?: Set<string>;
};

const CHROME =
  /\b(followers|following|suggested for you|posts\s+\d|see translation|log in|sign up|cookie|privacy policy|terms of use)\b/i;
const BAIT =
  /\b(like (this|and comment)|comment below|tag a friend|link in bio|follow us|follow me|share this|giveaway how to enter|1️⃣\s*follow)\b/i;
const INSPIRATIONAL =
  /^(just a reminder|never give up|good vibes|monday motivation|god is|blessed to|grateful for)\b/i;
const EVENT =
  /\b(after ?party|concert|festival|live (at|show)|one night only|doors? at|tickets? (on sale|available)|performing|show tonight|this (thu|fri|sat|sun|wednesday|thursday|friday|saturday|sunday))\b/i;
const OPENING =
  /\b(grand opening|soft opening|now open|opening soon|coming soon|new location|we.?re open)\b/i;
const CLOSING =
  /\b(permanently closed|temporarily closed|last day|final (day|weekend|service)|closing (soon|down|our doors))\b/i;
const SCHEDULE =
  /\b(new hours|hours (change|changed)|rescheduled|postponed|cancelled|canceled|moved to|date change|time change|all week|sept \d+.+(until|thru|through))\b/i;
const PROMO =
  /\b(\d+\s?%\s?off|happy hour|lunch special|flash sale|limited time|on sale now|specials?:|free (admission|entry|cover))\b/i;
const MENU =
  /\b(new menu|now serving|introducing|seasonal (menu|launch)|new (item|dish|cocktail|pizza))\b/i;
const PARTICIPATION =
  /\b(vendor (spots?|applications?)|applications? (open|now)|calling (artists|vendors|creators)|submit (your|an) application|open call)\b/i;
const COLLAB =
  /\b(collab(oration)?|x @|presents:|partnership with|in partnership)\b/i;
const COMMUNITY =
  /\b(ribbon cutting|community (meeting|announcement|update)|redevelopment|construction (update|begins)|planning commission)\b/i;
const VENUE =
  /\b(under renovation|relocating|new address|patio (now )?open|kitchen closed)\b/i;

function normalizeTitle(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[#@]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

function firstSentence(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const cut = cleaned.split(/(?<=[.!?])\s+/)[0] ?? cleaned;
  return cut.slice(0, 200);
}

function extractIsoDate(text: string, now: Date): string | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const md = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?/i);
  if (!md) return null;
  const months: Record<string, string> = {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12',
  };
  const month = months[md[1]!.slice(0, 3).toLowerCase()];
  if (!month) return null;
  const day = String(md[2]).padStart(2, '0');
  const year = md[3] ?? String(now.getUTCFullYear());
  return `${year}-${month}-${day}`;
}

function isExpiredDate(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return d < today;
}

export function findingCanonicalKey(input: {
  watchedSource: string;
  type: WatchlistFindingType;
  title: string;
  eventDate?: string | null;
}): string {
  const title = input.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return createHash('sha256')
    .update([input.watchedSource.toLowerCase(), input.type, title, input.eventDate ?? ''].join('|'))
    .digest('hex')
    .slice(0, 24);
}

export function routeWatchlistFinding(finding: WatchlistFindingDraft): WatchlistDownstreamRoute {
  if (!finding.currentlyActionable && finding.baselineKind === 'historical_baseline') {
    return finding.type === 'event' ? 'suppressed' : 'watchlist_activity';
  }
  if (finding.type === 'event' && finding.eventDate && finding.confidence !== 'low') {
    return 'calendar_eligible';
  }
  if (
    finding.type === 'event' ||
    finding.type === 'participation_call' ||
    finding.type === 'opening_closing'
  ) {
    return finding.confidence === 'high' ? 'discover_review' : 'early_signals';
  }
  if (finding.type === 'schedule_change' || finding.type === 'community_news') {
    return 'todays_brief';
  }
  if (finding.confidence === 'low') return 'early_signals';
  return 'watchlist_activity';
}

function draft(
  input: WatchlistClassifyInput,
  type: WatchlistFindingType,
  now: Date,
  extra?: Partial<WatchlistFindingDraft>,
): WatchlistFindingDraft {
  const eventDate = extra?.eventDate ?? extractIsoDate(input.text, now);
  const currentlyActionable =
    extra?.currentlyActionable ??
    Boolean(
      OPENING.test(input.text) ||
        PROMO.test(input.text) ||
        PARTICIPATION.test(input.text) ||
        (eventDate && !isExpiredDate(eventDate, now)),
    );
  const baselineKind: WatchlistFindingDraft['baselineKind'] =
    input.firstCheckBaseline && !currentlyActionable ? 'historical_baseline' : 'new';
  const title = extra?.title ?? normalizeTitle(firstSentence(input.text));
  return {
    type,
    title,
    summary: extra?.summary ?? firstSentence(input.text),
    evidence: extra?.evidence ?? input.text.trim().slice(0, 400),
    publishedAt: input.publishedAt ?? null,
    eventDate,
    confidence: extra?.confidence ?? 'medium',
    currentlyActionable,
    baselineKind,
    sourceUrl: input.sourceUrl,
    watchedSource: input.watchedSource,
    retrievedAt: input.retrievedAt,
    canonicalKey: findingCanonicalKey({
      watchedSource: input.watchedSource,
      type,
      title,
      eventDate,
    }),
  };
}

export function classifyWatchlistText(input: WatchlistClassifyInput): WatchlistClassification {
  const now = input.now ?? new Date();
  const text = (input.text ?? '').trim();
  const accepted: WatchlistFindingDraft[] = [];
  const rejected: WatchlistClassification['rejected'] = [];
  const known = input.knownCanonicalKeys ?? new Set<string>();

  if (!text || text.length < 12) {
    rejected.push({ reason: 'missing_evidence', evidence: text, sourceUrl: input.sourceUrl });
    return { accepted, rejected };
  }
  if (CHROME.test(text) && text.length < 80) {
    rejected.push({ reason: 'page_chrome', evidence: text.slice(0, 160), sourceUrl: input.sourceUrl });
    return { accepted, rejected };
  }
  if (BAIT.test(text) && !EVENT.test(text) && !PARTICIPATION.test(text) && !PROMO.test(text)) {
    rejected.push({ reason: 'engagement_bait', evidence: text.slice(0, 160), sourceUrl: input.sourceUrl });
    return { accepted, rejected };
  }
  if (INSPIRATIONAL.test(text) && !EVENT.test(text) && !PROMO.test(text)) {
    rejected.push({ reason: 'inspirational', evidence: text.slice(0, 160), sourceUrl: input.sourceUrl });
    return { accepted, rejected };
  }
  if (/\b(rumor|maybe|might|coming soon-ish|stay tuned)\b/i.test(text) && !EVENT.test(text) && !PROMO.test(text)) {
    rejected.push({ reason: 'unsupported_inference', evidence: text.slice(0, 160), sourceUrl: input.sourceUrl });
    return { accepted, rejected };
  }

  const consider = (type: WatchlistFindingType, matched: boolean, extra?: Partial<WatchlistFindingDraft>) => {
    if (!matched) return;
    const item = draft(input, type, now, extra);
    if (isExpiredDate(item.eventDate, now) && type === 'promotion_sale') {
      rejected.push({ reason: 'expired', evidence: item.evidence, sourceUrl: input.sourceUrl });
      return;
    }
    if (known.has(item.canonicalKey) || accepted.some((a) => a.canonicalKey === item.canonicalKey)) {
      rejected.push({ reason: 'duplicate', evidence: item.title, sourceUrl: input.sourceUrl });
      return;
    }
    accepted.push(item);
    known.add(item.canonicalKey);
  };

  consider('opening_closing', OPENING.test(text) || CLOSING.test(text));
  consider('schedule_change', SCHEDULE.test(text) && !OPENING.test(text));
  consider('promotion_sale', PROMO.test(text));
  consider('product_menu_launch', MENU.test(text));
  consider('participation_call', PARTICIPATION.test(text));
  consider('collaboration', COLLAB.test(text) && EVENT.test(text));
  consider('community_news', COMMUNITY.test(text));
  consider('venue_business_update', VENUE.test(text));
  consider('event', EVENT.test(text), {
    confidence: /tickets? on sale|one night only|after ?party/i.test(text) ? 'high' : 'medium',
  });

  if (accepted.length === 0) {
    if (/[?]{2,}|‼️|🔥{3,}/.test(text) && text.length < 80) {
      rejected.push({ reason: 'no_concrete_development', evidence: text.slice(0, 160), sourceUrl: input.sourceUrl });
    } else if (/\b(maybe|might|stay tuned|coming soon-ish|rumor)\b/i.test(text)) {
      rejected.push({ reason: 'unsupported_inference', evidence: text.slice(0, 160), sourceUrl: input.sourceUrl });
    } else {
      rejected.push({ reason: 'no_concrete_development', evidence: text.slice(0, 160), sourceUrl: input.sourceUrl });
    }
  }

  return { accepted, rejected };
}

/** Collapse repeated posts about one announcement; keep separate announcements. */
export function collapseWatchlistFindings(findings: WatchlistFindingDraft[]): WatchlistFindingDraft[] {
  const seen = new Set<string>();
  const out: WatchlistFindingDraft[] = [];
  for (const finding of findings) {
    if (seen.has(finding.canonicalKey)) continue;
    seen.add(finding.canonicalKey);
    out.push(finding);
  }
  return out;
}

export function classifyWatchlistYield(input: {
  displayHealth: string;
  lastSuccessfulCheck: string | null;
  acceptedCount: number;
  lastAcceptedAt: string | null;
  now?: Date;
}): WatchlistYieldClass {
  if (input.displayHealth === 'blocked') return 'blocked';
  if (input.displayHealth === 'unsupported') return 'unsupported';
  if (input.displayHealth === 'degraded' || input.displayHealth === 'failed') return 'degraded';
  if (input.displayHealth === 'ready' || !input.lastSuccessfulCheck) return 'needs_operator_review';
  if (input.acceptedCount >= 3) return 'productive';
  if (input.acceptedCount >= 1) return 'productive';
  const now = input.now ?? new Date();
  const last = input.lastSuccessfulCheck ? new Date(input.lastSuccessfulCheck).getTime() : 0;
  if (last && now.getTime() - last < 36 * 60 * 60 * 1000) return 'healthy_quiet';
  return 'low_yield';
}

export function formatWatchlistBriefLines(input: {
  sourcesChecked: number;
  accepted: Array<{ title: string; watchedSource: string; type: string }>;
  awaitingReview: number;
  failedSources: string[];
  quietSources: number;
}): string[] {
  const lines: string[] = [];
  if (input.sourcesChecked > 0) {
    lines.push(
      `Watchlist checked ${input.sourcesChecked} source${input.sourcesChecked === 1 ? '' : 's'}.`,
    );
  }
  const top = input.accepted[0];
  if (top) {
    lines.push(`New from ${top.watchedSource}: ${top.title}`);
  } else if (input.quietSources > 0) {
    lines.push(`${input.quietSources} watched source${input.quietSources === 1 ? '' : 's'} had nothing new.`);
  }
  if (input.awaitingReview > 0) {
    lines.push(`${input.awaitingReview} Watchlist finding${input.awaitingReview === 1 ? '' : 's'} awaiting review.`);
  }
  if (input.failedSources.length > 0) {
    lines.push(`Needs attention: ${input.failedSources.slice(0, 2).join(', ')}`);
  }
  return lines.slice(0, 3);
}
