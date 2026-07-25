const BENSON_PREFIX_RE = /^\[Benson\]\s*/i;

export function stripBensonPrefix(value: string): string {
  return value.replace(BENSON_PREFIX_RE, '').trim();
}

export function normalizeEntityName(input: {
  sourceName?: string | null;
  title?: string | null;
  businessName?: string | null;
  documentTitle?: string | null;
}): string {
  if (input.businessName?.trim()) return input.businessName.trim();
  if (input.title?.trim()) return input.title.trim();
  if (input.documentTitle?.trim()) return stripBensonPrefix(input.documentTitle.trim());
  if (input.sourceName?.trim()) return stripBensonPrefix(input.sourceName.trim());
  return 'Unknown';
}

export function inferEntityType(category: string | null, tags: string[] = []): string {
  const haystack = `${category ?? ''} ${tags.join(' ')}`.toLowerCase();
  if (/\b(restaurant|dining|food|drink|cafe|bakery)\b/.test(haystack)) return 'food_business';
  if (/\b(retail|shop|store|thrift|boutique)\b/.test(haystack)) return 'retail';
  if (/\b(event|catering|pop-up|popup)\b/.test(haystack)) return 'event';
  if (/\b(opening|grand opening)\b/.test(haystack)) return 'business_opening';
  return 'local_business';
}

export function normalizeBusinessKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
