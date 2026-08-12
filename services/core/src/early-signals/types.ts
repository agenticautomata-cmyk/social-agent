export type ConfidenceLevel = 'low' | 'medium' | 'high' | 'confirmed';
export type UrgencyLevel =
  | 'breaking'
  | 'early_opportunity'
  | 'planning_lead'
  | 'roundup_ready'
  | 'weak_signal';

export type SignalState =
  | 'active'
  | 'needs_verification'
  | 'promoted'
  | 'dismissed'
  | 'merged'
  | 'snoozed'
  | 'skipped';

export type VerificationStatus = 'unverified' | 'partial' | 'verified' | 'confirmed';

export type ContentRecommendationKind =
  | 'green_screen_update'
  | 'before_you_go_kc'
  | 'kc_weekend_5'
  | 'outreach_first'
  | 'wait_and_verify'
  | 'field_visit';

export type NormalizedAdapterResult = {
  entityName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  signalType: string;
  changeSummary: string;
  relevantDates: string[];
  sourceName: string;
  sourceUrl: string;
  sourceCategory: string;
  supportingText: string;
  matchedKeywords: string[];
  reliabilityInputs: string[];
  detectedAt: Date;
  contentHash: string;
  metadata?: Record<string, unknown>;
};

export type ScoreExplanationLine = {
  factor: string;
  points: number;
  detail: string;
};

export type ContentRecommendation = {
  kind: ContentRecommendationKind;
  suggestedHook: string;
  confirmedFacts: string[];
  needsVerification: string[];
  suggestedTiming: string;
  sourceAttribution: string;
  callToAction: string;
  discloseNotVisited: boolean;
  recommendedAction: string;
};

export type EarlySignalView = {
  id: string;
  signalType: string;
  title: string;
  summary: string;
  sourceUrl: string | null;
  sourceName: string | null;
  sourceCategory: string | null;
  businessName: string | null;
  address: string | null;
  city: string | null;
  regionState: string | null;
  firstDetectedAt: string;
  lastCheckedAt: string;
  eventDate: string | null;
  confidenceLevel: ConfidenceLevel;
  confidenceScore: number;
  confidenceExplanation: ScoreExplanationLine[];
  urgencyLevel: UrgencyLevel;
  urgencyScore: number;
  urgencyExplanation: ScoreExplanationLine[];
  verificationStatus: VerificationStatus;
  state: SignalState;
  linkedOpportunityId: string | null;
  clusterKey: string | null;
  contentRecommendation: ContentRecommendation;
  evidence: Array<{
    id: string;
    evidenceType: string;
    sourceUrl: string | null;
    sourceName: string | null;
    extractedClaim: string;
    reliabilityScore: number;
    detectedAt: string;
  }>;
  missingVerification: string[];
  alertSentAt: string | null;
  metadata: Record<string, unknown>;
};
