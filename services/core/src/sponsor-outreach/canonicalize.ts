import type { SponsorContactStatus } from './constants.js';

/**
 * Canonicalizes sponsor_contacts rows that represent the same real-world business so
 * duplicate pitches (e.g. 14 separate "21c Museum Hotels" rows created from 14 different
 * discovered offers) collapse to one active outreach card. Grouping prefers canonical
 * domain (most reliable for chains/brands with many location pages) and falls back to a
 * normalized business name when no website is present.
 */

const STOPWORD_SUFFIXES = [
  'inc',
  'llc',
  'co',
  'company',
  'ltd',
  'the savoy at', // 21c's in-house restaurant brand — still the same account/property
];

export function normalizeBusinessNameKey(name: string): string {
  let key = name.toLowerCase().trim();
  key = key.replace(/[^a-z0-9\s]/g, ' ');
  key = key.replace(/\s+/g, ' ').trim();
  for (const suffix of STOPWORD_SUFFIXES) {
    if (key.startsWith(`${suffix} `)) key = key.slice(suffix.length + 1);
  }
  key = key.replace(/\b(inc|llc|ltd|co|company)\b/g, '').replace(/\s+/g, ' ').trim();
  return key;
}

/**
 * Domains that host or link to many unrelated third-party businesses — a search-result
 * redirect, an events/classifieds marketplace, or a local media outlet covering many
 * different businesses. Grouping by these would incorrectly merge distinct businesses
 * (e.g. Adidas and Hy-Vee both showing a "google.com" research link, or a dozen different
 * estate sale companies all listed on estatesales.net). These must always fall back to the
 * normalized business name instead of the raw domain.
 */
const AGGREGATOR_DOMAINS = new Set([
  'google.com',
  'bing.com',
  'duckduckgo.com',
  'yahoo.com',
  'eventbrite.com',
  'estatesales.net',
  'estatesales.org',
  'brownbutton.com',
  'thepitchkc.com',
  'inkansascity.com',
  'visitkc.com',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'yelp.com',
  'tripadvisor.com',
]);

/** Extracts the registrable (apex) domain so subdomains of the same brand still group together. */
function apexDomain(hostname: string): string {
  const labels = hostname.split('.').filter(Boolean);
  if (labels.length <= 2) return hostname;
  return labels.slice(-2).join('.');
}

export function normalizeDomainKey(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const url = website.includes('://') ? website : `https://${website}`;
    const host = new URL(url).hostname.toLowerCase();
    const bare = host.startsWith('www.') ? host.slice(4) : host;
    const apex = apexDomain(bare);
    if (AGGREGATOR_DOMAINS.has(apex)) return null;
    return apex;
  } catch {
    return null;
  }
}

/**
 * The canonical grouping key for a sponsor contact. Domain wins when present and it's the
 * business's own site (not a search-result link, marketplace, or media outlet) since it
 * reliably ties together many location/offer pages for the same chain; otherwise falls
 * back to the normalized business name, which is always safe against over-merging because
 * distinct businesses rarely share a normalized name.
 */
export function canonicalGroupKey(contact: { businessName: string; website: string | null }): string {
  const domain = normalizeDomainKey(contact.website);
  if (domain) return `domain:${domain}`;
  return `name:${normalizeBusinessNameKey(contact.businessName)}`;
}

/** Higher rank = more advanced in the real-world outreach relationship. */
const STATUS_RANK: Record<SponsorContactStatus, number> = {
  converted: 7,
  replied: 6,
  follow_up_needed: 5,
  sent: 4,
  scheduled: 3,
  ready_to_contact: 2,
  lead: 1,
  not_interested: 0,
};

export type CanonicalizationCandidate = {
  id: string;
  businessName: string;
  website: string | null;
  status: SponsorContactStatus;
  contactVerificationStatus: string;
  updatedAt: Date;
};

const VERIFICATION_RANK: Record<string, number> = {
  verified_direct_email: 5,
  verified_role_email: 4,
  official_contact_form: 3,
  contact_form: 3,
  official_press_page: 3,
  verified_social_dm_path: 2,
  found_unverified: 1,
  likely_contact_unverified: 1,
  generic_business_contact: 0,
  missing: -1,
  no_contact_found: -1,
};

function verificationRank(status: string): number {
  return VERIFICATION_RANK[status] ?? 0;
}

/**
 * Picks the single "primary" contact for a duplicate group: the one whose real-world
 * relationship is furthest along, breaking ties on contact quality and then recency.
 */
export function pickPrimaryContact<T extends CanonicalizationCandidate>(candidates: T[]): T {
  if (candidates.length === 0) throw new Error('pickPrimaryContact requires at least one candidate');
  return [...candidates].sort((a, b) => {
    const statusDelta = STATUS_RANK[b.status] - STATUS_RANK[a.status];
    if (statusDelta !== 0) return statusDelta;
    const verificationDelta = verificationRank(b.contactVerificationStatus) - verificationRank(a.contactVerificationStatus);
    if (verificationDelta !== 0) return verificationDelta;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  })[0]!;
}

export function groupByCanonicalKey<T extends { businessName: string; website: string | null }>(
  contacts: T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const contact of contacts) {
    const key = canonicalGroupKey(contact);
    const list = groups.get(key);
    if (list) list.push(contact);
    else groups.set(key, [contact]);
  }
  return groups;
}
