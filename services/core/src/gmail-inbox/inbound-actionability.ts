import {
  classifyEmailIntent,
  hasCreatorBusinessContext,
  hasTransactionalNegativeSignal,
  type EmailIntent,
} from '../creator-partnership/email-intent.js';

export type EmailActionability =
  | 'reply_required'
  | 'user_action_required'
  | 'waiting_followup'
  | 'none';

export type InboundActionabilityInput = {
  subject: string;
  bodyText: string;
  senderDomain?: string | null;
  matchKind: string;
  outreachEmailId?: string | null;
  verifiedOutreachThread?: boolean;
};

export type InboundActionabilityResult = {
  emailIntent: EmailIntent;
  actionability: EmailActionability;
  intentSignals: string[];
};

const BLOCKED_REPLY_INTENTS: EmailIntent[] = [
  'security_auth',
  'transactional_account',
  'commerce_transactional',
  'newsletter_marketing',
];

const WAITING_FOLLOWUP_PATTERNS = [
  /\b(?:application|submission)\s+(?:has been\s+)?received\b/i,
  /\b(?:application|submission)\s+(?:is\s+)?pending\b/i,
  /\b(?:application|submission)\s+(?:is\s+)?under review\b/i,
  /\bwe(?:'re| are)\s+reviewing\s+your\s+(?:application|submission)\b/i,
  /\bwe(?:'ll| will)\s+(?:contact|reach out to)\s+you\b/i,
  /\byou(?:'ll| will)\s+hear\s+(?:from us|back)\b/i,
  /\bthanks?\s+for\s+(?:applying|your application|your submission)\b/i,
];

const RESPONSE_REQUIRED_PATTERNS = [
  /\?/,
  /\b(?:can|could|would|will)\s+you\b/i,
  /\bplease\s+(?:send|share|provide|confirm|reply|respond|let us know|review|sign|complete)\b/i,
  /\b(?:send|share|provide)\s+(?:your\s+)?(?:dates?|availability|rates?|rate card|assets?|media kit|information|details)\b/i,
  /\b(?:what|when|where|which|how)\s+(?:is|are|do|does|did|can|could|would|will)\b/i,
  /\b(?:confirm|confirmation)\s+(?:the|your|whether|if)\b/i,
  /\b(?:does this|do these|are these)\s+(?:terms?|rates?|dates?)\b/i,
  /\b(?:accept|approve|agree to|counter)\s+(?:the|these|our)\s+(?:terms?|offer|proposal)\b/i,
];

const INFORMATIONAL_PATTERNS = [
  /\b(?:fyi|for your information|just an update|heads up)\b/i,
  /\bno\s+(?:action|response|reply)\s+(?:is\s+)?(?:needed|required)\b/i,
];

function isVerifiedOutreachThread(input: InboundActionabilityInput): boolean {
  if (input.verifiedOutreachThread === true) return true;
  return Boolean(input.outreachEmailId && input.matchKind === 'outreach_reply');
}

function matchesAny(blob: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(blob));
}

export function resolveInboundActionability(
  input: InboundActionabilityInput,
): InboundActionabilityResult {
  const classification = classifyEmailIntent({
    subject: input.subject,
    bodyText: input.bodyText,
    senderDomain: input.senderDomain,
  });
  const blob = `${input.subject}\n${input.bodyText}`;
  const verifiedThread = isVerifiedOutreachThread(input);

  if (BLOCKED_REPLY_INTENTS.includes(classification.intent)) {
    return {
      emailIntent: classification.intent,
      actionability: 'none',
      intentSignals: classification.signals,
    };
  }

  if (matchesAny(blob, WAITING_FOLLOWUP_PATTERNS)) {
    return {
      emailIntent: classification.intent,
      actionability: 'waiting_followup',
      intentSignals: classification.signals,
    };
  }

  if (classification.intent === 'platform_creator') {
    return {
      emailIntent: classification.intent,
      actionability: 'waiting_followup',
      intentSignals: classification.signals,
    };
  }

  const responseRequired = matchesAny(blob, RESPONSE_REQUIRED_PATTERNS);
  if (matchesAny(blob, INFORMATIONAL_PATTERNS) && !responseRequired) {
    return {
      emailIntent: classification.intent,
      actionability: 'none',
      intentSignals: classification.signals,
    };
  }

  if (classification.intent === 'creator_business') {
    if (responseRequired || verifiedThread) {
      return {
        emailIntent: classification.intent,
        actionability: 'reply_required',
        intentSignals: classification.signals,
      };
    }
    return {
      emailIntent: classification.intent,
      actionability: 'none',
      intentSignals: classification.signals,
    };
  }

  if (verifiedThread) {
    return {
      emailIntent: classification.intent,
      actionability: 'reply_required',
      intentSignals: classification.signals,
    };
  }

  if (hasCreatorBusinessContext(blob) && !hasTransactionalNegativeSignal(blob)) {
    return {
      emailIntent: classification.intent,
      actionability: 'reply_required',
      intentSignals: classification.signals,
    };
  }

  return {
    emailIntent: classification.intent,
    actionability: 'none',
    intentSignals: classification.signals,
  };
}

export function isReplyActionable(
  actionability: EmailActionability | string | null | undefined,
): boolean {
  return actionability === 'reply_required';
}

export function senderDomainFromEmail(fromEmail: string | null | undefined): string | null {
  if (!fromEmail) return null;
  const at = fromEmail.lastIndexOf('@');
  if (at < 0) return null;
  return fromEmail.slice(at + 1).toLowerCase() || null;
}
