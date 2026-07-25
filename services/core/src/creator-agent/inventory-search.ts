import { loadIngestedInventoryItems } from '../inventory/load-ingested.js';
import { filterCreatorFacingRecords } from './filters.js';
import type { InventorySearchFilters, InventorySearchHit } from './types.js';
import { evaluateCategoryRules } from './exclusion-rules.js';

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase();
}

function matchesQuery(item: { title: string; summary?: string | null; locationName?: string | null; category?: string | null }, query: string): boolean {
  const q = normalizeQuery(query);
  if (!q) return true;
  const hay = [item.title, item.summary, item.locationName, item.category].filter(Boolean).join(' ').toLowerCase();
  return q.split(/\s+/).every((token) => hay.includes(token));
}

export async function searchCreatorInventory(
  filters: InventorySearchFilters = {},
): Promise<{ matches: InventorySearchHit[]; totalScanned: number }> {
  const all = await loadIngestedInventoryItems();
  const filtered = await filterCreatorFacingRecords(
    all.map((item) => ({
      id: item.id,
      title: item.title,
      businessName: item.title,
      sourceUrl: item.sourceUrl,
      creatorValueStatus: (item as { creatorValueStatus?: InventorySearchHit['creatorValueStatus'] }).creatorValueStatus ?? null,
      lifecycleStatus: (item as { lifecycleStatus?: InventorySearchHit['lifecycleStatus'] }).lifecycleStatus ?? null,
      summary: item.summary,
      location: item.locationName ?? item.formattedAddress ?? item.neighborhood,
      category: item.category,
      eventDate: item.eventDate,
      sourceName: item.sourceName,
    })),
    {
      includeArchived: filters.includeArchived,
      includeSuppressed: filters.includeSuppressed,
      allowedCreatorStatuses: filters.creatorStatus,
      allowedLifecycleStatuses: filters.lifecycle,
    },
  );

  let matches = filtered.filter((item) => matchesQuery(item, filters.query ?? ''));

  if (filters.category) {
    const cat = normalizeQuery(filters.category);
    matches = matches.filter((item) => normalizeQuery(item.category ?? '').includes(cat));
  }

  if (filters.freeOnly) {
    matches = matches.filter((item) => /\bfree\b/i.test(`${item.title} ${item.summary ?? ''}`));
  }

  const limit = filters.limit ?? 20;
  const hits: InventorySearchHit[] = matches.slice(0, limit).map((item) => {
    const rule = evaluateCategoryRules({ title: item.title, summary: item.summary, contentCategory: item.category });
    return {
      id: item.id,
      title: item.title,
      summary: item.summary ?? null,
      category: item.category ?? null,
      sourceName: item.sourceName ?? null,
      sourceUrl: item.sourceUrl ?? null,
      eventDate: item.eventDate ?? null,
      location: item.location ?? null,
      creatorValueStatus: item.creatorValueStatus ?? 'creator_candidate',
      lifecycleStatus: item.lifecycleStatus ?? 'active',
      reviewUrl: `/review/inventory?item=${item.id}`,
      whyItQualifies: rule ? [rule.reason] : ['creator_facing_inventory_match'],
    };
  });

  return { matches: hits, totalScanned: all.length };
}
