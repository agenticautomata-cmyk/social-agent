import { loadVideosWithLatestMetrics } from '../creator-analytics/dashboard.js';
import type { BensonAnalyticsSimilar } from './types.js';

export type CategoryAnalyticsRow = {
  category: string;
  avgViews: number;
  avgEngagementRate: number;
  avgCompletionRate: number | null;
  sampleSize: number;
  performanceIndex: number;
};

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

function normalizeCategoryKey(category: string | null): string | null {
  if (!category) return null;
  return category.trim().toLowerCase().replace(/\s+/g, '_');
}

function categoriesMatch(a: string | null, b: string): boolean {
  const na = normalizeCategoryKey(a);
  const nb = normalizeCategoryKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const aWords = na.split('_');
  const bWords = nb.split('_');
  return aWords.some((w) => w.length > 3 && bWords.includes(w));
}

export async function loadCategoryAnalyticsIndex(): Promise<Map<string, CategoryAnalyticsRow>> {
  const { videos } = await loadVideosWithLatestMetrics('tiktok');
  const medianViews = median(videos.map((v) => v.views));
  const groups = new Map<string, typeof videos>();

  for (const v of videos) {
    const key = normalizeCategoryKey(v.contentCategory);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(v);
    groups.set(key, list);
  }

  const index = new Map<string, CategoryAnalyticsRow>();
  for (const [category, items] of groups) {
    const views = items.map((i) => i.views);
    const avgViews = Math.round(avg(views));
    const avgEngagementRate = Math.round(avg(items.map((i) => i.engagementRate)) * 10000) / 10000;
    const completionSamples = items
      .map((i) => i.completionRate)
      .filter((c): c is number => c != null);
    const avgCompletionRate =
      completionSamples.length > 0
        ? Math.round(avg(completionSamples) * 10000) / 10000
        : null;
    const performanceIndex =
      medianViews > 0 ? Math.round((avgViews / medianViews) * 100) / 100 : 1;

    index.set(category, {
      category,
      avgViews,
      avgEngagementRate,
      avgCompletionRate,
      sampleSize: items.length,
      performanceIndex,
    });
  }

  return index;
}

export function lookupSimilarAnalytics(
  category: string | null,
  index: Map<string, CategoryAnalyticsRow>,
): BensonAnalyticsSimilar | null {
  if (!category) return null;

  let row: CategoryAnalyticsRow | undefined;
  const normalized = normalizeCategoryKey(category);
  if (normalized) row = index.get(normalized);

  if (!row) {
    for (const [key, value] of index) {
      if (categoriesMatch(category, key)) {
        row = value;
        break;
      }
    }
  }

  if (!row || row.sampleSize === 0) return null;

  return {
    category: row.category,
    avgViews: row.avgViews,
    avgEngagementRate: row.avgEngagementRate,
    avgCompletionRate: row.avgCompletionRate,
    sampleSize: row.sampleSize,
  };
}

export function analyticsBoostFromIndex(
  category: string | null,
  index: Map<string, CategoryAnalyticsRow>,
): number {
  const similar = lookupSimilarAnalytics(category, index);
  if (!similar || similar.sampleSize < 2) return 0;
  const row = [...index.values()].find(
    (r) => r.category === similar.category || categoriesMatch(category, r.category),
  );
  return row?.performanceIndex ?? 0;
}
