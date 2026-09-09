/**
 * Deterministic org alias merge for KC contact intelligence imports.
 * Domain membership and explicit alias keys only — no soft substring merges on
 * short tokens like "kansas", "city", or "hotel".
 *
 * Email domains force an org. Website/source URL domains only force an org when
 * the business name also agrees (avoids travelks.com listing pages attaching
 * unrelated attractions to Kansas Tourism).
 */

import { normalizeBusinessNameKey, normalizeDomainKey } from '../../sponsor-outreach/canonicalize.js';

export type OrgAliasRule = {
  /** Display / write name for the business. */
  canonicalName: string;
  /** Stable key used in import keys and merge. */
  orgKey: string;
  /** Additional normalized name keys that map to this org. */
  aliasKeys: string[];
  /** Email apex domains that force this org (non-aggregator). */
  emailDomains: string[];
  /** Website/source hosts that suggest this org only when the name also agrees. */
  urlDomains: string[];
};

/**
 * Explicit alias table for the 2026-09-08 workbook and known DB spellings.
 * Order does not matter; lookups are by key/domain maps.
 */
export const ORG_ALIAS_RULES: OrgAliasRule[] = [
  {
    canonicalName: 'Visit KC',
    orgKey: 'visit-kc',
    aliasKeys: ['visit kc', 'visit kansas city'],
    emailDomains: ['visitkc.com'],
    urlDomains: ['visitkc.com'],
  },
  {
    canonicalName: 'Visit Kansas City Kansas',
    orgKey: 'visit-kck',
    aliasKeys: ['visit kansas city kansas', 'visit kck'],
    emailDomains: ['visitkansascityks.com', 'visitkck.com'],
    urlDomains: ['visitkansascityks.com', 'visitkck.com'],
  },
  {
    canonicalName: 'Visit Overland Park',
    orgKey: 'visit-overland-park',
    aliasKeys: ['visit overland park'],
    emailDomains: ['visitoverlandpark.com'],
    urlDomains: ['visitoverlandpark.com'],
  },
  {
    canonicalName: 'Kansas Tourism',
    orgKey: 'kansas-tourism',
    aliasKeys: ['kansas tourism', 'travel ks', 'travelks'],
    // Do NOT use bare ks.gov — too many state agencies share it.
    emailDomains: ['travelks.com'],
    urlDomains: ['travelks.com'],
  },
  {
    canonicalName: 'KC Restaurant Week',
    orgKey: 'kc-restaurant-week',
    aliasKeys: ['kc restaurant week', 'kc restaurant week visit kc'],
    emailDomains: ['kcrestaurantweek.com'],
    urlDomains: ['kcrestaurantweek.com'],
  },
  {
    canonicalName: 'Worlds of Fun / Oceans of Fun',
    orgKey: 'worlds-of-fun',
    aliasKeys: [
      'worlds of fun',
      'oceans of fun',
      'worlds of fun oceans of fun',
      'worlds of fun / oceans of fun',
    ],
    emailDomains: ['sixflags.com'],
    urlDomains: ['sixflags.com'],
  },
  {
    canonicalName: 'Union Station Kansas City',
    orgKey: 'union-station-kc',
    aliasKeys: [
      'union station',
      'union station kansas city',
      'science city',
      'union station kansas city science city',
      'union station kansas city / science city',
    ],
    emailDomains: ['unionstation.org'],
    urlDomains: ['unionstation.org'],
  },
  {
    canonicalName: 'Starlight Theatre',
    orgKey: 'starlight-theatre',
    aliasKeys: ['starlight', 'starlight theatre', 'kc starlight'],
    emailDomains: ['kcstarlight.com'],
    urlDomains: ['kcstarlight.com'],
  },
  {
    canonicalName: '21c Museum Hotel Kansas City',
    orgKey: '21c-museum-hotel-kc',
    aliasKeys: [
      '21c museum hotel kansas city',
      '21c museum hotels',
      '21c museum hotel',
      '21c',
    ],
    emailDomains: ['21chotels.com', '21cmuseumhotels.com'],
    urlDomains: ['21chotels.com', '21cmuseumhotels.com'],
  },
  {
    canonicalName: 'Hotel Kansas City',
    orgKey: 'hotel-kansas-city',
    aliasKeys: ['hotel kansas city'],
    emailDomains: ['hotelkansascity.com', 'hyatt.com'],
    urlDomains: ['hotelkansascity.com'],
  },
  {
    canonicalName: 'Power & Light District',
    orgKey: 'power-and-light',
    aliasKeys: [
      'power light district',
      'power & light district',
      'power and light district',
      'power light district live hospitality',
      'live hospitality',
    ],
    emailDomains: ['livehospitality.com', 'visitlive.com'],
    urlDomains: ['livehospitality.com', 'visitlive.com'],
  },
  {
    canonicalName: "Joe's Kansas City Bar-B-Que",
    orgKey: 'joes-kc',
    aliasKeys: [
      'joes kansas city bar b que',
      "joe's kansas city bar-b-que",
      'joes kc',
      'joe s kansas city bar b que',
    ],
    emailDomains: ['joeskc.com', 'joeskccares.com'],
    urlDomains: ['joeskc.com', 'joeskccares.com'],
  },
  {
    canonicalName: 'Crossroads Hotel',
    orgKey: 'crossroads-hotel',
    aliasKeys: ['crossroads hotel', 'crossroads hotel kc'],
    emailDomains: ['crossroadshotelkc.com'],
    urlDomains: ['crossroadshotelkc.com'],
  },
  {
    canonicalName: 'Loews Kansas City Hotel',
    orgKey: 'loews-kc',
    aliasKeys: ['loews kansas city hotel', 'loews kansas city', 'loews'],
    emailDomains: ['loewshotels.com'],
    urlDomains: ['loewshotels.com'],
  },
  {
    canonicalName: 'Kansas City Zoo & Aquarium',
    orgKey: 'kc-zoo',
    aliasKeys: ['kansas city zoo', 'kansas city zoo aquarium', 'kansas city zoo & aquarium'],
    emailDomains: ['kansascityzoo.org', 'fotzkc.org'],
    urlDomains: ['kansascityzoo.org'],
  },
  {
    canonicalName: 'National WWI Museum and Memorial',
    orgKey: 'wwi-museum',
    aliasKeys: ['national wwi museum and memorial', 'national wwi museum'],
    emailDomains: ['theworldwar.org'],
    urlDomains: ['theworldwar.org'],
  },
  {
    canonicalName: 'Chicken N Pickle',
    orgKey: 'chicken-n-pickle',
    aliasKeys: ['chicken n pickle', 'chicken and pickle'],
    emailDomains: ['chickennpickle.com'],
    urlDomains: ['chickennpickle.com'],
  },
  {
    canonicalName: 'KC Cattle Company',
    orgKey: 'kc-cattle-company',
    aliasKeys: ['kc cattle company'],
    emailDomains: ['kccattlecompany.com'],
    urlDomains: ['kccattlecompany.com', 'awin.com'],
  },
  {
    canonicalName: 'KC Dresses',
    orgKey: 'kc-dresses',
    aliasKeys: ['kc dresses'],
    emailDomains: ['kcdresses.com'],
    urlDomains: ['kcdresses.com'],
  },
  {
    canonicalName: 'Missouri Restaurant Association',
    orgKey: 'mra',
    aliasKeys: ['missouri restaurant association'],
    emailDomains: ['morestaurants.org'],
    urlDomains: ['morestaurants.org'],
  },
];

