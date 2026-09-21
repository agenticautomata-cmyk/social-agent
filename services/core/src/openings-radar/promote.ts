import type { ParsedOpeningEntry } from './types.js';

export type OpportunityPromotionDecision = {
  shouldCreate: boolean;
  reason: string;
  opportunityType: string | null;
};

/**
 * Not every opening becomes an Opportunity. Promote when creator-value signals support it.
 */
export function decideOpportunityPromotion(entry: ParsedOpeningEntry): OpportunityPromotionDecision {
  const signals: string[] = [];
  let score = 0;

  // Strong KC relevance (address/neighborhood/city present)
  if (entry.streetAddress || entry.neighborhood || entry.city) {
    score += 2;
    signals.push('local_location');
  }

  const cat = (entry.category ?? '').toLowerCase();
  if (/restaurant|dessert|bars|nightlife|entertainment|retail|food/.test(cat)) {
    score += 2;
    signals.push('category_fit');
  }

  if (entry.isLocalIndependent) {
    score += 2;
    signals.push('locally_owned');
  }

  if (entry.status === 'grand_opening_scheduled' || entry.grandOpening.exactDate || entry.grandOpening.label) {
    score += 2;
    signals.push('grand_opening');
  }

  if (entry.status === 'soft_open' || entry.softOpening.label) {
    score += 1;
    signals.push('soft_open');
  }

  if (
    entry.estimatedOpening.precision === 'exact' ||
    entry.estimatedOpening.precision === 'approximate' ||
    entry.status === 'opening_soon'
  ) {
    score += 1;
    signals.push('upcoming_window');
  }

  if (entry.relocationStatus) {
    score += 1;
    signals.push('relocation_story');
  }

  if (/jazz|izakaya|mahjong|ice cream|seafood|boutique/i.test(entry.evidenceText)) {
    score += 1;
    signals.push('distinctive_concept');
  }

  // Chains with only a projected date and no distinctive angle — keep on radar, skip auto-opportunity
  if (entry.isChain && score < 5 && !entry.isLocalIndependent) {
    return {
      shouldCreate: false,
      reason: `chain_opening_retained_on_radar:${signals.join(',') || 'thin'}`,
      opportunityType: null,
    };
  }

  if (score >= 4) {
    let opportunityType = 'opening_coverage';
    if (entry.grandOpening.exactDate || entry.status === 'grand_opening_scheduled') {
      opportunityType = 'grand_opening_attendance';
    } else if (entry.softOpening.label || entry.status === 'soft_open') {
      opportunityType = 'first_look';
    } else if (entry.relocationStatus) {
      opportunityType = 'relocation_update';
    } else if (/bars|nightlife|restaurant|dessert/.test(cat)) {
      opportunityType = 'food_drink_review';
    }

    return {
      shouldCreate: true,
      reason: `signals:${signals.join(',')}:score=${score}`,
      opportunityType,
    };
  }

  return {
    shouldCreate: false,
    reason: `insufficient_signals:${signals.join(',') || 'none'}:score=${score}`,
    opportunityType: null,
  };
}

export type EventPromotionDecision = {
  shouldCreate: boolean;
  reason: string;
  eventDate: string | null;
  eventTitle: string | null;
};

/**
 * Calendar Event only when public can attend or opening is promoted as a dated public occasion.
 * Mid-October grand opening without a specific day → no Event.
 */
export function decideEventPromotion(entry: ParsedOpeningEntry): EventPromotionDecision {
  // Exact grand opening date with public-occasion language
  if (entry.grandOpening.exactDate) {
    return {
      shouldCreate: true,
      reason: 'grand_opening_exact_public_date',
      eventDate: entry.grandOpening.exactDate,
      eventTitle: `${entry.businessName} Grand Opening`,
    };
  }

  // Exact planned opening date framed as public opening occasion (jazz bar / grand / opening day)
  // Require public-occasion language — plain "planned opening November 10" is NOT a calendar event.
  if (
    entry.estimatedOpening.exactDate &&
    /\b(grand opening|opening (?:day|night|celebration|party)|public opening)\b/i.test(entry.evidenceText)
  ) {
    return {
      shouldCreate: true,
      reason: 'dated_public_opening_occasion',
      eventDate: entry.estimatedOpening.exactDate,
      eventTitle: `${entry.businessName} Opening`,
    };
  }

  // The Bad Cat-style: "planned opening September 25" for a venue where opening itself is the occasion
  if (
    entry.estimatedOpening.exactDate &&
    /\bplanned opening\b/i.test(entry.evidenceText) &&
    /\b(jazz bar|bar|restaurant|venue|celebration)\b/i.test(entry.evidenceText)
  ) {
    return {
      shouldCreate: true,
      reason: 'dated_venue_opening_occasion',
      eventDate: entry.estimatedOpening.exactDate,
      eventTitle: `${entry.businessName} Opening`,
    };
  }

  // Approximate grand opening (mid-October) — wait for specific date
  if (entry.grandOpening.label && !entry.grandOpening.exactDate) {
    return {
      shouldCreate: false,
      reason: 'grand_opening_approximate_needs_exact_date',
      eventDate: null,
      eventTitle: null,
    };
  }

  // Soft open without public event language — not a calendar event
  if (entry.status === 'soft_open' && !entry.grandOpening.exactDate) {
    return {
      shouldCreate: false,
      reason: 'soft_open_not_public_event',
      eventDate: null,
      eventTitle: null,
    };
  }

  // Plain projected business open dates are NOT calendar events
  return {
    shouldCreate: false,
    reason: 'projected_open_date_not_public_event',
    eventDate: null,
    eventTitle: null,
  };
}
