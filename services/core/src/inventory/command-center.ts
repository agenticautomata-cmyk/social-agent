import { isGenericFallbackWhyItMatters, type InventoryItem } from './normalize.js';
import { upcomingInventorySortTuple } from '../content-order.js';
import {
  audienceFreshnessBoost,
  isAudienceFreshContent,
  isKcSippsRoundup,
} from './content-freshness.js';
import { isHomeEligible } from './home-eligibility.js';
import {
  buildTodayClarityFields,
  dedupeTodaySectionIds,
  isEligibleThingsToDoToday,
  isEligibleWeekendContent,
  isWeekendEvent,
  passesTodayEligibility,
  type TodayLane,
  type TodayPrimaryAction,
} from './today-clarity.js';
import {
  isOrdinaryPublicEvent,
  qualifiesFilmThis,
} from '../pre-alpha/home-showroom-lanes.js';

export type FitLevel = 'high' | 'medium' | 'low' | 'none';

export type CommandCenterMetric = {
  level: FitLevel;
  score: number;
  label: string;
};

export type CommandCenterCard = {
  id: string;
  title: string;
  whyItMatters: string;
  confidence: CommandCenterMetric;
  audienceFit: CommandCenterMetric;
  sponsorPotential: CommandCenterMetric;
  sourceUrl: string | null;
  sourceName: string | null;
  category: string | null;
  tracking?: {
    saved: boolean;
    covered: boolean;
    note: string | null;
    followUpAt: string | null;
  };
  /** Operator-facing Today clarity (optional for older clients). */
  displayTitle?: string;
  lane?: TodayLane;
  laneLabel?: string;
  whySummary?: string;
  whenLabel?: string | null;
  whereLabel?: string | null;
  primaryAction?: TodayPrimaryAction;
  coverageFormatLabel?: string | null;
  showMarkCovered?: boolean;
  showSave?: boolean;
  viewSourceUrl?: string | null;
  /** Hide internal score dashboard on Today. */
  hideScoreDashboard?: boolean;
};

export type CommandCenterSectionId =
  | 'postToday'
  | 'postWeekend'
  | 'contactBusinesses'
  | 'highestConfidence'
  | 'trending'
  | 'worldCupVisitors'
  | 'followUpsDue'
  | 'discoveredToday';

export type CommandCenterResponse = {
  generatedAt: string;
  limit: number;
  sections: Record<
    CommandCenterSectionId,
    {
      question: string;
      description: string;
      items: CommandCenterCard[];
    }
  >;
};

const SECTION_META: Record<
  CommandCenterSectionId,
  { question: string; description: string }
> = {
  postToday: {
    question: 'What should Kellie post today?',
    description: 'Timely, audience-ready picks for today’s feed.',
  },
  postWeekend: {
    question: 'What should Kellie post this weekend?',
    description: 'Filmable Fri–Sun picks with a concrete subject, source, and next step.',
  },
  contactBusinesses: {
    question: 'Which sponsors should Kellie contact?',
    description: 'Named businesses with a concrete sponsor path — not generic shopping leads.',
  },
  highestConfidence: {
    question: 'Which opportunities have the most complete metadata?',
    description: 'Paused on Today — metadata completeness is not an operator task.',
  },
  trending: {
    question: 'Which opportunities are trending?',
    description: 'Only actionable, filmable, or sponsor-ready items — not raw buzz.',
  },
  worldCupVisitors: {
    question: 'Which opportunities target World Cup visitors?',
    description: 'Visitor-economy and soccer-capital angles for WC26.',
  },
  followUpsDue: {
    question: 'What follow-ups are due?',
    description: 'Saved opportunities with a follow-up date that has arrived.',
  },
  discoveredToday: {
    question: 'What new opportunities were discovered today?',
    description: 'Fresh inventory from Ask Benson chat intake and KC source scans in the last 24 hours.',
  },
};

function isAskBensonIntake(item: InventoryItem): boolean {
  return item.ingest?.startsWith('ask_benson') === true;
}

