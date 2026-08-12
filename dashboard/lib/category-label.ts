// Client-safe category/status label humanizer. Prospect-facing screens must
// never show a raw enum or DB category string (e.g. "BOUTIQUE_OPENING",
// "boutique_opening", "PUBLIC_MEETING") — only a readable, sentence-case label,
// and only when it adds meaning beyond what's already visible on the card.

const HIDDEN_CATEGORY_VALUES = new Set([
  '',
  'general',
  'other',
  'misc',
  'miscellaneous',
  'unknown',
  'uncategorized',
  'industry_insight',
  'n/a',
  'none',
]);

// A few raw values read better with a clarifying word than a bare literal
// translation would produce.
const CATEGORY_LABEL_OVERRIDES: Record<string, string> = {
  free: 'Free event',
  local_experience: 'Local experience',
  boutique_opening: 'Boutique opening',
  muted_source: '', // never meaningful to a prospect — always hidden
  creator_partnership: 'Creator partnership',
  obituary: '', // never shown — quarantined content, not a display category
};

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * Converts a raw category/status string into a prospect-safe, sentence-case
 * label, or `null` when the value is empty/meaningless and should simply be
 * omitted from the UI rather than rendered as clutter.
 */
export function humanizeCategoryLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = normalizeKey(raw);
  if (HIDDEN_CATEGORY_VALUES.has(key)) return null;
  if (key in CATEGORY_LABEL_OVERRIDES) {
    const override = CATEGORY_LABEL_OVERRIDES[key];
    return override.length > 0 ? override : null;
  }
  const spaced = raw.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!spaced) return null;
  const lower = spaced.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
