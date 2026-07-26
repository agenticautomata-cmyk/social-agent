import type {
  CreatorValueAssessment,
  CuratorCreatorRecommendation,
  CuratorVerificationStatus,
  EventResearchResult,
  ParsedRoundupEvent,
} from './types.js';

export function assessCreatorValue(input: {
  event: ParsedRoundupEvent;
  research: EventResearchResult;
  verificationStatus: CuratorVerificationStatus;
}): CreatorValueAssessment {
  let score = 0.35;
  const factors: Record<string, number | string | boolean> = {};

  if (input.verificationStatus === 'VERIFIED') {
    score += 0.2;
    factors.verificationBoost = true;
  } else if (input.verificationStatus === 'PARTIALLY_VERIFIED') {
    score += 0.1;
  } else if (input.verificationStatus === 'EXPIRED' || input.verificationStatus === 'CONFLICTED') {
    return {
      recommendation: input.verificationStatus === 'EXPIRED' ? 'ignore' : 'track_only',
      score: 0.1,
      explanation: {
        reason: input.verificationStatus,
        factors,
      },
    };
  }

  const name = `${input.event.eventName} ${input.event.venue ?? ''}`.toLowerCase();
  if (/black|juneteenth|jazz|soul|heritage|culture|market|vendor|community/i.test(name)) {
    score += 0.12;
    factors.culturalRelevance = 'high';
  }
  if (/free|\$0|no cover|complimentary/i.test(`${input.event.price ?? ''} ${input.research.verifiedCost ?? ''}`)) {
    score += 0.08;
    factors.accessibility = 'free_or_low_cost';
  }
  if (/opening|grand opening|first annual|debut|launch/i.test(name)) {
    score += 0.1;
    factors.urgency = 'opening';
  }
  if (/food|restaurant|brunch|market|festival|art walk|live music/i.test(name)) {
    score += 0.08;
    factors.visualPotential = 'strong';
  }
  if (/weekend|saturday|sunday/i.test(`${input.event.dayHeading ?? ''} ${input.event.eventDate ?? ''}`)) {
    score += 0.05;
    factors.weekendFriendly = true;
  }

  score = Math.min(0.98, Math.max(0.05, score));

  let recommendation: CuratorCreatorRecommendation = 'track_only';
  if (score >= 0.78) recommendation = 'visit_in_person';
  else if (score >= 0.68) recommendation = 'green_screen_then_visit';
  else if (score >= 0.58) recommendation = 'weekend_roundup';
  else if (score >= 0.48) recommendation = 'green_screen_home';
  else if (score < 0.25) recommendation = 'ignore';

  factors.summary = buildExplanation(recommendation, input);

  return {
    recommendation,
    score,
    explanation: factors,
  };
}

function buildExplanation(
  rec: CuratorCreatorRecommendation,
  input: { event: ParsedRoundupEvent; research: EventResearchResult },
): string {
  const parts = [`${input.event.eventName}`];
  if (input.event.neighborhood) parts.push(`in ${input.event.neighborhood}`);
  if (input.research.verifiedDate ?? input.event.eventDate) {
    parts.push(`on ${input.research.verifiedDate ?? input.event.eventDate}`);
  }
  switch (rec) {
    case 'visit_in_person':
      return `${parts.join(' ')} looks like a strong in-person KC discovery with good visual potential.`;
    case 'green_screen_then_visit':
      return `${parts.join(' ')} is worth a green-screen preview now with a possible visit if timing works.`;
    case 'weekend_roundup':
      return `${parts.join(' ')} fits a weekend roundup mention rather than a standalone date-night post.`;
    case 'green_screen_home':
      return `${parts.join(' ')} could work as a green-screen-from-home mention if verified details hold.`;
    case 'track_only':
      return `${parts.join(' ')} is worth tracking — verification or timing may improve later.`;
    default:
      return `${parts.join(' ')} is low priority for creator coverage right now.`;
  }
}

export function isCalendarEligible(input: {
  verificationStatus: CuratorVerificationStatus;
  eventDate: string | null;
}): boolean {
  if (!input.eventDate) return false;
  if (input.verificationStatus === 'EXPIRED' || input.verificationStatus === 'CONFLICTED') return false;
  const d = new Date(input.eventDate);
  return d >= new Date(new Date().toDateString());
}

export function isRoundupEligible(recommendation: CuratorCreatorRecommendation): boolean {
  return recommendation === 'weekend_roundup' || recommendation === 'green_screen_home';
}
