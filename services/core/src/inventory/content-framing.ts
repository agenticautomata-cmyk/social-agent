import type { InventoryFlags } from './normalize.js';

/** How Benson should talk about this item — not everything is date night. */
export type ContentFraming =
  | 'shopping_retail'
  | 'date_night_luxury'
  | 'dining_opening'
  | 'community_event'
  | 'general';

const SHOPPING_RETAIL_CATEGORIES = new Set([
  'boutique_opening',
  'retail_opening',
  'pop_up_shop',
  'thrift_store',
  'consignment_shop',
  'deal',
  'liquidation_sale',
  'luxury_deal',
  'luxury_resale',
  'warehouse_sale',
  'sidewalk_sale',
  'shopping_event',
  'artisan_market',
  'vendor_market',
  'vintage_market',
  'antique_market',
  'maker_market',
  'seasonal_market',
  'collector_show',
  'consignment_event',
  'estate_sale',
]);

const DINING_OPENING_CATEGORIES = new Set([
  'dining',
  'restaurant_opening',
  'coffee_opening',
  'luxury_dining',
  'restaurant_week',
]);

const RETAIL_CHAIN_RE =
  /\b(nordstrom|rack|target|walmart|costco|tj\s*maxx|marshalls|ross|kohls|old navy|gap|h\s*&\s*m|best buy|dick'?s|homegoods|ulta|sephora|macy'?s|jcpenney|savers|goodwill|plato'?s closet)\b/i;

export function isShoppingRetailContent(
  flags: InventoryFlags,
  category: string | null,
  title = '',
): boolean {
  if (flags.shopping || flags.retail || flags.estateSale || flags.vendorMarket || flags.collector) {
    return true;
  }
  if (category && SHOPPING_RETAIL_CATEGORIES.has(category)) return true;
  if (RETAIL_CHAIN_RE.test(title)) return true;
  return false;
}

const IMPLAUSIBLE_DINING_SUBJECT_RE =
  /\b(law\b|legal services?|attorney|lawyer|destigmatiz|difficult conversations|earthly departures|museum|gallery|exhibition|frontman|frontwoman|album|touring|concert|live show|band'?s)\b/i;

export function inferContentFraming(
  flags: InventoryFlags,
  category: string | null,
  title = '',
): ContentFraming {
  if (isShoppingRetailContent(flags, category, title)) return 'shopping_retail';
  // Thrift/retail chains must not inherit date-night framing from luxury flags alone.
  if ((flags.dateNight || flags.luxury) && !isShoppingRetailContent(flags, category, title)) {
    return 'date_night_luxury';
  }
  const diningClaim =
    flags.dining ||
    (flags.businessOpening && category != null && DINING_OPENING_CATEGORIES.has(category));
  if (diningClaim && !IMPLAUSIBLE_DINING_SUBJECT_RE.test(title)) {
    return 'dining_opening';
  }
  if (flags.freeEvent || flags.celebrityCharity || flags.sports) return 'community_event';
  return 'general';
}

export function framingLabel(framing: ContentFraming): string {
  switch (framing) {
    case 'shopping_retail':
      return 'shopping_retail';
    case 'date_night_luxury':
      return 'date_night_luxury';
    case 'dining_opening':
      return 'dining_opening';
    case 'community_event':
      return 'community_event';
    default:
      return 'general';
  }
}

export function whyItMattersForFraming(framing: ContentFraming): string | null {
  switch (framing) {
    case 'shopping_retail':
      return 'Shopping/retail discovery — deal haul, store opening, or gift-card sponsorship angle.';
    case 'date_night_luxury':
      return 'Date-night or premium experience — couples/weekend plan content.';
    case 'dining_opening':
      return 'Dining or food opening — timely restaurant/cafe content.';
    case 'community_event':
      return 'Community event — high engagement, verify timing before posting.';
    default:
      return null;
  }
}

export function inferContentFramingFromFields(fields: {
  title: string;
  category?: string | null;
  shopping?: boolean;
  retail?: boolean;
  estateSale?: boolean;
  dateNight?: boolean;
  luxury?: boolean;
  dining?: boolean;
  businessOpening?: boolean;
}): ContentFraming {
  const flags: InventoryFlags = {
    sponsorFriendly: false,
    luxury: fields.luxury === true,
    dining: fields.dining === true,
    dateNight: fields.dateNight === true,
    estateSale: fields.estateSale === true,
    businessOpening: fields.businessOpening === true,
    freeEvent: false,
    celebrityCharity: false,
    sports: false,
    reddit: false,
    worldCup: false,
    shopping: fields.shopping === true,
    retail: fields.retail === true,
    vendorMarket: false,
    collector: false,
  };
  return inferContentFraming(flags, fields.category ?? null, fields.title);
}
