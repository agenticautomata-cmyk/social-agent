import { createHash } from 'node:crypto';
import type { InventoryItem } from '../inventory/normalize.js';

function normalizePart(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Stable fingerprint for a discovery occurrence — changes when date/location/offer materially changes. */
export function computeOccurrenceFingerprint(input: {
  title: string;
  eventDate?: string | null;
  eventEndDate?: string | null;
  locationName?: string | null;
  formattedAddress?: string | null;
  venue?: string | null;
  sourceUrl?: string | null;
  summary?: string | null;
}): string {
  const parts = [
    normalizePart(input.title),
    normalizePart(input.eventDate),
    normalizePart(input.eventEndDate),
    normalizePart(input.locationName ?? input.formattedAddress ?? input.venue),
    normalizePart(input.sourceUrl),
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

export function fingerprintFromInventoryItem(item: InventoryItem): string {
  return computeOccurrenceFingerprint({
    title: item.title,
    eventDate: item.eventDate,
    eventEndDate: item.eventEndDate,
    locationName: item.locationName,
    formattedAddress: item.formattedAddress,
    venue: item.venue,
    sourceUrl: item.sourceUrl,
    summary: item.summary,
  });
}
