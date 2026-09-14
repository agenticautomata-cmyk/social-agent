/**
 * Opportunity research dossier — structured enrichment for business openings,
 * restaurants, retailers, hotels, attractions, local brands, and creator/
 * hospitality opportunities. No brand hard-coding.
 */

export const RESEARCH_STAGE_IDS = [
  'business_identity',
  'local_location',
  'official_web_social',
  'local_store_contact',
  'corporate_pr_marketing',
  'pr_agency',
  'creator_influencer_programs',
  'affiliate_programs',
  'media_press_partnership_pages',
  'news_opening_coverage',
  'brand_positioning',
  'kckellie_fit',
  'content_opportunities',
  'outreach_angles',
  'risks_restrictions_gaps',
] as const;

export type ResearchStageId = (typeof RESEARCH_STAGE_IDS)[number];

export const STAGE_STATUSES = [
  'completed',
  'no_result',
  'blocked',
  'authentication_required',
  'conflicting_evidence',
  'failed',
  'skipped',
] as const;

export type StageStatus = (typeof STAGE_STATUSES)[number];

export const CLAIM_LABELS = [
  'verified',
  'partially_verified',
  'unverified_lead',
  'conflicting',
  'not_found',
  'blocked',
] as const;

export type ClaimLabel = (typeof CLAIM_LABELS)[number];

export const CONTACT_VERIFICATION_STATUSES = [
  'verified',
  'partially_verified',
  'unverified_lead',
  'rejected_guess',
  'rejected_private',
  'not_found',
] as const;

export type ContactVerificationStatus = (typeof CONTACT_VERIFICATION_STATUSES)[number];

export const CONTACT_SCOPES = ['local', 'corporate', 'agency', 'generic'] as const;
export type ContactScope = (typeof CONTACT_SCOPES)[number];

export const PROGRAM_TYPES = [
  'creator',
  'influencer',
  'ambassador',
  'affiliate',
  'referral',
  'press_media',
  'local_partnership',
  'community_partnership',
  'hosted_experience',
  'gifting_seeding',
  'event_media_access',
] as const;

export type ProgramType = (typeof PROGRAM_TYPES)[number];

export type ResearchCitation = {
  url: string;
  title: string | null;
  retrievedAt: string;
  sourceType: 'official' | 'directory' | 'news' | 'email' | 'article' | 'other';
};

export type ClaimedFact<T = string> = {
  value: T | null;
  label: ClaimLabel;
  citations: ResearchCitation[];
  note?: string | null;
};

export type ResearchStageResult = {
  id: ResearchStageId;
  label: string;
  status: StageStatus;
  reason?: string | null;
  completedAt?: string | null;
};

export type OpportunityContact = {
  id: string;
  name: string | null;
  title: string | null;
  organization: string | null;
  email: string | null;
  phone: string | null;
  contactFormUrl: string | null;
  sourceUrl: string | null;
  sourceType: ResearchCitation['sourceType'];
  retrievedAt: string;
  confidence: 'high' | 'medium' | 'low';
  verificationStatus: ContactVerificationStatus;
  relevanceReason: string;
  scope: ContactScope;
  rank: number | null;
  rankReason: string | null;
  rejectedReason?: string | null;
};

export type PartnershipProgram = {
  id: string;
  name: string | null;
  programType: ProgramType;
  officialUrl: string | null;
  eligibility: string | null;
  applicationMethod: string | null;
  compensation: string | null;
  compensationOfficial: boolean;
  geographicLimitations: string | null;
  status: 'active' | 'inactive' | 'unknown';
  retrievedAt: string;
  verificationStatus: ClaimLabel;
  citations: ResearchCitation[];
  notes?: string | null;
};

export type FitRating = {
  dimension: string;
  rating: 'high' | 'medium' | 'low' | 'unknown';
  reason: string;
};

export type ContentRecommendation = {
  id: string;
  concept: string;
  whyItFits: string;
  requiredAccess: string;
  estimatedEffort: 'low' | 'medium' | 'high';
  permissionNeeded: boolean;
  evidence: string[];
  suggestedTiming: string;
};

export type OutreachPrep = {
  bestContactId: string | null;
  backupContactId: string | null;
  recommendedApproach: string;
  personalizationFacts: string[];
  proposedContentAngle: string;
  valueToBusiness: string;
  appropriateRequest: string;
  suggestedAttachments: string[];
  followUpTiming: string;
  draft: string | null;
  requiresUserApproval: true;
  autoSend: false;
};

export type OfficialBusinessInfo = {
  officialName: ClaimedFact;
  parentCompany: ClaimedFact;
  category: ClaimedFact;
  website: ClaimedFact;
  locationPage: ClaimedFact;
  streetAddress: ClaimedFact;
  cityStateZip: ClaimedFact;
  phone: ClaimedFact;
  hours: ClaimedFact;
  openingDate: ClaimedFact;
  grandOpening: ClaimedFact;
  appointmentsRequired: ClaimedFact;
  offerings: ClaimedFact<string[]>;
  socials: ClaimedFact<Record<string, string>>;
  mapLink: ClaimedFact;
};

export type NewsItem = {
  title: string;
  url: string;
  retrievedAt: string;
  factSummary: string;
  isStrategySuggestion: false;
};

export type OpportunityResearchDossier = {
  schemaVersion: 1;
  researchRunId: string;
  contentItemId: string;
  researchedAt: string;
  fingerprint: string;
  status: 'queued' | 'running' | 'complete' | 'failed' | 'stale';
  currentStageId: ResearchStageId | null;
  stages: ResearchStageResult[];
  business: OfficialBusinessInfo;
  contacts: OpportunityContact[];
  programs: PartnershipProgram[];
  news: NewsItem[];
  provenance: {
    emailSource: string | null;
    articleUrls: string[];
    gmailMessageIds: string[];
  };
  fit: FitRating[];
  contentRecommendations: ContentRecommendation[];
  outreachPrep: OutreachPrep | null;
  missingOrConflicting: string[];
  recommendedNextAction: string;
  lastSuccessfulResearchAt: string | null;
  lastFailedResearchAt: string | null;
  staleAfter: string;
  changedFacts: string[];
  history: Array<{
    researchRunId: string;
    researchedAt: string;
    fingerprint: string;
    status: string;
    changedFacts: string[];
  }>;
  autoOutreach: false;
  telegramNotified: boolean;
};

export type OpportunityResearchRunResult = {
  researchRunId: string;
  contentItemId: string;
  dossier: OpportunityResearchDossier;
  createdOpportunity: false;
  duplicateContactsAvoided: number;
  outreachSent: false;
};
