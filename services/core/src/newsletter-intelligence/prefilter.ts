import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rootDomain } from '../discovery-subscriptions/extract.js';
import { isNewsWeatherAlertContent, isNewsSignalOnlySender } from './news-exclusions.js';
import { NATIONAL_RETAIL_DOMAINS } from './product-collapse.js';
import {
  isAllowedRetailException,
  resolveSenderPolicy,
  type SenderPolicyKind,
} from './sender-policies.js';
import { NEWSLETTER_PREFILTER_VERSION } from './version.js';
import type { NewsletterCategory } from './types.js';

export type PrefilterRejectReason =
  | 'product_catalog'
  | 'percent_off_offer'
  | 'bogo_offer'
  | 'free_shipping_promo'
  | 'menu_item_promotion'
  | 'account_order_notice'
  | 'national_campaign_no_kc'
  | 'news_digest'
  | 'weather_alert'
  | 'political_digest'
  | 'previously_ignored_sender'
  | 'product_sales'
  | 'no_event_signal';

export type PrefilterResult =
  | { pass: true }
  | {
      pass: false;
      reason: PrefilterRejectReason;
      detail: string;
      contentHash: string;
      ruleVersion: string;
    };

export type PrefilterRejectRecord = {
  status: 'rejected_pre_llm';
  gmailMessageId: string;
  contentHash: string;
  reason: PrefilterRejectReason;
  detail: string;
  ruleVersion: string;
  tokenUsage: 0;
  rejectedAt: string;
};

const REJECT_CACHE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../.cache/newsletter-prefilter-rejects',
);

const PRODUCT_CATALOG_PATTERNS = [
  /\bshop (?:the|our) (?:sale|collection|catalog)\b/i,
  /\bnew arrivals?\b/i,
  /\bproduct catalog\b/i,
  /\b\d+\s+items?\s+(?:on sale|starting at)\b/i,
  /\b(?:buy|shop) now\b/i,
  /\badd to cart\b/i,
  /\b(?:mini |pocket )?stapler\b/i,
  /\b(?:graphic tees?|hoodies?|sweatshirts?|backpacks?)\b/i,
];

const PERCENT_OFF_PATTERNS = [
  /\b\d{1,3}%\s*off\b/i,
  /\bsave up to \d{1,3}%\b/i,
  /\bup to \d{1,3}% off\b/i,
  /\bsitewide sale\b/i,
  /\bclearance event\b/i,
  /\bclearance\b/i,
  /\bflash sale\b/i,
  /\b\d+\s*for\s*1\b/i,
  /\bbest brands drop\b/i,
  /\bnew clearance\b/i,
];

const BOGO_PATTERNS = [/\bbogo\b/i, /\bbuy one get one\b/i, /\bbuy 1 get 1\b/i];

const FREE_SHIPPING_PATTERNS = [
  /\bfree shipping\b/i,
  /\bno shipping fees?\b/i,
  /\bfree delivery on orders\b/i,
];

const MENU_PROMO_PATTERNS = [
  /\b(?:\$?\d+(?:\.\d{2})?\s+)?(?:burger|pizza|taco|wings|appetizer|entree|dessert|drink special)\b/i,
  /\b(?:2-for-1|two for one)\s+(?:burgers|pizzas|tacos|drinks)\b/i,
  /\bdaily special\b/i,
  /\blimited time menu\b/i,
];

