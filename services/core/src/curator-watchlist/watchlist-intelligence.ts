import { createHash } from 'node:crypto';
import {
  isIsoExpired,
  reconcileStatedDateWithWeekday,
  resolveWatchlistDate,
  type DateTrustStatus,
} from './watchlist-date-trust.js';

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
  endIsoDate?: string | null;
  confidence: 'low' | 'medium' | 'high';
  currentlyActionable: boolean;
  baselineKind: 'new' | 'historical_baseline';
  sourceUrl: string;
  watchedSource: string;
  retrievedAt: string;
  canonicalKey: string;
  dateStatus: DateTrustStatus;
  role: 'primary' | 'secondary';
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
  /\b(like (this|and comment)|comment below|tag a friend|follow us|follow me|share this|giveaway how to enter|1️⃣\s*follow)\b/i;
const INSPIRATIONAL =
  /^(just a reminder|never give up|good vibes|monday motivation|god is|blessed to|grateful for|free advice)\b/i;
const THROWBACK = /\b(throwbackthursday|throwback|#tbt|on this day)\b/i;
const ATMOSPHERE =
  /^(some bands you meet|some debuts you don.?t forget|i know y.?all know|bright, refreshing|what.?s going on at)\b/i;
const HYPE_INVITE = /\b(come out an meet|we going up|good vibes)\b/i;

const BUSINESS_OPENING =
  /\b(grand opening|soft opening|now open at|we are now open|we.?re now open)\b/i;
const BUSINESS_CLOSING =
  /\b(permanently closed|temporarily closed|last day of (regular )?service|closing (soon|down|our doors)|final (day|weekend) of service)\b/i;
const SCHEDULE =
  /\b(new hours|hours (change|changed)|rescheduled|postponed|cancelled|canceled|moved to|date change|time change|no event (tomorrow|tonight|today))\b/i;
const WINDOW_SCHEDULE = /\b(all week long|.+ until (labor day|sept|oct|nov|dec))\b/i;
const PROMO_TERMS =
  /\b(\d+\s?%\s?off|\$\d+ (drink|lunch|special)|happy hour|lunch special|flash sale|limited[- ]time (offer|only)|drink specials?|free (admission|entry|cover))\b/i;
const MENU =
  /\b(new menu|now serving|seasonal (menu|launch)|new (item|dish|cocktail|pizza)s?\b)\b/i;
const PARTICIPATION =
  /\b(vendor (spots?|applications?)|applications? (open|now)|calling (artists|vendors|creators)|submit (your|an) application|open call)\b/i;
const COLLAB =
  /\b(in collaboration with|partnership with|in partnership with)\b/i;
const COMMUNITY =
  /\b(ribbon cutting|community (meeting|announcement|update)|redevelopment|construction (update|begins)|planning commission)\b/i;
const VENUE =
  /\b(under renovation|relocating|new address|kitchen closed for repairs)\b/i;
const CONCRETE_EVENT =
  /\b(after ?party|official after party|concert|festival|live at|doors? at|performing|one night only)\b/i;
const TICKET_EVENT = /\b(tickets? (on sale|available)|eventbrite)\b/i;
const NAMED_SHOW = /\b(ghostface|block party|monday night jam|labor day weekend|live in concert)\b/i;

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

function recentlyPublished(publishedAt: string | null, now: Date): boolean {
  if (!publishedAt) return false;
  const at = new Date(publishedAt);
  if (Number.isNaN(at.getTime())) return false;
  return now.getTime() - at.getTime() < 36 * 60 * 60 * 1000;
}

export function isWatchlistBriefEligible(
  finding: Pick<
    WatchlistFindingDraft,
    | 'baselineKind'
    | 'currentlyActionable'
    | 'confidence'
    | 'dateStatus'
    | 'eventDate'
    | 'type'
    | 'publishedAt'
  > & { endIsoDate?: string | null },
  now: Date = new Date(),
): boolean {
  if (finding.baselineKind === 'historical_baseline') return false;
  if (finding.confidence === 'low') return false;
  if (finding.dateStatus === 'contradictory') return false;
  if (finding.dateStatus === 'uncertain' && (finding.type === 'event' || Boolean(finding.eventDate))) return false;
  if (!finding.currentlyActionable) return false;
  if (isIsoExpired(finding.eventDate, now, finding.endIsoDate ?? null)) return false;
  return true;
}

function hasConcreteDevelopment(text: string): boolean {
  return (
    BUSINESS_OPENING.test(text) ||
    BUSINESS_CLOSING.test(text) ||
    SCHEDULE.test(text) ||
    WINDOW_SCHEDULE.test(text) ||
    PROMO_TERMS.test(text) ||
    MENU.test(text) ||
    PARTICIPATION.test(text) ||
    COLLAB.test(text) ||
    COMMUNITY.test(text) ||
    VENUE.test(text) ||
    CONCRETE_EVENT.test(text) ||
    (TICKET_EVENT.test(text) && (CONCRETE_EVENT.test(text) || NAMED_SHOW.test(text)))
  );
}

export function routeWatchlistFinding(finding: WatchlistFindingDraft): WatchlistDownstreamRoute {
  if (finding.dateStatus === 'contradictory' || finding.dateStatus === 'uncertain') {
    if (finding.type === 'event' && !finding.eventDate) return 'early_signals';
    if (finding.dateStatus === 'contradictory') return 'early_signals';
  }
  if (!finding.currentlyActionable && finding.baselineKind === 'historical_baseline') {
    return 'suppressed';
  }
  const throwback = THROWBACK.test(`${finding.title} ${finding.evidence}`);
  const discoverOk =
    !throwback &&
    finding.baselineKind !== 'historical_baseline' &&
    finding.confidence === 'high' &&
    finding.currentlyActionable &&
    finding.dateStatus === 'resolved' &&
    (finding.type === 'participation_call' || (finding.type === 'event' && Boolean(finding.eventDate))) &&
    finding.role === 'primary';
  if (finding.type === 'event' && finding.eventDate && finding.confidence !== 'low' && finding.dateStatus === 'resolved') {
    if (discoverOk && finding.confidence === 'high' && CONCRETE_EVENT.test(finding.evidence)) {
      return 'calendar_eligible';
    }
    return 'calendar_eligible';
  }
  if (discoverOk) return 'discover_review';
  if (finding.type === 'event' || finding.type === 'participation_call' || finding.type === 'opening_closing') {
    return 'early_signals';
  }
  if (
    (finding.type === 'schedule_change' || finding.type === 'community_news' || finding.type === 'promotion_sale') &&
    isWatchlistBriefEligible(finding)
  ) {
    return 'todays_brief';
  }
  if (finding.confidence === 'low') return 'early_signals';
  return 'watchlist_activity';
}

function draft(
  input: WatchlistClassifyInput,
  type: WatchlistFindingType,
  now: Date,
  extra?: Partial<WatchlistFindingDraft> & { endIsoDate?: string | null },
): WatchlistFindingDraft {
  const trust = resolveWatchlistDate({
    text: input.text,
    publishedAt: input.publishedAt,
    now,
  });
  const eventDate = extra?.eventDate !== undefined ? extra.eventDate : trust.isoDate;
  const dateStatus = extra?.dateStatus ?? trust.status;
  const expired = isIsoExpired(eventDate, now, extra?.endIsoDate ?? trust.endIsoDate);
  const concrete = hasConcreteDevelopment(input.text);
  const currentlyActionable =
    extra?.currentlyActionable ??
    Boolean(concrete && !expired && dateStatus !== 'contradictory');
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
    endIsoDate: extra?.endIsoDate ?? trust.endIsoDate,
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
    dateStatus,
    role: extra?.role ?? 'primary',
  };
}

