/**
 * Semantic category guard for Home / showroom — keyword presence is not authority.
 */

export type CategoryGuardInput = {
  title: string;
  category?: string | null;
  reason?: string | null;
  businessName?: string | null;
};

export type CategoryGuardResult = {
  ok: boolean;
  reasonCode: string | null;
  suggestedLabel: string | null;
};

const DINING_CLAIM_RE =
  /\b(dining|restaurant|cafe|coffee_opening|food opening|restaurant\/cafe|timely restaurant)\b/i;

const FOOD_SUBJECT_RE =
  /\b(restaurant|cafe|caf[eé]|coffee(\s*shop)?|bakery|bistro|diner|eatery|food hall|menu|brunch|dinner|lunch|kitchen|chef|eat this|drink this|dessert|burger|latte|ramen|wonton|sandwich|pizza|taco|bar\b|lounge|sipps|pistachio|pommes|frites|chili|produce|market)\b/i;

const LAW_SUBJECT_RE =
  /\b(law\b|legal services?|attorney|lawyer|counsel|law firm|funk house law)\b/i;

const ARTICLE_NOT_OPENING_RE =
  /\b(destigmatiz|difficult conversations|about earthly|feature story|profile of|interview)\b/i;

const ENTERTAINMENT_SUBJECT_RE =
  /\b(frontman|frontwoman|album|touring|tour dates?|concert|live show|band'?s|singer|musician|new album|morton show|ticket(s)?)\b/i;

const MUSEUM_RE = /\b(museum|gallery|exhibition|expo|current exhibition)\b/i;
const TECH_RE = /\b(tech museum|media tech|software|saas|legal tech)\b/i;

const DATE_NIGHT_CLAIM_RE = /\b(date[- ]?night|premium experience|couples\/weekend)\b/i;
const THRIFT_SUBJECT_RE = /\b(savers|goodwill|thrift|consignment|vintage)\b/i;
const HOTEL_SUBJECT_RE = /\b(hotel|inn|resort|staycation)\b/i;
const HOTEL_PACKAGE_CLAIM_RE = /\b(hotel[_\s-]?package|staycation|room package)\b/i;

/**
 * True when dining/food opening framing is implausible for the subject.
 */
export function isImplausibleDiningClassification(input: CategoryGuardInput): boolean {
  const title = input.title ?? '';
  const claim = `${input.category ?? ''} ${input.reason ?? ''}`;
  if (!DINING_CLAIM_RE.test(claim) && !DINING_CLAIM_RE.test(input.category ?? '')) return false;
  if (LAW_SUBJECT_RE.test(title) || LAW_SUBJECT_RE.test(input.businessName ?? '')) return true;
  if (ENTERTAINMENT_SUBJECT_RE.test(title)) return true;
  if (ARTICLE_NOT_OPENING_RE.test(title) && !/\b(grand )?opening\b|\bopens?\s+(this|on|monday|friday)\b/i.test(title)) {
    return true;
  }
  if (MUSEUM_RE.test(title) || TECH_RE.test(title)) return true;
  // Stored dining category without any food/restaurant subject signal → quarantine.
  if (DINING_CLAIM_RE.test(input.category ?? '') && !FOOD_SUBJECT_RE.test(title) && !FOOD_SUBJECT_RE.test(input.businessName ?? '')) {
    return true;
  }
  return false;
}

/**
 * True when hotel-package framing is implausible (e.g. museum exhibition title).
 */
export function isImplausibleHotelPackageClassification(input: CategoryGuardInput): boolean {
  const title = input.title ?? '';
  const claim = `${input.category ?? ''} ${input.reason ?? ''}`;
  if (!HOTEL_PACKAGE_CLAIM_RE.test(claim) && !HOTEL_PACKAGE_CLAIM_RE.test(input.category ?? '')) return false;
  if (MUSEUM_RE.test(title) && !/\b(package|overnight|stay)\b/i.test(title)) return true;
  if (ENTERTAINMENT_SUBJECT_RE.test(title)) return true;
  return false;
}

/**
 * True when date-night luxury framing is implausible (e.g. thrift chain).
 */
export function isImplausibleDateNightClassification(input: CategoryGuardInput): boolean {
  const claim = `${input.category ?? ''} ${input.reason ?? ''}`;
  if (!DATE_NIGHT_CLAIM_RE.test(claim)) return false;
  if (THRIFT_SUBJECT_RE.test(input.title) || THRIFT_SUBJECT_RE.test(input.businessName ?? '')) return true;
  if (LAW_SUBJECT_RE.test(input.title)) return true;
  return false;
}

export function evaluateHomeCategoryGuard(input: CategoryGuardInput): CategoryGuardResult {
  if (isImplausibleDiningClassification(input)) {
    if (LAW_SUBJECT_RE.test(input.title) || LAW_SUBJECT_RE.test(input.businessName ?? '')) {
      return {
        ok: false,
        reasonCode: 'law_not_dining',
        suggestedLabel: 'Creator services / professional',
      };
    }
    if (ENTERTAINMENT_SUBJECT_RE.test(input.title)) {
      return {
        ok: false,
        reasonCode: 'entertainment_not_dining',
        suggestedLabel: 'Entertainment / interview',
      };
    }
    if (ARTICLE_NOT_OPENING_RE.test(input.title)) {
      return {
        ok: false,
        reasonCode: 'article_not_restaurant_opening',
        suggestedLabel: 'Local story — needs review',
      };
    }
    if (MUSEUM_RE.test(input.title) || TECH_RE.test(input.title)) {
      return {
        ok: false,
        reasonCode: 'museum_not_dining',
        suggestedLabel: 'Attraction / exhibition',
      };
    }
    return { ok: false, reasonCode: 'implausible_dining', suggestedLabel: 'Needs category review' };
  }

  if (isImplausibleHotelPackageClassification(input)) {
    if (MUSEUM_RE.test(input.title)) {
      return {
        ok: false,
        reasonCode: 'exhibition_not_hotel_package',
        suggestedLabel: 'Attraction / exhibition',
      };
    }
    return {
      ok: false,
      reasonCode: 'implausible_hotel_package',
      suggestedLabel: 'Needs category review',
    };
  }

  if (isImplausibleDateNightClassification(input)) {
    if (THRIFT_SUBJECT_RE.test(input.title) || THRIFT_SUBJECT_RE.test(input.businessName ?? '')) {
      return {
        ok: false,
        reasonCode: 'thrift_not_date_night',
        suggestedLabel: 'Shopping / thrift',
      };
    }
    return { ok: false, reasonCode: 'implausible_date_night', suggestedLabel: 'Needs category review' };
  }

  // Hotel can be date-night adjacent — allow.
  if (HOTEL_SUBJECT_RE.test(input.title) || HOTEL_SUBJECT_RE.test(input.businessName ?? '')) {
    return { ok: true, reasonCode: null, suggestedLabel: null };
  }

  return { ok: true, reasonCode: null, suggestedLabel: null };
}

/** Display category for Home cards — never echo a rejected stored category. */
export function normalizeHomeWhatItIs(input: CategoryGuardInput): string {
  const guard = evaluateHomeCategoryGuard(input);
  if (!guard.ok && guard.suggestedLabel) {
    return guard.suggestedLabel.replace(/\s+—.*$/, '').trim();
  }
  const raw = (input.category || 'Local discovery').replace(/_/g, ' ').trim();
  if (DINING_CLAIM_RE.test(raw) && !FOOD_SUBJECT_RE.test(input.title) && !FOOD_SUBJECT_RE.test(input.businessName ?? '')) {
    return 'Local discovery';
  }
  return raw || 'Local discovery';
}

/**
 * Operator-facing reason when category guard fails — never reuse the bad dining/date-night line.
 */
export function safeHomeReason(input: CategoryGuardInput, fallback: string): string {
  const guard = evaluateHomeCategoryGuard(input);
  if (!guard.ok && guard.suggestedLabel) {
    return `${guard.suggestedLabel} — verify before pitching.`;
  }
  const reason = (input.reason ?? '').trim();
  if (!reason) return fallback;
  if (isImplausibleDiningClassification(input) || isImplausibleDateNightClassification(input)) {
    return fallback;
  }
  return reason.slice(0, 180);
}
