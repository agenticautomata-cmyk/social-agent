import { formatIsoDate, getCreatorTimezone } from '../datetime.js';
import { searchWeb } from '../web-research/index.js';
import {
  buildFoodDiscoveryQuery,
  detectFoodIntent,
  detectInventoryDiscoveryQuery,
  type InventoryDiscoveryQuery,
} from './inventory-search.js';

export type ConciergeQueryKind = 'discovery' | 'recommendation' | 'research';
export type ConciergeQueryIntent = 'food' | 'general' | 'discovery' | 'research';

export type ConciergeQuery = {
  kind: ConciergeQueryKind;
  intent: ConciergeQueryIntent;
  rawQuery: string;
  inventoryQuery: InventoryDiscoveryQuery | null;
};

export type ConciergeWebResearch = {
  ok: boolean;
  searchQuery: string;
  summary: string | null;
  citations: Array<{ url: string; title: string | null }>;
  error?: string;
};

const CONCIERGE_EXCLUDE =
  /\b(views|metrics|engagement|tiktok|posting time|median|analytics|perform|underperform|who should i pitch|why are my|compare my|walk me through|hypothesis|sample size|media kit)\b/i;

const KC_CONTEXT =
  /\b(kansas city|\bkc\b|crossroads|country club plaza|westport|power\s*&\s*light|river market|northeast|midtown|overland park|olathe|liberty|parkville|strawberry hill|union station|first friday|18th\s*&?\s*vine|iron district|north loop|west bottoms|zona rosa|legoland|starlight|kauffman|arrowhead)\b/i;

/** User wants fresh facts from the web — not prescraped inventory. */
const LIVE_RESEARCH_PATTERNS = [
  /\b(find|search|lookup|look up|get)\b.{0,55}\b(new information|new info|latest|current|updated|up to date|recent news|official)\b/i,
  /\b(new information|latest on|what'?s new|most recent|up to date)\b/i,
  /\bwhere (?:are|will|would)\b.{0,90}\b(be|located|held|happening|take place|sites?|spots?)\b/i,
  /\bfan takeover\b/i,
  /\bfifa\b.{0,50}\b(fan|festival|zone|takeover|host|spot|location|site|venue)\b/i,
  /\bworld cup\b.{0,70}\b(fan fest|fan zone|fan festival|takeover|host city|kc|kansas city)\b/i,
  /\bkc2026\b/i,
  /\bofficial\b.{0,45}\b(fifa|world cup|fan fest|fan zone|takeover)\b/i,
];

export function detectLiveResearchIntent(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length < 8) return false;
  return LIVE_RESEARCH_PATTERNS.some((pattern) => pattern.test(trimmed));
}

