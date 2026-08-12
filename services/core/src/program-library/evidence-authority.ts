import type { FieldClaim, ProgramLibraryConflict, ProgramLibraryPayload } from './types.js';
import { summarizeVerificationState } from './metadata.js';
import { recomputeProgramLibraryClaimSemantics } from './claim-semantics.js';

/** SEO/aggregator directories — never official_brand. */
export const SECONDARY_EVIDENCE_HOSTS = new Set([
  'viglink.com',
  'getlasso.co',
  'favly.com',
  'taprefer.com',
  'affilitizer.com',
  'affiliateprogramdb.com',
  'affplus.com',
  'affiliatewatchdog.com',
  'affiliatefix.com',
  'uppromote.com',
  'refersion.com',
  'skimlinks.com',
  'sovrn.com',
]);

/** Actual affiliate network platforms (not merchant directories). */
export const AFFILIATE_NETWORK_HOSTS = new Set([
  'impact.com',
  'impactradius.com',
  'app.impact.com',
  'partnerize.com',
  'shareasale.com',
  'rakutenadvertising.com',
  'linksynergy.com',
  'cj.com',
  'commissionjunction.com',
  'awin.com',
  'ascend.pepperjam.com',
  'pepperjam.com',
  'flexoffers.com',
  'clickbank.com',
  'avantlink.com',
]);

/** Brand → known official corporate domains (hostname suffixes). */
export const BRAND_HOST_ALIASES: Record<string, string[]> = {
  'FlexPro Meals': ['flexpromeals.com', 'flexpro.com'],
  'KC Wine Road': ['kcwineroad.com'],
  'KC Chiefs Pro Shop': ['kcchiefs.com', 'shop.chiefs.com', 'kansascitychiefs.com', 'chiefs.com'],
  'Dream KC Smoke Shop': ['kcsmokeshop.com', 'dreamkc.com'],
  'BodymetRx KC': ['bodymetrx.com', 'bodymetrxkc.com'],
  'KC Cabinetry & Stone': ['kccabinetryandstone.com', 'kccabinetry.com'],
  'Prestige Transportation KC': ['prestigetransportationkc.com', 'prestigetransportation.com'],
  'LEGOLAND Discovery Center Kansas City': [
    'legolanddiscoverycenter.com',
    'legoland.com',
    'merlinentertainments.biz',
  ],
  'LM Connect KC': ['lmconnectkc.com'],
  'Missouri Restaurant Association': ['morestaurants.org', 'morerestaurants.org'],
  FASHIONPHILE: ['fashionphile.com'],
  'The RealReal': ['therealreal.com'],
  thredUP: ['thredup.com'],
  Poshmark: ['poshmark.com'],
  LTK: ['shopltk.com', 'ltk.app', 'rewardstyle.com', 'company.shopltk.com'],
};

function normalizeBrandToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractEvidenceHostname(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

export function isUntrustedEvidenceUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return true;
  return /\.example\b/i.test(url);
}

function brandTokens(brandName: string): string[] {
  const stop = new Set(['kc', 'the', 'and', 'shop', 'center', 'discovery', 'local', 'missouri']);
  return normalizeBrandToken(brandName)
    .split(' ')
    .filter((t) => t.length >= 3 && !stop.has(t));
}

export function isBrandOwnedHost(hostname: string, brandName: string): boolean {
  const host = hostname.replace(/^www\./i, '').toLowerCase();
  const aliases = BRAND_HOST_ALIASES[brandName] ?? [];
  if (aliases.some((a) => host === a || host.endsWith(`.${a}`))) return true;

  const tokens = brandTokens(brandName);
  if (tokens.length === 0) return false;
  const hostCompact = host.replace(/[^a-z0-9]/g, '');
  return tokens.every((token) => hostCompact.includes(token.replace(/[^a-z0-9]/g, '')));
}

export function isSecondaryEvidenceHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./i, '').toLowerCase();
  if (SECONDARY_EVIDENCE_HOSTS.has(host)) return true;
  return [...SECONDARY_EVIDENCE_HOSTS].some((d) => host === d || host.endsWith(`.${d}`));
}

export function isAffiliateNetworkHost(hostname: string, affiliateNetwork?: string | null): boolean {
  const host = hostname.replace(/^www\./i, '').toLowerCase();
  if (isSecondaryEvidenceHost(host)) return false;
  if (AFFILIATE_NETWORK_HOSTS.has(host)) return true;
  if ([...AFFILIATE_NETWORK_HOSTS].some((d) => host === d || host.endsWith(`.${d}`))) return true;

  const network = affiliateNetwork?.trim().toLowerCase() ?? '';
  if (!network) return false;
  if (network.includes('impact') && (host.includes('impact') || host.includes('impactradius'))) return true;
  if (network.includes('partnerize') && host.includes('partnerize')) return true;
  if (network.includes('shareasale') && host.includes('shareasale')) return true;
  if (network.includes('rakuten') && host.includes('rakuten')) return true;
  if (network.includes('cj') && (host.includes('cj.com') || host.includes('commissionjunction'))) return true;
  return false;
}

