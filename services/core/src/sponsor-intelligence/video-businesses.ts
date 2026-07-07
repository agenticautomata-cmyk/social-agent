import { and, eq, notLike, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { getLatestSnapshotMap } from '../creator-analytics/import.js';
import { creatorVideos } from '../schema.js';

export const NATIONAL_CHAIN_NAMES = [
  'walmart',
  'target',
  'whole foods',
  'trader joe',
  'costco',
  "sam's club",
  'sams club',
  'tj maxx',
  'ross',
] as const;

export type BusinessType = 'local' | 'chain';

export type VideoBusinessMention = {
  videoId: string;
  platformVideoId: string;
  title: string | null;
  caption: string | null;
  postUrl: string | null;
  thumbnailUrl: string | null;
  publishedAt: string;
  contentCategory: string | null;
  locationTag: string | null;
  sponsorTag: string | null;
  businessName: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagement: number;
  engagementRate: number;
};

export type VideoBusinessAggregate = {
  slug: string;
  businessName: string;
  businessType: BusinessType;
  videoCount: number;
  totalViews: number;
  totalEngagement: number;
  avgViewsPerMention: number;
  firstMentionDate: string;
  lastMentionDate: string;
  primaryLocation: string | null;
  primaryCategory: string | null;
  sponsorScore: number;
  scoreBreakdown: {
    mentionFrequency: number;
    totalViews: number;
    engagement: number;
    localBonus: number;
  };
  eligibleForSponsorRecommendation: boolean;
};

export type RecentBusinessMention = {
  slug: string;
  businessName: string;
  businessType: BusinessType;
  videoId: string;
  platformVideoId: string;
  title: string | null;
  caption: string | null;
  postUrl: string | null;
  publishedAt: string;
  views: number;
  engagement: number;
  contentCategory: string | null;
  locationTag: string | null;
};

export type VideoBusinessIntelligenceResponse = {
  generatedAt: string;
  summary: {
    totalBusinesses: number;
    localBusinesses: number;
    chainBusinesses: number;
    totalMentions: number;
    totalViews: number;
  };
  topLocalSponsorCandidates: VideoBusinessAggregate[];
  mostMentionedBusinesses: VideoBusinessAggregate[];
  highestPerformingBusinesses: VideoBusinessAggregate[];
  recentBusinessMentions: RecentBusinessMention[];
};

export type VideoBusinessDetailResponse = {
  business: VideoBusinessAggregate;
  videos: VideoBusinessMention[];
};

export function normalizeBusinessKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function businessSlug(name: string): string {
  return normalizeBusinessKey(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function isNationalChain(name: string): boolean {
  const key = normalizeBusinessKey(name);
  return NATIONAL_CHAIN_NAMES.some(
    (chain) => key.includes(chain) || chain.includes(key),
  );
}

function modeValue(values: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    const v = value?.trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0] ?? null;
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function computeSponsorScores(businesses: VideoBusinessAggregate[]): void {
  const locals = businesses.filter((b) => b.businessType === 'local');
  const maxMentions = Math.max(...locals.map((b) => b.videoCount), 1);
  const maxViews = Math.max(...locals.map((b) => b.totalViews), 1);
  const maxEngagement = Math.max(...locals.map((b) => b.totalEngagement), 1);

  for (const business of businesses) {
    if (business.businessType === 'chain') {
      business.scoreBreakdown = {
        mentionFrequency: 0,
        totalViews: 0,
        engagement: 0,
        localBonus: 0,
      };
      business.sponsorScore = 0;
      business.eligibleForSponsorRecommendation = false;
      continue;
    }

    const mentionFrequency = (business.videoCount / maxMentions) * 100;
    const totalViews = (business.totalViews / maxViews) * 100;
    const engagement = (business.totalEngagement / maxEngagement) * 100;
    const localBonus = 100;

    business.scoreBreakdown = {
      mentionFrequency: roundScore(mentionFrequency),
      totalViews: roundScore(totalViews),
      engagement: roundScore(engagement),
      localBonus: roundScore(localBonus),
    };
    business.sponsorScore = roundScore(
      mentionFrequency * 0.4 +
        totalViews * 0.25 +
        engagement * 0.2 +
        localBonus * 0.15,
    );
    business.eligibleForSponsorRecommendation = true;
  }
}

export async function loadVideoBusinessMentions(): Promise<VideoBusinessMention[]> {
  const rows = await db
    .select()
    .from(creatorVideos)
    .where(
      and(
        eq(creatorVideos.platform, 'tiktok'),
        notLike(creatorVideos.videoId, 'demo_tt_%'),
        sql`${creatorVideos.metadata}->>'businessName' IS NOT NULL`,
      ),
    );

  const snapshotMap = await getLatestSnapshotMap(rows.map((row) => row.id));
  const mentions: VideoBusinessMention[] = [];

  for (const row of rows) {
    const meta =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const businessName = typeof meta.businessName === 'string' ? meta.businessName.trim() : '';
    if (!businessName) continue;

    const snap = snapshotMap.get(row.id);
    const views = snap?.views ?? 0;
    const likes = snap?.likes ?? 0;
    const comments = snap?.comments ?? 0;
    const shares = snap?.shares ?? 0;
    const engagement = likes + comments + shares;

    mentions.push({
      videoId: row.id,
      platformVideoId: row.videoId,
      title: row.title,
      caption: row.caption,
      postUrl: row.postUrl,
      thumbnailUrl: row.thumbnailUrl,
      publishedAt: row.publishedAt.toISOString(),
      contentCategory: row.contentCategory,
      locationTag: row.locationTag,
      sponsorTag: row.sponsorTag,
      businessName,
      views,
      likes,
      comments,
      shares,
      engagement,
      engagementRate: snap?.engagementRate != null ? Number(snap.engagementRate) : 0,
    });
  }

  return mentions.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

function aggregateBusinesses(mentions: VideoBusinessMention[]): VideoBusinessAggregate[] {
  const groups = new Map<
    string,
    {
      displayName: string;
      mentions: VideoBusinessMention[];
    }
  >();

  for (const mention of mentions) {
    const key = normalizeBusinessKey(mention.businessName);
    const existing = groups.get(key);
    if (existing) {
      existing.mentions.push(mention);
      if (mention.businessName.length > existing.displayName.length) {
        existing.displayName = mention.businessName;
      }
    } else {
      groups.set(key, { displayName: mention.businessName, mentions: [mention] });
    }
  }

  const businesses: VideoBusinessAggregate[] = [];

  for (const [key, group] of groups) {
    const { displayName, mentions: bizMentions } = group;
    const videoCount = bizMentions.length;
    const totalViews = bizMentions.reduce((sum, m) => sum + m.views, 0);
    const totalEngagement = bizMentions.reduce((sum, m) => sum + m.engagement, 0);
    const dates = bizMentions.map((m) => m.publishedAt).sort();
    const businessType: BusinessType = isNationalChain(displayName) ? 'chain' : 'local';

    businesses.push({
      slug: businessSlug(displayName),
      businessName: displayName,
      businessType,
      videoCount,
      totalViews,
      totalEngagement,
      avgViewsPerMention: videoCount > 0 ? Math.round(totalViews / videoCount) : 0,
      firstMentionDate: dates[0] ?? new Date().toISOString(),
      lastMentionDate: dates[dates.length - 1] ?? new Date().toISOString(),
      primaryLocation: modeValue(bizMentions.map((m) => m.locationTag)),
      primaryCategory: modeValue(bizMentions.map((m) => m.contentCategory)),
      sponsorScore: 0,
      scoreBreakdown: {
        mentionFrequency: 0,
        totalViews: 0,
        engagement: 0,
        localBonus: 0,
      },
      eligibleForSponsorRecommendation: businessType === 'local',
    });
  }

  computeSponsorScores(businesses);
  return businesses.sort((a, b) => b.sponsorScore - a.sponsorScore || b.videoCount - a.videoCount);
}

export async function computeVideoBusinessIntelligence(options?: {
  tableLimit?: number;
  recentLimit?: number;
}): Promise<VideoBusinessIntelligenceResponse> {
  const tableLimit = options?.tableLimit ?? 20;
  const recentLimit = options?.recentLimit ?? 20;
  const mentions = await loadVideoBusinessMentions();
  const businesses = aggregateBusinesses(mentions);

  const topLocalSponsorCandidates = businesses
    .filter((b) => b.eligibleForSponsorRecommendation)
    .sort((a, b) => b.sponsorScore - a.sponsorScore)
    .slice(0, tableLimit);

  const mostMentionedBusinesses = [...businesses]
    .sort((a, b) => b.videoCount - a.videoCount || b.totalViews - a.totalViews)
    .slice(0, tableLimit);

  const highestPerformingBusinesses = [...businesses]
    .sort((a, b) => b.totalViews - a.totalViews || b.totalEngagement - a.totalEngagement)
    .slice(0, tableLimit);

  const recentBusinessMentions: RecentBusinessMention[] = mentions.slice(0, recentLimit).map(
    (mention) => ({
      slug: businessSlug(mention.businessName),
      businessName: mention.businessName,
      businessType: isNationalChain(mention.businessName) ? 'chain' : 'local',
      videoId: mention.videoId,
      platformVideoId: mention.platformVideoId,
      title: mention.title,
      caption: mention.caption,
      postUrl: mention.postUrl,
      publishedAt: mention.publishedAt,
      views: mention.views,
      engagement: mention.engagement,
      contentCategory: mention.contentCategory,
      locationTag: mention.locationTag,
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalBusinesses: businesses.length,
      localBusinesses: businesses.filter((b) => b.businessType === 'local').length,
      chainBusinesses: businesses.filter((b) => b.businessType === 'chain').length,
      totalMentions: mentions.length,
      totalViews: mentions.reduce((sum, m) => sum + m.views, 0),
    },
    topLocalSponsorCandidates,
    mostMentionedBusinesses,
    highestPerformingBusinesses,
    recentBusinessMentions,
  };
}

export async function getVideoBusinessDetail(
  slug: string,
): Promise<VideoBusinessDetailResponse | null> {
  const mentions = await loadVideoBusinessMentions();
  const businesses = aggregateBusinesses(mentions);
  const business = businesses.find((b) => b.slug === slug);
  if (!business) return null;

  const key = normalizeBusinessKey(business.businessName);
  const videos = mentions
    .filter((m) => normalizeBusinessKey(m.businessName) === key)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return { business, videos };
}
