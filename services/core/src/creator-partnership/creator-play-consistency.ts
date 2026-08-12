import type { CreatorPlay, PartnershipResearch } from './types.js';
import {
  buildVerificationContext,
  type VerificationContext,
  isUsableInferredField,
  isVerifiedField,
} from './verification-context.js';

const KC_SHOPPING_RE =
  /\b(shop|shopping|buy|get|find|pick up).{0,60}\b(in kc|in kansas city|at .{0,40} (in kc|in kansas city))\b/gi;
const KC_FILMING_RE = /\b(film|filming|visit|drive to|stop by).{0,40}\b(in kc|in kansas city|local store)\b/gi;
const CONFIRMED_IF_RE = /\bif (inventory|stock|in-store).{0,30}confirmed\b/gi;

/** Final pass: strip or rewrite claims that depend on unverified research. */
export function enforceCreatorPlayVerification(
  play: CreatorPlay,
  research: PartnershipResearch,
  brandName: string | null,
  retailerName: string | null,
): CreatorPlay {
  const context = buildVerificationContext(research, brandName, retailerName);

  const sanitized: CreatorPlay = {
    ...play,
    opportunitySummary: sanitizeText(play.opportunitySummary, context, research),
    whyKellieShouldCare: sanitizeText(play.whyKellieShouldCare, context, research),
    recommendedStrategy: sanitizeText(play.recommendedStrategy, context, research),
    organicFirstRationale: sanitizeText(play.organicFirstRationale, context, research),
    openingHook: sanitizeHook(play.openingHook, context, research),
    talkingPoints: play.talkingPoints.map((t) => sanitizeText(t, context, research)),
    contentConcepts: play.contentConcepts.map((c) => sanitizeConcept(c, context, research)),
    shotList: sanitizeShotList(play.shotList, context, research),
    bRollSuggestions: play.bRollSuggestions.map((b) => sanitizeText(b, context, research)),
    productsToFeature: play.productsToFeature.map((p) => sanitizeText(p, context, research)),
    brandPositioningToPreserve: play.brandPositioningToPreserve.map((p) => sanitizeText(p, context, research)),
    potentialProblems: dedupe([
      ...play.potentialProblems.map((p) => sanitizeText(p, context, research)),
      ...(context.kcInventoryUnverified
        ? ['KC in-store inventory is not confirmed — do not film assuming local stock.']
        : []),
    ]),
    partnershipPitch: sanitizePitch(play.partnershipPitch, context, research),
    followUpRecommendation: sanitizeFollowUp(play.followUpRecommendation, context, research),
    brandContactResearch: sanitizeText(play.brandContactResearch, context, research),
    researchBeforeFilming: dedupe([
      ...play.researchBeforeFilming,
      ...context.verificationActions,
      ...(context.kcInventoryUnverified
        ? [
            `Before filming, verify whether a Kansas City-area ${retailerName ?? 'retailer'} currently carries ${brandName ?? 'this brand'} inventory in-store.`,
          ]
        : []),
    ]),
  };

  return sanitized;
}

function sanitizeHook(hook: string, context: VerificationContext, research: PartnershipResearch): string {
  const cleaned = sanitizeText(hook, context, research);
  if (!context.kcInventoryUnverified) return cleaned;
  if (impliesKcInventoryConfirmed(cleaned)) {
    return buildSafeHook(context, research);
  }
  return cleaned;
}

export function buildSafeHook(context: VerificationContext, research: PartnershipResearch): string {
  const brand = context.brandName ?? 'this brand';
  const retailer = context.retailerName;

  if (retailer && (isVerifiedField(research.retailerRelationships) || isUsableInferredField(research.retailerRelationships))) {
    const productHint = extractProductHint(research.companySummary.value);
    if (productHint) {
      return `I didn't know ${retailer} carried ${productHint} through ${brand}.`;
    }
    return `I didn't know ${retailer} carried ${brand}.`;
  }

  if (isVerifiedField(research.companySummary) || isUsableInferredField(research.companySummary)) {
    const hint = extractProductHint(research.companySummary.value);
    if (hint) return `I didn't know ${brand} focused on ${hint}.`;
    return `Here's what caught my eye about ${brand}: ${research.companySummary.value!.slice(0, 90).trim()}…`;
  }

  return `Still verifying details, but ${brand} looks like a creator partnership worth exploring.`;
}

