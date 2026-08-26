import {
  classifyIdentityCandidateString,
  evaluatePartnershipEntityIdentity,
  type PartnershipIdentityEvidence,
  type PartnershipIdentityRejection,
} from '../creator-partnership/entity-identity.js';
import { classifyEmailIntent, type EmailIntent } from '../creator-partnership/email-intent.js';

export type SponsorIdentityRejection =
  | PartnershipIdentityRejection
  | 'campaign_subject'
  | 'interrogative_headline'
  | 'person_without_company';

export type SponsorIdentityEvidence =
  | PartnershipIdentityEvidence
  | 'explicit_business_field'
  | 'sender_domain'
  | 'sender_organization'
  | 'email_signature'
  | 'linked_partnership_brand'
  | 'operator_provided';

export type SponsorIdentityDecision =
  | { ok: true; businessName: string; evidence: SponsorIdentityEvidence[] }
  | { ok: false; reason: SponsorIdentityRejection; businessName: string | null; resolvedEntity: string | null };

export class SponsorBusinessIdentityRejectedError extends Error {
  readonly code = 'sponsor_business_identity_rejected';
  constructor(
    readonly reason: SponsorIdentityRejection,
    readonly candidate: string | null = null,
  ) {
    super(`sponsor_business_identity_rejected:${reason}`);
    this.name = 'SponsorBusinessIdentityRejectedError';
  }
}

const CREATOR_PLATFORM_ENTITIES = new Set(['ShopMy', 'LTK', 'Etsy', 'REKLAIM']);

export const SPONSOR_PIPELINE_BLOCKED_INTENTS: EmailIntent[] = [
  'security_auth',
  'transactional_account',
  'commerce_transactional',
  'newsletter_marketing',
  'platform_creator',
];

const PUBLIC_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
]);

const KNOWN_ENTITY_DOMAINS: Array<{ hosts: string[]; name: string }> = [
  { hosts: ['shopmy.us', 'shopmy.com'], name: 'ShopMy' },
  { hosts: ['scheels.com'], name: 'SCHEELS' },
  { hosts: ['loewshotels.com', 'loews.com'], name: 'Loews' },
  { hosts: ['etsy.com'], name: 'Etsy' },
  { hosts: ['rewardstyle.com', 'liketoknow.it', 'ltk.app'], name: 'LTK' },
  { hosts: ['reklaim.com'], name: 'REKLAIM' },
  { hosts: ['nike.com'], name: 'Nike' },
];

const CAMPAIGN_SUBJECT_RE =
  /\bbest sellers?\b|\bjust for you\b|\bshop now\b|\bfall sweaters\b|\bflash sale\b|\d+\s*%\s*off\b|\blimited[- ]time offer\b/i;

const INTERROGATIVE_RE = /^(who|what|where|why|how|which)\b/i;

export type SponsorIdentityInput = {
  businessName?: string | null;
  contactName?: string | null;
  email?: string | null;
  website?: string | null;
  senderName?: string | null;
  senderEmail?: string | null;
  subject?: string | null;
  pageTitle?: string | null;
  operatorProvided?: boolean;
  jsonLdOrganization?: string | null;
  linkedPartnershipBrand?: string | null;
  signatureOrganization?: string | null;
  sourceUrl?: string | null;
};

function senderDomainFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase() || null;
}

function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function hostLooksLikeBusiness(urlOrHost: string, name: string): boolean {
  try {
    const host = (
      urlOrHost.includes('://') ? new URL(urlOrHost) : new URL(`https://${urlOrHost}`)
    ).hostname
      .replace(/^www\./i, '')
      .split('.')[0] ?? '';
    const compactHost = host.replace(/[^a-z0-9]+/g, '');
    const compact = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!compactHost || compact.length < 3) return false;
    return compactHost === compact || compactHost.includes(compact) || compact.includes(compactHost);
  } catch {
    return false;
  }
}

