import type { NewContentItem } from '../schema.js';
import { instagramHandleFromUrl } from './instagram-intake.js';
import { slugify } from './listing-extract.js';
import type { ResolvedUrlEntity } from './qualify-url-opportunity.js';
import { matchesLocationScope } from './url-geo.js';

export type UrlIntakeOutcome =
  | 'ENTITY_ACCEPTED_CLAIMS_ACCEPTED'
  | 'ENTITY_ACCEPTED_CLAIMS_QUARANTINED'
  | 'ENTITY_ACCEPTED_NO_CURRENT_CLAIMS'
  | 'ENTITY_REJECTED'
  | 'NO_SUPPORTED_ENTITY'
  | 'ENTITY_PENDING_LOCATION';

/** Minimum non-whitespace characters required before URL intake may create/mutate a durable entity. */
export const MIN_USABLE_EXTRACTED_CHARS = 40;

const GENERIC_PAGE_TITLES =
  /^(home|welcome|index|default|untitled|page not found|404|login|sign in|events|calendar)$/i;

const NEWS_HEADLINE_MARKERS =
  /\b(unveils|welcomes|announces|workers|with open arms|breaking|op-ed|opinion)\b/i;

const NAME_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'this',
  'that',
  'www',
  'com',
  'org',
  'net',
  'new',
  'city',
  'kansas',
  'missouri',
  'events',
  'event',
  'page',
  'home',
  'official',
  'website',
]);

const DOMAIN_BUSINESS_NAMES: Record<string, string> = {
  'halfofhalf.com': 'Half of Half',
  'silkroadkc.com': 'Silk Road',
};

export function hasUsableExtractedContent(text: string | null | undefined): boolean {
  if (!text) return false;
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length >= MIN_USABLE_EXTRACTED_CHARS;
}

export function userExplicitlyAskedToResearchUrl(message: string | null | undefined): boolean {
  if (!message?.trim()) return false;
  return /\b(research|verify|look\s*up|dig\s*into|find\s+out\s+more|web\s*search|investigate)\b/i.test(
    message,
  );
}

function registrableLabel(hostnameOrDomain: string): string {
  const host = hostnameOrDomain.replace(/^www\./i, '').toLowerCase();
  const parts = host.split('.').filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2]!;
  return parts[0] ?? host;
}

function brandTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !NAME_STOPWORDS.has(t));
}

