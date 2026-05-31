import type { SponsorPipelineStatus } from '../sponsor-pipeline/constants.js';
import { OPEN_PIPELINE_STATUSES } from '../sponsor-pipeline/constants.js';
import { PIPELINE_STATUS_LABELS } from '../sponsor-pipeline/constants.js';
import type { SponsorOpportunityWithContact } from '../sponsor-pipeline/opportunities.js';
import type { BensonForecast } from './types.js';

/** Baseline stage win rates before scaling to observed close rate. */
const STAGE_WIN_RATE: Record<SponsorPipelineStatus, number> = {
  lead: 0.08,
  contacted: 0.12,
  interested: 0.22,
  meeting_scheduled: 0.38,
  proposal_sent: 0.52,
  negotiating: 0.72,
  won: 1,
  lost: 0,
};

export function computeBensonForecast(input: {
  openOpportunities: SponsorOpportunityWithContact[];
  openPipelineValue: number;
  conversionRate: number;
  averageDealSize: number;
  wonThisMonthValue: number;
}): BensonForecast {
  const baselineConversion = 0.28;
  const observed = input.conversionRate > 0 ? input.conversionRate : baselineConversion;
  const scale = observed / baselineConversion;

  let weightedExpected = 0;
  for (const opp of input.openOpportunities) {
    if (!OPEN_PIPELINE_STATUSES.includes(opp.status)) continue;
    const value = opp.estimatedValue ?? input.averageDealSize;
    weightedExpected += value * STAGE_WIN_RATE[opp.status] * scale;
  }

  const pipelineBlend = input.openPipelineValue * observed;
  const expected = Math.round(
    weightedExpected > 0 ? weightedExpected * 0.55 + pipelineBlend * 0.45 : pipelineBlend,
  );

  const runRate = input.wonThisMonthValue * 3;
  const conservative = Math.round(Math.min(expected, runRate) * 0.65);
  const optimistic = Math.round(Math.max(expected, runRate) * 1.35);

  return {
    conservative,
    expected,
    optimistic,
    conversionRateUsed: Math.round(observed * 1000) / 1000,
    openPipelineValue: input.openPipelineValue,
    methodology: `Stage-weighted forecast scaled to ${Math.round(observed * 100)}% historical close rate (${PIPELINE_STATUS_LABELS.negotiating} deals weighted highest).`,
  };
}
