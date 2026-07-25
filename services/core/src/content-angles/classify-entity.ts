import { matchesArticleHeadlineAsCompany } from '../creator-agent/exclusion-rules.js';
import type { AngleMatchInput, RecordEntityType } from './types.js';

const CONCERT_ARTICLE_RE =
  /\b(presents|symphony|concert|tour 20\d{2}|live on tour|performs|trey anastasio|tori kelly|grammy|billboard)\b/i;
const PROMOTION_RE =
  /\b(clearance sale|buy \d+ or more|% off|limited time|doorbuster|flash sale)\b/i;
const ATHLETIC_BRAND_RE = /\b(adidas|nike|puma|under armour|reebok|new balance|lululemon)\b/i;
const APPAREL_RETAIL_RE = /\b(aerie|american eagle|gap|old navy|h\s*&\s*m|zara|forever 21|athleta|lululemon)\b/i;
const GROCERY_RE = /\b(price chopper|hy-?vee|walmart|costco|aldi|trader joe|whole foods)\b/i;
const HOTEL_RE = /\b(hotel|museum hotel|inn|resort|staycation|boutique hotel)\b/i;
const RESTAURANT_RE =
  /\b(restaurant|cafe|coffee|bistro|tavern|grill|dining|kitchen|bar & grill|supper club)\b/i;
const NIGHTLIFE_RE = /\b(lounge|rooftop bar|nightclub|cocktail bar|speakeasy|live music venue)\b/i;
const LUXURY_EVIDENCE_RE =
  /\b(luxury|premium|five-star|michelin|tasting menu|chef'?s table|suite|spa package|designer|high-end|upscale)\b/i;

function haystack(input: AngleMatchInput): string {
  return [input.title, input.summary, input.businessName, input.category, input.sourceType, input.venue]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Title/summary/name only — category tags like "dining" must not block article detection. */
function recordText(input: AngleMatchInput): string {
  return [input.title, input.summary, input.businessName, input.venue]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function classifyRecordEntity(input: AngleMatchInput): RecordEntityType {
  const text = haystack(input);
  const coreText = recordText(input);

  if (matchesArticleHeadlineAsCompany(coreText) || PROMOTION_RE.test(coreText)) return 'promotion';
  if (CONCERT_ARTICLE_RE.test(coreText) && !RESTAURANT_RE.test(coreText)) return 'article';
  if (/^we had a blast|^article:|^news:/i.test(input.title.trim())) return 'malformed';
  if (
    (input.flags?.businessOpening && !CONCERT_ARTICLE_RE.test(coreText)) ||
    RESTAURANT_RE.test(coreText) ||
    HOTEL_RE.test(coreText)
  ) {
    return 'business';
  }
  if (input.flags?.freeEvent || CONCERT_ARTICLE_RE.test(coreText) || /\bevent\b/.test(coreText)) {
    return 'event';
  }
  if (
    input.businessName &&
    input.businessName.length > 2 &&
    !CONCERT_ARTICLE_RE.test(input.businessName)
  ) {
    return 'business';
  }
  if (CONCERT_ARTICLE_RE.test(coreText)) return 'article';
  return 'unknown';
}

export function hasLuxuryEvidence(input: AngleMatchInput): boolean {
  const text = haystack(input);
  return Boolean(input.flags?.luxury && LUXURY_EVIDENCE_RE.test(text)) || LUXURY_EVIDENCE_RE.test(text);
}

export function isAthleticBrand(input: AngleMatchInput): boolean {
  return ATHLETIC_BRAND_RE.test(recordText(input));
}

export function isApparelRetailBrand(input: AngleMatchInput): boolean {
  return APPAREL_RETAIL_RE.test(recordText(input));
}

export function isDateNightEligible(input: AngleMatchInput): boolean {
  const text = haystack(input);
  const coreText = recordText(input);
  const entity = classifyRecordEntity(input);

  if (entity === 'article' || entity === 'promotion' || entity === 'malformed') return false;
  if (isAthleticBrand(input) || isApparelRetailBrand(input) || GROCERY_RE.test(coreText)) return false;
  if (input.flags?.shopping || input.flags?.retail || input.flags?.estateSale) return false;

  const couplesExperience =
    RESTAURANT_RE.test(coreText) ||
    HOTEL_RE.test(coreText) ||
    NIGHTLIFE_RE.test(coreText) ||
    /\b(couples|romantic|date night|anniversary|valentine)\b/.test(coreText) ||
    input.category === 'date_night' ||
    input.category === 'couples_event' ||
    input.category === 'wine_tasting' ||
    input.category === 'rooftop_experience' ||
    input.category === 'hotel_package' ||
    input.category === 'spa_package';

  if (!couplesExperience) return false;

  // Require source support — not just a loose dateNight flag on unrelated inventory
  const sourceSupports =
    Boolean(input.summary?.trim()) ||
    RESTAURANT_RE.test(coreText) ||
    HOTEL_RE.test(coreText) ||
    NIGHTLIFE_RE.test(coreText) ||
    input.flags?.dining ||
    input.category === 'date_night';

  return sourceSupports;
}

export function isLuxuryDateNightEligible(input: AngleMatchInput): boolean {
  return isDateNightEligible(input) && hasLuxuryEvidence(input);
}

export function normalizeBusinessKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}
