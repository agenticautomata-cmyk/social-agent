/**
 * Contact honesty rules: never guess emails, never mark inferred as verified,
 * never scrape private personal contacts.
 */

import { createHash, randomUUID } from 'node:crypto';
import type {
  OpportunityContact,
  ContactVerificationStatus,
  ContactScope,
  ResearchCitation,
} from './types.js';

/** Common first.last / f.last patterns — never invent these. */
const EMAIL_GUESS_PATTERNS = [
  /^[a-z]\.[a-z0-9._-]+@/i,
  /^[a-z]+[._][a-z]+@/i,
];

const PRIVATE_PERSONAL_HINTS =
  /\b(?:personal\s+email|home\s+(?:phone|address)|private\s+(?:cell|mobile)|residential)\b/i;

const CORPORATE_GENERIC =
  /^(?:info|hello|contact|press|media|pr|partnerships?|creators?|influencers?|affiliates?|support|sales)@/i;

export function looksLikeEmailGuess(email: string, knownPublishedEmails: string[] = []): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) return true;
  if (knownPublishedEmails.some((e) => e.toLowerCase() === normalized)) return false;
  // Explicitly published generic inboxes are OK when source published them.
  if (CORPORATE_GENERIC.test(normalized)) return false;
  // Pattern guesses without publication evidence.
  return EMAIL_GUESS_PATTERNS.some((re) => re.test(normalized));
}

export function looksLikePrivatePersonalContact(input: {
  email?: string | null;
  phone?: string | null;
  note?: string | null;
  sourceType?: ResearchCitation['sourceType'];
}): boolean {
  const blob = [input.email, input.phone, input.note].filter(Boolean).join(' ');
  if (PRIVATE_PERSONAL_HINTS.test(blob)) return true;
  // Personal webmail without official source context is rejected.
  if (
    input.email &&
    /@(?:gmail|yahoo|hotmail|outlook|icloud|me|aol)\.com$/i.test(input.email) &&
    input.sourceType !== 'official'
  ) {
    return true;
  }
  return false;
}

export type RawContactCandidate = {
  name?: string | null;
  title?: string | null;
  organization?: string | null;
  email?: string | null;
  phone?: string | null;
  contactFormUrl?: string | null;
  sourceUrl?: string | null;
  sourceType?: ResearchCitation['sourceType'];
  relevanceReason?: string | null;
  scope?: ContactScope;
  publishedEmails?: string[];
  confidence?: 'high' | 'medium' | 'low';
  claimedVerified?: boolean;
};

export function sanitizeContactCandidate(
  raw: RawContactCandidate,
  retrievedAt = new Date().toISOString(),
): OpportunityContact | null {
  const sourceType = raw.sourceType ?? 'other';
  let email = raw.email?.trim() || null;
  let verificationStatus: ContactVerificationStatus = 'unverified_lead';
  let rejectedReason: string | null = null;

  if (looksLikePrivatePersonalContact({ ...raw, sourceType })) {
    return {
      id: contactId(raw),
      name: raw.name ?? null,
      title: raw.title ?? null,
      organization: raw.organization ?? null,
      email: null,
      phone: null,
      contactFormUrl: raw.contactFormUrl ?? null,
      sourceUrl: raw.sourceUrl ?? null,
      sourceType,
      retrievedAt,
      confidence: 'low',
      verificationStatus: 'rejected_private',
      relevanceReason: raw.relevanceReason ?? 'Rejected — private personal contact',
      scope: raw.scope ?? 'generic',
      rank: null,
      rankReason: null,
      rejectedReason: 'private_personal_contact',
    };
  }

  if (email && looksLikeEmailGuess(email, raw.publishedEmails ?? [])) {
    rejectedReason = 'email_pattern_guess';
    email = null;
    verificationStatus = 'rejected_guess';
  } else if (email && raw.claimedVerified && sourceType === 'official') {
    verificationStatus = 'verified';
  } else if (email && sourceType === 'official') {
    verificationStatus = 'partially_verified';
  } else if (!email && (raw.contactFormUrl || raw.phone)) {
    verificationStatus = 'partially_verified';
  } else if (!email && !raw.contactFormUrl && !raw.phone && !raw.name) {
    return null;
  }

  // Never mark inferred/guessed emails as verified.
  if (verificationStatus === 'verified' && rejectedReason) {
    verificationStatus = 'rejected_guess';
  }
  if (
    raw.claimedVerified &&
    !email &&
    !raw.contactFormUrl &&
    !raw.phone &&
    verificationStatus !== 'rejected_guess' &&
    verificationStatus !== 'rejected_private'
  ) {
    verificationStatus = 'unverified_lead';
  }

  return {
    id: contactId(raw),
    name: raw.name?.trim() || null,
    title: raw.title?.trim() || null,
    organization: raw.organization?.trim() || null,
    email,
    phone: raw.phone?.trim() || null,
    contactFormUrl: raw.contactFormUrl?.trim() || null,
    sourceUrl: raw.sourceUrl?.trim() || null,
    sourceType,
    retrievedAt,
    confidence: raw.confidence ?? (verificationStatus === 'verified' ? 'high' : 'medium'),
    verificationStatus,
    relevanceReason: raw.relevanceReason?.trim() || 'Publicly listed business contact path',
    scope: raw.scope ?? 'generic',
    rank: null,
    rankReason: null,
    rejectedReason,
  };
}

function contactId(raw: RawContactCandidate): string {
  const key = [
    raw.email?.toLowerCase() ?? '',
    raw.contactFormUrl ?? '',
    raw.phone ?? '',
    raw.name?.toLowerCase() ?? '',
    raw.title?.toLowerCase() ?? '',
    raw.organization?.toLowerCase() ?? '',
  ].join('|');
  if (!key.replace(/\|/g, '')) return randomUUID();
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

export function isUsableOutreachContact(c: OpportunityContact): boolean {
  if (c.verificationStatus === 'rejected_guess' || c.verificationStatus === 'rejected_private') {
    return false;
  }
  return Boolean(c.email || c.contactFormUrl || c.phone);
}
