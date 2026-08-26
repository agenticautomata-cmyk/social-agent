/**
 * Per-event category authority for listing-derived events.
 * Title/description win; venue or sibling listing labels must not override
 * clear event semantics (e.g. a DJ night is not Cooking because the venue serves food).
 */

export const LISTING_EVENT_CATEGORIES = {
  nightlifeMusic: 'Nightlife / Music',
  liveMusic: 'Music / Live Music',
  dateNight: 'Date Night',
  foodDrink: 'Food & Drink',
  cooking: 'Cooking',
  festival: 'Festival',
  event: 'Event',
} as const;

export type ListingEventCategory =
  (typeof LISTING_EVENT_CATEGORIES)[keyof typeof LISTING_EVENT_CATEGORIES];

const COOKING_EVENT_RE =
  /\b(cooking class(?:es)?|cooking lesson|chef demo(?:nstration)?|recipe workshop|cookbook club|baking class(?:es)?|culinary class(?:es)?|culinary workshop)\b/i;

const LIVE_MUSIC_RE = /\b(live music|live band|concert|open mic)\b/i;

const NIGHTLIFE_RE =
  /\b(\bdjs?\b|hosted by\s+dj|nightlife|nightclub|dance party|day party|club night|late[- ]night)\b/i;

const FESTIVAL_RE = /\b(fest|festival)\b/i;

const DATE_NIGHT_RE = /\b(date night|first dates?)\b/i;

const FOOD_DRINK_EVENT_RE =
  /\b(food tasting|wine tasting|beer tasting|tasting menu|menu tasting|dinner|brunch|happy hour)\b/i;

const COOKING_VENUE_RE = /\b(cooking school|culinary school|cooking studio)\b/i;

const COOKING_SOURCE_RE = /\b(cooking|cookbook|culinary class)\b/i;
const NIGHTLIFE_SOURCE_RE = /\b(nightlife|club|dj|dance)\b/i;
const MUSIC_SOURCE_RE = /\b(live music|music|concert)\b/i;
const FESTIVAL_SOURCE_RE = /\b(festival|fest)\b/i;
const DATE_SOURCE_RE = /\b(date night|couples)\b/i;
const FOOD_SOURCE_RE = /\b(food|drink|dining|tasting|dinner|brunch)\b/i;

export type ListingEventCategoryInput = {
  title: string;
  description?: string | null;
  sourceCategory?: string | null;
  tags?: string[] | null;
  venueName?: string | null;
  /** Listing/venue-level category — weak fallback only; never overrides event evidence. */
  listingCategory?: string | null;
};

export type ListingEventCategoryResult = {
  category: ListingEventCategory;
  confidence: 'high' | 'low';
  source: 'title' | 'description' | 'source' | 'metadata' | 'venue_fallback' | 'default';
};

function classifyEventText(text: string): ListingEventCategory | null {
  const t = text.trim();
  if (!t) return null;
  if (COOKING_EVENT_RE.test(t)) return LISTING_EVENT_CATEGORIES.cooking;
  if (LIVE_MUSIC_RE.test(t)) return LISTING_EVENT_CATEGORIES.liveMusic;
  if (NIGHTLIFE_RE.test(t)) return LISTING_EVENT_CATEGORIES.nightlifeMusic;
  if (FESTIVAL_RE.test(t)) return LISTING_EVENT_CATEGORIES.festival;
  if (DATE_NIGHT_RE.test(t)) return LISTING_EVENT_CATEGORIES.dateNight;
  if (FOOD_DRINK_EVENT_RE.test(t)) return LISTING_EVENT_CATEGORIES.foodDrink;
  return null;
}

function isTrustedExplicitCategory(
  mapped: ListingEventCategory,
  input: ListingEventCategoryInput,
): boolean {
  if (mapped === LISTING_EVENT_CATEGORIES.event) return false;
  const ownText = `${input.title} ${input.description ?? ''}`;
  if (mapped === LISTING_EVENT_CATEGORIES.cooking) return COOKING_EVENT_RE.test(ownText);
  if (mapped === LISTING_EVENT_CATEGORIES.foodDrink) return FOOD_DRINK_EVENT_RE.test(ownText);
  return true;
}

function mapExplicitCategory(raw: string | null | undefined): ListingEventCategory | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  if (COOKING_EVENT_RE.test(t) || COOKING_SOURCE_RE.test(t)) return LISTING_EVENT_CATEGORIES.cooking;
  if (LIVE_MUSIC_RE.test(t) || (MUSIC_SOURCE_RE.test(t) && !NIGHTLIFE_SOURCE_RE.test(t))) {
    return LISTING_EVENT_CATEGORIES.liveMusic;
  }
  if (NIGHTLIFE_SOURCE_RE.test(t)) return LISTING_EVENT_CATEGORIES.nightlifeMusic;
  if (FESTIVAL_SOURCE_RE.test(t)) return LISTING_EVENT_CATEGORIES.festival;
  if (DATE_SOURCE_RE.test(t)) return LISTING_EVENT_CATEGORIES.dateNight;
  if (FOOD_SOURCE_RE.test(t)) return LISTING_EVENT_CATEGORIES.foodDrink;
  if (/^events?$/i.test(t) || /^local_event$/i.test(t)) return LISTING_EVENT_CATEGORIES.event;
  return null;
}

/**
 * Classify one listing-derived event from its own evidence.
 * Sibling events and generic venue food/drink labels must not bleed.
 */
export function resolveListingEventCategory(
  input: ListingEventCategoryInput,
): ListingEventCategoryResult {
  const fromTitle = classifyEventText(input.title);
  if (fromTitle) {
    return { category: fromTitle, confidence: 'high', source: 'title' };
  }

  const fromDescription = classifyEventText(input.description ?? '');
  if (fromDescription) {
    return { category: fromDescription, confidence: 'high', source: 'description' };
  }

  const fromSource = mapExplicitCategory(input.sourceCategory);
  if (fromSource && isTrustedExplicitCategory(fromSource, input)) {
    return { category: fromSource, confidence: 'high', source: 'source' };
  }

  const tagText = (input.tags ?? []).join(' ');
  const fromTags = classifyEventText(tagText) ?? mapExplicitCategory(tagText);
  if (fromTags && isTrustedExplicitCategory(fromTags, input)) {
    return { category: fromTags, confidence: 'high', source: 'metadata' };
  }

  if (COOKING_VENUE_RE.test(input.venueName ?? '')) {
    return {
      category: LISTING_EVENT_CATEGORIES.cooking,
      confidence: 'low',
      source: 'venue_fallback',
    };
  }

  const listingMapped = mapExplicitCategory(input.listingCategory);
  if (
    listingMapped &&
    listingMapped !== LISTING_EVENT_CATEGORIES.event &&
    listingMapped !== LISTING_EVENT_CATEGORIES.cooking &&
    listingMapped !== LISTING_EVENT_CATEGORIES.foodDrink
  ) {
    return { category: listingMapped, confidence: 'low', source: 'venue_fallback' };
  }

  return {
    category: LISTING_EVENT_CATEGORIES.event,
    confidence: 'low',
    source: 'default',
  };
}
