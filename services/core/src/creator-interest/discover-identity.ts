/**
 * Deterministic Discover identity — same real-world opportunity, one canonical card.
 * Never merges on vague title similarity alone.
 */
import { createHash } from 'node:crypto';
import { isLinkHubUrl } from '../ask-benson/url-type.js';
import {
  computeSkipMatchIdentity,
  coreTitle,
  skipIdentitiesMatch,
  type SkipMatchIdentity,
} from '../creator-skip/fingerprint.js';
import { normalizeBusinessKey } from './normalize.js';

function isTrackingQueryParam(key: string): boolean {
  const k = key.toLowerCase();
  return k.startsWith('utm_') || k.startsWith('mc_') || ['fbclid', 'gclid', 'igshid', 'igsh', 'si', 'ref', 'source', 'ocid', 'cmpid'].includes(k);
}

const HUB_PATH_RE =
  /^\/(?:events|concerts|shows|family-shows|calendar|listings|things-to-do)(?:\/(?:january|february|march|april|may|june|july|august|september|october|november|december|[a-z0-9-]+))?\/?$/i;

export type DiscoverIdentityInput = {
  id?: string;
  title: string;
  displayTitle?: string;
  eventStartsAt?: Date | string | null;
  locationName?: string | null;
  formattedAddress?: string | null;
  venue?: string | null;
  sourceUrl?: string | null;
};

export function canonicalizeDiscoverSourceUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value || !/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    const kept = new URLSearchParams();
    url.searchParams.forEach((v, k) => {
      if (!isTrackingQueryParam(k)) kept.append(k, v);
    });
    const query = kept.toString();
    const path = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.protocol}//${url.hostname}${path}${query ? `?${query}` : ''}`.toLowerCase();
  } catch {
    return null;
  }
}

/** Host + path only — used to match tracking-query and trailing-slash ingest duplicates. */
export function discoverSourcePathKey(raw: string | null | undefined): string | null {
  const canonical = canonicalizeDiscoverSourceUrl(raw);
  if (!canonical) return null;
  const withoutQuery = canonical.split('?')[0] ?? canonical;
  return withoutQuery.replace(/\/+$/, '') || withoutQuery;
}

export function isDiscoverHubUrl(raw: string | null | undefined): boolean {
  const value = (raw ?? '').trim();
  if (!value) return false;
  if (isLinkHubUrl(value)) return true;
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path === '/') return true;
    if (HUB_PATH_RE.test(path)) return true;
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'kansascity.events' && path.split('/').filter(Boolean).length <= 2) return true;
    return false;
  } catch {
    return false;
  }
}

