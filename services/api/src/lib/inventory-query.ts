import {
  filterInventoryItems,
  loadIngestedInventoryItems,
} from '@social-agent/core/inventory';

export function parseExcludeCategoriesQuery(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function loadFilteredIngestedInventory(excludeCategories: string[] = []) {
  const items = await loadIngestedInventoryItems();
  if (excludeCategories.length === 0) return items;
  return filterInventoryItems(items, { excludeCategories });
}