function domainDerivedDisplayName(domain: string): string {
  const base = registrableLabel(domain).replace(/-/g, ' ').trim();
  if (!base) return domain;
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

function nameSupportedByPageText(name: string, pageText: string): boolean {
  const text = pageText.toLowerCase();
  const tokens = brandTokens(name).filter((t) => t.length >= 4);
  if (tokens.length === 0) return false;
  const hits = tokens.filter((t) => text.includes(t)).length;
  return hits >= Math.min(2, tokens.length) || (tokens.length === 1 && hits === 1);
}

export function isNameConsistentWithHost(name: string, domain: string): boolean {
  const normalizedDomain = domain.replace(/^www\./i, '').toLowerCase();
  if (DOMAIN_BUSINESS_NAMES[normalizedDomain]) {
    return brandTokens(name).some((t) =>
      brandTokens(DOMAIN_BUSINESS_NAMES[normalizedDomain]!).includes(t),
    );
  }

  const label = registrableLabel(normalizedDomain);
  const compactLabel = label.replace(/-/g, '');
  const compactName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (compactLabel.length >= 3 && compactName.includes(compactLabel)) return true;

  const labelTokens = brandTokens(label.replace(/-/g, ' '));
  const nameTokens = brandTokens(name);
  if (labelTokens.some((t) => nameTokens.includes(t) || compactName.includes(t))) return true;

  return false;
}

/**
 * Require host / title / content / entity-name coherence before durable entity accept.
 * Prevents empty or unrelated web-search titles (e.g. news headlines) from becoming entities
 * for a different registrable domain such as theosc.co.
 */
export function entityConsistentWithUrlEvidence(input: {
  pageUrl: string;
  businessName: string;
  pageTitle?: string | null;
  pageText?: string | null;
  /** When true, text may be web-search synthesis — require host/name coherence, not circular title-in-text. */
  fromWebSearchFallback?: boolean;
}): { ok: boolean; reason?: string } {
  if (!hasUsableExtractedContent(input.pageText)) {
    return {
      ok: false,
      reason: 'No usable extracted content to support an entity from this URL.',
    };
  }

  let host = '';
  try {
    host = new URL(input.pageUrl).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return { ok: false, reason: 'Invalid URL.' };
  }

  if (DOMAIN_BUSINESS_NAMES[host]) return { ok: true };

  const name = input.businessName.trim();
  const title = (input.pageTitle ?? '').trim();
  const hostOk = isNameConsistentWithHost(name, host);
  const titleHostOk = title ? isNameConsistentWithHost(title, host) : false;
  const nameInText = nameSupportedByPageText(name, input.pageText ?? '');

  if (
    (NEWS_HEADLINE_MARKERS.test(name) || (title.length > 0 && NEWS_HEADLINE_MARKERS.test(title))) &&
    !hostOk &&
    !titleHostOk
  ) {
    return {
      ok: false,
      reason: 'Page title/entity name appears unrelated to the URL host.',
    };
  }

  // Web-search fallback can echo its own citation titles into "page text" — that is not
  // independent evidence. Require host coherence before accepting an entity.
  if (input.fromWebSearchFallback) {
    if (hostOk || titleHostOk) return { ok: true };
    return {
      ok: false,
      reason: 'Web research did not independently tie an entity to this URL host.',
    };
  }

  if (hostOk || nameInText) return { ok: true };

  return {
    ok: false,
    reason: 'Entity name is not supported by host or page content.',
  };
}

export function inferBusinessName(input: {
  pageTitle?: string | null;
  pageText?: string | null;
  domain: string;
  entity?: ResolvedUrlEntity | null;
  sourceUrl?: string | null;
}): string {
  const domain = input.domain.replace(/^www\./, '').toLowerCase();
  if (DOMAIN_BUSINESS_NAMES[domain]) return DOMAIN_BUSINESS_NAMES[domain]!;

  // Social domains describe the platform, not the business — use the account handle.
  if (domain === 'instagram.com') {
    const handle = instagramHandleFromUrl(input.sourceUrl ?? '');
    if (handle) return `@${handle}`;
  }

  const fromText = input.pageText?.match(/(?:½ of ½|half of half)/i);
  if (fromText) return 'Half of Half';

  const titleCandidate = input.pageTitle?.replace(/\s*[-|].*$/, '').trim();
  if (titleCandidate && !GENERIC_PAGE_TITLES.test(titleCandidate) && titleCandidate.length >= 3) {
    const titleOk =
      isNameConsistentWithHost(titleCandidate, domain) ||
      (hasUsableExtractedContent(input.pageText) &&
        nameSupportedByPageText(titleCandidate, input.pageText ?? ''));
    if (titleOk && !NEWS_HEADLINE_MARKERS.test(titleCandidate)) {
      return titleCandidate;
    }
  }

  if (
    input.entity?.businessName &&
    !GENERIC_PAGE_TITLES.test(input.entity.businessName) &&
    isNameConsistentWithHost(input.entity.businessName, domain)
  ) {
    return input.entity.businessName;
  }

  return domainDerivedDisplayName(domain) || domain;
}

export function inferEntityLocation(input: {
  locationScope?: string | null;
  pageText?: string | null;
  identifiedLocations: string[];
}): string | null {
  if (input.locationScope) {
    const scope = input.locationScope.trim();
    if (/lenexa/i.test(scope)) return 'Lenexa, Kansas';
    if (/kansas city|^kc$/i.test(scope)) return 'Kansas City, Missouri';
    if (/,/.test(scope)) return scope;
    return `${scope}, Kansas`;
  }

  const scoped = input.identifiedLocations.filter((loc) => !/tulsa|oklahoma city|st\.?\s*louis/i.test(loc));
  if (scoped.length === 1) {
    const loc = scoped[0]!;
    if (/,/.test(loc)) return loc;
    if (/lenexa/i.test(loc)) return 'Lenexa, Kansas';
    return `${loc}, Kansas`;
  }
  return null;
}

export function inferOpportunityType(pageText: string | null | undefined, businessName: string): string {
  const text = `${pageText ?? ''} ${businessName}`.toLowerCase();
  if (/half.?off|bargain|consignment|discount|clearance|name brand clothing|thrift/i.test(text)) {
    return 'shopping_bargain_discovery';
  }
  if (/restaurant|menu|dining|brunch|coffee|cafe|food|bakery/i.test(text)) {
    return 'restaurant_food_discovery';
  }
  if (/opening|grand opening|now open|coming soon/i.test(text)) {
    return 'business_opening_watcher';
  }
  if (/sale|promotion|promo|deal/i.test(text)) {
    return 'sale_promotion_watcher';
  }
  if (/attraction|museum|park|zoo|venue|entertainment/i.test(text)) {
    return 'attraction_experience';
  }
  return 'place_discovery';
}

export function formatOpportunityTypeLabel(type: string): string {
  switch (type) {
    case 'shopping_bargain_discovery':
      return 'Shopping / bargain discovery';
    case 'restaurant_food_discovery':
      return 'Restaurant / food discovery';
    case 'business_opening_watcher':
      return 'Business opening watcher';
    case 'sale_promotion_watcher':
      return 'Sale / promotion watcher';
    case 'attraction_experience':
      return 'Attraction / experience';
    default:
      return 'Place discovery';
  }
}

export function buildEntityExternalId(domain: string, locationScope?: string | null): string {
  const scopeSlug = slugify(locationScope?.trim() || 'default');
  return `ask-benson-entity-${slugify(domain.replace(/^www\./, ''))}-${scopeSlug}`;
}

export function qualifyEntityFromUrl(input: {
  pageUrl: string;
  pageText?: string | null;
  pageTitle?: string | null;
  entity: ResolvedUrlEntity;
  locationScope?: string | null;
  needsLocationConfirmation: boolean;
  businessName: string;
  fromWebSearchFallback?: boolean;
}): { accepted: boolean; pendingLocation?: boolean; rejectionReason?: string } {
  if (input.needsLocationConfirmation && !input.locationScope) {
    return { accepted: false, pendingLocation: true };
  }

  if (!input.businessName?.trim() || input.businessName.length < 2) {
    return { accepted: false, rejectionReason: 'Could not identify a canonical business from this URL.' };
  }

  try {
    const host = new URL(input.pageUrl).hostname;
    if (!host.includes('.')) {
      return { accepted: false, rejectionReason: 'Invalid URL host.' };
    }
  } catch {
    return { accepted: false, rejectionReason: 'Invalid URL.' };
  }

  if (!hasUsableExtractedContent(input.pageText)) {
    return {
      accepted: false,
      rejectionReason: 'No usable extracted content to support an entity from this URL.',
    };
  }

  const consistency = entityConsistentWithUrlEvidence({
    pageUrl: input.pageUrl,
    businessName: input.businessName,
    pageTitle: input.pageTitle,
    pageText: input.pageText,
    fromWebSearchFallback: input.fromWebSearchFallback,
  });
  if (!consistency.ok) {
    return { accepted: false, rejectionReason: consistency.reason };
  }

  if (
    input.locationScope &&
    input.pageText &&
    input.entity.locations.length > 0 &&
    !input.entity.locations.some((loc) => matchesLocationScope(loc, input.locationScope))
  ) {
    // Scope was user-specified — still accept entity for that branch.
  }

  return { accepted: true };
}

export function resolveIntakeOutcome(input: {
  entityAccepted: boolean;
  pendingLocation: boolean;
  qualifiedClaimCount: number;
  quarantinedClaimCount: number;
  extractedClaimCount: number;
}): UrlIntakeOutcome {
  if (input.pendingLocation) return 'ENTITY_PENDING_LOCATION';
  if (!input.entityAccepted) return 'NO_SUPPORTED_ENTITY';
  if (input.qualifiedClaimCount > 0) return 'ENTITY_ACCEPTED_CLAIMS_ACCEPTED';
  // ENTITY_ACCEPTED_CLAIMS_QUARANTINED only when the entity itself is independently supported.
  if (input.quarantinedClaimCount > 0) return 'ENTITY_ACCEPTED_CLAIMS_QUARANTINED';
  return 'ENTITY_ACCEPTED_NO_CURRENT_CLAIMS';
}

export function buildEntityOpportunityRow(input: {
  campaignId: string;
  sourceId: string;
  pageUrl: string;
  pageDescription?: string | null;
  businessName: string;
  locationName: string | null;
  locationScope?: string | null;
  opportunityType: string;
  entity: ResolvedUrlEntity;
  userMessage?: string | null;
  outcome: UrlIntakeOutcome;
  externalId: string;
}): NewContentItem {
  const locationLabel = input.locationName?.split(',')[0]?.trim() ?? input.locationScope ?? null;
  const topic =
    locationLabel && !input.businessName.toLowerCase().includes(locationLabel.toLowerCase())
      ? `${input.businessName} — ${locationLabel}`
      : input.businessName;

  const typeLabel = formatOpportunityTypeLabel(input.opportunityType);
  const reason =
    'User submitted a local business that may fit bargain, shopping, and local-find content angles.';

  return {
    campaignId: input.campaignId,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    topic: topic.slice(0, 500),
    hook: typeLabel.slice(0, 500),
    script: [
      reason,
      input.pageDescription?.trim(),
      'No verified current event or sale was confirmed at submission time.',
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, 4000),
    sourceId: input.sourceId,
    sourceExternalId: input.externalId,
    sourceUrl: input.pageUrl,
    discoveredAt: new Date(),
    eventStartsAt: null,
    eventEndsAt: null,
    locationName: input.locationName,
    relevanceScore: '0.620',
    urgencyScore: '0.350',
    creatorValueStatus: 'creator_candidate',
    lifecycleStatus: 'active',
    metadata: {
      ingest: 'ask_benson_link',
      opportunityLayer: 'entity',
      opportunityType: input.opportunityType,
      opportunityCategory: input.opportunityType,
      reviewStatus: 'unreviewed',
      qualificationOutcome: input.outcome,
      locationScope: input.locationScope ?? null,
      userSubmission: {
        submittedByUser: true,
        submissionSource: 'ask_benson',
        submittedAt: new Date().toISOString(),
        submittedUrl: input.pageUrl,
        userIntent: input.userMessage ?? null,
        requestedLocationScope: input.locationScope ?? null,
      },
      verified: {
        officialDomain: input.entity.officialDomain,
        businessIdentity: input.businessName,
        location: input.locationName,
      },
      unverified: [
        'current sale',
        'current event',
        'filming policy',
        'inventory specifics',
      ],
      askBensonCapture: {
        pageUrl: input.pageUrl,
        businessName: input.businessName,
        entityDomain: input.entity.domain,
      },
    },
    rawPayload: {
      entityLayer: true,
      pageUrl: input.pageUrl,
      businessName: input.businessName,
      locationScope: input.locationScope ?? null,
    },
  };
}

export function buildEntityOpportunityActions(contentItemId: string, sourceUrl: string): Array<{
  label: string;
  href: string;
}> {
  const base = `/review/inventory?id=${contentItemId}`;
  return [
    { label: 'Open opportunity', href: base },
    { label: 'Interested', href: `${base}&action=interested` },
    { label: 'Plan visit', href: `${base}&action=plan_visit` },
    { label: 'Track updates', href: `${base}&action=track_updates` },
    { label: 'Dismiss', href: `${base}&action=dismiss` },
    { label: 'Open official site', href: sourceUrl },
  ];
}