const ACCOUNT_ORDER_PATTERNS = [
  /\border confirmation\b/i,
  /\bshipping confirmation\b/i,
  /\bdelivery update\b/i,
  /\byour receipt\b/i,
  /\bpayment (?:received|processed)\b/i,
  /\btrack your (?:order|package|shipment)\b/i,
  /\bpassword reset\b/i,
  /\baccount statement\b/i,
  /\bwelcome to\b/i,
  /\bconfirm your (?:email|subscription)\b/i,
  /\bemail address verification\b/i,
  /\bverify your email\b/i,
  /\byou(?:'|’)re (?:subscribed|signed up)\b/i,
];

const POLITICAL_DIGEST_PATTERNS = [
  /\bpolitical update\b/i,
  /\bpolitical (?:battlefield|news|report)\b/i,
  /\belection (?:update|results|day)\b/i,
  /\blegislative update\b/i,
  /\bcampaign (?:update|newsletter)\b/i,
];

const KC_EVENT_EVIDENCE = [
  /\bkansas city\b/i,
  /\b(?:^|\s)kc(?:\s|$|[,!.])/i,
  /\boverland park\b/i,
  /\bolathe\b/i,
  /\blenexa\b/i,
  /\bshawnee\b/i,
  /\bleawood\b/i,
  /\bindependence\b/i,
  /\blee'?s summit\b/i,
  /\b(?:concert|festival|market|opening|pop[- ]?up|happy hour|tickets?)\b/i,
  /\b(?:this|next)\s+(?:friday|saturday|sunday|weekend|thursday)\b/i,
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/,
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}\b/i,
  /\bvisitkc\b/i,
  /\bdo816\b/i,
];

const EVENT_TERMS = /\b(?:event|concert|festival|opening|show|performance|market|fair|workshop|rsvp|tickets?)\b/i;

function normalizePlain(input: { bodyText: string; bodyHtml: string }): string {
  const plain =
    input.bodyText.trim() ||
    input.bodyHtml
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return plain;
}

function extractPreheader(plain: string): string {
  const lines = plain.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return lines[0]?.slice(0, 240) ?? '';
}

function linkDomains(urls: string[]): string[] {
  const out = new Set<string>();
  for (const url of urls) {
    try {
      out.add(rootDomain(new URL(url).hostname));
    } catch {
      // ignore
    }
  }
  return [...out];
}

function hasKcEventEvidence(blob: string): boolean {
  return KC_EVENT_EVIDENCE.some((p) => p.test(blob));
}

function hasStrongKcEventEvidence(blob: string): boolean {
  return (
    EVENT_TERMS.test(blob) ||
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(blob) ||
    (hasKcEventEvidence(blob) &&
      /\b(?:concert|festival|opening|market|fair|tickets?|rsvp|free admission)\b/i.test(blob))
  );
}

function countPatternHits(patterns: RegExp[], blob: string): number {
  return patterns.filter((p) => p.test(blob)).length;
}

export function computePrefilterContentHash(input: {
  gmailMessageId: string;
  subject: string;
  senderEmail: string | null;
  bodyText: string;
  bodyHtml: string;
}): string {
  const plain = normalizePlain(input);
  return createHash('sha256')
    .update(
      `${input.gmailMessageId}|${input.subject.trim().toLowerCase()}|${input.senderEmail ?? ''}|${plain.slice(0, 8000)}`,
    )
    .digest('hex')
    .slice(0, 32);
}

function rejectRecordPath(gmailMessageId: string): string {
  return resolve(REJECT_CACHE_DIR, `${gmailMessageId}.json`);
}

export function readPrefilterRejectRecord(gmailMessageId: string): PrefilterRejectRecord | null {
  try {
    const path = rejectRecordPath(gmailMessageId);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8')) as PrefilterRejectRecord;
  } catch {
    return null;
  }
}

export function persistPrefilterReject(record: PrefilterRejectRecord): void {
  try {
    mkdirSync(REJECT_CACHE_DIR, { recursive: true });
    writeFileSync(rejectRecordPath(record.gmailMessageId), JSON.stringify(record));
  } catch {
    // best-effort
  }
}

