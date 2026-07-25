import {
  BLOCKED_CONFIRMATION_PATTERNS,
  CONFIRMATION_BODY_PATTERNS,
  CONFIRMATION_SUBJECT_PATTERNS,
  type DiscoveryMessageKind,
} from './constants.js';

export type DiscoveryEmailClassification = {
  kind: DiscoveryMessageKind;
  blockedReason?: string;
  requiresManualReview?: boolean;
};

function blob(input: { subject: string; bodyText: string; bodyHtml?: string }): string {
  return [input.subject, input.bodyText, input.bodyHtml ?? ''].join('\n');
}

export function isBlockedConfirmationEmail(input: {
  subject: string;
  bodyText: string;
  bodyHtml?: string;
}): string | null {
  const text = blob(input);
  for (const pattern of BLOCKED_CONFIRMATION_PATTERNS) {
    if (pattern.test(text)) {
      return pattern.source;
    }
  }
  return null;
}

export function looksLikeSubscriptionConfirmation(input: {
  subject: string;
  bodyText: string;
  bodyHtml?: string;
}): boolean {
  const text = blob(input);
  if (CONFIRMATION_SUBJECT_PATTERNS.some((p) => p.test(input.subject))) return true;
  if (CONFIRMATION_BODY_PATTERNS.some((p) => p.test(text))) return true;
  return false;
}

export function classifyDiscoveryEmail(input: {
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  senderEmail?: string | null;
}): DiscoveryEmailClassification {
  const blocked = isBlockedConfirmationEmail(input);
  if (blocked) {
    return {
      kind: 'discovery_subscription_confirmation',
      blockedReason: blocked,
      requiresManualReview: true,
    };
  }

  if (looksLikeSubscriptionConfirmation(input)) {
    return { kind: 'discovery_subscription_confirmation' };
  }

  return { kind: 'opportunity_signal' };
}
