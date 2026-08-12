import { normalizeBusinessKey } from '../creator-interest/normalize.js';
import type { ExtractedNewsletterItem } from './types.js';

const ORDINARY_PRODUCT_PATTERNS = [
  /\b(?:mini |pocket )?stapler\b/i,
  /\berasers?\b/i,
  /\bpajamas?\b/i,
  /\bonesies?\b/i,
  /\bslippers?\b/i,
  /\bsocks?\b/i,
  /\bunderwear\b/i,
  /\bgraphic tees?\b/i,
  /\bhoodies?\b/i,
  /\bsweatshirts?\b/i,
  /\bbackpacks?\b/i,
  /\bwater bottles?\b/i,
  /\bphone cases?\b/i,
  /\bstickers?\b/i,
  /\bkeychains?\b/i,
  /\bnotebooks?\b/i,
  /\bpens?\b/i,
  /\bpencils?\b/i,
  /\bmarkers?\b/i,
  /\bcrayons?\b/i,
  /\bplush\b/i,
  /\bstuffed animals?\b/i,
  /\bfidget toys?\b/i,
  /\bbuilding toys?\b/i,
  /\bsquishy\b/i,
  /\blong sleeve\b/i,
  /\bshort sleeve\b/i,
  /\bjackets?\b/i,
  /\bjeans?\b/i,
  /\bdresses?\b/i,
  /\btops?\b/i,
  /\bsharpener\b/i,
  /\bgeneric footwear\b/i,
  /\bsandals?\b/i,
  /\bsneakers?\b/i,
  /\bflip flops?\b/i,
  /\b\d+% off (?:everything|select items?|sitewide)\b/i,
  /\bnew arrivals?\b/i,
  /\bshop the (?:sale|collection)\b/i,
  /\b(?:buy|get) one get one\b/i,
];

const MEANINGFUL_PROMOTION_PATTERNS = [
  /\bgrand opening\b/i,
  /\bsoft opening\b/i,
  /\bstore opening\b/i,
  /\bclosing (?:sale|soon)\b/i,
  /\blast day\b/i,
  /\bpop[- ]?up\b/i,
  /\blimited (?:edition|release|drop)\b/i,
  /\bexclusive (?:drop|release|collab)\b/i,
  /\bribbon cutting\b/i,
  /\bstore (?:launch|debut)\b/i,
  /\bnow open\b/i,
  /\bopening (?:friday|saturday|sunday|monday|tuesday|wednesday|thursday)\b/i,
  /\blocal (?:store|location|availability)\b/i,
  /\bkc (?:store|location|metro)\b/i,
  /\bkansas city (?:store|location)\b/i,
];

export const NATIONAL_RETAIL_DOMAINS = new Set([
  'fivebelow.com',
  'target.com',
  'walmart.com',
  'amazon.com',
  'oldnavy.com',
  'gap.com',
  'urban-planet.com',
  'forever21.com',
  'hollisterco.com',
  'abercrombie.com',
]);

export type ProductCollapseAction =
  | { action: 'keep' }
  | { action: 'collapse_to_entity'; retailerKey: string; reason: string }
  | { action: 'collapse_to_inventory_evidence'; reason: string }
  | { action: 'keep_promotion'; reason: string };

export function isOrdinaryCatalogProduct(item: ExtractedNewsletterItem): boolean {
  const blob = `${item.title} ${item.description ?? ''} ${item.entityName}`;
  return ORDINARY_PRODUCT_PATTERNS.some((p) => p.test(blob));
}

export function hasMeaningfulPromotion(item: ExtractedNewsletterItem): boolean {
  const blob = `${item.title} ${item.description ?? ''}`;
  if (MEANINGFUL_PROMOTION_PATTERNS.some((p) => p.test(blob))) return true;
  if (item.occurrenceType === 'opening' || item.occurrenceType === 'grand_opening') return true;
  if (item.occurrenceType === 'closing') return true;
  if (item.startDate && item.city) return true;
  return false;
}

