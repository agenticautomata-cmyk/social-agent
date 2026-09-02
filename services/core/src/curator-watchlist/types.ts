import type { CapturedCarouselItem, InstagramPostMediaType } from './instagram-intake-types.js';

export type CuratorVerificationStatus =
  | 'SOCIAL_LEAD'
  | 'PARTIALLY_VERIFIED'
  | 'VERIFIED'
  | 'CONFLICTED'
  | 'EXPIRED';

export type CuratorCreatorRecommendation =
  | 'visit_in_person'
  | 'green_screen_home'
  | 'green_screen_then_visit'
  | 'weekend_roundup'
  | 'track_only'
  | 'ignore';

export type CuratorPostType = 'carousel' | 'single' | 'reel' | 'story' | 'highlight' | 'unknown';

export type CapturedSocialPost = {
  postUrl: string;
  profileHandle: string;
  publishedAt: string | null;
  caption: string | null;
  postType: CuratorPostType;
  sourceFingerprint: string;
  outboundLinks: string[];
  ephemeralSource: boolean;
  slideImageUrls: string[];
  mediaItems?: CapturedCarouselItem[];
  mediaType?: InstagramPostMediaType;
};

export type ParsedRoundupEvent = {
  eventName: string;
  eventDate: string | null;
  eventTime: string | null;
  venue: string | null;
  neighborhood: string | null;
  price: string | null;
  ageRestriction: string | null;
  registrationNotes: string | null;
  dayHeading: string | null;
  originalQuotedText: string;
  slideNumber: number;
};

export type EventResearchResult = {
  verificationStatus: CuratorVerificationStatus;
  officialOrganizerUrl: string | null;
  officialVenueUrl: string | null;
  ticketUrl: string | null;
  officialSocialUrl: string | null;
  verifiedDate: string | null;
  verifiedTime: string | null;
  verifiedVenue: string | null;
  verifiedAddress: string | null;
  verifiedCost: string | null;
  verifiedAgeRestriction: string | null;
  parkingInfo: string | null;
  filmingNotes: string | null;
  cancellationNotes: string | null;
  contactInfo: string | null;
  conflicts: string[];
  summary: string | null;
  citations: Array<{ url: string; title: string | null }>;
};

export type CreatorValueAssessment = {
  recommendation: CuratorCreatorRecommendation;
  score: number;
  explanation: Record<string, unknown>;
};

export type CuratorPipelineResult = {
  ok: boolean;
  postsProcessed: number;
  slidesProcessed: number;
  eventsExtracted: number;
  eventsVerified: number;
  eventsPartiallyVerified: number;
  eventsConflicted: number;
  eventsExpired: number;
  duplicatesSkipped: number;
  newPosts: number;
  error?: string;
  pausedForAuth?: boolean;
  inspectionSummary?: string;
  postsDiscovered?: number;
  alreadyKnown?: number;
  newlyInspected?: number;
  captureFailed?: number;
};

export type CuratorLeadView = {
  id: string;
  eventName: string;
  eventDate: string | null;
  eventTime: string | null;
  venue: string | null;
  neighborhood: string | null;
  verificationStatus: CuratorVerificationStatus;
  discoveredViaHandle: string;
  discoveredViaPostUrl: string;
  discoveredViaSlideNumber: number | null;
  creatorRecommendation: CuratorCreatorRecommendation | null;
  creatorValueScore: number | null;
  creatorValueExplanation: Record<string, unknown>;
  officialOrganizerUrl: string | null;
  ticketUrl: string | null;
  linkedEarlySignalId: string | null;
  dismissedAt: string | null;
};

export type CuratorSourceHealth = {
  watcherId: string;
  profileHandle: string;
  healthStatus: string;
  sessionStatus: string | null;
  lastSuccessfulCheck: string | null;
  lastNewPost: string | null;
  postsProcessed: number;
  eventsExtracted: number;
  verifiedYield: number;
  noiseRate: number | null;
  reliabilityScore: number | null;
  lastAttemptedCheck: string | null;
  lastFailureAt: string | null;
  lastFailureMessage: string | null;
  nextCheckEstimate: string | null;
  /** Honest label — "Next scheduled check" only when the scheduler worker is live. */
  nextCheckLabel: string;
  schedulerLive: boolean;
  paused: boolean;
  authenticationRequired: boolean;
  checkFrequencyHours: number;
  displayHealth: string;
};
