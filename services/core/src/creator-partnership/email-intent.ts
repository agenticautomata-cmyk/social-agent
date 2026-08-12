export type EmailIntent =
  | 'creator_business'
  | 'platform_creator'
  | 'transactional_account'
  | 'commerce_transactional'
  | 'newsletter_marketing'
  | 'security_auth'
  | 'unknown';

export type EmailIntentClassification = {
  intent: EmailIntent;
  signals: string[];
};

export type EmailIntentInput = {
  subject: string;
  bodyText: string;
  senderDomain?: string | null;
};

const PLATFORM_CREATOR_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /thank you for your (?:shopmy )?application/i, label: 'ShopMy application receipt' },
  { pattern: /thanks for applying to shopmy/i, label: 'ShopMy application receipt' },
  { pattern: /shopmy.*(?:approv(ed|al)|reject|not approved|under review|application received)/i, label: 'ShopMy creator program update' },
  { pattern: /you(?:'|’)?re in[!]?/i, label: 'ShopMy acceptance' },
  { pattern: /welcome to shopmy/i, label: 'ShopMy welcome' },
  { pattern: /(?:application|account)\s+(?:was\s+)?accepted\b/i, label: 'creator program acceptance' },
  { pattern: /complete your (?:shopmy )?(?:profile|setup)/i, label: 'ShopMy setup required' },
  { pattern: /your shopmy (?:creator )?account/i, label: 'ShopMy creator account' },
];

const CREATOR_BUSINESS_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /conscious collective/i, label: 'Conscious Collective program' },
  { pattern: /welcome to the conscious collective/i, label: 'Conscious Collective welcome' },
  { pattern: /\bcreator program\b/i, label: 'creator program' },
  { pattern: /\bcreator partnership\b/i, label: 'creator partnership' },
  { pattern: /\b(?:influencer|ambassador|affiliate)\b/i, label: 'creator role' },
  { pattern: /\b(?:collaboration|partnership|sponsorship)\b/i, label: 'partnership language' },
  { pattern: /\b(?:campaign|gifting|gifted|ugc)\b/i, label: 'creator campaign language' },
  { pattern: /\bmedia kit\b/i, label: 'media kit' },
  { pattern: /\b(?:rate card|rates|commission)\b/i, label: 'creator rates/commission' },
  { pattern: /application.{0,40}(?:creator|program|collective|ambassador)/i, label: 'creator program application' },
];

const SECURITY_AUTH_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /verify your email/i, label: 'verify your email' },
  { pattern: /email address verification/i, label: 'email address verification' },
  { pattern: /email verification/i, label: 'email verification' },
  { pattern: /confirm your email/i, label: 'confirm your email' },
  { pattern: /password reset/i, label: 'password reset' },
  { pattern: /reset your password/i, label: 'reset your password' },
  { pattern: /(?:two-factor|2fa|security code)/i, label: 'security auth' },
];

const TRANSACTIONAL_ACCOUNT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /customer account confirmation/i, label: 'customer account confirmation' },
  { pattern: /confirm your account/i, label: 'confirm your account' },
  { pattern: /activate (?:your )?account/i, label: 'activate account' },
  { pattern: /account confirmation/i, label: 'account confirmation' },
  { pattern: /create your account/i, label: 'create your account' },
  { pattern: /\bcustomer account\b/i, label: 'customer account' },
];

const COMMERCE_TRANSACTIONAL_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /order confirmation/i, label: 'order confirmation' },
  { pattern: /order number/i, label: 'order number' },
  { pattern: /your order has (?:shipped|been shipped)/i, label: 'order shipped' },
  { pattern: /\b(?:shipping|delivery)\b/i, label: 'shipping/delivery' },
  { pattern: /\breceipt\b/i, label: 'receipt' },
  { pattern: /tracking number/i, label: 'tracking number' },
];

const NEWSLETTER_MARKETING_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /newsletter confirmation/i, label: 'newsletter confirmation' },
  { pattern: /subscription confirmed/i, label: 'subscription confirmed' },
  { pattern: /\bunsubscribe\b/i, label: 'unsubscribe' },
  { pattern: /marketing preferences/i, label: 'marketing preferences' },
  { pattern: /manage your (?:email )?preferences/i, label: 'email preferences' },
];

