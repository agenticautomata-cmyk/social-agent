export type FrameSummary = {
  timestamp_seconds: number;
  label: string;
  description: string;
  hook_strength?: 'weak' | 'medium' | 'strong';
  cover_candidate?: boolean;
};

export type PostingRecommendation = {
  should_post: 'yes' | 'no' | 'maybe';
  recommended_action:
    | 'post'
    | 'revise'
    | 'hold'
    | 'scrap'
    | 'schedule'
    | 'convert_to_story'
    | 'make_sequel';
  recommended_platforms: string[];
  recommended_time: string | null;
  reason: string;
  confidence: 'low' | 'medium' | 'high';
  required_edits: string[];
  caption_strategy: string | null;
  sponsor_angle: string | null;
  opportunity_link_reason: string | null;
};

export type OpportunityMatch = {
  opportunity_id: string | null;
  title: string | null;
  confidence: 'low' | 'medium' | 'high';
  reason: string;
  needs_confirmation: boolean;
};

export type DraftAssetRow = {
  id: string;
  creatorId: string;
  sourceChannel: string;
  sourceType: string;
  shareIntakeId: string | null;
  draftTitle: string | null;
  userNote: string | null;
  overallSummary: string | null;
  visualSummary: string | null;
  audioSummary: string | null;
  transcriptText: string | null;
  contextLimitations: string | null;
  status: string;
  readinessScore: string | null;
  postNowScore: string | null;
  hookAssessment: string | null;
  suggestedCaption: string | null;
  suggestedPostWindow: string | null;
  postingRecommendationJson: PostingRecommendation | null;
  opportunityMatchJson: OpportunityMatch | null;
  linkedOpportunityId: string | null;
  linkedPostPackageId: string | null;
  linkedTiktokVideoId: string | null;
  detectedContentTheme: string | null;
  detectedBrandsJson: string[] | null;
  detectedLocationsJson: string[] | null;
  suggestedHashtagsJson: string[] | null;
  frameSummariesJson: FrameSummary[] | null;
  createdAt: string;
  updatedAt: string;
  analyzedAt: string | null;
};