/** Classify authority from URL hostname — ignores model/search claims about source type. */
export function classifyEvidenceAuthority(input: {
  url: string | null | undefined;
  brandName: string;
  affiliateNetwork?: string | null;
}): FieldAuthority {
  if (isUntrustedEvidenceUrl(input.url)) return 'secondary_source';
  const hostname = extractEvidenceHostname(input.url);
  if (!hostname) return 'secondary_source';
  if (isSecondaryEvidenceHost(hostname)) return 'secondary_source';
  if (isAffiliateNetworkHost(hostname, input.affiliateNetwork)) return 'affiliate_network';
  if (isBrandOwnedHost(hostname, input.brandName)) return 'official_brand';
  return 'secondary_source';
}

export function verificationStateForAuthority(
  authority: FieldAuthority,
  urlResolved: boolean,
): FieldClaim['verificationState'] {
  if (authority === 'operator_supplied') return 'operator_supplied';
  if (!urlResolved) {
    if (authority === 'official_brand' || authority === 'affiliate_network') return 'needs_verification';
    if (authority === 'secondary_source') return 'secondary_source';
    return 'needs_verification';
  }
  switch (authority) {
    case 'official_brand':
      return 'verified_official';
    case 'affiliate_network':
      return 'verified_network';
    case 'secondary_source':
      return 'secondary_source';
    default:
      return 'needs_verification';
  }
}

export function buildResearchedClaim(input: {
  value: string;
  url: string | null;
  brandName: string;
  affiliateNetwork?: string | null;
  urlResolved: boolean;
}): FieldClaim {
  const authority = classifyEvidenceAuthority({
    url: input.url,
    brandName: input.brandName,
    affiliateNetwork: input.affiliateNetwork,
  });
  return {
    value: input.value,
    authority,
    verificationState: verificationStateForAuthority(authority, input.urlResolved),
    sourceUrl: input.url,
    observedAt: new Date().toISOString(),
    verifiedAt: input.urlResolved ? new Date().toISOString() : null,
  };
}

export function normalizeClaimAuthority(
  claim: FieldClaim,
  input: {
    brandName: string;
    affiliateNetwork?: string | null;
    urlResolved: boolean;
  },
): FieldClaim {
  if (claim.authority === 'operator_supplied') return claim;
  const url = claim.sourceUrl ?? (claim.value?.startsWith('http') ? claim.value : null);
  const authority = classifyEvidenceAuthority({
    url,
    brandName: input.brandName,
    affiliateNetwork: input.affiliateNetwork,
  });
  return {
    ...claim,
    authority,
    verificationState: verificationStateForAuthority(authority, input.urlResolved),
    verifiedAt: input.urlResolved ? claim.verifiedAt ?? new Date().toISOString() : null,
  };
}

function collectEvidenceUrls(payload: ProgramLibraryPayload): string[] {
  const urls = new Set<string>(payload.evidenceUrls);
  const fields = [
    payload.commissionBenefit,
    payload.audienceBenefit,
    payload.officialProgramUrl,
    payload.applicationUrl,
    payload.affiliateNetwork,
    payload.cookieWindow,
    payload.eligibility,
    payload.contactPath,
  ];
  for (const claim of fields) {
    if (claim?.sourceUrl) urls.add(claim.sourceUrl);
    if (claim?.value?.startsWith('http')) urls.add(claim.value);
  }
  for (const conflict of payload.conflictingClaims) {
    for (const c of conflict.claims) {
      if (c.sourceUrl) urls.add(c.sourceUrl);
    }
  }
  return [...urls].filter((u) => u?.trim() && !isUntrustedEvidenceUrl(u));
}

export async function resolveEvidenceUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(12_000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function buildUrlResolutionMap(
  urls: string[],
  resolveFn: (url: string) => Promise<boolean> = resolveEvidenceUrl,
): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  for (const url of urls) {
    if (map.has(url)) continue;
    map.set(url, await resolveFn(url));
  }
  return map;
}

function urlResolvedForClaim(
  claim: FieldClaim | null | undefined,
  resolutionMap: Map<string, boolean>,
): boolean {
  if (!claim) return false;
  const url = claim.sourceUrl ?? (claim.value?.startsWith('http') ? claim.value : null);
  if (!url) return false;
  return resolutionMap.get(url) ?? false;
}

function sanitizeOperatorClaim(claim: FieldClaim | null | undefined): FieldClaim | null {
  if (!claim?.value?.trim()) return claim ?? null;
  if (claim.authority !== 'operator_supplied') return claim;
  return { ...claim, verificationState: 'operator_supplied' };
}

