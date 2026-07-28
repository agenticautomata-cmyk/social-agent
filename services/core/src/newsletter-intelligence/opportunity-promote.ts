import type { ExtractedNewsletterItem } from './types.js';
import type { LocationOutcome } from './location-resolve.js';

export type ProposedDestination =
  | 'inventory_only'
  | 'opportunity'
  | 'calendar_suggestion'
  | 'verification_queue'
  | 'quarantine'
  | 'expired';

export type OpportunityScoreKind =
  | 'place_discovery'
  | 'retail_discovery'
  | 'restaurant_discovery'
  | 'dated_event'
  | 'promotion'
  | 'opening_closing'
  | 'filming_angle'
  | 'collaboration_lead'
  | 'local_experience';

export type OpportunityScore = {
  eligible: boolean;
  kinds: OpportunityScoreKind[];
  score: number;
  reasons: string[];
};

const OPENING_CLOSING =
  /\b(?:grand opening|soft opening|now open|reopening|re-opening|closing (?:sale|soon)|going out of business|liquidation)\b/i;
const MEANINGFUL_SALE =
  /\b(?:warehouse sale|sample sale|anniversary sale|friends?\s*&\s*family|sidewalk sale|garage sale|popup sale|pop[- ]?up)\b/i;
const FILMING =
  /\b(?:mural|rooftop|neon|vintage|aesthetic|photogenic|backdrop|set piece|filming|photo[- ]?worthy|instagrammable)\b/i;
const EXPERIENCE =
  /\b(?:tasting|workshop|class|tour|experience|happy hour|brunch|dinner|live music|trivia|karaoke|market|festival)\b/i;
const COLLAB =
  /\b(?:collab|collaboration|creator|influencer|partnership|hosted by|guest chef|takeover)\b/i;
const UNIQUE_RETAIL =
  /\b(?:boutique|thrift|vintage|consignment|record store|bookstore|florist|gallery|makers?\b|handmade|local shop)\b/i;

export function scoreOpportunityCandidate(input: {
  entityName: string;
  title: string;
  layer: 'entity' | 'occurrence';
  entityType: string;
  occurrenceType: string | null;
  date: string | null;
  location: string | null;
  locationOutcome: LocationOutcome;
  description?: string | null;
}): OpportunityScore {
  const blob = `${input.entityName} ${input.title} ${input.description ?? ''}`;
  const kinds: OpportunityScoreKind[] = [];
  const reasons: string[] = [];
  let score = 0;

  const isNationalBlocked = input.locationOutcome === 'national_no_local_proof';
  if (isNationalBlocked) {
    return { eligible: false, kinds: [], score: 0, reasons: ['national_no_local_proof'] };
  }

  const localGeo =
    input.locationOutcome === 'exact_kc_metro' ||
    input.locationOutcome === 'kc_metro_branch_unresolved' ||
    input.locationOutcome === 'virtual_not_applicable' ||
    Boolean(input.location);

  if (!localGeo && input.locationOutcome === 'out_of_market') {
    return { eligible: false, kinds: [], score: 0, reasons: ['out_of_market'] };
  }

  const isRestaurant =
    input.entityType === 'restaurant' ||
    input.entityType === 'bar' ||
    /\b(?:restaurant|cafe|coffee|bbq|bakery|diner|bistro|brewery|taproom)\b/i.test(blob);
  const isRetail =
    input.entityType === 'retailer' ||
    input.entityType === 'store' ||
    input.entityType === 'shopping_center' ||
    UNIQUE_RETAIL.test(blob);
  const isPlace =
    input.entityType === 'attraction' ||
    input.entityType === 'event_venue' ||
    input.entityType === 'market' ||
    input.entityType === 'local_business';

  if (isRestaurant && localGeo) {
    kinds.push('restaurant_discovery');
    score += 3;
    reasons.push('local_restaurant');
  }
  if (isRetail && localGeo && !isNationalBlocked) {
    kinds.push('retail_discovery');
    score += UNIQUE_RETAIL.test(blob) ? 3 : 2;
    reasons.push('local_retail');
  }
  if (isPlace && localGeo) {
    kinds.push('place_discovery');
    score += 2;
    reasons.push('local_place');
  }
  if (input.date) {
    kinds.push('dated_event');
    score += 3;
    reasons.push('dated_occurrence');
  }
  if (OPENING_CLOSING.test(blob) || input.occurrenceType === 'opening' || input.occurrenceType === 'grand_opening' || input.occurrenceType === 'closing') {
    kinds.push('opening_closing');
    score += 4;
    reasons.push('opening_or_closing');
  }
  if (MEANINGFUL_SALE.test(blob) || (input.occurrenceType === 'sale' && localGeo)) {
    kinds.push('promotion');
    score += 2;
    reasons.push('meaningful_local_promotion');
  }
  if (FILMING.test(blob)) {
    kinds.push('filming_angle');
    score += 3;
    reasons.push('filming_worthy');
  }
  if (EXPERIENCE.test(blob)) {
    kinds.push('local_experience');
    score += 2;
    reasons.push('local_experience');
  }
  if (COLLAB.test(blob)) {
    kinds.push('collaboration_lead');
    score += 3;
    reasons.push('creator_collab_signal');
  }

  // Weak generic entities without local proof stay inventory-only.
  if (kinds.length === 0) {
    return { eligible: false, kinds: [], score: 0, reasons: ['no_creator_signal'] };
  }
  if (!localGeo && !input.date) {
    return { eligible: false, kinds, score, reasons: [...reasons, 'insufficient_local_or_dated_signal'] };
  }

  return {
    eligible: score >= 2,
    kinds: [...new Set(kinds)],
    score,
    reasons,
  };
}

