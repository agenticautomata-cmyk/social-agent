import { env } from '../env.js';
import { hashNormalizedParts, normalizeHashPart } from './serialize-context.js';
import { computePlatformDashboard, loadVideosWithLatestMetrics } from '../creator-analytics/dashboard.js';
import { loadPostingTimeAnalytics } from '../creator-analytics/posting-times.js';
import { filterVideosForDisplay, resolveTikTokAnalyticsContext } from '../creator-analytics/tiktok-context.js';
import { listAnalyticsConnectors } from '../analytics-connectors/registry.js';
import { computeVideoBusinessIntelligence } from '../sponsor-intelligence/video-businesses.js';
import { buildCreatorStrategistProfile } from '../strategist/profile.js';
import { getStrategistBriefing } from '../strategist/analyze.js';
import { getMediaKit } from '../sponsor-outreach/media-kits.js';
import { getLatestProgressBrief } from '../benson-pulse/index.js';
import { getLatestLearningsForContext } from '../benson-learning/index.js';
import { getCreatorPreferences } from '../creator-preferences/index.js';
import { getCreatorFieldStatus } from '../creator-field-status/index.js';
import {
  getBriefOutcomeContextForAskBenson,
  getBriefSystemHealthForAskBenson,
} from '../control-tower/index.js';
import { getActiveShootSession, getShootSessionView } from '../shoot-mode/index.js';
import { loadPassedOpportunities } from '../creator-preferences/passed-opportunities.js';
import { loadActiveSuppressions } from '../creator-agent/entity-suppression.js';
import { textContainsSuppressedEntity } from '../benson-learning/suppression.js';
import { getCreatorInboxConfig } from '../creator-info/index.js';
import { getTopScoredOpportunities } from '../opportunity-scoring/index.js';
import {
  describeRecency,
  formatIsoDateTime,
  getCreatorNowClock,
  getCreatorTimezone,
  isPriorCreatorCalendarDay,
  isSameCreatorCalendarDay,
} from '../datetime.js';
import { advisePostingWindow } from '../creator-analytics/posting-window.js';
import { loadOpenTasksForNavigation, studioRoutesForPrompt } from '../benson-navigation/index.js';
import {
  loadRecordDiscussionContext,
  recordDiscussionPromptBlock,
} from '../creator-interest/context.js';
import { ASK_BENSON_PROMPT_VERSION } from './types.js';
import type { AskBensonGroundedContext } from './types.js';

function hashParts(parts: unknown[]): string {
  return hashNormalizedParts(parts);
}

