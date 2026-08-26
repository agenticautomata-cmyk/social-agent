import { createHash } from 'node:crypto';
import { looksLikeEditorialSlug } from '../ask-benson/editorial-roundup.js';
import {
  classifyStandaloneUrlType,
  isOpaqueContentId,
} from '../ask-benson/url-type.js';

/** Generic URL parse + normalization for partnership intake (no retailer-specific branches). */

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'mc_eid',
  'ref',
  'igshid',
  'igsi',
  'igsh',
]);

export type PartnershipUrlHeuristic = {
  label: string;
  confidence: number;
};

export type PartnershipUrlIntelligence = {
  originalUrl: string;
  normalizedUrl: string;
  registrableDomain: string;
  hostname: string;
  pathSegments: string[];
  decodedPathSlugs: string[];
  queryParams: Array<{ key: string; raw: string; decoded: string }>;
  heuristics: PartnershipUrlHeuristic[];
  storeFilterTokens: Array<{ paramKey: string; storeId: string; decoded: string }>;
};

export function normalizeSourceUrl(url: string): string {
  const parsed = new URL(url.trim());
  parsed.hash = '';
  parsed.hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();

  const kept = new URLSearchParams();
  const entries = [...parsed.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of entries) {
    const lower = key.toLowerCase();
    if (TRACKING_PARAMS.has(lower) || lower.startsWith('utm_')) continue;
    kept.append(key, value);
  }
  parsed.search = kept.toString() ? `?${kept.toString()}` : '';

  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  return parsed.toString();
}

export function parsePartnershipUrl(url: string): PartnershipUrlIntelligence {
  const originalUrl = url.trim();
  const normalizedUrl = normalizeSourceUrl(originalUrl);
  const parsed = new URL(normalizedUrl);
  const hostname = parsed.hostname;
  const registrableDomain = hostname.replace(/^www\./i, '').toLowerCase();

  const pathSegments = parsed.pathname.split('/').filter(Boolean);
  const decodedPathSlugs = pathSegments.map((seg) => {
    try {
      return decodeURIComponent(seg.replace(/\+/g, ' '));
    } catch {
      return seg;
    }
  });

  const queryParams: PartnershipUrlIntelligence['queryParams'] = [];
  const storeFilterTokens: PartnershipUrlIntelligence['storeFilterTokens'] = [];

  for (const [key, raw] of parsed.searchParams.entries()) {
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw.replace(/\+/g, ' '));
    } catch {
      decoded = raw;
    }
    queryParams.push({ key, raw, decoded });

    const storeMatch = decoded.match(/^storeAvailability:(.+)$/i);
    if (storeMatch?.[1]) {
      storeFilterTokens.push({
        paramKey: key,
        storeId: storeMatch[1].trim(),
        decoded,
      });
    } else if (/storeavailability/i.test(key)) {
      storeFilterTokens.push({
        paramKey: key,
        storeId: decoded.trim(),
        decoded,
      });
    } else if (/^store$|^storeid$|^locationid$/i.test(key) && /^\d+$/.test(decoded)) {
      storeFilterTokens.push({ paramKey: key, storeId: decoded, decoded });
    }
  }

  const heuristics: PartnershipUrlHeuristic[] = [];
  const pathLower = parsed.pathname.toLowerCase();

  if (/\/(c|category|collections?)\//.test(pathLower)) {
    heuristics.push({ label: 'likely_category_path', confidence: 0.75 });
  }
  if (/\/(product|p|shop|item)\//.test(pathLower) && classifyStandaloneUrlType(originalUrl) !== 'social_post') {
    heuristics.push({ label: 'likely_product_path', confidence: 0.8 });
  }
  if (storeFilterTokens.length > 0) {
    heuristics.push({ label: 'likely_store_filter', confidence: 0.85 });
  }
  if (/\/(stores?|store-locator|locations?)\b/.test(pathLower)) {
    heuristics.push({ label: 'likely_store_page', confidence: 0.8 });
  }
  if (/\/(creator|ambassador|affiliate|influencer|program)\b/.test(pathLower)) {
    heuristics.push({ label: 'likely_program_path', confidence: 0.7 });
  }

  const urlType = classifyStandaloneUrlType(originalUrl);
  const brandSlug =
    urlType === 'social_post' || urlType === 'social_profile' || urlType === 'link_hub'
      ? undefined
      : decodedPathSlugs.find(
          (slug) =>
            slug.length >= 3 &&
            slug.length <= 64 &&
            /[a-z]/i.test(slug) &&
            !/^(c|p|shop|all|b|category|products|collections?|stores?)$/i.test(slug) &&
            !looksLikeEditorialSlug(slug) &&
            !isOpaqueContentId(slug),
        );
  if (brandSlug) {
    heuristics.push({ label: 'likely_brand_slug', confidence: 0.55 });
  }

  return {
    originalUrl,
    normalizedUrl,
    registrableDomain,
    hostname,
    pathSegments,
    decodedPathSlugs,
    queryParams,
    heuristics,
    storeFilterTokens,
  };
}

