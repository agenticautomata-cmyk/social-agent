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
    if (TRACKING_PARAMS.has(key.toLowerCase())) continue;
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
  if (/\/(product|p|shop|item)\//.test(pathLower)) {
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

  const brandSlug = decodedPathSlugs.find(
    (slug) =>
      slug.length >= 3 &&
      slug.length <= 64 &&
      /[a-z]/i.test(slug) &&
      !/^(c|p|shop|all|b|category|products|collections?|stores?)$/i.test(slug),
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

export function buildOpportunityFingerprint(input: {
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

export function inferBrandSlugFromIntel(intel: PartnershipUrlIntelligence): string | null {
  const slug = intel.decodedPathSlugs.find(
    (s) =>
      s.length >= 3 &&
      s.length <= 64 &&
      /[a-z]/i.test(s) &&
      !/^(c|p|shop|all|b|category|products|collections?|stores?)$/i.test(s),
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