const CONCIERGE_GENERAL_PATTERNS = [
  /\b(?:where|what).{0,35}(?:eat|drink|go|try|visit|grab|find|take|check out)\b/i,
  /\bbest .{2,55}(?:in kc|in kansas city|kansas city|crossroads|plaza|westport|river market)\b/i,
  /\brecommend(?:ation)?s?\b/i,
  /\b(?:restaurant|bar|coffee|brunch|lunch|dinner|date night|happy hour|rooftop|tacos|pizza|sushi|brewery|winery|farmers market|food truck)\b/i,
  /\b(?:is there|are there).{0,55}(?:today|tonight|tomorrow|this weekend|this week|open|happening)\b/i,
  /\bwhat(?:'s| is) open\b/i,
  /\bplan (?:a|my) (?:night|weekend|date|day out|evening)\b/i,
  /\b(?:concierge|local guide|what do locals)\b/i,
  /\b(?:ticket|tickets|reservation|hours|address).{0,30}(?:for|at|to)\b/i,
];

function hasLocalLifeIntent(message: string): boolean {
  return (
    KC_CONTEXT.test(message) ||
    /\b(today|tonight|tomorrow|this weekend|this week|near me|nearby)\b/i.test(message) ||
    /\b(event|concert|festival|show|music|live music|museum|market|opening)\b/i.test(message)
  );
}

export function detectConciergeQuery(message: string): ConciergeQuery | null {
  const trimmed = message.trim();
  if (!trimmed) return null;
  if (CONCIERGE_EXCLUDE.test(trimmed)) return null;

  if (detectFoodIntent(trimmed)) {
    return {
      kind: 'recommendation',
      intent: 'food',
      rawQuery: trimmed,
      inventoryQuery: buildFoodDiscoveryQuery(trimmed),
    };
  }

  if (trimmed.length < 8) return null;

  if (detectLiveResearchIntent(trimmed)) {
    return { kind: 'research', intent: 'research', rawQuery: trimmed, inventoryQuery: null };
  }

  const inventoryQuery = detectInventoryDiscoveryQuery(trimmed);
  if (inventoryQuery) {
    return { kind: 'discovery', intent: 'discovery', rawQuery: trimmed, inventoryQuery };
  }

  if (!hasLocalLifeIntent(trimmed)) return null;
  if (!CONCIERGE_GENERAL_PATTERNS.some((pattern) => pattern.test(trimmed))) return null;

  return { kind: 'recommendation', intent: 'general', rawQuery: trimmed, inventoryQuery: null };
}

function dateWindowHint(window: InventoryDateWindow | null | undefined): string | null {
  switch (window) {
    case 'today':
      return 'today';
    case 'tomorrow':
      return 'tomorrow';
    case 'weekend':
      return 'this weekend';
    case 'week':
      return 'this week';
    default:
      return null;
  }
}

type InventoryDateWindow = InventoryDiscoveryQuery['dateWindow'];

function buildWebSearchQuery(input: {
  message: string;
  inventoryQuery: InventoryDiscoveryQuery | null;
  kind: ConciergeQueryKind;
  intent: ConciergeQueryIntent;
  now: Date;
}): string {
  const year = input.now.getFullYear();
  const trimmed = input.message.replace(/[?.!]+$/, '').trim();

  if (input.intent === 'food') {
    return [
      trimmed,
      'best restaurants Kansas City Missouri open now',
      'where to eat',
      String(year),
    ].join(' — ');
  }

  if (input.kind === 'research') {
    const fifaContext =
      /\b(fifa|world cup|fan takeover|fan fest|fan zone|kc2026)\b/i.test(trimmed);
    const parts = [
      trimmed,
      'Kansas City Missouri',
      fifaContext
        ? 'FIFA World Cup 2026 fan festival fan zone takeover official locations sites'
        : '',
      String(year),
    ].filter(Boolean);
    return parts.join(' — ');
  }

  const parts = [trimmed, 'Kansas City Missouri metro', String(year)];

  const dateHint = dateWindowHint(input.inventoryQuery?.dateWindow);
  if (dateHint) parts.push(dateHint);
  if (input.inventoryQuery?.keywords.length) {
    parts.push(input.inventoryQuery.keywords.join(', '));
  }

  return parts.join(' — ');
}

function buildConciergeInstructions(input: {
  now: Date;
  inventoryQuery: InventoryDiscoveryQuery | null;
  kind: ConciergeQueryKind;
  intent: ConciergeQueryIntent;
}): string {
  const todayLabel = formatIsoDate(input.now.toISOString(), getCreatorTimezone());
  const dateHint = dateWindowHint(input.inventoryQuery?.dateWindow);

  if (input.intent === 'food') {
    return [
      'You are Benson\'s Kansas City food concierge.',
      `Today is ${todayLabel} (${getCreatorTimezone()}).`,
      'The user wants somewhere to eat — answer hunger/food literally.',
      'Recommend specific restaurants, cafes, food halls, or food trucks with neighborhoods and why they fit.',
      'Do NOT recommend festivals, fan fests, sports events, concerts, or unrelated entertainment unless they are primarily food-focused.',
      'Prefer official restaurant pages, Visit KC dining guides, and credible local food coverage.',
      'Cite source URLs. Under 220 words. If nothing credible is found, say so plainly.',
    ].join(' ');
  }

  if (input.kind === 'research') {
    return [
      'You are Benson\'s live web research layer for Kansas City.',
      `Today is ${todayLabel} (${getCreatorTimezone()}).`,
      'The user wants NEW verified information from the internet — NOT scraped event feeds or aggregators.',
      'Search official FIFA/KC2026, Visit KC, venue announcements, and credible local news.',
      'Report specific locations, addresses or neighborhoods, dates, and whether each site is confirmed vs rumored.',
      'If older scraped listings disagree with live sources, trust only what you find on the web now.',
      'Cite source URLs for every claim. Under 300 words. If nothing credible is found, say so plainly.',
    ].join(' ');
  }

  return [
    'You are Benson\'s Kansas City concierge research layer.',
    `Today is ${todayLabel} (${getCreatorTimezone()}).`,
    dateHint ? `Prioritize what is actually happening ${dateHint}.` : 'Prioritize current, verifiable Kansas City metro results.',
    'Return specific event/venue names, neighborhoods, dates/times, and ticket or official links when available.',
    'Prefer official venue pages, Visit KC, local news, and event calendars over aggregators.',
    'Cite source URLs. Under 280 words. If nothing credible is found, say so plainly.',
  ].join(' ');
}

export async function researchConciergeWeb(input: {
  query: ConciergeQuery;
  now?: Date;
}): Promise<ConciergeWebResearch> {
  const now = input.now ?? new Date();
  const searchQuery = buildWebSearchQuery({
    message: input.query.rawQuery,
    inventoryQuery: input.query.inventoryQuery,
    kind: input.query.kind,
    intent: input.query.intent,
    now,
  });

  const result = await searchWeb(
    searchQuery,
    buildConciergeInstructions({
      now,
      inventoryQuery: input.query.inventoryQuery,
      kind: input.query.kind,
      intent: input.query.intent,
    }),
  );

  return {
    ok: result.ok,
    searchQuery,
    summary: result.summary,
    citations: result.citations,
    error: result.error,
  };
}
