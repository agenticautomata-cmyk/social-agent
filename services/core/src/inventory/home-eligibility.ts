/**
 * Batch 2 — Home eligibility authority.
 * LOCKED RULE: eligibility before ranking.
 * Confidence / creator_candidate alone never imply Home eligibility.
 */
import type { InventoryItem } from './normalize.js';
import { isGenericFallbackWhyItMatters } from './normalize.js';
import { evaluateCategoryRules } from '../creator-agent/exclusion-rules.js';
import { isEmploymentOpportunity } from '../creator-agent/employment-intent.js';
import { isOperatorTemporallyCurrent } from '../creator-agent/stale-temporal-prose.js';

const TICKET_RESELLER_RE = /\b(ticketmaster|stubhub|seatgeek|vivid\s*seats|axs)\b/i;

function isTicketResaleJunk(item: InventoryItem): boolean {
  const haystack = `${item.title} ${item.sourceName ?? ''}`;
  if (!TICKET_RESELLER_RE.test(haystack)) return false;
  return isGenericFallbackWhyItMatters(item.whyItMatters);
}

export type HomeEligibilityReason =
  | 'eligible'
  | 'employment_jobs_careers'
  | 'raw_unqualified_intake'
  | 'malformed_entity'
  | 'incompatible_category_rule'
  | 'quiet_library_only'
  | 'ticket_resale_junk'
  | 'not_creator_facing_status'
  | 'lifecycle_not_current'
  | 'invalid_cta_target'
  | 'generic_low_signal';

export type HomeEligibilityResult = {
  eligible: boolean;
  /** Eligible for ranking into Top/Second Move style cards. */
  reasons: HomeEligibilityReason[];
  /** False when the card should not render as an executable polished CTA. */
  executableCta: boolean;
  /** True when ineligibility is solely CTA — may still appear degraded elsewhere. */
  ctaOnlyFailure: boolean;
};

const CREATOR_FACING = new Set(['creator_candidate', 'actionable', 'top_pick']);
const CURRENT_LIFECYCLE = new Set(['upcoming', 'active', 'expiring_soon', null, undefined, '']);

/** Soft creator-partnership / sponsor-adjacent exceptions that mention career-ish prose. */
const CREATOR_OPS_EXCEPTION_RE =
  /\b(creator\s+program|influencer\s+program|brand\s+ambassador|ugc\s+program|sponsor(ship)?|collab(oration)?|media\s+kit|gifted\s+product|affiliate)\b/i;

