import {
  extractEventbriteEventId,
  isDirectEventListingUrl,
  normalizeCanonicalEventUrl,
} from '../ask-benson/url-intake-dedupe.js';
import type { EventbriteDiscoverySurfaceId } from './surfaces.js';

export type ExtractedEventbriteCatalogEntry = {
  eventbriteEventId: string;
  url: string;
  surfaceId: EventbriteDiscoverySurfaceId;
  titleHint?: string | null;
};

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function typeNames(raw: unknown): string[] {
  return asArray(raw as string | string[])
    .map((t) => String(t).split('/').pop()?.toLowerCase() ?? '')
    .filter(Boolean);
}

function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // ignore malformed blocks
    }
    if (blocks.length >= 24) break;
  }
  return blocks;
}

function pushEntry(
  out: ExtractedEventbriteCatalogEntry[],
  seen: Set<string>,
  urlRaw: string | null | undefined,
  surfaceId: EventbriteDiscoverySurfaceId,
  titleHint?: string | null,
): void {
  if (!urlRaw?.trim()) return;
  let absolute = urlRaw.trim();
  if (absolute.startsWith('/')) {
    absolute = `https://www.eventbrite.com${absolute}`;
  }
  // Ignore organizer pages and non-/e/ chrome.
  if (/\/o\//i.test(absolute) && !/\/e\//i.test(absolute)) return;
  if (!isDirectEventListingUrl(absolute)) return;
  const eventbriteEventId = extractEventbriteEventId(absolute);
  if (!eventbriteEventId) return;
  if (seen.has(eventbriteEventId)) return;
  seen.add(eventbriteEventId);
  const url = normalizeCanonicalEventUrl(absolute) ?? absolute.split('?')[0]!;
  out.push({
    eventbriteEventId,
    url,
    surfaceId,
    titleHint: titleHint?.trim() || null,
  });
}

function walkItemList(
  node: unknown,
  out: ExtractedEventbriteCatalogEntry[],
  seen: Set<string>,
  surfaceId: EventbriteDiscoverySurfaceId,
): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walkItemList(child, out, seen, surfaceId);
    return;
  }
  const obj = node as Record<string, unknown>;
  const types = typeNames(obj['@type']);
  if (types.includes('itemlist')) {
    for (const el of asArray(obj.itemListElement)) {
      if (!el || typeof el !== 'object') continue;
      const row = el as Record<string, unknown>;
      const item =
        row.item && typeof row.item === 'object' ? (row.item as Record<string, unknown>) : row;
      const url = typeof item.url === 'string' ? item.url : typeof item['@id'] === 'string' ? item['@id'] : null;
      const name = typeof item.name === 'string' ? item.name : null;
      pushEntry(out, seen, url, surfaceId, name);
    }
  }
  if (obj['@graph']) walkItemList(obj['@graph'], out, seen, surfaceId);
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') walkItemList(value, out, seen, surfaceId);
  }
}

/**
 * Extract Eventbrite `/e/...-{id}` detail URLs from a public discovery HTML page.
 * Prefers JSON-LD ItemList; falls back to href scan for `/e/` paths only.
 * Organizer `/o/` URLs and malformed links are ignored.
 */
export function extractEventbriteCatalogEntriesFromHtml(
  html: string,
  surfaceId: EventbriteDiscoverySurfaceId,
): ExtractedEventbriteCatalogEntry[] {
  const out: ExtractedEventbriteCatalogEntry[] = [];
  const seen = new Set<string>();

  for (const block of extractJsonLdBlocks(html)) {
    walkItemList(block, out, seen, surfaceId);
  }

  if (out.length === 0) {
    const hrefs = html.matchAll(/https?:\/\/(?:www\.)?eventbrite\.com\/e\/[a-zA-Z0-9\-]+-\d+/gi);
    for (const m of hrefs) {
      pushEntry(out, seen, m[0], surfaceId, null);
    }
    const rel = html.matchAll(/\/e\/[a-zA-Z0-9\-]+-\d+/gi);
    for (const m of rel) {
      pushEntry(out, seen, `https://www.eventbrite.com${m[0]}`, surfaceId, null);
    }
  }

  return out;
}

/** Dedupe catalog entries by Eventbrite numeric id, keeping first-seen surface. */
export function dedupeCatalogByEventId(
  entries: ExtractedEventbriteCatalogEntry[],
): {
  unique: ExtractedEventbriteCatalogEntry[];
  duplicateIds: string[];
} {
  const unique: ExtractedEventbriteCatalogEntry[] = [];
  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  for (const entry of entries) {
    if (seen.has(entry.eventbriteEventId)) {
      duplicateIds.push(entry.eventbriteEventId);
      continue;
    }
    seen.add(entry.eventbriteEventId);
    unique.push(entry);
  }
  return { unique, duplicateIds };
}