function extractProductHint(companySummary: string | null | undefined): string | null {
  if (!companySummary) return null;
  if (/handbag/i.test(companySummary)) return 'authenticated pre-owned luxury bags';
  if (/watch/i.test(companySummary)) return 'authenticated pre-owned luxury watches';
  if (/pre-owned|preowned|authenticated/i.test(companySummary)) return 'authenticated pre-owned luxury pieces';
  return null;
}

function sanitizeConcept(concept: string, context: VerificationContext, research: PartnershipResearch): string {
  const text = sanitizeText(concept, context, research);
  if (!context.kcInventoryUnverified) return text;
  if (/local discovery|in kc|in kansas city|store visit|try-on or product reveal/i.test(text)) {
    return `Verify KC inventory first, then film a ${context.brandName ?? 'brand'}-focused discovery if stock is confirmed.`;
  }
  return text;
}

function sanitizeShotList(
  shotList: string[],
  context: VerificationContext,
  research: PartnershipResearch,
): string[] {
  const filtered = shotList
    .map((s) => sanitizeText(s, context, research))
    .filter((s) => {
      if (!context.kcInventoryUnverified) return true;
      return !/\b(local store|store exterior|in-store|on-site|visit the store)\b/i.test(s);
    });
  if (filtered.length >= 3) return filtered;
  return dedupe([
    ...filtered,
    'Hook on camera explaining what is verified vs still being confirmed',
    'Product/detail close-ups from official site or approved assets',
    'On-screen text listing verification steps before any store visit',
  ]).slice(0, 10);
}

function sanitizePitch(pitch: string, context: VerificationContext, research: PartnershipResearch): string {
  let text = sanitizeText(pitch, context, research);
  if (context.kcInventoryUnverified) {
    text = text.replace(KC_SHOPPING_RE, 'explore a Kansas City-relevant angle after confirming local inventory');
  }
  if (research.creatorProgram.status === 'needs_verification' && /conscious collective|creator program|shopmy/i.test(text)) {
    text = text.replace(/\b(I saw your|your official|the)\s+[^.]+\./gi, 'I am researching your creator program and would love to learn more.');
  }
  return text;
}

function sanitizeFollowUp(followUp: string, context: VerificationContext, research: PartnershipResearch): string {
  const text = sanitizeText(followUp, context, research);
  if (context.kcInventoryUnverified && !/verify|confirm|call first|store locator/i.test(text)) {
    return `Verify KC-area inventory and filming policy first. ${text}`;
  }
  return text;
}

function sanitizeText(
  text: string,
  context: VerificationContext,
  _research: PartnershipResearch,
): string {
  let out = text;
  for (const pattern of context.forbiddenPhrases) {
    out = out.replace(pattern, (match) => rewriteForbiddenPhrase(match, context));
  }
  if (context.kcInventoryUnverified) {
    out = out.replace(KC_SHOPPING_RE, (match) => rewriteForbiddenPhrase(match, context));
    out = out.replace(KC_FILMING_RE, 'verify local inventory before any KC filming');
    out = out.replace(CONFIRMED_IF_RE, 'after KC inventory is verified');
  }
  return out.replace(/\s+/g, ' ').trim();
}

function rewriteForbiddenPhrase(match: string, context: VerificationContext): string {
  const brand = context.brandName ?? 'this brand';
  const retailer = context.retailerName;
  if (retailer) {
    return `explore ${brand} through ${retailer} after verifying KC inventory`;
  }
  return `explore ${brand} after verifying local details`;
}

function impliesKcInventoryConfirmed(text: string): boolean {
  return (
    KC_SHOPPING_RE.test(text) ||
    /\b(at|in)\s+\w+.{0,30}\b(in kc|in kansas city)\b/i.test(text) ||
    /\b(let me show you|come with me|let's go)\b/i.test(text)
  );
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.map((i) => i.trim()).filter(Boolean))];
}
