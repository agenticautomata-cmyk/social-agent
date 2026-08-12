/**
 * Content-lane authority for Home showroom.
 * "Interesting in KC" ≠ Home / Film This. Lanes qualify independently.
 */

import type { InventoryItem } from '../inventory/normalize.js';
import { isGenericFallbackWhyItMatters } from '../inventory/normalize.js';
import { evaluateHomeEligibility } from '../inventory/home-eligibility.js';
import { isOperatorTemporallyCurrent } from '../creator-agent/stale-temporal-prose.js';

export type ContentLane =
  | 'things_to_do_weekly'
  | 'film_this'
  | 'home_best_move'
  | 'home_money'
  | 'home_needs_you'
  | 'source_intelligence_only';

const ORDINARY_CONCERT_RE =
  /\b(concert|live\s+music|dj\s+set|sounds\s+by|music\s+festival|tour|open\s+mic|comedy\s+night|author\s+event|book\s+signing|fire[- ]?rescue|convention|expo|trade\s+show)\b/i;

const KELLIE_FIT_RE =
  /\b(luxury|resale|consignment|thrift|hidden\s+gem|boutique|hotel|travel|spa|shopping|gift\s+card|creator|influencer|affiliate|ugc|media\s+kit|sponsor|collab|popup|pop[- ]?up|opening|grand\s+opening|estate\s+sale|vintage|designer)\b/i;

const GENERIC_SPONSOR_PLACEHOLDER_RE =
  /shopping\/retail discovery|deal haul, store opening, or gift-card sponsorship/i;

const POLITICS_NEWS_RE =
  /\b(politics|election|crime|police|surveillance|activism|city\s+council|ordinance|legislation|public\s+policy)\b/i;

const WEAK_VERIFY_RE = /\b(verify date|confirm date|unverified|needs verification|planning lead)\b/i;

export function isOrdinaryPublicEvent(item: Pick<InventoryItem, 'title' | 'summary' | 'category' | 'flags'>): boolean {
  const hay = `${item.title} ${item.summary ?? ''} ${item.category ?? ''}`;
  if (ORDINARY_CONCERT_RE.test(hay)) return true;
  if (item.flags?.sports && !KELLIE_FIT_RE.test(hay)) return true;
  return false;
}

export function hasKellieCreatorFit(item: Pick<InventoryItem, 'title' | 'summary' | 'whyItMatters' | 'flags' | 'category'>): boolean {
  const hay = `${item.title} ${item.summary ?? ''} ${item.whyItMatters ?? ''} ${item.category ?? ''}`;
  if (KELLIE_FIT_RE.test(hay)) return true;
  if (item.flags?.luxury || item.flags?.shopping || item.flags?.retail || item.flags?.dining) return true;
  if (item.flags?.businessOpening || item.flags?.sponsorFriendly) return true;
  if (item.flags?.estateSale || item.flags?.collector) return true;
  return false;
}

export function isGenericSponsorPlaceholder(item: Pick<InventoryItem, 'title' | 'summary' | 'whyItMatters' | 'businessName'>): boolean {
  const hay = `${item.title} ${item.summary ?? ''} ${item.whyItMatters ?? ''}`;
  if (GENERIC_SPONSOR_PLACEHOLDER_RE.test(hay)) return true;
  if (!item.businessName?.trim() && /sponsorship|sponsor opportunity/i.test(hay) && isGenericFallbackWhyItMatters(item.whyItMatters)) {
    return true;
  }
  return false;
}

export function isLocalNewsWithoutCreatorFit(item: Pick<InventoryItem, 'title' | 'summary' | 'sourceName' | 'ingest' | 'category'>): boolean {
  const hay = `${item.title} ${item.summary ?? ''} ${item.sourceName ?? ''} ${item.category ?? ''}`;
  if (POLITICS_NEWS_RE.test(hay)) return true;
  const fromPitch =
    /pitch/i.test(item.sourceName ?? '') ||
    item.ingest === 'pitch_dining_rss' ||
    /newsletter|local.?news|kc.?pitch/i.test(hay);
  if (fromPitch && !hasKellieCreatorFit(item as InventoryItem)) return true;
  return false;
}

export function qualifiesThingsToDoWeekly(item: InventoryItem): boolean {
  if (!item.eventDate) return false;
  if (
    !isOperatorTemporallyCurrent({
      startsAt: item.eventDate,
      endsAt: item.eventEndDate,
      summaryText: item.summaryRaw ?? item.summary,
    })
  ) {
    return false;
  }
  // Ordinary concerts/events are fine for Things To Do Weekly.
  return Boolean(item.eventDate && (isOrdinaryPublicEvent(item) || item.flags.freeEvent || item.flags.dateNight));
}

export function qualifiesFilmThis(item: InventoryItem): boolean {
  if (!evaluateHomeEligibility(item).eligible) return false;
  if (isOrdinaryPublicEvent(item) && !hasKellieCreatorFit(item)) return false;
  if (isLocalNewsWithoutCreatorFit(item)) return false;
  if (isGenericSponsorPlaceholder(item)) return false;
  if (!hasKellieCreatorFit(item) && !item.flags.businessOpening && !item.flags.dining) return false;
  // Must be concrete & filmable — not verify-date housekeeping.
  if (WEAK_VERIFY_RE.test(item.whyItMatters ?? '')) return false;
  return true;
}

/** Stricter than general Home eligibility — showroom Best Move / Money / Needs You. */
export function evaluateHomeShowroomGate(item: InventoryItem): {
  eligible: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const base = evaluateHomeEligibility(item);
  if (!base.eligible) {
    for (const r of base.reasons) {
      if (r !== 'eligible') reasons.push(r);
    }
  }
  if (!base.executableCta) reasons.push('invalid_cta_target');
  if (isOrdinaryPublicEvent(item) && !hasKellieCreatorFit(item)) reasons.push('ordinary_event_not_home');
  if (isLocalNewsWithoutCreatorFit(item)) reasons.push('local_news_without_creator_fit');
  if (isGenericSponsorPlaceholder(item)) reasons.push('generic_sponsor_placeholder');
  if (WEAK_VERIFY_RE.test(`${item.whyItMatters ?? ''} ${item.title}`)) reasons.push('weak_verify_housekeeping');
  if (item.creatorValueStatus === 'creator_candidate' && item.audienceScore < 5 && !hasKellieCreatorFit(item)) {
    reasons.push('weak_unverified_signal');
  }
  return { eligible: reasons.length === 0, reasons };
}

export function classifyContentLanes(item: InventoryItem): ContentLane[] {
  const lanes: ContentLane[] = [];
  if (qualifiesThingsToDoWeekly(item)) lanes.push('things_to_do_weekly');
  if (qualifiesFilmThis(item)) lanes.push('film_this');
  const showroom = evaluateHomeShowroomGate(item);
  if (showroom.eligible) {
    if (item.flags.sponsorFriendly || item.flags.businessOpening || /sponsor|affiliate|pitch/i.test(item.whyItMatters)) {
      lanes.push('home_money');
    }
    if (qualifiesFilmThis(item) || item.flags.sponsorFriendly) {
      lanes.push('home_best_move');
    }
  }
  if (lanes.length === 0) lanes.push('source_intelligence_only');
  return lanes;
}