export function isNationalRetailerDomain(senderDomain: string): boolean {
  const root = senderDomain.replace(/^www\./, '').toLowerCase();
  return NATIONAL_RETAIL_DOMAINS.has(root) || [...NATIONAL_RETAIL_DOMAINS].some((d) => root.endsWith(`.${d}`));
}

export function evaluateProductCollapse(
  item: ExtractedNewsletterItem,
  senderDomain: string,
): ProductCollapseAction {
  const blob = `${item.title} ${item.entityName}`;
  const isRetail =
    item.entityType === 'retailer' ||
    item.entityType === 'store' ||
    item.occurrenceType === 'sale' ||
    item.occurrenceType === 'product_release' ||
    isNationalRetailerDomain(senderDomain) ||
    /retail|store|shop|sale|clearance|hoodie|jacket|tee|pajama|onesie|eraser|stapler|footwear/i.test(
      blob,
    );

  if (!isRetail && !isOrdinaryCatalogProduct(item)) return { action: 'keep' };

  if (isOrdinaryCatalogProduct(item) && !hasMeaningfulPromotion(item)) {
    return {
      action: 'collapse_to_inventory_evidence',
      reason: 'ordinary_catalog_product',
    };
  }

  if (isNationalRetailerDomain(senderDomain) && !hasMeaningfulPromotion(item)) {
    const hasLocalProof = Boolean(item.city || item.streetAddress || item.venue);
    // Always collapse to the domain retailer — never keep SKU titles as entities.
    if (!hasLocalProof || isOrdinaryCatalogProduct(item)) {
      return {
        action: 'collapse_to_inventory_evidence',
        reason: 'national_retail_catalog_noise',
      };
    }
  }

  if (isNationalRetailerDomain(senderDomain) && hasMeaningfulPromotion(item)) {
    const hasLocalProof = Boolean(item.city || item.streetAddress || item.venue);
    if (!hasLocalProof) {
      return {
        action: 'collapse_to_inventory_evidence',
        reason: 'national_retail_no_local_proof',
      };
    }
    return { action: 'keep_promotion', reason: 'national_retail_local_promotion' };
  }

  if (hasMeaningfulPromotion(item)) {
    return { action: 'keep_promotion', reason: 'meaningful_promotion' };
  }

  return { action: 'keep' };
}

function domainRetailerName(senderDomain: string): string {
  const root = senderDomain.replace(/^e\./, '').replace(/^www\./, '').split('.')[0] ?? senderDomain;
  return root.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function collapseProductNoise(
  items: ExtractedNewsletterItem[],
  senderDomain: string,
): {
  kept: ExtractedNewsletterItem[];
  collapsedCount: number;
  collapsedReasons: Record<string, number>;
} {
  const collapsedReasons: Record<string, number> = {};
  const entitySeen = new Set<string>();
  const kept: ExtractedNewsletterItem[] = [];
  let collapsedCount = 0;

  for (const item of items) {
    const decision = evaluateProductCollapse(item, senderDomain);
    if (decision.action === 'keep' || decision.action === 'keep_promotion') {
      kept.push(item);
      continue;
    }

    collapsedCount += 1;
    collapsedReasons[decision.reason] = (collapsedReasons[decision.reason] ?? 0) + 1;

    if (decision.action === 'collapse_to_entity') {
      const key = decision.retailerKey;
      if (!entitySeen.has(key)) {
        entitySeen.add(key);
        const retailerName = domainRetailerName(senderDomain);
        kept.push({
          ...item,
          layer: 'entity',
          entityName: retailerName,
          title: retailerName,
          occurrenceType: null,
          startDate: null,
          startTime: null,
          confidence: Math.min(item.confidence, 0.55),
        });
      }
      continue;
    }
    // collapse_to_inventory_evidence — drop from opportunities feed
  }

  return { kept, collapsedCount, collapsedReasons };
}
