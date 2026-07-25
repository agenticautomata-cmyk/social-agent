export const CONTENT_ANGLE_FAMILIES = [
  'new_opening_first_look',
  'before_you_go_kc',
  'price_or_value_breakdown',
  'hidden_gem',
  'thrift_or_shopping_discovery',
  'style_or_outfit_challenge',
  'product_test',
  'weekend_plans',
  'girls_night',
  'grown_woman_experience',
  'family_granddaughter_activity',
  'free_or_low_cost_kc',
  'behind_the_scenes',
  'owner_or_founder_story',
  'black_owned_business_spotlight',
  'local_business_discovery',
  'closing_or_liquidation_update',
  'comparison_worth_it',
  'giveaway_or_community_activation',
  'hotel_staycation',
  'date_night',
  'no_valid_angle',
] as const;

export type ContentAngleFamily = (typeof CONTENT_ANGLE_FAMILIES)[number];

export type RecordEntityType =
  | 'business'
  | 'event'
  | 'article'
  | 'promotion'
  | 'person'
  | 'malformed'
  | 'unknown';

import type { InventoryFlags } from '../inventory/normalize.js';

export type AngleMatchInput = {
  title: string;
  summary?: string | null;
  category?: string | null;
  sourceType?: string | null;
  businessName?: string | null;
  venue?: string | null;
  flags?: Partial<InventoryFlags>;
};

export type AngleMatchResult = {
  family: ContentAngleFamily;
  pitchAngle: string;
  contentAngle: string;
  sponsorshipAsk: string;
  templateType: string;
  explanation: string[];
  valid: boolean;
  entityType: RecordEntityType;
  luxuryEvidence: boolean;
  dateNightEligible: boolean;
};

export type DraftAngleAudit = {
  emailId: string;
  businessName: string;
  subject: string;
  usesDateNightLanguage: boolean;
  usesLuxuryDateNightLanguage: boolean;
  dateNightValid: boolean;
  misclassified: boolean;
  duplicate: boolean;
  noDefensibleAngle: boolean;
  recommendedAction: 'keep' | 'archive' | 'regenerate';
  detectedFamily: ContentAngleFamily | null;
};
