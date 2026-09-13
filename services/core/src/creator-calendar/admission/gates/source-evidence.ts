/**
 * Source-to-event evidence integrity.
 * Cited URL must support the same event (title/alias, date, venue/organizer, identity).
 */
import type { CalendarAdmissionCandidate, CalendarAdmissionReasonCode } from '../types.js';
import { normalizeAdmissionTitle, admissionTitlesLikelySame } from '../entity-resolution.js';

export type SourceEvidenceGateResult = {
  ok: boolean;
  quarantine: boolean;
  reason: CalendarAdmissionReasonCode | null;
  detail: string;
  sourceEvidence: string[];
};

const UNRELATED_HUB_HOSTS = [
  /bridge909\.org/i,
  /openai\.com/i,
  /chat\.openai\.com/i,
];

/** Known mismatched URL ↔ event pairs that must never display as "View source". */
const KNOWN_MISMATCHES: Array<{
  titleRe: RegExp;
  urlRe: RegExp;
  detail: string;
}> = [
  {
    titleRe: /\bbpc(?:of)?kc\b|pickleball/i,
    urlRe: /sincerely.?her|womens.?walk.?club|eventbrite\.com\/e\/sincerely/i,
    detail: 'bpc_unrelated_sincerely_her_eventbrite',
  },
  {
    titleRe: /\bexclusive\s+sundays\b/i,
    urlRe: /bridge909\.org/i,
    detail: 'exclusive_sundays_unrelated_bridge909',
  },
];

