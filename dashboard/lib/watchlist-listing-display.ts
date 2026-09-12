/**
 * Decide whether watchlist detail should collapse scout items into theater-style
 * production-group cards vs rich per-event cards.
 *
 * Wix ticket+RSVP companion nights set productionGroupKey for provenance but use
 * listingDisplayMode `wix_companion_nights` and must show restrictions + dual actions.
 * Melting Pot / theater season keeps production_groups cards.
 */
export function shouldUseProductionGroupCards(input: {
  hasProductionGroups: boolean;
  listingDisplayMode?: string | null;
  extractionMethod?: string | null;
}): boolean {
  if (!input.hasProductionGroups) return false;
  if (input.listingDisplayMode === 'wix_companion_nights') return false;
  return (
    input.listingDisplayMode === 'production_groups' ||
    input.extractionMethod === 'theater_season'
  );
}
