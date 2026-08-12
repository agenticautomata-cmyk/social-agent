import type { CreatorContactChannelId } from '../creator-info/channels.js';
import { headerValue } from './client.js';
import { resolveInboundChannelFromHeaders, type InboundChannelResolution } from './resolve-channel.js';

export type EmailCategory =
  | 'discovery'
  | 'sponsor'
  | 'collaboration'
  | 'booking'
  | 'media'
  | 'general_contact'
  | 'security';

export type DiscoveryIntent =
  | 'discovery_subscription_confirmation'
  | 'discovery_subscription_welcome'
  | 'discovery_opportunity'
  | 'discovery_marketing'
  | 'discovery_other';

export type InboxFilterCategory = EmailCategory | 'subscription_confirmation';

const CHANNEL_TO_CATEGORY: Record<CreatorContactChannelId | 'discoveries', EmailCategory> = {
  discoveries: 'discovery',
  sponsors: 'sponsor',
  collabs: 'collaboration',
  booking: 'booking',
  media: 'media',
  contact: 'general_contact',
};

const TELEGRAM_HEADINGS: Record<EmailCategory | 'subscription_confirmation', string> = {
  discovery: 'Benson · discovery inbox',
  sponsor: '🚨 Benson · SPONSOR inbox — high urgency',
  collaboration: 'Benson · collaboration inbox',
  booking: 'Benson · booking inbox',
  media: 'Benson · media inbox',
  general_contact: 'Benson · contact inbox',
  security: 'Benson · security alert',
  subscription_confirmation: 'Benson · subscription confirmation',
};

const SECURITY_FROM_DOMAINS = [
  'accounts.google.com',
  'google.com',
  'no-reply@accounts.google.com',
  'apple.com',
  'id.apple.com',
  'microsoft.com',
  'accountprotection.microsoft.com',
];

const SECURITY_SUBJECT_PATTERNS = [
  /\bsecurity alert\b/i,
  /\bsuspicious sign[- ]in\b/i,
  /\bnew sign[- ]in\b/i,
  /\bverify (?:it was you|your identity)\b/i,
  /\bunusual activity\b/i,
  /\bpassword (?:was )?changed\b/i,
  /\btwo[- ]factor\b/i,
  /\b2[- ]step verification\b/i,
];