const TICKET_RESELLER_RE = /\b(ticketmaster|stubhub|seatgeek|vivid\s*seats|axs)\b/i;

/**
 * Raw ticket-reseller listings (e.g. "J. Cole Tickets, 2026 Tour Dates | Ticketmaster")
 * with no substantive reasoning beyond a bare category label add no creator or
 * monetization value and should never surface as a top recommendation.
 */
export function isGenericTicketResaleListing(item: InventoryItem): boolean {
  const haystack = `${item.title} ${item.sourceName ?? ''}`;
  if (!TICKET_RESELLER_RE.test(haystack)) return false;
  return isGenericFallbackWhyItMatters(item.whyItMatters);
}

function askBensonPriorityBoost(item: InventoryItem): number {
  return isAskBensonIntake(item) ? 45 : 0;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function daysBetween(from: Date, to: Date): number {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function isToday(iso: string | null, now: Date): boolean {
  const d = parseDate(iso);
  return d != null && isSameCalendarDay(d, now);
}

function isWithinDays(iso: string | null, now: Date, days: number): boolean {
  const d = parseDate(iso);
  if (!d) return false;
  const delta = daysBetween(now, d);
  return delta >= 0 && delta <= days;
}

function isWithinHours(iso: string | null, now: Date, hours: number): boolean {
  const d = parseDate(iso);
  if (!d) return false;
  const ms = now.getTime() - d.getTime();
  return ms >= 0 && ms <= hours * 60 * 60 * 1000;
}

function toFitLevel(score: number, high: number, medium: number): FitLevel {
  if (score >= high) return 'high';
  if (score >= medium) return 'medium';
  if (score > 0) return 'low';
  return 'none';
}

function metricLabel(level: FitLevel): string {
  switch (level) {
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
    default:
      return 'None';
  }
}

function computeConfidence(item: InventoryItem): CommandCenterMetric {
  let score = 45;
  if (!item.flags.reddit) score += 20;
  else score -= 25;
  if (item.sourceUrl) score += 15;
  if (item.businessName) score += 12;
  if (item.venue || item.address) score += 8;
  if (item.relevanceScore) {
    const parsed = parseFloat(item.relevanceScore);
    if (!Number.isNaN(parsed)) score += Math.round(parsed * 15);
  }
  if (item.ingest && item.ingest !== 'reddit_rss') score += 5;
  score = Math.max(0, Math.min(100, score));
  const level = toFitLevel(score, 75, 55);
  return { level, score, label: metricLabel(level) };
}

function computeAudienceFit(item: InventoryItem): CommandCenterMetric {
  const score = Math.max(0, Math.min(100, item.audienceScore * 10));
  const level = toFitLevel(item.audienceScore, 6, 3);
  return { level, score, label: metricLabel(level) };
}

function computeSponsorPotential(item: InventoryItem): CommandCenterMetric {
  let score = 0;
  if (item.flags.sponsorFriendly) score += 35;
  if (item.businessName) score += 25;
  if (item.flags.luxury) score += 15;
  if (item.flags.businessOpening) score += 15;
  if (item.flags.dining) score += 10;
  if (item.flags.estateSale) score += 10;
  if (item.flags.dateNight) score += 8;
  if (item.flags.reddit) score -= 20;
  score = Math.max(0, Math.min(100, score));
  const level = toFitLevel(score, 60, 35);
  return { level, score, label: metricLabel(level) };
}

function toCard(
  item: InventoryItem,
  sectionHint?: 'postWeekend' | 'postToday' | 'contactBusinesses' | 'followUpsDue' | null,
): CommandCenterCard {
  const clarity = buildTodayClarityFields(item, sectionHint);
  return {
    id: item.id,
    title: clarity.displayTitle,
    whyItMatters: clarity.whySummary,
    confidence: computeConfidence(item),
    audienceFit: computeAudienceFit(item),
    sponsorPotential: computeSponsorPotential(item),
    sourceUrl: clarity.viewSourceUrl,
    sourceName: item.sourceName,
    category: item.category,
    displayTitle: clarity.displayTitle,
    lane: clarity.lane,
    laneLabel: clarity.laneLabel,
    whySummary: clarity.whySummary,
    whenLabel: clarity.whenLabel,
    whereLabel: clarity.whereLabel,
    primaryAction: clarity.primaryAction,
    coverageFormatLabel: clarity.coverageFormatLabel,
    showMarkCovered: clarity.showMarkCovered,
    showSave: clarity.showSave,
    viewSourceUrl: clarity.viewSourceUrl,
    hideScoreDashboard: true,
  };
}

export function itemToCommandCenterCard(item: InventoryItem): CommandCenterCard {
  return toCard(item);
}

export function attachTrackingToCards(
  cards: CommandCenterCard[],
  tracking: Map<string, { saved: boolean; covered: boolean; note: string | null; followUpAt: string | null }>,
): CommandCenterCard[] {
  return cards.map((card) => {
    const t = tracking.get(card.id);
    if (!t) return card;
    return {
      ...card,
      tracking: {
        saved: t.saved,
        covered: t.covered,
        note: t.note,
        followUpAt: t.followUpAt,
      },
    };
  });
}

function engagementFlagCount(item: InventoryItem): number {
  const f = item.flags;
  return [
    f.celebrityCharity,
    f.freeEvent,
    f.sports,
    f.worldCup,
    f.dining,
    f.luxury,
    f.dateNight,
  ].filter(Boolean).length;
}

function scorePostToday(item: InventoryItem, now: Date): number {
  let score = item.audienceScore * 2 + computeConfidence(item).score / 10 + askBensonPriorityBoost(item);
  score += audienceFreshnessBoost(item, now);
  if (isToday(item.eventDate, now)) score += 12;
  if (isToday(item.discoveredAt, now) || isToday(item.createdAt, now)) score += 8;
  if (isWithinDays(item.eventDate, now, 1)) score += 5;
  if (item.flags.sponsorFriendly) score += 3;
  if (item.flags.reddit) score -= 4;
  return score;
}

function scorePostWeekend(item: InventoryItem, now: Date): number {
  let score = item.audienceScore * 2;
  if (isWeekendEvent(item.eventDate, now)) score += 15;
  if (item.flags.dateNight) score += 8;
  if (item.flags.luxury) score += 6;
  if (item.flags.dining) score += 6;
  if (item.category === 'weekend_getaway' || item.category === 'couples_event') score += 8;
  if (isWithinDays(item.eventDate, now, 7)) score += 4;
  score += computeSponsorPotential(item).score / 15;
  return score;
}

function scoreContactBusiness(item: InventoryItem, now: Date): number {
  let score = computeSponsorPotential(item).score + audienceFreshnessBoost(item, now);
  if (item.businessName) score += 20;
  if (item.flags.businessOpening) score += 15;
  if (item.venue || item.address) score += 8;
  score += computeConfidence(item).score / 5;
  return score;
}

function scoreTrending(item: InventoryItem, now: Date): number {
  let score = 0;
  if (isWithinHours(item.discoveredAt ?? item.createdAt, now, 72)) score += 20;
  else if (isWithinHours(item.discoveredAt ?? item.createdAt, now, 168)) score += 10;
  score += engagementFlagCount(item) * 4;
  score += item.audienceScore * 2;
  if (item.flags.reddit) score += 3;
  if (!item.flags.reddit) score += 5;
  return score;
}

type ScoredItem = { item: InventoryItem; score: number };

function rankSection(
  items: InventoryItem[],
  filterFn: (item: InventoryItem, now: Date) => boolean,
  scoreFn: (item: InventoryItem, now: Date) => number,
  now: Date,
  limit: number,
  sectionHint?: 'postWeekend' | 'postToday' | 'contactBusinesses' | 'followUpsDue' | null,
): CommandCenterCard[] {
  const scored: ScoredItem[] = [];

  for (const item of items) {
    if (!filterFn(item, now)) continue;
    if (!isAudienceFreshContent(item, now)) continue;
    const score = scoreFn(item, now);
    if (score <= 0) continue;
    scored.push({ item, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const [aTier, aTime] = upcomingInventorySortTuple(a.item.eventDate, now);
    const [bTier, bTime] = upcomingInventorySortTuple(b.item.eventDate, now);
    if (aTier !== bTier) return aTier - bTier;
    if (aTime !== bTime) return aTime - bTime;
    return (b.item.discoveredAt ?? b.item.createdAt).localeCompare(
      a.item.discoveredAt ?? a.item.createdAt,
    );
  });

  return scored.slice(0, limit).map(({ item }) => toCard(item, sectionHint));
}

function isEligiblePostToday(item: InventoryItem, now: Date): boolean {
  if (isKcSippsRoundup(item)) return false;
  if (!passesTodayEligibility(item, now).ok) return false;

  // Ordinary concerts → Things To Do Weekly, not "post today".
  if (isOrdinaryPublicEvent(item)) return false;

  const timely =
    isToday(item.eventDate, now) ||
    isToday(item.discoveredAt, now) ||
    isToday(item.createdAt, now) ||
    (isWithinDays(item.eventDate, now, 1) && item.audienceScore >= 2);

  if (!timely) return false;
  return qualifiesFilmThis(item) || Boolean(item.flags.dining || item.flags.shopping || item.flags.businessOpening);
}

function isEligiblePostWeekend(item: InventoryItem, now: Date): boolean {
  return isEligibleWeekendContent(item, now);
}

function isEligibleContactBusiness(item: InventoryItem, now: Date = new Date()): boolean {
  if (!passesTodayEligibility(item, now).ok) return false;
  if (isOrdinaryPublicEvent(item)) return false;
  if (isGenericFallbackWhyItMatters(item.whyItMatters) && !item.businessName) return false;
  const hasContactTarget = !!(item.businessName || item.venue);
  const sponsorSignal =
    item.flags.sponsorFriendly ||
    item.flags.businessOpening ||
    item.flags.luxury ||
    (item.flags.dining && !!item.businessName);
  // Require named business — not a shopping hypothesis without entity.
  return hasContactTarget && sponsorSignal && Boolean(item.businessName?.trim());
}

function scoreDiscoveredToday(item: InventoryItem, now: Date): number {
  let score = item.audienceScore * 3 + computeConfidence(item).score / 8 + askBensonPriorityBoost(item);
  if (isToday(item.discoveredAt, now)) score += 15;
  if (isToday(item.createdAt, now)) score += 10;
  if (item.flags.sponsorFriendly) score += 5;
  return score;
}

function rankDiscoveredToday(
  items: InventoryItem[],
  now: Date,
  limit: number,
): CommandCenterCard[] {
  const ranked = rankSection(items, isEligibleDiscoveredToday, scoreDiscoveredToday, now, limit, 'postToday');
  const askToday = items
    .filter((item) => isAskBensonIntake(item) && isEligibleDiscoveredToday(item, now))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, 3)
    .map((item) => toCard(item, 'postToday'));

  const seen = new Set<string>();
  const merged: CommandCenterCard[] = [];
  for (const card of [...askToday, ...ranked]) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    merged.push(card);
    if (merged.length >= limit) break;
  }
  return merged;
}

function isEligibleDiscoveredToday(item: InventoryItem, now: Date): boolean {
  if (!(isToday(item.discoveredAt, now) || isToday(item.createdAt, now))) return false;
  // New ≠ Today task. Still need a concrete action lane.
  if (passesTodayEligibility(item, now).ok) return true;
  return isEligibleThingsToDoToday(item, now);
}

function isEligibleTrending(item: InventoryItem, now: Date): boolean {
  if (!passesTodayEligibility(item, now).ok) return false;
  if (isOrdinaryPublicEvent(item)) return false;
  const fresh = isWithinHours(item.discoveredAt ?? item.createdAt, now, 72);
  const actionable = qualifiesFilmThis(item) || Boolean(item.flags.sponsorFriendly && item.businessName);
  return fresh && actionable;
}

function isEligibleThisWeek(item: InventoryItem, now: Date): boolean {
  if (!(
    isWithinDays(item.eventDate, now, 7) ||
    isWithinDays(item.discoveredAt, now, 7) ||
    isWithinDays(item.createdAt, now, 7) ||
    isWeekendEvent(item.eventDate, now)
  )) {
    return false;
  }
  return (
    passesTodayEligibility(item, now).ok ||
    isEligibleThingsToDoToday(item, now) ||
    isEligibleWeekendContent(item, now)
  );
}

function scoreThisWeek(item: InventoryItem, now: Date): number {
  let score = item.audienceScore * 2 + computeConfidence(item).score / 10;
  if (isWithinDays(item.eventDate, now, 7)) score += 10;
  if (isWeekendEvent(item.eventDate, now)) score += 8;
  if (item.flags.sponsorFriendly) score += 4;
  return score;
}

export function computeWeekPicks(
  items: InventoryItem[],
  options?: { now?: Date; limit?: number },
): CommandCenterCard[] {
  const now = options?.now ?? new Date();
  const limit = options?.limit ?? 20;
  return rankSection(items, isEligibleThisWeek, scoreThisWeek, now, limit, 'postToday');
}

export function computeCommandCenter(
  items: InventoryItem[],
  options?: { now?: Date; limit?: number; excludeIds?: Set<string> },
): CommandCenterResponse {
  const now = options?.now ?? new Date();
  const limit = Math.min(options?.limit ?? 6, 4);
  const excludeIds = options?.excludeIds ?? new Set<string>();
  // Eligibility BEFORE section ranking. Consistency + Today lane required.
  const active = items.filter(
    (item) =>
      !excludeIds.has(item.id) &&
      !isGenericTicketResaleListing(item) &&
      isHomeEligible(item) &&
      (passesTodayEligibility(item, now).ok || isEligibleThingsToDoToday(item, now)),
  );

  const sections: CommandCenterResponse['sections'] = {
    postToday: {
      ...SECTION_META.postToday,
      items: rankSection(active, isEligiblePostToday, scorePostToday, now, limit, 'postToday'),
    },
    postWeekend: {
      ...SECTION_META.postWeekend,
      items: rankSection(active, isEligiblePostWeekend, scorePostWeekend, now, limit, 'postWeekend'),
    },
    contactBusinesses: {
      ...SECTION_META.contactBusinesses,
      items: rankSection(
        active,
        (item, n) => isEligibleContactBusiness(item, n),
        (item, n) => scoreContactBusiness(item, n),
        now,
        limit,
        'contactBusinesses',
      ),
    },
    highestConfidence: {
      ...SECTION_META.highestConfidence,
      // Metadata completeness is not a Today operator task.
      items: [],
    },
    trending: {
      ...SECTION_META.trending,
      items: rankSection(active, isEligibleTrending, scoreTrending, now, Math.min(limit, 3), 'postToday'),
    },
    // Retired from Today UI (not rendered). Keep empty section for API shape; WC flags/records preserved elsewhere.
    worldCupVisitors: {
      ...SECTION_META.worldCupVisitors,
      items: [],
    },
    followUpsDue: {
      ...SECTION_META.followUpsDue,
      items: [],
    },
    discoveredToday: {
      ...SECTION_META.discoveredToday,
      items: rankDiscoveredToday(active, now, limit),
    },
  };

  dedupeTodaySectionIds(
    [
      'postToday',
      'postWeekend',
      'contactBusinesses',
      'followUpsDue',
      'discoveredToday',
      'trending',
      'highestConfidence',
    ],
    sections,
  );

  return {
    generatedAt: now.toISOString(),
    limit,
    sections,
  };
}
