import type { EditorialContentType, EditorialDevelopmentType } from './types.js';

/** Development-signal phrases — no brand/domain hard-coding. */
export const EDITORIAL_DEVELOPMENT_PATTERNS: Array<{
  type: EditorialDevelopmentType;
  pattern: RegExp;
  weight: number;
}> = [
  { type: 'first_to_market', pattern: /\bfirst[- ]to[- ]market\b/i, weight: 5 },
  { type: 'first_to_market', pattern: /\bfirst (?:location|store|restaurant|hotel) in (?:kansas city|kc)\b/i, weight: 5 },
  { type: 'grand_opening', pattern: /\bgrand opening\b/i, weight: 5 },
  { type: 'soft_opening', pattern: /\bsoft opening\b/i, weight: 4 },
  { type: 'coming_soon', pattern: /\bcoming soon\b|\bopening soon\b/i, weight: 4 },
  { type: 'reopening', pattern: /\bre-?opening\b|\breopened\b/i, weight: 4 },
  { type: 'renovation', pattern: /\brenovat(?:ion|ed|ing)\b/i, weight: 3 },
  { type: 'expansion', pattern: /\bexpansion\b|\bexpanding (?:to|into)\b/i, weight: 3 },
  { type: 'relocation', pattern: /\brelocati(?:on|ng|ed)\b|\bmoved to\b/i, weight: 3 },
  { type: 'new_location', pattern: /\bnew location\b|\bnew store\b|\bnew shop\b/i, weight: 4 },
  { type: 'new_retail_opening', pattern: /\b(?:retailer|boutique|store|shop)\b.{0,40}\b(?:opened|opens|opening)\b/i, weight: 4 },
  { type: 'restaurant_launch', pattern: /\b(?:restaurant|cafe|coffee|bakery|bistro)\b.{0,40}\b(?:opened|opens|opening|launch)\b/i, weight: 4 },
  { type: 'hotel_opening', pattern: /\bhotel\b.{0,40}\b(?:opened|opens|opening)\b/i, weight: 4 },
  { type: 'attraction_opening', pattern: /\b(?:attraction|museum|gallery)\b.{0,40}\b(?:opened|opens|opening)\b/i, weight: 3 },
  { type: 'business_opening', pattern: /\b(?:now open|newly opened|opened (?:its|a|the)|opens (?:its|a|the))\b/i, weight: 4 },
  { type: 'new_menu', pattern: /\b(?:new|seasonal) menu\b/i, weight: 2 },
  { type: 'new_product', pattern: /\bnew product(?:s)?\b|\blaunch(?:ed|ing)? (?:a |their )?product\b/i, weight: 2 },
  { type: 'new_service', pattern: /\bnew service\b/i, weight: 2 },
  { type: 'new_ownership', pattern: /\bnew ownership\b|\bunder new ownership\b/i, weight: 3 },
  { type: 'new_concept', pattern: /\bnew concept\b/i, weight: 3 },
  { type: 'development_announcement', pattern: /\bdevelopment (?:announcement|plans?|project)\b|\bredevelopment\b/i, weight: 2 },
  { type: 'tenant_announcement', pattern: /\btenant\b.{0,30}\b(?:announc|signed|lease|opening)\b/i, weight: 3 },
  { type: 'construction_completion', pattern: /\bconstruction (?:complete|completed|finished)\b/i, weight: 2 },
  { type: 'local_brand_launch', pattern: /\blocal brand launch\b|\blaunch(?:ed|ing) (?:in|their) (?:kansas city|kc)\b/i, weight: 3 },
  { type: 'milestone', pattern: /\b(?:anniversary|milestone)\b/i, weight: 1 },
  { type: 'creator_press_preview', pattern: /\b(?:press preview|media preview|creator preview)\b/i, weight: 4 },
  { type: 'media_event', pattern: /\bmedia event\b|\bpress event\b/i, weight: 3 },
  { type: 'collaboration_affiliate', pattern: /\b(?:collaboration|collab|affiliate program|ambassador program)\b/i, weight: 3 },
];