export function normalizeAskMessage(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildSnapshotVersion(parts: {
  postingComputedAt: string | Date | null;
  dataThrough: string | Date | null;
  lastSync: string | Date | null;
  briefingCreatedAt: string | Date | null;
  totalVideos: number;
  mediaKitUpdatedAt?: string | Date | null;
  preferencesUpdatedAt?: string | Date | null;
  progressBriefCreatedAt?: string | Date | null;
}): string {
  return hashParts([
    normalizeHashPart(parts.postingComputedAt) || 'none',
    normalizeHashPart(parts.dataThrough) || 'none',
    normalizeHashPart(parts.lastSync) || 'none',
    normalizeHashPart(parts.briefingCreatedAt) || 'none',
    parts.totalVideos,
    normalizeHashPart(parts.mediaKitUpdatedAt) || 'none',
    normalizeHashPart(parts.preferencesUpdatedAt) || 'none',
    normalizeHashPart(parts.progressBriefCreatedAt) || 'none',
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
  contentItemId?: string;
}): Promise<AskBensonGroundedContext | null> {
  const profile = await buildCreatorStrategistProfile();
  if (!profile) return null;

  const [dashboard, businessIntel, connectors, briefing, tiktokCtx, postingAnalytics, mediaKitRow, videoLoad, progressBrief, preferences, learnings, passedOpportunities, liveFieldStatus, outcomeAnalytics, systemHealth, activeShootRow] =
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
      getLatestLearningsForContext().catch(() => null),
      loadPassedOpportunities().catch(() => []),
      getCreatorFieldStatus().catch(() => null),
      getBriefOutcomeContextForAskBenson().catch(() => null),
      getBriefSystemHealthForAskBenson().catch(() => null),
      getActiveShootSession().catch(() => null),
    ]);

  const suppressions = await loadActiveSuppressions();
  const visiblePassedOpportunities = passedOpportunities.filter(
    (entry) => !textContainsSuppressedEntity(entry.phrase, suppressions),
  );

  const topOpportunities = await getTopScoredOpportunities({
    limit: 5,
    excludeCategories: preferences?.excludedCategories ?? [],
  }).catch(() => []);

  const openTasks = await loadOpenTasksForNavigation({
    excludeCategories: preferences?.excludedCategories ?? [],
  }).catch(() => []);

  const activeShootView = activeShootRow
    ? await getShootSessionView(activeShootRow.id).catch(() => null)
    : null;

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

  const clock = getCreatorNowClock();

  let recordDiscussion: AskBensonGroundedContext['recordDiscussion'] = null;
  if (options?.contentItemId) {
    const recordCtx = await loadRecordDiscussionContext(options.contentItemId);
    if (recordCtx) {
      recordDiscussion = {
        ...recordCtx,
        discussionPrompt: recordDiscussionPromptBlock(recordCtx),
      };
    }
  }

  return {
    snapshotVersion,
    now: clock,
    postingScheduleGuidance:
      'Historical posting patterns are hints, not rules. Use now (creator timezone) to recommend the next actionable window. Do not tell Kellie to post every video at the same exact minute — vary by urgency and content. Weak signals (videoCount 1) should be softened to day-part language.',
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
    recommendedPostTimes: profile.recommendedPostTimes.slice(0, 5).map((s) => {
      const advice = advisePostingWindow(s, clock);
      return {
        historicalLabel: s.label,
        videoCount: s.videoCount,
        avgViews: s.avgViews,
        performanceIndex: s.performanceIndex,
        signalStrength: advice.confidence,
        nextActionableWindow: advice.label,
        signalNote: advice.signalNote,
      };
    }),
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
          /** When true, do not treat this briefing as today's todo list. */
          isFromPriorDay: isPriorCreatorCalendarDay(briefing.createdAt),
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
          // Yesterday's next-step is not today's assignment
          suggestedNextStep: isSameCreatorCalendarDay(progressBrief.createdAt)
            ? (progressBrief.suggestedNextStep ?? null)
            : null,
          createdAt: progressBrief.createdAt,
          isFromPriorDay: isPriorCreatorCalendarDay(progressBrief.createdAt),
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
      passedOpportunities: visiblePassedOpportunities.slice(0, 12).map((p) => ({
        phrase: p.phrase,
        reason: p.reason,
      })),
    },
    bensonLearnings: learnings
      ? {
          summary: learnings.summary,
          insights: learnings.insights.map((i) => ({
            id: i.id,
            category: i.category,
            insight: i.insight,
            confidence: i.confidence,
            lessonType: i.lessonType,
            action: i.action,
            evidenceSource: i.evidenceSource,
            evidenceDateRange: i.evidenceDateRange,
            durability: i.durability,
          })),
          updatedAt: learnings.createdAt,
          isStale: learnings.isStale,
        }
      : null,
    liveFieldStatus: liveFieldStatus
      ? {
          shootingNow: liveFieldStatus.active,
          headline: liveFieldStatus.headline,
          eventName: liveFieldStatus.eventName,
          location: liveFieldStatus.location,
          eventDate: liveFieldStatus.eventDate,
          activity: liveFieldStatus.activity,
          updatedAt: liveFieldStatus.updatedAt,
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
    outcomeAnalytics,
    systemHealth,
    activeShoot: activeShootView
      ? {
          sessionId: activeShootView.id,
          title: activeShootView.title,
          shotIndex: activeShootView.shotIndex,
          shotTotal: activeShootView.shotTotal,
          status: activeShootView.status,
        }
      : null,
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
    recordDiscussion,
  };
}
