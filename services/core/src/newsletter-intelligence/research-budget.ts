import type { ExtractedNewsletterItem } from './types.js';
import { scoreOpportunityCandidate } from './opportunity-promote.js';
import type { VerificationStatus } from './types.js';

let dailyResearchCalls = 0;
let dailyResearchDay = new Date().toISOString().slice(0, 10);

function resetDailyIfNeeded(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyResearchDay) {
    dailyResearchDay = today;
    dailyResearchCalls = 0;
  }
}

export function getDailyResearchCallCount(): number {
  resetDailyIfNeeded();
  return dailyResearchCalls;
}

export function recordResearchCall(): void {
  resetDailyIfNeeded();
  dailyResearchCalls += 1;
}

export function resetResearchBudgetForTests(): void {
  dailyResearchCalls = 0;
  dailyResearchDay = new Date().toISOString().slice(0, 10);
}

const MAX_RESEARCH_PER_EMAIL = Number(process.env.NEWSLETTER_MAX_RESEARCH_PER_EMAIL ?? 1);
const MAX_RESEARCH_DAILY = Number(process.env.NEWSLETTER_MAX_RESEARCH_DAILY ?? 25);

export function shouldResearchNewsletterItem(input: {
  item: ExtractedNewsletterItem;
  perEmailResearchCalls: number;
  gateAccept: boolean;
  verificationStatus: VerificationStatus;
  locationOutcome?: string;
}): { allow: boolean; reason: string } {
  if (!input.gateAccept) {
    return { allow: false, reason: 'rejected_or_inventory_only' };
  }

  if (input.perEmailResearchCalls >= MAX_RESEARCH_PER_EMAIL) {
    return { allow: false, reason: 'per_email_limit' };
  }

  resetDailyIfNeeded();
  if (dailyResearchCalls >= MAX_RESEARCH_DAILY) {
    return { allow: false, reason: 'daily_limit' };
  }

  const missingFields = [
    !input.item.startDate ? 'date' : null,
    !input.item.startTime ? 'time' : null,
    !input.item.venue && !input.item.city ? 'location' : null,
  ].filter(Boolean);

  if (missingFields.length !== 1) {
    return { allow: false, reason: 'not_exactly_one_missing_field' };
  }

  const opportunity = scoreOpportunityCandidate({
    entityName: input.item.entityName,
    title: input.item.title,
    layer: input.item.layer,
    entityType: input.item.entityType,
    occurrenceType: input.item.occurrenceType,
    date: input.item.startDate,
    location: input.item.venue ?? input.item.city,
    locationOutcome: input.locationOutcome as never,
    description: input.item.description,
  });

  const strongValue = opportunity.score >= 0.55 || (input.item.isFree ?? false);
  if (!strongValue) {
    return { allow: false, reason: 'insufficient_tiktok_event_value' };
  }

  const calendarOk =
    input.item.layer === 'occurrence' &&
    Boolean(input.item.startDate) &&
    input.verificationStatus !== 'newsletter_only';
  if (calendarOk && input.verificationStatus.startsWith('official_')) {
    return { allow: false, reason: 'already_calendar_eligible' };
  }

  return { allow: true, reason: `missing_${missingFields[0]}_needs_confirmation` };
}
