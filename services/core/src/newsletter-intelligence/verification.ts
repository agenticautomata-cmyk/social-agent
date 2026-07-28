import { fetchPageContent } from '../ask-benson/listing-extract.js';
import { rootDomain } from '../discovery-subscriptions/extract.js';
import { isTrackingUrl } from './resolve-links.js';
import type { ExtractedNewsletterItem, VerificationStatus } from './types.js';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERIFY_CACHE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../.cache/newsletter-verify',
);

export type VerificationClaim = {
  startTime: string | null;
  endTime: string | null;
  startDate: string | null;
  endDate: string | null;
  venue: string | null;
  address: string | null;
  price: string | null;
  sourceUrl: string | null;
};

export type VerificationResult = {
  status: VerificationStatus;
  priority: number;
  newsletterClaim: VerificationClaim;
  officialClaim: VerificationClaim | null;
  conflictingFields: string[];
  canonicalOfficialUrl: string | null;
};

const SECONDARY_SOURCE_DOMAINS = new Set([
  'do816.com',
  'thepitchkc.com',
  'kcur.org',
  'flatlandkc.org',
  'kansascity.com',
  'axios.com',
  'inkansascity.com',
  'feastmagazine.com',
  'visitkc.com',
  'kansascitydefender.com',
  'kcdaily.com',
]);

const TICKET_PROVIDER_PATTERNS = /ticketmaster|eventbrite|universe\.com|axs\.com|etix|seatgeek|dice\.fm|tixr/i;

function claimFromItem(item: ExtractedNewsletterItem): VerificationClaim {
  return {
    startTime: item.startTime,
    endTime: item.endTime,
    startDate: item.startDate,
    endDate: item.endDate,
    venue: item.venue,
    address: [item.streetAddress, item.city, item.state, item.zipCode].filter(Boolean).join(', ') || null,
    price: item.price,
    sourceUrl: item.sourceUrl,
  };
}

function normalizeTime(value: string | null): string | null {
  if (!value?.trim()) return null;
  const m = value.match(/(\d{1,2}):(\d{2})/);
  if (!m) return value.trim().toLowerCase();
  const hh = String(Number.parseInt(m[1]!, 10)).padStart(2, '0');
  return `${hh}:${m[2]}`;
}

function detectConflicts(newsletter: VerificationClaim, official: VerificationClaim): string[] {
  const conflicts: string[] = [];
  const nTime = normalizeTime(newsletter.startTime);
  const oTime = normalizeTime(official.startTime);
  if (nTime && oTime && nTime !== oTime) {
    conflicts.push(`startTime: newsletter says ${newsletter.startTime}, official says ${official.startTime}`);
  }
  if (newsletter.startDate && official.startDate && newsletter.startDate !== official.startDate) {
    conflicts.push(`startDate: newsletter says ${newsletter.startDate}, official says ${official.startDate}`);
  }
  if (newsletter.venue && official.venue && normalizeVenue(newsletter.venue) !== normalizeVenue(official.venue)) {
    conflicts.push(`venue: newsletter says ${newsletter.venue}, official says ${official.venue}`);
  }
  return conflicts;
}

