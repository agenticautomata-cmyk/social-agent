import type {
  TikTokCommentInsightStatus,
  TikTokCommentInsightType,
  TikTokHandoffMethod,
  TikTokHandoffStatus,
  TikTokMediaSourceType,
  TikTokOperatorRecommendationStatus,
  TikTokOperatorRecommendationType,
  TikTokPostPackageStatus,
} from '../schema.js';
import type { VideoWithMetrics } from '../creator-analytics/types.js';

export type OperatorRecommendationType = TikTokOperatorRecommendationType;
export type OperatorRecommendationStatus = TikTokOperatorRecommendationStatus;
export type PostPackageStatus = TikTokPostPackageStatus;
export type CommentInsightType = TikTokCommentInsightType;
export type CommentInsightStatus = TikTokCommentInsightStatus;

export type OperatorVideoRef = {
  id: string;
  videoId: string;
  title: string | null;
  caption: string | null;
  postUrl: string | null;
  thumbnailUrl: string | null;
  publishedAt: string;
  contentCategory: string | null;
  contentPillar: string | null;
  locationTag: string | null;
  sponsorTag: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
  performanceIndex: number;
};

export type OperatorRecommendationRow = {
  id: string;
  creatorId: string;
  platform: string;
  sourceVideoId: string | null;
  creatorVideoId: string | null;
  recommendationType: OperatorRecommendationType;
  title: string;
  explanation: string;
  supportingMetrics: Record<string, unknown>;
  confidence: number;
  priority: number;
  status: OperatorRecommendationStatus;
  relatedContentItemId: string | null;
  relatedSponsorTag: string | null;
  relatedLocationTag: string | null;
  postPackageId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  dismissedAt: string | null;
  completedAt: string | null;
  sourceVideo?: OperatorVideoRef | null;
};

export type PostPackageRow = {
  id: string;
  creatorId: string;
  platform: string;
  recommendationId: string | null;
  creatorVideoId: string | null;
  sourceVideoId: string | null;
  relatedContentItemId: string | null;
  hook: string | null;
  caption: string;
  hashtags: string[];
  coverText: string | null;
  firstComment: string | null;
  disclosureText: string | null;
  suggestedPostTime: string | null;
  scheduledAt: string | null;
  sponsorAngle: string | null;
  contentTheme: string | null;
  formatLabel: string | null;
  reason: string | null;
  checklist: string[];
  shotList: string[];
  cta: string | null;
  locationBrandNotes: string | null;
  status: PostPackageStatus;
  mediaSourceType: TikTokMediaSourceType;
  mediaReferenceText: string | null;
  temporaryAssetId: string | null;
  handoffMethod: TikTokHandoffMethod;
  handoffStatus: TikTokHandoffStatus;
  handoffError: string | null;
  handedOffAt: string | null;
  postedAt: string | null;
  postedUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CommentInsightRow = {
  id: string;
  creatorId: string;
  platform: string;
  sourceVideoId: string;
  creatorVideoId: string | null;
  commentText: string | null;
  clusterSummary: string | null;
  insightType: CommentInsightType;
  frequency: number;
  recommendation: string;
  postPackageId: string | null;
  status: CommentInsightStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  handledAt: string | null;
  sourceVideo?: OperatorVideoRef | null;
};

export type SponsorProofRow = {
  id: string;
  creatorId: string;
  platform: string;
  sourceVideoId: string;
  creatorVideoId: string | null;
  videoTitle: string;
  videoCaption: string | null;
  thumbnailUrl: string | null;
  shareUrl: string | null;
  performanceSnapshot: Record<string, unknown>;
  engagementRate: number | null;
  contentCategory: string | null;
  brandRelevance: string | null;
  notes: string | null;
  proofHeadline: string;
  proofSummary: string;
  includedInMediaKit: boolean;
  mediaKitId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type FormatTemplateRow = {
  id: string;
  creatorId: string;
  formatName: string;
  structure: string;
  idealLength: string | null;
  openingHookStyle: string | null;
  shotPattern: string[];
  bestContentCategories: string[];
  proofVideoIds: string[];
  avgPerformanceIndex: number | null;
  whenToUse: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type OperatorBriefingAction = {
  rank: number;
  label: string;
  reason: string;
  recommendationId?: string;
  postPackageId?: string;
  href?: string;
};

export type OperatorBriefing = {
  id: string | null;
  period: string;
  briefingDate: string;
  summary: string;
  actions: OperatorBriefingAction[];
  createdAt: string | null;
};

export type TikTokCapabilities = {
  analyticsConnected: boolean;
  publishOAuthConnected: boolean;
  inboxUploadReady: boolean;
  directPostReady: boolean;
  draftUploadReady: boolean;
  reauthorizeNeeded: boolean;
  permissionsMissing: string[];
  featureFlags: {
    enableTikTokPublish: boolean;
  };
};

export type OperatorPerformanceSignals = {
  medianViews: number;
  avgEngagementRate: number;
  totalVideos: number;
  outperformingCount: number;
  needsFollowUpCount: number;
  sponsorProofCandidates: number;
  momentumFadingCount: number;
  topThemes: Array<{ key: string; performanceIndex: number; videoCount: number }>;
  bestPostingWindows: Array<{ label: string; performanceIndex: number }>;
};

export type TikTokCommandCenter = {
  generatedAt: string;
  creatorId: string;
  demoMode: boolean;
  hasData: boolean;
  capabilities: TikTokCapabilities;
  signals: OperatorPerformanceSignals | null;
  briefing: OperatorBriefing;
  topRecentVideos: OperatorVideoRef[];
  recommendations: OperatorRecommendationRow[];
  postPackages: PostPackageRow[];
  commentInsights: CommentInsightRow[];
  sponsorProofAssets: SponsorProofRow[];
  formatTemplates: FormatTemplateRow[];
  readyToExecute: PostPackageRow[];
  needsFollowUp: OperatorRecommendationRow[];
  sponsorProofCandidates: OperatorRecommendationRow[];
};

export type AccountBaselines = {
  medianViews: number;
  avgViews: number;
  avgEngagementRate: number;
  avgComments: number;
  avgShares: number;
  videos: VideoWithMetrics[];
};

export type PreparePackageInput = {
  recommendationId?: string;
  creatorVideoId?: string;
  relatedContentItemId?: string;
  contentTheme?: string;
  formatLabel?: string;
  reason?: string;
  sequelOfVideoId?: string;
  replyInsightId?: string;
};

export type UpdatePostPackageInput = Partial<{
  hook: string | null;
  caption: string;
  hashtags: string[];
  coverText: string | null;
  firstComment: string | null;
  disclosureText: string | null;
  suggestedPostTime: string | null;
  scheduledAt: string | null;
  sponsorAngle: string | null;
  contentTheme: string | null;
  formatLabel: string | null;
  reason: string | null;
  checklist: string[];
  shotList: string[];
  cta: string | null;
  locationBrandNotes: string | null;
  status: PostPackageStatus;
  mediaSourceType: TikTokMediaSourceType;
  mediaReferenceText: string | null;
  handoffMethod: TikTokHandoffMethod;
}>;
