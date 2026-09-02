import { createHash } from 'node:crypto';
import {
  addUtcDays,
  chicagoCalendarIso,
  isIsoExpired,
  reconcileStatedDateWithWeekday,
  resolveWatchlistDate,
  weekdayNameFromIsoDate,
  type DateTrustStatus,
} from './watchlist-date-trust.js';
import { watchlistDisplayHealth } from './watchlist-state.js';

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
  occurrenceIdentity?: string | null;
  provenanceUrls?: string[];
  venue?: string | null;
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
const ENGAGEMENT_LED =
  /\b(help us settle|age[- ]old question|was (he|she|they) saying|who agrees|this or that|drop (a|your) (comment|answer|vote)|what do y'?all think|comment your)\b/i;
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
  /\b(vendor (spots?|applications?|space)|become a vendor|applications? (open|now)|calling (artists|vendors|creators)|submit (your|an) application|open call)\b/i;
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

export type WatchlistOccurrenceInput = {
  title: string;
  evidence?: string | null;
  eventDate?: string | null;
  venue?: string | null;
  occurrenceIdentity?: string | null;
  type?: string;
  publishedAt?: string | null;
  now?: Date;
};

function normalizeOccurrenceName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\bfeat(?:uring)?\b[\s\S]*$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeVenueName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/amphitheatre/g, 'amphitheater')
    .replace(/theatre/g, 'theater')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractVenueFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const named = text.match(/\b(grandview amphitheatre|grandview amphitheater|the boone theater)\b/i);
  if (named?.[0]) return named[0];
  const amph = text.match(/\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s+amphitheat(?:er|re)\b/);
  if (amph?.[0]) return amph[0];
  const at = text.match(
    /\bat\s+([A-Z][A-Za-z0-9'&.-]+(?:\s+[A-Z][A-Za-z0-9'&.-]+){0,3})(?:\s+for\b|,|\.|$)/,
  );
  return at?.[1]?.trim() ?? null;
}

/** Source-independent event name for cross-account occurrence matching. */
export function extractNamedOccurrence(title: string, evidence?: string | null): string | null {
  const blob = `${title}\n${evidence ?? ''}`;
  const love = blob.match(/\bfor the love of r\s*[&+]?\s*b(?:\s+festival|\s+concert)?\b/i);
  if (love) {
    return normalizeOccurrenceName(love[0].replace(/\bconcert\b/i, 'festival'));
  }
  const fest = blob.match(/\b([A-Za-z0-9][^.\n!?]{4,70}?\bfestival)\b/i);
  if (fest) {
    const name = normalizeOccurrenceName(fest[1] ?? fest[0]!);
    if (name && !/^(i know|y all|help us|why y all|was he saying)/.test(name)) return name;
  }
  const fromTitle = normalizeOccurrenceName(title);
  if (
    fromTitle.split(' ').length >= 4 &&
    !/^(i know|y all|help us|why y all|was he saying|sign up)/.test(fromTitle)
  ) {
    return fromTitle;
  }
  return null;
}

export function watchlistOccurrenceIdentityKeys(input: WatchlistOccurrenceInput): string[] {
  const name = extractNamedOccurrence(input.title, input.evidence);
  if (!name) return [];
  const date = input.eventDate ?? '';
  const venue = normalizeVenueName(input.venue ?? extractVenueFromText(`${input.title}\n${input.evidence ?? ''}`) ?? '');
  const keys: string[] = [];
  const add = (value: string) =>
    keys.push(createHash('sha256').update(value).digest('hex').slice(0, 24));
  if (date) add(`occ:${name}|${date}`);
  if (date && venue) add(`occ:${name}|${date}|${venue}`);
  return [...new Set(keys)];
}

export function watchlistOccurrenceIdentity(input: WatchlistOccurrenceInput): string | null {
  return watchlistOccurrenceIdentityKeys(input)[0] ?? null;
}

function occurrenceDate(input: WatchlistOccurrenceInput): string | null {
  if (input.eventDate) return input.eventDate;
  const resolved = resolveWatchlistDate({
    text: `${input.title}\n${input.evidence ?? ''}`,
    publishedAt: input.publishedAt,
    now: input.now,
  });
  return resolved.isoDate;
}

function isEventOccurrenceType(type?: string): boolean {
  if (!type) return true;
  return type === 'event' || type === 'curator_event_lead';
}