const SPECULATIVE_PATTERNS = [
  /\bcould (?:be|open|launch)\b/i,
  /\bmight (?:open|launch|arrive)\b/i,
  /\brumored?\b/i,
  /\bunconfirmed\b/i,
  /\bpossibly\b/i,
  /\bmay (?:open|launch|arrive)\b/i,
  /\bwhat(?:'s| is) (?:next|opening)\??\b/i,
];

const NEWS_ONLY_PATTERNS = [
  /\bheat advisory\b/i,
  /\bweather (?:alert|warning)\b/i,
  /\btraffic (?:alert|update)\b/i,
  /\belection (?:results|update)\b/i,
  /\bcrime (?:report|alert)\b/i,
  /\bobituary\b/i,
];

const PAST_RECAP_PATTERNS = [
  /\brecap\b/i,
  /\bin review\b/i,
  /\blooking back\b/i,
  /\blast (?:year|month|week)'?s highlights\b/i,
];

export type EditorialSignalHit = {
  developmentType: EditorialDevelopmentType;
  weight: number;
  matched: string;
};

export function detectEditorialDevelopmentSignals(text: string): EditorialSignalHit[] {
  const hits: EditorialSignalHit[] = [];
  for (const entry of EDITORIAL_DEVELOPMENT_PATTERNS) {
    const m = text.match(entry.pattern);
    if (m) {
      hits.push({ developmentType: entry.type, weight: entry.weight, matched: m[0] });
    }
  }
  return hits.sort((a, b) => b.weight - a.weight);
}

export function hasEditorialOpportunitySignal(text: string): boolean {
  return detectEditorialDevelopmentSignals(text).some((h) => h.weight >= 2);
}

/**
 * Classify content type before persistence. Openings are NOT calendar events.
 * Creator invitation / influencer keywords are NOT required.
 */
export function classifyEditorialContentType(input: {
  text: string;
  subject?: string;
  hasFutureEventDate?: boolean;
  articleBlocked?: boolean;
  speculativeOnly?: boolean;
}): EditorialContentType {
  const blob = `${input.subject ?? ''}\n${input.text}`;

  if (input.articleBlocked && !hasEditorialOpportunitySignal(input.text)) {
    return 'blocked_unavailable';
  }
  if (NEWS_ONLY_PATTERNS.some((p) => p.test(blob)) && !hasEditorialOpportunitySignal(blob)) {
    return 'news_only';
  }
  if (PAST_RECAP_PATTERNS.some((p) => p.test(blob)) && !hasEditorialOpportunitySignal(blob)) {
    return 'past_recap';
  }
  if (input.speculativeOnly || (SPECULATIVE_PATTERNS.some((p) => p.test(blob)) && !/\bopened\b|\bopens\b|\bnow open\b/i.test(blob))) {
    // Speculative without confirmed open language stays editorial lead / irrelevant.
    if (hasEditorialOpportunitySignal(blob)) return 'editorial_lead';
    return 'irrelevant';
  }

  const hits = detectEditorialDevelopmentSignals(blob);
  if (hits.length === 0) {
    if (input.hasFutureEventDate) return 'calendar_event';
    return 'news_only';
  }

  const top = hits[0]!.developmentType;
  if (top === 'collaboration_affiliate') return 'affiliate_opportunity';
  if (top === 'hotel_opening') return 'hospitality_opportunity';
  if (top === 'creator_press_preview' || top === 'media_event') return 'pr_contact_lead';
  if (top === 'new_menu' || /sale\b|% off|promotion/i.test(blob)) {
    if (/sale\b|% off|promotion/i.test(blob) && hits.every((h) => h.weight < 3)) {
      return 'promotion_offer';
    }
  }
  if (
    /opening|first_to_market|coming_soon|launch|reopening|renovation|expansion|new_location|tenant|development|concept|ownership/i.test(
      top,
    )
  ) {
    return 'business_opening_development';
  }
  if (input.hasFutureEventDate && /concert|festival|workshop|tickets/i.test(blob)) {
    return 'calendar_event';
  }
  return 'creator_business_opportunity';
}

export function isPersistableEditorialOpportunity(contentType: EditorialContentType): boolean {
  return (
    contentType === 'creator_business_opportunity' ||
    contentType === 'business_opening_development' ||
    contentType === 'hospitality_opportunity' ||
    contentType === 'affiliate_opportunity' ||
    contentType === 'pr_contact_lead' ||
    contentType === 'editorial_lead'
  );
}

/** News-only becomes actionable only with a plausible KCKellie angle. */
export function hasPlausibleCreatorAngle(input: {
  contentType: EditorialContentType;
  text: string;
  localMarket?: boolean;
}): boolean {
  if (!isPersistableEditorialOpportunity(input.contentType) && input.contentType !== 'news_only') {
    return false;
  }
  if (input.contentType === 'news_only') {
    return false;
  }
  const local =
    input.localMarket !== false &&
    /\b(?:kansas city|kc\b|plaza|overland park|lenexa|olathe|missouri|kansas)\b/i.test(input.text);
  if (!local) return false;
  return hasEditorialOpportunitySignal(input.text) || input.contentType !== 'news_only';
}
