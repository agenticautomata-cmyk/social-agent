import { formatDate as formatDateCst } from './datetime';

export type BusinessType = 'local' | 'chain';

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
  ok?: boolean;
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

export type VideoBusinessDetailResponse = {
  ok?: boolean;
  business: VideoBusinessAggregate;
  videos: VideoBusinessMention[];
};

export function formatLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return value.replace(/_/g, ' ');
}

export function formatDate(iso: string): string {
  return formatDateCst(iso);
}

export { formatNumber } from './creator-analytics-types';
