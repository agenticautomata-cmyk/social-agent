export const INTEREST_ACTIONS = [
  'interested',
  'tell_me_more',
  'research',
  'plan_visit',
  'save_for_later',
  'generate_content_plan',
  'contact_business',
  'more_like_this',
  'less_like_this',
  'not_interested',
  'never_show',
] as const;

export type InterestAction = (typeof INTEREST_ACTIONS)[number];

export type FieldVerificationStatus = 'verified' | 'inferred' | 'unavailable' | 'needs_confirmation';

export type VerifiedField<T = string> = {
  value: T | null;
  status: FieldVerificationStatus;
  source: string | null;
};

export type BusinessEnrichment = {
  canonicalName: VerifiedField;
  entityType: VerifiedField;
  currentlyOpen: VerifiedField<boolean>;
  website: VerifiedField;
  officialSocial: VerifiedField<string[]>;
  address: VerifiedField;
  coordinates: VerifiedField<{ lat: number; lng: number }>;
  phone: VerifiedField;
  email: VerifiedField;
  contactFormUrl: VerifiedField;
  hours: VerifiedField;
  pricing: VerifiedField;
  parking: VerifiedField;
  accessibility: VerifiedField;
  ageRestrictions: VerifiedField;
  reservationsRequired: VerifiedField<boolean>;
  bestVisitTiming: VerifiedField;
  busyPeriods: VerifiedField;
  signatureProducts: VerifiedField<string[]>;
  filmingOpportunities: VerifiedField<string[]>;
  indoorOutdoor: VerifiedField;
  filmingPolicy: VerifiedField;
  permissionAdvised: VerifiedField<boolean>;
  kellieCoveredBefore: VerifiedField<boolean>;
  similarContentPerformance: VerifiedField;
  sourceFreshness: VerifiedField;
  needsVerification: string[];
  researchSummary: string | null;
  citations: Array<{ url: string; title: string | null }>;
};

export type CreatorAssistancePackage = {
  whyItMayFit: {
    audienceConnection: string;
    novelty: string;
    visualPotential: string;
    viewerValue: string;
    productionBurden: string;
  };
  contentOptions: string[];
  visitPlan: {
    suggestedTiming: string;
    address: string | null;
    mapUrl: string | null;
    parkingNotes: string | null;
    filmingRequirements: string;
    shotList: string[];
    questionsToAsk: string[];
    verifyBeforeLeaving: string[];
    weatherDependent: boolean;
  };
  contentPackage: {
    recommendedFormat: string;
    openingHook: string;
    hookOptions?: string[];
    talkingPoints: string[];
    shotList: string[];
    caption: string;
    callToAction: string;
    sourceAttribution: string;
    disclosure: string | null;
    searchPhrases?: string[];
    hashtags?: string[];
    unknowns?: string[];
    verificationQuestions?: string[];
  };
  businessAction: {
    contactChannel: string | null;
    outreachRecommendation: string;
    draftOutreach: string | null;
    visitNormallyInstead: boolean;
  };
  generatedAt: string;
};

export type DiscoveryRecordView = {
  contentItemId: string;
  sourceId: string | null;
  sourceTitle: string | null;
  normalizedEntityName: string;
  entityType: string | null;
  sourceUrl: string | null;
  processingStatus: string;
  creatorRelevanceStatus: string;
  lifecycleStatus: string;
  enrichmentComplete: boolean;
  interest: {
    id: string;
    interestLevel: string;
    enrichmentStatus: string;
    nextAction: string | null;
    researchJobId: string | null;
  } | null;
  researchJob: {
    id: string;
    status: string;
    errorMessage: string | null;
    retryCount: number;
  } | null;
  enrichment: Partial<BusinessEnrichment> | null;
  assistancePackage: CreatorAssistancePackage | null;
  title: string;
  summary: string | null;
  locationName: string | null;
  category: string | null;
  metadata: Record<string, unknown>;
};
