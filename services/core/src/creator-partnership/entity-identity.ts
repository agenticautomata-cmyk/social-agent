import { isOpaqueContentId, classifyStandaloneUrlType, instagramPostShortcode } from '../ask-benson/url-type.js';
import { isEditorialRoundupTitle, looksLikeEditorialSlug } from '../ask-benson/editorial-roundup.js';
import { looksLikeEditorialContainerTitle } from '../ask-benson/editorial-container.js';
import { isEditorialHeadlineTitle } from '../inventory/today-clarity.js';
import { classifyEmailIntent } from './email-intent.js';

export type PartnershipIdentityRejection =
  | 'opaque_content_id'
  | 'editorial_headline'
  | 'listing_container_title'
  | 'transactional_subject'
  | 'placeholder_or_empty'
  | 'no_entity_evidence';

export type PartnershipIdentityEvidence =
  | 'operator_brand'
  | 'operator_text'
  | 'program_library'
  | 'url_host'
  | 'url_brand_slug'
  | 'jsonld_organization'
  | 'social_display_name'
  | 'known_program_entity';

export type PartnershipIdentityDecision =
  | { ok: true; brandName: string; evidence: PartnershipIdentityEvidence[] }
  | { ok: false; reason: PartnershipIdentityRejection; brandName: string | null };

export class PartnershipIdentityRejectedError extends Error {
  readonly code = 'partnership_identity_rejected';
  constructor(
    readonly reason: PartnershipIdentityRejection,
    readonly candidate: string | null = null,
  ) {
    super(`partnership_identity_rejected:${reason}`);
    this.name = 'PartnershipIdentityRejectedError';
  }
}

const PLACEHOLDER_IDENTITY_RE =
  /\bunrelated\s+soft\s+context\b|\bsoft\s+context(\s+hotel)?\b|^placeholder$|^lorem ipsum$|^n\/a$|^unknown$|^none$|^null$|^undefined$|^test brand$|^creator partnership candidate$/i;

const LISTICLE_TITLE_RE =
  /\b(?:top|best)\s+(?:\d+\s+)?(?:things|places|spots|restaurants|hotels)\s+to\s+(?:do|eat|see|visit|stay|shop|drink)\b/i;

const GENERIC_TITLE_RE = /^creator partnership( candidate)?$/i;

export type PartnershipIdentityInput = {
  brandName?: string | null;
  retailerName?: string | null;
  submittedUrl?: string | null;
  userMessage?: string | null;
  pageTitle?: string | null;
  sourceScreen?: string | null;
  operatorSuppliedBrand?: boolean;
  jsonLdOrganization?: string | null;
  socialDisplayName?: string | null;
};

function extractExplicitBrandField(message: string | null | undefined): string | null {
  const match = (message ?? '').match(/\bbrand:\s*([^,\n]+)/i);
  return match?.[1]?.trim() || null;
}

function isSocialOrLinkHubUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const type = classifyStandaloneUrlType(url);
  return type === 'social_post' || type === 'social_profile' || type === 'link_hub';
}

function hostMatchesCandidate(url: string, candidate: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '').split('.')[0] ?? '';
    const compactHost = host.replace(/[^a-z0-9]+/g, '');
    const compact = candidate.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!compactHost || compact.length < 3) return false;
    return compactHost === compact || compactHost.includes(compact) || compact.includes(compactHost);
  } catch {
    return false;
  }
}

function urlSupportsCandidate(url: string, candidate: string): boolean {
  try {
    const decoded = decodeURIComponent(url).toLowerCase();
    if (hostMatchesCandidate(url, candidate)) return true;
    const tokens = candidate.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
    return tokens.some((t) => decoded.includes(t));
  } catch {
    return false;
  }
}

function looksLikeTransactionalSubject(name: string): boolean {
  const intent = classifyEmailIntent({ subject: name, bodyText: '' });
  if (
    intent.intent === 'security_auth' ||
    intent.intent === 'transactional_account' ||
    intent.intent === 'commerce_transactional' ||
    intent.intent === 'newsletter_marketing'
  ) {
    return true;
  }
  if (intent.intent === 'platform_creator' && /thank you for your|application|verify|verification/i.test(name)) {
    return true;
  }
  return /email address verification|thank you for your .+ application/i.test(name);
}

function looksLikeEditorialIdentity(name: string): boolean {
  if (
    isEditorialRoundupTitle(name) ||
    isEditorialHeadlineTitle(name) ||
    looksLikeEditorialContainerTitle(name) ||
    LISTICLE_TITLE_RE.test(name)
  ) {
    return true;
  }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return looksLikeEditorialSlug(slug) || looksLikeEditorialSlug(name);
}

