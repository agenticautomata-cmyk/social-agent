/**
 * Canonical Calendar event-category keys used for operator attention filters
 * (category snooze). Authority is Benson's structured inventory classification —
 * not a title substring match.
 *
 * Estate sales may be labeled estate sale / estate auction / tag sale in copy,
 * but they only group here when flags, category, ingest, or source type say so.
 * Vintage markets, flea markets, antique shows, and thrift events stay out
 * unless they are actually classified as estate sales.
 */

export const CALENDAR_SNOOZE_CATEGORY_ESTATE_SALE = 'estate_sale' as const;

export const CALENDAR_SNOOZE_CATEGORIES = [CALENDAR_SNOOZE_CATEGORY_ESTATE_SALE] as const;

export type CalendarSnoozeCategory = (typeof CALENDAR_SNOOZE_CATEGORIES)[number];

export const CALENDAR_CATEGORY_LABELS: Record<CalendarSnoozeCategory, string> = {
  estate_sale: 'Estate sales',
};

export const CALENDAR_SNOOZE_DURATIONS = ['7d', '30d', 'indefinite'] as const;

export type CalendarSnoozeDuration = (typeof CALENDAR_SNOOZE_DURATIONS)[number];

const EXPLICIT_NON_ESTATE_CATEGORIES = new Set([
  'vintage_market',
  'antique_market',
  'thrift_store',
  'flea_market',
  'artisan_market',
  'vendor_market',
  'maker_market',
  'seasonal_market',
  'shopping_event',
  'consignment_event',
  'consignment_shop',
  'collector_show',
  'thrift_event',
]);

const ESTATE_SALE_SOURCE_TYPES = new Set(['estate_sales_net', 'estate_sales_org']);

const ESTATE_SALE_INGEST_RE = /estate_sales(?:_net|_org)?(?:_scrape)?/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeCategoryKey(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function boolFlag(meta: Record<string, unknown>, key: string): boolean {
  const v = meta[key];
  return v === true || v === 'true';
}

function alsoCategoriesIncludeEstateSale(meta: Record<string, unknown>): boolean {
  const raw = meta.alsoCategories ?? meta.also_categories;
  if (!Array.isArray(raw)) return false;
  return raw.some((value) => normalizeCategoryKey(value) === CALENDAR_SNOOZE_CATEGORY_ESTATE_SALE);
}

export function isCalendarSnoozeCategory(value: string | null | undefined): value is CalendarSnoozeCategory {
  return value === CALENDAR_SNOOZE_CATEGORY_ESTATE_SALE;
}

export function calendarCategoryLabel(category: CalendarSnoozeCategory): string {
  return CALENDAR_CATEGORY_LABELS[category];
}

export type CalendarCategoryInput = {
  category?: string | null;
  contentCategory?: string | null;
  ingest?: string | null;
  populationSource?: string | null;
  sourceType?: string | null;
  flags?: { estateSale?: boolean };
  metadata?: Record<string, unknown> | null;
};

export function calendarCategoryFromStored(input: CalendarCategoryInput): CalendarSnoozeCategory | null {
  const meta = asRecord(input.metadata);
  const stamped = normalizeCategoryKey(meta.calendarCategory);
  const category =
    normalizeCategoryKey(input.category) ??
    normalizeCategoryKey(meta.opportunityCategory) ??
    normalizeCategoryKey(input.contentCategory) ??
    normalizeCategoryKey(meta.contentCategory);

  const estateSaleFlag =
    input.flags?.estateSale === true || boolFlag(meta, 'estateSaleFlag') || boolFlag(meta, 'estateSale');

  if (estateSaleFlag) return CALENDAR_SNOOZE_CATEGORY_ESTATE_SALE;
  if (category === CALENDAR_SNOOZE_CATEGORY_ESTATE_SALE) return CALENDAR_SNOOZE_CATEGORY_ESTATE_SALE;
  if (alsoCategoriesIncludeEstateSale(meta)) return CALENDAR_SNOOZE_CATEGORY_ESTATE_SALE;
  if (stamped === CALENDAR_SNOOZE_CATEGORY_ESTATE_SALE) return CALENDAR_SNOOZE_CATEGORY_ESTATE_SALE;

  if (category && EXPLICIT_NON_ESTATE_CATEGORIES.has(category)) return null;

  const ingest = [
    input.ingest ?? '',
    input.populationSource ?? '',
    typeof meta.ingest === 'string' ? meta.ingest : '',
  ].join(' ');
  const sourceType = normalizeCategoryKey(input.sourceType) ?? normalizeCategoryKey(meta.sourceType);

  if (sourceType && ESTATE_SALE_SOURCE_TYPES.has(sourceType)) return CALENDAR_SNOOZE_CATEGORY_ESTATE_SALE;
  if (ESTATE_SALE_INGEST_RE.test(ingest)) return CALENDAR_SNOOZE_CATEGORY_ESTATE_SALE;

  return null;
}

export function calendarCategoryFromInventory(item: {
  category?: string | null;
  ingest?: string | null;
  sourceType?: string | null;
  flags?: { estateSale?: boolean };
  metadata?: Record<string, unknown> | null;
}): CalendarSnoozeCategory | null {
  return calendarCategoryFromStored({
    category: item.category,
    ingest: item.ingest,
    sourceType: item.sourceType,
    flags: item.flags,
    metadata: item.metadata,
  });
}