function evaluateRetailSenderPolicy(
  blob: string,
  domains: string[],
  policy: SenderPolicyKind,
): { reason: PrefilterRejectReason; detail: string } | null {
  if (isAllowedRetailException(blob)) return null;

  const productHits = countPatternHits(PRODUCT_CATALOG_PATTERNS, blob);
  const discountHits =
    countPatternHits(PERCENT_OFF_PATTERNS, blob) +
    countPatternHits(BOGO_PATTERNS, blob) +
    countPatternHits(FREE_SHIPPING_PATTERNS, blob);
  const nationalRetail = domains.some((d) => NATIONAL_RETAIL_DOMAINS.has(d));

  if (policy === 'freebies_only' && !/\bfree\b/i.test(blob)) {
    return { reason: 'product_sales', detail: 'freebies_only sender without literal free offer' };
  }

  if (nationalRetail || productHits >= 1 || discountHits >= 1) {
    if (discountHits >= 1) {
      return { reason: 'percent_off_offer', detail: 'Retail sender percent/discount promotion' };
    }
    if (productHits >= 1) {
      return { reason: 'product_catalog', detail: 'Retail sender product catalog/sales' };
    }
    if (countPatternHits(FREE_SHIPPING_PATTERNS, blob) >= 1) {
      return { reason: 'free_shipping_promo', detail: 'Retail sender shipping promotion' };
    }
  }

  return null;
}