function normalizeCategoryKey(category: string | null | undefined): string {
  return (category ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');
}

function isQuietLibraryOnly(item: InventoryItem): boolean {
  const meta = item.metadata ?? {};
  if (meta.programLibraryQuiet === true || meta.quietLibraryOnly === true) return true;
  if (meta.homeEligible === false) return false;
  const mode = meta.programLibraryMode ?? meta.libraryMode;
  return mode === 'quiet' || mode === 'library_only';
}

function isRawUnqualifiedIntake(item: InventoryItem): boolean {
  const status = item.creatorValueStatus;
  if (status === 'hidden_raw_signal' || status === 'researching' || status === 'rejected') {
    return true;
  }
  const meta = item.metadata ?? {};
  // Share Intake rows that never left raw promotion should not polish on Home.
  if (item.ingest === 'share_intake' && meta.userConfirmed !== true && status !== 'actionable' && status !== 'top_pick') {
    // Most share_intake stay hidden_raw_signal; if somehow visible without confirmation, reject.
    if (status === 'creator_candidate' && !meta.qualificationPassed && !meta.userConfirmed) {
      return true;
    }
  }
  return false;
}

function isMalformedEntity(item: InventoryItem): boolean {
  const title = (item.title ?? '').trim();
  if (title.length < 4) return true;
  if (/^(tbd|unknown|n\/a|null|undefined|test)$/i.test(title)) return true;
  // Employment-style bare listings without a local creator angle already handled elsewhere;
  // malformed = no durable identity signals at all.
  const hasIdentity =
    Boolean(item.businessName?.trim()) ||
    Boolean(item.sourceUrl?.trim()) ||
    Boolean(item.eventDate) ||
    Boolean(item.venue?.trim()) ||
    Boolean(item.locationName?.trim()) ||
    Boolean(item.category?.trim());
  return !hasIdentity;
}

/**
 * Cheap CTA validity for executable Home moves.
 * Discovery href always exists for an id; require a durable external or entity target
 * so we don't promote empty shells as polished "Open opportunity" moves.
 */
export function hasValidHomeCtaTarget(item: InventoryItem): boolean {
  if (!item.id || item.id.length < 8) return false;
  const url = item.sourceUrl?.trim() ?? '';
  if (url.startsWith('http://') || url.startsWith('https://')) return true;
  if (item.businessName?.trim()) return true;
  if (item.googleMapsUrl?.trim() || item.googlePlaceId?.trim()) return true;
  if (item.eventDate) return true;
  return false;
}

function isStrategicallyOrActionablyRelevant(item: InventoryItem): boolean {
  if (item.creatorValueStatus === 'actionable' || item.creatorValueStatus === 'top_pick') return true;
  if (item.flags.sponsorFriendly || item.flags.businessOpening) return true;
  if (item.flags.dining || item.flags.luxury || item.flags.shopping || item.flags.retail) return true;
  if (item.flags.freeEvent || item.flags.dateNight || item.flags.sports) return true;
  if (item.ingest?.startsWith('ask_benson') && item.businessName) return true;
  if (item.ingest?.startsWith('ask_benson') && item.eventDate) return true;
  // Local event / business categories without employment
  const cat = normalizeCategoryKey(item.category);
  if (
    cat &&
    !isEmploymentOpportunity({
      title: item.title,
      category: item.category,
      sourceUrl: item.sourceUrl,
      metadata: item.metadata,
    })
  ) {
    if (
      /local_|event|opening|dining|retail|thrift|consignment|hotel|spa|market|festival|popup|pop_up/.test(
        cat,
      )
    ) {
      return true;
    }
  }
  // Audience score alone is not enough — need some creator/content/sponsor signal
  if (item.audienceScore >= 5 && (item.businessName || item.eventDate || item.sourceUrl)) return true;
  return false;
}

export function evaluateHomeEligibility(item: InventoryItem): HomeEligibilityResult {
  const reasons: HomeEligibilityReason[] = [];

  if (
    isEmploymentOpportunity({
      title: item.title,
      category: item.category,
      sourceUrl: item.sourceUrl,
      summary: item.summary,
      metadata: item.metadata,
      whyItMatters: item.whyItMatters,
    }) &&
    !CREATOR_OPS_EXCEPTION_RE.test(`${item.title} ${item.summary ?? ''} ${item.whyItMatters}`)
  ) {
    reasons.push('employment_jobs_careers');
  }

  if (isQuietLibraryOnly(item)) reasons.push('quiet_library_only');
  if (isRawUnqualifiedIntake(item)) reasons.push('raw_unqualified_intake');
  if (isMalformedEntity(item)) reasons.push('malformed_entity');
  if (isTicketResaleJunk(item)) reasons.push('ticket_resale_junk');

  const status = item.creatorValueStatus;
  if (status && !CREATOR_FACING.has(status)) {
    reasons.push('not_creator_facing_status');
  }

  const lifecycle = item.lifecycleStatus ?? null;
  if (lifecycle === 'expired' || lifecycle === 'archived') {
    reasons.push('lifecycle_not_current');
  } else if (
    // Soft temporal authority: expired dates / stale "next event" prose fail even when
    // the persisted lifecycle column has not been recomputed yet.
    !isOperatorTemporallyCurrent({
      startsAt: item.eventDate,
      endsAt: item.eventEndDate,
      // Prefer unsanitized ingest prose so Home soft-gate still sees stale "next event" claims.
      summaryText: item.summaryRaw ?? item.summary,
      timezone:
        typeof item.metadata?.timezone === 'string'
          ? item.metadata.timezone
          : typeof item.metadata?.timeZone === 'string'
            ? item.metadata.timeZone
            : null,
    })
  ) {
    reasons.push('lifecycle_not_current');
  } else if (lifecycle && !CURRENT_LIFECYCLE.has(lifecycle)) {
    reasons.push('lifecycle_not_current');
  }

  if (!reasons.includes('employment_jobs_careers')) {
    const categoryRule = evaluateCategoryRules({
      title: item.title,
      summary: item.summary,
      contentCategory: item.category,
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl,
      businessName: item.businessName,
      metadata: item.metadata,
    });
    if (categoryRule?.hidden) {
      reasons.push('incompatible_category_rule');
    }
  }

  if (
    reasons.length === 0 &&
    isGenericFallbackWhyItMatters(item.whyItMatters) &&
    !item.businessName &&
    !item.eventDate &&
    item.audienceScore < 4
  ) {
    reasons.push('generic_low_signal');
  }

  if (reasons.length === 0 && !isStrategicallyOrActionablyRelevant(item)) {
    // creator_candidate alone is not enough
    reasons.push('generic_low_signal');
  }

  const ctaValid = hasValidHomeCtaTarget(item);
  if (!ctaValid) {
    // CTA failure alone → not an executable polished move
    return {
      eligible: false,
      reasons: reasons.length ? reasons : ['invalid_cta_target'],
      executableCta: false,
      ctaOnlyFailure: reasons.length === 0,
    };
  }

  if (reasons.length > 0) {
    return { eligible: false, reasons, executableCta: false, ctaOnlyFailure: false };
  }

  return {
    eligible: true,
    reasons: ['eligible'],
    executableCta: true,
    ctaOnlyFailure: false,
  };
}

export function isHomeEligible(item: InventoryItem): boolean {
  return evaluateHomeEligibility(item).eligible;
}

export function filterHomeEligibleItems(items: InventoryItem[]): InventoryItem[] {
  return items.filter((item) => isHomeEligible(item));
}

/** Sponsor Home cards: reject employment / ineligible underlying inventory. */
export function isHomeEligibleSponsorContentItem(
  item: InventoryItem | null | undefined,
): boolean {
  if (!item) return false;
  return isHomeEligible(item);
}