export function eventbriteEventId(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value || !/eventbrite\./i.test(value)) return null;
  const match = value.match(/\/e\/[^/?#]*?(\d{10,})/i);
  return match?.[1] ?? null;
}

function eventIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function discoverSkipIdentity(input: DiscoverIdentityInput): SkipMatchIdentity | null {
  return computeSkipMatchIdentity({
    title: input.title,
    eventDate: eventIso(input.eventStartsAt),
    locationName: input.locationName,
    formattedAddress: input.formattedAddress,
    venue: input.venue,
  });
}

/**
 * Stable opportunity key. Prefers provider IDs and event URLs, then dated skip
 * identity, then display-title+day+city. Never title-only.
 */
export function discoverOpportunityKey(input: DiscoverIdentityInput): string {
  const eb = eventbriteEventId(input.sourceUrl);
  if (eb) return `eb:${eb}`;

  const canonical = canonicalizeDiscoverSourceUrl(input.sourceUrl);
  if (canonical && !isDiscoverHubUrl(input.sourceUrl)) return `url:${canonical}`;

  const identity = discoverSkipIdentity(input);
  if (identity) return `occ:${identity.key}`;

  const label = coreTitle(input.title);
  const city = normalizeBusinessKey(
    (input.locationName ?? input.formattedAddress ?? '').split(',')[0] ?? '',
  );
  if (identity == null && label && eventIso(input.eventStartsAt) && city) {
    const day = identityDay(eventIso(input.eventStartsAt)!);
    if (label.split(' ').length >= 2) return `daytitle:${label}|${day}|${city}`;
  }

  if (!eventIso(input.eventStartsAt) && label.split(' ').length >= 2 && city) {
    return `biz:${normalizeBusinessKey(label)}|${city}`;
  }

  if (input.id) return `id:${input.id}`;
  return `hash:${createHash('sha256').update(`${label}|${canonical ?? ''}`).digest('hex').slice(0, 24)}`;
}

function identityDay(iso: string): string {
  return discoverSkipIdentity({ title: 'x y', eventStartsAt: iso, locationName: 'Kansas City' })?.day ?? iso.slice(0, 10);
}

/** Recurring series / tour — 2+ title tokens, no day. Null for one-word names. */
export function discoverSeriesKey(input: DiscoverIdentityInput): string | null {
  const core = coreTitle(input.title);
  const tokens = core.split(' ').filter(Boolean);
  if (tokens.length < 2) return null;
  const city = normalizeBusinessKey(
    (input.locationName ?? input.formattedAddress ?? '').split(',')[0] ?? '',
  );
  return `series:${core}|${city}`;
}

/** Same listing-hub page on the same local day is one festival/guide, not many venue rows. */
export function discoverHubDayKey(input: DiscoverIdentityInput): string | null {
  if (!isDiscoverHubUrl(input.sourceUrl)) return null;
  const canonical = canonicalizeDiscoverSourceUrl(input.sourceUrl);
  const skip = discoverSkipIdentity(input);
  if (!canonical || !skip?.day) return null;
  return `hubday:${canonical}|${skip.day}`;
}

export function discoverIdentitiesMatch(a: DiscoverIdentityInput, b: DiscoverIdentityInput): boolean {
  const keyA = discoverOpportunityKey(a);
  const keyB = discoverOpportunityKey(b);
  if (keyA === keyB && !keyA.startsWith('id:') && !keyA.startsWith('hash:')) return true;
  const skipA = discoverSkipIdentity(a);
  const skipB = discoverSkipIdentity(b);
  if (skipA && skipB && skipIdentitiesMatch(skipA, skipB)) return true;
  return false;
}

export type DiscoverCollapseFields = {
  id: string;
  title: string;
  displayTitle?: string;
  eventStartsAt?: Date | string | null;
  locationName?: string | null;
  formattedAddress?: string | null;
  sourceUrl?: string | null;
};

/**
 * One canonical row per opportunity / next series occurrence.
 * Later occurrences of the same series stay available after this one is skipped.
 */
export function collapseDiscoverFeedItems<T extends DiscoverCollapseFields>(items: T[]): T[] {
  const indexed = items.map((item, index) => ({ item, index }));
  indexed.sort((a, b) => {
    const aMs = eventMs(a.item.eventStartsAt);
    const bMs = eventMs(b.item.eventStartsAt);
    if (aMs !== bMs) return aMs - bMs;
    return a.index - b.index;
  });

  const kept: T[] = [];
  const keys = new Set<string>();
  const series = new Set<string>();
  const hubDays = new Set<string>();
  const skips: SkipMatchIdentity[] = [];

  for (const { item } of indexed) {
    const identityInput: DiscoverIdentityInput = {
      id: item.id,
      title: item.title,
      displayTitle: item.displayTitle ?? item.title,
      eventStartsAt: item.eventStartsAt,
      locationName: item.locationName,
      formattedAddress: item.formattedAddress,
      sourceUrl: item.sourceUrl,
    };
    const key = discoverOpportunityKey(identityInput);
    if (keys.has(key)) continue;
    const skip = discoverSkipIdentity(identityInput);
    if (skip && skips.some((other) => skipIdentitiesMatch(other, skip))) continue;
    const seriesKey = discoverSeriesKey(identityInput);
    if (seriesKey && series.has(seriesKey)) continue;
    const hubDay = discoverHubDayKey(identityInput);
    if (hubDay && hubDays.has(hubDay)) continue;

    keys.add(key);
    if (skip) skips.push(skip);
    if (seriesKey) series.add(seriesKey);
    if (hubDay) hubDays.add(hubDay);
    kept.push(item);
  }

  const order = new Map(items.map((item, index) => [item.id, index]));
  kept.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return kept;
}

function eventMs(value: Date | string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}
