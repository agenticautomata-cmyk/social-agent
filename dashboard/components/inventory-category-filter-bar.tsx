'use client';

import { useEffect, useMemo, useState } from 'react';
import { clientApiUrl } from '../lib/client-api';
import type { InventoryCategoryFilter } from '../lib/inventory-category-filter';

export type CategoryRow = { category: string; count: number };

type Props = InventoryCategoryFilter & {
  loading?: boolean;
  hint?: string;
  /** When provided, skips the stats fetch (e.g. from inventory list response). */
  categories?: CategoryRow[];
};

export function InventoryCategoryFilterBar({
  excludedCategories,
  toggleCategory,
  showAll,
  hideAll,
  hydrated,
  loading = false,
  hint = 'Uncheck a category to hide it from listings on this page.',
  categories: categoriesProp,
}: Props) {
  const [fetchedCategories, setFetchedCategories] = useState<CategoryRow[]>([]);
  const [statsLoading, setStatsLoading] = useState(categoriesProp == null);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    if (categoriesProp != null) {
      setStatsLoading(false);
      setStatsError(null);
      return;
    }
    if (!hydrated) return;

    let cancelled = false;
    setStatsLoading(true);
    setStatsError(null);

    fetch(clientApiUrl('/api/inventory/stats'), { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        const json = (await res.json()) as {
          stats?: { byCategory?: CategoryRow[] };
        };
        if (cancelled) return;
        setFetchedCategories(json.stats?.byCategory ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setFetchedCategories([]);
        setStatsError(err instanceof Error ? err.message : 'Failed to load categories');
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, categoriesProp]);

  const categories = categoriesProp ?? fetchedCategories;

  const categoryIds = useMemo(() => categories.map((row) => row.category), [categories]);

  const visibleCount = useMemo(
    () => categoryIds.filter((c) => !excludedCategories.includes(c)).length,
    [categoryIds, excludedCategories],
  );

  if (!hydrated) return null;

  return (
    <section className="border-2 border-paper-ink bg-paper-tint px-4 py-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-paper-muted">
          Categories
          {categoryIds.length > 0
            ? ` · ${visibleCount} of ${categoryIds.length} visible`
            : statsLoading
              ? ' · loading…'
              : ''}
          {loading ? ' · updating…' : ''}
        </h2>
        {categoryIds.length > 0 && (
          <div className="flex gap-3 text-2xs">
            <button
              type="button"
              onClick={() => showAll()}
              className="text-paper-muted hover:text-paper-ink underline"
            >
              show all
            </button>
            <button
              type="button"
              onClick={() => hideAll(categoryIds)}
              className="text-paper-muted hover:text-paper-ink underline"
            >
              hide all
            </button>
          </div>
        )}
      </div>
      <p className="text-2xs text-paper-muted">{hint}</p>
      {statsLoading && categoryIds.length === 0 && (
        <p className="text-2xs text-paper-muted italic">// loading category filters…</p>
      )}
      {statsError && categoryIds.length === 0 && (
        <p className="text-2xs text-accent">// could not load categories ({statsError})</p>
      )}
      {categoryIds.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 max-h-40 overflow-y-auto">
          {categories.map(({ category, count }) => {
            const visible = !excludedCategories.includes(category);
            return (
              <label
                key={category}
                className={`inline-flex items-center gap-1.5 text-xs cursor-pointer border px-2 py-1 ${
                  visible ? 'border-paper-edge bg-paper' : 'border-paper-edge bg-paper opacity-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={visible}
                  disabled={loading}
                  onChange={() => toggleCategory(category)}
                  className="accent-paper-ink"
                />
                <span>{category.replace(/_/g, ' ')}</span>
                <span className="text-paper-muted tabular-nums">({count})</span>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}
