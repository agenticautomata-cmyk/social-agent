import { env } from '../env.js';
import { buildCreatorStrategistProfile } from '../strategist/profile.js';
import { computePlatformDashboard } from '../creator-analytics/dashboard.js';
import { resolveTikTokAnalyticsContext } from '../creator-analytics/tiktok-context.js';
import { listAnalyticsConnectors } from '../analytics-connectors/registry.js';
import { formatIsoDateTime } from '../datetime.js';

export type PlaybookCoachContext = {
  canTrustLiveMetrics: boolean;
  dataSource: 'live' | 'demo';
  dataLimitations: string[];
  creator: {
    displayName: string;
    videosLast30d: number;
    videosPerWeek: number;
    medianViews: number | null;
    engagementRate: number;
  };
  topCategories: Array<{ category: string; avgViews: number; videoCount: number }>;
  recommendedPostTimes: Array<{
    label: string;
    weekday: string;
    hour: number;
    minute: number;
    performanceIndex: number;
  }>;
  avoidPostTimes: Array<{ label: string; weekday: string }>;
  recentDeclines: Array<{ category: string; reason: string }>;
  topRecentPosts: Array<{ title: string | null; views: number; category: string | null }>;
  sponsorCandidates: Array<{ name: string; reason: string }>;
};

export async function buildPlaybookCoachContext(): Promise<PlaybookCoachContext | null> {
  const profile = await buildCreatorStrategistProfile();
  if (!profile) return null;

  const [dashboard, tiktokCtx, connectors] = await Promise.all([
    computePlatformDashboard('tiktok', env.DEMO_MODE),
    resolveTikTokAnalyticsContext(env.DEMO_MODE),
    listAnalyticsConnectors(),
  ]);

  const dataLimitations: string[] = [];
  if (!tiktokCtx.connected) {
    dataLimitations.push('TikTok not connected — posting-time advice uses historical import/demo data.');
  }
  if (dashboard.dataSource === 'demo') {
    dataLimitations.push('Analytics are demo data, not live sync.');
  }

  const tiktokConnector = connectors.find((c) => c.provider === 'tiktok');
  const lastSync = tiktokConnector?.lastSuccessfulSyncAt ?? tiktokCtx.lastSuccessfulSyncAt ?? null;
  const hoursSinceSync = lastSync
    ? (Date.now() - new Date(lastSync).getTime()) / 3_600_000
    : null;
  const isStale =
    !tiktokCtx.connected ||
    tiktokCtx.connectionStatus === 'expired' ||
    hoursSinceSync == null ||
    hoursSinceSync > 24;
  const canTrustLiveMetrics =
    tiktokCtx.connected && !isStale && tiktokCtx.connectionStatus === 'connected';

  if (isStale && lastSync) {
    dataLimitations.push(
      `Metrics stale — last sync ${formatIsoDateTime(lastSync)}. Treat trends as directional.`,
    );
  }

  return {
    canTrustLiveMetrics,
    dataSource: profile.dataSource,
    dataLimitations,
    creator: {
      displayName: profile.displayName,
      videosLast30d: profile.postingFrequency.videosLast30d,
      videosPerWeek: profile.postingFrequency.videosPerWeek,
      medianViews: profile.summaryStats?.medianViews ?? null,
      engagementRate: profile.engagementRate,
    },
    topCategories: profile.topCategories.slice(0, 5).map((c) => ({
      category: c.category,
      avgViews: c.avgViews,
      videoCount: c.videoCount,
    })),
    recommendedPostTimes: profile.recommendedPostTimes.slice(0, 5).map((t) => ({
      label: t.label,
      weekday: t.weekday,
      hour: t.hour,
      minute: t.minute,
      performanceIndex: t.performanceIndex,
    })),
    avoidPostTimes: profile.avoidPostTimes.slice(0, 3).map((t) => ({
      label: t.label,
      weekday: t.weekday,
    })),
    recentDeclines: profile.recentDeclines.slice(0, 4).map((d) => ({
      category: d.value,
      reason: `${d.dimension} underperforming (index ${d.performanceIndex})`,
    })),
    topRecentPosts: [],
    sponsorCandidates: profile.sponsorCandidates.slice(0, 4).map((s) => ({
      name: s.name,
      reason: `${s.mentions} mentions, score ${s.score}`,
    })),
  };
}
