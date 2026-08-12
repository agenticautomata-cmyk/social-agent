import { env } from '../env.js';
import { extractUrls } from '../ask-benson/collect-from-link.js';
import {
  hasStrongCreatorBusinessSignal,
  shouldOpenCreatorOpportunityPipeline,
} from './url-intake-route.js';

const BRAND_SUBMISSION_RE =
  /\b(brand|product|retailer|campaign|handbag|jewelry|fashion|beauty|skincare|collab|partnership|sponsor)\b/i;

const EVENT_INTAKE_RE =
  /\b(event|concert|festival|ticket|opening|restaurant|dining|food|brunch|happy hour|karaoke)\b/i;

const PARTNERSHIP_SIGNAL_RE =
  /\b(creator\s+partnership|brand\s+deal|partnership\s+opportunit|affiliate\s+program|ambassador\s+program|influencer\s+program|ugc\s+program|gifted\s+product|paid\s+sponsorship|creator\s+program|collab\s+program|shopmy|ltk|brand\s+collab)\b/i;

/**
 * Pre-URL-intelligence legacy routing (PARTNERSHIP_URL_INTELLIGENCE=0).
 * Kept for clean feature-flag rollback.
 */
/** Exported for smoke/rollback verification. */
export function isCreatorPartnershipIntakeLegacy(message: string | null | undefined): boolean {
  const text = (message ?? '').trim();
  if (!text) return false;
  if (PARTNERSHIP_SIGNAL_RE.test(text)) return true;

  const urls = extractUrls(text);
  if (urls.length === 0) {
    return BRAND_SUBMISSION_RE.test(text) && !EVENT_INTAKE_RE.test(text);
  }

  if (PARTNERSHIP_SIGNAL_RE.test(text) || BRAND_SUBMISSION_RE.test(text)) {
    return !/\b(add these events?|eventbrite|concert tickets?)\b/i.test(text);
  }

  if (urls.some((url) => looksLikeProductOrBrandUrlLegacy(url)) && !EVENT_INTAKE_RE.test(text)) {
    return true;
  }
  return false;
}

function looksLikeProductOrBrandUrlLegacy(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    if (/eventbrite|ticketmaster|seatgeek|axs\.com|universe\.com/.test(parsed.hostname)) return false;
    if (/\/(event|events|calendar|ticket|concert|show)\b/.test(path)) return false;
    if (/\/(product|shop|store|collection|c\/|p\/|handbag|jewelry|beauty|brand)\b/.test(path)) return true;
    if (/\.(com|net|org)\/[a-z0-9-]+$/i.test(path) && path.split('/').filter(Boolean).length <= 2) {
      return true;
    }
    return path.split('/').filter(Boolean).length >= 1;
  } catch {
    return false;
  }
}

/**
 * True when Ask Benson should open the creator-opportunity pipeline.
 * With PARTNERSHIP_URL_INTELLIGENCE: commerce candidates open discovery without requiring
 * the user to say "creator partnership"; events/restaurants stay out.
 */
export function isCreatorPartnershipIntake(message: string | null | undefined): boolean {
  if (!env.PARTNERSHIP_URL_INTELLIGENCE) {
    return isCreatorPartnershipIntakeLegacy(message);
  }

  const text = (message ?? '').trim();
  if (!text) return false;

  const urls = extractUrls(text);
  if (urls.length > 0) {
    return shouldOpenCreatorOpportunityPipeline(text).open;
  }

  if (hasStrongCreatorBusinessSignal(text)) return true;
  return BRAND_SUBMISSION_RE.test(text) && !EVENT_INTAKE_RE.test(text);
}

/** Heuristic product/brand URL shape — used for signals only, not hard partnership routing. */
export function looksLikeProductOrBrandUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    if (/eventbrite|ticketmaster|seatgeek|axs\.com|universe\.com/.test(parsed.hostname)) return false;
    if (/\/(event|events|calendar|ticket|concert|show)\b/.test(path)) return false;
    if (/\/(product|shop|store|collection|c\/|p\/|handbag|jewelry|beauty|brand)\b/.test(path)) return true;
    if (/\.(com|net|org)\/[a-z0-9-]+$/i.test(path) && path.split('/').filter(Boolean).length <= 2) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function inferNamesFromSubmission(input: {
  url?: string | null;
  pageTitle?: string | null;
  pageText?: string | null;
  userMessage?: string | null;
}): { brandName: string | null; productName: string | null; retailerName: string | null; title: string } {
  const url = input.url ?? null;
  let retailerName: string | null = null;
  let brandFromUrl: string | null = null;
  if (url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '');
      const base = host.split('.')[0] ?? host;
      retailerName = base.charAt(0).toUpperCase() + base.slice(1);

      const icid = parsed.searchParams.get('icid') ?? '';
      const path = parsed.pathname.toLowerCase();
      if (/reklaim/i.test(icid) || /reklaim/i.test(path)) brandFromUrl = 'REKLAIM';
      const pathBrand = parsed.pathname
        .split('/')
        .find((seg) => {
          try {
            const decoded = decodeURIComponent(seg);
            return (
              decoded.length > 2 &&
              !/^(c|p|b|shop|jewelry|handbags|products|all)$/i.test(decoded)
            );
          } catch {
            return false;
          }
        });
      if (!brandFromUrl && pathBrand && /[a-z]/i.test(pathBrand) && pathBrand.length <= 64) {
        if (!/^\d+$/.test(pathBrand)) {
          try {
            brandFromUrl = decodeURIComponent(pathBrand).replace(/[-_+]/g, ' ');
          } catch {
            brandFromUrl = pathBrand.replace(/-/g, ' ');
          }
        }
      }
    } catch {
      retailerName = null;
    }
  }

  const pageTitle = (input.pageTitle ?? '').replace(/\s*[|\-–—].*$/, '').trim();
  const message = (input.userMessage ?? '').trim();
  const pageText = (input.pageText ?? '').slice(0, 4000);

  let brandName = extractNamedEntity(message, /\bbrand:\s*([^,\n]+)/i);
  if (!brandName && /reklaim/i.test(`${pageTitle} ${pageText} ${message}`)) brandName = 'REKLAIM';
  if (!brandName && brandFromUrl) {
    // Preserve all-caps brand tokens (e.g. REKLAIM); title-case slug-derived names only.
    brandName = /^[A-Z0-9]+$/.test(brandFromUrl)
      ? brandFromUrl
      : brandFromUrl
          .split(/\s+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
  }
  if (!brandName && pageTitle && !retailerNameMatches(pageTitle, retailerName)) {
    brandName = pageTitle.length <= 80 ? pageTitle : null;
  }

  let productName = extractNamedEntity(message, /\bproduct:\s*([^,\n]+)/i);
  if (!productName && /handbag/i.test(`${url ?? ''} ${pageTitle} ${pageText}`)) {
    productName = 'Handbags';
  }

  const title =
    brandName && retailerName && !brandName.toLowerCase().includes(retailerName.toLowerCase())
      ? `${brandName}${productName ? ` ${productName}` : ''} at ${retailerName}`
      : [brandName, productName].filter(Boolean).join(' — ') ||
        pageTitle ||
        retailerName ||
        message.slice(0, 120) ||
        'Creator partnership candidate';

  return { brandName, productName, retailerName, title };
}

function retailerNameMatches(title: string, retailerName: string | null): boolean {
  if (!retailerName) return false;
  return title.toLowerCase().includes(retailerName.toLowerCase());
}

function extractNamedEntity(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match?.[1]?.trim() || null;
}