const WELCOME_PATTERNS = [
  /\bwelcome(?: aboard| to)?\b/i,
  /\byou(?:'| a)?re subscribed\b/i,
  /\bthanks for subscribing\b/i,
  /\bsuccessfully subscribed\b/i,
  /\byour subscription is confirmed\b/i,
  /\bglad you(?:'| a)?re here\b/i,
];

const CONFIRMATION_PATTERNS = [
  /\bconfirm(?:ation)?\s+(?:your\s+)?(?:email|subscription|registration|signup|sign-up|address|list)\b/i,
  /\bverify(?:\s+your)?\s+(?:email|subscription|registration|address)\b/i,
  /\bcomplete\s+your\s+(?:signup|sign-up|registration|subscription)\b/i,
  /\bactivate\s+your\s+(?:subscription|account|membership|list)\b/i,
  /\bdouble\s+opt-?in\b/i,
  /\bconfirm\s+email\b/i,
  /\benter\s+(?:this\s+)?verification\s+code\b/i,
];

const OPPORTUNITY_PATTERNS = [
  /\bgrand opening\b/i,
  /\bopening soon\b/i,
  /\bpress release\b/i,
  /\bribbon cutting\b/i,
  /\bnew (?:restaurant|shop|store|venue|event)\b/i,
  /\bevent\b/i,
  /\bdeal\b/i,
  /\bdiscount\b/i,
  /\bannouncement\b/i,
  /\bticket(?:s)? on sale\b/i,
  /\bclosing\b/i,
  /\bcoming to\b/i,
];

const MARKETING_PATTERNS = [
  /\bsale\b/i,
  /\bpromotion\b/i,
  /\blimited[- ]time\b/i,
  /\bshop now\b/i,
  /\b\d+% off\b/i,
  /\bnewsletter\b/i,
];

export function channelToCategory(
  channelId: CreatorContactChannelId | 'discoveries' | null | undefined,
): EmailCategory | null {
  if (!channelId) return null;
  return CHANNEL_TO_CATEGORY[channelId] ?? null;
}

export function telegramHeadingForCategory(
  category: EmailCategory | 'subscription_confirmation',
): string {
  return TELEGRAM_HEADINGS[category];
}

export function isSecurityEmail(input: {
  subject: string;
  bodyText?: string;
  fromEmail?: string | null;
}): boolean {
  const from = input.fromEmail?.toLowerCase() ?? '';
  if (SECURITY_FROM_DOMAINS.some((domain) => from.includes(domain))) {
    if (SECURITY_SUBJECT_PATTERNS.some((p) => p.test(input.subject))) return true;
  }
  return SECURITY_SUBJECT_PATTERNS.some((p) => p.test(input.subject));
}

export function classifyDiscoveryIntent(input: {
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
}): DiscoveryIntent {
  const blob = [input.subject, input.bodyText ?? '', input.bodyHtml ?? ''].join('\n');

  if (CONFIRMATION_PATTERNS.some((p) => p.test(blob))) {
    return 'discovery_subscription_confirmation';
  }
  if (WELCOME_PATTERNS.some((p) => p.test(blob))) {
    return 'discovery_subscription_welcome';
  }
  if (OPPORTUNITY_PATTERNS.some((p) => p.test(blob))) {
    return 'discovery_opportunity';
  }
  if (MARKETING_PATTERNS.some((p) => p.test(blob))) {
    return 'discovery_marketing';
  }
  return 'discovery_other';
}

export type ClassifiedInboundEmail = {
  channelId: CreatorContactChannelId | 'discoveries' | null;
  emailCategory: EmailCategory;
  discoveryIntent: DiscoveryIntent | null;
  originalRecipient: string | null;
  matchedHeader: string | null;
  inboxFilter: InboxFilterCategory | 'subscription_confirmation';
};

export function classifyInboundEmail(input: {
  headers?: Array<{ name?: string; value?: string }>;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  fromEmail?: string | null;
  fallbackCategory?: EmailCategory;
}): ClassifiedInboundEmail {
  const resolution = resolveInboundChannelFromHeaders(input.headers);
  const originalRecipient = resolution?.matchedEmail ?? null;
  const matchedHeader = resolution?.matchedHeader ?? null;

  if (isSecurityEmail({ subject: input.subject, bodyText: input.bodyText, fromEmail: input.fromEmail })) {
    return {
      channelId: resolution?.channelId ?? null,
      emailCategory: 'security',
      discoveryIntent: null,
      originalRecipient,
      matchedHeader,
      inboxFilter: 'security',
    };
  }

  const channelCategory = channelToCategory(resolution?.channelId);
  const emailCategory = channelCategory ?? input.fallbackCategory ?? 'general_contact';

  if (emailCategory === 'discovery') {
    const discoveryIntent = classifyDiscoveryIntent(input);
    return {
      channelId: 'discoveries',
      emailCategory: 'discovery',
      discoveryIntent,
      originalRecipient,
      matchedHeader,
      inboxFilter:
        discoveryIntent === 'discovery_subscription_confirmation'
          ? 'subscription_confirmation'
          : 'discovery',
    };
  }

  return {
    channelId: resolution?.channelId ?? null,
    emailCategory,
    discoveryIntent: null,
    originalRecipient,
    matchedHeader,
    inboxFilter: emailCategory,
  };
}

export function subscriptionConfirmationTelegramStatus(input: {
  verificationResult?: string | null;
  status?: string | null;
  manualReviewReason?: string | null;
}): string {
  if (input.verificationResult === 'success' || input.status === 'verified' || input.status === 'active') {
    return 'verified automatically';
  }
  if (input.status === 'manual_action_required' || input.manualReviewReason) {
    return 'needs manual confirmation';
  }
  if (input.verificationResult === 'failed' || input.status === 'verification_failed') {
    return 'verification failed';
  }
  return 'needs manual confirmation';
}

export function formatTelegramDigestBody(input: {
  category: EmailCategory | 'subscription_confirmation';
  messages: Array<{ fromName?: string | null; fromEmail?: string | null; subject?: string | null }>;
  summaryText: string;
  inboxUrl: string;
  verificationStatusLine?: string | null;
}): string {
  const heading = telegramHeadingForCategory(input.category);
  const count = input.messages.length;
  const statusLine = input.verificationStatusLine ? `\n${input.verificationStatusLine}` : '';
  return `${heading} (${count} new)${statusLine}\n\n${input.summaryText}\n\n→ ${input.inboxUrl}`;
}

export function resolveFromHeaders(input: {
  headers?: Array<{ name?: string; value?: string }>;
}): InboundChannelResolution | null {
  return resolveInboundChannelFromHeaders(input.headers);
}

export function headerRecipientDebug(headers?: Array<{ name?: string; value?: string }>): string | null {
  for (const name of ['Delivered-To', 'To', 'X-Original-To'] as const) {
    const value = headerValue(headers, name);
    if (value) return value;
  }
  return null;
}