export function needsVerificationGate(input: {
  entityName: string;
  title: string;
  layer: 'entity' | 'occurrence';
  locationOutcome: LocationOutcome;
  location: string | null;
  date: string | null;
  verificationStatus: string;
  confidence: number;
}): { needed: boolean; reason: string | null } {
  if (/^(newsletter|this week|events?|deals?|click here)$/i.test(input.title.trim())) {
    return { needed: true, reason: 'weak_entity_identity' };
  }
  if (input.entityName.trim().length < 3) {
    return { needed: true, reason: 'weak_entity_identity' };
  }
  if (input.locationOutcome === 'national_no_local_proof') {
    return { needed: true, reason: 'national_local_ambiguity' };
  }
  if (
    input.layer === 'occurrence' &&
    input.date &&
    !input.location &&
    input.locationOutcome !== 'virtual_not_applicable'
  ) {
    return { needed: true, reason: 'missing_date_time_or_location' };
  }
  if (input.locationOutcome === 'location_unknown' && input.confidence < 0.55) {
    return { needed: true, reason: 'conflicting_or_unknown_location' };
  }
  // Official / trusted secondary can skip verification for promotion.
  if (
    input.verificationStatus.startsWith('official_') ||
    input.verificationStatus === 'trusted_secondary_source'
  ) {
    return { needed: false, reason: null };
  }
  // newsletter_only is OK for opportunity promotion; do not blanket-queue.
  return { needed: false, reason: null };
}

export function chooseDestination(input: {
  calendarOk: boolean;
  verificationNeeded: boolean;
  verificationReason: string | null;
  opportunity: OpportunityScore;
  layer: 'entity' | 'occurrence';
  hasDate: boolean;
}): { destination: ProposedDestination; opportunityKinds: OpportunityScoreKind[] } {
  if (input.calendarOk) {
    return { destination: 'calendar_suggestion', opportunityKinds: input.opportunity.kinds };
  }
  if (input.verificationNeeded) {
    return { destination: 'verification_queue', opportunityKinds: [] };
  }
  if (input.opportunity.eligible) {
    return { destination: 'opportunity', opportunityKinds: input.opportunity.kinds };
  }
  return { destination: 'inventory_only', opportunityKinds: [] };
}

/** Reclassify a cached proposed record without re-running OCR/LLM. */
export function reclassifyCachedProposedRecord(sample: {
  entityName: string;
  title: string;
  layer: 'entity' | 'occurrence';
  entityType: string;
  occurrenceType: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  locationOutcome: LocationOutcome;
  verificationStatus: string;
  confidence: number;
  whyPassed?: string;
}): {
  destination: ProposedDestination;
  opportunityKinds: OpportunityScoreKind[];
  opportunityScore: number;
  verificationReason: string | null;
} {
  const opportunity = scoreOpportunityCandidate({
    entityName: sample.entityName,
    title: sample.title,
    layer: sample.layer,
    entityType: sample.entityType,
    occurrenceType: sample.occurrenceType,
    date: sample.date,
    location: sample.location,
    locationOutcome: sample.locationOutcome,
  });
  const verification = needsVerificationGate({
    entityName: sample.entityName,
    title: sample.title,
    layer: sample.layer,
    locationOutcome: sample.locationOutcome,
    location: sample.location,
    date: sample.date,
    verificationStatus: sample.verificationStatus,
    confidence: sample.confidence,
  });

  // Calendar eligibility from cached fields (mirror quality-gates.calendarEligible essentials).
  const calendarOk =
    sample.layer === 'occurrence' &&
    Boolean(sample.date) &&
    sample.occurrenceType !== 'sale' &&
    sample.occurrenceType !== 'product_release' &&
    sample.locationOutcome !== 'national_no_local_proof' &&
    (sample.verificationStatus.startsWith('official_') ||
      sample.verificationStatus === 'trusted_secondary_source') &&
    (sample.locationOutcome === 'exact_kc_metro' ||
      sample.locationOutcome === 'virtual_not_applicable') &&
    Boolean(sample.location) &&
    Date.parse(sample.date!) >= Date.now() - 86400000;

  const chosen = chooseDestination({
    calendarOk,
    verificationNeeded: verification.needed,
    verificationReason: verification.reason,
    opportunity,
    layer: sample.layer,
    hasDate: Boolean(sample.date),
  });

  return {
    destination: chosen.destination,
    opportunityKinds: chosen.opportunityKinds,
    opportunityScore: opportunity.score,
    verificationReason: verification.reason,
  };
}
