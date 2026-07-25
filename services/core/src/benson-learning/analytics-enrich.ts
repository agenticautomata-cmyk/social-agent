import type { VideoWithMetrics } from '../creator-analytics/types.js';
import type { PerformanceSignal } from './types.js';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function buildPerformanceSignals(videos: VideoWithMetrics[], now = new Date()): PerformanceSignal[] {
  const recent = videos.filter((video) => {
    const ageDays = (now.getTime() - new Date(video.publishedAt).getTime()) / (24 * 60 * 60 * 1000);
    return ageDays <= 45;
  });

  if (recent.length === 0) return [];

  const baselineViews = median(recent.map((v) => v.views));
  const byCategory = new Map<string, VideoWithMetrics[]>();
  for (const video of recent) {
    const cat = video.contentCategory ?? 'uncategorized';
    const bucket = byCategory.get(cat) ?? [];
    bucket.push(video);
    byCategory.set(cat, bucket);
  }

  const signals: PerformanceSignal[] = [];

  for (const video of [...recent].sort((a, b) => b.views - a.views).slice(0, 4)) {
    const vsBaseline: PerformanceSignal['vsBaseline'] =
      video.views >= baselineViews * 1.15 ? 'above' : video.views <= baselineViews * 0.85 ? 'below' : 'at';
    signals.push({
      title: (video.title ?? video.caption ?? 'Untitled').slice(0, 120),
      category: video.contentCategory,
      publishedAt: video.publishedAt,
      views: video.views,
      performanceIndex: video.performanceIndex ?? 1,
      engagementRate: video.engagementRate ?? 0,
      sampleSize: 1,
      vsBaseline,
      conclusion:
        vsBaseline === 'above'
          ? 'Single-post signal: outperformed recent median views.'
          : vsBaseline === 'below'
            ? 'Single-post signal: underperformed recent median views.'
            : 'Single-post signal: near recent median views.',
      confidence: 'low',
    });
  }

  for (const [category, rows] of byCategory) {
    if (rows.length < 2) continue;
    const catViews = rows.map((r) => r.views);
    const catMedian = median(catViews);
    const vsBaseline: PerformanceSignal['vsBaseline'] =
      catMedian >= baselineViews * 1.1 ? 'above' : catMedian <= baselineViews * 0.9 ? 'below' : 'at';
    signals.push({
      title: `${category.replace(/_/g, ' ')} (${rows.length} recent posts)`,
      category,
      publishedAt: rows[0]!.publishedAt,
      views: Math.round(catMedian),
      performanceIndex: baselineViews > 0 ? Math.round((catMedian / baselineViews) * 100) / 100 : 1,
      engagementRate:
        rows.reduce((sum, row) => sum + (row.engagementRate ?? 0), 0) / Math.max(rows.length, 1),
      sampleSize: rows.length,
      vsBaseline,
      conclusion:
        vsBaseline === 'above'
          ? `${rows.length} recent posts in this category beat Kellie's overall recent median.`
          : vsBaseline === 'below'
            ? `${rows.length} recent posts in this category trail Kellie's overall recent median.`
            : `${rows.length} recent posts in this category track Kellie's recent median.`,
      confidence: rows.length >= 3 ? 'medium' : 'low',
    });
  }

  return signals.slice(0, 8);
}
