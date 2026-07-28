import { normalizeBusinessKey } from '../creator-interest/normalize.js';
import type { ExtractedNewsletterItem } from './types.js';

const GENERIC_ENTITY_NAMES = new Set([
  'home',
  'events',
  'event',
  'newsletter',
  'weekly update',
  'learn more',
  'click here',
  'read more',
  'view event',
  'shop now',
  'this week',
  'this weekend',
  'upcoming events',
  'featured',
  'featured events',
  'donate',
  'subscribe',
  'unsubscribe',
]);

const GENERIC_TITLE_PATTERNS = [
  /^newsletter$/i,
  /^weekly update$/i,
  /^events?$/i,
  /^learn more$/i,
  /^click here$/i,
  /^view (?:in )?browser$/i,
];

export function isGenericEntityName(name: string | null | undefined): boolean {
  if (!name?.trim()) return true;
  const normalized = name.trim().toLowerCase();
  if (GENERIC_ENTITY_NAMES.has(normalized)) return true;
  return GENERIC_TITLE_PATTERNS.some((p) => p.test(name.trim()));
}

export function resolveEntityName(input: {
  rawName: string;
  title: string;
  senderName: string | null;
  senderDomain: string;
  venue: string | null;
  organizer: string | null;
  officialWebsite: string | null;
  pageHeading?: string | null;
}): string {
  const candidates = [
    input.rawName,
    input.venue,
    input.organizer,
    input.pageHeading,
    input.senderName,
    domainToBusinessName(input.senderDomain),
  ].filter((c) => c && !isGenericEntityName(c)) as string[];

  for (const candidate of candidates) {
    if (candidate.length >= 3) return candidate.trim();
  }

  if (!isGenericEntityName(input.title)) return input.title.trim();
  return input.rawName.trim() || input.title.trim();
}

function domainToBusinessName(domain: string): string | null {
  const base = domain.replace(/^www\./, '').split('.')[0]?.replace(/[-_]/g, ' ').trim();
  if (!base || base.length < 3) return null;
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function applyEntityResolution(
  item: ExtractedNewsletterItem,
  ctx: {
    senderName: string | null;
    senderDomain: string;
  },
): ExtractedNewsletterItem {
  const entityName = resolveEntityName({
    rawName: item.entityName,
    title: item.title,
    senderName: ctx.senderName,
    senderDomain: ctx.senderDomain,
    venue: item.venue,
    organizer: item.organizer,
    officialWebsite: item.officialWebsite,
  });

  if (isGenericEntityName(entityName)) {
    return { ...item, entityName, confidence: Math.min(item.confidence, 0.2) };
  }

  return {
    ...item,
    entityName,
    title: isGenericEntityName(item.title) ? entityName : item.title,
  };
}

export function entityResolutionRejected(item: ExtractedNewsletterItem): boolean {
  return isGenericEntityName(item.entityName) || isGenericEntityName(item.title);
}

export function businessKeyForItem(item: ExtractedNewsletterItem): string {
  const location = [item.city, item.streetAddress, item.venue].filter(Boolean).join('|');
  return `${normalizeBusinessKey(item.entityName)}|${location.toLowerCase()}`;
}