function detectTypes(text: string): WatchlistFindingType[] {
  const types: WatchlistFindingType[] = [];
  const ticketOnly = TICKET_EVENT.test(text) && !PROMO_TERMS.test(text);
  if (BUSINESS_OPENING.test(text) || BUSINESS_CLOSING.test(text)) {
    if (!HYPE_INVITE.test(text) || BUSINESS_CLOSING.test(text) || /now open at/i.test(text)) {
      types.push('opening_closing');
    }
  }
  if (SCHEDULE.test(text) || WINDOW_SCHEDULE.test(text)) types.push('schedule_change');
  if (PROMO_TERMS.test(text) && !ticketOnly) types.push('promotion_sale');
  if (MENU.test(text)) types.push('product_menu_launch');
  if (PARTICIPATION.test(text)) types.push('participation_call');
  if (COLLAB.test(text)) types.push('collaboration');
  if (COMMUNITY.test(text)) types.push('community_news');
  if (VENUE.test(text)) types.push('venue_business_update');
  if (CONCRETE_EVENT.test(text) || (TICKET_EVENT.test(text) && NAMED_SHOW.test(text))) {
    types.push('event');
  }
  return types;
}

const TYPE_PRIORITY: WatchlistFindingType[] = [
  'opening_closing',
  'schedule_change',
  'participation_call',
  'product_menu_launch',
  'promotion_sale',
  'collaboration',
  'community_news',
  'venue_business_update',
  'event',
  'other_verified_update',
];

