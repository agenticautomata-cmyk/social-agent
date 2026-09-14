/**
 * Editorial-intelligence opportunity types for monitored emails / newsletters /
 * publicly accessible linked articles. No brand/domain hard-coding.
 */

export const EDITORIAL_CONTENT_TYPES = [
  'calendar_event',
  'creator_business_opportunity',
  'editorial_lead',
  'hospitality_opportunity',
  'affiliate_opportunity',
  'pr_contact_lead',
  'business_opening_development',
  'promotion_offer',
  'news_only',
  'past_recap',
  'irrelevant',
  'blocked_unavailable',
] as const;

export type EditorialContentType = (typeof EDITORIAL_CONTENT_TYPES)[number];

export const EDITORIAL_DEVELOPMENT_TYPES = [
  'new_retail_opening',
  'first_to_market',
  'new_location',
  'expansion',
  'relocation',
  'reopening',
  'renovation',
  'grand_opening',
  'soft_opening',
  'coming_soon',
  'restaurant_launch',
  'hotel_opening',
  'attraction_opening',
  'new_menu',
  'new_product',
  'new_service',
  'new_ownership',
  'new_concept',
  'development_announcement',
  'tenant_announcement',
  'construction_completion',
  'local_brand_launch',
  'milestone',
  'creator_press_preview',
  'media_event',
  'collaboration_affiliate',
  'business_opening',
] as const;

export type EditorialDevelopmentType = (typeof EDITORIAL_DEVELOPMENT_TYPES)[number];

export const EDITORIAL_URGENCY_STATES = [
  'urgent',
  'timely',
  'evergreen',
  'stale',
  'closed',
  'needs_research',
] as const;

export type EditorialUrgency = (typeof EDITORIAL_URGENCY_STATES)[number];

export const CONTACT_DISCOVERY_STATUSES = [
  'not_started',
  'in_progress',
  'none_found',
  'contact_found_unverified',
  'contact_verified',
  'blocked',
] as const;

export type ContactDiscoveryStatus = (typeof CONTACT_DISCOVERY_STATUSES)[number];

export type ArticleAccessStatus =
  | 'not_attempted'
  | 'fetched'
  | 'blocked'
  | 'subscription_required'
  | 'robots_disallowed'
  | 'fetch_failed'
  | 'email_evidence_only';

export type EditorialEvidence = {
  excerpt: string;
  source: 'email' | 'article';
  field?: string;
};

export type EditorialOpportunityCandidate = {
  businessName: string;
  developmentType: EditorialDevelopmentType;
  contentType: EditorialContentType;
  summary: string;
  location: string | null;
  address: string | null;
  market: string | null;
  openingOrAnnouncementDate: string | null;
  canonicalArticleUrl: string | null;
  emailSource: string | null;
  publicationDate: string | null;
  evidence: EditorialEvidence[];
  whyItMatters: string;
  suggestedAngles: string[];
  suggestedNextAction: string;
  urgency: EditorialUrgency;
  confidence: number;
  verificationState: 'email_supported' | 'article_supported' | 'unverified' | 'conflicted';
  contactDiscoveryStatus: ContactDiscoveryStatus;
  dedupeIdentity: string;
  articleAccess: ArticleAccessStatus;
  calendarEligible: false;
  autoOutreach: false;
};

export type EditorialArticleFetchResult = {
  url: string;
  canonicalUrl: string | null;
  access: ArticleAccessStatus;
  headline: string | null;
  author: string | null;
  publicationDate: string | null;
  text: string | null;
  blockedReason: string | null;
};

export type EditorialOpportunityPersistResult = {
  contentItemId: string;
  created: boolean;
  duplicateMerged: boolean;
  telegramSent: boolean;
  candidate: EditorialOpportunityCandidate;
};

export type EditorialOpportunityRunResult = {
  runId: string;
  gmailMessageId: string;
  discoveryEmailMessageId: string | null;
  opportunitiesCreated: number;
  opportunitiesMerged: number;
  opportunitiesRejected: number;
  articleAccess: ArticleAccessStatus;
  contentItemIds: string[];
  telegramNotifiedIds: string[];
  candidates: EditorialOpportunityCandidate[];
  rejected: Array<{ reason: string; detail?: string }>;
};
