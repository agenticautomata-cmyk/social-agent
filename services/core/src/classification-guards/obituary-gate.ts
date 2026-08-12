/**
 * Deterministic hard gate that must run BEFORE any business/event classification
 * (grand opening, boutique opening, restaurant opening, etc). Obituaries and death
 * notices must never be classified as a creator opportunity or business opening,
 * no matter what the LLM/heuristic classifier concludes.
 *
 * This is intentionally regex/keyword based (not model based) so it is stable,
 * fast, and auditable.
 */

// Order matters: more specific / less ambiguous phrases first so we can also
// report *why* something matched for audit purposes.
const OBITUARY_INDICATORS: Array<{ id: string; pattern: RegExp }> = [
  { id: 'obituary', pattern: /\bobituar(?:y|ies)\b/i },
  { id: 'passed_away', pattern: /\bpass(?:ed|es)?\s+away\b/i },
  { id: 'died', pattern: /\bdied\b(?!\s+(?:down|out|off))/i },
  { id: 'funeral', pattern: /\bfuneral\s+(?:service|home|mass|arrangements)?\b/i },
  { id: 'memorial_service', pattern: /\bmemorial\s+service\b/i },
  { id: 'celebration_of_life', pattern: /\bcelebration\s+of\s+life\b/i },
  { id: 'condolences', pattern: /\bcondolences\b/i },
  { id: 'survived_by', pattern: /\bsurvived\s+by\b/i },
  { id: 'preceded_in_death', pattern: /\bpreceded\s+(?:him|her|them)?\s*in\s+death\b/i },
  { id: 'death_date', pattern: /\bdate\s+of\s+death\b/i },
  { id: 'visitation', pattern: /\bvisitation\s+(?:will be held|hours?)\b/i },
  { id: 'age_at_death', pattern: /\bage\s+of\s+\d{1,3}\b.{0,40}\b(?:passed|died)\b/i },
  { id: 'family_by_side', pattern: /\bfamily\s+by\s+(?:his|her|their)\s+side\b/i },
  { id: 'in_lieu_of_flowers', pattern: /\bin\s+lieu\s+of\s+flowers\b/i },
  { id: 'entered_into_rest', pattern: /\bentered\s+into\s+(?:eternal\s+)?rest\b/i },
  { id: 'went_to_be_with_the_lord', pattern: /\bwent\s+to\s+be\s+with\s+(?:the\s+lord|god)\b/i },
];

/** Requires at least one strong indicator plus a "born"/age pattern to reduce false positives on plain "born" mentions. */
const BORN_DEATH_COMBO = /\bborn\b.{0,200}\b(?:died|passed away)\b/i;

export type ObituaryDetectionResult = {
  isObituary: boolean;
  matchedIndicators: string[];
};

export function detectObituaryOrDeathContent(...texts: Array<string | null | undefined>): ObituaryDetectionResult {
  const combined = texts.filter(Boolean).join(' \n ');
  if (!combined.trim()) return { isObituary: false, matchedIndicators: [] };

  const matched: string[] = [];
  for (const { id, pattern } of OBITUARY_INDICATORS) {
    if (pattern.test(combined)) matched.push(id);
  }
  if (BORN_DEATH_COMBO.test(combined)) matched.push('born_died_combo');

  return { isObituary: matched.length > 0, matchedIndicators: matched };
}

export function isObituaryOrDeathContent(...texts: Array<string | null | undefined>): boolean {
  return detectObituaryOrDeathContent(...texts).isObituary;
}

/** Categories that an obituary/death record must NEVER be routed to. */
export const FORBIDDEN_CATEGORIES_FOR_OBITUARY = new Set([
  'grand_opening',
  'restaurant_opening',
  'boutique_opening',
  'hotel_opening',
  'coffee_opening',
  'entertainment_opening',
  'business_opening',
]);
