export const PARTNERSHIP_MONETIZATION_PATHS = [
  'affiliate',
  'gifted_product',
  'paid_sponsorship',
  'ugc',
  'event_invitation',
  'ambassador_program',
  'organic_content',
  'local_filming',
  'product_credit',
] as const;

export type PartnershipMonetizationPath = (typeof PARTNERSHIP_MONETIZATION_PATHS)[number];

export const PARTNERSHIP_PIPELINE_STATUSES = [
  'discovered',
  'researching',
  'qualified',
  'content_ready',
  'application_ready',
  'pitch_ready',
  'applied',
  'pitched',
  'follow_up',
  'accepted',
  'declined',
  'published',
  'monetizing',
] as const;

export type PartnershipPipelineStatus = (typeof PARTNERSHIP_PIPELINE_STATUSES)[number];

export const LOCAL_AVAILABILITY_STATUSES = [
  'confirmed_available',
  'confirmed_unavailable',
  'likely_available',
  'unknown_call_first',
] as const;

export type LocalAvailabilityStatus = (typeof LOCAL_AVAILABILITY_STATUSES)[number];

export const INVENTORY_VERIFICATION_STATUSES = [
  'confirmed_available',
  'confirmed_unavailable',
  'likely_available',
  'unknown_call_first',
  'unknown',
  'ambiguous',
] as const;

export type InventoryVerificationStatus = (typeof INVENTORY_VERIFICATION_STATUSES)[number];

export const PERMISSION_VERIFICATION_STATUSES = [
  'confirmed_allowed',
  'confirmed_not_allowed',
  'unknown',
  'ambiguous',
] as const;

export type PermissionVerificationStatus = (typeof PERMISSION_VERIFICATION_STATUSES)[number];

export const PROCESS_VERIFICATION_STATUSES = [
  'confirmed_offered',
  'confirmed_not_offered',
  'unknown',
  'ambiguous',
] as const;

export type ProcessVerificationStatus = (typeof PROCESS_VERIFICATION_STATUSES)[number];

export type VerifiedResearchField = {
  value: string | null;
  status: 'verified' | 'inferred' | 'needs_verification' | 'unavailable';
  source: string | null;
};

export type PartnershipLocalLocation = {
  name: string;
  address: string | null;
  availability: LocalAvailabilityStatus;
  notes: string | null;
  source: string | null;
};

export type StoryAngleCandidate = {
  angle: string;
  premiseTags: Array<'verified' | 'inferred' | 'blocked'>;
  blockedReason?: string;
};

export type NextActionInput = {
  action: string;
  rationale: string;
  blockedBy?: string[];
};

export type PartnershipResearch = {
  companySummary: VerifiedResearchField;
  audienceFitRationale: VerifiedResearchField;
  creatorProgram: VerifiedResearchField;
  programBenefits: VerifiedResearchField;
  programRequirements: VerifiedResearchField;
  socialAccounts: VerifiedResearchField;
  recentCollaborations: VerifiedResearchField;
  retailerRelationships: VerifiedResearchField;
  localFilmingPotential: VerifiedResearchField;
  creatorContactPath: VerifiedResearchField;
  productsPricingHooks: VerifiedResearchField;
  organicBeforeApproval: VerifiedResearchField;
  needsVerification: string[];
  citations: Array<{ url: string; title: string | null }>;
  localLocations: PartnershipLocalLocation[];
  fieldVerificationResults?: PartnershipFieldVerificationResult[];
  researchSummary: string | null;
  researchedAt: string | null;
  /** Structured outputs from the single research synthesis call (no extra LLM). */
  storyAngleCandidates?: StoryAngleCandidate[];
  nextActionInputs?: NextActionInput[];
  monetizationPathHints?: Array<{ path: string; status: string; source?: string }>;
};

export type FieldVerificationProvenance = {
  source: 'field_verification';
  channel:
    | 'employee_phone_confirmation'
    | 'manager_phone_confirmation'
    | 'in_person'
    | 'creator_observation'
    | 'other';
  contactName: string | null;
  contactRole: string | null;
  contactedAt: string | null;
  location: string | null;
};

export type PartnershipFieldVerificationResult = {
  id: string;
  taskKey: string;
  locationIndex: number | null;
  location: string | null;
  contactName: string | null;
  contactRole: string | null;
  contactedAt: string | null;
  inventoryStatus: InventoryVerificationStatus | null;
  pickupStatus: ProcessVerificationStatus | null;
  shipToStoreStatus: ProcessVerificationStatus | null;
  sellerIntakeStatus: ProcessVerificationStatus | null;
  filmingStatus: PermissionVerificationStatus | null;
  approvalRequirements: string | null;
  followUpContact: string | null;
  followUpSuggestion: string | null;
  provenance: FieldVerificationProvenance;
  notes: string | null;
  savedAt: string;
};

