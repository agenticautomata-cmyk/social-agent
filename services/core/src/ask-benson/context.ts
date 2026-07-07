import { createHash } from 'node:crypto';
import { env } from '../env.js';
import { computePlatformDashboard, loadVideosWithLatestMetrics } from '../creator-analytics/dashboard.js';
import { loadPostingTimeAnalytics } from '../creator-analytics/posting-times.js';
import { filterVideosForDisplay, resolveTikTokAnalyticsContext } from '../creator-analytics/tiktok-context.js';
import { listAnalyticsConnectors } from '../analytics-connectors/registry.js';
import { computeVideoBusinessIntelligence } from '../sponsor-intelligence/video-businesses.js';
import { buildCreatorStrategistProfile } from '../strategist/profile.js';
import { getStrategistBriefing } from '../strategist/analyze.js';
import { getMediaKit } from '../sponsor-outreach/media-kits.js';
import { getLatestProgressBrief } from '../benson-pulse/index.js';
import { getLatestLearnings } from '../benson-learning/index.js';
import { getCreatorPreferences } from '../creator-preferences/index.js';
import { getCreatorInboxConfig } from '../creator-info/index.js';
import { getTopScoredOpportunities } from '../opportunity-scoring/index.js';
import {
  describeRecency,
  formatIsoDateTime,
  getCreatorTimezone,
  localHourInTimezone,
} from '../datetime.js';
import { loadOpenTasksForNavigation, studioRoutesForPrompt } from '../benson-navigation/index.js';
import { ASK_BENSON_PROMPT_VERSION } from './types.js';
import type { AskBensonGroundedContext } from './types.js';