function collectEvidence(input: PartnershipIdentityInput, candidate: string): PartnershipIdentityEvidence[] {
  const evidence: PartnershipIdentityEvidence[] = [];
  const explicit = extractExplicitBrandField(input.userMessage);
  if (input.operatorSuppliedBrand || (explicit && namesMatch(explicit, candidate))) {
    evidence.push('operator_brand');
  }
  if ((input.sourceScreen ?? '').toLowerCase() === 'program_library') {
    evidence.push('program_library');
  }
  const message = (input.userMessage ?? '').trim();
  const url = input.submittedUrl?.trim() || null;
  if (
    !url &&
    message &&
    message.length <= 48 &&
    !message.includes('://') &&
    namesMatch(message, candidate)
  ) {
    evidence.push('operator_text');
  }
  if (url && urlSupportsCandidate(url, candidate)) {
    const urlType = classifyStandaloneUrlType(url);
    if (urlType === 'social_post') {
      // Post paths are shortcodes/ids, not display names.
    } else if (urlType === 'social_profile' || urlType === 'link_hub') {
      if (!/^(instagram|tiktok|facebook|youtube|twitter|threads)$/i.test(candidate.replace(/\s+/g, ''))) {
        evidence.push('social_display_name');
      }
    } else {
      evidence.push(hostMatchesCandidate(url, candidate) ? 'url_host' : 'url_brand_slug');
    }
  }
  if (input.jsonLdOrganization?.trim() && namesMatch(input.jsonLdOrganization, candidate)) {
    evidence.push('jsonld_organization');
  }
  const display = input.socialDisplayName?.trim() || null;
  if (display && !isOpaqueContentId(display) && namesMatch(display, candidate)) {
    evidence.push('social_display_name');
  }
  if (/^(shopmy|etsy|ltk|scheels|loews|reklaim)$/i.test(candidate.replace(/\s+/g, ''))) {
    evidence.push('known_program_entity');
  }
  return [...new Set(evidence)];
}

function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function resolveCandidate(input: PartnershipIdentityInput): string | null {
  const explicit = extractExplicitBrandField(input.userMessage);
  const url = input.submittedUrl?.trim() || null;
  const social = isSocialOrLinkHubUrl(url);
  const shortcode = url ? instagramPostShortcode(url) : null;
  const brand = (input.brandName ?? '').trim();
  if (brand && shortcode && namesMatch(brand, shortcode)) return brand;
  if (brand) return brand;
  if (explicit) return explicit;
  const message = (input.userMessage ?? '').trim();
  if (
    !url &&
    message &&
    message.length <= 48 &&
    !message.includes('://') &&
    !looksLikeEditorialIdentity(message)
  ) {
    return message;
  }
  const retailer = (input.retailerName ?? '').trim();
  if (retailer && !social && !isOpaqueContentId(retailer)) return retailer;
  return null;
}

/**
 * Shape-only check for a candidate string (no evidence required).
 * Shared by partnership persist and sponsor/outreach business-name gating.
 */
export function classifyIdentityCandidateString(
  name: string | null | undefined,
): PartnershipIdentityDecision {
  const candidate = (name ?? '').trim();
  if (!candidate || candidate.length < 2 || GENERIC_TITLE_RE.test(candidate) || PLACEHOLDER_IDENTITY_RE.test(candidate)) {
    return { ok: false, reason: 'placeholder_or_empty', brandName: candidate || null };
  }
  if (isOpaqueContentId(candidate)) {
    return { ok: false, reason: 'opaque_content_id', brandName: candidate };
  }
  if (looksLikeTransactionalSubject(candidate)) {
    return { ok: false, reason: 'transactional_subject', brandName: candidate };
  }
  if (looksLikeEditorialIdentity(candidate)) {
    const reason = looksLikeEditorialContainerTitle(candidate) && !LISTICLE_TITLE_RE.test(candidate)
      ? 'listing_container_title'
      : 'editorial_headline';
    return { ok: false, reason, brandName: candidate };
  }
  return { ok: true, brandName: candidate, evidence: [] };
}

export function evaluatePartnershipEntityIdentity(
  input: PartnershipIdentityInput,
): PartnershipIdentityDecision {
  const candidate = resolveCandidate(input);
  const shaped = classifyIdentityCandidateString(candidate);
  if (!shaped.ok) return shaped;
  const url = input.submittedUrl?.trim() || null;
  const shortcode = url ? instagramPostShortcode(url) : null;
  if (shortcode && namesMatch(shaped.brandName, shortcode)) {
    return { ok: false, reason: 'opaque_content_id', brandName: shaped.brandName };
  }
  const evidence = collectEvidence(input, shaped.brandName);
  if (evidence.length === 0) {
    return { ok: false, reason: 'no_entity_evidence', brandName: shaped.brandName };
  }
  return { ok: true, brandName: shaped.brandName, evidence };
}

export function requirePartnershipEntityIdentity(input: PartnershipIdentityInput): string {
  const decision = evaluatePartnershipEntityIdentity(input);
  if (!decision.ok) throw new PartnershipIdentityRejectedError(decision.reason, decision.brandName);
  return decision.brandName;
}

export function selectPartnershipIdentityForWrite(input: PartnershipIdentityInput & {
  existingBrandName?: string | null;
}): {
  brandName: string | null;
  writeBrand: boolean;
  incomingRejected: PartnershipIdentityRejection | null;
} {
  const incoming = evaluatePartnershipEntityIdentity(input);
  if (incoming.ok) {
    return { brandName: incoming.brandName, writeBrand: true, incomingRejected: null };
  }
  const existing = evaluatePartnershipEntityIdentity({
    ...input,
    brandName: input.existingBrandName,
    operatorSuppliedBrand: Boolean(input.existingBrandName),
  });
  if (existing.ok) {
    return { brandName: existing.brandName, writeBrand: false, incomingRejected: incoming.reason };
  }
  return {
    brandName: input.existingBrandName?.trim() || null,
    writeBrand: false,
    incomingRejected: incoming.reason,
  };
}