export function sameWatchlistOccurrence(
  a: WatchlistOccurrenceInput,
  b: WatchlistOccurrenceInput,
): boolean {
  if (a.type && b.type && isEventOccurrenceType(a.type) !== isEventOccurrenceType(b.type)) {
    return false;
  }
  const nameA = extractNamedOccurrence(a.title, a.evidence);
  const nameB = extractNamedOccurrence(b.title, b.evidence);
  if (!nameA || !nameB || nameA !== nameB) return false;
  const dateA = occurrenceDate(a);
  const dateB = occurrenceDate(b);
  if (!dateA || !dateB || dateA !== dateB) return false;
  const venueA = normalizeVenueName(
    a.venue ?? extractVenueFromText(`${a.title}\n${a.evidence ?? ''}`) ?? '',
  );
  const venueB = normalizeVenueName(
    b.venue ?? extractVenueFromText(`${b.title}\n${b.evidence ?? ''}`) ?? '',
  );
  if (venueA && venueB && venueA !== venueB) return false;
  return true;
}

function findingStrength(finding: Pick<WatchlistFindingDraft, 'confidence' | 'currentlyActionable' | 'role' | 'title' | 'evidence' | 'eventDate' | 'type'>): number {
  let score = 0;
  if (finding.confidence === 'high') score += 4;
  else if (finding.confidence === 'medium') score += 2;
  if (finding.currentlyActionable) score += 2;
  if (finding.role === 'primary') score += 1;
  if (finding.eventDate) score += 2;
  if (/festival/i.test(`${finding.title} ${finding.evidence}`)) score += 3;
  if (finding.type === 'event') score += 1;
  score += Math.min(finding.evidence.length, 200) / 200;
  return score;
}

function recentlyPublished(publishedAt: string | null, now: Date): boolean {
  if (!publishedAt) return false;
  const at = new Date(publishedAt);
  if (Number.isNaN(at.getTime())) return false;
  return now.getTime() - at.getTime() < 36 * 60 * 60 * 1000;
}

