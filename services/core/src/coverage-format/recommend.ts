import type { ContentItem } from '../schema.js';
import type { CoverageFormat } from './constants.js';
import { isPriorCreatorCalendarDay } from '../datetime.js';

export type CoverageRecommendationInput = {
  title: string;
  summary?: string | null;
  category?: string | null;
  eventStartsAt?: Date | null;
  locationName?: string | null;
  sourceUrl?: string | null;
  metadata?: Record<string, unknown>;
  firsthandVisited?: boolean;
};

const ANNOUNCEMENT_RE =
  /\b(announc(?:ed|ement|ing)|press release|opening soon|grand opening|soft opening|closing|closure|ticket(?:s)? on sale|coming soon|under construction|development|promotion|limited[- ]time|date announced|ribbon cutting|now hiring)\b/i;

const EXPERIENCE_RE =
  /\b(review|taste test|try(?:ing)?|atmosphere|vibe|hidden gem|must try|best spot|parking|crowd|line out|walkthrough|inside look|POV|first look)\b/i;

const OPENING_CATEGORIES = new Set([
  'restaurant_opening',
  'coffee_opening',
  'business_opening',
  'boutique_opening',
  'retail_opening',
  'thrift_store',
]);

function textBlob(input: CoverageRecommendationInput): string {
  return [input.title, input.summary, JSON.stringify(input.metadata ?? {})].filter(Boolean).join(' ');
}

function isFutureOpening(input: CoverageRecommendationInput, now = new Date()): boolean {
  // Compare creator-local calendar days (not raw epoch millis) so a same-day opening
  // isn't misread as "already happened" — and so a date-only fixture parsed as UTC
  // midnight doesn't shift a day depending on the reader's local timezone.
  if (input.eventStartsAt && !isPriorCreatorCalendarDay(input.eventStartsAt, now)) return true;
  const blob = textBlob(input);
  return /\b(opening soon|opens (?:on|in)|coming soon|not open yet|opens later)\b/i.test(blob);
}

function isAnnouncementNews(input: CoverageRecommendationInput): boolean {
  const blob = textBlob(input);
  if (ANNOUNCEMENT_RE.test(blob)) return true;
  if (input.category && OPENING_CATEGORIES.has(input.category)) {
    return /\b(opening|announce|closing|promotion|sale)\b/i.test(blob);
  }
  return false;
}

function needsFirsthandExperience(input: CoverageRecommendationInput): boolean {
  if (input.firsthandVisited) return false;
  const blob = textBlob(input);
  if (EXPERIENCE_RE.test(blob)) return true;
  if (/\b(restaurant|coffee|bakery|bar|brewery|tasting|menu|food|dish|dessert)\b/i.test(blob)) {
    return !ANNOUNCEMENT_RE.test(blob);
  }
  return false;
}

/** Non-destructive suggested coverage format from opportunity facts. */
export function recommendCoverageFormat(
  input: CoverageRecommendationInput,
  now = new Date(),
): CoverageFormat | null {
  if (input.firsthandVisited) return 'field_visit';

  const blob = textBlob(input);
  if (/\b(roundup|weekly|digest|list of|top \d+)\b/i.test(blob)) return 'roundup';
  if (/\b(track only|monitor|watchlist|keep an eye)\b/i.test(blob)) return 'track_only';

  if (needsFirsthandExperience(input)) return 'field_visit';

  if (isAnnouncementNews(input)) {
    if (isFutureOpening(input, now)) return 'green_screen_then_visit';
    return 'green_screen';
  }

  if (input.category && OPENING_CATEGORIES.has(input.category)) {
    return isFutureOpening(input, now) ? 'green_screen_then_visit' : 'green_screen';
  }

  return null;
}

export function recommendCoverageFormatFromItem(
  item: Pick<
    ContentItem,
    'topic' | 'hook' | 'script' | 'eventStartsAt' | 'locationName' | 'sourceUrl' | 'metadata' | 'firsthandVisited'
  >,
  category?: string | null,
): CoverageFormat | null {
  const metadata = (item.metadata ?? {}) as Record<string, unknown>;
  return recommendCoverageFormat({
    title: item.topic,
    summary: item.script ?? item.hook,
    category: category ?? (metadata.opportunityCategory as string | undefined) ?? null,
    eventStartsAt: item.eventStartsAt,
    locationName: item.locationName,
    sourceUrl: item.sourceUrl,
    metadata,
    firsthandVisited: item.firsthandVisited,
  });
}
