import { createHash } from 'node:crypto';
import { normalizeBusinessKey } from './classify-entity.js';
import { evaluateAngleForInventory } from './match-angle.js';
import type { AngleMatchResult } from './types.js';
import type { InventoryItem } from '../inventory/normalize.js';
import { classifyContactVerification, evaluatePitchReadiness } from '../creator-agent/pitch-readiness.js';
import type { PitchReadinessStatus } from '../creator-agent/types.js';

const DATE_NIGHT_RE = /\bdate night\b/i;
const LUXURY_DATE_NIGHT_RE = /\bluxury date night\b/i;

export type DraftQualityResult = {
  showToKellie: boolean;
  pitchReadinessStatus: PitchReadinessStatus;
  blockedReasons: string[];
  angleFamily: string;
};

export function draftUsesDateNightLanguage(subject: string, body: string): boolean {
  return DATE_NIGHT_RE.test(subject) || DATE_NIGHT_RE.test(body);
}

export function draftUsesLuxuryDateNightLanguage(subject: string, body: string): boolean {
  return LUXURY_DATE_NIGHT_RE.test(subject) || LUXURY_DATE_NIGHT_RE.test(body);
}

export function evaluateDraftQuality(input: {
  subject: string;
  body: string;
  angle: AngleMatchResult;
  contactEmail?: string | null;
  contactName?: string | null;
  businessName: string;
  duplicateUnresolvedOutreach?: boolean;
}): DraftQualityResult {
  const blockedReasons: string[] = [];

  if (!input.angle.valid || input.angle.family === 'no_valid_angle') {
    blockedReasons.push('no_valid_angle');
  }

  if (draftUsesLuxuryDateNightLanguage(input.subject, input.body) && !input.angle.dateNightEligible) {
    blockedReasons.push('luxury_date_night_not_eligible');
  } else if (draftUsesDateNightLanguage(input.subject, input.body) && !input.angle.dateNightEligible) {
    blockedReasons.push('date_night_not_eligible');
  }

  if (input.angle.entityType === 'article' && /\bgrand opening\b/i.test(input.subject + input.body)) {
    blockedReasons.push('article_misclassified_as_restaurant_opening');
  }

  const verification = classifyContactVerification({
    email: input.contactEmail,
    contactName: input.contactName,
  });

  const hasConcreteAngle = input.angle.valid && blockedReasons.length === 0;
  const pitchReadinessStatus = evaluatePitchReadiness({
    businessName: input.businessName,
    contactVerificationStatus: verification,
    hasPersonalizedDraft: input.subject.trim().length > 8 && input.body.trim().length > 40,
    hasConcreteAngle,
    hasDeliverableValueProp: Boolean(input.angle.sponsorshipAsk && input.angle.sponsorshipAsk !== 'NO VALID ANGLE'),
    hasTimingReason: input.angle.explanation.length > 0,
    sendMechanismAvailable: Boolean(input.contactEmail?.trim()),
    suppressed: false,
    stale: false,
    duplicateUnresolvedOutreach: input.duplicateUnresolvedOutreach ?? false,
  });

  if (blockedReasons.length > 0 && pitchReadinessStatus === 'pitch_ready') {
    blockedReasons.push('invalid_angle_blocks_pitch_ready');
  }

  const showToKellie =
    blockedReasons.length === 0 &&
    pitchReadinessStatus !== 'needs_angle' &&
    input.angle.family !== 'no_valid_angle';

  return {
    showToKellie,
    pitchReadinessStatus: blockedReasons.length > 0 ? 'needs_angle' : pitchReadinessStatus,
    blockedReasons,
    angleFamily: input.angle.family,
  };
}

export function duplicateDraftFingerprint(input: {
  businessName: string;
  subject: string;
  body: string;
  angleFamily: string;
}): string {
  const normalized = [
    input.businessName.toLowerCase().trim(),
    input.angleFamily,
    input.subject.toLowerCase().replace(/\s+/g, ' ').trim(),
    input.body.toLowerCase().replace(/\s+/g, ' ').slice(0, 400),
  ].join('|');
  return createHash('sha256').update(normalized).digest('hex').slice(0, 20);
}

function normalizeSubject(subject: string): string {
  return subject.toLowerCase().replace(/\s+/g, ' ').trim();
}

function subjectSimilarity(a: string, b: string): boolean {
  const left = normalizeSubject(a);
  const right = normalizeSubject(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  const leftTokens = new Set(left.split(' ').filter((token) => token.length > 3));
  const rightTokens = right.split(' ').filter((token) => token.length > 3);
  if (leftTokens.size === 0 || rightTokens.length === 0) return false;
  const overlap = rightTokens.filter((token) => leftTokens.has(token)).length;
  return overlap / Math.max(leftTokens.size, rightTokens.length) >= 0.7;
}

export function isNearDuplicateDraft(
  a: { businessName: string; subject: string; body: string; angleFamily: string },
  b: { businessName: string; subject: string; body: string; angleFamily: string },
): boolean {
  if (normalizeBusinessKey(a.businessName) !== normalizeBusinessKey(b.businessName)) return false;
  if (a.angleFamily !== b.angleFamily) return false;
  if (duplicateDraftFingerprint(a) === duplicateDraftFingerprint(b)) return true;
  return subjectSimilarity(a.subject, b.subject);
}

export function evaluateInventoryDraftGate(item: InventoryItem): {
  angle: AngleMatchResult;
  allowed: boolean;
  skipReason?: string;
} {
  const angle = evaluateAngleForInventory(item);
  if (!angle.valid || angle.family === 'no_valid_angle') {
    return { angle, allowed: false, skipReason: 'no_valid_angle' };
  }
  return { angle, allowed: true };
}