function choosePrimaryAndSecondary(types: WatchlistFindingType[]): {
  primary: WatchlistFindingType | null;
  secondary: WatchlistFindingType | null;
} {
  const ordered = TYPE_PRIORITY.filter((t) => types.includes(t));
  const primary = ordered[0] ?? null;
  const secondary = ordered[1] ?? null;
  if (!primary || !secondary) return { primary, secondary: null };
  const allowed =
    (primary === 'event' && (secondary === 'participation_call' || secondary === 'promotion_sale')) ||
    (primary === 'schedule_change' && secondary === 'event') ||
    (primary === 'participation_call' && secondary === 'event') ||
    (primary === 'promotion_sale' && secondary === 'event');
  if (primary === 'event' && secondary === 'promotion_sale') return { primary, secondary: null };
  if (primary === 'event' && secondary === 'participation_call') return { primary, secondary };
  if (primary === 'participation_call' && secondary === 'event') return { primary, secondary };
  if (primary === 'schedule_change' && secondary === 'event') return { primary, secondary };
  return { primary, secondary: allowed ? secondary : null };
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
  if (/\bfifa world cup is over\b/i.test(text) || /^free advice\b/i.test(text)) {
    rejected.push({ reason: 'no_concrete_development', evidence: text.slice(0, 160), sourceUrl: input.sourceUrl });
    return { accepted, rejected };
  }
  if (ATMOSPHERE.test(text) && !PROMO_TERMS.test(text) && !BUSINESS_OPENING.test(text) && !PARTICIPATION.test(text)) {
    const remainderTrust = resolveWatchlistDate({ text, publishedAt: input.publishedAt, now });
    const staleTonight = isIsoExpired(remainderTrust.isoDate, now, remainderTrust.endIsoDate);
    if (staleTonight || !/\b(\$\d+ per show|doors? at|tickets?:)\b/i.test(text)) {
      rejected.push({ reason: 'no_concrete_development', evidence: text.slice(0, 160), sourceUrl: input.sourceUrl });
      return { accepted, rejected };
    }
  }
  if (HYPE_INVITE.test(text) && !BUSINESS_CLOSING.test(text) && !BUSINESS_OPENING.test(text) && !CONCRETE_EVENT.test(text) && !PARTICIPATION.test(text) && !PROMO_TERMS.test(text) && !SCHEDULE.test(text)) {
    rejected.push({ reason: 'no_concrete_development', evidence: text.slice(0, 160), sourceUrl: input.sourceUrl });
    return { accepted, rejected };
  }
  if (BAIT.test(text) && !hasConcreteDevelopment(text)) {
    rejected.push({ reason: 'engagement_bait', evidence: text.slice(0, 160), sourceUrl: input.sourceUrl });
    return { accepted, rejected };
  }
  if (INSPIRATIONAL.test(text) && !hasConcreteDevelopment(text)) {
    rejected.push({ reason: 'inspirational', evidence: text.slice(0, 160), sourceUrl: input.sourceUrl });
    return { accepted, rejected };
  }
  if (/\b(rumor|maybe|might|coming soon-ish|stay tuned)\b/i.test(text) && !hasConcreteDevelopment(text)) {
    rejected.push({ reason: 'unsupported_inference', evidence: text.slice(0, 160), sourceUrl: input.sourceUrl });
    return { accepted, rejected };
  }
  if (!hasConcreteDevelopment(text)) {
    rejected.push({ reason: 'no_concrete_development', evidence: text.slice(0, 160), sourceUrl: input.sourceUrl });
    return { accepted, rejected };
  }

  const trust = resolveWatchlistDate({ text, publishedAt: input.publishedAt, now });
  const { primary, secondary } = choosePrimaryAndSecondary(detectTypes(text));
  if (!primary) {
    rejected.push({ reason: 'no_concrete_development', evidence: text.slice(0, 160), sourceUrl: input.sourceUrl });
    return { accepted, rejected };
  }

  const consider = (type: WatchlistFindingType, role: 'primary' | 'secondary') => {
    const item = draft(input, type, now, {
      role,
      dateStatus: trust.status,
      eventDate: trust.isoDate,
      endIsoDate: trust.endIsoDate,
      confidence:
        type === 'event' && CONCRETE_EVENT.test(text) && trust.status === 'resolved' && !THROWBACK.test(text)
          ? 'high'
          : THROWBACK.test(text)
            ? 'low'
            : 'medium',
    });
    if (isIsoExpired(item.eventDate, now, trust.endIsoDate) && type === 'promotion_sale') {
      rejected.push({ reason: 'expired', evidence: item.evidence, sourceUrl: input.sourceUrl });
      return;
    }
    if (known.has(item.canonicalKey) || accepted.some((a) => a.canonicalKey === item.canonicalKey)) {
      rejected.push({ reason: 'duplicate', evidence: item.title, sourceUrl: input.sourceUrl });
      return;
    }
    if (item.baselineKind === 'historical_baseline' && !item.currentlyActionable) {
      rejected.push({ reason: 'expired', evidence: item.title, sourceUrl: input.sourceUrl });
      return;
    }
    accepted.push(item);
    known.add(item.canonicalKey);
  };

  consider(primary, 'primary');
  if (secondary) consider(secondary, 'secondary');
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
  if (input.acceptedCount >= 1) return 'productive';
  const now = input.now ?? new Date();
  const last = input.lastSuccessfulCheck ? new Date(input.lastSuccessfulCheck).getTime() : 0;
  if (last && now.getTime() - last < 36 * 60 * 60 * 1000) return 'healthy_quiet';
  return 'low_yield';
}