function urlPathTokens(url: string): string[] {
  try {
    const u = new URL(url);
    return decodeURIComponent(`${u.pathname} ${u.search}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3);
  } catch {
    return url
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3);
  }
}

function titleTokens(title: string): string[] {
  return normalizeAdmissionTitle(title)
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function sharedTokenCount(a: string[], b: string[]): number {
  const setB = new Set(b);
  let n = 0;
  for (const t of a) if (setB.has(t)) n += 1;
  return n;
}

function isFirstPartySocial(url: string): boolean {
  return /instagram\.com\/(?:p|reel|tv)\//i.test(url) || /facebook\.com\/events\//i.test(url);
}

function isGenericHubUrl(url: string): boolean {
  if (UNRELATED_HUB_HOSTS.some((re) => re.test(url))) return true;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '');
    if (!path || path === '' || path === '/') return true;
    if (/\/(?:news|presales?|blog|articles?|category|tag)\b/i.test(path)) return true;
    return false;
  } catch {
    return true;
  }
}

/**
 * Returns ok=false when the cited source clearly describes a different event,
 * or when a weak/hub URL provides no event identity support.
 */
export function evaluateSourceEvidenceGate(c: CalendarAdmissionCandidate): SourceEvidenceGateResult {
  const url = (c.sourceUrl ?? '').trim();
  const title = (c.title ?? '').trim();
  const evidence: string[] = [];

  if (!url) {
    // Completeness gate handles missing URL separately when required.
    return {
      ok: true,
      quarantine: false,
      reason: null,
      detail: 'no_url_to_check',
      sourceEvidence: ['no_source_url'],
    };
  }

  for (const mismatch of KNOWN_MISMATCHES) {
    if (mismatch.titleRe.test(title) && mismatch.urlRe.test(url)) {
      evidence.push(`known_mismatch:${mismatch.detail}`);
      return {
        ok: false,
        quarantine: true,
        reason: 'source_event_mismatch',
        detail: mismatch.detail,
        sourceEvidence: evidence,
      };
    }
  }

  // Instagram curator posts are first-party discovery attribution — not a third-party listing.
  if (isFirstPartySocial(url) || /instagram\.com\//i.test(url)) {
    evidence.push('first_party_social');
    return {
      ok: true,
      quarantine: false,
      reason: null,
      detail: 'first_party_social_ok',
      sourceEvidence: evidence,
    };
  }

  const pathTokens = urlPathTokens(url);
  const titleToks = titleTokens(title);
  const shared = sharedTokenCount(titleToks, pathTokens);
  const venueNorm = normalizeAdmissionTitle(
    [c.venue, c.locationName, c.businessName].filter(Boolean).join(' '),
  );
  const venueTokens = venueNorm.split(/\s+/).filter((t) => t.length >= 3);
  const venueShared = sharedTokenCount(venueTokens, pathTokens);

  // Strong positive: URL slug shares title or venue identity.
  if (shared >= 2 || (shared >= 1 && venueShared >= 1) || venueShared >= 2) {
    evidence.push(`url_title_overlap:${shared}`, `url_venue_overlap:${venueShared}`);
    return {
      ok: true,
      quarantine: false,
      reason: null,
      detail: 'url_supports_event_identity',
      sourceEvidence: evidence,
    };
  }

  // Eventbrite / ticket detail pages with event id are ok if not a known mismatch.
  if (/eventbrite\.com\/e\//i.test(url) || /ticketmaster\.com\/.*\/event\//i.test(url)) {
    // Still reject when title tokens and path are disjoint and title is short/branded.
    if (titleToks.length >= 2 && shared === 0 && venueShared === 0) {
      // Soft: many Eventbrite slugs are opaque; require known-mismatch only unless hub.
      evidence.push('ticket_detail_opaque_slug');
      return {
        ok: true,
        quarantine: false,
        reason: null,
        detail: 'ticket_detail_accepted',
        sourceEvidence: evidence,
      };
    }
    evidence.push('ticket_detail_url');
    return {
      ok: true,
      quarantine: false,
      reason: null,
      detail: 'ticket_detail_ok',
      sourceEvidence: evidence,
    };
  }

  if (isGenericHubUrl(url) && shared === 0 && venueShared === 0) {
    // First-party organizer/venue roots (e.g. kcsymphony.org#gala) are weak but not
    // unrelated third-party pages — allow when a venue identity is present on the candidate.
    const host = (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, '');
      } catch {
        return '';
      }
    })();
    const orgish =
      host &&
      !/bridge909|openai|eventbrite|ticketmaster|facebook|instagram/i.test(host) &&
      ((c.venue && c.venue.length >= 3) || (c.locationName && c.locationName.length >= 3));
    if (orgish) {
      evidence.push(`first_party_org_root:${host}`);
      return {
        ok: true,
        quarantine: false,
        reason: null,
        detail: 'first_party_org_root_with_venue',
        sourceEvidence: evidence,
      };
    }
    evidence.push(`hub_url_no_event_evidence:${url.slice(0, 120)}`);
    return {
      ok: false,
      quarantine: true,
      reason: 'source_missing_event_evidence',
      detail: 'hub_or_news_url_without_event_identity',
      sourceEvidence: evidence,
    };
  }

  // Cross-check: if URL path looks like a different *named* event, quarantine.
  // Shared calendar/listing hubs (/events, /calendar) are not mismatches — children
  // intentionally inherit the parent listing URL.
  const listingHubPath = /\/(?:events?|calendar|upcoming|whats-?on)(?:\/|$|\?)/i.test(url);
  if (
    !listingHubPath &&
    pathTokens.length >= 3 &&
    titleToks.length >= 2 &&
    shared === 0
  ) {
    const pathTitleish = pathTokens.slice(0, 8).join(' ');
    if (!admissionTitlesLikelySame(title, pathTitleish) && venueShared === 0) {
      const foreign = pathTokens.filter((t) => !titleToks.includes(t) && !venueTokens.includes(t));
      // Require contentful foreign tokens (not tracking params / generic path words).
      const meaningfulForeign = foreign.filter(
        (t) => !/^(?:utm|source|openai|www|html|php|aspx|events?|calendar|tickets?)$/i.test(t),
      );
      if (
        meaningfulForeign.length >= 3 &&
        /\/(?:e|event|show|party|festival|walk|club|concert)\//i.test(url)
      ) {
        evidence.push(`url_foreign_tokens:${meaningfulForeign.slice(0, 5).join(',')}`);
        return {
          ok: false,
          quarantine: true,
          reason: 'source_event_mismatch',
          detail: 'url_identity_diverges_from_title',
          sourceEvidence: evidence,
        };
      }
    }
  }

  // Listing hubs without slug identity are acceptable when not a known mismatch host.
  if (listingHubPath) {
    evidence.push('shared_listing_hub');
    return {
      ok: true,
      quarantine: false,
      reason: null,
      detail: 'listing_hub_ok',
      sourceEvidence: evidence,
    };
  }

  evidence.push('source_url_unchecked_pass');
  return {
    ok: true,
    quarantine: false,
    reason: null,
    detail: 'source_ok',
    sourceEvidence: evidence,
  };
}

/** Clear mismatched source URLs from display so Calendar never shows unrelated "View source". */
export function scrubMismatchedSourceUrl(
  c: CalendarAdmissionCandidate,
  gate: SourceEvidenceGateResult,
): string | null {
  if (!gate.ok && (gate.reason === 'source_event_mismatch' || gate.reason === 'source_missing_event_evidence')) {
    return null;
  }
  return c.sourceUrl ?? null;
}
