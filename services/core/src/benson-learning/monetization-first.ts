import type { VideoWithMetrics } from '../creator-analytics/types.js';
import { getCreatorTimezone } from '../datetime.js';
import { weekdayBucket } from '../creator-analytics/parse.js';
import type { BensonInsight, PerformanceSignal } from './types.js';

export const STOP_POSTING_DAY_RE =
  /\b(stop posting|never post|do not post|don't post|dont post|skip posting|avoid posting|no posting|not working|clearly not working|give up on|eliminate)\b[^.]{0,40}\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays)\b/i;

export const WEAK_DAY_ONLY_RE =
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b[^.]{0,80}\b(underperform|lower engagement|weak|worst|trail|below (?:the )?median|not working)\b/i;

export const POSITIVE_MONETIZATION_RE =
  /\b(sponsor(?:ed|ship)?|deliverable|affiliate|conversion|paid campaign|free[- ]deal|business lead|evergreen|searchable|inventory slot|obligation|commission)\b/i;

export const SMALL_SAMPLE_CAUTION = 'Sample is limited — treat as directional, not a rule.';

const MONDAY_STRATEGY_INSIGHT =
  'Monday posts currently trail Kellie\'s typical engagement on average. That does not mean silence: keep Monday available for sponsored deliverables, free-deal alerts, evergreen search content, event reminders, repurposed clips, and low-cost experiments. Save the strongest original concepts for higher-performing windows.';

const MONDAY_STRATEGY_ACTION =
  'Use Monday for sponsor deliverables, affiliate/free-deal posts, reminders, repurposed clips, or experiments — not for dropping a posting day entirely.';

const MONDAY_FORMATS = [
  'sponsor deliverables',
  'affiliate/free-deal posts',
  'event reminders',
  'weekend recaps',
  'low-production green-screen posts',
  'searchable evergreen content',
  'repurposed clips',
  'experiments',
];

const CONTENT_TYPE_BUCKETS: Record<string, string[]> = {
  sponsored: ['sponsored', 'sponsor', 'brand_deal', 'brand'],
  local_event: ['event', 'local_event', 'community_event'],
  restaurant: ['restaurant', 'dining', 'food', 'eatery'],
  free_deal: ['freebie', 'free_deal', 'deal'],
  affiliate: ['affiliate'],
  evergreen: ['evergreen', 'search', 'guide'],
  weekend_roundup: ['weekend', 'roundup'],
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function normalizeCategory(category: string | null | undefined): string {
  return (category ?? 'uncategorized').toLowerCase().replace(/\s+/g, '_');
}

function contentTypeBucket(category: string | null, sponsorTag: string | null): string {
  if (sponsorTag?.trim()) return 'sponsored';
  const cat = normalizeCategory(category);
  for (const [bucket, aliases] of Object.entries(CONTENT_TYPE_BUCKETS)) {
    if (aliases.some((alias) => cat.includes(alias))) return bucket;
  }
  return cat;
}

export type CreatorBusinessScoreInput = {
  avgViews: number;
  medianViews: number;
  totalViews: number;
  sampleSize: number;
  engagementRate: number;
  sponsoredShare: number;
  performanceIndex: number;
};

/** Balanced score — engagement rate is intentionally low weight. */
export function computeCreatorBusinessScore(input: CreatorBusinessScoreInput): number {
  const avgContribution = input.medianViews > 0 ? input.avgViews / input.medianViews : 1;
  const totalContribution = input.medianViews > 0 ? input.totalViews / (input.medianViews * Math.max(input.sampleSize, 1)) : 1;
  const revenueBoost = input.sponsoredShare >= 0.25 ? 0.35 : input.sponsoredShare > 0 ? 0.15 : 0;
  const engagementComponent = Math.min(0.12, input.engagementRate * 0.8);
  const marginalValue = totalContribution >= 0.85 || revenueBoost > 0 ? 0.2 : 0;
  return (
    avgContribution * 0.18 +
    totalContribution * 0.22 +
    input.performanceIndex * 0.15 +
    revenueBoost +
    marginalValue +
    engagementComponent
  );
}

export function isBlanketStopPostingRecommendation(text: string): boolean {
  return STOP_POSTING_DAY_RE.test(text);
}

export function mentionsPositiveMonetization(text: string): boolean {
  return POSITIVE_MONETIZATION_RE.test(text);
}

export function extractWeekdayFromText(text: string): string | null {
  const match = text.match(
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  );
  return match?.[1] ? match[1][0]!.toUpperCase() + match[1].slice(1).toLowerCase() : null;
}

export function weekdayStrategyInsight(weekday: string, evidence: {
  sampleSize: number;
  avgViews: number;
  medianViews: number;
  engagementRate: number;
  contentTypeMix: string[];
  confidence: 'high' | 'medium' | 'low';
}): string {
  const caution = evidence.sampleSize < 4 ? ` ${SMALL_SAMPLE_CAUTION}` : '';
  const mix =
    evidence.contentTypeMix.length > 0
      ? ` Content mix on ${weekday}: ${evidence.contentTypeMix.slice(0, 4).join(', ')}.`
      : '';
  return (
    `${weekday.toUpperCase()} STRATEGY — ${weekday} posts average ${Math.round(evidence.avgViews).toLocaleString()} views vs Kellie's recent median ${Math.round(evidence.medianViews).toLocaleString()} (n=${evidence.sampleSize}, engagement ${(evidence.engagementRate * 100).toFixed(1)}%, confidence ${evidence.confidence}).` +
    ` Keep the day available for sponsored deliverables, free-deal alerts, evergreen search content, reminders, repurposed clips, and low-cost experiments.` +
    ` Save premium original concepts for higher-performing windows.${mix}${caution}`
  );
}

export function weekdayStrategyAction(weekday: string): string {
  const formats =
    weekday.toLowerCase() === 'monday'
      ? MONDAY_FORMATS.join('; ')
      : `${weekday} formats: sponsor deliverables; affiliate/free-deal posts; reminders; repurposed clips; experiments.`;
  return `Repurpose ${weekday} for lower-effort monetization-friendly formats (${formats}). Do not remove the posting slot — protect stronger concepts for better windows.`;
}

export function rewriteToWeekdayStrategy(lesson: BensonInsight, weekday?: string | null): BensonInsight {
  const day = weekday ?? extractWeekdayFromText(`${lesson.insight} ${lesson.action}`) ?? 'Monday';
  const sampleMatch = lesson.insight.match(/\bn\s*=\s*(\d+)\b/i);
  const sampleSize = sampleMatch ? Number.parseInt(sampleMatch[1]!, 10) : 2;
  const confidence: BensonInsight['confidence'] =
    sampleSize >= 6 ? 'medium' : 'low';

  if (day.toLowerCase() === 'monday') {
    return {
      ...lesson,
      id: lesson.id.includes('monday') ? lesson.id : 'monday-strategy',
      category: 'timing',
      lessonType: sampleSize >= 6 ? 'recent_performance_signal' : 'test_needed',
      durability: sampleSize >= 6 ? 'temporary' : 'test',
      confidence,
      insight: MONDAY_STRATEGY_INSIGHT,
      action: MONDAY_STRATEGY_ACTION,
      evidenceSource: lesson.evidenceSource || 'tiktok analytics (weekday + content-type segmentation)',
      evidenceDateRange: lesson.evidenceDateRange,
    };
  }

  return {
    ...lesson,
    category: 'timing',
    lessonType: sampleSize >= 6 ? 'recent_performance_signal' : 'test_needed',
    durability: sampleSize >= 6 ? 'temporary' : 'test',
    confidence,
    insight: weekdayStrategyInsight(day, {
      sampleSize,
      avgViews: 0,
      medianViews: 0,
      engagementRate: 0,
      contentTypeMix: [],
      confidence,
    }),
    action: weekdayStrategyAction(day),
    evidenceSource: lesson.evidenceSource || 'tiktok analytics (weekday segmentation)',
    evidenceDateRange: lesson.evidenceDateRange,
  };
}

export function shouldBlockStopPostingRecommendation(input: {
  text: string;
  hasSponsorObligation?: boolean;
  hasPositiveRevenueSignal?: boolean;
  sampleSize?: number;
}): boolean {
  if (!isBlanketStopPostingRecommendation(input.text)) return false;
  if (input.hasSponsorObligation || input.hasPositiveRevenueSignal) return true;
  if (mentionsPositiveMonetization(input.text)) return true;
  if ((input.sampleSize ?? 0) < 6) return true;
  return false;
}

export function applyMonetizationFirstCorrections(
  insights: BensonInsight[],
  options?: { performanceSignals?: PerformanceSignal[] },
): BensonInsight[] {
  const signals = options?.performanceSignals ?? [];
  const weekdaySignals = signals.filter((s) => s.weekday);
  const sponsorSignal = signals.some(
    (s) => s.monetizationValue === 'positive' || /sponsor/i.test(s.conclusion),
  );

  return insights.map((lesson) => {
    const blob = `${lesson.insight} ${lesson.action}`;
    const weekdaySignal = weekdaySignals.find((s) =>
      blob.toLowerCase().includes((s.weekday ?? '').toLowerCase()),
    );
    const sampleSize = weekdaySignal?.sampleSize ?? 2;

    if (
      shouldBlockStopPostingRecommendation({
        text: blob,
        hasSponsorObligation: sponsorSignal || mentionsPositiveMonetization(blob),
        hasPositiveRevenueSignal: mentionsPositiveMonetization(blob),
        sampleSize,
      }) ||
      isBlanketStopPostingRecommendation(blob) ||
      (WEAK_DAY_ONLY_RE.test(blob) && lesson.category === 'timing' && !mentionsPositiveMonetization(blob))
    ) {
      return rewriteToWeekdayStrategy(lesson, weekdaySignal?.weekday ?? extractWeekdayFromText(blob));
    }

    if (WEAK_DAY_ONLY_RE.test(blob) && lesson.confidence !== 'high') {
      const day = extractWeekdayFromText(blob);
      if (day) return rewriteToWeekdayStrategy(lesson, day);
    }

    return lesson;
  });
}

export function correctStopDoingForMonetization(stopDoing: string): string {
  const trimmed = stopDoing.trim();
  if (!trimmed) return trimmed;
  if (
    shouldBlockStopPostingRecommendation({ text: trimmed }) ||
    isBlanketStopPostingRecommendation(trimmed)
  ) {
    return (
      'MONDAY STRATEGY — Monday averages trail Kellie\'s typical engagement, but the day still creates value through sponsor deliverables, affiliate/free-deal posts, evergreen search content, reminders, repurposed clips, and experiments. ' +
      'Do not go silent to protect averages; reserve premium original concepts for stronger windows.'
    );
  }
  return trimmed.replace(/\bclearly not working\b/gi, 'underperform on average engagement');
}

export function buildWeekdaySegmentPerformanceSignals(
  videos: VideoWithMetrics[],
  now = new Date(),
): PerformanceSignal[] {
  const timezone = getCreatorTimezone();
  const recent = videos.filter((video) => {
    const ageDays = (now.getTime() - new Date(video.publishedAt).getTime()) / (24 * 60 * 60 * 1000);
    return ageDays <= 45;
  });
  if (recent.length === 0) return [];

  const baselineViews = median(recent.map((v) => v.views));
  const byWeekday = new Map<string, VideoWithMetrics[]>();
  for (const video of recent) {
    const day = weekdayBucket(new Date(video.publishedAt), timezone);
    const bucket = byWeekday.get(day) ?? [];
    bucket.push(video);
    byWeekday.set(day, bucket);
  }

  const signals: PerformanceSignal[] = [];
  for (const [weekday, rows] of byWeekday) {
    if (rows.length === 0) continue;
    const views = rows.map((r) => r.views);
    const avgViews = views.reduce((a, b) => a + b, 0) / views.length;
    const med = median(views);
    const engagementRate =
      rows.reduce((sum, row) => sum + (row.engagementRate ?? 0), 0) / Math.max(rows.length, 1);
    const sponsoredCount = rows.filter((r) => r.sponsorTag?.trim()).length;
    const sponsoredShare = sponsoredCount / rows.length;
    const performanceIndex = baselineViews > 0 ? Math.round((avgViews / baselineViews) * 100) / 100 : 1;
    const contentTypeMix = [
      ...new Set(rows.map((r) => contentTypeBucket(r.contentCategory, r.sponsorTag))),
    ];
    const businessScore = computeCreatorBusinessScore({
      avgViews,
      medianViews: baselineViews,
      totalViews: views.reduce((a, b) => a + b, 0),
      sampleSize: rows.length,
      engagementRate,
      sponsoredShare,
      performanceIndex,
    });
    const vsBaseline: PerformanceSignal['vsBaseline'] =
      performanceIndex >= 1.05 ? 'above' : performanceIndex <= 0.9 ? 'below' : 'at';
    const monetizationValue: PerformanceSignal['monetizationValue'] =
      sponsoredShare > 0 || businessScore >= 1.05
        ? 'positive'
        : vsBaseline === 'below' && businessScore < 0.95
          ? 'mixed'
          : 'neutral';

    const segmentNote =
      vsBaseline === 'below'
        ? `${weekday}: average views ${Math.round(avgViews)} vs median ${Math.round(baselineViews)} (n=${rows.length}). Prefer lower-effort monetization-friendly formats — do not recommend eliminating the day.`
        : `${weekday}: tracks near Kellie's recent contribution (n=${rows.length}).`;

    signals.push({
      title: `${weekday} posting window (${rows.length} posts)`,
      category: contentTypeMix[0] ?? null,
      weekday,
      contentTypeMix,
      publishedAt: rows[0]!.publishedAt,
      views: Math.round(avgViews),
      medianViews: Math.round(med),
      totalViews: views.reduce((a, b) => a + b, 0),
      performanceIndex,
      engagementRate,
      sampleSize: rows.length,
      vsBaseline,
      monetizationValue,
      businessScore: Math.round(businessScore * 100) / 100,
      conclusion: segmentNote,
      confidence: rows.length >= 6 ? 'medium' : 'low',
    });
  }

  return signals
    .sort((a, b) => (a.businessScore ?? 0) - (b.businessScore ?? 0))
    .slice(0, 7);
}