const aliasKeyToOrg = new Map<string, OrgAliasRule>();
const emailDomainToOrg = new Map<string, OrgAliasRule>();
const urlDomainToOrg = new Map<string, OrgAliasRule>();

for (const rule of ORG_ALIAS_RULES) {
  aliasKeyToOrg.set(normalizeBusinessNameKey(rule.canonicalName), rule);
  for (const alias of rule.aliasKeys) {
    aliasKeyToOrg.set(normalizeBusinessNameKey(alias), rule);
  }
  for (const domain of rule.emailDomains) {
    emailDomainToOrg.set(domain.toLowerCase(), rule);
  }
  for (const domain of rule.urlDomains) {
    urlDomainToOrg.set(domain.toLowerCase(), rule);
  }
}

/** Significant tokens for safe name overlap (length ≥ 4; drops metro filler). */
const STOP_TOKENS = new Set([
  'kansas',
  'city',
  'hotel',
  'the',
  'and',
  'of',
  'kc',
  'missouri',
  'metro',
]);

export function significantNameTokens(name: string): Set<string> {
  const key = normalizeBusinessNameKey(name);
  const out = new Set<string>();
  for (const part of key.split(' ')) {
    if (part.length < 4) continue;
    if (STOP_TOKENS.has(part)) continue;
    out.add(part);
  }
  return out;
}

