import type { PartnershipFingerprints } from './types.js';
import { SHARED_PLATFORMS } from './fingerprints.js';
import {
  classifyEmailIntent,
  hasCreatorBusinessContext,
  hasTransactionalNegativeSignal,
  requiresCreatorBusinessEvidence,
  shouldBlockPartnershipMatching,
  type EmailIntentClassification,
} from './email-intent.js';

export type EmailMatchInput = {
  subject: string;
  bodyText: string;
  senderEmail: string | null;
  senderDomain: string | null;
  gmailThreadId: string | null;
  linkedPartnershipIds?: string[];
  intent?: EmailIntentClassification;
};

export type EmailMatchResult = {
  partnershipId: string;
  confidence: number;
  matchedOn: string;
  reasons: string[];
};

const MIN_LINK_CONFIDENCE = 0.4;
const HIGH_CONFIDENCE = 0.65;

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function containsPhrase(haystack: string, phrase: string): boolean {
  return haystack.includes(phrase.toLowerCase());
}

function isSharedPlatformDomain(domain: string | null): boolean {
  if (!domain) return false;
  return SHARED_PLATFORMS.some((p) => domain.includes(p));
}

function resolveIntent(email: EmailMatchInput): EmailIntentClassification {
  return (
    email.intent ??
    classifyEmailIntent({
      subject: email.subject,
      bodyText: email.bodyText,
      senderDomain: email.senderDomain,
    })
  );
}

export function scoreEmailAgainstPartnership(
  email: EmailMatchInput,
  partnershipId: string,
  fingerprints: PartnershipFingerprints,
): EmailMatchResult | null {
  const blob = normalize(`${email.subject} ${email.bodyText}`);
  const intent = resolveIntent(email);
  const linkedToPartnership = email.linkedPartnershipIds?.includes(partnershipId) ?? false;
  const reasons: string[] = [];
  let score = 0;

  if (shouldBlockPartnershipMatching(intent, linkedToPartnership ? [partnershipId] : undefined)) {
    return null;
  }

  if (
    hasTransactionalNegativeSignal(blob) &&
    !linkedToPartnership &&
    !hasCreatorBusinessContext(blob)
  ) {
    return null;
  }

  if (linkedToPartnership) {
    score += 0.5;
    reasons.push('existing Gmail thread already linked to partnership');
  }

  const hasCreatorContext = hasCreatorBusinessContext(blob) || linkedToPartnership;

  if (fingerprints.brandName && containsPhrase(blob, fingerprints.brandName)) {
    if (hasCreatorContext) {
      score += 0.45;
      reasons.push(`brand name "${fingerprints.brandName}" with creator-business context`);
    }
  }

  for (const program of fingerprints.programNames) {
    if (containsPhrase(blob, program)) {
      score += 0.4;
      reasons.push(`program name "${program}" in subject/body`);
    }
  }

  for (const domain of fingerprints.domains) {
    if (email.senderDomain?.includes(domain.replace(/^www\./, ''))) {
      const hasBrandContext =
        (fingerprints.brandName && containsPhrase(blob, fingerprints.brandName)) ||
        fingerprints.programNames.some((p) => containsPhrase(blob, p));
      if (hasBrandContext && hasCreatorContext) {
        score += 0.35;
        reasons.push(`sender domain ${domain} with brand/program context`);
      } else if (!isSharedPlatformDomain(email.senderDomain) && hasCreatorContext) {
        score += 0.2;
        reasons.push(`sender domain ${domain} with creator context`);
      }
    }
  }

  for (const retailer of fingerprints.retailerNames) {
    if (containsPhrase(blob, retailer) && hasCreatorContext) {
      score += 0.12;
      reasons.push(`retailer "${retailer}" mentioned with creator context`);
    }
  }

  for (const phrase of fingerprints.keywordPhrases) {
    if (phrase.length >= 6 && containsPhrase(blob, phrase) && hasCreatorContext) {
      score += 0.08;
      reasons.push(`keyword phrase "${phrase}"`);
      break;
    }
  }

  if (isSharedPlatformDomain(email.senderDomain) && score < 0.4) {
    const platformOnly =
      SHARED_PLATFORMS.some((p) => containsPhrase(blob, p)) &&
      !(fingerprints.brandName && containsPhrase(blob, fingerprints.brandName)) &&
      !fingerprints.programNames.some((program) => containsPhrase(blob, program));
    if (platformOnly) {
      return null;
    }
  }

  if (requiresCreatorBusinessEvidence(intent) && !hasCreatorContext && !linkedToPartnership) {
    return null;
  }

  if (score < MIN_LINK_CONFIDENCE) return null;

  return {
    partnershipId,
    confidence: Math.min(score, 0.99),
    matchedOn: reasons[0] ?? 'contextual match',
    reasons,
  };
}

export function pickBestPartnershipMatch(
  email: EmailMatchInput,
  candidates: Array<{ partnershipId: string; fingerprints: PartnershipFingerprints }>,
): EmailMatchResult | null {
  const intent =
    email.intent ??
    classifyEmailIntent({
      subject: email.subject,
      bodyText: email.bodyText,
      senderDomain: email.senderDomain,
    });

  if (shouldBlockPartnershipMatching(intent, email.linkedPartnershipIds)) {
    return null;
  }

  let best: EmailMatchResult | null = null;
  for (const candidate of candidates) {
    const result = scoreEmailAgainstPartnership(
      { ...email, intent },
      candidate.partnershipId,
      candidate.fingerprints,
    );
    if (!result) continue;
    if (!best || result.confidence > best.confidence) best = result;
  }
  return best;
}

export function requiresConfirmation(confidence: number): boolean {
  return confidence < HIGH_CONFIDENCE;
}

export { MIN_LINK_CONFIDENCE, HIGH_CONFIDENCE };
