import type { InventoryItem } from './normalize.js';

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
    description: 'Date-night, dining, and weekend plans for Fri–Sun.',
  },
  contactBusinesses: {
    question: 'Which sponsors should Kellie contact?',
    description: 'Sponsor-ready openings and named businesses worth outreach.',
  },
  highestConfidence: {
    question: 'Which opportunities are highest confidence?',
    description: 'Verified sources with strong metadata — safe to move on.',
  },
  trending: {
    question: 'Which opportunities are trending?',
    description: 'Fresh inventory with rising engagement signals.',
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
    description: 'Fresh inventory surfaced by Benson scanners in the last 24 hours.',
  },
};

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

function getWeekendRange(now: Date): { start: Date; end: Date } {
  const today = startOfDay(now);
  const weekday = today.getDay();
  const friday = new Date(today);

  if (weekday === 0) {
    friday.setDate(friday.getDate() - 2);
  } else if (weekday === 6) {
    friday.setDate(friday.getDate() - 1);
  } else if (weekday >= 1 && weekday <= 4) {
    friday.setDate(friday.getDate() + (5 - weekday));
  }

  const sunday = new Date(friday);
  sunday.setDate(sunday.getDate() + 2);
  sunday.setHours(23, 59, 59, 999);
  return { start: friday, end: sunday };
}

function isWeekendEvent(iso: string | null, now: Date): boolean {
  const d = parseDate(iso);
  if (!d) return false;
  const { start, end } = getWeekendRange(now);
  return d >= start && d <= end;
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

function toCard(item: InventoryItem): CommandCenterCard {
  return {
    id: item.id,
    title: item.title,
    whyItMatters: item.whyItMatters,
    confidence: computeConfidence(item),
    audienceFit: computeAudienceFit(item),
    sponsorPotential: computeSponsorPotential(item),
    sourceUrl: item.sourceUrl,
    sourceName: item.sourceName,
    category: item.category,
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
  let score = item.audienceScore * 2 + computeConfidence(item).score / 10;
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

function scoreContactBusiness(item: InventoryItem): number {
  let score = computeSponsorPotential(item).score;
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

function scoreWorldCup(item: InventoryItem, now: Date): number {
  let score = item.audienceScore * 2 + 10;
  if (isWithinDays(item.eventDate, now, 30)) score += 8;
  if (item.flags.sports) score += 5;
  if (item.flags.freeEvent) score += 3;
  score += computeConfidence(item).score / 10;
  return score;
}

type ScoredItem = { item: InventoryItem; score: number };

function rankSection(
  items: InventoryItem[],
  filterFn: (item: InventoryItem, now: Date) => boolean,
  scoreFn: (item: InventoryItem, now: Date) => number,
  now: Date,
  limit: number,
): CommandCenterCard[] {
  const scored: ScoredItem[] = [];

  for (const item of items) {
    if (!filterFn(item, now)) continue;
    const score = scoreFn(item, now);
    if (score <= 0) continue;
    scored.push({ item, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.item.discoveredAt ?? b.item.createdAt).localeCompare(
      a.item.discoveredAt ?? a.item.createdAt,
    );
  });

  return scored.slice(0, limit).map(({ item }) => toCard(item));
}

function isEligiblePostToday(item: InventoryItem, now: Date): boolean {
  return (
    isToday(item.eventDate, now) ||
    isToday(item.discoveredAt, now) ||
    isToday(item.createdAt, now) ||
    (isWithinDays(item.eventDate, now, 1) && item.audienceScore >= 2)
  );
}

function isEligiblePostWeekend(item: InventoryItem, now: Date): boolean {
  return (
    isWeekendEvent(item.eventDate, now) ||
    (isWeekendEvent(item.eventEndDate, now) && !!item.eventDate) ||
    ((item.flags.dateNight || item.flags.luxury || item.flags.dining) &&
      isWithinDays(item.eventDate, now, 7))
  );
}

function isEligibleContactBusiness(item: InventoryItem): boolean {
  const hasContactTarget = !!(item.businessName || item.venue);
  const sponsorSignal =
    item.flags.sponsorFriendly ||
    item.flags.businessOpening ||
    item.flags.luxury ||
    (item.flags.dining && !!item.businessName);
  return hasContactTarget && sponsorSignal;
}

function scoreDiscoveredToday(item: InventoryItem, now: Date): number {
  let score = item.audienceScore * 3 + computeConfidence(item).score / 8;
  if (isToday(item.discoveredAt, now)) score += 15;
  if (isToday(item.createdAt, now)) score += 10;
  if (item.flags.sponsorFriendly) score += 5;
  return score;
}

function isEligibleDiscoveredToday(item: InventoryItem, now: Date): boolean {
  return isToday(item.discoveredAt, now) || isToday(item.createdAt, now);
}

function isEligibleThisWeek(item: InventoryItem, now: Date): boolean {
  return (
    isWithinDays(item.eventDate, now, 7) ||
    isWithinDays(item.discoveredAt, now, 7) ||
    isWithinDays(item.createdAt, now, 7) ||
    isWeekendEvent(item.eventDate, now)
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
  return rankSection(items, isEligibleThisWeek, scoreThisWeek, now, limit);
}

function isEligibleTrending(item: InventoryItem, now: Date): boolean {
  const fresh = isWithinHours(item.discoveredAt ?? item.createdAt, now, 72);
  const engaging = item.audienceScore >= 2 || engagementFlagCount(item) >= 2;
  return fresh && engaging;
}

export function computeCommandCenter(
  items: InventoryItem[],
  options?: { now?: Date; limit?: number; excludeIds?: Set<string> },
): CommandCenterResponse {
  const now = options?.now ?? new Date();
  const limit = options?.limit ?? 6;
  const excludeIds = options?.excludeIds ?? new Set<string>();
  const active = items.filter((item) => !excludeIds.has(item.id));

  const sections: CommandCenterResponse['sections'] = {
    postToday: {
      ...SECTION_META.postToday,
      items: rankSection(active, isEligiblePostToday, scorePostToday, now, limit),
    },
    postWeekend: {
      ...SECTION_META.postWeekend,
      items: rankSection(active, isEligiblePostWeekend, scorePostWeekend, now, limit),
    },
    contactBusinesses: {
      ...SECTION_META.contactBusinesses,
      items: rankSection(
        active,
        (item) => isEligibleContactBusiness(item),
        (item) => scoreContactBusiness(item),
        now,
        limit,
      ),
    },
    highestConfidence: {
      ...SECTION_META.highestConfidence,
      items: rankSection(
        active,
        (item) => computeConfidence(item).score >= 50,
        (item) => computeConfidence(item).score,
        now,
        limit,
      ),
    },
    trending: {
      ...SECTION_META.trending,
      items: rankSection(active, isEligibleTrending, scoreTrending, now, limit),
    },
    worldCupVisitors: {
      ...SECTION_META.worldCupVisitors,
      items: rankSection(
        active,
        (item) => item.flags.worldCup,
        scoreWorldCup,
        now,
        limit,
      ),
    },
    followUpsDue: {
      ...SECTION_META.followUpsDue,
      items: [],
    },
    discoveredToday: {
      ...SECTION_META.discoveredToday,
      items: rankSection(active, isEligibleDiscoveredToday, scoreDiscoveredToday, now, limit),
    },
  };

  return {
    generatedAt: now.toISOString(),
    limit,
    sections,
  };
}