/**
 * True when two names safely refer to the same org without an alias rule.
 * Requires identical normalized keys, or Jaccard ≥ 0.8 on significant tokens
 * with at least two overlapping tokens.
 */
export function namesLikelySameBusiness(a: string, b: string): boolean {
  const ka = normalizeBusinessNameKey(a);
  const kb = normalizeBusinessNameKey(b);
  if (ka === kb) return true;
  const ta = significantNameTokens(a);
  const tb = significantNameTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  if (inter < 2) return false;
  const union = new Set([...ta, ...tb]).size;
  return inter / union >= 0.8;
}

function nameAgreesWithRule(businessName: string, rule: OrgAliasRule): boolean {
  const key = normalizeBusinessNameKey(businessName);
  if (aliasKeyToOrg.get(key)?.orgKey === rule.orgKey) return true;
  if (namesLikelySameBusiness(businessName, rule.canonicalName)) return true;
  return false;
}

export function resolveOrgAlias(input: {
  businessName: string;
  email?: string | null;
  websiteOrSourceUrl?: string | null;
}): { orgKey: string; canonicalName: string; rule: OrgAliasRule | null } {
  const emailDomain = emailDomainOf(input.email);
  if (emailDomain) {
    const byEmail =
      emailDomainToOrg.get(emailDomain) ?? emailDomainToOrg.get(apexOf(emailDomain));
    if (byEmail) {
      return { orgKey: byEmail.orgKey, canonicalName: byEmail.canonicalName, rule: byEmail };
    }
  }

  const nameKey = normalizeBusinessNameKey(input.businessName);
  const byName = aliasKeyToOrg.get(nameKey);
  if (byName) {
    return { orgKey: byName.orgKey, canonicalName: byName.canonicalName, rule: byName };
  }

  const urlDomain = normalizeDomainKey(input.websiteOrSourceUrl ?? null);
  if (urlDomain) {
    const byUrl = urlDomainToOrg.get(urlDomain);
    if (byUrl && nameAgreesWithRule(input.businessName, byUrl)) {
      return { orgKey: byUrl.orgKey, canonicalName: byUrl.canonicalName, rule: byUrl };
    }
  }

  // Kansas Tourism PR contacts publish on travelks.com but email @ks.gov.
  if (
    emailDomain === 'ks.gov' &&
    (nameKey === 'kansas tourism' || /tourism|travelks|travel ks/.test(nameKey))
  ) {
    const rule = aliasKeyToOrg.get('kansas tourism')!;
    return { orgKey: rule.orgKey, canonicalName: rule.canonicalName, rule };
  }

  return {
    orgKey: `name:${nameKey}`,
    canonicalName: input.businessName.trim(),
    rule: null,
  };
}

function emailDomainOf(email: string | null | undefined): string | null {
  const raw = (email ?? '').trim().toLowerCase();
  const at = raw.lastIndexOf('@');
  if (at < 0) return null;
  return raw.slice(at + 1).replace(/^www\./, '') || null;
}

function apexOf(host: string): string {
  const labels = host.split('.').filter(Boolean);
  if (labels.length <= 2) return host;
  return labels.slice(-2).join('.');
}
