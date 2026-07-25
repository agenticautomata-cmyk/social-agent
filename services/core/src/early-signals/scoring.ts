import type {
  ConfidenceLevel,
  ContentRecommendation,
  ContentRecommendationKind,
  NormalizedAdapterResult,
  ScoreExplanationLine,
  UrgencyLevel,
} from './types.js';

const FIRST_PARTY_CATEGORIES = new Set([
  'official_website',
  'venue_calendar',
  'business_website',
  'shopping_center',
  'chamber',
  'reservation_page',
]);

export function scoreConfidence(input: {
  results: NormalizedAdapterResult[];
  evidenceCount: number;
  firstParty: boolean;
}): {
  level: ConfidenceLevel;
  score: number;
  explanation: ScoreExplanationLine[];
} {
  const explanation: ScoreExplanationLine[] = [];
  let score = 0;

  if (input.firstParty) {
    score += 35;
    explanation.push({
      factor: 'first_party_source',
      points: 35,
      detail: 'Change detected on an official first-party page',
    });
  }

  const keywordWeight = input.results.reduce(
    (sum, r) => sum + r.matchedKeywords.length * 8,
    0,
  );
  if (keywordWeight > 0) {
    const pts = Math.min(25, keywordWeight);
    score += pts;
    explanation.push({
      factor: 'keyword_strength',
      points: pts,
      detail: `Matched ${input.results.flatMap((r) => r.matchedKeywords).join(', ')}`,
    });
  }

  if (input.evidenceCount >= 2) {
    score += 20;
    explanation.push({
      factor: 'multiple_evidence',
      points: 20,
      detail: `${input.evidenceCount} independent evidence rows support this signal`,
    });
  } else if (input.evidenceCount === 1 && input.firstParty) {
    score += 12;
    explanation.push({
      factor: 'single_strong_source',
      points: 12,
      detail: 'One strong first-party source',
    });
  }

  const reliabilityBonus = Math.min(
    15,
    input.results.reduce((sum, r) => sum + r.reliabilityInputs.length * 3, 0),
  );
  if (reliabilityBonus > 0) {
    score += reliabilityBonus;
    explanation.push({
      factor: 'source_reliability',
      points: reliabilityBonus,
      detail: input.results.flatMap((r) => r.reliabilityInputs).slice(0, 3).join('; '),
    });
  }

  score = Math.min(100, score);
  let level: ConfidenceLevel = 'low';
  if (score >= 75 && input.firstParty && input.evidenceCount >= 1) level = 'confirmed';
  else if (score >= 55) level = 'high';
  else if (score >= 30) level = 'medium';

  return { level, score, explanation };
}

export function scoreUrgency(input: {
  signalType: string;
  eventDate: Date | null;
  confidenceLevel: ConfidenceLevel;
  matchedKeywords: string[];
}): { level: UrgencyLevel; score: number; explanation: ScoreExplanationLine[] } {
  const explanation: ScoreExplanationLine[] = [];
  let score = 0;
  const now = Date.now();

  if (input.eventDate) {
    const daysOut = (input.eventDate.getTime() - now) / (86400000);
    if (daysOut <= 3) {
      score += 45;
      explanation.push({
        factor: 'event_within_72h',
        points: 45,
        detail: 'Event or opening date is within 72 hours',
      });
    } else if (daysOut <= 14) {
      score += 30;
      explanation.push({
        factor: 'event_within_2w',
        points: 30,
        detail: 'Event or opening is within two weeks',
      });
    } else if (daysOut <= 56) {
      score += 18;
      explanation.push({
        factor: 'event_within_8w',
        points: 18,
        detail: 'Likely action window in 1–8 weeks',
      });
    } else {
      score += 8;
      explanation.push({
        factor: 'planning_horizon',
        points: 8,
        detail: 'Date is months out — planning lead',
      });
    }
  }

  if (/closing|final (days|weekend)/i.test(input.matchedKeywords.join(' '))) {
    score += 25;
    explanation.push({
      factor: 'closing_language',
      points: 25,
      detail: 'Closing or final-days language detected',
    });
  }

  if (input.confidenceLevel === 'confirmed' || input.confidenceLevel === 'high') {
    score += 15;
    explanation.push({
      factor: 'confidence_boost',
      points: 15,
      detail: `Confidence is ${input.confidenceLevel}`,
    });
  }

  score = Math.min(100, score);
  let level: UrgencyLevel = 'weak_signal';
  if (score >= 60) level = 'breaking';
  else if (score >= 40) level = 'early_opportunity';
  else if (score >= 25 && input.confidenceLevel === 'confirmed') level = 'roundup_ready';
  else if (score >= 15) level = 'planning_lead';

  return { level, score, explanation };
}

export function isFirstPartyCategory(category: string): boolean {
  return FIRST_PARTY_CATEGORIES.has(category);
}

export function buildContentRecommendation(input: {
  signalType: string;
  confidenceLevel: ConfidenceLevel;
  urgencyLevel: UrgencyLevel;
  title: string;
  confirmedFacts: string[];
  needsVerification: string[];
  sourceName: string | null;
}): ContentRecommendation {
  let kind: ContentRecommendationKind = 'wait_and_verify';
  if (input.confidenceLevel === 'confirmed' && /opening|closing|ownership|renovation/i.test(input.signalType)) {
    kind = 'green_screen_update';
  } else if (input.urgencyLevel === 'roundup_ready') {
    kind = 'kc_weekend_5';
  } else if (/event|ticket|reservation/i.test(input.signalType) && input.confidenceLevel !== 'low') {
    kind = 'before_you_go_kc';
  } else if (input.urgencyLevel === 'early_opportunity' && input.confidenceLevel === 'medium') {
    kind = 'outreach_first';
  } else if (input.urgencyLevel === 'breaking' && input.confidenceLevel !== 'low') {
    kind = 'field_visit';
  }

  const hook =
    kind === 'green_screen_update'
      ? `${input.title} — what changed in KC`
      : kind === 'kc_weekend_5'
        ? `Weekend pick: ${input.title}`
        : `${input.title} — early lead`;

  return {
    kind,
    suggestedHook: hook,
    confirmedFacts: input.confirmedFacts,
    needsVerification: input.needsVerification,
    suggestedTiming:
      input.urgencyLevel === 'breaking'
        ? 'Act within 72 hours'
        : input.urgencyLevel === 'early_opportunity'
          ? 'Plan within 1–2 weeks'
          : 'Monitor and verify before filming',
    sourceAttribution: input.sourceName ?? 'Early signal source',
    callToAction:
      kind === 'outreach_first'
        ? 'Reach out for preview access before posting'
        : kind === 'wait_and_verify'
          ? 'Save and request more research'
          : 'Review sources and decide whether to film or post',
    discloseNotVisited: kind !== 'field_visit',
    recommendedAction:
      kind === 'green_screen_update'
        ? 'Post a green-screen update'
        : kind === 'kc_weekend_5'
          ? 'Add to KC Weekend 5'
          : kind === 'before_you_go_kc'
            ? 'Add to Before You Go KC'
            : kind === 'outreach_first'
              ? 'Contact the business first'
              : kind === 'field_visit'
                ? 'Plan a field visit'
                : 'Wait and verify',
  };
}
