/**
 * Response-level Home placement authority — one canonical entity, one section.
 */

export type HomePlacementSection =
  | 'needs_you'
  | 'best_move'
  | 'money'
  | 'worth_a_look'
  | 'handled'
  | 'analytics';

const SECTION_RANK: Record<HomePlacementSection, number> = {
  needs_you: 1,
  best_move: 2,
  money: 3,
  worth_a_look: 4,
  handled: 5,
  analytics: 6,
};

export function canonicalHomeEntityKey(input: {
  contentItemId?: string | null;
  businessName?: string | null;
  title?: string | null;
  id?: string | null;
}): string | null {
  if (input.contentItemId?.trim()) return `content:${input.contentItemId.trim().toLowerCase()}`;
  const business = (input.businessName ?? '').trim().toLowerCase();
  if (business.length >= 3) return `business:${business.replace(/[^a-z0-9]+/g, '_')}`;
  const title = (input.title ?? '').trim().toLowerCase();
  if (title.length >= 4) return `title:${title.replace(/[^a-z0-9]+/g, '_').slice(0, 80)}`;
  if (input.id?.trim()) return `id:${input.id.trim().toLowerCase()}`;
  return null;
}

/**
 * Keep first (highest-authority) placement for each canonical key.
 * Callers must pass cards in precedence order.
 */
export function claimHomePlacement(
  claimed: Set<string>,
  key: string | null,
): boolean {
  if (!key) return true;
  if (claimed.has(key)) return false;
  claimed.add(key);
  return true;
}

export function filterByPlacementAuthority<T>(
  items: T[],
  claimed: Set<string>,
  keyOf: (item: T) => string | null,
): T[] {
  const out: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (!claimHomePlacement(claimed, key)) continue;
    out.push(item);
  }
  return out;
}

export function sectionPrecedence(section: HomePlacementSection): number {
  return SECTION_RANK[section];
}