export type FieldVerificationAspect =
  | 'inventory'
  | 'pickup'
  | 'ship_to_store'
  | 'seller_intake'
  | 'filming'
  | 'general'
  | 'research_field';

export type PartnershipFieldVerificationTask = {
  key: string;
  kind: 'location_inventory' | 'research_field' | 'general';
  aspect: FieldVerificationAspect;
  title: string;
  description: string;
  locationIndex: number | null;
  priority: 'high' | 'medium';
  source: string;
  availabilityLabel: string | null;
  followUpSuggestion: string | null;
};

export type CallLocationScript = {
  locationName: string;
  locationAddress: string | null;
  objectives: string[];
  suggestedScript: string[];
  followUpQuestions: string[];
  creatorAccessQuestions: string[];
};

export type FitScoreDimension =
  | 'audienceFit'
  | 'personalityFit'
  | 'contentStoryPotential'
  | 'visualPotential'
  | 'localAccessibility'
  | 'organicContentPotential'
  | 'monetizationPotential'
  | 'partnershipLikelihood'
  | 'differentiationNovelty'
  | 'effortCostRequired';

export type FitScoreBreakdown = Record<
  FitScoreDimension,
  { score: number; reason: string }
> & {
  composite: number;
  summary: string;
};

export type CreatorPlay = {
  opportunitySummary: string;
  whyKellieShouldCare: string;
  recommendedStrategy: string;
  organicFirstVsPitchFirst: 'organic_first' | 'pitch_first' | 'hybrid';
  organicFirstRationale: string;
  contentConcepts: string[];
  openingHook: string;
  talkingPoints: string[];
  shotList: string[];
  bRollSuggestions: string[];
  researchBeforeFilming: string[];
  productsToFeature: string[];
  brandPositioningToPreserve: string[];
  potentialProblems: string[];
  disclosureRequirements: string[];
  monetizationPaths: PartnershipMonetizationPath[];
  programLinks: string[];
  brandContactResearch: string;
  partnershipPitch: string;
  followUpRecommendation: string;
  generatedAt: string;
};

export type CreatorPartnershipView = {
  id: string;
  contentItemId: string;
  title: string;
  summary: string | null;
  sourceUrl: string | null;
  submittedUrl: string | null;
  submittedText: string | null;
  brandName: string | null;
  productName: string | null;
  retailerName: string | null;
  pipelineStatus: PartnershipPipelineStatus;
  monetizationPaths: PartnershipMonetizationPath[];
  fitScore: number | null;
  fitScoreBreakdown: FitScoreBreakdown | null;
  research: PartnershipResearch | null;
  creatorPlay: CreatorPlay | null;
  needsVerification: string[];
  followUpAt: string | null;
  calendarReminderAt: string | null;
  researchStatus: string;
  researchError: string | null;
  metadata?: Record<string, unknown>;
  decisionBrief?: import('./partnership-sources.js').PartnershipDecisionBrief | null;
  createdAt: string;
  updatedAt: string;
};

export const CREATOR_PARTNERSHIP_CATEGORY = 'creator_partnership';

export const PARTNERSHIP_ENTITY_TYPES = [
  'platform',
  'brand',
  'retailer',
  'program',
  'unknown',
] as const;

export type PartnershipEntityType = (typeof PARTNERSHIP_ENTITY_TYPES)[number];

export const PARTNERSHIP_ACTIVITY_TYPES = [
  'platform_approved',
  'platform_submitted',
  'platform_pending',
  'platform_application_received',
  'platform_rejected',
  'platform_setup_required',
  'platform_notification',
  'program_approved',
  'application_received',
  'brand_response',
  'program_rejected',
  'email_matched',
  'unknown_inbound',
] as const;

export type PartnershipActivityType = (typeof PARTNERSHIP_ACTIVITY_TYPES)[number];

export type PartnershipFingerprints = {
  brandName: string | null;
  retailerNames: string[];
  programNames: string[];
  domains: string[];
  keywordPhrases: string[];
  sharedPlatforms: string[];
  updatedAt: string;
};

export type PartnershipActivityView = {
  id: string;
  creatorPartnershipId: string | null;
  activityType: PartnershipActivityType;
  entityType: PartnershipEntityType;
  entityName: string | null;
  gmailMessageId: string;
  gmailThreadId: string | null;
  senderEmail: string | null;
  senderDomain: string | null;
  subject: string | null;
  snippet: string | null;
  matchConfidence: number | null;
  matchedOn: string | null;
  suggestedStatus: PartnershipPipelineStatus | null;
  suggestedAction: string | null;
  suggestedFollowUpAt: string | null;
  requiresConfirmation: boolean;
  confirmationStatus: 'pending' | 'confirmed' | 'rejected';
  confirmedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
};
