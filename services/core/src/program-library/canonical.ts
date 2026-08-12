/** Canonical program identity for dedupe — brand + program + optional URL host + network. */

/** Host labels that are never brand/entity names. */
export const GENERIC_URL_HOST_LABELS = new Set([
  'help',
  'support',
  'www',
  'shop',
  'blog',
  'affiliate',
  'affiliates',
  'partners',
  'partner',
  'creator',
  'influencer',
  'account',
  'app',
  'hc',
  'cdn',
  'static',
  'api',
  'www2',
  'm',
  'mobile',
  'store',
  'info',
  'docs',
  'developer',
  'developers',
]);

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s/g, '-');
}

function extractHost(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function titleCaseBrand(label: string): string {
  if (/^[A-Z0-9]+$/.test(label) && label.length <= 6) return label;
  return label
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

/** Registrable brand from a program URL — never help/support/www/app subdomains. */
export function extractBrandFromProgramUrl(url: string): string | null {
  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname
      .replace(/^www\./i, '')
      .toLowerCase();
    const parts = hostname.split('.').filter(Boolean);
    if (parts.length < 2) return null;

    let brandIdx = parts.length - 2;
    // co.uk / com.au style
    if (parts.length >= 3 && parts[parts.length - 2]!.length <= 2) {
      brandIdx = parts.length - 3;
    }

    const brandLabel = parts[brandIdx]!;
    if (!brandLabel || GENERIC_URL_HOST_LABELS.has(brandLabel)) return null;
    return titleCaseBrand(brandLabel);
  } catch {
    return null;
  }
}

/** Prefer program title from URL slug when brand is known from the host. */
export function extractProgramNameFromUrl(url: string, brandName: string): string {
  try {
    const pathname = new URL(url.startsWith('http') ? url : `https://${url}`).pathname;
    const slug = pathname.split('/').filter(Boolean).pop() ?? '';
    const decoded = decodeURIComponent(slug).replace(/[-_]+/g, ' ').trim();
    if (/creator\s*collective/i.test(decoded)) return `${brandName} Creator Collective`;
    if (/affiliates?\s*program/i.test(decoded) && /creator\s*collective/i.test(decoded)) {
      return `${brandName} Creator Collective`;
    }
    if (/affiliates?\s*program/i.test(decoded)) return `${brandName} Affiliate Program`;
    if (/influencer\s*program/i.test(decoded)) return `${brandName} Influencer Program`;
    if (/referral\s*program/i.test(decoded)) return `${brandName} Referral Program`;
    if (/ambassador/i.test(decoded)) return `${brandName} Ambassador Program`;
  } catch {
    /* ignore */
  }
  return brandName;
}

export function buildCanonicalProgramIdentity(input: {
  brandName: string;
  programName?: string | null;
  officialProgramUrl?: string | null;
  affiliateNetwork?: string | null;
}): string {
  const brand = normalizeKey(input.brandName);
  const program = normalizeKey(input.programName?.trim() || input.brandName);
  const urlHost = input.officialProgramUrl ? extractHost(input.officialProgramUrl) : '';
  const network = input.affiliateNetwork ? normalizeKey(input.affiliateNetwork) : '';
  return [brand, program, urlHost, network].filter(Boolean).join('|');
}

export function inferProgramTypeFromText(text: string): import('./types.js').ProgramType {
  const lower = text.toLowerCase();
  if (/\breferral\b/.test(lower)) return 'referral';
  if (/\bambassador\b/.test(lower)) return 'ambassador';
  if (/\binfluencer\b/.test(lower)) return 'influencer';
  if (/\bcreator\b/.test(lower)) return 'creator';
  if (/\baffiliate\b/.test(lower)) return 'affiliate';
  return 'other';
}

export function inferScopeFromText(text: string): import('./types.js').ProgramScope {
  const lower = text.toLowerCase();
  if (/\b(national|usa|us-wide|online only)\b/.test(lower)) return 'national';
  if (/\b(missouri|regional|midwest)\b/.test(lower)) return 'regional';
  if (/\b(kansas city|kc local|overland park|troost|legoland discovery center kansas city)\b/.test(lower)) {
    return 'kc_local';
  }
  return 'kc_local';
}

const PERSIST_VERB_RE = /\b(save|store|add|persist)\b/i;
const PROGRAM_KIND_RE = /\b(affiliate|creator|influencer|referral|ambassador)\b/i;

/** Detect Ask Benson Affiliate & Creator Programs save/persist intent. */
export function isProgramLibrarySaveIntent(message: string): boolean {
  const lower = message.toLowerCase();
  if (/\bprogram library\b/.test(lower)) return true;
  if (/\baffiliate\s*&\s*creator\s+programs?\b/.test(lower)) return true;
  if (/\bthis looks like an (affiliate|creator|referral) program\b/.test(lower)) return true;

  const hasPersist = PERSIST_VERB_RE.test(lower);
  const hasProgramKind = PROGRAM_KIND_RE.test(lower);
  // "store affiliate info", "save affiliate program", "add creator program", …
  if (hasPersist && hasProgramKind) return true;
  if (
    hasPersist &&
    /\b(affiliate|creator|influencer|referral|ambassador)\s+(program|info|information)\b/.test(lower)
  ) {
    return true;
  }
  return false;
}

/** Explicit verification / research intent (not implied by store/save alone). */
export function isProgramLibraryVerifyIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return /\b(verify|research|find missing|missing info|fill in|check missing)\b/.test(lower);
}

export function extractProgramNamesFromMessage(message: string): {
  brandName: string | null;
  programName: string | null;
} {
  const saveMatch = message.match(
    /\b(?:save|store|add|persist)\s+(?:the\s+)?(.+?)\s+(?:affiliate|creator|influencer|referral|ambassador)\s+program/i,
  );
  if (saveMatch?.[1]) {
    const name = saveMatch[1].trim();
    if (name.length >= 2 && !/^(affiliate|creator|influencer|referral|ambassador|info|information)$/i.test(name)) {
      return { brandName: name, programName: name };
    }
  }
  const programMatch = message.match(
    /(.+?)\s+(?:affiliate|creator|influencer|referral|ambassador)\s+program/i,
  );
  if (programMatch?.[1]) {
    const name = programMatch[1]
      .replace(/^(?:save|store|add|persist)\s+(?:the\s+)?/i, '')
      .trim();
    if (
      name.length >= 2 &&
      !/^(affiliate|creator|influencer|referral|ambassador|info|information)$/i.test(name)
    ) {
      return { brandName: name, programName: name };
    }
  }
  return { brandName: null, programName: null };
}
