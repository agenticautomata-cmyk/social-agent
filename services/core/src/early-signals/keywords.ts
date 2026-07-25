import { createHash } from 'node:crypto';

export type KeywordPattern = {
  id: string;
  pattern: string;
  signalType: string;
  weight: number;
  flags?: string;
};

export const DEFAULT_KEYWORD_PATTERNS: KeywordPattern[] = [
  { id: 'coming_soon', pattern: 'coming soon', signalType: 'opening', weight: 3 },
  { id: 'soft_opening', pattern: 'soft opening', signalType: 'opening', weight: 4 },
  { id: 'grand_opening', pattern: 'grand opening', signalType: 'opening', weight: 5 },
  { id: 'now_hiring', pattern: 'now hiring', signalType: 'hiring', weight: 2 },
  { id: 'opening_soon', pattern: 'opening soon', signalType: 'opening', weight: 3 },
  { id: 'new_location', pattern: 'new location', signalType: 'relocation', weight: 3 },
  { id: 'relocating', pattern: 'relocating', signalType: 'relocation', weight: 3 },
  { id: 'final_days', pattern: 'final days', signalType: 'closing', weight: 4 },
  { id: 'final_weekend', pattern: 'final weekend', signalType: 'closing', weight: 4 },
  { id: 'closing', pattern: '\\bclosing\\b', signalType: 'closing', weight: 3, flags: 'i' },
  { id: 'temporarily_closed', pattern: 'temporarily closed', signalType: 'closing', weight: 2 },
  { id: 'renovation', pattern: 'renovation', signalType: 'renovation', weight: 2 },
  { id: 'under_new_ownership', pattern: 'under new ownership', signalType: 'ownership_change', weight: 3 },
  { id: 'reservations_open', pattern: 'reservations open', signalType: 'opening', weight: 3 },
  { id: 'tickets_on_sale', pattern: 'tickets on sale', signalType: 'event', weight: 3 },
  { id: 'vendor_applications', pattern: 'vendor applications', signalType: 'event', weight: 2 },
  { id: 'new_menu', pattern: 'new menu', signalType: 'menu_change', weight: 2 },
  { id: 'new_tenant', pattern: 'new tenant', signalType: 'retail', weight: 3 },
  { id: 'certificate_occupancy', pattern: 'certificate of occupancy', signalType: 'permit', weight: 4 },
  { id: 'tenant_finish', pattern: 'tenant finish', signalType: 'permit', weight: 4 },
  { id: 'commercial_remodel', pattern: 'commercial remodel', signalType: 'permit', weight: 3 },
  { id: 'change_of_use', pattern: 'change of use', signalType: 'permit', weight: 3 },
  { id: 'liquor_license', pattern: 'liquor license', signalType: 'permit', weight: 3 },
  { id: 'planning_application', pattern: 'planning application', signalType: 'planning', weight: 3 },
];

export function mergeKeywordPatterns(
  custom: KeywordPattern[] | null | undefined,
): KeywordPattern[] {
  if (!custom?.length) return DEFAULT_KEYWORD_PATTERNS;
  const map = new Map(DEFAULT_KEYWORD_PATTERNS.map((p) => [p.id, p]));
  for (const row of custom) map.set(row.id, row);
  return [...map.values()];
}

export function detectKeywordMatches(
  text: string,
  patterns: KeywordPattern[] = DEFAULT_KEYWORD_PATTERNS,
): Array<{ pattern: KeywordPattern; match: string }> {
  const hits: Array<{ pattern: KeywordPattern; match: string }> = [];
  for (const pattern of patterns) {
    const re = new RegExp(pattern.pattern, pattern.flags ?? 'i');
    const match = text.match(re);
    if (match?.[0]) hits.push({ pattern, match: match[0] });
  }
  return hits;
}

export function contentHash(text: string): string {
  return createHash('sha256').update(text.trim().toLowerCase()).digest('hex').slice(0, 32);
}

export function normalizeBusinessName(name: string | null | undefined): string {
  if (!name?.trim()) return '';
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(the|llc|inc|co|kc|kansas city)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeAddress(address: string | null | undefined): string {
  if (!address?.trim()) return '';
  return address
    .toLowerCase()
    .replace(/\bst\b/g, 'street')
    .replace(/\bave\b/g, 'avenue')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildClusterKey(input: {
  businessName?: string | null;
  address?: string | null;
  domain?: string | null;
}): string | null {
  const name = normalizeBusinessName(input.businessName);
  const addr = normalizeAddress(input.address);
  const domain = input.domain?.replace(/^www\./, '').toLowerCase() ?? '';
  if (!name && !addr && !domain) return null;
  return createHash('sha256')
    .update([name, addr, domain].join('|'))
    .digest('hex')
    .slice(0, 20);
}

export function extractDomain(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
