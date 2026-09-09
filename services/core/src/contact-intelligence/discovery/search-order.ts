/**
 * Structured official-contact discovery search order for Kansas City partnership
 * research. Pure policy — no network, no database.
 *
 * Research walks these steps in order and stops when a legitimate route is found.
 * Later steps are fallbacks, never upgrades of earlier evidence. Step 9 is the
 * honest floor: monitor-only when nothing publishable exists.
 */

export const CONTACT_DISCOVERY_STEPS = [
  {
    step: 1,
    id: 'official_media_press',
    label: 'Official media or press page',
    description:
      'Named media/press contacts or media@ / press@ inboxes published on the organization\'s own site.',
  },
  {
    step: 2,
    id: 'marketing_comms_directory',
    label: 'Official marketing or communications staff directory',
    description:
      'Published marketing, communications, or PR staff listings with roles on an official page.',
  },
  {
    step: 3,
    id: 'creator_influencer_program',
    label: 'Official creator/influencer program',
    description:
      'First-party creator, influencer, or UGC application pages the organization itself publishes.',
  },
  {
    step: 4,
    id: 'affiliate_program',
    label: 'Official affiliate program',
    description:
      'Published affiliate or partner-commission programs with explicit terms on an official page.',
  },
  {
    step: 5,
    id: 'partnership_sponsorship',
    label: 'Official partnership or sponsorship page',
    description:
      'Partnerships, collaborations, or sponsorship contact routes published by the organization.',
  },
  {
    step: 6,
    id: 'official_contact_form',
    label: 'Official contact form (correct department)',
    description:
      'Web forms aimed at media, partnerships, or creator requests — not general sales or careers forms.',
  },
  {
    step: 7,
    id: 'association_tourism_intro',
    label: 'Association or tourism-board introduction',
    description:
      'Visit KC, state tourism, chambers, or trade associations that can introduce a creator to a member.',
  },
  {
    step: 8,
    id: 'general_business_contact',
    label: 'General business contact (labeled fallback)',
    description:
      'info@ / hello@ / front-desk routes, clearly labeled as general — never presented as a PR contact.',
  },
  {
    step: 9,
    id: 'monitor_only',
    label: 'Monitor-only when no route',
    description:
      'No legitimate published route. Stay monitor-only; do not invent contacts or infer emails.',
  },
] as const;

export type ContactDiscoveryStepId = (typeof CONTACT_DISCOVERY_STEPS)[number]['id'];

export type ContactDiscoveryStep = (typeof CONTACT_DISCOVERY_STEPS)[number];

/** Kansas City metro categories discovery should cover when researching. */
export const KC_METRO_DISCOVERY_CATEGORIES = [
  'tourism',
  'hotels',
  'restaurants_groups',
  'attractions',
  'museums',
  'venues',
  'sports',
  'shopping_entertainment',
  'event_venues',
  'local_products',
  'black_owned',
  'creator_programs',
  'affiliate',
  'media_ticket_credential',
  'hosted_visit',
  'pr_agencies_local',
] as const;

export type KcMetroDiscoveryCategory = (typeof KC_METRO_DISCOVERY_CATEGORIES)[number];

const CATEGORY_LABELS: Record<KcMetroDiscoveryCategory, string> = {
  tourism: 'Tourism organizations',
  hotels: 'Hotels and resorts',
  restaurants_groups: 'Restaurants and restaurant groups',
  attractions: 'Attractions',
  museums: 'Museums',
  venues: 'Performance venues',
  sports: 'Sports organizations',
  shopping_entertainment: 'Shopping and entertainment districts',
  event_venues: 'Event venues',
  local_products: 'Local product companies',
  black_owned: 'Black-owned businesses',
  creator_programs: 'Creator and influencer programs',
  affiliate: 'Affiliate programs',
  media_ticket_credential: 'Media-ticket and credential programs',
  hosted_visit: 'Hosted-visit programs',
  pr_agencies_local: 'PR agencies representing local establishments',
};

export function kcMetroCategoryLabel(category: KcMetroDiscoveryCategory): string {
  return CATEGORY_LABELS[category];
}

export function isKcMetroDiscoveryCategory(value: unknown): value is KcMetroDiscoveryCategory {
  return (
    typeof value === 'string' &&
    (KC_METRO_DISCOVERY_CATEGORIES as readonly string[]).includes(value)
  );
}

/** Steps in ascending order (1 → 9). */
export function orderedDiscoverySteps(): readonly ContactDiscoveryStep[] {
  return CONTACT_DISCOVERY_STEPS;
}

export function discoveryStepById(id: ContactDiscoveryStepId): ContactDiscoveryStep {
  const step = CONTACT_DISCOVERY_STEPS.find((entry) => entry.id === id);
  if (!step) throw new Error(`Unknown discovery step: ${id}`);
  return step;
}

/**
 * Whether a later step may replace an earlier finding. Never — discovery only
 * fills gaps; it does not silently demote stronger official routes.
 */
export function mayReplaceDiscoveryStep(
  current: ContactDiscoveryStepId | null,
  candidate: ContactDiscoveryStepId,
): boolean {
  if (!current) return candidate !== 'monitor_only';
  if (current === 'monitor_only') return candidate !== 'monitor_only';
  const currentRank = discoveryStepById(current).step;
  const candidateRank = discoveryStepById(candidate).step;
  // Only accept an equal-or-better (lower number) route; never replace media with info@.
  return candidateRank < currentRank;
}

/**
 * Maps a found route kind onto the search-order step it satisfies.
 * Used when classifying a page or published contact during research.
 */
export function classifyRouteOntoSearchStep(input: {
  routeKind:
    | 'media_press'
    | 'staff_directory'
    | 'creator_program'
    | 'affiliate_program'
    | 'partnership_page'
    | 'contact_form'
    | 'tourism_association'
    | 'general_inbox'
    | 'none';
}): ContactDiscoveryStepId {
  switch (input.routeKind) {
    case 'media_press':
      return 'official_media_press';
    case 'staff_directory':
      return 'marketing_comms_directory';
    case 'creator_program':
      return 'creator_influencer_program';
    case 'affiliate_program':
      return 'affiliate_program';
    case 'partnership_page':
      return 'partnership_sponsorship';
    case 'contact_form':
      return 'official_contact_form';
    case 'tourism_association':
      return 'association_tourism_intro';
    case 'general_inbox':
      return 'general_business_contact';
    case 'none':
      return 'monitor_only';
  }
}