function normalizeVenue(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function heuristicOfficialExtract(pageText: string): VerificationClaim {
  const timeMatch = pageText.match(/\b(\d{1,2}:\d{2}\s?(?:AM|PM|am|pm)?)\b/);
  const dateMatch = pageText.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  const priceMatch = pageText.match(/\$\d+(?:\.\d{2})?|\bfree\b/i);
  return {
    startTime: timeMatch?.[1] ?? null,
    endTime: null,
    startDate: dateMatch?.[1] ?? null,
    endDate: null,
    venue: null,
    address: null,
    price: priceMatch?.[0] ?? null,
    sourceUrl: null,
  };
}

function isSecondarySourceDomain(domain: string): boolean {
  const root = rootDomain(domain);
  return SECONDARY_SOURCE_DOMAINS.has(root) || [...SECONDARY_SOURCE_DOMAINS].some((d) => root.endsWith(`.${d}`));
}

export function classifyVerificationStatus(input: {
  senderDomain: string;
  senderEmail: string | null;
  officialUrl: string | null;
  item: ExtractedNewsletterItem;
  pageFetched?: boolean;
  conflictingFields?: string[];
}): VerificationStatus {
  const senderRoot = rootDomain(input.senderDomain);
  let officialHost: string | null = null;
  try {
    officialHost = input.officialUrl ? rootDomain(new URL(input.officialUrl).hostname) : null;
  } catch {
    officialHost = null;
  }

  if (input.conflictingFields && input.conflictingFields.length > 0) {
    return 'conflicted';
  }

  // Roundup/secondary publishers are never "official" for artists/venues
  if (isSecondarySourceDomain(senderRoot)) {
    return 'trusted_secondary_source';
  }

  if (officialHost && isSecondarySourceDomain(officialHost) && officialHost !== senderRoot) {
    return 'trusted_secondary_source';
  }

  if (officialHost && TICKET_PROVIDER_PATTERNS.test(input.officialUrl ?? '')) {
    return 'official_ticket_provider';
  }

  if (officialHost && officialHost === senderRoot) {
    if (input.item.entityType === 'event_venue') return 'official_venue';
    if (input.item.entityType === 'organizer' || input.item.organizer) return 'official_organizer';
    if (input.item.entityType === 'restaurant' || input.item.entityType === 'retailer') {
      return 'official_business';
    }
    return 'official_sender';
  }

  if (input.pageFetched && officialHost) {
    return 'official_business';
  }

  if (input.officialUrl) {
    return 'unverified';
  }

  return 'newsletter_only';
}

export function verificationPriority(input: {
  senderDomain: string;
  officialUrl: string | null;
}): number {
  if (!input.officialUrl) return 7;
  try {
    const officialHost = rootDomain(new URL(input.officialUrl).hostname);
    const senderRoot = rootDomain(input.senderDomain);
    if (officialHost === senderRoot) return 1;
    if (TICKET_PROVIDER_PATTERNS.test(input.officialUrl)) return 5;
    if (isSecondarySourceDomain(officialHost)) return 6;
    return 3;
  } catch {
    return 6;
  }
}

export async function verifyNewsletterItem(input: {
  item: ExtractedNewsletterItem;
  senderDomain: string;
  senderEmail: string | null;
  resolvedLinks: Map<string, { canonicalUrl: string | null }>;
}): Promise<VerificationResult> {
  const canonicalOfficialUrlHint =
    input.item.officialWebsite ??
    input.item.ticketLink ??
    input.resolvedLinks.get(input.item.sourceUrl ?? '')?.canonicalUrl ??
    input.item.sourceUrl;
  const cacheKey = createHash('sha256')
    .update(
      [
        input.senderDomain,
        input.item.entityName,
        input.item.title,
        input.item.startDate ?? '',
        input.item.venue ?? '',
        canonicalOfficialUrlHint ?? '',
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 24);
  const cachePath = resolve(VERIFY_CACHE_DIR, `${cacheKey}.json`);
  try {
    if (existsSync(cachePath)) {
      return JSON.parse(readFileSync(cachePath, 'utf8')) as VerificationResult;
    }
  } catch {
    // ignore
  }

  const result = await verifyNewsletterItemUncached(input);
  try {
    mkdirSync(VERIFY_CACHE_DIR, { recursive: true });
    writeFileSync(cachePath, JSON.stringify(result));
  } catch {
    // best-effort
  }
  return result;
}

async function verifyNewsletterItemUncached(input: {
  item: ExtractedNewsletterItem;
  senderDomain: string;
  senderEmail: string | null;
  resolvedLinks: Map<string, { canonicalUrl: string | null }>;
}): Promise<VerificationResult> {
  const newsletterClaim = claimFromItem(input.item);
  const canonicalOfficialUrl =
    input.item.officialWebsite ??
    input.item.ticketLink ??
    input.resolvedLinks.get(input.item.sourceUrl ?? '')?.canonicalUrl ??
    input.item.sourceUrl;

  const priority = verificationPriority({
    senderDomain: input.senderDomain,
    officialUrl: canonicalOfficialUrl,
  });

  const senderRoot = rootDomain(input.senderDomain);

  if (isSecondarySourceDomain(senderRoot)) {
    return {
      status: 'trusted_secondary_source',
      priority: 6,
      newsletterClaim,
      officialClaim: null,
      conflictingFields: [],
      canonicalOfficialUrl,
    };
  }

  if (priority === 1) {
    const status = classifyVerificationStatus({
      senderDomain: input.senderDomain,
      senderEmail: input.senderEmail,
      officialUrl: canonicalOfficialUrl,
      item: input.item,
    });
    return {
      status,
      priority,
      newsletterClaim,
      officialClaim: newsletterClaim,
      conflictingFields: [],
      canonicalOfficialUrl,
    };
  }

  if (!canonicalOfficialUrl || isTrackingUrl(canonicalOfficialUrl)) {
    return {
      status: 'newsletter_only',
      priority,
      newsletterClaim,
      officialClaim: null,
      conflictingFields: [],
      canonicalOfficialUrl: null,
    };
  }

  if (isSecondarySourceDomain(rootDomain(new URL(canonicalOfficialUrl).hostname))) {
    return {
      status: 'trusted_secondary_source',
      priority: 6,
      newsletterClaim,
      officialClaim: null,
      conflictingFields: [],
      canonicalOfficialUrl,
    };
  }

  const page = await fetchPageContent(canonicalOfficialUrl);
  if (!page.ok || !page.text) {
    const status = classifyVerificationStatus({
      senderDomain: input.senderDomain,
      senderEmail: input.senderEmail,
      officialUrl: canonicalOfficialUrl,
      item: input.item,
      pageFetched: false,
    });
    return {
      status,
      priority,
      newsletterClaim,
      officialClaim: null,
      conflictingFields: [],
      canonicalOfficialUrl,
    };
  }

  const officialClaim = heuristicOfficialExtract(page.text);
  officialClaim.sourceUrl = canonicalOfficialUrl;
  officialClaim.venue = page.title ?? officialClaim.venue;

  const conflictingFields = detectConflicts(newsletterClaim, officialClaim);
  const status = classifyVerificationStatus({
    senderDomain: input.senderDomain,
    senderEmail: input.senderEmail,
    officialUrl: canonicalOfficialUrl,
    item: input.item,
    pageFetched: true,
    conflictingFields,
  });

  return {
    status,
    priority,
    newsletterClaim,
    officialClaim,
    conflictingFields,
    canonicalOfficialUrl,
  };
}

export function formatConflictSummary(result: VerificationResult): string | null {
  if (result.conflictingFields.length === 0) return null;
  return result.conflictingFields.join('; ');
}

export function isOfficialVerificationStatus(status: VerificationStatus): boolean {
  return (
    status === 'official' ||
    status === 'verified' ||
    status === 'official_sender' ||
    status === 'official_business' ||
    status === 'official_venue' ||
    status === 'official_organizer' ||
    status === 'official_ticket_provider'
  );
}