function normalizeClaimField(
  claim: FieldClaim | null | undefined,
  input: {
    brandName: string;
    affiliateNetwork?: string | null;
    resolutionMap: Map<string, boolean>;
  },
): FieldClaim | null {
  const sanitized = sanitizeOperatorClaim(claim);
  if (!sanitized?.value?.trim()) return sanitized ?? null;
  if (sanitized.authority === 'operator_supplied') return sanitized;
  return normalizeClaimAuthority(sanitized, {
    brandName: input.brandName,
    affiliateNetwork: input.affiliateNetwork,
    urlResolved: urlResolvedForClaim(sanitized, input.resolutionMap),
  });
}

function recomputeConflicts(
  payload: ProgramLibraryPayload,
  input: {
    brandName: string;
    affiliateNetwork?: string | null;
    resolutionMap: Map<string, boolean>;
  },
): { conflicts: ProgramLibraryConflict[]; restoredOperatorCommission: FieldClaim | null } {
  const next: ProgramLibraryConflict[] = [];
  let restoredOperatorCommission: FieldClaim | null = null;

  for (const conflict of payload.conflictingClaims) {
    const claims = conflict.claims.map((c) =>
      c.authority === 'operator_supplied'
        ? sanitizeOperatorClaim(c)!
        : normalizeClaimAuthority(c, {
            brandName: input.brandName,
            affiliateNetwork: input.affiliateNetwork,
            urlResolved: urlResolvedForClaim(c, input.resolutionMap),
          }),
    );
    if (claims.length < 2) continue;
    const operator = claims.find((c) => c.authority === 'operator_supplied');
    const other = claims.find((c) => c.authority !== 'operator_supplied');
    if (operator && other && operator.value?.trim() === other.value?.trim()) {
      if (conflict.field === 'commission/benefit') restoredOperatorCommission = operator;
      continue;
    }
    next.push({ field: conflict.field, claims });
  }

  return { conflicts: next, restoredOperatorCommission };
}

/** Re-evaluate stored evidence authority from URLs — no web search. */
export async function recomputeProgramLibraryEvidenceAuthority(
  payload: ProgramLibraryPayload,
  options: {
    resolveFn?: (url: string) => Promise<boolean>;
    resolutionMap?: Map<string, boolean>;
  } = {},
): Promise<{ payload: ProgramLibraryPayload; changed: boolean; notes: string[] }> {
  const notes: string[] = [];
  const urls = collectEvidenceUrls(payload);
  const resolutionMap =
    options.resolutionMap ??
    (await buildUrlResolutionMap(urls, options.resolveFn ?? resolveEvidenceUrl));

  const affiliateNetwork = payload.affiliateNetwork?.value ?? null;
  const ctx = { brandName: payload.brandName, affiliateNetwork, resolutionMap };

  const before = JSON.stringify({
    commission: payload.commissionBenefit,
    official: payload.officialProgramUrl,
    state: payload.verificationDisplayState,
    conflicts: payload.conflictingClaims,
  });

  let next: ProgramLibraryPayload = { ...payload };
  next.commissionBenefit = normalizeClaimField(next.commissionBenefit, ctx);
  next.audienceBenefit = normalizeClaimField(next.audienceBenefit, ctx);
  next.officialProgramUrl = normalizeClaimField(next.officialProgramUrl, ctx);
  next.applicationUrl = normalizeClaimField(next.applicationUrl, ctx);
  next.affiliateNetwork = normalizeClaimField(next.affiliateNetwork, ctx);
  next.cookieWindow = normalizeClaimField(next.cookieWindow, ctx);
  next.eligibility = normalizeClaimField(next.eligibility, ctx);
  next.contactPath = normalizeClaimField(next.contactPath, ctx);

  const { conflicts, restoredOperatorCommission } = recomputeConflicts(next, ctx);
  next.conflictingClaims = conflicts;

  const commissionConflict = next.conflictingClaims.find((c) => c.field === 'commission/benefit');
  if (commissionConflict) {
    const operator = commissionConflict.claims.find((c) => c.authority === 'operator_supplied');
    const researched = commissionConflict.claims.find((c) => c.authority !== 'operator_supplied');
    if (researched) {
      next.commissionBenefit = { ...researched, verificationState: 'conflicting_information' };
    } else if (operator) {
      next.commissionBenefit = operator;
    }
  } else if (restoredOperatorCommission) {
    next.commissionBenefit = sanitizeOperatorClaim(restoredOperatorCommission);
  } else if (
    next.commissionBenefit &&
    next.commissionBenefit.authority !== 'operator_supplied' &&
    !next.conflictingClaims.length
  ) {
    // Single researched commission with no conflict — keep normalized authority on field.
  }

  next.verificationDisplayState = summarizeVerificationState(next);

  const semantics = recomputeProgramLibraryClaimSemantics(next, resolutionMap);
  next = semantics.payload;
  if (semantics.changed) notes.push(...semantics.notes);

  const after = JSON.stringify({
    commission: next.commissionBenefit,
    official: next.officialProgramUrl,
    state: next.verificationDisplayState,
    conflicts: next.conflictingClaims,
  });

  const changed = before !== after;
  if (changed) notes.push(`Verification state → ${next.verificationDisplayState}`);

  return { payload: next, changed, notes };
}
