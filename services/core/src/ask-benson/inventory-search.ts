import { getCreatorTimezone } from '../datetime.js';
import { loadIngestedInventoryItems } from '../inventory/load-ingested.js';
import type { InventoryItem } from '../inventory/normalize.js';

export type InventoryDateWindow = 'today' | 'tomorrow' | 'weekend' | 'week' | 'any';

export type InventoryDiscoveryQuery = {
  dateWindow: InventoryDateWindow;
  keywords: string[];
  rawQuery: string;
  intent?: 'events' | 'food';
};

export type InventorySearchMatch = {
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  eventDate: string | null;
  eventDateLabel: string | null;
  location: string | null;
  venue: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  whyItMatters: string;
  audienceScore: number;
  matchScore: number;
  matchReasons: string[];
  reviewUrl: string;
};

export type InventorySearchResult = {
  query: InventoryDiscoveryQuery;
  searchedAt: string;
  matchCount: number;
  widenedFrom: InventoryDateWindow | null;
  matches: InventorySearchMatch[];
};

const INVENTORY_DISCOVERY_PATTERNS = [
  /what(?:'s| is) (?:going on|happening)/i,
  /what(?:'s| are) (?:there|the events?)/i,
  /anything (?:going on|happening|fun|worth)/i,
  /(?:going on|happening) (?:today|tonight|tomorrow|this weekend|this week)/i,
  /events? (?:today|tonight|tomorrow|this weekend|this week)/i,
  /things to do (?:today|tonight|this weekend|this week)/i,
  /what can i (?:film|cover|post about|check out) (?:today|tonight|this weekend|this week)?/i,
  /show me (?:events?|opportunities|inventory).{0,30}(?:today|tonight|this weekend|this week|featuring|with|about)/i,
  /(?:find|list|any) (?:events?|shows?|concerts?).{0,40}(?:today|tonight|this weekend|featuring|with|live)/i,
];

const INVENTORY_EXCLUDE =
  /\b(views|metrics|engagement|tiktok|posting time|median|analytics|perform|underperform|who should i pitch|why are my|compare my|walk me through|hypothesis|sample size)\b/i;

const FOOD_HUNGER_PATTERNS = [
  /\b(?:i'?m|im|i am|feeling|getting)\s+(?:so\s+)?(?:hungry|starving|peckish|hangry)\b/i,
  /\b(?:hungry|starving|peckish|hangry)\b/i,
  /\b(?:need|want|craving|crave|could use|looking for)\s+(?:some\s+)?(?:food|eat|lunch|dinner|breakfast|brunch|snack|tacos|pizza|sushi|burger)\b/i,
  /\bwhere (?:should|can|do) (?:i|we) (?:eat|grab food|get food|go for food)\b/i,
  /\b(?:food rec|restaurant rec|place to eat)\b/i,
];

const FOOD_DEFAULT_KEYWORDS = ['restaurant', 'dining', 'food'];

const FOOD_CATEGORY_HINTS = [
  'dining',
  'restaurant',
  'restaurant_opening',
  'restaurant_week',
  'luxury_dining',
  'coffee_opening',
  'brunch',
];

const KEYWORD_STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'today',
  'tonight',
  'tomorrow',
  'this',
  'weekend',
  'week',
  'going',
  'on',
  'what',
  'whats',
  "what's",
  'is',
  'are',
  'there',
  'happening',
  'anything',
  'events',
  'event',
  'show',
  'me',
  'find',
  'list',
  'any',
  'some',
  'please',
  'benson',
  'kellie',
  'kc',
  'kansas',
  'city',
]);

function localCalendarDay(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function parseEventDay(iso: string | null | undefined, timezone: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return localCalendarDay(d, timezone);
}

function addDaysToCalendarDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return localCalendarDay(d, getCreatorTimezone());
}

function getWeekendDays(now: Date, timezone: string): Set<string> {
  const today = localCalendarDay(now, timezone);
  const weekday = new Date(`${today}T12:00:00`).getDay();
  const days = new Set<string>();

  if (weekday === 0) {
    days.add(today);
    days.add(addDaysToCalendarDay(today, -1));
    days.add(addDaysToCalendarDay(today, -2));
    return days;
  }
  if (weekday === 6) {
    days.add(today);
    days.add(addDaysToCalendarDay(today, -1));
    days.add(addDaysToCalendarDay(today, 1));
    return days;
  }
  if (weekday === 5) {
    days.add(today);
    days.add(addDaysToCalendarDay(today, 1));
    days.add(addDaysToCalendarDay(today, 2));
    return days;
  }

  const untilFriday = 5 - weekday;
  const friday = addDaysToCalendarDay(today, untilFriday);
  days.add(friday);
  days.add(addDaysToCalendarDay(friday, 1));
  days.add(addDaysToCalendarDay(friday, 2));
  return days;
}

function getWeekDays(now: Date, timezone: string): Set<string> {
  const today = localCalendarDay(now, timezone);
  const days = new Set<string>([today]);
  for (let i = 1; i <= 6; i += 1) {
    days.add(addDaysToCalendarDay(today, i));
  }
  return days;
}

function parseDateWindow(message: string): InventoryDateWindow {
  const text = message.toLowerCase();
  if (/\bthis weekend\b/.test(text)) return 'weekend';
  if (/\btonight\b|\btoday\b/.test(text)) return 'today';
  if (/\btomorrow\b/.test(text)) return 'tomorrow';
  if (/\bthis week\b/.test(text)) return 'week';
  if (/what(?:'s| is) (?:going on|happening)|anything (?:going on|happening)/i.test(message)) {
    return 'today';
  }
  return 'any';
}

function cleanKeyword(raw: string): string {
  return raw
    .replace(/[?.!]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractKeywords(message: string): string[] {
  const keywords = new Set<string>();

  const patterns = [
    /\b(?:featuring|with|about|around|for)\s+(.+?)(?:\?|$)/i,
    /\b(?:featuring|with|about|around|for)\s+(.+?)(?:\s+(?:today|tonight|tomorrow|this weekend|this week)\b)/i,
    /\b(?:live|local)\s+[a-z][\w\s-]{1,40}$/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (!match?.[1]) continue;
    const phrase = cleanKeyword(match[1]);
    if (phrase.length >= 2 && !KEYWORD_STOP_WORDS.has(phrase)) {
      keywords.add(phrase);
    }
  }

  if (keywords.size === 0) {
    const stripped = message
      .replace(
        /^(?:please\s+)?(?:what(?:'s| is)|anything|show me|find|list|any)\s+(?:going on|happening|events?|things to do|there)\s*/i,
        '',
      )
      .replace(/\b(?:today|tonight|tomorrow|this weekend|this week)\b/gi, '')
      .replace(/\b(?:featuring|with|about|for)\b/gi, '')
      .trim();
    const phrase = cleanKeyword(stripped);
    if (phrase.length >= 3 && !KEYWORD_STOP_WORDS.has(phrase)) {
      keywords.add(phrase);
    }
  }

  return [...keywords];
}

export function detectFoodIntent(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length < 5) return false;
  return FOOD_HUNGER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function buildFoodDiscoveryQuery(message: string): InventoryDiscoveryQuery {
  const trimmed = message.trim();
  const genericFoodWords = new Set(['hungry', 'starving', 'peckish', 'hangry', 'food', 'eat', 'eating']);
  const extracted = extractKeywords(trimmed).filter((keyword) => !genericFoodWords.has(keyword));
  const keywords = [...new Set([...extracted, ...FOOD_DEFAULT_KEYWORDS])];

  return {
    dateWindow: 'any',
    keywords,
    rawQuery: trimmed,
    intent: 'food',
  };
}

export function detectInventoryDiscoveryQuery(message: string): InventoryDiscoveryQuery | null {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length < 8) return null;
  if (INVENTORY_EXCLUDE.test(trimmed)) return null;
  if (!INVENTORY_DISCOVERY_PATTERNS.some((pattern) => pattern.test(trimmed))) return null;

  const keywords = extractKeywords(trimmed);
  return {
    dateWindow: parseDateWindow(trimmed),
    keywords,
    rawQuery: trimmed,
    intent: 'events',
  };
}

function itemLocation(item: InventoryItem): string | null {
  return (
    item.locationName ??
    item.venue ??
    item.businessName ??
    item.neighborhood ??
    item.address ??
    null
  );
}

function searchableText(item: InventoryItem): string {
  return [
    item.title,
    item.summary,
    item.whyItMatters,
    item.category,
    item.venue,
    item.businessName,
    item.neighborhood,
    item.locationName,
    ...item.badges,
    JSON.stringify(item.metadata ?? {}),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function includesTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

function matchesDateWindow(
  item: InventoryItem,
  window: InventoryDateWindow,
  now: Date,
  timezone: string,
  requireEventDate: boolean,
): boolean {
  const eventDay = parseEventDay(item.eventDate, timezone);
  const discoveredDay = parseEventDay(item.discoveredAt ?? item.createdAt, timezone);
  const today = localCalendarDay(now, timezone);

  if (requireEventDate && !eventDay) {
    return false;
  }

  switch (window) {
    case 'today':
      if (eventDay === today) return true;
      if (!requireEventDate && !eventDay && discoveredDay === today) return true;
      return false;
    case 'tomorrow': {
      const tomorrow = addDaysToCalendarDay(today, 1);
      if (eventDay === tomorrow) return true;
      if (!requireEventDate && !eventDay && discoveredDay === tomorrow) return true;
      return false;
    }
    case 'weekend': {
      const weekendDays = getWeekendDays(now, timezone);
      if (eventDay && weekendDays.has(eventDay)) return true;
      if (!requireEventDate && !eventDay && discoveredDay && weekendDays.has(discoveredDay)) {
        return true;
      }
      return false;
    }
    case 'week': {
      const weekDays = getWeekDays(now, timezone);
      if (eventDay && weekDays.has(eventDay)) return true;
      if (!requireEventDate && !eventDay && discoveredDay && weekDays.has(discoveredDay)) {
        return true;
      }
      return false;
    }
    default:
      return true;
  }
}

const LIVE_MUSIC_CATEGORY_HINTS = [
  'live music',
  'music event',
  'concert',
  'jazz',
  'blues',
  'band',
];

const THEATER_HINTS = /\b(theater|theatre|broadway|musical|hadestown|opera)\b/i;

function matchesLiveMusicIntent(item: InventoryItem, keyword: string): boolean {
  if (!/\blive\s*music\b/i.test(keyword)) return true;

  const title = item.title.toLowerCase();
  const category = (item.category ?? '').toLowerCase();
  const body = searchableText(item);

  if (includesTerm(title, 'live music') || includesTerm(body, 'live music')) return true;
  if (LIVE_MUSIC_CATEGORY_HINTS.some((hint) => category.includes(hint))) return true;

  if (THEATER_HINTS.test(`${title} ${category}`) && !includesTerm(title, 'live music')) {
    return false;
  }

  return includesTerm(body, 'live') && includesTerm(body, 'music');
}

function isFoodInventoryItem(item: InventoryItem): boolean {
  const category = (item.category ?? '').toLowerCase();
  return item.flags.dining || FOOD_CATEGORY_HINTS.some((hint) => category.includes(hint));
}

function scoreKeywordMatch(
  item: InventoryItem,
  keywords: string[],
  intent?: InventoryDiscoveryQuery['intent'],
): { score: number; reasons: string[] } {
  if (keywords.length === 0) {
    return { score: 8, reasons: ['date window match'] };
  }

  const title = item.title.toLowerCase();
  const body = searchableText(item);
  let score = 0;
  const reasons: string[] = [];

  for (const keyword of keywords) {
    if (!matchesLiveMusicIntent(item, keyword)) {
      continue;
    }

    if (includesTerm(title, keyword) || title.includes(keyword)) {
      score += 40;
      reasons.push(`title matches "${keyword}"`);
      continue;
    }
    if (includesTerm(body, keyword)) {
      score += 22;
      reasons.push(`details match "${keyword}"`);
      continue;
    }

    const tokens = keyword.split(/\s+/).filter((t) => t.length >= 2);
    if (tokens.length >= 2) {
      if (tokens.every((token) => includesTerm(body, token))) {
        score += 18;
        reasons.push(`terms match "${keyword}"`);
      }
      continue;
    }

    if (tokens.length === 1 && includesTerm(body, tokens[0]!)) {
      score += 12;
      reasons.push(`term matches "${keyword}"`);
    }
  }

  if (
    keywords.some((k) => /\blive\s*music\b/i.test(k)) &&
    LIVE_MUSIC_CATEGORY_HINTS.some((hint) => (item.category ?? '').toLowerCase().includes(hint))
  ) {
    score += 10;
    reasons.push('live music category');
  }

  return { score, reasons };
}

function formatEventDateLabel(iso: string | null, timezone: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function rankInventoryMatches(input: {
  items: InventoryItem[];
  query: InventoryDiscoveryQuery;
  excluded: Set<string>;
  now: Date;
  timezone: string;
  limit: number;
  requireEventDate: boolean;
}) {
  const today = localCalendarDay(input.now, input.timezone);

  return input.items
    .filter((item) => {
      if (item.category && input.excluded.has(item.category.toLowerCase())) return false;
      return matchesDateWindow(
        item,
        input.query.dateWindow,
        input.now,
        input.timezone,
        input.requireEventDate,
      );
    })
    .map((item) => {
      const { score: keywordScore, reasons } = scoreKeywordMatch(
        item,
        input.query.keywords,
        input.query.intent,
      );
      let score = keywordScore + item.audienceScore * 3;
      const eventDay = parseEventDay(item.eventDate, input.timezone);

      if (eventDay === today) score += 14;
      if (item.ingest?.startsWith('ask_benson')) score += 6;
      if (item.flags.freeEvent) score += 2;

      if (input.query.intent === 'food' && !isFoodInventoryItem(item) && keywordScore === 0) {
        return null;
      }

      if (input.query.keywords.length > 0 && keywordScore === 0) {
        return null;
      }

      return {
        item,
        score,
        reasons,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((a, b) => b.score - a.score || b.item.audienceScore - a.item.audienceScore)
    .slice(0, input.limit);
}

export async function searchInventoryForChat(input: {
  query: InventoryDiscoveryQuery;
  excludedCategories?: string[];
  now?: Date;
  limit?: number;
}): Promise<InventorySearchResult> {
  const now = input.now ?? new Date();
  const timezone = getCreatorTimezone();
  const limit = input.limit ?? 12;
  const excluded = new Set((input.excludedCategories ?? []).map((c) => c.toLowerCase()));
  const requireEventDate = input.query.keywords.length > 0 && input.query.intent !== 'food';

  const items = await loadIngestedInventoryItems();
  let effectiveQuery = input.query;
  let widenedFrom: InventoryDateWindow | null = null;

  let scored = rankInventoryMatches({
    items,
    query: effectiveQuery,
    excluded,
    now,
    timezone,
    limit,
    requireEventDate,
  });

  if (
    scored.length === 0 &&
    input.query.keywords.length > 0 &&
    (input.query.dateWindow === 'today' || input.query.dateWindow === 'tomorrow')
  ) {
    widenedFrom = input.query.dateWindow;
    effectiveQuery = { ...input.query, dateWindow: 'weekend' };
    scored = rankInventoryMatches({
      items,
      query: effectiveQuery,
      excluded,
      now,
      timezone,
      limit,
      requireEventDate: true,
    });
  }

  return {
    query: effectiveQuery,
    searchedAt: now.toISOString(),
    matchCount: scored.length,
    widenedFrom,
    matches: scored.map(({ item, score, reasons }) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      category: item.category,
      eventDate: item.eventDate,
      eventDateLabel: formatEventDateLabel(item.eventDate, timezone),
      location: itemLocation(item),
      venue: item.venue,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      whyItMatters: item.whyItMatters,
      audienceScore: item.audienceScore,
      matchScore: score,
      matchReasons: reasons,
      reviewUrl: `/review/inventory?id=${item.id}`,
    })),
  };
}