export type OperatorRecommendationType =
  | 'make_sequel'
  | 'reply_with_video'
  | 'add_to_media_kit'
  | 'build_sponsor_proof'
  | 'create_outreach_angle'
  | 'repeat_format'
  | 'repost_or_remix'
  | 'schedule_follow_up'
  | 'prepare_for_tiktok'
  | 'investigate_comment_trend'
  | 'create_product_or_location_followup';

export type OperatorRecommendationStatus =
  | 'new'
  | 'accepted'
  | 'in_progress'
  | 'prepared'
  | 'scheduled'
  | 'completed'
  | 'dismissed';

export type PostPackageStatus =
  | 'draft'
  | 'ready'
  | 'scheduled'
  | 'handed_off'
  | 'posted_manual'
  | 'posted_confirmed'
  | 'failed'
  | 'canceled';

export type OperatorVideoRef = {
  id: string;
  videoId: string;
  title: string | null;
  caption: string | null;
  postUrl: string | null;
  thumbnailUrl: string | null;
  publishedAt: string;
  contentCategory: string | null;
  views: number;
  performanceIndex: number;
  engagementRate: number;
  comments: number;
};

export type OperatorRecommendation = {
  id: string;
  recommendationType: OperatorRecommendationType;
  title: string;
  explanation: string;
  supportingMetrics: Record<string, unknown>;
  confidence: number;
  priority: number;
  status: OperatorRecommendationStatus;
  sourceVideo?: OperatorVideoRef | null;
  postPackageId: string | null;
};

export type PostPackage = {
  id: string;
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
  status: PostPackageStatus;
  handoffMethod: string;
  handoffStatus: string;
  postedUrl: string | null;
  sourceVideoId: string | null;
};

export type CommentInsight = {
  id: string;
  sourceVideoId: string;
  clusterSummary: string | null;
  insightType: string;
  frequency: number;
  recommendation: string;
  status: string;
  postPackageId: string | null;
  sourceVideo?: OperatorVideoRef | null;
};

export type SponsorProofAsset = {
  id: string;
  proofHeadline: string;
  proofSummary: string;
  shareUrl: string | null;
  thumbnailUrl: string | null;
  engagementRate: number | null;
  includedInMediaKit: boolean;
};

export type FormatTemplate = {
  id: string;
  formatName: string;
  structure: string;
  avgPerformanceIndex: number | null;
  whenToUse: string | null;
};

export type OperatorBriefingAction = {
  rank: number;
  label: string;
  reason: string;
  recommendationId?: string;
  postPackageId?: string;
  href?: string;
};

export type TikTokCommandCenter = {
  generatedAt: string;
  demoMode: boolean;
  hasData: boolean;
  capabilities: {
    analyticsConnected: boolean;
    inboxUploadReady: boolean;
    directPostReady: boolean;
    reauthorizeNeeded: boolean;
    permissionsMissing: string[];
    featureFlags: { enableTikTokPublish: boolean };
  };
  signals: {
    medianViews: number;
    avgEngagementRate: number;
    totalVideos: number;
    outperformingCount: number;
    needsFollowUpCount: number;
    sponsorProofCandidates: number;
    momentumFadingCount: number;
    topThemes: Array<{ key: string; performanceIndex: number; videoCount: number }>;
    bestPostingWindows: Array<{ label: string; performanceIndex: number }>;
  } | null;
  briefing: {
    summary: string;
    actions: OperatorBriefingAction[];
  };
  topRecentVideos: OperatorVideoRef[];
  recommendations: OperatorRecommendation[];
  postPackages: PostPackage[];
  commentInsights: CommentInsight[];
  sponsorProofAssets: SponsorProofAsset[];
  formatTemplates: FormatTemplate[];
  readyToExecute: PostPackage[];
  needsFollowUp: OperatorRecommendation[];
  sponsorProofCandidates: OperatorRecommendation[];
};

export const RECOMMENDATION_LABELS: Record<OperatorRecommendationType, string> = {
  make_sequel: 'Make a sequel',
  reply_with_video: 'Reply with video',
  add_to_media_kit: 'Add to media kit',
  build_sponsor_proof: 'Sponsor proof candidate',
  create_outreach_angle: 'Outreach angle',
  repeat_format: 'Repeat this format',
  repost_or_remix: 'Repost or remix',
  schedule_follow_up: 'Needs follow-up',
  prepare_for_tiktok: 'Ready for TikTok',
  investigate_comment_trend: 'Comment trend',
  create_product_or_location_followup: 'Location follow-up',
};