export function formatWatchlistBriefLines(input: {
  sourcesChecked: number;
  accepted: Array<{
    title: string;
    watchedSource: string;
    type: string;
    newlyPublished?: boolean;
    currentlyActionable?: boolean;
    baselineKind?: string;
    dateStatus?: string;
    confidence?: string;
    eventDate?: string | null;
    publishedAt?: string | null;
  }>;
  awaitingReview: number;
  failedSources: string[];
  quietSources: number;
  now?: Date;
}): string[] {
  const now = input.now ?? new Date();
  const lines: string[] = [];
  if (input.sourcesChecked > 0) {
    lines.push(
      `Watchlist checked ${input.sourcesChecked} source${input.sourcesChecked === 1 ? '' : 's'}.`,
    );
  }
  const eligible = input.accepted.filter((row) =>
    isWatchlistBriefEligible(
      {
        baselineKind: (row.baselineKind as WatchlistFindingDraft['baselineKind']) ?? 'new',
        currentlyActionable: row.currentlyActionable ?? true,
        confidence: (row.confidence as WatchlistFindingDraft['confidence']) ?? 'medium',
        dateStatus: (row.dateStatus as DateTrustStatus) ?? 'resolved',
        eventDate: row.eventDate ?? null,
        type: (row.type as WatchlistFindingType) ?? 'event',
        publishedAt: row.publishedAt ?? null,
      },
      now,
    ),
  );
  const top = eligible[0];
  if (top) {
    const prefix = recentlyPublished(top.publishedAt ?? null, now) ? 'New from' : 'Watchlist:';
    lines.push(`${prefix} ${top.watchedSource}: ${top.title}`);
  } else if (input.quietSources > 0) {
    lines.push(`${input.quietSources} watched source${input.quietSources === 1 ? '' : 's'} had nothing currently actionable.`);
  }
  if (input.awaitingReview > 0) {
    lines.push(`${input.awaitingReview} Watchlist finding${input.awaitingReview === 1 ? '' : 's'} awaiting review.`);
  }
  if (input.failedSources.length > 0) {
    lines.push(`Needs attention: ${input.failedSources.slice(0, 2).join(', ')}`);
  }
  return lines.slice(0, 3);
}

export { reconcileStatedDateWithWeekday, resolveWatchlistDate };
