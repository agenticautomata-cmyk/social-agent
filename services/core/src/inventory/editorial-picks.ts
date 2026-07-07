import type { InventoryItem } from './normalize.js';
import { upcomingInventorySortTuple } from '../content-order.js';

export type EditorialScoreFactor = {
  label: string;
  points: number;
};

export type EditorialScoreBreakdown = {
  total: number;
  factors: EditorialScoreFactor[];
};

export type EditorialPick = {
  id: string;
  title: string;
  category: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  whyRanked: string;
  scoreBreakdown: EditorialScoreBreakdown;
  businessName?: string | null;
  location?: string | null;
  whyItMatters?: string;
};

export type EditorialPanelId =
  | 'topToday'
  | 'topSponsor'
  | 'topEngagement'
  | 'topNewBusinesses'
  | 'topCelebrityCharity'
  | 'topEstateSalesThisWeek'
  | 'topShopping';

export type EditorialPicksResponse = {
  generatedAt: string;
  limit: number;
  panels: Record<
    EditorialPanelId,
    {
      title: string;
      description: string;
      items: EditorialPick[];
    }
  >;
};

const PANEL_META: Record<EditorialPanelId, { title: string; description: string }> = {
  topToday: {
    title: 'Top Opportunities Today',
    description: 'Top 10 fresh, timely picks weighted for recency and audience alignment.',
  },
  topSponsor: {
    title: 'Top Sponsor Opportunities',
    description: 'Named businesses and bookable experiences with sponsor potential.',
  },
  topEngagement: {
    title: 'Top Engagement Opportunities',
    description: 'High social-traffic hooks — events, sports, charity, community.',
  },
  topNewBusinesses: {
    title: 'Top New Businesses',
    description: 'Recent openings and launch signals worth covering first.',
  },
  topCelebrityCharity: {
    title: 'Top Celebrity / Charity Opportunities',
    description: 'Celebrity appearances, galas, fundraisers, and benefit events.',
  },
  topEstateSalesThisWeek: {
    title: 'Top Estate Sales This Week',
    description: 'Treasure-hunt estate sales happening this calendar week.',
  },
  topShopping: {
    title: 'Top Shopping Opportunities',
    description: 'Retail, markets, and collector events ranked for sponsor and audience fit.',
  },
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  const weekday = day.getDay();
  day.setDate(day.getDate() - weekday);
  return day;
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

function isThisWeek(iso: string | null, now: Date): boolean {
  const d = parseDate(iso);
  if (!d) return false;
  const weekStart = startOfWeek(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return d >= weekStart && d < weekEnd;
}

function primaryDate(item: InventoryItem): string | null {
  return item.eventDate ?? item.discoveredAt ?? item.createdAt;
}

function buildBreakdown(factors: EditorialScoreFactor[]): EditorialScoreBreakdown {
  const positive = factors.filter((f) => f.points !== 0);
  return {
    total: positive.reduce((sum, f) => sum + f.points, 0),
    factors: [...positive].sort((a, b) => b.points - a.points),
  };
}

function whyFromBreakdown(breakdown: EditorialScoreBreakdown): string {
  const top = breakdown.factors.slice(0, 3);
  if (!top.length) return 'General inventory match for this editorial panel.';
  return top.map((f) => `${f.label} (+${f.points})`).join(' · ');
}

function toPick(item: InventoryItem, breakdown: EditorialScoreBreakdown): EditorialPick {
  const location =
    [item.venue, item.neighborhood, item.address, item.locationName].filter(Boolean).join(' · ') || null;
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    whyRanked: whyFromBreakdown(breakdown),
    scoreBreakdown: breakdown,
    businessName: item.businessName,
    location,
    whyItMatters: item.whyItMatters,
  };
}

function scoreTopToday(item: InventoryItem, now: Date): EditorialScoreBreakdown {
  const factors: EditorialScoreFactor[] = [];

  if (item.audienceScore > 0) {
    factors.push({ label: 'audience alignment', points: item.audienceScore });
  }
  if (isToday(item.discoveredAt, now) || isToday(item.createdAt, now)) {
    factors.push({ label: 'discovered today', points: 5 });
  }
  if (isToday(item.eventDate, now)) {
    factors.push({ label: 'event today', points: 6 });
  } else if (isWithinDays(item.eventDate, now, 3)) {
    factors.push({ label: 'event within 3 days', points: 3 });
  }
  if (!item.flags.reddit) {
    factors.push({ label: 'verified source (non-reddit)', points: 2 });
  } else {
    factors.push({ label: 'reddit source', points: -2 });
  }
  if (item.businessName) factors.push({ label: 'named business', points: 1 });
  if (item.sourceUrl) factors.push({ label: 'source link available', points: 1 });
  if (item.flags.sponsorFriendly) factors.push({ label: 'sponsor-friendly', points: 2 });

  return buildBreakdown(factors);
}

function scoreTopSponsor(item: InventoryItem, now: Date): EditorialScoreBreakdown {
  const factors: EditorialScoreFactor[] = [];

  if (item.flags.sponsorFriendly) factors.push({ label: 'sponsor-friendly flag', points: 6 });
  if (item.flags.luxury) factors.push({ label: 'luxury signal', points: 4 });
  if (item.flags.dateNight) factors.push({ label: 'date-night angle', points: 3 });
  if (item.flags.dining) factors.push({ label: 'dining category', points: 3 });
  if (item.flags.businessOpening) factors.push({ label: 'new opening', points: 3 });
  if (item.flags.estateSale) factors.push({ label: 'estate sale / consignment', points: 2 });
  if (item.businessName) factors.push({ label: 'named business', points: 3 });
  if (isWithinDays(primaryDate(item), now, 14)) {
    factors.push({ label: 'recently discovered', points: 2 });
  }
  if (item.sourceUrl) factors.push({ label: 'source link available', points: 1 });

  return buildBreakdown(factors);
}

function scoreTopEngagement(item: InventoryItem, now: Date): EditorialScoreBreakdown {
  const factors: EditorialScoreFactor[] = [];

  if (item.flags.celebrityCharity) factors.push({ label: 'celebrity / charity hook', points: 5 });
  if (item.flags.freeEvent) factors.push({ label: 'free community event', points: 4 });
  if (item.flags.sports) factors.push({ label: 'sports audience', points: 4 });
  if (item.flags.worldCup) factors.push({ label: 'world cup / visitors', points: 4 });
  if (item.flags.reddit) factors.push({ label: 'reddit buzz', points: 1 });
  if (isWithinDays(item.eventDate, now, 7)) {
    factors.push({ label: 'event within 7 days', points: 3 });
  }
  if (item.audienceScore > 0) {
    factors.push({ label: 'audience alignment', points: Math.min(item.audienceScore, 4) });
  }
  if (item.sourceUrl) factors.push({ label: 'source link available', points: 1 });

  return buildBreakdown(factors);
}

function scoreTopNewBusinesses(item: InventoryItem, now: Date): EditorialScoreBreakdown {
  const factors: EditorialScoreFactor[] = [];

  if (item.flags.businessOpening) factors.push({ label: 'opening flag', points: 6 });
  if (item.category === 'restaurant_opening') factors.push({ label: 'restaurant opening', points: 4 });
  if (item.category === 'coffee_opening') factors.push({ label: 'coffee opening', points: 3 });
  if (item.category === 'business_opening') factors.push({ label: 'business opening', points: 3 });
  if (item.flags.dining) factors.push({ label: 'dining category', points: 2 });
  if (item.businessName) factors.push({ label: 'named business', points: 4 });
  if (isWithinDays(item.discoveredAt ?? item.createdAt, now, 7)) {
    factors.push({ label: 'discovered this week', points: 3 });
  }
  if (item.venue || item.address) factors.push({ label: 'location known', points: 1 });
  if (item.sourceUrl) factors.push({ label: 'source link available', points: 1 });

  return buildBreakdown(factors);
}

function scoreTopCelebrityCharity(item: InventoryItem, now: Date): EditorialScoreBreakdown {
  const factors: EditorialScoreFactor[] = [];

  if (item.flags.celebrityCharity) factors.push({ label: 'celebrity / charity flag', points: 6 });
  if (item.category === 'gala') factors.push({ label: 'gala event', points: 3 });
  if (item.category === 'fundraiser' || item.category === 'benefit_concert') {
    factors.push({ label: 'fundraiser / benefit', points: 3 });
  }
  if (item.category === 'celebrity_event' || item.category === 'public_appearance') {
    factors.push({ label: 'celebrity appearance', points: 4 });
  }
  if (item.category === 'sports_celebrity_event') {
    factors.push({ label: 'sports celebrity tie-in', points: 2 });
  }
  if (isWithinDays(item.eventDate, now, 14)) {
    factors.push({ label: 'event within 2 weeks', points: 3 });
  }
  if (!item.flags.reddit) factors.push({ label: 'verified source (non-reddit)', points: 1 });
  if (item.sourceUrl) factors.push({ label: 'source link available', points: 1 });

  return buildBreakdown(factors);
}

function scoreTopEstateSalesThisWeek(item: InventoryItem, now: Date): EditorialScoreBreakdown {
  const factors: EditorialScoreFactor[] = [];

  if (item.flags.estateSale) factors.push({ label: 'estate sale flag', points: 6 });
  if (isThisWeek(item.eventDate, now)) factors.push({ label: 'event this week', points: 5 });
  if (isThisWeek(item.discoveredAt ?? item.createdAt, now)) {
    factors.push({ label: 'discovered this week', points: 2 });
  }
  if (item.neighborhood) factors.push({ label: 'neighborhood tagged', points: 2 });
  if (item.address) factors.push({ label: 'address available', points: 1 });
  if (item.sourceUrl) factors.push({ label: 'source link available', points: 1 });

  return buildBreakdown(factors);
}

function scoreTopShopping(item: InventoryItem, now: Date): EditorialScoreBreakdown {
  const factors: EditorialScoreFactor[] = [];

  if (item.flags.sponsorFriendly) factors.push({ label: 'sponsor potential', points: 6 });
  if (item.audienceScore >= 4) factors.push({ label: 'local audience appeal', points: 4 });
  else if (item.audienceScore >= 2) factors.push({ label: 'local audience appeal', points: 2 });
  if (item.category === 'luxury_resale' || item.category === 'boutique_opening' || item.category === 'collector_show') {
    factors.push({ label: 'uniqueness', points: 4 });
  } else if (item.flags.vendorMarket || item.flags.collector) {
    factors.push({ label: 'uniqueness', points: 2 });
  }
  if (item.flags.worldCup || item.neighborhood?.includes('legends') || item.neighborhood?.includes('plaza') || item.neighborhood?.includes('crown center')) {
    factors.push({ label: 'visitor appeal', points: 3 });
  }
  if (isWithinDays(item.discoveredAt ?? item.createdAt, now, 14)) {
    factors.push({ label: 'recency', points: 4 });
  }
  if (item.flags.shopping) factors.push({ label: 'shopping signal', points: 3 });
  if (item.flags.retail) factors.push({ label: 'retail signal', points: 3 });
  if (item.flags.vendorMarket) factors.push({ label: 'vendor market', points: 2 });
  if (item.flags.collector) factors.push({ label: 'collector event', points: 2 });
  if (item.businessName) factors.push({ label: 'named business/event', points: 2 });
  if (item.sourceUrl) factors.push({ label: 'source link available', points: 1 });

  return buildBreakdown(factors);
}

type RankedCandidate = {
  item: InventoryItem;
  breakdown: EditorialScoreBreakdown;
};

function rankItems(
  items: InventoryItem[],
  scoreFn: (item: InventoryItem, now: Date) => EditorialScoreBreakdown,
  filterFn: (item: InventoryItem, now: Date) => boolean,
  now: Date,
  limit: number,
): EditorialPick[] {
  const ranked: RankedCandidate[] = [];

  for (const item of items) {
    if (!filterFn(item, now)) continue;
    const breakdown = scoreFn(item, now);
    if (breakdown.total <= 0) continue;
    ranked.push({ item, breakdown });
  }

  ranked.sort((a, b) => {
    if (b.breakdown.total !== a.breakdown.total) {
      return b.breakdown.total - a.breakdown.total;
    }
    const [aTier] = upcomingInventorySortTuple(a.item.eventDate, now);
    const [bTier] = upcomingInventorySortTuple(b.item.eventDate, now);
    if (aTier !== bTier) return aTier - bTier;
    return (a.item.eventDate ?? '').localeCompare(b.item.eventDate ?? '');
  });

  return ranked.slice(0, limit).map(({ item, breakdown }) => toPick(item, breakdown));
}

function isEligibleToday(item: InventoryItem, now: Date): boolean {
  return (
    isToday(item.discoveredAt, now) ||
    isToday(item.createdAt, now) ||
    isToday(item.eventDate, now) ||
    isWithinDays(item.eventDate, now, 3)
  );
}

function isEligibleSponsor(item: InventoryItem): boolean {
  return (
    item.flags.sponsorFriendly ||
    item.flags.luxury ||
    item.flags.dateNight ||
    (item.flags.dining && !!item.businessName)
  );
}

function isEligibleNewBusiness(item: InventoryItem): boolean {
  return (
    item.flags.businessOpening ||
    item.category === 'restaurant_opening' ||
    item.category === 'coffee_opening' ||
    item.category === 'business_opening'
  );
}

function isEligibleCelebrityCharity(item: InventoryItem): boolean {
  return item.flags.celebrityCharity;
}

function isEligibleEstateSaleThisWeek(item: InventoryItem, now: Date): boolean {
  if (!item.flags.estateSale) return false;
  return isThisWeek(item.eventDate, now) || isThisWeek(item.discoveredAt ?? item.createdAt, now);
}

function isEligibleShopping(item: InventoryItem): boolean {
  return item.flags.shopping || item.flags.retail || item.flags.vendorMarket || item.flags.collector;
}

export function computeEditorialPicks(
  items: InventoryItem[],
  options?: { now?: Date; limit?: number },
): EditorialPicksResponse {
  const now = options?.now ?? new Date();
  const limit = options?.limit ?? 10;

  const panels: EditorialPicksResponse['panels'] = {
    topToday: {
      ...PANEL_META.topToday,
      items: rankItems(items, scoreTopToday, isEligibleToday, now, limit),
    },
    topSponsor: {
      ...PANEL_META.topSponsor,
      items: rankItems(items, scoreTopSponsor, (item) => isEligibleSponsor(item), now, limit),
    },
    topEngagement: {
      ...PANEL_META.topEngagement,
      items: rankItems(
        items,
        scoreTopEngagement,
        (item) =>
          item.flags.celebrityCharity ||
          item.flags.freeEvent ||
          item.flags.sports ||
          item.flags.worldCup ||
          item.audienceScore >= 3,
        now,
        limit,
      ),
    },
    topNewBusinesses: {
      ...PANEL_META.topNewBusinesses,
      items: rankItems(items, scoreTopNewBusinesses, isEligibleNewBusiness, now, limit),
    },
    topCelebrityCharity: {
      ...PANEL_META.topCelebrityCharity,
      items: rankItems(
        items,
        scoreTopCelebrityCharity,
        isEligibleCelebrityCharity,
        now,
        limit,
      ),
    },
    topEstateSalesThisWeek: {
      ...PANEL_META.topEstateSalesThisWeek,
      items: rankItems(
        items,
        scoreTopEstateSalesThisWeek,
        isEligibleEstateSaleThisWeek,
        now,
        limit,
      ),
    },
    topShopping: {
      ...PANEL_META.topShopping,
      items: rankItems(
        items,
        scoreTopShopping,
        (item) => isEligibleShopping(item),
        now,
        limit,
      ),
    },
  };

  return {
    generatedAt: now.toISOString(),
    limit,
    panels,
  };
}