/** Strong creator-business vocabulary — brand mention alone is insufficient without these. */
export const CREATOR_BUSINESS_SIGNALS: RegExp[] = [
  /\bcreator\b/i,
  /\binfluencer\b/i,
  /\bambassador\b/i,
  /\baffiliate\b/i,
  /\bcollaboration\b/i,
  /\bpartnership\b/i,
  /\bcampaign\b/i,
  /\bgifting\b/i,
  /\bgifted\b/i,
  /\bugc\b/i,
  /\bmedia kit\b/i,
  /\brates\b/i,
  /\bsponsorship\b/i,
  /\bcommission\b/i,
  /\bconscious collective\b/i,
  /\bshopmy\b/i,
  /\bstorefront\b/i,
  /application.{0,40}(?:creator|program|collective|ambassador)/i,
];

/** Transactional boilerplate that must override weak brand-only matches. */
export const TRANSACTIONAL_NEGATIVE_SIGNALS: RegExp[] = [
  /customer account/i,
  /confirm your account/i,
  /verify your email/i,
  /email verification/i,
  /password reset/i,
  /order confirmation/i,
  /order number/i,
  /\bshipping\b/i,
  /\bdelivery\b/i,
  /\breceipt\b/i,
  /\bwishlist\b/i,
  /newsletter confirmation/i,
  /subscription confirmed/i,
  /\bunsubscribe\b/i,
  /activate account/i,
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function matchPatterns(
  blob: string,
  patterns: Array<{ pattern: RegExp; label: string }>,
): string[] {
  const hits: string[] = [];
  for (const { pattern, label } of patterns) {
    if (pattern.test(blob)) hits.push(label);
  }
  return hits;
}

export function hasCreatorBusinessContext(blob: string): boolean {
  const normalized = normalize(blob);
  return CREATOR_BUSINESS_SIGNALS.some((pattern) => pattern.test(normalized));
}

export function hasTransactionalNegativeSignal(blob: string): boolean {
  const normalized = normalize(blob);
  return TRANSACTIONAL_NEGATIVE_SIGNALS.some((pattern) => pattern.test(normalized));
}

export function classifyEmailIntent(input: EmailIntentInput): EmailIntentClassification {
  const blob = normalize(`${input.subject} ${input.bodyText}`);

  const platformSignals = matchPatterns(blob, PLATFORM_CREATOR_PATTERNS);
  if (platformSignals.length > 0) {
    return { intent: 'platform_creator', signals: platformSignals };
  }

  const creatorSignals = matchPatterns(blob, CREATOR_BUSINESS_PATTERNS);
  if (creatorSignals.length > 0) {
    return { intent: 'creator_business', signals: creatorSignals };
  }

  const securitySignals = matchPatterns(blob, SECURITY_AUTH_PATTERNS);
  if (securitySignals.length > 0) {
    return { intent: 'security_auth', signals: securitySignals };
  }

  const accountSignals = matchPatterns(blob, TRANSACTIONAL_ACCOUNT_PATTERNS);
  if (accountSignals.length > 0) {
    return { intent: 'transactional_account', signals: accountSignals };
  }

  const commerceSignals = matchPatterns(blob, COMMERCE_TRANSACTIONAL_PATTERNS);
  if (commerceSignals.length > 0) {
    return { intent: 'commerce_transactional', signals: commerceSignals };
  }

  const newsletterSignals = matchPatterns(blob, NEWSLETTER_MARKETING_PATTERNS);
  if (newsletterSignals.length > 0) {
    return { intent: 'newsletter_marketing', signals: newsletterSignals };
  }

  return { intent: 'unknown', signals: [] };
}

const PARTNERSHIP_BLOCKED_INTENTS: EmailIntent[] = [
  'transactional_account',
  'commerce_transactional',
  'newsletter_marketing',
  'security_auth',
  'platform_creator',
];

export function shouldBlockPartnershipMatching(
  classification: EmailIntentClassification,
  linkedPartnershipIds: string[] | undefined,
): boolean {
  if (linkedPartnershipIds?.length) return false;
  return PARTNERSHIP_BLOCKED_INTENTS.includes(classification.intent);
}

export function shouldAllowPlatformMatching(classification: EmailIntentClassification): boolean {
  return classification.intent === 'platform_creator';
}

export function requiresCreatorBusinessEvidence(classification: EmailIntentClassification): boolean {
  return classification.intent === 'unknown';
}