function registrableHost(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  try {
    const url = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`);
    return url.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    const at = raw.lastIndexOf('@');
    if (at >= 0) return raw.slice(at + 1).replace(/^www\./i, '').toLowerCase() || null;
    return null;
  }
}

export function knownEntityFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const lower = host.replace(/^www\./i, '').toLowerCase();
  for (const entry of KNOWN_ENTITY_DOMAINS) {
    if (entry.hosts.some((h) => lower === h || lower.endsWith(`.${h}`))) return entry.name;
  }
  return null;
}

export function knownEntityFromSenderName(name: string | null | undefined): string | null {
  const raw = (name ?? '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (/\bshopmy\b/.test(lower)) return 'ShopMy';
  if (/\bscheels\b/.test(lower)) return 'SCHEELS';
  if (/\bloews\b/.test(lower)) return 'Loews';
  if (/\betsy\b/.test(lower)) return 'Etsy';
  if (/\bltk\b|\brewardstyle\b/.test(lower)) return 'LTK';
  if (/\breklaim\b/.test(lower)) return 'REKLAIM';
  if (/\bnike\b/.test(lower)) return 'Nike';
  return null;
}

export function websiteUrlFromEmail(email: string | null | undefined): string | null {
  const host = senderDomainFromEmail(email);
  if (!host || PUBLIC_MAIL_DOMAINS.has(host)) return null;
  return `https://${host}`;
}

function looksLikeCampaignOrQuestion(name: string): SponsorIdentityRejection | null {
  const trimmed = name.trim();
  if (CAMPAIGN_SUBJECT_RE.test(trimmed)) return 'campaign_subject';
  if (INTERROGATIVE_RE.test(trimmed) || /\?\s*$/.test(trimmed)) return 'interrogative_headline';
  return null;
}

function classifySponsorName(name: string): SponsorIdentityDecision {
  const extra = looksLikeCampaignOrQuestion(name);
  if (extra) return { ok: false, reason: extra, businessName: name, resolvedEntity: null };
  const shaped = classifyIdentityCandidateString(name);
  if (!shaped.ok) {
    return { ok: false, reason: shaped.reason, businessName: shaped.brandName, resolvedEntity: null };
  }
  return { ok: true, businessName: shaped.brandName, evidence: [] };
}

function urlForEvidence(input: SponsorIdentityInput, hostHint?: string | null): string | null {
  const website = input.website?.trim() || input.sourceUrl?.trim() || null;
  if (website) return website.includes('://') ? website : `https://${website}`;
  const fromEmail = websiteUrlFromEmail(input.senderEmail ?? input.email);
  if (fromEmail) return fromEmail;
  if (hostHint) return `https://${hostHint}`;
  return null;
}

/**
 * Resolve a defensible sponsor/business entity.
 * Email subjects and article titles are never sufficient on their own.
 */
export function evaluateSponsorBusinessIdentity(input: SponsorIdentityInput): SponsorIdentityDecision {
  const senderHost = registrableHost(input.senderEmail) ?? senderDomainFromEmail(input.senderEmail);
  const websiteHost = registrableHost(input.website) ?? registrableHost(input.sourceUrl);
  const domainEntity =
    knownEntityFromHost(senderHost) ??
    knownEntityFromHost(websiteHost) ??
    knownEntityFromSenderName(input.senderName);

  const explicit = input.businessName?.trim() || null;
  const titleOrSubject = input.pageTitle?.trim() || input.subject?.trim() || null;
  const explicitIsTitle = Boolean(explicit && titleOrSubject && namesMatch(explicit, titleOrSubject));

  const candidates: Array<{ name: string; evidence: SponsorIdentityEvidence[] }> = [];

  if (input.operatorProvided && explicit) {
    candidates.push({ name: explicit, evidence: ['operator_provided', 'operator_brand'] });
  }
  if (input.linkedPartnershipBrand?.trim()) {
    candidates.push({
      name: input.linkedPartnershipBrand.trim(),
      evidence: ['linked_partnership_brand'],
    });
  }
  if (input.jsonLdOrganization?.trim()) {
    candidates.push({ name: input.jsonLdOrganization.trim(), evidence: ['jsonld_organization'] });
  }
  if (input.signatureOrganization?.trim()) {
    candidates.push({ name: input.signatureOrganization.trim(), evidence: ['email_signature'] });
  }
  if (domainEntity) {
    const evidence: SponsorIdentityEvidence[] = [];
    if (knownEntityFromHost(senderHost) || knownEntityFromSenderName(input.senderName)) {
      evidence.push(knownEntityFromHost(senderHost) ? 'sender_domain' : 'sender_organization');
    }
    if (knownEntityFromHost(websiteHost)) evidence.push('url_host');
    if (evidence.length === 0) evidence.push('known_program_entity');
    candidates.push({ name: domainEntity, evidence: [...evidence, 'known_program_entity'] });
  }
  if (explicit && !explicitIsTitle) {
    candidates.push({ name: explicit, evidence: ['explicit_business_field'] });
  } else if (explicit && explicitIsTitle) {
    const url = urlForEvidence(input, senderHost ?? websiteHost);
    const titleHasIndependentEvidence = Boolean(
      domainEntity ||
        input.operatorProvided ||
        input.linkedPartnershipBrand?.trim() ||
        input.jsonLdOrganization?.trim() ||
        input.signatureOrganization?.trim() ||
        (url && hostLooksLikeBusiness(url, explicit)),
    );
    if (titleHasIndependentEvidence) {
      const evidence: SponsorIdentityEvidence[] = ['explicit_business_field'];
      if (url && hostLooksLikeBusiness(url, explicit)) evidence.push('url_host');
      if (domainEntity) evidence.push('known_program_entity');
      candidates.push({ name: explicit, evidence });
    }
  }

  let resolvedEntity: string | null = domainEntity;

  for (const candidate of candidates) {
    const shaped = classifySponsorName(candidate.name);
    if (!shaped.ok) continue;
    const url = urlForEvidence(input, senderHost ?? websiteHost);
    const partnership = evaluatePartnershipEntityIdentity({
      brandName: shaped.businessName,
      submittedUrl: url,
      operatorSuppliedBrand:
        input.operatorProvided === true || candidate.evidence.includes('operator_provided'),
      jsonLdOrganization: input.jsonLdOrganization,
    });
    const evidence: SponsorIdentityEvidence[] = [...candidate.evidence];
    if (partnership.ok) evidence.push(...partnership.evidence);
    else if (
      candidate.evidence.includes('explicit_business_field') ||
      candidate.evidence.includes('operator_provided') ||
      candidate.evidence.includes('sender_domain') ||
      candidate.evidence.includes('known_program_entity') ||
      candidate.evidence.includes('linked_partnership_brand') ||
      candidate.evidence.includes('jsonld_organization') ||
      candidate.evidence.includes('email_signature')
    ) {
      // Sponsor-specific evidence is enough once the string itself is a usable business name.
    } else {
      continue;
    }
    resolvedEntity = shaped.businessName;
    return { ok: true, businessName: shaped.businessName, evidence: [...new Set(evidence)] };
  }

  if (explicit) {
    const shaped = classifySponsorName(explicit);
    if (!shaped.ok) {
      return { ...shaped, resolvedEntity };
    }
  }
  if (titleOrSubject) {
    const shaped = classifySponsorName(titleOrSubject);
    if (!shaped.ok) {
      return { ...shaped, resolvedEntity };
    }
  }

  if (input.contactName?.trim() && !explicit) {
    return {
      ok: false,
      reason: 'person_without_company',
      businessName: null,
      resolvedEntity,
    };
  }

  return {
    ok: false,
    reason: 'no_entity_evidence',
    businessName: explicit || titleOrSubject || null,
    resolvedEntity,
  };
}

export function requireSponsorBusinessIdentity(input: SponsorIdentityInput): string {
  const decision = evaluateSponsorBusinessIdentity(input);
  if (!decision.ok) throw new SponsorBusinessIdentityRejectedError(decision.reason, decision.businessName);
  return decision.businessName;
}

export function selectSponsorIdentityForWrite(
  input: SponsorIdentityInput & { existingBusinessName?: string | null },
): {
  businessName: string | null;
  writeBusinessName: boolean;
  incomingRejected: SponsorIdentityRejection | null;
} {
  const proposed = (input.businessName ?? '').trim();
  if (proposed) {
    const proposedShape = classifySponsorName(proposed);
    if (!proposedShape.ok) {
      return preserveExistingSponsorName(input, proposedShape.reason);
    }
  }
  const incoming = evaluateSponsorBusinessIdentity(input);
  if (incoming.ok) {
    return { businessName: incoming.businessName, writeBusinessName: true, incomingRejected: null };
  }
  return preserveExistingSponsorName(input, incoming.reason);
}

function preserveExistingSponsorName(
  input: SponsorIdentityInput & { existingBusinessName?: string | null },
  incomingRejected: SponsorIdentityRejection,
): {
  businessName: string | null;
  writeBusinessName: boolean;
  incomingRejected: SponsorIdentityRejection;
} {
  const existing = (input.existingBusinessName ?? '').trim();
  if (existing) {
    const existingDecision = evaluateSponsorBusinessIdentity({
      businessName: existing,
      operatorProvided: true,
      website: input.website,
      sourceUrl: input.sourceUrl,
      email: input.email,
    });
    if (existingDecision.ok) {
      return {
        businessName: existingDecision.businessName,
        writeBusinessName: false,
        incomingRejected,
      };
    }
    const existingShape = classifySponsorName(existing);
    if (existingShape.ok) {
      return { businessName: existing, writeBusinessName: false, incomingRejected };
    }
  }
  return {
    businessName: existing || null,
    writeBusinessName: false,
    incomingRejected,
  };
}

export function shouldCreateSponsorPipelineFromIntent(intent: EmailIntent): boolean {
  return !SPONSOR_PIPELINE_BLOCKED_INTENTS.includes(intent);
}

export function isActionableSponsorStatus(status: string | null | undefined): boolean {
  return status === 'ready_to_contact' || status === 'replied' || status === 'follow_up_needed';
}

export type SponsorInboxPersistDecision = {
  identity: SponsorIdentityDecision;
  emailIntent: EmailIntent;
  createContact: boolean;
  createOpportunity: boolean;
  skipReason?: string;
};

export function decideSponsorInboxPersist(input: {
  subject: string;
  bodyText?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
}): SponsorInboxPersistDecision {
  const intent = classifyEmailIntent({
    subject: input.subject,
    bodyText: input.bodyText ?? '',
    senderDomain: senderDomainFromEmail(input.fromEmail),
  }).intent;
  const identity = evaluateSponsorBusinessIdentity({
    senderEmail: input.fromEmail,
    senderName: input.fromName,
    subject: input.subject,
    email: input.fromEmail,
  });
  if (!shouldCreateSponsorPipelineFromIntent(intent)) {
    return {
      identity,
      emailIntent: intent,
      createContact: false,
      createOpportunity: false,
      skipReason: `blocked_intent:${intent}`,
    };
  }
  if (
    identity.ok &&
    CREATOR_PLATFORM_ENTITIES.has(identity.businessName) &&
    intent !== 'creator_business'
  ) {
    return {
      identity,
      emailIntent: intent,
      createContact: false,
      createOpportunity: false,
      skipReason: `platform_entity:${identity.businessName}:${intent}`,
    };
  }
  if (!identity.ok) {
    return {
      identity,
      emailIntent: intent,
      createContact: false,
      createOpportunity: false,
      skipReason: `identity:${identity.reason}`,
    };
  }
  return {
    identity,
    emailIntent: intent,
    createContact: true,
    createOpportunity: true,
  };
}

/**
 * Inbound sponsor attachment keys. Subject/title text is intentionally omitted —
 * a derived business name from an email subject must not attach mail to a contact.
 */
export function sponsorInboundAttachmentKeys(input: {
  fromEmail?: string | null;
  gmailThreadId?: string | null;
  gmailMessageId?: string | null;
  subject?: string | null;
}): { fromEmail: string | null; gmailThreadId: string | null; gmailMessageId: string | null } {
  void input.subject;
  return {
    fromEmail: input.fromEmail?.trim().toLowerCase() || null,
    gmailThreadId: input.gmailThreadId?.trim() || null,
    gmailMessageId: input.gmailMessageId?.trim() || null,
  };
}
