/**
 * Guardrails for worker scrape listing web_search fallbacks:
 * - per refresh-wave cap
 * - listing URL dedupe TTL
 * - background context + telemetry options for searchWeb
 */
import { createHash, randomUUID } from 'node:crypto';
import type { SearchWebOptions } from '../web-research/index.js';

/** Max OpenAI web_search calls from scrape paths per refresh wave (fallback + enrich). */
export const SCRAPE_WEB_SEARCH_PER_REFRESH_CAP = 8;

/** Skip re-searching the same listing URL within this window (ms). */
export const SCRAPE_LISTING_URL_DEDUPE_MS = 6 * 60 * 60 * 1000;

export type ScrapeWebSearchSkipReason =
  | 'refresh_cap_exceeded'
  | 'listing_url_dedupe'
  | 'no_active_refresh_wave';

type UrlDedupeEntry = {
  searchedAtMs: number;
  refreshWaveId: string;
};

let activeRefreshWaveId: string | null = null;
let refreshWaveSearchCount = 0;
const listingUrlSearches = new Map<string, UrlDedupeEntry>();

/** Normalize listing URL for dedupe keys (strip hash, trailing slash, lowercase host). */
export function normalizeListingUrlForDedupe(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = '';
    let path = parsed.pathname.replace(/\/+$/, '') || '/';
    parsed.pathname = path;
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

export function truncateListingUrl(url: string, max = 240): string {
  const normalized = normalizeListingUrlForDedupe(url);
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 3)}...`;
}

export function isScrapeRefreshWaveActive(): boolean {
  return activeRefreshWaveId != null;
}

export function getActiveScrapeRefreshWaveId(): string | null {
  return activeRefreshWaveId;
}

export function getScrapeRefreshWaveSearchCount(): number {
  return refreshWaveSearchCount;
}

/** Begin (or nest into) a scrape refresh wave budget. Reuses active wave when nested. */
export function beginScrapeRefreshWave(waveId?: string): string {
  if (activeRefreshWaveId) return activeRefreshWaveId;
  activeRefreshWaveId = waveId ?? randomUUID();
  refreshWaveSearchCount = 0;
  return activeRefreshWaveId;
}

export function endScrapeRefreshWave(): void {
  activeRefreshWaveId = null;
  refreshWaveSearchCount = 0;
}

/** Test-only reset. */
export function resetScrapeWebSearchGuardrailsForTests(): void {
  activeRefreshWaveId = null;
  refreshWaveSearchCount = 0;
  listingUrlSearches.clear();
}

export function clearListingUrlDedupeForTests(): void {
  listingUrlSearches.clear();
}

export type ScrapeWebSearchKind = 'page_fallback' | 'opportunity_enrich';

export type ReserveScrapeWebSearchInput = {
  listingUrl: string;
  kind: ScrapeWebSearchKind;
  /** For opportunity_enrich — disambiguate multiple items from one listing. */
  enrichKey?: string;
};

function dedupeStorageKey(input: ReserveScrapeWebSearchInput): string {
  const base = normalizeListingUrlForDedupe(input.listingUrl);
  if (input.kind === 'page_fallback') {
    return createHash('sha256').update(`fallback:${base}`).digest('hex').slice(0, 32);
  }
  const suffix = input.enrichKey?.trim() || 'default';
  return createHash('sha256').update(`enrich:${base}:${suffix}`).digest('hex').slice(0, 32);
}

export type ReserveScrapeWebSearchResult =
  | { allowed: true; refreshWaveId: string; dedupeKey: string }
  | { allowed: false; reason: ScrapeWebSearchSkipReason };

/**
 * Reserve a scrape web_search slot before calling OpenAI.
 * Marks URL dedupe on attempt via confirmScrapeWebSearchReserved.
 */
export function reserveScrapeWebSearch(input: ReserveScrapeWebSearchInput): ReserveScrapeWebSearchResult {
  if (!activeRefreshWaveId) {
    return { allowed: false, reason: 'no_active_refresh_wave' };
  }
  if (refreshWaveSearchCount >= SCRAPE_WEB_SEARCH_PER_REFRESH_CAP) {
    return { allowed: false, reason: 'refresh_cap_exceeded' };
  }
  const dedupeKey = dedupeStorageKey(input);
  const prior = listingUrlSearches.get(dedupeKey);
  if (prior && Date.now() - prior.searchedAtMs < SCRAPE_LISTING_URL_DEDUPE_MS) {
    return { allowed: false, reason: 'listing_url_dedupe' };
  }
  refreshWaveSearchCount += 1;
  return { allowed: true, refreshWaveId: activeRefreshWaveId, dedupeKey };
}

/** Record dedupe after a search attempt (success or failure — no retry within TTL). */
export function confirmScrapeWebSearchReserved(dedupeKey: string, refreshWaveId: string): void {
  listingUrlSearches.set(dedupeKey, {
    searchedAtMs: Date.now(),
    refreshWaveId,
  });
}

/** Roll back cap increment when searchWeb returns skipped before OpenAI (e.g. background gate). */
export function releaseScrapeWebSearchReservation(): void {
  if (refreshWaveSearchCount > 0) refreshWaveSearchCount -= 1;
}

export function buildScrapeListingSearchOptions(input: {
  sourceId: string;
  listingUrl: string;
  scanRunId?: string;
  refreshWaveId?: string;
}): SearchWebOptions {
  return {
    context: 'background',
    caller: 'scrape_listing',
    process: 'worker',
    sourceId: input.sourceId,
    listingUrl: truncateListingUrl(input.listingUrl),
    scanRunId: input.scanRunId,
    refreshWaveId: input.refreshWaveId ?? activeRefreshWaveId ?? undefined,
  };
}
