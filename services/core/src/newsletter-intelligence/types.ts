export const NEWSLETTER_CATEGORIES = [
  'local_newsletter',
  'restaurant_newsletter',
  'retail_newsletter',
  'venue_event_newsletter',
  'tourism_community_roundup',
  'chamber_business_newsletter',
  'shopping_center_newsletter',
  'creator_curator_roundup',
  'transactional_email',
  'personal_email',
  'spam_noise',
] as const;

export type NewsletterCategory = (typeof NEWSLETTER_CATEGORIES)[number];

export const PROCESSABLE_NEWSLETTER_CATEGORIES: NewsletterCategory[] = [
  'local_newsletter',
  'restaurant_newsletter',
  'retail_newsletter',
  'venue_event_newsletter',
  'tourism_community_roundup',
  'chamber_business_newsletter',
  'shopping_center_newsletter',
  'creator_curator_roundup',
];

export type VerificationStatus =
  | 'official_sender'
  | 'official_business'
  | 'official_venue'
  | 'official_organizer'
  | 'official_ticket_provider'
  | 'trusted_secondary_source'
  | 'newsletter_only'
  | 'unverified'
  | 'conflicted'
  | 'expired'
  // Legacy aliases normalized at ingest boundaries
  | 'official'
  | 'verified'
  | 'partially_verified';

export type LocationOutcome =
  | 'exact_kc_metro'
  | 'kc_metro_branch_unresolved'
  | 'national_no_local_proof'
  | 'out_of_market'
  | 'location_unknown'
  | 'virtual_not_applicable';

export type InventoryStatus =
  | 'unreviewed'
  | 'suggested'
  | 'verified'
  | 'partially_verified'
  | 'conflicted'
  | 'expired'
  | 'cancelled'
  | 'dismissed'
  | 'suppressed';

export type EntityType =
  | 'restaurant'
  | 'bar'
  | 'retailer'
  | 'store'
  | 'shopping_center'
  | 'event_venue'
  | 'attraction'
  | 'organizer'
  | 'festival'
  | 'market'
  | 'local_business';

export type OccurrenceType =
  | 'opening'
  | 'closing'
  | 'grand_opening'
  | 'pop_up'
  | 'happy_hour'
  | 'tasting'
  | 'chef_dinner'
  | 'menu_launch'
  | 'sale'
  | 'clearance'
  | 'product_release'
  | 'workshop'
  | 'concert'
  | 'festival'
  | 'market'
  | 'appearance'
  | 'registration_deadline'
  | 'ticket_sale'
  | 'recurring_event'
  | 'general_event';

export type ExtractedNewsletterItem = {
  entityName: string;
  entityType: EntityType;
  occurrenceType: OccurrenceType | null;
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  timezone: string | null;
  venue: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  neighborhood: string | null;
  price: string | null;
  isFree: boolean | null;
  ageRestriction: string | null;
  rsvpRequired: boolean | null;
  reservationLink: string | null;
  ticketLink: string | null;
  officialWebsite: string | null;
  officialSocialLink: string | null;
  phone: string | null;
  organizer: string | null;
  sourceUrl: string | null;
  confidence: number;
  layer: 'entity' | 'occurrence';
};

export type NewsletterParseContext = {
  gmailMessageId: string;
  gmailThreadId: string;
  senderEmail: string | null;
  senderName: string | null;
  senderDomain: string;
  subject: string;
  receivedAt: Date;
  bodyText: string;
  bodyHtml: string;
  urls: string[];
  newsletterSourceId: string | null;
  newsletterSourceName: string | null;
  newsletterCategory: NewsletterCategory;
  discoveryEmailMessageId: string;
  discoverySubscriptionId: string | null;
  isOfficialSender: boolean;
};

export type NewsletterParseResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  processingStatus: 'processed' | 'duplicate' | 'skipped';
  entitiesCreated: number;
  entitiesUpdated: number;
  occurrencesCreated: number;
  occurrencesUpdated: number;
  datedOccurrencesCreated: number;
  datedOccurrenceDuplicates: number;
  quarantined: number;
  duplicatesMerged: number;
  contentItemIds: string[];
  needsOcr: boolean;
  needsVerification: number;
};

export type NewsletterBackfillReport = {
  emailsScanned: number;
  relevantNewsletters: number;
  ignoredTransactional: number;
  ignoredPersonal: number;
  entitiesFound: number;
  restaurantEntities: number;
  retailEntities: number;
  eventEntities: number;
  occurrencesExtracted: number;
  datedOccurrences: number;
  locationsExtracted: number;
  officialLinksFound: number;
  duplicatesMerged: number;
  expiredItems: number;
  conflictedItems: number;
  needsOcr: number;
  needsVerification: number;
  recordsCreated: number;
  recordsUpdated: number;
  unchangedRerun: number;
  errors: string[];
};