export function prefilterNewsletterEmail(input: {
  gmailMessageId: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  senderEmail: string | null;
  senderName?: string | null;
  urls: string[];
  newsletterCategory: NewsletterCategory;
  senderPolicyStatus?: 'enabled' | 'paused' | 'ignored' | 'suggested' | null;
  persistReject?: boolean;
}): PrefilterResult {
  const contentHash = computePrefilterContentHash(input);
  const cached = readPrefilterRejectRecord(input.gmailMessageId);
  if (cached?.ruleVersion === NEWSLETTER_PREFILTER_VERSION && cached.contentHash === contentHash) {
    return {
      pass: false,
      reason: cached.reason,
      detail: cached.detail,
      contentHash,
      ruleVersion: NEWSLETTER_PREFILTER_VERSION,
    };
  }

  if (input.senderPolicyStatus === 'ignored') {
    return finishReject(input, contentHash, 'previously_ignored_sender', 'Sender marked ignored in newsletter_sources');
  }

  const senderDomain = input.senderEmail?.split('@')[1]?.toLowerCase() ?? '';
  const policy = resolveSenderPolicy(input.senderEmail, senderDomain);

  if (policy.policy === 'always_ignore') {
    return finishReject(
      input,
      contentHash,
      'account_order_notice',
      `Sender policy always_ignore (${policy.source})`,
    );
  }

  const plain = normalizePlain(input);
  const preheader = extractPreheader(plain);
  const blob = [input.subject, preheader, plain.slice(0, 6000), input.senderName ?? ''].join('\n');
  const domains = linkDomains(input.urls);

  if (ACCOUNT_ORDER_PATTERNS.some((p) => p.test(blob)) || policy.policy === 'always_ignore') {
    return finishReject(input, contentHash, 'account_order_notice', 'Transactional account/order patterns');
  }

  if (policy.policy === 'trusted_event_roundup') {
    return { pass: true };
  }

  if (POLITICAL_DIGEST_PATTERNS.some((p) => p.test(blob))) {
    return finishReject(input, contentHash, 'political_digest', 'Political or election digest');
  }

  if (policy.policy === 'events_only' || policy.policy === 'freebies_only') {
    const retailReject = evaluateRetailSenderPolicy(blob, domains, policy.policy);
    if (retailReject) {
      return finishReject(input, contentHash, retailReject.reason, retailReject.detail);
    }
    return { pass: true };
  }

  if (policy.policy === 'manual_review') {
    return finishReject(input, contentHash, 'no_event_signal', 'Sender policy manual_review');
  }

  if (isNewsWeatherAlertContent({ subject: input.subject, bodyText: plain })) {
    const reason = /\bweather\b/i.test(blob) ? 'weather_alert' : 'news_digest';
    return finishReject(input, contentHash, reason, 'News or weather digest without event inventory');
  }

  if (POLITICAL_DIGEST_PATTERNS.some((p) => p.test(blob))) {
    return finishReject(input, contentHash, 'political_digest', 'Political or election digest');
  }

  if (
    isNewsSignalOnlySender(senderDomain) &&
    !hasKcEventEvidence(blob) &&
    !EVENT_TERMS.test(blob)
  ) {
    return finishReject(input, contentHash, 'news_digest', 'News publisher without local event evidence');
  }

  const productHits = countPatternHits(PRODUCT_CATALOG_PATTERNS, blob);
  const discountHits =
    countPatternHits(PERCENT_OFF_PATTERNS, blob) +
    countPatternHits(BOGO_PATTERNS, blob) +
    countPatternHits(FREE_SHIPPING_PATTERNS, blob);

  const nationalRetail = domains.some((d) => NATIONAL_RETAIL_DOMAINS.has(d));
  const kcEvidence = hasStrongKcEventEvidence(blob);

  if (nationalRetail && !kcEvidence && discountHits >= 1) {
    return finishReject(
      input,
      contentHash,
      'national_campaign_no_kc',
      'National retail promotion without KC-local proof',
    );
  }

  if (BOGO_PATTERNS.some((p) => p.test(blob)) && !kcEvidence && !EVENT_TERMS.test(blob)) {
    return finishReject(input, contentHash, 'bogo_offer', 'BOGO offer without event signal');
  }

  if (PERCENT_OFF_PATTERNS.some((p) => p.test(blob)) && !kcEvidence && !EVENT_TERMS.test(blob)) {
    return finishReject(input, contentHash, 'percent_off_offer', 'Percent-off promotion without event signal');
  }

  if (FREE_SHIPPING_PATTERNS.some((p) => p.test(blob)) && !kcEvidence && !EVENT_TERMS.test(blob)) {
    return finishReject(input, contentHash, 'free_shipping_promo', 'Free-shipping retail promo');
  }

  if (MENU_PROMO_PATTERNS.some((p) => p.test(blob)) && !EVENT_TERMS.test(blob) && !kcEvidence) {
    return finishReject(input, contentHash, 'menu_item_promotion', 'Menu-item promotion without event framing');
  }

  if (productHits >= 3 && discountHits >= 1 && !kcEvidence) {
    return finishReject(input, contentHash, 'product_catalog', 'Product catalog / sales grid');
  }

  if (
    /\b(?:something exciting|stay tuned|big news|you do not want to miss)\b/i.test(blob) &&
    !hasStrongKcEventEvidence(blob)
  ) {
    return finishReject(input, contentHash, 'no_event_signal', 'Vague promotion without event details');
  }

  if (
    input.newsletterCategory === 'retail_newsletter' &&
    (discountHits >= 1 || productHits >= 1) &&
    !kcEvidence
  ) {
    return finishReject(
      input,
      contentHash,
      'product_sales',
      'Retail newsletter without KC-local event evidence',
    );
  }

  if (
    !kcEvidence &&
    !EVENT_TERMS.test(blob) &&
    input.newsletterCategory === 'retail_newsletter' &&
    discountHits >= 2
  ) {
    return finishReject(input, contentHash, 'no_event_signal', 'Retail newsletter lacking event/deal signals');
  }

  return { pass: true };

  function finishReject(
    ctx: typeof input,
    hash: string,
    reason: PrefilterRejectReason,
    detail: string,
  ): PrefilterResult {
    if (ctx.persistReject !== false) {
      persistPrefilterReject({
        status: 'rejected_pre_llm',
        gmailMessageId: ctx.gmailMessageId,
        contentHash: hash,
        reason,
        detail,
        ruleVersion: NEWSLETTER_PREFILTER_VERSION,
        tokenUsage: 0,
        rejectedAt: new Date().toISOString(),
      });
    }
    return {
      pass: false,
      reason,
      detail,
      contentHash: hash,
      ruleVersion: NEWSLETTER_PREFILTER_VERSION,
    };
  }
}