function isWeakCaptionTitle(title: string): boolean {
  const t = title.replace(/\s+/g, ' ').trim();
  return /^(sign up|click |secure your spot|become a|link in (bio|our bio)|got questions|y'?all help|what are you doing)/i.test(t);
}

export function isEngagementLedText(text: string): boolean {
  const cleaned = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return false;
  if (ENGAGEMENT_LED.test(cleaned) || BAIT.test(cleaned)) return true;
  const head = firstSentence(cleaned);
  if (/\?/.test(head) && !PROMO_TERMS.test(head) && !SCHEDULE.test(head) && !BUSINESS_OPENING.test(head) && !PARTICIPATION.test(head)) {
    return true;
  }
  return false;
}

function blobForFinding(finding: {
  title?: string | null;
  summary?: string | null;
  evidence?: string | null;
}): string {
  return [finding.title, finding.summary, finding.evidence].filter(Boolean).join('\n');
}

function formatIsoLongDate(iso: string): string | null {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (Number.isNaN(dt.getTime())) return null;
  const weekday = weekdayNameFromIsoDate(iso);
  const weekdayLabel = weekday ? `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}` : null;
  const long = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(dt);
  return weekdayLabel ? `${weekdayLabel}, ${long}` : long;
}

function normalizeHours(raw: string): string {
  return raw
    .replace(/\s*-\s*/g, '–')
    .replace(/\s*to\s*/gi, '–')
    .replace(/(\d)\s*(am|pm)/gi, (_m, digit: string, mer: string) => `${digit} ${mer.toUpperCase()}`);
}

type BriefFinding = {
  baselineKind: WatchlistFindingDraft['baselineKind'] | string;
  currentlyActionable: boolean;
  confidence: WatchlistFindingDraft['confidence'] | string;
  dateStatus: DateTrustStatus | string;
  eventDate: string | null;
  type: string;
  publishedAt?: string | null;
  title: string;
  endIsoDate?: string | null;
  evidence?: string | null;
  summary?: string | null;
  watchedSource?: string;
  venue?: string | null;
};

const BRIEF_TYPES = new Set<string>([
  'opening_closing',
  'schedule_change',
  'promotion_sale',
  'product_menu_launch',
  'participation_call',
  'collaboration',
  'community_news',
  'venue_business_update',
  'event',
  'other_verified_update',
]);

function relativeCanceledOccurrenceIso(
  text: string,
  publishedAt: string | null | undefined,
): string | null {
  if (!publishedAt) return null;
  const at = new Date(publishedAt);
  if (Number.isNaN(at.getTime())) return null;
  const publishedDay = chicagoCalendarIso(at);
  if (/\btoday['’]?s?\b/i.test(text) || /\btonight\b/i.test(text)) return publishedDay;
  if (/\btomorrow\b/i.test(text)) return addUtcDays(publishedDay, 1);
  return null;
}

function replacementDateAfterCancel(
  finding: BriefFinding,
  canceledOn: string | null,
): string | null {
  const stored = finding.eventDate;
  if (!stored) return null;
  if (canceledOn && stored > canceledOn) return stored;
  if (canceledOn && stored === canceledOn) return null;
  if (!canceledOn) return stored;
  return null;
}

function summarizeStormCancelForBrief(finding: BriefFinding, now: Date): string | null {
  const text = blobForFinding(finding);
  const canceledOn = relativeCanceledOccurrenceIso(text, finding.publishedAt);
  const replacement = replacementDateAfterCancel(finding, canceledOn);
  if (replacement && !isIsoExpired(replacement, now, finding.endIsoDate ?? null)) {
    const when = formatIsoLongDate(replacement);
    return when ? `Next date is ${when}.` : null;
  }
  return null;
}

export function summarizeWatchlistFindingForBrief(
  finding: BriefFinding,
  now: Date = new Date(),
): string | null {
  const text = blobForFinding(finding);
  if (!text.trim()) return null;
  if (isEngagementLedText(finding.title ?? '') || isEngagementLedText(firstSentence(text))) return null;
  if (isWeakCaptionTitle(finding.title ?? '') && !PARTICIPATION.test(text) && !PROMO_TERMS.test(text) && !SCHEDULE.test(text)) {
    return null;
  }

  if (finding.type === 'schedule_change' || SCHEDULE.test(text) || WINDOW_SCHEDULE.test(text)) {
    if (/canceled|cancelled/i.test(text) && /storm/i.test(text)) {
      return summarizeStormCancelForBrief(finding, now);
    }
    if (/all week long/i.test(text) && /labor day/i.test(text)) {
      return 'Food truck is out all week through Labor Day, September 7.';
    }
    if (/rescheduled|postponed|moved to|no event/i.test(text) && finding.eventDate) {
      const when = formatIsoLongDate(finding.eventDate);
      return when ? `Schedule change: next date is ${when}.` : null;
    }
    return null;
  }

  if (finding.type === 'promotion_sale' || PROMO_TERMS.test(text)) {
    const hours = text.match(/(\d{1,2}\s*(?:am|pm)\s*(?:-|–|to)\s*\d{1,2}\s*(?:am|pm))/i);
    const price = text.match(/\$\d+(?:\.\d{2})?/);
    const addr = text.match(/\b(\d{3,5}\s+[A-Za-z0-9.'-]+(?:\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Main))?)/i);
    if (/fish friday/i.test(text) && hours) {
      const where = addr
        ? ` at ${addr[1]!.replace(/\s+/g, ' ').trim().replace(/\s+(St|Street|Ave|Avenue)\.?$/i, '')}`
        : '';
      return `Fish Friday special runs ${normalizeHours(hours[1]!)}${where}.`;
    }
    if (price && /drink special/i.test(text)) {
      return `${price[0]} drink specials.`;
    }
    if (price && /wings/i.test(text)) {
      return `${price[0]} wings${/happy hour/i.test(text) ? ' during reverse happy hour' : ''}.`;
    }
    if (hours && /lunch special/i.test(text)) {
      return `Lunch special runs ${normalizeHours(hours[1]!)}.`;
    }
    if (PROMO_TERMS.test(text) && (price || /happy hour/i.test(text))) {
      const offer = [price?.[0], /happy hour/i.test(text) ? 'happy hour' : null, hours ? normalizeHours(hours[1]!) : null]
        .filter(Boolean)
        .join(', ');
      if (!offer || /^\d{1,2} (AM|PM)–\d{1,2} (AM|PM)\.?$/i.test(offer)) return null;
      return `${offer}.`;
    }
    return null;
  }

  if (finding.type === 'participation_call' || PARTICIPATION.test(text)) {
    if (/vendor (spots?|space)|become a vendor/i.test(text)) {
      const price = text.match(/\$\d+/);
      const when = finding.eventDate ? formatIsoLongDate(finding.eventDate) : null;
      if (price && when) return `Vendor spaces start at ${price[0]} for ${when}.`;
      if (when) return `Vendor spots are available for ${when}.`;
      if (price) return `Vendor spaces start at ${price[0]}.`;
      return 'Vendor spots are available.';
    }
    if (PARTICIPATION.test(text) && !isWeakCaptionTitle(firstSentence(text))) {
      return firstSentence(text).slice(0, 160);
    }
    return null;
  }

  if (finding.type === 'opening_closing') {
    if (BUSINESS_CLOSING.test(text)) return firstSentence(text).slice(0, 160);
    if (BUSINESS_OPENING.test(text)) return firstSentence(text).slice(0, 160);
    return null;
  }

  if (finding.type === 'product_menu_launch' && MENU.test(text)) {
    const named = text.match(/\bnew (?:menu|item|dish|cocktail)s?\b/i);
    return named ? firstSentence(text).slice(0, 160) : null;
  }

  if (finding.type === 'event' || finding.type === 'curator_event_lead') {
    if (isEngagementLedText(text)) return null;
    const festival = text.match(
      /\b(?:catch .+ live at|live at) the ([^.!\n]{8,80}?) on (saturday,\s+)?september\s+(\d{1,2})(?:st|nd|rd|th)?(?: at ([^.!\n]{4,60}))?/i,
    );
    if (festival && finding.eventDate) {
      const when = formatIsoLongDate(finding.eventDate);
      const venue = festival[4]?.replace(/\s+/g, ' ').trim();
      if (when) {
        return venue
          ? `${festival[1]!.trim()} is ${when} at ${venue}.`
          : `${festival[1]!.trim()} is ${when}.`;
      }
    }
    if (finding.eventDate && finding.title && !isEngagementLedText(finding.title) && !/\?/.test(finding.title)) {
      const when = formatIsoLongDate(finding.eventDate);
      const name = finding.title.replace(/\s+/g, ' ').trim().slice(0, 90);
      if (when && name.length >= 4 && !/^(y'?all|i know|what'?s going|some )/i.test(name)) {
        return `${name} is ${when}.`;
      }
    }
    return null;
  }

  if (finding.type === 'collaboration' && finding.eventDate && COLLAB.test(text)) {
    const when = formatIsoLongDate(finding.eventDate);
    return when ? `Collaboration event is ${when}.` : null;
  }

  if (COMMUNITY.test(text) || VENUE.test(text)) {
    return firstSentence(text).slice(0, 160);
  }

  return null;
}

export function watchlistBriefRank(finding: BriefFinding): number {
  const text = blobForFinding(finding).toLowerCase();
  if (finding.type === 'schedule_change' && /cancel|closed|reschedule|postponed|no event/.test(text)) return 100;
  if (finding.type === 'schedule_change') return 95;
  if (finding.type === 'opening_closing' && BUSINESS_CLOSING.test(text)) return 98;
  if (finding.type === 'participation_call' || PARTICIPATION.test(text)) return 90;
  if (finding.type === 'opening_closing') return 80;
  if (finding.type === 'community_news' || finding.type === 'venue_business_update') return 75;
  if (finding.type === 'promotion_sale' || finding.type === 'product_menu_launch') return 70;
  if (finding.type === 'event' || finding.type === 'curator_event_lead') return 60;
  if (finding.type === 'collaboration') return 55;
  return 40;
}

export function isWatchlistBriefEligible(finding: BriefFinding, now: Date = new Date()): boolean {
  if (finding.baselineKind === 'historical_baseline') return false;
  if (finding.confidence === 'low') return false;
  if (finding.dateStatus === 'contradictory') return false;
  if (finding.dateStatus === 'uncertain' && (finding.type === 'event' || Boolean(finding.eventDate))) return false;
  if (!finding.currentlyActionable) return false;
  if (isIsoExpired(finding.eventDate, now, finding.endIsoDate ?? null)) return false;
  if (!BRIEF_TYPES.has(finding.type) && finding.type !== 'curator_event_lead') return false;
  if (isEngagementLedText(finding.title ?? '') || isEngagementLedText(blobForFinding(finding))) return false;
  if (!summarizeWatchlistFindingForBrief(finding, now)) return false;
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
    occurrenceIdentity: watchlistOccurrenceIdentity({
      title,
      evidence: extra?.evidence ?? input.text.trim().slice(0, 400),
      eventDate,
      venue: extra?.venue ?? null,
    }),
    provenanceUrls: extra?.provenanceUrls ?? [input.sourceUrl],
    venue: extra?.venue ?? null,
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
  if (isEngagementLedText(text)) {
    rejected.push({ reason: 'engagement_bait', evidence: text.slice(0, 160), sourceUrl: input.sourceUrl });
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
    const occKeys = watchlistOccurrenceIdentityKeys(item);
    if (
      known.has(item.canonicalKey) ||
      occKeys.some((key) => known.has(key)) ||
      accepted.some(
        (row) => row.canonicalKey === item.canonicalKey || sameWatchlistOccurrence(row, item),
      )
    ) {
      rejected.push({ reason: 'duplicate', evidence: item.title, sourceUrl: input.sourceUrl });
      return;
    }
    if (item.baselineKind === 'historical_baseline' && !item.currentlyActionable) {
      rejected.push({ reason: 'expired', evidence: item.title, sourceUrl: input.sourceUrl });
      return;
    }
    accepted.push(item);
    known.add(item.canonicalKey);
    for (const key of occKeys) known.add(key);
  };

  consider(primary, 'primary');
  if (secondary) consider(secondary, 'secondary');
  return { accepted, rejected };
}

/** Collapse repeated posts about one announcement; keep separate announcements. */
export function collapseWatchlistFindings(findings: WatchlistFindingDraft[]): WatchlistFindingDraft[] {
  const out: WatchlistFindingDraft[] = [];
  for (const finding of findings) {
    const urls = finding.provenanceUrls?.length ? finding.provenanceUrls : [finding.sourceUrl];
    const existingIdx = out.findIndex(
      (kept) =>
        kept.canonicalKey === finding.canonicalKey || sameWatchlistOccurrence(kept, finding),
    );
    if (existingIdx < 0) {
      out.push({ ...finding, provenanceUrls: [...new Set(urls)] });
      continue;
    }
    const kept = out[existingIdx]!;
    const mergedUrls = [...new Set([...(kept.provenanceUrls ?? [kept.sourceUrl]), ...urls])];
    const winner = findingStrength(finding) > findingStrength(kept) ? finding : kept;
    out[existingIdx] = { ...winner, provenanceUrls: mergedUrls };
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

export type WatchlistInventoryWatcher = {
  id: string;
  enabled: boolean;
  paused: boolean;
  healthStatus: string;
  sessionStatus: string | null;
  authenticationRequired: boolean;
  lastSuccessfulCheck: Date | null;
  lastAttemptedCheck: Date | null;
  lastFailureAt: Date | null;
  lastFailureMessage?: string | null;
};

export type WatchlistInventoryCounts = {
  activeEnabled: number;
  successfullyChecked: number;
  quiet: number;
  readyUnprocessed: number;
  failedOrBlocked: number;
  stoppedOrUnsupported: number;
};

export function countWatchlistInventory(
  watchers: WatchlistInventoryWatcher[],
  input: { since: Date; findingWatcherIds?: Set<string> },
): WatchlistInventoryCounts {
  const findingWatcherIds = input.findingWatcherIds ?? new Set<string>();
  const counts: WatchlistInventoryCounts = {
    activeEnabled: 0,
    successfullyChecked: 0,
    quiet: 0,
    readyUnprocessed: 0,
    failedOrBlocked: 0,
    stoppedOrUnsupported: 0,
  };
  for (const watcher of watchers) {
    const health = watchlistDisplayHealth({
      enabled: watcher.enabled,
      paused: watcher.paused,
      healthStatus: watcher.healthStatus,
      sessionStatus: watcher.sessionStatus,
      authenticationRequired: watcher.authenticationRequired,
      lastSuccessfulCheck: watcher.lastSuccessfulCheck,
      lastAttemptedCheck: watcher.lastAttemptedCheck,
      lastFailureAt: watcher.lastFailureAt,
      lastFailureMessage: watcher.lastFailureMessage,
    });
    if (!watcher.enabled || health === 'unsupported') {
      counts.stoppedOrUnsupported += 1;
      continue;
    }
    counts.activeEnabled += 1;
    if (health === 'failed' || health === 'blocked' || health === 'degraded') {
      counts.failedOrBlocked += 1;
    }
    const successInWindow = Boolean(
      watcher.lastSuccessfulCheck && watcher.lastSuccessfulCheck.getTime() >= input.since.getTime(),
    );
    if (successInWindow) {
      counts.successfullyChecked += 1;
      if (!findingWatcherIds.has(watcher.id)) counts.quiet += 1;
    } else if (health === 'ready' && !watcher.lastSuccessfulCheck && !watcher.paused) {
      counts.readyUnprocessed += 1;
    }
  }
  return counts;
}

export function formatWatchlistOperationalLine(input: {
  successfullyChecked: number;
  activeEnabled: number;
  readyUnprocessed?: number;
  failedOrBlocked?: number;
}): string | null {
  const checked = input.successfullyChecked;
  const active = input.activeEnabled;
  const ready = input.readyUnprocessed ?? 0;
  const failed = input.failedOrBlocked ?? 0;
  if (checked <= 0 && active <= 0) return null;
  const sourceWord = (n: number) => (n === 1 ? 'source' : 'sources');
  if (active > 0 && checked === active && ready === 0 && failed === 0) {
    return `Watchlist checked ${checked} ${sourceWord(checked)}.`;
  }
  if (active > 0) {
    const extras: string[] = [];
    if (ready > 0) extras.push(`${ready} remain${ready === 1 ? 's' : ''} ready`);
    if (failed > 0) extras.push(`${failed} failed or blocked`);
    const head = `Watchlist checked ${checked} of ${active} active ${sourceWord(active)}`;
    return extras.length ? `${head}; ${extras.join('; ')}.` : `${head}.`;
  }
  return `Watchlist checked ${checked} ${sourceWord(checked)}.`;
}

export function formatWatchlistBriefLines(input: {
  sourcesChecked: number;
  activeEnabled?: number;
  readyUnprocessed?: number;
  failedOrBlocked?: number;
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
    evidence?: string | null;
    summary?: string | null;
    endIsoDate?: string | null;
  }>;
  awaitingReview: number;
  failedSources: string[];
  quietSources: number;
  now?: Date;
  includeOperationalExtras?: boolean;
}): string[] {
  const now = input.now ?? new Date();
  const lines: string[] = [];
  const operational = formatWatchlistOperationalLine({
    successfullyChecked: input.sourcesChecked,
    activeEnabled: input.activeEnabled ?? input.sourcesChecked,
    readyUnprocessed: input.readyUnprocessed ?? 0,
    failedOrBlocked: input.failedOrBlocked ?? 0,
  });
  if (operational) lines.push(operational);
  const eligible = input.accepted
    .map((row) => ({
      baselineKind: row.baselineKind ?? 'new',
      currentlyActionable: row.currentlyActionable ?? false,
      confidence: row.confidence ?? 'medium',
      dateStatus: row.dateStatus ?? 'resolved',
      eventDate: row.eventDate ?? null,
      type: row.type ?? 'event',
      publishedAt: row.publishedAt ?? null,
      title: row.title,
      evidence: row.evidence ?? null,
      summary: row.summary ?? null,
      watchedSource: row.watchedSource,
      endIsoDate: row.endIsoDate ?? null,
    }))
    .filter((row) => isWatchlistBriefEligible(row, now))
    .sort((a, b) => watchlistBriefRank(b) - watchlistBriefRank(a));
  const top = eligible[0];
  const development = top ? summarizeWatchlistFindingForBrief(top, now) : null;
  if (top && development) {
    const prefix = recentlyPublished(top.publishedAt ?? null, now) ? 'New from' : 'Watchlist:';
    lines.push(`${prefix} ${top.watchedSource}: ${development}`);
  }
  if (input.includeOperationalExtras !== false) {
    if (input.awaitingReview > 0) {
      lines.push(`${input.awaitingReview} Watchlist finding${input.awaitingReview === 1 ? '' : 's'} awaiting review.`);
    }
    if (input.failedSources.length > 0) {
      lines.push(`Needs attention: ${input.failedSources.slice(0, 2).join(', ')}`);
    }
  }
  return lines.slice(0, 3);
}

export function homeWatchlistBriefLines(lines: string[]): string[] {
  return lines.filter(
    (line) => !/awaiting review/i.test(line) && !/^Needs attention:/i.test(line),
  );
}

export { reconcileStatedDateWithWeekday, resolveWatchlistDate };
