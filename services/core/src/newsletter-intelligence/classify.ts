import { domainFromUrl, rootDomain } from '../discovery-subscriptions/extract.js';
import {
  NEWSLETTER_CATEGORIES,
  PROCESSABLE_NEWSLETTER_CATEGORIES,
  type NewsletterCategory,
} from './types.js';

const TRANSACTIONAL_PATTERNS = [
  /\border confirmation\b/i,
  /\breceipt\b/i,
  /\binvoice\b/i,
  /\bshipping confirmation\b/i,
  /\bdelivery update\b/i,
  /\byour password\b/i,
  /\breset your password\b/i,
  /\baccount statement\b/i,
  /\bpayment (?:received|processed)\b/i,
];

const PERSONAL_PATTERNS = [
  /\bre:\b/i,
  /\bfwd:\b/i,
  /\bfw:\b/i,
];

const SPAM_PATTERNS = [
  /\bunsubscribe\b.*\bviagra\b/i,
  /\bclick here to claim\b/i,
  /\byou(?:'| ha)?ve won\b/i,
];

const RESTAURANT_PATTERNS = [
  /\brestaurant\b/i,
  /\bdining\b/i,
  /\bmenu\b/i,
  /\bchef\b/i,
  /\bbrunch\b/i,
  /\bfood\b/i,
  /\btasting\b/i,
  /\bhappy hour\b/i,
];

const RETAIL_PATTERNS = [
  /\bsale\b/i,
  /\bretail\b/i,
  /\bstore\b/i,
  /\bshop(?:ping)?\b/i,
  /\bclearance\b/i,
  /\b\d+% off\b/i,
  /\bmall\b/i,
  /\bboutique\b/i,
];

const VENUE_EVENT_PATTERNS = [
  /\bconcert\b/i,
  /\bevent\b/i,
  /\bvenue\b/i,
  /\btickets?\b/i,
  /\bfestival\b/i,
  /\bshow\b/i,
  /\bperformance\b/i,
  /\btheatre\b/i,
  /\btheater\b/i,
];

const TOURISM_PATTERNS = [
  /\bvisit kc\b/i,
  /\bvisitkc\b/i,
  /\btourism\b/i,
  /\bthings to do\b/i,
  /\bweekend guide\b/i,
  /\bcommunity calendar\b/i,
  /\broundup\b/i,
];

const CHAMBER_PATTERNS = [
  /\bchamber of commerce\b/i,
  /\bbusiness journal\b/i,
  /\bmember news\b/i,
  /\bribbon cutting\b/i,
];

const SHOPPING_CENTER_PATTERNS = [
  /\bshopping center\b/i,
  /\bplaza\b/i,
  /\boutlet\b/i,
  /\bstrip mall\b/i,
  /\btenant\b/i,
];

const CURATOR_PATTERNS = [
  /\bcurator\b/i,
  /\bcreator\b/i,
  /\binfluencer\b/i,
  /\broundup\b/i,
  /\bfeatured creators\b/i,
];

const NEWSLETTER_SIGNAL_PATTERNS = [
  /\bnewsletter\b/i,
  /\bthis week(?:'s| in)\b/i,
  /\bwhat(?:'s| is) (?:new|happening)\b/i,
  /\bevents this (?:week|weekend|month)\b/i,
  /\bnew openings\b/i,
  /\bupcoming events\b/i,
];

export function senderDomainFromEmail(email: string | null | undefined): string | null {
  if (!email?.includes('@')) return null;
  return email.split('@')[1]?.toLowerCase().trim() ?? null;
}

export function classifyNewsletterEmail(input: {
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  senderEmail?: string | null;
  senderName?: string | null;
  fromActiveSubscription?: boolean;
}): NewsletterCategory {
  const blob = [input.subject, input.bodyText ?? '', input.bodyHtml ?? '', input.senderName ?? ''].join('\n');
  const domain = senderDomainFromEmail(input.senderEmail) ?? '';
  const root = domain ? rootDomain(domain) : '';

  if (SPAM_PATTERNS.some((p) => p.test(blob))) return 'spam_noise';
  if (TRANSACTIONAL_PATTERNS.some((p) => p.test(blob))) return 'transactional_email';
  if (PERSONAL_PATTERNS.some((p) => p.test(input.subject)) && !input.fromActiveSubscription) {
    return 'personal_email';
  }

  const scores: Partial<Record<NewsletterCategory, number>> = {};

  const bump = (cat: NewsletterCategory, n = 1) => {
    scores[cat] = (scores[cat] ?? 0) + n;
  };

  if (RESTAURANT_PATTERNS.some((p) => p.test(blob))) bump('restaurant_newsletter', 2);
  if (RETAIL_PATTERNS.some((p) => p.test(blob))) bump('retail_newsletter', 2);
  if (VENUE_EVENT_PATTERNS.some((p) => p.test(blob))) bump('venue_event_newsletter', 2);
  if (TOURISM_PATTERNS.some((p) => p.test(blob)) || /visitkc\.com/i.test(root)) {
    bump('tourism_community_roundup', 3);
  }
  if (CHAMBER_PATTERNS.some((p) => p.test(blob))) bump('chamber_business_newsletter', 2);
  if (SHOPPING_CENTER_PATTERNS.some((p) => p.test(blob))) bump('shopping_center_newsletter', 2);
  if (CURATOR_PATTERNS.some((p) => p.test(blob))) bump('creator_curator_roundup', 2);
  if (NEWSLETTER_SIGNAL_PATTERNS.some((p) => p.test(blob))) bump('local_newsletter', 1);
  if (input.fromActiveSubscription) bump('local_newsletter', 2);

  const ranked = Object.entries(scores).sort((a, b) => b[1]! - a[1]!) as [NewsletterCategory, number][];
  if (ranked[0]?.[1]) return ranked[0][0];

  if (input.fromActiveSubscription || NEWSLETTER_SIGNAL_PATTERNS.some((p) => p.test(blob))) {
    return 'local_newsletter';
  }

  return 'spam_noise';
}

export function isProcessableNewsletterCategory(category: NewsletterCategory): boolean {
  return (PROCESSABLE_NEWSLETTER_CATEGORIES as readonly string[]).includes(category);
}

export function newsletterCategoryLabel(category: NewsletterCategory): string {
  return category.replace(/_/g, ' ');
}

export function isKnownNewsletterDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  const root = rootDomain(domain);
  const known = [
    'visitkc.com',
    'kansascity.com',
    'thepitchkc.com',
    'feastmagazine.com',
    'inkansascity.com',
    'kcur.org',
    'flatlandkc.org',
  ];
  return known.some((d) => root === d || domain.endsWith(`.${d}`));
}

export function domainFromSenderOrUrl(email: string | null | undefined, url?: string | null): string | null {
  return senderDomainFromEmail(email) ?? (url ? domainFromUrl(url) : null);
}

export { NEWSLETTER_CATEGORIES, PROCESSABLE_NEWSLETTER_CATEGORIES };