export const OPPORTUNITY_FINGERPRINT_VERSION = 2 as const;
export const OPPORTUNITY_FINGERPRINT_ALGORITHM = 'sha256' as const;

export type OpportunityFingerprintRecord = {
  fingerprint: string;
  version: typeof OPPORTUNITY_FINGERPRINT_VERSION;
  tuple: string;
};

/**
 * Legacy (pre-V2) generator. NOT a hash: UTF-8 → hex → first 32 hex chars
 * (first 16 ASCII characters). Kept only to prove the S1 collision and to
 * recognize stored live values. Production new writes must not call this.
 */
export function buildLegacyOpportunityFingerprint(input: {
  registrableDomain: string;
  brandSlug: string | null;
  retailerSlug: string | null;
  collectionSlug: string | null;
}): string {
  const parts = [
    input.registrableDomain.toLowerCase(),
    (input.retailerSlug ?? input.registrableDomain.split('.')[0] ?? '').toLowerCase(),
    (input.brandSlug ?? '').toLowerCase(),
    (input.collectionSlug ?? '').toLowerCase(),
  ]
    .map((p) => p.trim())
    .filter(Boolean);
  return Buffer.from(parts.join('|')).toString('hex').slice(0, 32);
}

export function slugifyOpportunityIdentityPart(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Canonical V2 identity tuple.
 * Example: `v2|scheels.com|scheels|what-goes-around-comes-around|`
 *
 * Collection is included only when it is a distinct, meaningful component
 * that is not the same as the brand slug. Equivalent ShopMy/Loews URLs that
 * share the same defensible brand keep a stable tuple (empty collection).
 */
export function canonicalizeOpportunityFingerprintTuple(input: {
  registrableDomain: string;
  brandName: string;
  retailerName?: string | null;
  collectionSlug?: string | null;
}): string {
  const domain = input.registrableDomain.replace(/^www\./i, '').toLowerCase().trim();
  const retailer = slugifyOpportunityIdentityPart(
    (input.retailerName ?? '').trim() || domain.split('.')[0] || '',
  );
  const brand = slugifyOpportunityIdentityPart(input.brandName);
  const collectionRaw = (input.collectionSlug ?? '').trim()
    ? slugifyOpportunityIdentityPart(input.collectionSlug ?? '')
    : '';
  const collection = collectionRaw && collectionRaw !== brand ? collectionRaw : '';
  return `v2|${domain}|${retailer}|${brand}|${collection}`;
}

export function hashOpportunityFingerprintTuple(tuple: string): string {
  return createHash(OPPORTUNITY_FINGERPRINT_ALGORITHM).update(tuple, 'utf8').digest('hex');
}

/** SHA-256 hex of a valid V2 entity tuple. Caller must already have defensible identity. */
export function buildOpportunityFingerprint(input: {
  registrableDomain: string;
  brandName: string;
  retailerName?: string | null;
  collectionSlug?: string | null;
}): string {
  return hashOpportunityFingerprintTuple(canonicalizeOpportunityFingerprintTuple(input));
}

/**
 * Production generator. Returns null when identity is not defensible — fingerprint
 * is not a fallback for missing entity evidence.
 */
export function tryBuildOpportunityFingerprint(input: {
  identityOk: boolean;
  registrableDomain?: string | null;
  brandName?: string | null;
  retailerName?: string | null;
  collectionSlug?: string | null;
}): OpportunityFingerprintRecord | null {
  if (!input.identityOk) return null;
  const domain = input.registrableDomain?.trim();
  const brand = input.brandName?.trim();
  if (!domain || !brand) return null;
  const tuple = canonicalizeOpportunityFingerprintTuple({
    registrableDomain: domain,
    retailerName: input.retailerName,
    brandName: brand,
    collectionSlug: input.collectionSlug,
  });
  return {
    fingerprint: hashOpportunityFingerprintTuple(tuple),
    version: OPPORTUNITY_FINGERPRINT_VERSION,
    tuple,
  };
}

export function isLegacyOpportunityFingerprintMetadata(metadata: {
  opportunityFingerprint?: string;
  opportunityFingerprintVersion?: unknown;
}): boolean {
  const fp = typeof metadata.opportunityFingerprint === 'string' ? metadata.opportunityFingerprint.trim() : '';
  if (!fp) return false;
  return Number(metadata.opportunityFingerprintVersion) !== OPPORTUNITY_FINGERPRINT_VERSION;
}

export function existingRowAllowsFingerprintTouch(input: {
  existingMetadata: {
    opportunityFingerprint?: string;
    opportunityFingerprintVersion?: unknown;
  };
  existingBrandName: string | null;
  incoming: OpportunityFingerprintRecord;
  incomingBrandName: string;
}): boolean {
  if (isLegacyOpportunityFingerprintMetadata(input.existingMetadata)) return false;
  if (Number(input.existingMetadata.opportunityFingerprintVersion) !== OPPORTUNITY_FINGERPRINT_VERSION) {
    return false;
  }
  if (input.existingMetadata.opportunityFingerprint !== input.incoming.fingerprint) return false;
  const existing = slugifyOpportunityIdentityPart(input.existingBrandName ?? '');
  const incoming = slugifyOpportunityIdentityPart(input.incomingBrandName);
  return Boolean(existing) && existing === incoming;
}

export function inferBrandSlugFromIntel(intel: PartnershipUrlIntelligence): string | null {
  if (
    classifyStandaloneUrlType(intel.originalUrl) === 'social_post' ||
    classifyStandaloneUrlType(intel.originalUrl) === 'social_profile' ||
    classifyStandaloneUrlType(intel.originalUrl) === 'link_hub'
  ) {
    return null;
  }
  const slug = intel.decodedPathSlugs.find(
    (s) =>
      s.length >= 3 &&
      s.length <= 64 &&
      /[a-z]/i.test(s) &&
      !/^(c|p|shop|all|b|category|products|collections?|stores?)$/i.test(s) &&
      !looksLikeEditorialSlug(s) &&
      !isOpaqueContentId(s),
  );
  return slug ?? null;
}

export function retailerNameFromDomain(intel: PartnershipUrlIntelligence): string | null {
  const base = intel.registrableDomain.split('.')[0];
  if (!base) return null;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function titleCaseSlug(slug: string): string {
  return slug
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function inferSourceRoleFromIntel(intel: PartnershipUrlIntelligence): 'discovery' | 'program' | 'product' | 'store' | 'supporting' {
  if (intel.heuristics.some((h) => h.label === 'likely_program_path')) return 'program';
  if (intel.heuristics.some((h) => h.label === 'likely_store_page')) return 'store';
  if (intel.heuristics.some((h) => h.label === 'likely_product_path')) return 'product';
  return 'discovery';
}