function hashParts(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

export function normalizeAskMessage(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildSnapshotVersion(parts: {
  postingComputedAt: string | null;
  dataThrough: string | null;
  lastSync: string | null;
  briefingCreatedAt: string | null;
  totalVideos: number;
  mediaKitUpdatedAt?: string | null;
  preferencesUpdatedAt?: string | null;
  progressBriefCreatedAt?: string | null;
}): string {
  return hashParts([
    parts.postingComputedAt ?? 'none',
    parts.dataThrough ?? 'none',
    parts.lastSync ?? 'none',
    parts.briefingCreatedAt ?? 'none',
    String(parts.totalVideos),
    parts.mediaKitUpdatedAt ?? 'none',
    parts.preferencesUpdatedAt ?? 'none',
    parts.progressBriefCreatedAt ?? 'none',
  ]);
}

export function buildCacheKey(
  normalizedMessage: string,
  snapshotVersion: string,
  mediaKitId?: string | null,
  imageHash?: string | null,
): string {
  return hashParts([
    normalizedMessage,
    snapshotVersion,
    ASK_BENSON_PROMPT_VERSION,
    mediaKitId ?? 'none',
    imageHash ?? 'none',
  ]);
}

export async function buildAskBensonContext(options?: {
  pageContext?: string;
  mediaKitId?: string;
}): Promise<AskBensonGroundedContext | null> {
  const profile = await buildCreatorStrategistProfile();
  if (!profile) return null;

  const [dashboard, businessIntel, connectors, briefing, tiktokCtx, postingAnalytics, mediaKitRow, videoLoad, progressBrief, preferences, learnings] =
    await Promise.all([
      computePlatformDashboard('tiktok', env.DEMO_MODE),
      computeVideoBusinessIntelligence({ tableLimit: 10, recentLimit: 8 }),
      listAnalyticsConnectors(),
      getStrategistBriefing(),
      resolveTikTokAnalyticsContext(env.DEMO_MODE),
      loadPostingTimeAnalytics(profile.creatorId, 'tiktok'),
      options?.mediaKitId ? getMediaKit(options.mediaKitId) : Promise.resolve(null),
      loadVideosWithLatestMetrics('tiktok'),
      getLatestProgressBrief().catch(() => null),
      getCreatorPreferences().catch(() => null),
      getLatestLearnings().catch(() => null),
    ]);

  const topOpportunities = await getTopScoredOpportunities({
    limit: 5,
    excludeCategories: preferences?.excludedCategories ?? [],
  }).catch(() => []);

  const openTasks = await loadOpenTasksForNavigation({
    excludeCategories: preferences?.excludedCategories ?? [],
  }).catch(() => []);

  const displayVideos = filterVideosForDisplay(videoLoad.videos, tiktokCtx);
  const medianViews = profile.summaryStats.medianViews;
  const sortedByRecency = [...displayVideos].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
  const recentVideos = sortedByRecency
    .slice(0, 25)
    .map((v) => ({
      title: v.title ?? v.caption ?? null,
      views: v.views,
      engagementRate: v.engagementRate,
      category: v.contentCategory,
      location: v.locationTag,
      publishedAt: v.publishedAt,
      vsMedianPct:
        medianViews > 0 ? Math.round(((v.views - medianViews) / medianViews) * 1000) / 10 : null,
    }));

  const newest = sortedByRecency[0] ?? null;
  const latestPost = newest
    ? {
        title: newest.title ?? newest.caption ?? 'Untitled post',
        publishedAt: newest.publishedAt,
        publishedAtLocal: formatIsoDateTime(newest.publishedAt),
        postedLabel: describeRecency(newest.publishedAt),
        hoursSincePost:
          Math.round(((Date.now() - new Date(newest.publishedAt).getTime()) / 3_600_000) * 10) / 10,
        views: newest.views,
        engagementRate: newest.engagementRate,
        category: newest.contentCategory,
        location: newest.locationTag,
        vsMedianPct:
          medianViews > 0
            ? Math.round(((newest.views - medianViews) / medianViews) * 1000) / 10
            : null,
      }
    : null;

  const tiktokConnector = connectors.find((c) => c.provider === 'tiktok');
  const dataLimitations: string[] = [];

  if (!tiktokCtx.connected) {
    dataLimitations.push('TikTok is not connected — analytics may be demo or import-only.');
  }
  if (!tiktokCtx.followersAvailable) {
    dataLimitations.push(
      'Follower count is unavailable — TikTok API scope or connector does not expose follower metrics.',
    );
  }
  if (tiktokCtx.scopes.length > 0 && !tiktokCtx.scopes.some((s) => s.includes('user.info'))) {
    dataLimitations.push(`TikTok OAuth scopes are limited: ${tiktokCtx.scopes.join(', ')}.`);
  }
  if (dashboard.dataSource === 'demo') {
    dataLimitations.push('Analytics dashboard is using demo seed data, not live API sync.');
  }
  if (!briefing.analysis) {
    dataLimitations.push('No cached strategist briefing — schedule/content advice may be limited.');
  }

  const lastSuccessfulSyncAt =
    tiktokConnector?.lastSuccessfulSyncAt ?? tiktokCtx.lastSuccessfulSyncAt ?? null;
  const hoursSinceSync = lastSuccessfulSyncAt
    ? Math.round(((Date.now() - new Date(lastSuccessfulSyncAt).getTime()) / 3_600_000) * 10) / 10
    : null;
  const tiktokStatus = tiktokCtx.connectionStatus;
  const isStale =
    !tiktokCtx.connected ||
    tiktokStatus === 'expired' ||
    hoursSinceSync == null ||
    hoursSinceSync > 24;
  const canTrustLiveMetrics = tiktokCtx.connected && !isStale && tiktokStatus === 'connected';

  if (isStale) {
    dataLimitations.push(
      lastSuccessfulSyncAt
        ? `TikTok metrics are stale (last sync ${formatIsoDateTime(lastSuccessfulSyncAt)}). Use past tense for view counts and tell Kellie to reconnect at /analytics/tiktok/settings before trusting live trends.`
        : 'TikTok has never synced successfully — do not cite view trends as current.',
    );
  }

  const postingComputedAt =
    profile.postingTimeAnalytics?.computedAt ?? postingAnalytics?.computedAt ?? null;

  const snapshotVersion = buildSnapshotVersion({
    postingComputedAt,
    dataThrough: dashboard.summary.dataThrough,
    lastSync: tiktokConnector?.lastSuccessfulSyncAt ?? tiktokCtx.lastSuccessfulSyncAt,
    briefingCreatedAt: briefing.createdAt,
    totalVideos: dashboard.summary.totalVideos,
    mediaKitUpdatedAt: mediaKitRow?.updatedAt ?? null,
    preferencesUpdatedAt: preferences?.updatedAt ?? null,
    progressBriefCreatedAt: progressBrief?.createdAt ?? null,
  });

  if (options?.mediaKitId && !mediaKitRow) {
    dataLimitations.push('Requested media kit was not found — review is limited to creator analytics.');
  }
  if (mediaKitRow) {
    dataLimitations.push(
      'Media kit file contents are not parsed — review metadata, creator analytics, and sponsor intelligence only. Do not invent PDF/DOCX text.',
    );
  }

  const topBusinessNames = new Set(
    profile.topBusinesses.slice(0, 3).map((b) => b.name.toLowerCase()),
  );
  const sponsorProofVideos = businessIntel.recentBusinessMentions
    .filter((m) => topBusinessNames.has(m.businessName.toLowerCase()))
    .slice(0, 6)
    .map((m) => ({
      businessName: m.businessName,
      title: m.title,
      views: m.views,
      postUrl: m.postUrl,
    }));

  let followersUnavailableReason: string | null = null;
  if (!tiktokCtx.followersAvailable) {
    if (!tiktokCtx.connected) {
      followersUnavailableReason = 'TikTok account is not connected.';
    } else if (tiktokCtx.followersSource === 'unavailable') {
      followersUnavailableReason =
        'TikTok API did not return follower count (scope or API limitation).';
    } else {
      followersUnavailableReason = 'Follower metrics are not exposed for this connection.';
    }
  }

  const localHour = localHourInTimezone();
  return {
    snapshotVersion,
    now: {
      local: formatIsoDateTime(new Date().toISOString()),
      partOfDay: localHour < 12 ? 'morning' : localHour < 17 ? 'afternoon' : 'evening',
      timezone: getCreatorTimezone(),
    },
    creator: {
      username: profile.creator,
      displayName: profile.displayName,
      platform: profile.platform,
      dataSource: profile.dataSource,
    },
    connection: {
      tiktokConnected: tiktokCtx.connected,
      connectionStatus: tiktokCtx.connectionStatus,
      platformUsername: tiktokCtx.platformUsername,
      lastSuccessfulSyncAt:
        tiktokConnector?.lastSuccessfulSyncAt ?? tiktokCtx.lastSuccessfulSyncAt,
      lastSyncAt: tiktokConnector?.lastSyncAt ?? tiktokCtx.lastSyncAt,
      scopes: tiktokCtx.scopes,
      followersAvailable: tiktokCtx.followersAvailable,
      followersCount: tiktokCtx.followersCount,
      followersUnavailableReason,
    },
    analyticsSummary: {
      totalVideos: profile.summaryStats.totalVideos,
      totalViews: profile.summaryStats.totalViews,
      medianViews: profile.summaryStats.medianViews,
      avgEngagementRate: profile.summaryStats.avgEngagementRate,
      views30d: profile.views30d,
      videosPerWeek: profile.postingFrequency.videosPerWeek,
      dataThrough: profile.audienceSignals.dataThrough,
    },
    topVideos: dashboard.topVideos.slice(0, 10).map((v) => ({
      title: v.title,
      views: v.views,
      engagementRate: v.engagementRate,
      category: v.contentCategory,
      location: v.locationTag,
      publishedAt: v.publishedAt,
    })),
    topCategories: profile.topCategories.slice(0, 8).map((c) => ({
      category: c.category,
      videoCount: c.videoCount,
      avgViews: c.avgViews,
      avgEngagementRate: c.avgEngagementRate,
      performanceIndex: c.performanceIndex,
      trend: c.trend,
    })),
    categoryPerformance: profile.categoryPerformance.slice(0, 12).map((c) => ({
      category: c.category,
      videoCount: c.videoCount,
      avgViews: c.avgViews,
      avgEngagementRate: c.avgEngagementRate,
      performanceIndex: c.performanceIndex,
      trend: c.trend,
    })),
    topLocations: dashboard.topLocations.slice(0, 6).map((l) => ({
      location: l.key,
      videoCount: l.videoCount,
      avgViews: l.avgViews,
      performanceIndex: l.performanceIndex,
    })),
    recommendedPostTimes: profile.recommendedPostTimes.slice(0, 5).map((s) => ({
      label: s.label,
      videoCount: s.videoCount,
      avgViews: s.avgViews,
      performanceIndex: s.performanceIndex,
    })),
    avoidPostTimes: profile.avoidPostTimes.slice(0, 4).map((s) => ({
      label: s.label,
      performanceIndex: s.performanceIndex,
      videoCount: s.videoCount,
    })),
    postingFrequency: profile.postingFrequency,
    postingTimeSample: {
      computedAt: profile.postingTimeAnalytics?.computedAt ?? postingAnalytics?.computedAt ?? null,
      timezone: profile.postingTimeAnalytics?.timezone ?? postingAnalytics?.timezone ?? null,
      sampleSize: profile.postingTimeAnalytics?.sampleSize ?? postingAnalytics?.sampleSize ?? null,
    },
    growthTrend: profile.growthTrend.slice(-8),
    engagementTrend: profile.engagementTrend.slice(-8),
    recentVideos,
    underperformers: profile.recentDeclines.slice(0, 8).map((d) => ({
      label: `${d.dimension}: ${d.value}`,
      dimension: d.dimension,
      performanceIndex: d.performanceIndex,
      avgViews: d.avgViews,
      videoCount: d.videoCount,
    })),
    topBusinesses: profile.topBusinesses.slice(0, 8).map((b) => ({
      name: b.name,
      mentions: b.mentions,
      totalViews: b.totalViews,
      type: b.type,
    })),
    sponsorCandidates: profile.sponsorCandidates.slice(0, 8).map((s) => ({
      name: s.name,
      score: s.score,
      mentions: s.mentions,
      totalViews: s.totalViews,
    })),
    sponsorProofVideos,
    strategistBriefing: briefing.analysis
      ? {
          summary: briefing.analysis.summary,
          topOpportunities:
            briefing.highlights?.topOpportunities ?? briefing.analysis.opportunities.slice(0, 3),
          topRisks: briefing.highlights?.topRisks ?? briefing.analysis.risks.slice(0, 3),
          stopDoing: briefing.analysis.stopDoing,
          recommendedPostTimes: briefing.highlights?.recommendedPostTimes ?? [],
          bestSponsorProspect: briefing.highlights?.bestSponsorProspect ?? null,
          briefingAge: briefing.createdAt,
        }
      : null,
    recentGrowth: profile.recentGrowth.slice(-4).map((g) => ({
      period: g.period,
      viewsChangePct: g.viewsChangePct,
      engagementChangePct: g.engagementChangePct,
    })),
    recentDeclines: profile.recentDeclines.slice(0, 6).map((d) => ({
      dimension: d.dimension,
      value: d.value,
      performanceIndex: d.performanceIndex,
    })),
    dataLimitations,
    latestPost,
    latestProgressBrief: progressBrief
      ? {
          headline: progressBrief.headline,
          progressSummary: progressBrief.progressSummary,
          whatChanged: progressBrief.whatChanged,
          suggestedNextStep: progressBrief.suggestedNextStep ?? null,
          createdAt: progressBrief.createdAt,
        }
      : null,
    creatorContactInfo: (() => {
      const inbox = getCreatorInboxConfig();
      return {
        sendAsGmail: inbox.sendAsGmail,
        domain: inbox.domain,
        channels: inbox.channels.map((ch) => ({
          id: ch.id,
          label: ch.label,
          email: ch.email,
          purpose: ch.purpose,
        })),
      };
    })(),
    creatorPreferences: {
      excludedCategories: preferences?.excludedCategories ?? [],
      categoryNotes: preferences?.categoryNotes ?? {},
    },
    bensonLearnings: learnings
      ? {
          summary: learnings.summary,
          insights: learnings.insights.map((i) => ({
            id: i.id,
            category: i.category,
            insight: i.insight,
            confidence: i.confidence,
          })),
          updatedAt: learnings.createdAt,
        }
      : null,
    topOpportunities: topOpportunities.map((o) => ({
      title: o.title,
      category: o.category,
      location: o.location,
      eventDate: o.eventDate,
      bensonScore: o.composite,
      why: o.rationale,
    })),
    inventorySearch: null,
    conciergeWebResearch: null,
    conciergePicks: null,
    studioRoutes: studioRoutesForPrompt(),
    openTasks: openTasks.map(({ id, title, subtitle, href, section, priority }) => ({
      id,
      title,
      subtitle,
      href,
      section,
      priority,
    })),
    pipelineHealth: {
      tiktokStatus,
      hoursSinceSync,
      isStale,
      canTrustLiveMetrics,
      reconnectUrl: '/analytics/tiktok/settings',
      dataThrough: dashboard.summary.dataThrough,
    },
    pageContext: options?.pageContext,
    mediaKit: mediaKitRow
      ? {
          id: mediaKitRow.id,
          name: mediaKitRow.name,
          description: mediaKitRow.description,
          targetAudience: mediaKitRow.targetAudience,
          version: mediaKitRow.version,
          fileUrl: mediaKitRow.fileUrl,
          originalFilename: mediaKitRow.originalFilename,
          mimeType: mediaKitRow.mimeType,
          fileSize: mediaKitRow.fileSize,
          hasUploadedFile: Boolean(mediaKitRow.storageFilename),
          fileContentNotParsed: true as const,
        }
      : null,
  };
}
